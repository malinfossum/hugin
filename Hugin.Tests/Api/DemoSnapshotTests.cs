using Hugin.Api;
using Hugin.Api.Services;
using Hugin.Core.Models;
using Hugin.Infrastructure.Data;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;

namespace Hugin.Tests.Api;

[TestFixture]
public sealed class DemoSnapshotTests
{
    private DirectoryInfo _root = null!;
    private PublicModeOptions _mode = null!;

    [SetUp]
    public void Up()
    {
        _root = Directory.CreateTempSubdirectory("hugin-snapshot-");
        var state = Path.Combine(_root.FullName, "state");
        Directory.CreateDirectory(state);
        _mode = new PublicModeOptions(true, state, Path.Combine(_root.FullName, "work", "hugin.db"));
    }

    [TearDown]
    public void Down()
    {
        SqliteConnection.ClearAllPools();
        try { _root.Delete(recursive: true); } catch (IOException) { }
    }

    private DemoSnapshot Snapshot() => new(_mode, NullLogger<DemoSnapshot>.Instance);

    private static DbContextOptions<HuginDbContext> Options(string path) =>
        new DbContextOptionsBuilder<HuginDbContext>().UseSqlite(HuginDbInitializer.ConnectionString(path)).Options;

    [Test]
    public void Copy_in_copies_the_snapshot_when_no_working_copy_exists()
    {
        File.WriteAllText(_mode.SnapshotPath, "snapshot-bytes");
        Assert.That(Snapshot().CopyIn(), Is.True);
        Assert.That(File.ReadAllText(_mode.WorkingDbPath), Is.EqualTo("snapshot-bytes"));
    }

    [Test]
    public void Copy_in_keeps_an_existing_working_copy()
    {
        File.WriteAllText(_mode.SnapshotPath, "old-snapshot");
        Directory.CreateDirectory(Path.GetDirectoryName(_mode.WorkingDbPath)!);
        File.WriteAllText(_mode.WorkingDbPath, "newer-working-copy");
        Assert.That(Snapshot().CopyIn(), Is.False);
        Assert.That(File.ReadAllText(_mode.WorkingDbPath), Is.EqualTo("newer-working-copy"));
    }

    [Test]
    public void Copy_in_without_a_snapshot_starts_empty()
    {
        Assert.That(Snapshot().CopyIn(), Is.False);
        Assert.That(File.Exists(_mode.WorkingDbPath), Is.False);
    }

    [Test]
    public void Nothing_happens_in_normal_mode()
    {
        var off = new DemoSnapshot(PublicModeOptions.Off, NullLogger<DemoSnapshot>.Instance);
        Assert.That(off.CopyIn(), Is.False);
    }

    [Test]
    public async Task Copy_back_writes_a_valid_snapshot_and_clears_a_stale_tmp()
    {
        Directory.CreateDirectory(Path.GetDirectoryName(_mode.WorkingDbPath)!);
        File.WriteAllText(_mode.SnapshotPath + ".tmp", "stale");
        await using (var db = new HuginDbContext(Options(_mode.WorkingDbPath)))
        {
            await HuginDbInitializer.InitAsync(db);
            db.Sources.Add(new Source { Label = "Demo", Url = "https://example.org", Position = 99 });
            await db.SaveChangesAsync();
            Assert.That(await Snapshot().CopyBackAsync(db), Is.True);
        }

        Assert.That(File.Exists(_mode.SnapshotPath + ".tmp"), Is.False, "the tmp is moved, never left behind");
        await using var check = new HuginDbContext(Options(_mode.SnapshotPath));
        Assert.That(await check.Sources.AnyAsync(s => s.Label == "Demo"), Is.True);
    }

    [Test]
    public async Task Copy_back_into_an_unwritable_state_dir_logs_and_returns_false()
    {
        var blocked = new PublicModeOptions(true, Path.Combine(_root.FullName, "not-a-dir"), _mode.WorkingDbPath);
        File.WriteAllText(blocked.StateDir, "a file where the dir should be");
        Directory.CreateDirectory(Path.GetDirectoryName(_mode.WorkingDbPath)!);
        await using var db = new HuginDbContext(Options(_mode.WorkingDbPath));
        await HuginDbInitializer.InitAsync(db);

        var snapshot = new DemoSnapshot(blocked, NullLogger<DemoSnapshot>.Instance);
        Assert.That(await snapshot.CopyBackAsync(db), Is.False);
    }
}
