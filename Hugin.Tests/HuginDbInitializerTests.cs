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
}
