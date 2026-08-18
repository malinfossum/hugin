using System.Net;
using System.Text;
using Hugin.Console.Http;
using Hugin.Core.Config;

namespace Hugin.Tests;

public class NavFeedClientTests
{
    private const string NavBase = "https://pam-stilling-feed.nav.no/";

    private static readonly string TokenBody =
        "Current public token for Nav Job Vacancy Feed:\n" +
        "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.c2lnbmF0dXJl";

    private static HttpResponseMessage Text(string body) =>
        new(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8, "text/plain") };

    private static HttpResponseMessage Unauthorized() => new(HttpStatusCode.Unauthorized);

    /// <summary>Serves the feed page, the two entry details, and the public token.</summary>
    private static HttpResponseMessage ServeFeed(HttpRequestMessage request)
    {
        var url = request.RequestUri!.ToString();
        if (url.Contains("publicToken", StringComparison.Ordinal)) return Text(TokenBody);
        if (url.Contains("feedentry/1111", StringComparison.Ordinal))
            return HttpFixtures.Json(HttpFixtures.ReadFixture("nav-feedentry-active.json"));
        if (url.Contains("feedentry/2222", StringComparison.Ordinal))
            return HttpFixtures.Json(HttpFixtures.ReadFixture("nav-feedentry-inactive.json"));
        if (url.Contains("api/v1/feed", StringComparison.Ordinal))
            return HttpFixtures.Json(HttpFixtures.ReadFixture("nav-feed-page.json"));
        return HttpFixtures.NotFound();
    }

    private static NavFeedClient Client(Func<HttpRequestMessage, HttpResponseMessage> respond, string? configuredToken = null)
    {
        var http = HttpFixtures.Client(respond, NavBase);
        return new NavFeedClient(http, new NavTokenProvider(http, configuredToken), new HuginConfig());
    }

    [Test]
    public async Task Maps_fixture_page_to_feed_ads()
    {
        var page = await Client(ServeFeed).GetPageAsync(null);

        // Oslo (wrong municipality) and "Sykepleier natt" (no keyword) are filtered out.
        Assert.That(page.Ads.Select(a => a.FeedId), Is.EquivalentTo(new[]
        {
            "11111111-1111-1111-1111-111111111111",
            "22222222-2222-2222-2222-222222222222",
        }));

        var active = page.Ads.Single(a => a.FeedId.StartsWith("1111", StringComparison.Ordinal));
        Assert.That(active.Title, Is.EqualTo("Backend-utvikler til teamet"), "ANSI escape must be stripped at ingest");
        Assert.That(active.MunicipalityNumber, Is.EqualTo("3403"), "NAV gives a municipality name; the config maps it to a number");
        Assert.That(active.EmployerOrgnr, Is.EqualTo("931895923"));
        Assert.That(active.SourceUrl, Is.EqualTo("https://arbeidsplassen.nav.no/stillinger/stilling/11111111-1111-1111-1111-111111111111"));
        Assert.That(active.Expires, Is.Not.Null);
        Assert.That(active.IsActive, Is.True);
        Assert.That(active.Category, Is.EqualTo("IT / Utvikling"));

        var gone = page.Ads.Single(a => a.FeedId.StartsWith("2222", StringComparison.Ordinal));
        Assert.That(gone.IsActive, Is.False, "the feed reporting INACTIVE must flip the ad");

        Assert.That(page.Ads.All(a => a.SourceUrl is null
            || a.SourceUrl.StartsWith("http://", StringComparison.Ordinal)
            || a.SourceUrl.StartsWith("https://", StringComparison.Ordinal)), Is.True);
    }

    [Test]
    public async Task Keyword_hit_outside_configured_categories_is_dropped()
    {
        // "Prosjektutvikler massivtre" survives the keyword net ("utvikler"), but NAV files
        // it under Bygg og anlegg — the category gate is what keeps it out of the radar.
        const string page = """
            {"items":[{"_feed_entry":{"uuid":"66666666-6666-6666-6666-666666666666",
             "status":"ACTIVE","title":"Prosjektutvikler massivtre","businessName":"Moelven Limtre AS",
             "municipal":"RINGSAKER","sistEndret":"2026-08-18T09:00:00+02:00"}}],"next_id":null,"id":"side-y"}
            """;
        const string detail = """
            {"uuid":"66666666-6666-6666-6666-666666666666","status":"ACTIVE",
             "sistEndret":"2026-08-18T09:00:00+02:00",
             "ad_content":{"uuid":"66666666-6666-6666-6666-666666666666",
              "title":"Prosjektutvikler massivtre","link":"https://arbeidsplassen.nav.no/stillinger/stilling/6",
              "employer":{"name":"Moelven Limtre AS"},
              "workLocations":[{"municipal":"RINGSAKER"}],
              "occupationCategories":[{"level1":"Bygg og anlegg","level2":"Prosjektering"}]}}
            """;

        var result = await Client(request =>
        {
            var url = request.RequestUri!.ToString();
            if (url.Contains("publicToken", StringComparison.Ordinal)) return Text(TokenBody);
            if (url.Contains("feedentry/6666", StringComparison.Ordinal)) return HttpFixtures.Json(detail);
            return HttpFixtures.Json(page);
        }).GetPageAsync(null);

        Assert.That(result.Ads, Is.Empty);
    }

    [Test]
    public async Task Detail_status_wins_over_a_stale_active_summary()
    {
        // A backfill reads historical entries: the summary said ACTIVE when it was written,
        // but the ad may be gone by the time we enrich it — NAV then returns the stub with
        // its CURRENT status. That status is the truth about "now".
        const string page = """
            {"items":[{"_feed_entry":{"uuid":"55555555-5555-5555-5555-555555555555",
             "status":"ACTIVE","title":"Utvikler","businessName":"Borte AS","municipal":"HAMAR",
             "sistEndret":"2026-07-01T09:00:00+02:00"}}],"next_id":null,"id":"side-x"}
            """;
        const string stub = """
            {"uuid":"55555555-5555-5555-5555-555555555555",
             "sistEndret":"2026-08-10T09:00:00+02:00","status":"INACTIVE"}
            """;

        var result = await Client(request =>
        {
            var url = request.RequestUri!.ToString();
            if (url.Contains("publicToken", StringComparison.Ordinal)) return Text(TokenBody);
            if (url.Contains("feedentry/5555", StringComparison.Ordinal)) return HttpFixtures.Json(stub);
            return HttpFixtures.Json(page);
        }).GetPageAsync(null);

        Assert.That(result.Ads.Single().IsActive, Is.False,
            "an ad NAV has stripped is gone now, whatever the historical entry said");
    }

    [Test]
    public async Task Passes_cursor_and_returns_next_cursor()
    {
        var requested = new List<string>();
        var page = await Client(request =>
        {
            requested.Add(request.RequestUri!.ToString());
            return ServeFeed(request);
        }).GetPageAsync("1df27f1c-2a02-4077-9ef0-d5e45f4c77f1");

        Assert.That(requested.Any(u => u.EndsWith("api/v1/feed/1df27f1c-2a02-4077-9ef0-d5e45f4c77f1", StringComparison.Ordinal)),
            Is.True, "a stored cursor must be requested as a feed page id");
        Assert.That(page.NextCursor, Is.EqualTo("1df27f1c-2a02-4077-9ef0-d5e45f4c77f1"));
    }

    [Test]
    public async Task First_page_without_cursor_starts_at_the_newest_page()
    {
        var requested = new List<string>();
        await Client(request =>
        {
            requested.Add(request.RequestUri!.ToString());
            return ServeFeed(request);
        }).GetPageAsync(null);

        Assert.That(requested.Any(u => u.Contains("last=true", StringComparison.Ordinal)), Is.True,
            "a first sync must not walk the feed from 2019");
    }

    [Test]
    public async Task First_page_request_carries_no_cursor_and_no_last_flag()
    {
        var requested = new List<string>();
        await Client(request =>
        {
            requested.Add(request.RequestUri!.ToString());
            return ServeFeed(request);
        }).GetFirstPageAsync();

        var feedRequest = requested.First(u => u.Contains("api/v1/feed", StringComparison.Ordinal));
        Assert.That(feedRequest, Does.EndWith("api/v1/feed"),
            "the oldest page lives at the bare feed URL — no page id, no last=true");
    }

    [Test]
    public async Task On_401_refreshes_token_once_and_retries()
    {
        var feedCalls = 0;
        var tokenCalls = 0;

        var page = await Client(request =>
        {
            var url = request.RequestUri!.ToString();
            if (url.Contains("publicToken", StringComparison.Ordinal)) { tokenCalls++; return Text(TokenBody); }
            if (url.Contains("feedentry", StringComparison.Ordinal)) return ServeFeed(request);

            feedCalls++;
            return feedCalls == 1 ? Unauthorized() : ServeFeed(request);
        }).GetPageAsync(null);

        Assert.That(feedCalls, Is.EqualTo(2), "exactly one retry");
        Assert.That(tokenCalls, Is.EqualTo(2), "the token is refetched before the retry");
        Assert.That(page.Ads, Is.Not.Empty);
    }

    [Test]
    public void Second_401_throws_NavAuthException()
    {
        var client = Client(request =>
            request.RequestUri!.ToString().Contains("publicToken", StringComparison.Ordinal)
                ? Text(TokenBody)
                : Unauthorized());

        Assert.ThrowsAsync<NavAuthException>(async () => await client.GetPageAsync(null));
    }

    [Test]
    public async Task Token_provider_prefers_configured_token()
    {
        var tokenCalls = 0;
        var http = HttpFixtures.Client(request =>
        {
            if (request.RequestUri!.ToString().Contains("publicToken", StringComparison.Ordinal)) tokenCalls++;
            return Text(TokenBody);
        }, NavBase);

        var provider = new NavTokenProvider(http, "configured-token");

        Assert.That(await provider.GetTokenAsync(), Is.EqualTo("configured-token"));
        Assert.That(tokenCalls, Is.Zero, "a configured token must never hit the network");
    }

    [Test]
    public async Task Token_provider_extracts_jwt_from_the_message_body()
    {
        var http = HttpFixtures.Client(_ => Text(TokenBody), NavBase);
        var token = await new NavTokenProvider(http, null).GetTokenAsync();

        Assert.That(token, Is.EqualTo("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.c2lnbmF0dXJl"),
            "the endpoint returns a human-readable line plus the JWT, not a bare token");
    }
}
