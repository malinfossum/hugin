using Microsoft.EntityFrameworkCore;

namespace Hugin.Infrastructure.Data;

/// <summary>
/// One-stop startup for every host that opens the db. WAL + a busy-timeout matter from phase 2
/// on: two processes (CLI + API) share one SQLite file, so readers must not block the writer
/// and brief lock contention must retry instead of erroring.
/// </summary>
public static class HuginDbInitializer
{
    /// <summary>"Default Timeout" doubles as SQLite's busy-timeout in Microsoft.Data.Sqlite.</summary>
    public static string ConnectionString(string databasePath) =>
        $"Data Source={databasePath};Default Timeout=5";

    /// <summary>
    /// <paramref name="databasePath"/> is optional so tests that only care about migrate+WAL can
    /// omit it; both real hosts (CLI, API) pass their own <c>loaded.DatabasePath</c>.
    /// </summary>
    public static async Task InitAsync(HuginDbContext db, string? databasePath = null, CancellationToken ct = default)
    {
        if (databasePath is not null && File.Exists(databasePath)
            && (await db.Database.GetPendingMigrationsAsync(ct)).Any())
        {
            // A schema-changing migration is about to run against real data — keep an
            // unmigrated copy in case something goes wrong. Best-effort: a backup failure must
            // never block the migration itself from running.
            try { File.Copy(databasePath, databasePath + ".bak", overwrite: true); }
            catch (IOException) { }
        }

        await db.Database.MigrateAsync(ct);
        // WAL is a property of the db file, not the connection — setting it once persists.
        await db.Database.ExecuteSqlRawAsync("PRAGMA journal_mode=WAL;", ct);
    }
}
