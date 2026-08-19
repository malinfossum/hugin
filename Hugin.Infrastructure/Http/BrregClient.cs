using System.Net;
using System.Text.Json;
using Hugin.Core.Abstractions;
using Hugin.Core.Services;

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
public sealed class BrregClient(HttpClient http) : IBrregClient
{
    public const string BaseAddress = "https://data.brreg.no/enhetsregisteret/api/";

    public async Task<IReadOnlyList<RegisterCompany>> GetCompaniesAsync(IEnumerable<string> naceCodes,
        IEnumerable<string> municipalityNumbers, CancellationToken ct = default)
    {
        var nace = naceCodes.ToArray();
        var municipalities = municipalityNumbers.ToArray();

        var companies = new List<RegisterCompany>();
        companies.AddRange(await WalkAsync("enheter", "enheter", nace, municipalities, isBranch: false, ct));
        companies.AddRange(await WalkAsync("underenheter", "underenheter", nace, municipalities, isBranch: true, ct));
        return companies;
    }

    public async Task<RegisterCompany?> GetByOrgnrAsync(string orgnr, CancellationToken ct = default)
    {
        // The NACE filter governs discovery, never tracking — a company fetched by orgnr is
        // stored whatever its industry code (Norsk Tipping is 92, Statens vegvesen 84).
        return await FetchOneAsync($"enheter/{orgnr}", isBranch: false, ct)
            ?? await FetchOneAsync($"underenheter/{orgnr}", isBranch: true, ct);
    }

    private async Task<RegisterCompany?> FetchOneAsync(string path, bool isBranch, CancellationToken ct)
    {
        using var response = await http.GetAsync(path, ct);
        if (response.StatusCode == HttpStatusCode.NotFound) return null;
        response.EnsureSuccessStatusCode();

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
        return Map(doc.RootElement, isBranch);
    }

    private async Task<List<RegisterCompany>> WalkAsync(string basePath, string collection,
        string[] nace, string[] municipalities, bool isBranch, CancellationToken ct)
    {
        var results = new List<RegisterCompany>();
        var page = 0;
        var totalPages = 1;

        while (page < totalPages)
        {
            var url = BrregQuery.Build(basePath, nace, municipalities, page);
            using var response = await http.GetAsync(url, ct);
            response.EnsureSuccessStatusCode();

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
            var root = doc.RootElement;

            if (root.TryGetProperty("page", out var paging) && paging.TryGetProperty("totalPages", out var total))
                totalPages = total.GetInt32();

            if (!root.TryGetProperty("_embedded", out var embedded)
                || !embedded.TryGetProperty(collection, out var items))
                break;   // an empty page ends the walk regardless of what totalPages claimed

            var before = results.Count;
            foreach (var item in items.EnumerateArray())
                results.Add(Map(item, isBranch));

            if (results.Count == before) break;
            page++;
        }

        return results;
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
