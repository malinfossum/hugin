using Hugin.Core.Config;
using Hugin.Core.Services;

namespace Hugin.Core.Abstractions;

/// <summary>A company as the register returns it — before it becomes a stored <see cref="Models.Company"/>.</summary>
public sealed record RegisterCompany(string Orgnr, string Name, string? MunicipalityNumber,
    string? NaceCode, string? ParentOrgnr, bool IsBranch, string? Website);

/// <summary>An ad as the feed returns it — before it becomes a stored <see cref="Models.Ad"/>.</summary>
public sealed record FeedAd(string FeedId, string Title, string? EmployerName, string? EmployerOrgnr,
    string? MunicipalityNumber, DateTimeOffset? Published, DateTimeOffset? Expires, string? SourceUrl, bool IsActive,
    string? Category = null, string? EmployerHomepage = null);

/// <summary>
/// One page of the feed. <paramref name="NextCursor"/> is null at the tail, where the page is
/// still collecting entries — <paramref name="PageId"/> is what a later sync resumes from.
/// </summary>
public sealed record FeedPage(IReadOnlyList<FeedAd> Ads, string? NextCursor, string? PageId = null);

public interface IBrregClient
{
    public Task<IReadOnlyList<RegisterCompany>> GetCompaniesAsync(IEnumerable<string> naceCodes,
        IEnumerable<string> municipalityNumbers, CancellationToken ct = default);

    public Task<RegisterCompany?> GetByOrgnrAsync(string orgnr, CancellationToken ct = default);

    /// <summary>The full kommune register (number → display name) — every kommune, not just
    /// the ones Hugin is configured to track.</summary>
    public Task<IReadOnlyList<Models.Kommune>> GetKommunerAsync(CancellationToken ct = default);
}

public interface INavFeedClient
{
    /// <summary>A null cursor lands at the newest page — the normal daily entry point.
    /// <paramref name="config"/> carries this run's keywords/categories (read fresh per sync);
    /// <paramref name="scope"/> resolves each ad's municipality name and gates it.</summary>
    public Task<FeedPage> GetPageAsync(string? cursor, HuginConfig config, MunicipalityScope scope, CancellationToken ct = default);

    /// <summary>The feed's oldest page — the entry point for a full backfill.</summary>
    public Task<FeedPage> GetFirstPageAsync(HuginConfig config, MunicipalityScope scope, CancellationToken ct = default);
}

/// <summary><paramref name="ResolvedUrl"/> is the variant (https or http) that actually
/// answered; null when neither did.</summary>
public sealed record WebsiteProbeResult(bool Ok, string? ResolvedUrl);

/// <summary>
/// Checks whether a company's register-listed website is actually reachable. Brreg's
/// `hjemmeside` field is stale for a meaningful slice of companies (dead domains, or
/// https-prefixed at ingest when the site only serves http) — this is what tells the
/// dashboard which links are worth rendering.
/// </summary>
public interface IWebsiteProber
{
    /// <summary>Never throws — any failure (timeout, DNS, non-2xx/3xx) is reported as
    /// <c>Ok: false</c>, never an exception.</summary>
    public Task<WebsiteProbeResult> ProbeAsync(string url, CancellationToken ct = default);
}
