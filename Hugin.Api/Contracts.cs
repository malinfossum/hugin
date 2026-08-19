using Hugin.Core.Models;
using Hugin.Core.Services;

namespace Hugin.Api;

public sealed record AdDto(string FeedId, string Title, string? Employer, string? EmployerOrgnr,
    string? Kommune, DateTimeOffset? Expires, int? DaysLeft, string? Category, string? SourceUrl,
    string? PipelineStatus, bool Hidden, bool IsActive)
{
    // AdOverview only ever holds active ads.
    public static AdDto From(AdOverview a) => new(a.FeedId, a.Title, a.EmployerName, a.EmployerOrgnr,
        a.MunicipalityNumber, a.Expires, a.DaysLeft, a.Category, a.SourceUrl,
        a.PipelineStatus is { } s ? StatusSlug.ToSlug(s) : null, a.Hidden, IsActive: true);
}

/// <summary>Same slugs as the CLI's track command — one vocabulary across both frontends.</summary>
public static class StatusSlug
{
    public static string ToSlug(PipelineStatus status) => status switch
    {
        PipelineStatus.Funnet => "funnet",
        PipelineStatus.SoektSelv => "soekt-selv",
        PipelineStatus.BedtGetSjekke => "bedt-get",
        PipelineStatus.Svar => "svar",
        _ => status.ToString().ToLowerInvariant(),
    };

    public static PipelineStatus? Parse(string? slug) => slug switch
    {
        "funnet" => PipelineStatus.Funnet,
        "soekt-selv" => PipelineStatus.SoektSelv,
        "bedt-get" => PipelineStatus.BedtGetSjekke,
        "svar" => PipelineStatus.Svar,
        _ => null,
    };
}
