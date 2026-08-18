namespace Hugin.Core.Abstractions;

/// <summary>A company as the register returns it — before it becomes a stored <see cref="Models.Company"/>.</summary>
public sealed record RegisterCompany(string Orgnr, string Name, string? MunicipalityNumber,
    string? NaceCode, string? ParentOrgnr, bool IsBranch, string? Website);

/// <summary>An ad as the feed returns it — before it becomes a stored <see cref="Models.Ad"/>.</summary>
public sealed record FeedAd(string FeedId, string Title, string? EmployerName, string? EmployerOrgnr,
    string? MunicipalityNumber, DateTimeOffset? Published, DateTimeOffset? Expires, string? SourceUrl, bool IsActive);

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
}

public interface INavFeedClient
{
    public Task<FeedPage> GetPageAsync(string? cursor, CancellationToken ct = default);
}
