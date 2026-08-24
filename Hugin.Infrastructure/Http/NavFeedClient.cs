using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using Hugin.Core.Abstractions;
using Hugin.Core.Config;
using Hugin.Core.Services;

namespace Hugin.Infrastructure.Http;

/// <summary>
/// The NAV stillingsfeed (arbeidsplassen.no), a JSON Feed 1.0 stream behind a JWT bearer.
///
/// Field map — list shape captured live 2026-08-18, detail shape from the published
/// OpenAPI at /api/openapi.json (FeedEntryContent → ad_content: FeedAd):
///   page          → items[]._feed_entry, cursor at next_id (null at the tail), page id at id
///   summary       → uuid, status ("ACTIVE"/"INACTIVE"), title, businessName, municipal, sistEndret
///   detail        → GET api/v1/feedentry/{uuid} → { uuid, status, sistEndret, ad_content }
///   published     → ad_content.published          expires → ad_content.expires
///   employer      → ad_content.employer.name / .orgnr
///   deep-link     → ad_content.link (required by NAV terms), fallback ad_content.sourceurl
///   municipality  → ad_content.workLocations[].municipal
///
/// Two things the feed does NOT provide, and how they are handled:
///
/// 1. There is no kommunenummer anywhere — municipalities arrive as names ("HAMAR"). The
///    sync's <see cref="MunicipalityScope"/> resolves the name (config names first, then the
///    kommune register) and everything unresolved maps to null (and is then filtered out).
///
/// 2. A feed page carries summaries only, not ad bodies. Fetching every entry would mean
///    1000 requests per page, so the summary is filtered first (municipality + keyword) and
///    only survivors are enriched. Inactive ads return a stub with no ad_content — expected,
///    NAV strips content once an ad is gone — so the summary values stand and IsActive flips.
/// </summary>
public sealed class NavFeedClient(HttpClient http, NavTokenProvider tokens, HuginConfig config) : INavFeedClient
{
    public const string BaseAddress = "https://pam-stilling-feed.nav.no/";

    public Task<FeedPage> GetPageAsync(string? cursor, MunicipalityScope scope, CancellationToken ct = default) =>
        // No cursor means no sync has completed: start at the newest page rather than
        // walking the whole history uninvited. A deliberate backfill goes through
        // GetFirstPageAsync instead.
        FetchPageAsync(cursor is null ? "api/v1/feed?last=true" : $"api/v1/feed/{cursor}", scope, ct);

    public Task<FeedPage> GetFirstPageAsync(MunicipalityScope scope, CancellationToken ct = default) =>
        // The bare feed URL is the oldest page (mid-2023 as of writing).
        FetchPageAsync("api/v1/feed", scope, ct);

    private async Task<FeedPage> FetchPageAsync(string path, MunicipalityScope scope, CancellationToken ct)
    {

        using var response = await SendAuthorizedAsync(path, ct);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
        var root = doc.RootElement;

        var ads = new List<FeedAd>();

        if (root.TryGetProperty("items", out var items) && items.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in items.EnumerateArray())
            {
                if (!item.TryGetProperty("_feed_entry", out var summary)) continue;

                var ad = MapSummary(summary, scope);
                if (ad is null || !AdFilter.Matches(ad, config, scope)) continue;

                // Enrichment can also disqualify: NAV's occupation category separates real
                // developer roles from keyword coincidences like prosjektutvikler massivtre.
                if (await EnrichAsync(ad, scope, ct) is { } enriched)
                    ads.Add(enriched);
            }
        }

        return new FeedPage(ads, Text(root, "next_id"), Text(root, "id"));
    }

    private FeedAd? MapSummary(JsonElement summary, MunicipalityScope scope)
    {
        var uuid = Text(summary, "uuid");
        if (uuid is null) return null;

        return new FeedAd(
            FeedId: uuid,
            Title: Sanitizer.Clean(Text(summary, "title")),
            EmployerName: Sanitizer.Clean(Text(summary, "businessName")),
            EmployerOrgnr: null,
            MunicipalityNumber: ResolveMunicipality(Text(summary, "municipal"), scope),
            Published: null,
            Expires: null,
            SourceUrl: null,
            IsActive: string.Equals(Text(summary, "status"), "ACTIVE", StringComparison.OrdinalIgnoreCase));
    }

    private async Task<FeedAd?> EnrichAsync(FeedAd ad, MunicipalityScope scope, CancellationToken ct)
    {
        using var response = await SendAuthorizedAsync($"api/v1/feedentry/{ad.FeedId}", ct);
        if (response.StatusCode == HttpStatusCode.NotFound) return ad;

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
        var root = doc.RootElement;

        // The summary's status is historical — written when the feed entry was appended. The
        // detail response carries the ad's status NOW, and now is what IsActive means. During
        // a backfill this is the difference between 3 open ads and 11 phantom ones.
        var isActiveNow = Text(root, "status") is { } current
            ? string.Equals(current, "ACTIVE", StringComparison.OrdinalIgnoreCase)
            : ad.IsActive;
        ad = ad with { IsActive = isActiveNow };

        // Inactive ads come back as a stub with no ad_content; the summary is all there is.
        if (!root.TryGetProperty("ad_content", out var content) || content.ValueKind != JsonValueKind.Object)
            return ad;

        var employer = content.TryGetProperty("employer", out var e) && e.ValueKind == JsonValueKind.Object
            ? e
            : default;

        var categories = Categories(content);
        if (!AdFilter.MatchesCategory(categories.Select(c => c.Level1).Distinct().ToList(), config))
            return null;

        return ad with
        {
            Category = categories.Count == 0
                ? null
                : string.Join("; ", categories.Select(c => $"{c.Level1} / {c.Level2}").Distinct()),
            Title = Sanitizer.Clean(Text(content, "title") ?? ad.Title),
            EmployerName = employer.ValueKind == JsonValueKind.Object
                ? Sanitizer.Clean(Text(employer, "name") ?? ad.EmployerName)
                : ad.EmployerName,
            EmployerOrgnr = employer.ValueKind == JsonValueKind.Object ? Text(employer, "orgnr") : null,
            EmployerHomepage = employer.ValueKind == JsonValueKind.Object ? Text(employer, "homepage")?.Trim() : null,
            MunicipalityNumber = MunicipalityFromLocations(content, scope) ?? ad.MunicipalityNumber,
            Published = Timestamp(content, "published"),
            Expires = Timestamp(content, "expires"),
            // The arbeidsplassen deep-link is the one NAV terms require; sourceurl points
            // at the employer page and is only a fallback.
            SourceUrl = UrlGuard.HttpOrHttps(Text(content, "link")) ?? UrlGuard.HttpOrHttps(Text(content, "sourceurl")),
        };
    }

    private async Task<HttpResponseMessage> SendAuthorizedAsync(string path, CancellationToken ct)
    {
        var response = await SendOnceAsync(path, forceRefresh: false, ct);
        if (response.StatusCode != HttpStatusCode.Unauthorized) return response;

        // The public token rotates at irregular intervals — refetch once, then give up.
        response.Dispose();
        response = await SendOnceAsync(path, forceRefresh: true, ct);

        if (response.StatusCode == HttpStatusCode.Unauthorized)
        {
            response.Dispose();
            throw new NavAuthException(
                "NAV avviste tokenet to ganger — sjekk navToken i hugin.json, eller prøv igjen senere.");
        }

        return response;
    }

    private async Task<HttpResponseMessage> SendOnceAsync(string path, bool forceRefresh, CancellationToken ct)
    {
        var token = await tokens.GetTokenAsync(forceRefresh, ct);

        using var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        return await http.SendAsync(request, ct);
    }

    private static string? ResolveMunicipality(string? municipalName, MunicipalityScope scope) =>
        scope.ResolveName(municipalName);

    private static string? MunicipalityFromLocations(JsonElement content, MunicipalityScope scope)
    {
        if (!content.TryGetProperty("workLocations", out var locations) || locations.ValueKind != JsonValueKind.Array)
            return null;

        foreach (var location in locations.EnumerateArray())
            if (ResolveMunicipality(Text(location, "municipal"), scope) is { } number)
                return number;

        return null;
    }

    private static List<(string Level1, string Level2)> Categories(JsonElement content)
    {
        var categories = new List<(string, string)>();

        if (content.TryGetProperty("occupationCategories", out var list) && list.ValueKind == JsonValueKind.Array)
            foreach (var item in list.EnumerateArray())
                if (Text(item, "level1") is { } level1)
                    categories.Add((level1, Text(item, "level2") ?? ""));

        return categories;
    }

    private static DateTimeOffset? Timestamp(JsonElement e, string name) =>
        DateTimeOffset.TryParse(Text(e, name), CultureInfo.InvariantCulture,
            DateTimeStyles.RoundtripKind, out var parsed)
            ? parsed
            : null;

    private static string? Text(JsonElement e, string name) =>
        e.ValueKind == JsonValueKind.Object
        && e.TryGetProperty(name, out var value)
        && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;
}
