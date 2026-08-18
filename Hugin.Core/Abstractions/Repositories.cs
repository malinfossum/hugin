namespace Hugin.Core.Abstractions;

public interface ICompanyRepository
{
    public Task<Models.Company?> GetAsync(string orgnr, CancellationToken ct = default);

    public Task<IReadOnlyList<Models.Company>> GetAllAsync(string? municipalityNumber = null, CancellationToken ct = default);

    public Task<IReadOnlyList<Models.Company>> GetFirstSeenAfterAsync(DateTimeOffset after, CancellationToken ct = default);

    /// <summary>New row → FirstSeen = seenAt; always → LastSeenInRegister = seenAt plus a field refresh.</summary>
    public Task UpsertAsync(RegisterCompany company, DateTimeOffset seenAt, CancellationToken ct = default);
}

public interface IAdRepository
{
    public Task<IReadOnlyList<Models.Ad>> GetFirstSeenAfterAsync(DateTimeOffset after, CancellationToken ct = default);

    /// <summary>New row → FirstSeen = seenAt; IsActive is taken from the <see cref="FeedAd"/>.</summary>
    public Task UpsertAsync(FeedAd ad, DateTimeOffset seenAt, CancellationToken ct = default);

    /// <summary>Expires &lt; now → IsActive = false. Returns the number of ads flipped.</summary>
    public Task<int> DeactivateExpiredAsync(DateTimeOffset now, CancellationToken ct = default);
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
