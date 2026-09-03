using System.Globalization;
using Hugin.Infrastructure.Http;

namespace Hugin.Tests;

public class BrregClientTests
{
    [Test]
    public async Task Maps_enheter_and_underenheter_and_merges()
    {
        var client = new BrregClient(HttpFixtures.ClientServing(
            ("enheter?naeringskode=62", "brreg-enheter.json"),
            ("underenheter?naeringskode=62", "brreg-underenheter.json")));

        var result = await client.GetCompaniesAsync(["62"], ["3405", "3403"]);

        Assert.That(result, Is.Not.Empty);
        Assert.That(result.Any(c => c.IsBranch && c.ParentOrgnr != null), Is.True,
            "underenheter must arrive as branches with parent orgnr");
        Assert.That(result.All(c => c.Orgnr.Length == 9), Is.True);
        Assert.That(result.All(c => c.MunicipalityNumber is "3405" or "3403"), Is.True,
            "municipality is read from forretningsadresse (enheter) and beliggenhetsadresse (underenheter)");
        Assert.That(result.Any(c => !c.IsBranch), Is.True, "hovedenheter must survive the merge too");
    }

    [Test]
    public async Task GetByOrgnr_falls_back_to_underenheter_on_404()
    {
        const string branch = """
            {"organisasjonsnummer":"931895923","navn":"AGREED AS",
             "naeringskode1":{"kode":"62.200"},"overordnetEnhet":"931759515",
             "beliggenhetsadresse":{"kommunenummer":"3403"}}
            """;

        var client = new BrregClient(HttpFixtures.Client(request =>
            request.RequestUri!.ToString().Contains("underenheter/931895923", StringComparison.Ordinal)
                ? HttpFixtures.Json(branch)
                : HttpFixtures.NotFound()));

        var result = await client.GetByOrgnrAsync("931895923");

        Assert.That(result, Is.Not.Null);
        Assert.That(result!.IsBranch, Is.True);
        Assert.That(result.ParentOrgnr, Is.EqualTo("931759515"));
        Assert.That(result.MunicipalityNumber, Is.EqualTo("3403"));
    }

    [Test]
    public async Task Scheme_less_hjemmeside_becomes_a_usable_link()
    {
        // Brreg never stores a scheme, so guarding on http(s) alone dropped every website.
        const string enhet = """
            {"organisasjonsnummer":"923591435","navn":"APROXIMA AS",
             "naeringskode1":{"kode":"62.010"},"hjemmeside":"www.innit.no",
             "forretningsadresse":{"kommunenummer":"3403"}}
            """;

        var client = new BrregClient(HttpFixtures.Client(request =>
            request.RequestUri!.ToString().Contains("enheter/923591435", StringComparison.Ordinal)
                ? HttpFixtures.Json(enhet)
                : HttpFixtures.NotFound()));

        var result = await client.GetByOrgnrAsync("923591435");

        Assert.That(result!.Website, Is.EqualTo("https://www.innit.no"));
    }

    [Test]
    public async Task GetByOrgnr_returns_null_when_neither_register_has_it()
    {
        var client = new BrregClient(HttpFixtures.Client(_ => HttpFixtures.NotFound()));
        Assert.That(await client.GetByOrgnrAsync("000000000"), Is.Null);
    }

    [Test]
    public async Task GetKommuner_maps_and_normalizes_names()
    {
        const string body = """
            {"_embedded":{"kommuner":[
                {"nummer":"0301","navn":"OSLO"},
                {"nummer":"3453","navn":"VÅGÅ"},
                {"nummer":"3454","navn":"NORD-AURDAL"}
            ]}}
            """;

        var client = new BrregClient(HttpFixtures.Client(request =>
            request.RequestUri!.ToString().Contains("kommuner", StringComparison.Ordinal)
                ? HttpFixtures.Json(body)
                : HttpFixtures.NotFound()));

        var result = await client.GetKommunerAsync();

        Assert.That(result.Select(k => k.Number), Is.EquivalentTo(new[] { "0301", "3453", "3454" }));
        Assert.That(result.Single(k => k.Number == "0301").Name, Is.EqualTo("Oslo"));
        Assert.That(result.Single(k => k.Number == "3453").Name, Is.EqualTo("Vågå"));
        Assert.That(result.Single(k => k.Number == "3454").Name, Is.EqualTo("Nord-Aurdal"));
    }

    // Fake Brreg that filters a fixed unit set by the request's inclusive date bounds and reports
    // totalElements = matching count. `window` makes the client bisect long before 10k.
    private static (BrregClient Client, List<string> Requests) BisectingClient(
        IReadOnlyList<(string Orgnr, DateOnly Date)> units, int window, ListLogger<BrregClient>? logger = null,
        DateTimeOffset? now = null)
    {
        var requests = new List<string>();
        var http = HttpFixtures.Client(request =>
        {
            var url = request.RequestUri!.ToString();
            requests.Add(url);
            if (url.Contains("underenheter?", StringComparison.Ordinal))
                return HttpFixtures.Json("""{"_embedded":{"underenheter":[]},"page":{"size":200,"totalElements":0,"totalPages":0,"number":0}}""");
            if (!url.Contains("enheter?", StringComparison.Ordinal)) return HttpFixtures.NotFound();

            var (from, to) = DateRange(url);
            var hits = units.Where(u => (from is null || u.Date >= from) && (to is null || u.Date <= to)).ToList();
            var items = string.Join(',', hits.Select(u =>
                $$$"""{"organisasjonsnummer":"{{{u.Orgnr}}}","navn":"X","forretningsadresse":{"kommunenummer":"0301"}}"""));
            return HttpFixtures.Json(
                $$$"""{"_embedded":{"enheter":[{{{items}}}]},"page":{"size":200,"totalElements":{{{hits.Count}}},"totalPages":1,"number":0}}""");
        });
        var clock = new FakeClock(now ?? new DateTimeOffset(2026, 9, 3, 12, 0, 0, TimeSpan.Zero));
        return (new BrregClient(http, logger, paginationWindow: window, clock: clock), requests);
    }

    private static (DateOnly? From, DateOnly? To) DateRange(string url)
    {
        var query = new Uri(url).Query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries)
            .Select(p => p.Split('=', 2)).ToDictionary(p => p[0], p => p.Length > 1 ? p[1] : "");
        DateOnly? Parse(string key) => query.TryGetValue(key, out var v)
            ? DateOnly.ParseExact(v, "yyyy-MM-dd", CultureInfo.InvariantCulture) : null;
        return (Parse("fraRegistreringsdatoEnhetsregisteret"), Parse("tilRegistreringsdatoEnhetsregisteret"));
    }

    [Test]
    public async Task Over_window_query_is_bisected_by_date_and_the_slices_partition_the_unsplit_set()
    {
        var units = Enumerable.Range(0, 10)
            .Select(i => ($"90000000{i}", new DateOnly(2020, 1, 1).AddDays(i * 37))).ToList();
        var (client, requests) = BisectingClient(units, window: 4);

        var result = await client.GetCompaniesAsync(["62"], ["0301"]);

        Assert.That(result.Select(c => c.Orgnr), Is.EquivalentTo(units.Select(u => u.Item1)),
            "union of the bisected slices == the unsplit set, with no duplicates");
        Assert.That(requests.Count(r => r.Contains("enheter?", StringComparison.Ordinal) && !r.Contains("underenheter", StringComparison.Ordinal)),
            Is.GreaterThan(1), "the client actually split the query");
    }

    [Test]
    public async Task Under_window_query_is_never_split()
    {
        var units = new List<(string, DateOnly)> { ("900000001", new DateOnly(2020, 1, 1)), ("900000002", new DateOnly(2021, 1, 1)) };
        var (client, requests) = BisectingClient(units, window: 4);

        await client.GetCompaniesAsync(["62"], ["0301"]);

        Assert.That(requests.Any(r => r.Contains("Registreringsdato", StringComparison.Ordinal)), Is.False,
            "today's behavior is byte-identical below the window");
    }

    [Test]
    public async Task Slice_that_cannot_be_split_further_warns_and_returns_what_the_window_allows()
    {
        var sameDay = new DateOnly(2020, 5, 5);
        var units = new List<(string, DateOnly)> { ("900000001", sameDay), ("900000002", sameDay) };
        var logger = new ListLogger<BrregClient>();
        var (client, _) = BisectingClient(units, window: 1, logger);

        var result = await client.GetCompaniesAsync(["62"], ["0301"]);

        Assert.That(result.Select(c => c.Orgnr), Is.EquivalentTo(new[] { "900000001", "900000002" }),
            "the fake serves both on page 0; the client still returns them");
        Assert.That(logger.Warnings, Has.Count.EqualTo(1));
        Assert.That(logger.Warnings[0], Does.Contain("0301").And.Contain("over grensen"));
    }

    [Test]
    public async Task Upper_date_bound_is_the_norwegian_calendar_day_not_the_utc_one()
    {
        // 22:30 UTC on 3 September is already 4 September in Norway (CEST). A unit registered
        // on the 4th sits outside a UTC-dated upper bound and would be missed by every
        // bisected slice; Brreg's registration dates are Norwegian dates.
        var units = Enumerable.Range(0, 6)
            .Select(i => ($"90000000{i}", new DateOnly(2026, 9, 4).AddDays(-i * 200))).ToList();
        var lateEvening = new DateTimeOffset(2026, 9, 3, 22, 30, 0, TimeSpan.Zero);
        var (client, requests) = BisectingClient(units, window: 2, now: lateEvening);

        var result = await client.GetCompaniesAsync(["62"], ["0301"]);

        var upperBounds = requests.Select(DateRange).Select(r => r.To).Where(d => d is not null).ToList();
        Assert.That(upperBounds, Is.Not.Empty, "the query was bisected");
        Assert.That(upperBounds.Max(), Is.EqualTo(new DateOnly(2026, 9, 4)));
        Assert.That(result.Select(c => c.Orgnr), Does.Contain("900000000"), "the unit registered today is fetched");
    }
}
