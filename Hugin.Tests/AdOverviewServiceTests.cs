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

    [Test]
    public async Task Sorts_by_deadline_ascending_with_null_expires_last()
    {
        var now = new DateTimeOffset(2026, 8, 19, 8, 0, 0, TimeSpan.Zero);
        var ads = AdsWith(
            MakeAd("late", expires: now.AddDays(10)),
            MakeAd("none"),
            MakeAd("soon", expires: now.AddDays(3)));
        var sut = new AdOverviewService(ads, new FakePipelineRepository(), new FakeClock(now));

        var result = await sut.GetAsync();

        Assert.That(result.Select(a => a.FeedId), Is.EqualTo(new[] { "soon", "late", "none" }));
        Assert.That(result[0].DaysLeft, Is.EqualTo(3));
        Assert.That(result[2].DaysLeft, Is.Null);
    }

    [Test]
    public async Task Joins_pipeline_status_by_employer_orgnr()
    {
        var now = DateTimeOffset.UtcNow;
        var ads = AdsWith(MakeAd("a", orgnr: "999888777"), MakeAd("b", orgnr: "111222333"));
        var pipeline = PipelineWith(new PipelineEntry
            { Orgnr = "999888777", Status = PipelineStatus.Funnet, Created = now, Updated = now });
        var sut = new AdOverviewService(ads, pipeline, new FakeClock(now));

        var result = await sut.GetAsync();

        Assert.That(result.Single(a => a.FeedId == "a").PipelineStatus, Is.EqualTo(PipelineStatus.Funnet));
        Assert.That(result.Single(a => a.FeedId == "b").PipelineStatus, Is.Null);
    }

    [Test]
    public async Task Deadline_today_is_zero_days_left()
    {
        var now = new DateTimeOffset(2026, 8, 19, 8, 0, 0, TimeSpan.Zero);
        var ads = AdsWith(MakeAd("today", expires: new DateTimeOffset(2026, 8, 19, 23, 59, 0, TimeSpan.Zero)));
        var sut = new AdOverviewService(ads, new FakePipelineRepository(), new FakeClock(now));

        Assert.That((await sut.GetAsync())[0].DaysLeft, Is.Zero);
    }
}
