using Hugin.Core.Abstractions;
using Hugin.Core.Config;
using Hugin.Core.Services;

namespace Hugin.Tests;

public class SyncServiceTests
{
    private static readonly DateTimeOffset Now = new(2026, 8, 18, 8, 0, 0, TimeSpan.Zero);

    private static RegisterCompany Company(string orgnr = "934161181") =>
        new(orgnr, "Norkart AS avd Lillehammer", "3405", "62.100", "934161000", true, null);

    private static FeedAd Ad(string id, string title, string? kommune, DateTimeOffset? expires = null) =>
        new(id, title, "Firma AS", null, kommune, Now, expires, null, true);

    private sealed record Harness(
        SyncService Service,
        FakeBrregClient Brreg,
        FakeNavFeedClient Nav,
        FakeCompanyRepository Companies,
        FakeAdRepository Ads,
        FakeSyncStateRepository SyncState,
        FakeReviewMarkRepository ReviewMark,
        FakeClock Clock);

    private static Harness Build(FakeBrregClient? brreg = null, FakeNavFeedClient? nav = null,
        FakeAdRepository? ads = null)
    {
        brreg ??= new FakeBrregClient { Companies = { Company() } };
        nav ??= new FakeNavFeedClient(new FeedPage([], null));
        ads ??= new FakeAdRepository();

        var companies = new FakeCompanyRepository();
        var syncState = new FakeSyncStateRepository();
        var reviewMark = new FakeReviewMarkRepository();
        var clock = new FakeClock(Now);

        var service = new SyncService(brreg, nav, companies, ads, syncState, reviewMark, clock, new HuginConfig());
        return new Harness(service, brreg, nav, companies, ads, syncState, reviewMark, clock);
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
            new FeedPage([Ad("a", "Backend-utvikler", "3403")], "side-2"),
            new FeedPage([Ad("b", "Frontend-utvikler", "3407")], null));

        var h = Build(nav: nav);
        await h.Service.SyncAsync();

        Assert.That(h.Nav.RequestedCursors, Is.EqualTo(new string?[] { null, "side-2" }));
        Assert.That(h.SyncState.Store["nav"].Cursor, Is.Null, "the tail page reports no next cursor");
        Assert.That(h.Ads.Store.Keys, Is.EquivalentTo(new[] { "a", "b" }));
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
}
