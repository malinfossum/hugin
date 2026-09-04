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

    /// <summary>Important 2 fix: PRAGMA wal_checkpoint(TRUNCATE)'s (busy, log, checkpointed) row
    /// is now actually read instead of discarded by ExecuteSqlRawAsync. A second connection with
    /// an open read transaction on the working db holds a read mark the checkpoint cannot fold
    /// past — the same signal a concurrent reader produces on the real host — so the copy must
    /// be skipped rather than risk a stale snapshot with an empty log.</summary>
    [Test]
    public async Task Copy_back_skips_a_busy_checkpoint_instead_of_writing_a_stale_snapshot()
    {
        Directory.CreateDirectory(Path.GetDirectoryName(_mode.WorkingDbPath)!);
        await using var db = new HuginDbContext(Options(_mode.WorkingDbPath));
        await HuginDbInitializer.InitAsync(db);
        db.Sources.Add(new Source { Label = "Demo", Url = "https://example.org", Position = 99 });
        await db.SaveChangesAsync();

        await using var reader = new SqliteConnection(HuginDbInitializer.ConnectionString(_mode.WorkingDbPath));
        await reader.OpenAsync();
        await using (var begin = reader.CreateCommand())
        {
            begin.CommandText = "BEGIN;";
            await begin.ExecuteNonQueryAsync();
        }
        await using (var hold = reader.CreateCommand())
        {
            // The first read inside the transaction is what actually takes the WAL read mark —
            // BEGIN alone (DEFERRED) does not.
            hold.CommandText = "SELECT COUNT(*) FROM Sources;";
            await hold.ExecuteScalarAsync();
        }

        try
        {
            Assert.That(await Snapshot().CopyBackAsync(db), Is.False,
                "the WAL cannot fold in while the reader holds its mark");
            Assert.That(File.Exists(_mode.SnapshotPath), Is.False, "no stale snapshot was written");
        }
        finally
        {
            await using var rollback = reader.CreateCommand();
            rollback.CommandText = "ROLLBACK;";
            await rollback.ExecuteNonQueryAsync();
        }
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
