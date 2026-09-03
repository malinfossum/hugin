using System.Net;
using System.Text.Json;
using Hugin.Core.Abstractions;
using Hugin.Core.Models;
using Hugin.Core.Services;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;

namespace Hugin.Infrastructure.Http;

/// <summary>
/// Enhetsregisteret over HTTP. Open data, no auth.
///
/// Field map (verified against captured fixtures 2026-08-18):
///   list payload   → _embedded.enheter[] / _embedded.underenheter[], paging at page.totalPages
///   orgnr          → organisasjonsnummer
///   name           → navn
///   nace           → naeringskode1.kode
///   municipality   → forretningsadresse.kommunenummer (enheter)
///                    beliggenhetsadresse.kommunenummer (underenheter)
///   parent         → overordnetEnhet (underenheter only)
///   website        → hjemmeside (often absent)
///
/// Querying /enheter alone misses branch offices entirely: the regional consultancy
/// offices are underenheter of Oslo-registered parents and never match a kommunenummer
/// filter on hovedenheter. Both paths are always walked.
/// </summary>
public sealed class BrregClient(HttpClient http, ILogger<BrregClient>? logger = null,
    int paginationWindow = 10_000, IClock? clock = null) : IBrregClient
{
    public const string BaseAddress = "https://data.brreg.no/enhetsregisteret/api/";

    // Brreg serves at most the first 10 000 hits of any query (page 50 at size 200 is a 400).
    // A chunk that reports more is re-run bisected by registration date until every slice fits;
    // the register predates 1995, so the open range starts safely before it.
    private const int MaxBisectionDepth = 12;
    private static readonly DateOnly RegisterEpoch = new(1900, 1, 1);

    private readonly ILogger<BrregClient> _logger = logger ?? NullLogger<BrregClient>.Instance;
    private readonly IClock _clock = clock ?? new SystemClock();

    // Brreg's registration dates are Norwegian calendar days, so the open upper bound of a
    // bisected range is "today in Norway" — not the UTC date, which lags it by up to two hours
    // and would leave a unit registered late in the evening outside every slice.
    private static readonly TimeZoneInfo Norway = FindNorway();

    private DateOnly Today() => DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(_clock.UtcNow, Norway).DateTime);

    private static TimeZoneInfo FindNorway()
    {
        foreach (var id in new[] { "Europe/Oslo", "W. Europe Standard Time" })
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById(id);
            }
            catch (TimeZoneNotFoundException)
            {
            }
            catch (InvalidTimeZoneException)
            {
            }
        }
        return TimeZoneInfo.Local;
    }

    public async Task<IReadOnlyList<RegisterCompany>> GetCompaniesAsync(IEnumerable<string> naceCodes,
        IEnumerable<string> municipalityNumbers, CancellationToken ct = default)
    {
        var nace = naceCodes.ToArray();
        var municipalities = municipalityNumbers.ToArray();

        var companies = new List<RegisterCompany>();
        await WalkAsync("enheter", "enheter", nace, municipalities, isBranch: false, from: null, to: null, depth: 0, companies, ct);
        await WalkAsync("underenheter", "underenheter", nace, municipalities, isBranch: true, from: null, to: null, depth: 0, companies, ct);
        return companies;
    }

    public async Task<RegisterCompany?> GetByOrgnrAsync(string orgnr, CancellationToken ct = default)
    {
        // The NACE filter governs discovery, never tracking — a company fetched by orgnr is
        // stored whatever its industry code (Norsk Tipping is 92, Statens vegvesen 84).
        return await FetchOneAsync($"enheter/{orgnr}", isBranch: false, ct)
            ?? await FetchOneAsync($"underenheter/{orgnr}", isBranch: true, ct);
    }

    public async Task<IReadOnlyList<Kommune>> GetKommunerAsync(CancellationToken ct = default)
    {
        using var response = await http.GetAsync("kommuner?size=400", ct);
        response.EnsureSuccessStatusCode();

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
        var root = doc.RootElement;

        var results = new List<Kommune>();
        if (!root.TryGetProperty("_embedded", out var embedded) || !embedded.TryGetProperty("kommuner", out var items))
            return results;

        foreach (var item in items.EnumerateArray())
        {
            if (String(item, "nummer") is not { } number || String(item, "navn") is not { } name) continue;
            results.Add(new Kommune { Number = number, Name = KommuneNameNormalizer.Normalize(name) });
        }

        return results;
    }

    private async Task<RegisterCompany?> FetchOneAsync(string path, bool isBranch, CancellationToken ct)
    {
        using var response = await http.GetAsync(path, ct);
        if (response.StatusCode == HttpStatusCode.NotFound) return null;
        response.EnsureSuccessStatusCode();

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
        return Map(doc.RootElement, isBranch);
    }

    /// <summary>
    /// Walks every page of one query. If page 0 reports totalElements at or above the window,
    /// the query is split into two inclusive date halves ([lo, mid] and [mid+1, hi]) and each
    /// half walked recursively instead — the halves partition the range, so their union is
    /// exactly the unsplit set. A slice that still overflows at the depth cap (or is a single
    /// day) is walked as far as the window allows and logged, naming the slice.
    /// </summary>
    private async Task WalkAsync(string basePath, string collection, string[] nace, string[] municipalities,
        bool isBranch, DateOnly? from, DateOnly? to, int depth, List<RegisterCompany> results, CancellationToken ct)
    {
        var page = 0;
        var totalPages = 1;
        var maxPages = Math.Max(1, paginationWindow / BrregQuery.PageSize);

        while (page < totalPages && page < maxPages)
        {
            var url = BrregQuery.Build(basePath, nace, municipalities, page, from, to);
            using var response = await http.GetAsync(url, ct);
            response.EnsureSuccessStatusCode();

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
            var root = doc.RootElement;

            var totalElements = 0;
            if (root.TryGetProperty("page", out var paging))
            {
                if (paging.TryGetProperty("totalPages", out var total)) totalPages = total.GetInt32();
                if (paging.TryGetProperty("totalElements", out var elements)) totalElements = elements.GetInt32();
            }

            if (page == 0 && totalElements >= paginationWindow)
            {
                var lo = from ?? RegisterEpoch;
                var hi = to ?? Today();
                if (depth < MaxBisectionDepth && lo < hi)
                {
                    var mid = lo.AddDays((hi.DayNumber - lo.DayNumber) / 2); // lo <= mid < hi
                    await WalkAsync(basePath, collection, nace, municipalities, isBranch, lo, mid, depth + 1, results, ct);
                    await WalkAsync(basePath, collection, nace, municipalities, isBranch, mid.AddDays(1), hi, depth + 1, results, ct);
                    return;
                }

                _logger.LogWarning(
                    "Brreg: {Path} for kommune {Kommuner} registrert {From}–{To} gir {Total} treff — over grensen på {Window}; bare de første hentes. Del opp dekningen (færre kommuner per fylke).",
                    basePath, string.Join(',', municipalities), lo, hi, totalElements, paginationWindow);
            }

            if (!root.TryGetProperty("_embedded", out var embedded)
                || !embedded.TryGetProperty(collection, out var items))
                break;   // an empty page ends the walk regardless of what totalPages claimed

            var before = results.Count;
            foreach (var item in items.EnumerateArray())
                results.Add(Map(item, isBranch));

            if (results.Count == before) break;
            page++;
        }
    }

    private static RegisterCompany Map(JsonElement e, bool isBranch) =>
        new(
            Orgnr: e.GetProperty("organisasjonsnummer").GetString()!,
            Name: Sanitizer.Clean(String(e, "navn")),
            MunicipalityNumber: Municipality(e, isBranch),
            NaceCode: e.TryGetProperty("naeringskode1", out var nace) ? String(nace, "kode") : null,
            ParentOrgnr: String(e, "overordnetEnhet"),
            IsBranch: isBranch,
            Website: UrlGuard.Website(String(e, "hjemmeside")));

    private static string? Municipality(JsonElement e, bool isBranch)
    {
        // Underenheter carry beliggenhetsadresse; hovedenheter carry forretningsadresse.
        // Try the expected one first, then the other, so an unusual record still maps.
        string[] order = isBranch
            ? ["beliggenhetsadresse", "forretningsadresse"]
            : ["forretningsadresse", "beliggenhetsadresse"];

        foreach (var addressField in order)
            if (e.TryGetProperty(addressField, out var address) && String(address, "kommunenummer") is { } kommune)
                return kommune;

        return null;
    }

    private static string? String(JsonElement e, string name) =>
        e.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
}
