using Hugin.Core.Config;
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

    // The new-list and company history are review lists, not the deadline view: no pipeline
    // join, no days-left countdown.
    public static AdDto FromAd(Ad a) => new(a.FeedId, a.Title, a.EmployerName, a.EmployerOrgnr,
        a.MunicipalityNumber, a.Expires, DaysLeft: null, a.Category, a.SourceUrl,
        PipelineStatus: null, a.Hidden, a.IsActive);
}

public sealed record NewDto(IReadOnlyList<CompanyDto> Companies, IReadOnlyList<AdDto> Ads,
    DateTimeOffset Since, DateTimeOffset AsOf);

public sealed record CompanyDto(string Orgnr, string Name, string? Kommune, string? NaceCode,
    bool IsBranch, string? Website, string? ParentOrgnr)
{
    public static CompanyDto From(Company c) => new(c.Orgnr, c.Name, c.MunicipalityNumber, c.NaceCode,
        c.IsBranch, c.Website, c.ParentOrgnr);
}

public sealed record CompanyDetailDto(CompanyDto Company, IReadOnlyList<AdDto> Ads);

public sealed record PipelineDto(string Orgnr, string CompanyName, string Status, string Route,
    string Why, string? Note, string? Svar, DateTimeOffset Updated)
{
    public static PipelineDto From(PipelineEntry e, string companyName) => new(e.Orgnr, companyName,
        StatusSlug.ToSlug(e.Status), RouteSlug(e.Route), e.Why, e.Note, e.SvarText, e.Updated);

    private static string RouteSlug(OutreachRoute route) => route switch
    {
        OutreachRoute.SoektSelv => "soekt-selv",
        OutreachRoute.BedtGetSjekke => "bedt-get",
        _ => "ingen",
    };
}

public sealed record TrackRequest(string Status, string? Why, string? Note, string? Svar);

public sealed record SeenRequest(DateTimeOffset AsOf);

public sealed record TrackResponse(PipelineDto Entry, string? Warning);

public sealed record SourceStateDto(DateTimeOffset LastSyncUtc);

public sealed record StatusDto(SourceStateDto? Brreg, SourceStateDto? Nav, DateTimeOffset? ReviewMark,
    int ActiveAds, int Companies, int PipelineEntries, IReadOnlyList<Linkout> Linkouts);

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
