using Hugin.Core.Config;
using Hugin.Core.Models;
using Hugin.Core.Services;

namespace Hugin.Api;

public sealed record AdDto(string FeedId, string Title, string? Employer, string? EmployerOrgnr,
    string? Kommune, DateTimeOffset? Expires, int? DaysLeft, string? Category, string? SourceUrl,
    string? PipelineStatus, bool Hidden, bool IsActive, DateTimeOffset? Published, string? LinkedOrgnr)
{
    // AdOverview only ever holds active ads.
    public static AdDto From(AdOverview a) => new(a.FeedId, a.Title, a.EmployerName, a.EmployerOrgnr,
        a.MunicipalityNumber, a.Expires, a.DaysLeft, a.Category, a.SourceUrl,
        a.PipelineStatus is { } s ? StatusSlug.ToSlug(s) : null, a.Hidden, IsActive: true, a.Published, a.LinkedOrgnr);

    // The new-list and company history are review lists, not the deadline view: no pipeline
    // join, no days-left countdown. IsActive is the live rule (Ad.IsOpenAt), not the stored flag.
    public static AdDto FromAd(Ad a, DateTimeOffset now) => new(a.FeedId, a.Title, a.EmployerName, a.EmployerOrgnr,
        a.MunicipalityNumber, a.Expires, DaysLeft: null, a.Category, a.SourceUrl,
        PipelineStatus: null, a.Hidden, a.IsOpenAt(now), a.Published, a.LinkedOrgnr);
}

public sealed record NewDto(IReadOnlyList<CompanyDto> Companies, IReadOnlyList<AdDto> Ads,
    DateTimeOffset Since, DateTimeOffset AsOf);

public sealed record CompanyDto(string Orgnr, string Name, string? Kommune, string? KommuneNavn,
    string? NaceCode, bool IsBranch, string? Website, string? ParentOrgnr)
{
    // Resolution order: the configured municipality list (Hugin's own tracked region) wins
    // first, then the full Brreg kommune register (covers every number, e.g. a parent or an
    // enriched ad employer sitting outside the tracked region), then the raw number as a
    // last resort — null only when the company itself has no kommune number.
    public static CompanyDto From(Company c, HuginConfig config, IReadOnlyDictionary<string, string> kommuner) =>
        new(c.Orgnr, c.Name, c.MunicipalityNumber,
            config.Municipalities.FirstOrDefault(m => m.Number == c.MunicipalityNumber)?.Name
                ?? (c.MunicipalityNumber is { } number ? kommuner.GetValueOrDefault(number, number) : null),
            c.NaceCode, c.IsBranch, ResolveWebsite(c), c.ParentOrgnr);

    // A website confirmed dead (WebsiteOk == false) is never rendered as a link — better no
    // link than a dead one. Unchecked (WebsiteOk == null) still renders, same as before this
    // feature existed. A checked-and-reachable site prefers the variant that actually answered
    // (WebsiteResolved), which may differ from the register's own https-prefixed value.
    private static string? ResolveWebsite(Company c) => c.WebsiteOk == false ? null : c.WebsiteResolved ?? c.Website;
}

public sealed record CompanyDetailDto(CompanyDto Company, IReadOnlyList<AdDto> Ads, IReadOnlyList<CompanyDto> Branches);

public sealed record PipelineDto(string Orgnr, string CompanyName, string Status, bool Starred,
    string Why, string? Note, string? Svar, DateTimeOffset Updated, bool AdsExpired)
{
    public static PipelineDto From(PipelineOverview o, string companyName) => new(o.Entry.Orgnr, companyName,
        StatusSlug.ToSlug(o.Entry.Status), o.Entry.Starred, o.Entry.Why, o.Entry.Note, o.Entry.SvarText,
        o.Entry.Updated, o.AdsExpired);
}

public sealed record TrackRequest(string Status, string? Why, string? Note, string? Svar, bool? Starred);

public sealed record SeenRequest(DateTimeOffset AsOf);

public sealed record LinkRequest(string Orgnr);

public sealed record TrackResponse(PipelineDto Entry, string? Warning);

public sealed record SourceStateDto(DateTimeOffset LastSyncUtc);

public sealed record StatusDto(SourceStateDto? Brreg, SourceStateDto? Nav, DateTimeOffset? ReviewMark,
    int ActiveAds, int Companies, int PipelineEntries);

public sealed record SourceDto(int Id, string Label, string Url, int Position)
{
    public static SourceDto From(Source s) => new(s.Id, s.Label, s.Url, s.Position);
}

public sealed record SourceWriteRequest(string Label, string Url);

public sealed record ReorderRequest(IReadOnlyList<int> Ids);

public sealed record KommuneDto(string Number, string Name);

public sealed record DiscoveryConfigDto(IReadOnlyList<MunicipalityRef> Municipalities, IReadOnlyList<string> Fylker, bool AllOfNorway)
{
    public static DiscoveryConfigDto From(DiscoveryConfig d) => new(d.Municipalities, d.Fylker, d.AllOfNorway);
}

/// <summary>Numbers only — names are derived from the kommune register server-side (spec v3.4 Part A).</summary>
public sealed record DiscoveryWriteRequest(IReadOnlyList<string>? MunicipalityNumbers, IReadOnlyList<string>? Fylker, bool AllOfNorway);

/// <summary>Same slugs as the CLI's track command — one vocabulary across both frontends.</summary>
public static class StatusSlug
{
    public static string ToSlug(PipelineStatus status) => status switch
    {
        PipelineStatus.Active => "active",
        PipelineStatus.Applied => "applied",
        PipelineStatus.Answered => "answered",
        _ => status.ToString().ToLowerInvariant(),
    };

    public static PipelineStatus? Parse(string? slug) => slug switch
    {
        "active" => PipelineStatus.Active,
        "applied" => PipelineStatus.Applied,
        "answered" => PipelineStatus.Answered,
        _ => null,
    };
}
