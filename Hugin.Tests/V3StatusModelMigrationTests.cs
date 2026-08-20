using Hugin.Infrastructure.Data;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Hugin.Tests;

/// <summary>
/// Every other migration test runs against an empty db, which never exercises the data remap in
/// <c>V3StatusModel.Up</c> — SQLite happily runs an UPDATE against zero rows. These tests seed
/// real pre-migration rows (old Status ints, a Route column) and assert the remap itself.
/// </summary>
[TestFixture]
public sealed class V3StatusModelMigrationTests
{
    private const string PreviousMigration = "20260820121936_AddWebsiteCheck";

    [Test]
    public async Task Up_remaps_status_ints_defaults_starred_false_and_drops_route()
    {
        var path = Path.Combine(Path.GetTempPath(), $"hugin-remap-{Guid.NewGuid():N}.db");
        try
        {
            var options = new DbContextOptionsBuilder<HuginDbContext>()
                .UseSqlite(HuginDbInitializer.ConnectionString(path))
                .Options;

            await using (var db = new HuginDbContext(options))
            {
                // Stop one migration short of V3StatusModel, so Pipeline still has the old
                // Status ints and the Route column to remap.
                await db.GetService<IMigrator>().MigrateAsync(PreviousMigration);

                var connection = db.Database.GetDbConnection();
                await connection.OpenAsync();
                await using var seed = connection.CreateCommand();
                // Old enum: Funnet=0, SoektSelv=1, BedtGetSjekke=2, Svar=3. Row "5" carries an
                // out-of-range Status (tampered/corrupt data) to exercise the defensive ELSE 0.
                seed.CommandText = """
                    INSERT INTO Pipeline (Orgnr, Status, Why, Note, SvarText, Created, Updated, Route)
                    VALUES
                        ('1', 0, 'fordi', NULL, NULL, 0, 0, 0),
                        ('2', 1, 'fordi', NULL, NULL, 0, 0, 1),
                        ('3', 2, 'fordi', NULL, NULL, 0, 0, 2),
                        ('4', 3, 'fordi', NULL, NULL, 0, 0, 1),
                        ('5', 99, 'fordi', NULL, NULL, 0, 0, 0);
                    """;
                await seed.ExecuteNonQueryAsync();
            }

            await using (var db = new HuginDbContext(options))
                await HuginDbInitializer.InitAsync(db);

            await using (var check = new HuginDbContext(options))
            {
                var byOrgnr = await check.Pipeline.OrderBy(p => p.Orgnr)
                    .Select(p => new { p.Orgnr, Status = (int)p.Status, p.Starred })
                    .ToListAsync();

                Assert.That(byOrgnr.Select(p => p.Status), Is.EqualTo(new[] { 0, 1, 1, 2, 0 }),
                    "Funnet->Active, both outreach routes->Applied, Svar->Answered, out-of-range->Active");
                Assert.That(byOrgnr.Select(p => p.Starred), Is.All.False,
                    "Starred is a new column — every pre-existing row must default to false");

                var connection = check.Database.GetDbConnection();
                await connection.OpenAsync();
                await using var cmd = connection.CreateCommand();
                cmd.CommandText = "SELECT COUNT(*) FROM pragma_table_info('Pipeline') WHERE name = 'Route';";
                var routeColumnCount = (long)(await cmd.ExecuteScalarAsync())!;
                Assert.That(routeColumnCount, Is.Zero, "Route column must be dropped");
            }
        }
        finally
        {
            SqliteConnection.ClearAllPools();
            File.Delete(path);
            File.Delete(path + ".bak");
        }
    }
}
