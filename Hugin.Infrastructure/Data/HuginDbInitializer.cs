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

    public static async Task InitAsync(HuginDbContext db, CancellationToken ct = default)
    {
        await db.Database.MigrateAsync(ct);
        // WAL is a property of the db file, not the connection — setting it once persists.
        await db.Database.ExecuteSqlRawAsync("PRAGMA journal_mode=WAL;", ct);
    }
}
