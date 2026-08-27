using Hugin.Core.Config;
using Hugin.Core.Models;
using Hugin.Core.Services;
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
    /// <paramref name="config"/> and <paramref name="now"/> are likewise optional so those same
    /// tests need not care about seeding — real hosts pass their loaded config and their
    /// <see cref="Hugin.Core.Abstractions.IClock"/>'s current time.
    /// </summary>
    public static async Task InitAsync(HuginDbContext db, string? databasePath = null, HuginConfig? config = null,
        DateTimeOffset? now = null, CancellationToken ct = default)
    {
        if (databasePath is not null && File.Exists(databasePath)
            && (await db.Database.GetPendingMigrationsAsync(ct)).Any())
        {
            // A schema-changing migration is about to run against real data — keep an
            // unmigrated copy in case something goes wrong. Best-effort: a backup failure (an
            // AV lock, a read-only .bak, permissions, whatever the filesystem throws) must
            // never block the migration itself from running, so every exception is swallowed
            // here, not just IOException.
            try { File.Copy(databasePath, databasePath + ".bak", overwrite: true); }
            catch (Exception) { }
        }

        await db.Database.MigrateAsync(ct);
        // WAL is a property of the db file, not the connection — setting it once persists.
        await db.Database.ExecuteSqlRawAsync("PRAGMA journal_mode=WAL;", ct);

        // Sources move from hugin.json into the db in v3.2; the marker makes this an import
        // that runs once ever, not "whenever the table happens to be empty" — deleting every
        // source by hand must not resurrect the defaults on the next launch.
        var seeded = await db.SyncStates.FindAsync(["sources-seed"], ct);
        if (seeded is null)
        {
            var position = 1;
            db.Sources.Add(new Source { Label = "FINN", Url = "https://www.finn.no/job", Position = position++ });
            db.Sources.Add(new Source { Label = "LinkedIn", Url = "https://www.linkedin.com/jobs/", Position = position++ });
            db.Sources.Add(new Source { Label = "Proff", Url = "https://www.proff.no", Position = position++ });

            foreach (var linkout in (config ?? new HuginConfig()).Linkouts)
            {
                var url = UrlGuard.Website(linkout.Url);
                if (url is null) continue;
                db.Sources.Add(new Source { Label = linkout.Label, Url = url, Position = position++ });
            }

            db.SyncStates.Add(new SyncState { Source = "sources-seed", LastSyncUtc = now ?? DateTimeOffset.UtcNow });
            await db.SaveChangesAsync(ct);
        }
    }
}
