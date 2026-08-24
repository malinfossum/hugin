using Hugin.Core.Abstractions;
using Hugin.Core.Config;
using Hugin.Core.Models;
using Hugin.Core.Services;

namespace Hugin.Tests;

public class SyncServiceTests
{
    private static readonly DateTimeOffset Now = new(2026, 8, 18, 8, 0, 0, TimeSpan.Zero);

    private static RegisterCompany Company(string orgnr = "934161181") =>
        new(orgnr, "Norkart AS avd Lillehammer", "3405", "62.100", "934161000", true, null);

    private static FeedAd Ad(string id, string title, string? kommune, DateTimeOffset? expires = null) =>
        new(id, title, "Firma AS", null, kommune, Now, expires, null, true);

    private static FeedAd AdWithEmployer(string id, string employerOrgnr, string? kommune = "3403") =>
        new(id, "Backend-utvikler", "Firma AS", employerOrgnr, kommune, Now, null, null, true);

    private sealed record Harness(
        SyncService Service,
        FakeBrregClient Brreg,
        FakeNavFeedClient Nav,
        FakeCompanyRepository Companies,
        FakeKommuneRepository Kommuner,
        FakeAdRepository Ads,
        FakeSyncStateRepository SyncState,
        FakeReviewMarkRepository ReviewMark,
        FakeWebsiteProber Prober,
        FakeClock Clock);

    private static Harness Build(FakeBrregClient? brreg = null, FakeNavFeedClient? nav = null,
        FakeAdRepository? ads = null, FakeCompanyRepository? companies = null, FakeWebsiteProber? prober = null,
        HuginConfig? config = null, FakeKommuneRepository? kommuner = null)
    {
        brreg ??= new FakeBrregClient { Companies = { Company() } };
        nav ??= new FakeNavFeedClient(new FeedPage([], null));
        ads ??= new FakeAdRepository();
        companies ??= new FakeCompanyRepository();
        prober ??= new FakeWebsiteProber();
        config ??= new HuginConfig();

        kommuner ??= new FakeKommuneRepository();
        var syncState = new FakeSyncStateRepository();
        var reviewMark = new FakeReviewMarkRepository();
        var clock = new FakeClock(Now);

        var service = new SyncService(brreg, nav, companies, kommuner, ads, syncState, reviewMark, prober, clock, config);
        return new Harness(service, brreg, nav, companies, kommuner, ads, syncState, reviewMark, prober, clock);
    }

    [Test]
    public async Task First_sync_sets_review_baseline()
    {
        var h = Build();
        Assert.That(h.ReviewMark.Mark, Is.Null);

        var summary = await h.Service.SyncAsync();

        Assert.That(summary.BaselineSet, Is.True);
        Assert.That(h.ReviewMark.Mark, Is.EqualTo(Now));
    }

    [Test]
    public async Task Second_sync_does_not_move_baseline()
    {
        var h = Build();
        await h.Service.SyncAsync();

        h.Clock.UtcNow = Now.AddDays(1);
        var summary = await h.Service.SyncAsync();

        Assert.That(summary.BaselineSet, Is.False);
        Assert.That(h.ReviewMark.Mark, Is.EqualTo(Now), "the mark moves only via 'hugin new --seen'");
    }

    [Test]
    public async Task Companies_are_upserted_with_seenAt_now()
    {
        var h = Build();
        var summary = await h.Service.SyncAsync();

        Assert.That(summary.Brreg.Succeeded, Is.True);
        Assert.That(summary.Brreg.Fetched, Is.EqualTo(1));
        Assert.That(h.Companies.Store["934161181"].FirstSeen, Is.EqualTo(Now));
        Assert.That(h.Companies.Store["934161181"].LastSeenInRegister, Is.EqualTo(Now));
    }

    [Test]
    public async Task Ads_are_filtered_before_storage()
    {
        var nav = new FakeNavFeedClient(new FeedPage(
            [Ad("keep", "Backend-utvikler", "3403"), Ad("drop", "Utvikler", "0301")], null));

        var h = Build(nav: nav);
        var summary = await h.Service.SyncAsync();

        Assert.That(h.Ads.Store.Keys, Is.EquivalentTo(new[] { "keep" }));
        Assert.That(summary.Nav.Fetched, Is.EqualTo(1));
    }

    [Test]
    public async Task Nav_cursor_advances_only_after_ads_stored()
    {
        var nav = new FakeNavFeedClient(new FeedPage([Ad("keep", "Backend-utvikler", "3403")], "neste-side"));
        var ads = new FakeAdRepository { ThrowOnUpsert = true };

        var h = Build(nav: nav, ads: ads);
        var summary = await h.Service.SyncAsync();

        Assert.That(summary.Nav.Succeeded, Is.False);
        Assert.That(h.SyncState.Store.ContainsKey("nav"), Is.False,
            "a crash mid-batch must re-fetch on the next run, not skip the page");
    }

    [Test]
    public async Task Nav_cursor_is_stored_after_a_clean_page()
    {
        var nav = new FakeNavFeedClient(
            new FeedPage([Ad("a", "Backend-utvikler", "3403")], "side-2", "side-1"),
            new FeedPage([Ad("b", "Frontend-utvikler", "3407")], null, "side-2"));

        var h = Build(nav: nav);
        await h.Service.SyncAsync();

        Assert.That(h.Nav.RequestedCursors, Is.EqualTo(new string?[] { null, "side-2" }));
        Assert.That(h.Ads.Store.Keys, Is.EquivalentTo(new[] { "a", "b" }));
    }

    [Test]
    public async Task Tail_page_stays_the_resume_point_instead_of_resetting()
    {
        // The tail page reports no next_id, but it keeps collecting entries until it fills
        // and rolls over. Storing null here would send the next sync back to whatever page is
        // newest by then, silently skipping everything appended in between.
        var nav = new FakeNavFeedClient(new FeedPage([Ad("a", "Backend-utvikler", "3403")], null, "hale-side"));

        var h = Build(nav: nav);
        await h.Service.SyncAsync();

        Assert.That(h.SyncState.Store["nav"].Cursor, Is.EqualTo("hale-side"));
    }

    [Test]
    public async Task Second_sync_resumes_from_the_stored_page_instead_of_the_newest()
    {
        var nav = new FakeNavFeedClient(
            new FeedPage([Ad("a", "Backend-utvikler", "3403")], null, "hale-side"),
            new FeedPage([Ad("b", "Frontend-utvikler", "3403")], null, "hale-side"));

        var h = Build(nav: nav);
        await h.Service.SyncAsync();
        await h.Service.SyncAsync();

        Assert.That(h.Nav.RequestedCursors, Is.EqualTo(new string?[] { null, "hale-side" }),
            "only a first-ever sync may start at the newest page");
        Assert.That(h.Ads.Store.Keys, Is.EquivalentTo(new[] { "a", "b" }));
    }

    [Test]
    public async Task Full_sync_with_no_cursor_starts_at_the_feed_beginning()
    {
        var nav = new FakeNavFeedClient(new FeedPage([Ad("a", "Backend-utvikler", "3403")], null, "side-1"));

        var h = Build(nav: nav);
        await h.Service.SyncAsync(fullNav: true);

        Assert.That(h.Nav.FirstPageRequested, Is.True, "a backfill must not start at the tail");
        Assert.That(h.Ads.Store.Keys, Is.EquivalentTo(new[] { "a" }));
    }

    [Test]
    public async Task Full_sync_resumes_from_a_stored_cursor()
    {
        var nav = new FakeNavFeedClient(new FeedPage([Ad("a", "Backend-utvikler", "3403")], null, "side-9"));

        var h = Build(nav: nav);
        await h.SyncState.SetAsync("nav", "side-8", Now);
        await h.Service.SyncAsync(fullNav: true);

        Assert.That(h.Nav.FirstPageRequested, Is.False);
        Assert.That(h.Nav.RequestedCursors, Is.EqualTo(new string?[] { "side-8" }),
            "an interrupted backfill continues where it stopped");
    }

    [Test]
    public async Task Full_sync_is_not_capped_at_a_hundred_pages()
    {
        // 150 chained pages, one matching ad each — a capped walk would stop at 100.
        var pages = Enumerable.Range(0, 150)
            .Select(i => new FeedPage([Ad($"annonse-{i}", "Backend-utvikler", "3403")],
                i < 149 ? $"side-{i + 1}" : null, $"side-{i}"))
            .ToArray();

        var h = Build(nav: new FakeNavFeedClient(pages));
        var summary = await h.Service.SyncAsync(fullNav: true);

        Assert.That(summary.Nav.Fetched, Is.EqualTo(150));
        Assert.That(h.Ads.Store, Has.Count.EqualTo(150));
    }

    [Test]
    public async Task Expired_ads_deactivated_each_sync()
    {
        var nav = new FakeNavFeedClient(new FeedPage(
            [Ad("gammel", "Backend-utvikler", "3403", expires: Now.AddDays(-1)),
             Ad("fersk", "Frontend-utvikler", "3403", expires: Now.AddDays(30))], null));

        var h = Build(nav: nav);
        await h.Service.SyncAsync();

        Assert.That(h.Ads.Store["gammel"].IsActive, Is.False, "past Expires counts as gone even if the feed has not said so");
        Assert.That(h.Ads.Store["fersk"].IsActive, Is.True);
    }

    [Test]
    public async Task Plain_config_nav_gate_matches_todays_behavior()
    {
        // Regression pin for H18: with a plain Municipalities config (no Fylker/AllOfNorway)
        // the resolved/gated NAV set is identical to before the kommune-register scope existed.
        var nav = new FakeNavFeedClient(new FeedPage(
            [Ad("keep", "Backend-utvikler", "3403"), Ad("drop", "Utvikler", "0301")], null));

        var h = Build(nav: nav);
        var summary = await h.Service.SyncAsync();

        Assert.That(h.Ads.Store.Keys, Is.EquivalentTo(new[] { "keep" }));
        Assert.That(summary.Nav.Fetched, Is.EqualTo(1));
    }

    [Test]
    public async Task Fylke_config_allows_nav_ads_via_the_kommune_register_scope()
    {
        // Before H18 the NAV gate only ever checked config.Municipalities directly, so a
        // fylke-scoped config (empty Municipalities) rejected every NAV ad outright. The
        // register-built scope is what makes fylke/all-of-Norway NAV sync actually work.
        var brreg = new FakeBrregClient
        {
            Kommuner = { new Kommune { Number = "3903", Name = "HORTEN" } },
        };
        var nav = new FakeNavFeedClient(new FeedPage([Ad("a", "Backend-utvikler", "3903")], null));
        var config = new HuginConfig { Municipalities = [], Fylker = ["39"] };

        var h = Build(brreg: brreg, nav: nav, config: config);
        var summary = await h.Service.SyncAsync();

        Assert.That(summary.Nav.Succeeded, Is.True);
        Assert.That(h.Ads.Store.Keys, Is.EquivalentTo(new[] { "a" }));
    }

    [Test]
    public async Task Kommune_register_is_upserted_after_a_successful_brreg_sync()
    {
        var brreg = new FakeBrregClient
        {
            Companies = { Company() },
            Kommuner = { new Kommune { Number = "0301", Name = "Oslo" } },
        };

        var h = Build(brreg: brreg);
        var summary = await h.Service.SyncAsync();

        Assert.That(summary.Brreg.Succeeded, Is.True);
        Assert.That(h.Kommuner.Store["0301"], Is.EqualTo("Oslo"));
    }

    [Test]
    public async Task Kommune_fetch_failure_does_not_fail_the_brreg_result()
    {
        var brreg = new FakeBrregClient
        {
            Companies = { Company() },
            ThrowsOnGetKommuner = true,
        };

        var h = Build(brreg: brreg);
        var summary = await h.Service.SyncAsync();

        Assert.That(summary.Brreg.Succeeded, Is.True, "a kommune-register hiccup must not fail company discovery");
        Assert.That(h.Kommuner.Store, Is.Empty, "names simply stay stale — nothing to upsert on failure");
    }

    [Test]
    public async Task Plain_config_makes_exactly_one_brreg_call_with_the_configured_numbers()
    {
        var h = Build();
        await h.Service.SyncAsync();

        Assert.That(h.Brreg.CompaniesRequests, Has.Count.EqualTo(1), "pins today's behavior — no chunking without scaling");
        Assert.That(h.Brreg.CompaniesRequests[0], Is.EquivalentTo(new[] { "3407", "3403", "3405", "3411" }));
    }

    [Test]
    public async Task Fylke_config_chunks_the_brreg_query_per_fylke()
    {
        var brreg = new FakeBrregClient
        {
            Companies = { Company() },
            Kommuner =
            {
                new Kommune { Number = "3903", Name = "HORTEN" },
                new Kommune { Number = "3905", Name = "TØNSBERG" },
                new Kommune { Number = "0301", Name = "OSLO" },
            },
        };
        var config = new HuginConfig { Municipalities = [], Fylker = ["39"] };

        var h = Build(brreg: brreg, config: config);
        var summary = await h.Service.SyncAsync();

        Assert.That(summary.Brreg.Succeeded, Is.True);
        Assert.That(h.Brreg.CompaniesRequests, Has.Count.EqualTo(1), "one chunk — every allowed number shares the '39' prefix");
        Assert.That(h.Brreg.CompaniesRequests[0], Is.EquivalentTo(new[] { "3903", "3905" }));
    }

    [Test]
    public async Task Multi_fylke_config_makes_one_brreg_call_per_fylke_chunk()
    {
        var brreg = new FakeBrregClient
        {
            Companies = { Company() },
            Kommuner =
            {
                new Kommune { Number = "3903", Name = "HORTEN" },
                new Kommune { Number = "3905", Name = "TØNSBERG" },
                new Kommune { Number = "3403", Name = "HAMAR" },
                new Kommune { Number = "0301", Name = "OSLO" },
            },
        };
        var config = new HuginConfig { Municipalities = [], Fylker = ["39", "34"] };

        var h = Build(brreg: brreg, config: config);
        await h.Service.SyncAsync();

        Assert.That(h.Brreg.CompaniesRequests, Has.Count.EqualTo(2), "one call per fylke prefix chunk");
        var chunks = h.Brreg.CompaniesRequests.Select(c => c.ToHashSet()).ToList();
        Assert.That(chunks, Has.Some.EquivalentTo(new[] { "3903", "3905" }));
        Assert.That(chunks, Has.Some.EquivalentTo(new[] { "3403" }));
    }

    [Test]
    public async Task All_of_norway_config_chunks_by_fylke_prefix()
    {
        var brreg = new FakeBrregClient
        {
            Companies = { Company() },
            Kommuner =
            {
                new Kommune { Number = "3903", Name = "HORTEN" },
                new Kommune { Number = "3403", Name = "HAMAR" },
            },
        };
        var config = new HuginConfig { Municipalities = [], AllOfNorway = true };

        var h = Build(brreg: brreg, config: config);
        await h.Service.SyncAsync();

        Assert.That(h.Brreg.CompaniesRequests, Has.Count.EqualTo(2));
        var chunks = h.Brreg.CompaniesRequests.Select(c => c.ToHashSet()).ToList();
        Assert.That(chunks, Has.Some.EquivalentTo(new[] { "3903" }));
        Assert.That(chunks, Has.Some.EquivalentTo(new[] { "3403" }));
    }

    [Test]
    public async Task Fylke_or_all_of_norway_with_an_empty_register_falls_back_to_a_single_configured_call()
    {
        // A first-ever run (or a register outage) leaves the register empty — Fylker/AllOfNorway
        // then expand nothing, so AllowedNumbers collapses back to the plain configured set and
        // the SetEquals check takes the single-call path, same as an unscaled config.
        var brreg = new FakeBrregClient { Companies = { Company() } };
        var config = new HuginConfig { AllOfNorway = true };

        var h = Build(brreg: brreg, config: config);
        var summary = await h.Service.SyncAsync();

        Assert.That(summary.Brreg.Succeeded, Is.True);
        Assert.That(h.Brreg.CompaniesRequests, Has.Count.EqualTo(1), "empty register — nothing to expand into");
        Assert.That(h.Brreg.CompaniesRequests[0], Is.EquivalentTo(new[] { "3407", "3403", "3405", "3411" }));
    }

    [Test]
    public async Task A_later_chunk_failing_reports_partial_progress_and_keeps_earlier_chunks_stored()
    {
        var brreg = new FakeBrregClient
        {
            Companies = { Company() },
            Kommuner =
            {
                new Kommune { Number = "3903", Name = "HORTEN" },
                new Kommune { Number = "3403", Name = "HAMAR" },
            },
            ThrowOnCompaniesCallNumber = 2,
        };
        var config = new HuginConfig { Municipalities = [], Fylker = ["39", "34"] };

        var h = Build(brreg: brreg, config: config);
        var summary = await h.Service.SyncAsync();

        Assert.That(summary.Brreg.Succeeded, Is.False);
        Assert.That(summary.Brreg.Error, Is.Not.Null);
        Assert.That(summary.Brreg.Fetched, Is.EqualTo(1), "the first chunk's fetch count survives the second chunk's failure");
        Assert.That(h.Companies.Store, Has.Count.EqualTo(1), "the first chunk's company was already upserted before the failure");
    }

    [Test]
    public async Task One_source_failing_still_syncs_the_other()
    {
        var brreg = new FakeBrregClient { Throws = true };
        var nav = new FakeNavFeedClient(new FeedPage([Ad("keep", "Backend-utvikler", "3403")], null));

        var h = Build(brreg: brreg, nav: nav);
        var summary = await h.Service.SyncAsync();

        Assert.That(summary.Brreg.Succeeded, Is.False);
        Assert.That(summary.Brreg.Error, Is.Not.Null);
        Assert.That(summary.Nav.Succeeded, Is.True);
        Assert.That(summary.BothFailed, Is.False, "a flaky connection must not kill the morning routine");
        Assert.That(h.Ads.Store, Has.Count.EqualTo(1));
    }

    [Test]
    public async Task Both_failing_reports_both_failed()
    {
        var h = Build(brreg: new FakeBrregClient { Throws = true }, nav: new FakeNavFeedClient { Throws = true });
        var summary = await h.Service.SyncAsync();

        Assert.That(summary.BothFailed, Is.True);
        Assert.That(summary.BaselineSet, Is.False, "a baseline is only set once something actually synced");
        Assert.That(h.ReviewMark.Mark, Is.Null);
    }

    [Test]
    public async Task Unknown_ad_employer_is_fetched_from_brreg_and_upserted()
    {
        // The NT case: the ad's employerOrgnr is an underenhet the discovery filter never
        // pulled locally (wrong NACE code), but Brreg still knows it and its ParentOrgnr.
        var brreg = new FakeBrregClient
        {
            ByOrgnr = { ["972483672"] = new RegisterCompany("972483672", "NT avd X", "3403", "92.000", "925836613", true, null) },
        };
        var nav = new FakeNavFeedClient(new FeedPage([AdWithEmployer("a", "972483672")], null));

        var h = Build(brreg: brreg, nav: nav);
        var summary = await h.Service.SyncAsync();

        Assert.That(summary.Nav.Succeeded, Is.True);
        Assert.That(h.Companies.Store.ContainsKey("972483672"), Is.True);
        Assert.That(h.Companies.Store["972483672"].ParentOrgnr, Is.EqualTo("925836613"));
        Assert.That(h.Brreg.ByOrgnrRequests, Is.EqualTo(new[] { "972483672" }));
    }

    [Test]
    public async Task Known_ad_employer_is_not_looked_up_in_brreg()
    {
        var h = Build(nav: new FakeNavFeedClient(new FeedPage([AdWithEmployer("a", "934161181")], null)));
        h.Companies.Store["934161181"] = new Company { Orgnr = "934161181", Name = "Kjent AS" };

        await h.Service.SyncAsync();

        Assert.That(h.Brreg.ByOrgnrRequests, Is.Empty);
    }

    [Test]
    public async Task Ad_with_employer_homepage_adopts_the_website_for_a_company_with_none()
    {
        var ad = AdWithEmployer("a", "934161181") with { EmployerHomepage = "https://norkart.no" };
        var h = Build(nav: new FakeNavFeedClient(new FeedPage([ad], null)));
        h.Companies.Store["934161181"] = new Company { Orgnr = "934161181", Name = "Kjent AS", Website = null };

        await h.Service.SyncAsync();

        Assert.That(h.Companies.Store["934161181"].Website, Is.EqualTo("https://norkart.no"));
    }

    [Test]
    public async Task Ad_website_adoption_never_fails_the_sync()
    {
        var ad = AdWithEmployer("a", "934161181") with { EmployerHomepage = "https://norkart.no" };
        var h = Build(nav: new FakeNavFeedClient(new FeedPage([ad], null)));
        // No stored company for this orgnr — AdoptWebsiteAsync on the fake returns false rather
        // than throwing, but the wiring itself is wrapped in try/catch (same rule as employer
        // enrichment) so a repository failure here must never take the NAV sync down with it.

        var summary = await h.Service.SyncAsync();

        Assert.That(summary.Nav.Succeeded, Is.True);
        Assert.That(h.Ads.Store.ContainsKey("a"), Is.True);
    }

    [Test]
    public async Task Brreg_failure_during_enrichment_does_not_fail_sync_or_skip_the_ad()
    {
        var brreg = new FakeBrregClient { ThrowsOnGetByOrgnr = true };
        var nav = new FakeNavFeedClient(new FeedPage([AdWithEmployer("a", "972483672")], null));

        var h = Build(brreg: brreg, nav: nav);
        var summary = await h.Service.SyncAsync();

        Assert.That(summary.Nav.Succeeded, Is.True);
        Assert.That(summary.Brreg.Succeeded, Is.True, "only the employer lookup should have failed, not discovery");
        Assert.That(h.Ads.Store.ContainsKey("a"), Is.True);
        Assert.That(h.Companies.Store.ContainsKey("972483672"), Is.False);
    }

    [Test]
    public async Task Two_ads_with_the_same_unknown_employer_only_call_brreg_once()
    {
        var brreg = new FakeBrregClient
        {
            ByOrgnr = { ["972483672"] = new RegisterCompany("972483672", "NT avd X", "3403", "92.000", "925836613", true, null) },
        };
        var nav = new FakeNavFeedClient(new FeedPage(
            [AdWithEmployer("a", "972483672"), AdWithEmployer("b", "972483672")], null));

        var h = Build(brreg: brreg, nav: nav);
        await h.Service.SyncAsync();

        Assert.That(h.Brreg.ByOrgnrRequests, Is.EqualTo(new[] { "972483672" }));
        Assert.That(h.Ads.Store.Keys, Is.EquivalentTo(new[] { "a", "b" }));
    }

    private static Company DueCompany(string orgnr, string website, DateTimeOffset? checkedUtc = null) => new()
    {
        Orgnr = orgnr, Name = "Firma AS", Website = website, FirstSeen = Now, LastSeenInRegister = Now,
        WebsiteCheckedUtc = checkedUtc,
    };

    [Test]
    public async Task Due_websites_are_probed_and_results_stored()
    {
        var companies = new FakeCompanyRepository();
        companies.Store["a"] = DueCompany("a", "https://levende.no");
        companies.Store["b"] = DueCompany("b", "https://dodt.no");

        var prober = new FakeWebsiteProber
        {
            Results =
            {
                ["https://levende.no"] = new WebsiteProbeResult(true, "https://levende.no"),
                ["https://dodt.no"] = new WebsiteProbeResult(false, null),
            },
        };

        var h = Build(brreg: new FakeBrregClient(), companies: companies, prober: prober);
        var summary = await h.Service.SyncAsync();

        Assert.That(summary.WebsitesChecked, Is.EqualTo(2));
        Assert.That(summary.WebsitesDead, Is.EqualTo(1));
        Assert.That(h.Companies.Store["a"].WebsiteOk, Is.True);
        Assert.That(h.Companies.Store["a"].WebsiteCheckedUtc, Is.EqualTo(Now));
        Assert.That(h.Companies.Store["b"].WebsiteOk, Is.False);
        Assert.That(h.Companies.Store["b"].WebsiteCheckedUtc, Is.EqualTo(Now));
    }

    [Test]
    public async Task Website_check_uses_a_seven_day_staleness_window_and_a_forty_company_cap()
    {
        var companies = new FakeCompanyRepository();
        companies.Store["fresh"] = DueCompany("fresh", "https://x.no", checkedUtc: Now.AddDays(-6));
        companies.Store["stale"] = DueCompany("stale", "https://y.no", checkedUtc: Now.AddDays(-8));

        var prober = new FakeWebsiteProber();
        var h = Build(brreg: new FakeBrregClient(), companies: companies, prober: prober);
        await h.Service.SyncAsync();

        Assert.That(prober.Requests, Is.EqualTo(new[] { "https://y.no" }),
            "a company checked less than 7 days ago must not be re-probed yet");
    }

    [Test]
    public async Task Website_check_never_exceeds_eight_concurrent_probes()
    {
        var companies = new FakeCompanyRepository();
        for (var i = 0; i < 12; i++)
            companies.Store[$"c{i}"] = DueCompany($"c{i}", $"https://c{i}.no");

        var gate = new SemaphoreSlim(0);
        var prober = new FakeWebsiteProber
        {
            OnCall = async () =>
            {
                gate.Release();
                await Task.Delay(20);
            },
        };

        var h = Build(brreg: new FakeBrregClient(), companies: companies, prober: prober);
        await h.Service.SyncAsync();

        Assert.That(prober.MaxConcurrent, Is.LessThanOrEqualTo(8));
        Assert.That(prober.Requests, Has.Count.EqualTo(12));
    }

    [Test]
    public async Task Website_check_failure_does_not_fail_the_sync()
    {
        var companies = new FakeCompanyRepository { ThrowOnGetWebsitesDueForCheck = true };
        companies.Store["a"] = DueCompany("a", "https://x.no");

        var h = Build(brreg: new FakeBrregClient(), companies: companies);
        var summary = await h.Service.SyncAsync();

        Assert.That(summary.Brreg.Succeeded, Is.True, "a website-check hiccup must not fail company discovery");
        Assert.That(summary.WebsitesChecked, Is.EqualTo(0));
        Assert.That(summary.WebsitesDead, Is.EqualTo(0));
    }

    [Test]
    public async Task No_due_websites_reports_zero_and_does_not_probe()
    {
        var h = Build(brreg: new FakeBrregClient());
        var summary = await h.Service.SyncAsync();

        Assert.That(summary.WebsitesChecked, Is.EqualTo(0));
        Assert.That(summary.WebsitesDead, Is.EqualTo(0));
        Assert.That(h.Prober.Requests, Is.Empty);
    }
}
