using Hugin.Core.Models;
using Hugin.Core.Services;

namespace Hugin.Tests;

[TestFixture]
public sealed class AdOverviewServiceTests
{
    private static Ad MakeAd(string id, string? orgnr = null, DateTimeOffset? expires = null, bool hidden = false) =>
        new() { FeedId = id, Title = "Utvikler", EmployerName = "Firma", EmployerOrgnr = orgnr,
                Expires = expires, IsActive = true, Hidden = hidden };

    // FakeAdRepository/FakePipelineRepository only expose a parameterless ctor + Store
    // collection to populate, unlike the brief's illustrative params ctors — these helpers
    // bridge that gap while keeping every assertion below identical to the brief.
    private static FakeAdRepository AdsWith(params Ad[] ads)
    {
        var repo = new FakeAdRepository();
        foreach (var ad in ads) repo.Store[ad.FeedId] = ad;
        return repo;
    }

    private static FakePipelineRepository PipelineWith(params PipelineEntry[] entries)
    {
        var repo = new FakePipelineRepository();
        repo.Store.AddRange(entries);
        return repo;
    }

    private static FakeCompanyRepository CompaniesWith(params Company[] companies)
    {
        var repo = new FakeCompanyRepository();
        foreach (var c in companies) repo.Store[c.Orgnr] = c;
        return repo;
    }

    private static Company MakeCompany(string orgnr, string? parentOrgnr = null) =>
        new() { Orgnr = orgnr, Name = orgnr, ParentOrgnr = parentOrgnr };

    private static PipelineEntry MakeEntry(string orgnr, PipelineStatus status, DateTimeOffset now) =>
        new() { Orgnr = orgnr, Status = status, Created = now, Updated = now };

    [Test]
    public async Task Sorts_by_deadline_ascending_with_null_expires_last()
    {
        var now = new DateTimeOffset(2026, 8, 19, 8, 0, 0, TimeSpan.Zero);
        var ads = AdsWith(
            MakeAd("late", expires: now.AddDays(10)),
            MakeAd("none"),
            MakeAd("soon", expires: now.AddDays(3)));
        var sut = new AdOverviewService(ads, new FakePipelineRepository(), new FakeClock(now), new FakeCompanyRepository());

        var result = await sut.GetAsync();

        Assert.That(result.Select(a => a.FeedId), Is.EqualTo(new[] { "soon", "late", "none" }));
        Assert.That(result[0].DaysLeft, Is.EqualTo(3));
        Assert.That(result[2].DaysLeft, Is.Null);
    }

    [Test]
    public async Task Leaves_out_an_ad_whose_deadline_has_passed()
    {
        var now = new DateTimeOffset(2026, 8, 19, 8, 0, 0, TimeSpan.Zero);
        var ads = AdsWith(
            MakeAd("gone", expires: now.AddDays(-1)),
            MakeAd("open", expires: now.AddDays(1)));
        var sut = new AdOverviewService(ads, new FakePipelineRepository(), new FakeClock(now), new FakeCompanyRepository());

        var result = await sut.GetAsync();

        Assert.That(result.Select(a => a.FeedId), Is.EqualTo(new[] { "open" }));
    }

    private static Ad ExpiredAd(string id, string orgnr, DateTimeOffset now) =>
        MakeAd(id, orgnr: orgnr, expires: now.AddDays(-1));

    [Test]
    public async Task Pipeline_overview_marks_an_entry_whose_ads_have_all_expired()
    {
        var now = DateTimeOffset.UtcNow;
        var ads = AdsWith(ExpiredAd("a", "1", now), ExpiredAd("b", "1", now));
        var pipeline = PipelineWith(MakeEntry("1", PipelineStatus.Active, now));
        var sut = new AdOverviewService(ads, pipeline, new FakeClock(now), new FakeCompanyRepository());

        var result = await sut.GetPipelineOverviewAsync();

        Assert.That(result.Single().AdsExpired, Is.True);
    }

    [Test]
    public async Task Pipeline_overview_keeps_an_entry_with_one_open_ad_among_expired_ones()
    {
        var now = DateTimeOffset.UtcNow;
        var ads = AdsWith(ExpiredAd("a", "1", now), MakeAd("b", orgnr: "1", expires: now.AddDays(3)));
        var pipeline = PipelineWith(MakeEntry("1", PipelineStatus.Active, now));
        var sut = new AdOverviewService(ads, pipeline, new FakeClock(now), new FakeCompanyRepository());

        Assert.That((await sut.GetPipelineOverviewAsync()).Single().AdsExpired, Is.False);
    }

    [Test]
    public async Task Pipeline_overview_never_marks_an_entry_that_has_no_ads()
    {
        var now = DateTimeOffset.UtcNow;
        var pipeline = PipelineWith(MakeEntry("1", PipelineStatus.Active, now));
        var sut = new AdOverviewService(AdsWith(), pipeline, new FakeClock(now), new FakeCompanyRepository());

        Assert.That((await sut.GetPipelineOverviewAsync()).Single().AdsExpired, Is.False);
    }

    [Test]
    public async Task Pipeline_overview_treats_a_feed_closed_ad_as_expired()
    {
        var now = DateTimeOffset.UtcNow;
        var closed = MakeAd("a", orgnr: "1", expires: now.AddDays(3));
        closed.IsActive = false;
        var pipeline = PipelineWith(MakeEntry("1", PipelineStatus.Active, now));
        var sut = new AdOverviewService(AdsWith(closed), pipeline, new FakeClock(now), new FakeCompanyRepository());

        Assert.That((await sut.GetPipelineOverviewAsync()).Single().AdsExpired, Is.True);
    }

    [Test]
    public async Task Pipeline_overview_links_ads_through_the_root_chain_like_the_badges_do()
    {
        // NT case inverted: entry tracked under the child, the ad carries the parent orgnr.
        var now = DateTimeOffset.UtcNow;
        var ads = AdsWith(ExpiredAd("a", "972483672", now));
        var pipeline = PipelineWith(MakeEntry("925836613", PipelineStatus.Active, now));
        var companies = CompaniesWith(MakeCompany("925836613", parentOrgnr: "972483672"));
        var sut = new AdOverviewService(ads, pipeline, new FakeClock(now), companies);

        Assert.That((await sut.GetPipelineOverviewAsync()).Single().AdsExpired, Is.True);
    }

    [Test]
    public async Task Pipeline_overview_returns_every_entry_with_its_status_untouched()
    {
        var now = DateTimeOffset.UtcNow;
        var pipeline = PipelineWith(MakeEntry("1", PipelineStatus.Active, now), MakeEntry("2", PipelineStatus.Applied, now));
        var sut = new AdOverviewService(AdsWith(ExpiredAd("a", "2", now)), pipeline, new FakeClock(now), new FakeCompanyRepository());

        var result = await sut.GetPipelineOverviewAsync();

        Assert.That(result.Select(r => (r.Entry.Orgnr, r.Entry.Status, r.AdsExpired)), Is.EquivalentTo(new[]
        {
            ("1", PipelineStatus.Active, false),
            ("2", PipelineStatus.Applied, true),
        }));
    }

    [Test]
    public async Task Joins_pipeline_status_by_employer_orgnr()
    {
        var now = DateTimeOffset.UtcNow;
        var ads = AdsWith(MakeAd("a", orgnr: "999888777"), MakeAd("b", orgnr: "111222333"));
        var pipeline = PipelineWith(new PipelineEntry
            { Orgnr = "999888777", Status = PipelineStatus.Active, Created = now, Updated = now });
        var sut = new AdOverviewService(ads, pipeline, new FakeClock(now), new FakeCompanyRepository());

        var result = await sut.GetAsync();

        Assert.That(result.Single(a => a.FeedId == "a").PipelineStatus, Is.EqualTo(PipelineStatus.Active));
        Assert.That(result.Single(a => a.FeedId == "b").PipelineStatus, Is.Null);
    }

    [Test]
    public async Task Deadline_today_is_zero_days_left()
    {
        var now = new DateTimeOffset(2026, 8, 19, 8, 0, 0, TimeSpan.Zero);
        var ads = AdsWith(MakeAd("today", expires: new DateTimeOffset(2026, 8, 19, 23, 59, 0, TimeSpan.Zero)));
        var sut = new AdOverviewService(ads, new FakePipelineRepository(), new FakeClock(now), new FakeCompanyRepository());

        Assert.That((await sut.GetAsync())[0].DaysLeft, Is.Zero);
    }

    [Test]
    public async Task Root_match_NT_case_ad_reports_untracked_parent_of_tracked_child()
    {
        // Real case: tracked orgnr 925836613 has ParentOrgnr 972483672, but 972483672
        // itself has no company row (it's an ultimate registry unit brreg doesn't expose here).
        // NAV's ad carries the parent orgnr; the pipeline entry is stored under the tracked child.
        var now = DateTimeOffset.UtcNow;
        var ads = AdsWith(MakeAd("a", orgnr: "972483672"));
        var pipeline = PipelineWith(MakeEntry("925836613", PipelineStatus.Active, now));
        var companies = CompaniesWith(MakeCompany("925836613", parentOrgnr: "972483672"));
        var sut = new AdOverviewService(ads, pipeline, new FakeClock(now), companies);

        var result = await sut.GetAsync();

        Assert.That(result.Single(a => a.FeedId == "a").PipelineStatus, Is.EqualTo(PipelineStatus.Active));
    }

    [Test]
    public async Task Root_match_ad_reports_a_child_whose_chain_leads_to_the_tracked_orgnr()
    {
        var now = DateTimeOffset.UtcNow;
        var ads = AdsWith(MakeAd("a", orgnr: "111111111")); // child, reports up to tracked orgnr
        var pipeline = PipelineWith(MakeEntry("999999999", PipelineStatus.Applied, now)); // tracked = root
        var companies = CompaniesWith(MakeCompany("111111111", parentOrgnr: "999999999"));
        var sut = new AdOverviewService(ads, pipeline, new FakeClock(now), companies);

        var result = await sut.GetAsync();

        Assert.That(result.Single(a => a.FeedId == "a").PipelineStatus, Is.EqualTo(PipelineStatus.Applied));
    }

    [Test]
    public async Task Unrelated_orgnrs_do_not_match()
    {
        var now = DateTimeOffset.UtcNow;
        var ads = AdsWith(MakeAd("a", orgnr: "555555555"));
        var pipeline = PipelineWith(MakeEntry("999999999", PipelineStatus.Active, now));
        var companies = CompaniesWith(
            MakeCompany("555555555", parentOrgnr: "666666666"),
            MakeCompany("999999999", parentOrgnr: "888888888"));
        var sut = new AdOverviewService(ads, pipeline, new FakeClock(now), companies);

        var result = await sut.GetAsync();

        Assert.That(result.Single(a => a.FeedId == "a").PipelineStatus, Is.Null);
    }

    [Test]
    public async Task Exact_match_preferred_over_root_match_when_both_exist()
    {
        var now = DateTimeOffset.UtcNow;
        // Ad's own orgnr has a pipeline entry directly (exact match, Svar) — but its root
        // (via ParentOrgnr) also happens to carry a pipeline entry (Funnet). Exact wins.
        var ads = AdsWith(MakeAd("a", orgnr: "111111111"));
        var pipeline = PipelineWith(
            MakeEntry("111111111", PipelineStatus.Answered, now),
            MakeEntry("999999999", PipelineStatus.Active, now));
        var companies = CompaniesWith(MakeCompany("111111111", parentOrgnr: "999999999"));
        var sut = new AdOverviewService(ads, pipeline, new FakeClock(now), companies);

        var result = await sut.GetAsync();

        Assert.That(result.Single(a => a.FeedId == "a").PipelineStatus, Is.EqualTo(PipelineStatus.Answered));
    }
}
