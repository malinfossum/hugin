using Hugin.Console.Data;
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
    public async Task ReviewMark_roundtrip_null_until_set()
    {
        var repo = new EfReviewMarkRepository(_db);
        Assert.That(await repo.GetAsync(), Is.Null);
        await repo.SetAsync(T1);
        Assert.That(await repo.GetAsync(), Is.EqualTo(T1));
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
}
