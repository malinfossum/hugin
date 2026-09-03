using Hugin.Infrastructure.Data;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Hugin.Api.Services;

/// <summary>
/// Public-mode persistence (demo spec Part B). App Service mounts /home as a CIFS share where
/// SQLite locking does not work, so the host runs on a working copy on local disk and keeps a
/// plain-file snapshot in the state dir: copy-in once at boot (only when no working copy is
/// there — an in-place restart keeps its newer copy), copy-back after every sync via a
/// checkpoint, a .tmp and a move. Every failure is a warning: the worst case is a full re-walk
/// on the next cold start, never a broken demo.
/// </summary>
public sealed class DemoSnapshot(PublicModeOptions mode, ILogger<DemoSnapshot> logger)
{
    /// <summary>True when the snapshot was copied into place; false when skipped, absent or failed.</summary>
    public bool CopyIn()
    {
        if (!mode.Enabled) return false;
        if (File.Exists(mode.WorkingDbPath))
        {
            logger.LogInformation("Arbeidskopi finnes allerede — beholder den framfor snapshot i {State}.", mode.StateDir);
            return false;
        }
        if (!File.Exists(mode.SnapshotPath))
        {
            logger.LogWarning("Ingen snapshot i {State} — starter tom (full synk).", mode.StateDir);
            return false;
        }

        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(mode.WorkingDbPath)!);
            File.Copy(mode.SnapshotPath, mode.WorkingDbPath);
            return true;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            logger.LogWarning(ex, "Kunne ikke kopiere inn snapshot fra {State}.", mode.StateDir);
            return false;
        }
    }

    /// <summary>Checkpoint, copy to .tmp beside the snapshot, move over it. Runs after the seeder (Task 9).</summary>
    public async Task<bool> CopyBackAsync(HuginDbContext db, CancellationToken ct = default)
    {
        if (!mode.Enabled) return false;
        var tmp = mode.SnapshotPath + ".tmp";
        try
        {
            await db.Database.ExecuteSqlRawAsync("PRAGMA wal_checkpoint(TRUNCATE);", ct);
            Directory.CreateDirectory(mode.StateDir);
            File.Copy(mode.WorkingDbPath, tmp, overwrite: true);
            File.Move(tmp, mode.SnapshotPath, overwrite: true);
            return true;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or SqliteException)
        {
            logger.LogWarning(ex, "Kunne ikke kopiere snapshot tilbake til {State}.", mode.StateDir);
            return false;
        }
    }
}
