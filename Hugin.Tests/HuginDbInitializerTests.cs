using Hugin.Infrastructure.Data;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Hugin.Tests;

[TestFixture]
public sealed class HuginDbInitializerTests
{
    [Test]
    public async Task InitAsync_migrates_and_enables_wal()
    {
        var path = Path.Combine(Path.GetTempPath(), $"hugin-init-{Guid.NewGuid():N}.db");
        try
        {
            var options = new DbContextOptionsBuilder<HuginDbContext>()
                .UseSqlite(HuginDbInitializer.ConnectionString(path))
                .Options;

            await using (var db = new HuginDbContext(options))
                await HuginDbInitializer.InitAsync(db);

            await using var check = new HuginDbContext(options);
            // Migrations ran: the Ads table exists and is queryable.
            Assert.That(await check.Ads.CountAsync(), Is.Zero);

            // WAL is persisted in the db file.
            var connection = check.Database.GetDbConnection();
            await connection.OpenAsync();
            await using var cmd = connection.CreateCommand();
            cmd.CommandText = "PRAGMA journal_mode;";
            Assert.That((string?)await cmd.ExecuteScalarAsync(), Is.EqualTo("wal").IgnoreCase);
        }
        finally
        {
            SqliteConnection.ClearAllPools();
            File.Delete(path);
        }
    }

    [Test]
    public void ConnectionString_carries_path_and_busy_timeout()
    {
        var cs = HuginDbInitializer.ConnectionString(@"C:\x\hugin.db");
        Assert.That(cs, Does.Contain(@"Data Source=C:\x\hugin.db"));
        Assert.That(cs, Does.Contain("Default Timeout=5"));
    }

    [Test]
    public async Task InitAsync_backs_up_an_existing_db_with_pending_migrations()
    {
        var path = Path.Combine(Path.GetTempPath(), $"hugin-backup-{Guid.NewGuid():N}.db");
        var backupPath = path + ".bak";
        try
        {
            // A real sqlite file already sitting at the path, with no __EFMigrationsHistory
            // table yet, has every migration pending — exactly the "real data about to be
            // migrated" case InitAsync must protect.
            await using (var seed = new SqliteConnection($"Data Source={path}"))
            {
                await seed.OpenAsync();
                await using var cmd = seed.CreateCommand();
                cmd.CommandText = "CREATE TABLE Placeholder (Id INTEGER PRIMARY KEY);";
                await cmd.ExecuteNonQueryAsync();
            }

            var options = new DbContextOptionsBuilder<HuginDbContext>()
                .UseSqlite(HuginDbInitializer.ConnectionString(path))
                .Options;

            await using (var db = new HuginDbContext(options))
                await HuginDbInitializer.InitAsync(db, path);

            Assert.That(File.Exists(backupPath), Is.True);
        }
        finally
        {
            SqliteConnection.ClearAllPools();
            File.Delete(path);
            File.Delete(backupPath);
        }
    }

    [Test]
    public async Task InitAsync_does_not_back_up_a_fresh_db()
    {
        var path = Path.Combine(Path.GetTempPath(), $"hugin-fresh-{Guid.NewGuid():N}.db");
        var backupPath = path + ".bak";
        try
        {
            var options = new DbContextOptionsBuilder<HuginDbContext>()
                .UseSqlite(HuginDbInitializer.ConnectionString(path))
                .Options;

            // No file exists at the path yet — nothing to back up.
            Assert.That(File.Exists(path), Is.False);

            await using (var db = new HuginDbContext(options))
                await HuginDbInitializer.InitAsync(db, path);

            Assert.That(File.Exists(backupPath), Is.False);
        }
        finally
        {
            SqliteConnection.ClearAllPools();
            File.Delete(path);
            File.Delete(backupPath);
        }
    }
}
