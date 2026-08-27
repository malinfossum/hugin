using Hugin.Core.Abstractions;
using Hugin.Core.Models;
using Hugin.Core.Services;

namespace Hugin.Tests;

public class NewItemsServiceTests
{
    private static readonly DateTimeOffset Mark = new(2026, 8, 18, 8, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset Later = Mark.AddDays(1);

    private static RegisterCompany Company(string orgnr) =>
        new(orgnr, "Firma " + orgnr, "3405", "62.100", null, false, null);

    private static FeedAd Ad(string id) =>
        new(id, "Backend-utvikler", "Firma AS", null, "3403", null, null, null, true);

    [Test]
    public async Task Null_when_never_synced()
    {
        var service = new NewItemsService(new FakeCompanyRepository(), new FakeAdRepository(),
            new FakeSourceRepository(), new FakeReviewMarkRepository(), new FakeClock(Later));

        Assert.That(await service.GetNewAsync(), Is.Null);
    }

    [Test]
    public async Task Returns_only_items_first_seen_after_mark()
    {
        var companies = new FakeCompanyRepository();
        await companies.UpsertAsync(Company("gammel"), Mark);
        await companies.UpsertAsync(Company("ny"), Later);

        var ads = new FakeAdRepository();
        await ads.UpsertAsync(Ad("gammel-annonse"), Mark);
        await ads.UpsertAsync(Ad("ny-annonse"), Later);

        var service = new NewItemsService(companies, ads, new FakeSourceRepository(),
            new FakeReviewMarkRepository { Mark = Mark }, new FakeClock(Later));

        var result = await service.GetNewAsync();

        Assert.That(result, Is.Not.Null);
        Assert.That(result!.Since, Is.EqualTo(Mark));
        Assert.That(result.Companies.Select(c => c.Orgnr), Is.EquivalentTo(new[] { "ny" }));
        Assert.That(result.Ads.Select(a => a.FeedId), Is.EquivalentTo(new[] { "ny-annonse" }));
    }

    [Test]
    public async Task Returns_sources_from_the_repository_in_position_order()
    {
        var sources = new FakeSourceRepository();
        await sources.AddAsync("LinkedIn", "https://www.linkedin.com/jobs/", CancellationToken.None);
        await sources.AddAsync("FINN", "https://www.finn.no/job", CancellationToken.None);

        var service = new NewItemsService(new FakeCompanyRepository(), new FakeAdRepository(), sources,
            new FakeReviewMarkRepository { Mark = Mark }, new FakeClock(Later));

        var result = await service.GetNewAsync();

        Assert.That(result, Is.Not.Null);
        Assert.That(result!.Sources.Select(s => (s.Label, s.Url)), Is.EqualTo(new[]
        {
            ("LinkedIn", "https://www.linkedin.com/jobs/"),
            ("FINN", "https://www.finn.no/job"),
        }));
    }

    [Test]
    public async Task MarkSeen_advances_to_now()
    {
        var reviewMark = new FakeReviewMarkRepository { Mark = Mark };
        var service = new NewItemsService(new FakeCompanyRepository(), new FakeAdRepository(),
            new FakeSourceRepository(), reviewMark, new FakeClock(Later));

        await service.MarkSeenAsync();

        Assert.That(reviewMark.Mark, Is.EqualTo(Later));
    }
}
