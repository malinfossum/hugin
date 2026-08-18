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
    public DateTimeOffset FirstSeen { get; set; }
    public bool IsActive { get; set; }
}
