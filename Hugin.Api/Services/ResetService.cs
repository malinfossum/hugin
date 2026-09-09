using Hugin.Core.Abstractions;
using Hugin.Core.Config;
using Hugin.Infrastructure;
using Hugin.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Hugin.Api.Services;

/// <summary>
/// Two levels of starting over (spec v3.5 Part D). "scope" clears the geography and leaves
/// everything else; "all" also empties the data, after taking a consistent snapshot.
/// </summary>
public sealed class ResetService(HuginDbContext db, HuginConfigFile file, IClock clock)
{
    public void ClearScope() =>
        file.WriteDiscovery(new DiscoveryConfig([], [], false));

    /// <summary>
    /// Order matters and is not negotiable: SQLite refuses VACUUM and VACUUM INTO inside a
    /// transaction, so the snapshot and the compaction sit outside the one that deletes rows.
    /// The file itself is never deleted — this process holds it open.
    /// </summary>
    public async Task<string> WipeAsync(CancellationToken ct = default)
    {
        var dbPath = file.DatabasePath;
        var snapshot = $"{dbPath}.reset-{clock.UtcNow.ToLocalTime():yyyyMMdd-HHmmss}.bak";
        if (snapshot.Contains('\n') || snapshot.Contains('\0'))
            throw new InvalidOperationException("Ugyldig sti for sikkerhetskopi.");

        // VACUUM INTO takes a string literal, not a parameter — double every quote in the path.
        // C:\Users\O'Brien\ is an ordinary Windows path. Built with string.Concat rather than
        // interpolation: EF1002 flags an interpolated-string argument to ExecuteSqlRawAsync as a
        // possible injection even though this value is server-generated and already escaped.
        var quoted = snapshot.Replace("'", "''");
        await db.Database.ExecuteSqlRawAsync(string.Concat("VACUUM INTO '", quoted, "';"), ct);

        await using (var tx = await db.Database.BeginTransactionAsync(ct))
        {
            await db.Ads.ExecuteDeleteAsync(ct);
            await db.Pipeline.ExecuteDeleteAsync(ct);
            await db.Companies.ExecuteDeleteAsync(ct);
            await db.ReviewMarks.ExecuteDeleteAsync(ct);
            // Selective on purpose: the "sources-seed" row is what stops HuginDbInitializer
            // re-importing the default sources and the config linkouts on the next launch.
            await db.SyncStates.Where(s => s.Source == "brreg" || s.Source == "nav")
                .ExecuteDeleteAsync(ct);
            await tx.CommitAsync(ct);
        }

        await db.Database.ExecuteSqlRawAsync("VACUUM;", ct);
        return snapshot;
    }
}
