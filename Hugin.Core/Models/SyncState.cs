namespace Hugin.Core.Models;

/// <summary>
/// Feed position per source. <see cref="Cursor"/> advances only after the batch commits,
/// so a crash mid-sync re-fetches rather than skips.
/// </summary>
public sealed class SyncState
{
    public required string Source { get; init; }   // "brreg" | "nav"
    public DateTimeOffset? LastSyncUtc { get; set; }
    public string? Cursor { get; set; }
}
