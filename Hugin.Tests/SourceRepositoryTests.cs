using Hugin.Infrastructure.Data;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Hugin.Tests;

[TestFixture]
public sealed class SourceRepositoryTests
{
    private SqliteConnection _conn = null!;
    private HuginDbContext _db = null!;

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

    [Test]
    public async Task AddAsync_assigns_positions_starting_at_one()
    {
        var repo = new EfSourceRepository(_db);

        var first = await repo.AddAsync("FINN", "https://www.finn.no/job", CancellationToken.None);
        var second = await repo.AddAsync("LinkedIn", "https://www.linkedin.com/jobs/", CancellationToken.None);

        Assert.That(first.Position, Is.EqualTo(1));
        Assert.That(second.Position, Is.EqualTo(2));
    }

    [Test]
    public async Task GetAllAsync_orders_by_position()
    {
        var repo = new EfSourceRepository(_db);
        await repo.AddAsync("FINN", "https://finn.no", CancellationToken.None);
        await repo.AddAsync("Proff", "https://proff.no", CancellationToken.None);
        await repo.AddAsync("LinkedIn", "https://linkedin.com", CancellationToken.None);

        var all = await repo.GetAllAsync(CancellationToken.None);
        // Insertion order and position order diverge after this reorder — GetAll must follow Position.
        await repo.ReorderAsync([all[2].Id, all[0].Id, all[1].Id], CancellationToken.None);

        var reordered = await repo.GetAllAsync(CancellationToken.None);
        Assert.That(reordered.Select(s => s.Label), Is.EqualTo(new[] { "LinkedIn", "FINN", "Proff" }));
    }

    [Test]
    public async Task UpdateAsync_returns_false_for_an_unknown_id()
    {
        var repo = new EfSourceRepository(_db);
        Assert.That(await repo.UpdateAsync(999, "X", "https://x.no", CancellationToken.None), Is.False);
    }

    [Test]
    public async Task UpdateAsync_changes_label_and_url()
    {
        var repo = new EfSourceRepository(_db);
        var source = await repo.AddAsync("FINN", "https://finn.no", CancellationToken.None);

        var updated = await repo.UpdateAsync(source.Id, "FINN.no", "https://www.finn.no/job", CancellationToken.None);

        Assert.That(updated, Is.True);
        var stored = await repo.GetAsync(source.Id, CancellationToken.None);
        Assert.That(stored!.Label, Is.EqualTo("FINN.no"));
        Assert.That(stored.Url, Is.EqualTo("https://www.finn.no/job"));
    }

    [Test]
    public async Task DeleteAsync_removes_the_source()
    {
        var repo = new EfSourceRepository(_db);
        var source = await repo.AddAsync("FINN", "https://finn.no", CancellationToken.None);

        Assert.That(await repo.DeleteAsync(source.Id, CancellationToken.None), Is.True);
        Assert.That(await repo.GetAsync(source.Id, CancellationToken.None), Is.Null);
    }

    [Test]
    public async Task DeleteAsync_renumbers_remaining_sources_to_stay_dense()
    {
        // ISourceRepository documents Position as 1-based and dense after every write that
        // changes the set — deleting the middle of {1,2,3} must leave {1,2}, not {1,3}.
        var repo = new EfSourceRepository(_db);
        var a = await repo.AddAsync("A", "https://a.no", CancellationToken.None);
        var b = await repo.AddAsync("B", "https://b.no", CancellationToken.None);
        var c = await repo.AddAsync("C", "https://c.no", CancellationToken.None);

        Assert.That(await repo.DeleteAsync(b.Id, CancellationToken.None), Is.True);

        var remaining = await repo.GetAllAsync(CancellationToken.None);
        Assert.That(remaining.Select(s => s.Id), Is.EqualTo(new[] { a.Id, c.Id }));
        Assert.That(remaining.Select(s => s.Position), Is.EqualTo(new[] { 1, 2 }));
    }

    [Test]
    public async Task DeleteAsync_returns_false_for_an_unknown_id()
    {
        var repo = new EfSourceRepository(_db);
        Assert.That(await repo.DeleteAsync(999, CancellationToken.None), Is.False);
    }

    [Test]
    public async Task ReorderAsync_rewrites_positions_to_list_order()
    {
        var repo = new EfSourceRepository(_db);
        var a = await repo.AddAsync("A", "https://a.no", CancellationToken.None);
        var b = await repo.AddAsync("B", "https://b.no", CancellationToken.None);
        var c = await repo.AddAsync("C", "https://c.no", CancellationToken.None);

        var ok = await repo.ReorderAsync([c.Id, a.Id, b.Id], CancellationToken.None);

        Assert.That(ok, Is.True);
        var all = await repo.GetAllAsync(CancellationToken.None);
        Assert.That(all.Select(s => s.Id), Is.EqualTo(new[] { c.Id, a.Id, b.Id }));
        Assert.That(all.Select(s => s.Position), Is.EqualTo(new[] { 1, 2, 3 }));
    }

    [Test]
    public async Task ReorderAsync_returns_false_and_changes_nothing_when_an_id_is_missing()
    {
        var repo = new EfSourceRepository(_db);
        var a = await repo.AddAsync("A", "https://a.no", CancellationToken.None);
        await repo.AddAsync("B", "https://b.no", CancellationToken.None);

        var ok = await repo.ReorderAsync([a.Id], CancellationToken.None);

        Assert.That(ok, Is.False);
        var all = await repo.GetAllAsync(CancellationToken.None);
        Assert.That(all.Select(s => s.Position), Is.EqualTo(new[] { 1, 2 }), "unchanged");
    }

    [Test]
    public async Task ReorderAsync_returns_false_and_changes_nothing_when_an_extra_id_is_given()
    {
        var repo = new EfSourceRepository(_db);
        var a = await repo.AddAsync("A", "https://a.no", CancellationToken.None);
        var b = await repo.AddAsync("B", "https://b.no", CancellationToken.None);

        var ok = await repo.ReorderAsync([a.Id, b.Id, 999], CancellationToken.None);

        Assert.That(ok, Is.False);
        var all = await repo.GetAllAsync(CancellationToken.None);
        Assert.That(all.Select(s => s.Position), Is.EqualTo(new[] { 1, 2 }), "unchanged");
    }
}
