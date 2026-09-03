namespace Hugin.Core.Abstractions;

public interface ICompanyRepository
{
    public Task<Models.Company?> GetAsync(string orgnr, CancellationToken ct = default);

    public Task<IReadOnlyList<Models.Company>> GetAllAsync(string? municipalityNumber = null, CancellationToken ct = default);

    /// <summary>Branch units of one hovedenhet (<c>IsBranch &amp;&amp; ParentOrgnr == orgnr</c>),
    /// ordered by municipality number then name — kommune-name ordering is a display-layer concern
    /// (the endpoint resolves that name the same way it does for every other company).</summary>
    public Task<IReadOnlyList<Models.Company>> GetBranchesAsync(string orgnr, CancellationToken ct = default);

    public Task<IReadOnlyList<Models.Company>> GetFirstSeenAfterAsync(DateTimeOffset after, CancellationToken ct = default);

    /// <summary>New row → FirstSeen = seenAt; always → LastSeenInRegister = seenAt plus a field refresh.
    /// The incoming website only overwrites the stored one when it is non-null: a different
    /// non-null value wins and clears the website check fields (re-check next sync), an equal
    /// one leaves them untouched, and the register offering no website at all is not a
    /// correction — the stored website (register-sourced or ad-adopted) and its check state
    /// are left exactly as they were.</summary>
    public Task UpsertAsync(RegisterCompany company, DateTimeOffset seenAt, CancellationToken ct = default);

    /// <summary>Companies with a website that has never been checked, or whose last check is
    /// older than <paramref name="olderThan"/> — oldest-checked first (never-checked first),
    /// capped at <paramref name="take"/>.</summary>
    public Task<IReadOnlyList<Models.Company>> GetWebsitesDueForCheckAsync(DateTimeOffset olderThan, int take,
        CancellationToken ct = default);

    /// <summary>Records the result of a website probe for one company.</summary>
    public Task SetWebsiteCheckAsync(string orgnr, bool ok, string? resolvedUrl, DateTimeOffset checkedUtc,
        CancellationToken ct = default);

    /// <summary>Adopts a website sourced from a NAV ad — only when the company has no website,
    /// or its register-listed one is confirmed dead (<see cref="Models.Company.WebsiteOk"/> is
    /// false). A healthy or not-yet-checked register website always outranks an ad's claim.
    /// Resets the check trio so the weekly checker probes the adopted URL. Returns whether it
    /// adopted.</summary>
    public Task<bool> AdoptWebsiteAsync(string orgnr, string website, CancellationToken ct = default);
}

public interface IAdRepository
{
    public Task<IReadOnlyList<Models.Ad>> GetFirstSeenAfterAsync(DateTimeOffset after, CancellationToken ct = default);

    /// <summary>New row → FirstSeen = seenAt; IsActive is taken from the <see cref="FeedAd"/>.</summary>
    public Task UpsertAsync(FeedAd ad, DateTimeOffset seenAt, CancellationToken ct = default);

    /// <summary>Expires &lt; now → IsActive = false. Returns the number of ads flipped.</summary>
    public Task<int> DeactivateExpiredAsync(DateTimeOffset now, CancellationToken ct = default);

    /// <summary>
    /// Ads open at <paramref name="now"/> (see <see cref="Models.Ad.IsOpenAt"/>), newest first,
    /// optionally narrowed to one municipality.
    /// </summary>
    public Task<IReadOnlyList<Models.Ad>> GetActiveAsync(DateTimeOffset now, string? municipalityNumber = null,
        bool includeHidden = false, CancellationToken ct = default);

    /// <summary>Dashboard dismiss flag. Returns false when the feedId is unknown.</summary>
    public Task<bool> SetHiddenAsync(string feedId, bool hidden, CancellationToken ct = default);

    /// <summary>Manual pipeline link (null clears it). Returns false when the feedId is unknown.</summary>
    public Task<bool> SetLinkedOrgnrAsync(string feedId, string? orgnr, CancellationToken ct = default);

    /// <summary>All stored ads for one employer — active and expired — newest published first.</summary>
    public Task<IReadOnlyList<Models.Ad>> GetByEmployerAsync(string orgnr, CancellationToken ct = default);

    /// <summary>Every stored ad — open, expired and hidden alike. No ordering promised.</summary>
    public Task<IReadOnlyList<Models.Ad>> GetAllAsync(CancellationToken ct = default);
}

public interface IPipelineRepository
{
    public Task<Models.PipelineEntry?> GetByOrgnrAsync(string orgnr, CancellationToken ct = default);

    public Task<IReadOnlyList<Models.PipelineEntry>> GetAllAsync(Models.PipelineStatus? status = null, CancellationToken ct = default);

    public Task<IReadOnlyList<Models.PipelineEntry>> GetUpdatedAfterAsync(DateTimeOffset after, CancellationToken ct = default);

    public Task UpsertAsync(Models.PipelineEntry entry, CancellationToken ct = default);
}

public interface ISyncStateRepository
{
    public Task<Models.SyncState?> GetAsync(string source, CancellationToken ct = default);

    public Task SetAsync(string source, string? cursor, DateTimeOffset lastSyncUtc, CancellationToken ct = default);
}

public interface IReviewMarkRepository
{
    /// <summary>null = no sync has ever completed.</summary>
    public Task<DateTimeOffset?> GetAsync(CancellationToken ct = default);

    public Task SetAsync(DateTimeOffset mark, CancellationToken ct = default);
}

/// <summary>Brreg's kommune register — number → name, covering every kommune, not just the
/// configured ones.</summary>
public interface IKommuneRepository
{
    public Task<IReadOnlyDictionary<string, string>> GetAllAsync(CancellationToken ct = default);

    public Task UpsertManyAsync(IReadOnlyList<Models.Kommune> kommuner, CancellationToken ct = default);
}

/// <summary>Dashboard header links — db-backed since v3.2 (was config-only). Position is
/// 1-based and dense; every write that changes the set keeps it that way.</summary>
public interface ISourceRepository
{
    Task<IReadOnlyList<Models.Source>> GetAllAsync(CancellationToken ct);       // ordered by Position

    Task<Models.Source?> GetAsync(int id, CancellationToken ct);

    Task<Models.Source> AddAsync(string label, string url, CancellationToken ct); // Position = max+1

    Task<bool> UpdateAsync(int id, string label, string url, CancellationToken ct);

    Task<bool> DeleteAsync(int id, CancellationToken ct);

    Task<bool> ReorderAsync(IReadOnlyList<int> orderedIds, CancellationToken ct); // false if id set mismatch
}
