namespace Hugin.Core.Models;

/// <summary>
/// A job ad from the NAV stillingsfeed. <see cref="SourceUrl"/> is the deep-link NAV's
/// terms require; <see cref="IsActive"/> flips when the feed reports the ad gone, or
/// when <see cref="Expires"/> has passed.
/// </summary>
public sealed class Ad
{
    public required string FeedId { get; init; }
    public required string Title { get; set; }
    public string? EmployerName { get; set; }
    public string? EmployerOrgnr { get; set; }
    public string? MunicipalityNumber { get; set; }
    public DateTimeOffset? Published { get; set; }
    public DateTimeOffset? Expires { get; set; }
    public string? SourceUrl { get; set; }

    // NAV's occupation category for display/grouping, e.g. "IT / Utvikling".
    public string? Category { get; set; }
    public DateTimeOffset FirstSeen { get; set; }
    public bool IsActive { get; set; }

    // Dashboard dismiss flag ("Skjul") — Hugin's own field, never touched by sync upserts.
    public bool Hidden { get; set; }

    // Manual link to the pipeline entry this ad belongs to, for ads posted by a sister unit the
    // ParentOrgnr chain never reaches. Hugin's own field, never touched by sync upserts.
    public string? LinkedOrgnr { get; set; }

    /// <summary>
    /// The one rule for "still open": the feed has not closed it AND its deadline has not
    /// passed. The sync sweep only persists the deadline half; reads apply it live so an ad
    /// drops out the moment its frist passes, not at the next sync. NAV's expires is
    /// end-of-day, so the deadline day itself still counts as open.
    /// EfAdRepository.GetActiveAsync mirrors this in SQL — keep the two in step.
    /// </summary>
    public bool IsOpenAt(DateTimeOffset now) => IsActive && (Expires is null || Expires >= now);
}
