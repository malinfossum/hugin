using Hugin.Infrastructure.Data;
using Hugin.Core.Abstractions;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Hugin.Tests;

public class RepositoryTests
{
    private SqliteConnection _conn = null!;
    private HuginDbContext _db = null!;
    private static readonly DateTimeOffset T1 = new(2026, 8, 18, 8, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset T2 = new(2026, 8, 19, 8, 0, 0, TimeSpan.Zero);

    [SetUp]
    public void SetUp()
    {
        _conn = new SqliteConnection("DataSource=:memory:");
        _conn.Open();
        _db = new HuginDbContext(new DbContextOptionsBuilder<HuginDbContext>().UseSqlite(_conn).Options);
        _db.Database.EnsureCreated();
    }

    [TearDown]
    public void TearDown()
    {
        _db.Dispose();
        _conn.Dispose();
    }

    private static RegisterCompany Norkart(string orgnr = "934161181") =>
        new(orgnr, "Norkart AS avd Lillehammer", "3405", "62.100", "934161000", true, null);

    private static FeedAd SomeFeedAd(string id) =>
        new(id, "Utvikler", "Firma AS", "999888777", "3407",
            Published: DateTimeOffset.UtcNow, Expires: DateTimeOffset.UtcNow.AddDays(14),
            SourceUrl: "https://arbeidsplassen.nav.no/x", IsActive: true, Category: "IT / Utvikling");

    [Test]
    public async Task Upsert_sets_FirstSeen_once_and_LastSeen_always()
    {
        var repo = new EfCompanyRepository(_db);
        await repo.UpsertAsync(Norkart(), T1);
        await repo.UpsertAsync(Norkart(), T2);
        var c = await repo.GetAsync("934161181");
        Assert.That(c!.FirstSeen, Is.EqualTo(T1));
        Assert.That(c.LastSeenInRegister, Is.EqualTo(T2));
    }

    [Test]
    public async Task GetFirstSeenAfter_filters()
    {
        var repo = new EfCompanyRepository(_db);
        await repo.UpsertAsync(Norkart("1"), T1);
        await repo.UpsertAsync(Norkart("2"), T2);
        var fresh = await repo.GetFirstSeenAfterAsync(T1);
        Assert.That(fresh.Select(c => c.Orgnr), Is.EqualTo(new[] { "2" }));
    }

    [Test]
    public async Task DeactivateExpired_flips_only_past_expiry()
    {
        var repo = new EfAdRepository(_db);
        await repo.UpsertAsync(new FeedAd("a", "Utvikler", null, null, "3405", T1, T1.AddDays(2), null, true), T1);
        await repo.UpsertAsync(new FeedAd("b", "Utvikler", null, null, "3405", T1, T1.AddDays(30), null, true), T1);
        var n = await repo.DeactivateExpiredAsync(T1.AddDays(10));
        Assert.That(n, Is.EqualTo(1));
    }

    [Test]
    public async Task Category_survives_insert_and_update()
    {
        var repo = new EfAdRepository(_db);
        await repo.UpsertAsync(new FeedAd("a", "Utvikler", null, null, "3403", T1, null, null, true, "IT / Utvikling"), T1);
        await repo.UpsertAsync(new FeedAd("a", "Utvikler", null, null, "3403", T1, null, null, true, "IT / Drift"), T2);

        var stored = (await repo.GetActiveAsync()).Single();
        Assert.That(stored.Category, Is.EqualTo("IT / Drift"));
    }

    [Test]
    public async Task GetActive_filters_on_flag_and_municipality()
    {
        var repo = new EfAdRepository(_db);
        await repo.UpsertAsync(new FeedAd("aktiv-hamar", "Utvikler", null, null, "3403", T1, null, null, true), T1);
        await repo.UpsertAsync(new FeedAd("aktiv-gjovik", "Utvikler", null, null, "3407", T1, null, null, true), T1);
        await repo.UpsertAsync(new FeedAd("borte", "Utvikler", null, null, "3403", T1, null, null, false), T1);

        var all = await repo.GetActiveAsync(null);
        Assert.That(all.Select(a => a.FeedId), Is.EquivalentTo(new[] { "aktiv-hamar", "aktiv-gjovik" }));

        var hamar = await repo.GetActiveAsync("3403");
        Assert.That(hamar.Select(a => a.FeedId), Is.EqualTo(new[] { "aktiv-hamar" }));
    }

    [Test]
    public async Task ReviewMark_roundtrip_null_until_set()
    {
        var repo = new EfReviewMarkRepository(_db);
        Assert.That(await repo.GetAsync(), Is.Null);
        await repo.SetAsync(T1);
        Assert.That(await repo.GetAsync(), Is.EqualTo(T1));
    }

    [Test]
    public async Task DeactivateExpired_compares_instants_not_local_clocks()
    {
        var repo = new EfAdRepository(_db);

        // Expired 31 minutes ago in UTC terms, but its local wall-clock (23:59 at +02:00)
        // is ahead of now's (22:30 at +00:00). A converter that orders by local ticks
        // would call this ad still active for another two hours.
        var expires = new DateTimeOffset(2026, 8, 18, 23, 59, 0, TimeSpan.FromHours(2));
        var now = new DateTimeOffset(2026, 8, 18, 22, 30, 0, TimeSpan.Zero);
        await repo.UpsertAsync(new FeedAd("x", "Utvikler", null, null, "3405", null, expires, null, true), T1);

        Assert.That(await repo.DeactivateExpiredAsync(now), Is.EqualTo(1));
    }

    [Test]
    public async Task Pipeline_upsert_persists_a_changed_route()
    {
        var repo = new EfPipelineRepository(_db);
        await repo.UpsertAsync(new()
        {
            Orgnr = "1",
            Status = Core.Models.PipelineStatus.SoektSelv,
            Route = Core.Models.OutreachRoute.SoektSelv,
            Created = T1,
            Updated = T1,
        });
        await repo.UpsertAsync(new()
        {
            Orgnr = "1",
            Status = Core.Models.PipelineStatus.BedtGetSjekke,
            Route = Core.Models.OutreachRoute.BedtGetSjekke,
            Created = T1,
            Updated = T2,
        });

        var stored = await repo.GetByOrgnrAsync("1");
        Assert.That(stored!.Route, Is.EqualTo(Core.Models.OutreachRoute.BedtGetSjekke),
            "the stored row must follow the route change, not just the returned entry");
    }

    [Test]
    public async Task Pipeline_upsert_is_one_entry_per_company()
    {
        var repo = new EfPipelineRepository(_db);
        await repo.UpsertAsync(new() { Orgnr = "1", Status = Core.Models.PipelineStatus.Funnet, Created = T1, Updated = T1 });
        await repo.UpsertAsync(new() { Orgnr = "1", Status = Core.Models.PipelineStatus.SoektSelv, Created = T1, Updated = T2 });
        var all = await repo.GetAllAsync();
        Assert.That(all, Has.Count.EqualTo(1));
        Assert.That(all[0].Status, Is.EqualTo(Core.Models.PipelineStatus.SoektSelv));
    }

    [Test]
    public async Task SetHiddenAsync_flags_ad_and_reports_unknown()
    {
        var repo = new EfAdRepository(_db);
        await repo.UpsertAsync(SomeFeedAd("ad-1"), T1);

        Assert.That(await repo.SetHiddenAsync("ad-1", true), Is.True);
        Assert.That((await _db.Ads.FindAsync("ad-1"))!.Hidden, Is.True);
        Assert.That(await repo.SetHiddenAsync("finnes-ikke", true), Is.False);
    }

    [Test]
    public async Task GetActiveAsync_excludes_hidden_unless_asked()
    {
        var repo = new EfAdRepository(_db);
        await repo.UpsertAsync(SomeFeedAd("ad-1"), T1);
        await repo.UpsertAsync(SomeFeedAd("ad-2"), T1);
        await repo.SetHiddenAsync("ad-2", true);

        Assert.That((await repo.GetActiveAsync()).Select(a => a.FeedId), Is.EquivalentTo(new[] { "ad-1" }));
        Assert.That((await repo.GetActiveAsync(includeHidden: true)).Count, Is.EqualTo(2));
    }

    [Test]
    public async Task GetByEmployerAsync_returns_expired_too_newest_first()
    {
        var repo = new EfAdRepository(_db);
        await repo.UpsertAsync(SomeFeedAd("old") with { EmployerOrgnr = "999888777",
            Published = T1.AddDays(-30), IsActive = false }, T1);
        await repo.UpsertAsync(SomeFeedAd("new") with { EmployerOrgnr = "999888777",
            Published = T1 }, T1);
        await repo.UpsertAsync(SomeFeedAd("other") with { EmployerOrgnr = "111" }, T1);

        var ads = await repo.GetByEmployerAsync("999888777");
        Assert.That(ads.Select(a => a.FeedId), Is.EqualTo(new[] { "new", "old" }));
    }

    [Test]
    public async Task Upsert_preserves_hidden_flag()
    {
        // The v1 upsert trap in reverse: Hidden is Hugin's own field — the feed knows nothing
        // about it, so the update path must never touch it or every daily sync would resurrect
        // everything dismissed.
        var repo = new EfAdRepository(_db);
        await repo.UpsertAsync(SomeFeedAd("ad-1"), T1);
        await repo.SetHiddenAsync("ad-1", true);

        await repo.UpsertAsync(SomeFeedAd("ad-1"), T2);

        Assert.That((await _db.Ads.FindAsync("ad-1"))!.Hidden, Is.True);
    }
}
