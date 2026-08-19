using Hugin.Core.Abstractions;
using Hugin.Core.Models;

namespace Hugin.Tests;

/// <summary>In-memory stand-ins for every Task 5 interface — no network, no database.</summary>
internal sealed class FakeClock(DateTimeOffset now) : IClock
{
    public DateTimeOffset UtcNow { get; set; } = now;
}

public sealed class FakeBrregClient : IBrregClient
{
    public List<RegisterCompany> Companies { get; init; } = [];
    public Dictionary<string, RegisterCompany> ByOrgnr { get; init; } = [];
    public bool Throws { get; set; }

    /// <summary>Awaited before every call returns — lets a test hold a request open.</summary>
    public Func<Task>? OnCall { get; set; }

    public async Task<IReadOnlyList<RegisterCompany>> GetCompaniesAsync(IEnumerable<string> naceCodes,
        IEnumerable<string> municipalityNumbers, CancellationToken ct = default)
    {
        if (OnCall is not null) await OnCall();
        if (Throws) throw new HttpRequestException("brreg utilgjengelig");
        return Companies;
    }

    public async Task<RegisterCompany?> GetByOrgnrAsync(string orgnr, CancellationToken ct = default)
    {
        if (OnCall is not null) await OnCall();
        if (Throws) throw new HttpRequestException("brreg utilgjengelig");
        return ByOrgnr.GetValueOrDefault(orgnr);
    }
}

public sealed class FakeNavFeedClient(params FeedPage[] pages) : INavFeedClient
{
    private readonly Queue<FeedPage> _pages = new(pages);

    public List<string?> RequestedCursors { get; } = [];
    public bool FirstPageRequested { get; private set; }
    public bool Throws { get; set; }

    /// <summary>Awaited before every call returns — lets a test hold a sync open.</summary>
    public Func<Task>? OnCall { get; set; }

    public Task<FeedPage> GetPageAsync(string? cursor, CancellationToken ct = default)
    {
        RequestedCursors.Add(cursor);
        return NextPage();
    }

    public Task<FeedPage> GetFirstPageAsync(CancellationToken ct = default)
    {
        FirstPageRequested = true;
        return NextPage();
    }

    private async Task<FeedPage> NextPage()
    {
        if (OnCall is not null) await OnCall();
        if (Throws) throw new HttpRequestException("nav utilgjengelig");
        return _pages.Count > 0 ? _pages.Dequeue() : new FeedPage([], null);
    }
}

internal sealed class FakeCompanyRepository : ICompanyRepository
{
    public Dictionary<string, Company> Store { get; } = [];

    public Task<Company?> GetAsync(string orgnr, CancellationToken ct = default) =>
        Task.FromResult(Store.GetValueOrDefault(orgnr));

    public Task<IReadOnlyList<Company>> GetAllAsync(string? municipalityNumber = null, CancellationToken ct = default) =>
        Task.FromResult<IReadOnlyList<Company>>(Store.Values
            .Where(c => municipalityNumber is null || c.MunicipalityNumber == municipalityNumber)
            .OrderBy(c => c.Name)
            .ToList());

    public Task<IReadOnlyList<Company>> GetFirstSeenAfterAsync(DateTimeOffset after, CancellationToken ct = default) =>
        Task.FromResult<IReadOnlyList<Company>>(Store.Values.Where(c => c.FirstSeen > after).ToList());

    public Task UpsertAsync(RegisterCompany company, DateTimeOffset seenAt, CancellationToken ct = default)
    {
        if (Store.TryGetValue(company.Orgnr, out var existing))
        {
            existing.Name = company.Name;
            existing.MunicipalityNumber = company.MunicipalityNumber;
            existing.NaceCode = company.NaceCode;
            existing.ParentOrgnr = company.ParentOrgnr;
            existing.IsBranch = company.IsBranch;
            existing.Website = company.Website;
            existing.LastSeenInRegister = seenAt;
        }
        else
        {
            Store[company.Orgnr] = new Company
            {
                Orgnr = company.Orgnr,
                Name = company.Name,
                MunicipalityNumber = company.MunicipalityNumber,
                NaceCode = company.NaceCode,
                ParentOrgnr = company.ParentOrgnr,
                IsBranch = company.IsBranch,
                Website = company.Website,
                FirstSeen = seenAt,
                LastSeenInRegister = seenAt,
            };
        }

        return Task.CompletedTask;
    }
}

internal sealed class FakeAdRepository : IAdRepository
{
    public Dictionary<string, Ad> Store { get; } = [];
    public bool ThrowOnUpsert { get; set; }

    public Task<IReadOnlyList<Ad>> GetFirstSeenAfterAsync(DateTimeOffset after, CancellationToken ct = default) =>
        Task.FromResult<IReadOnlyList<Ad>>(Store.Values.Where(a => a.FirstSeen > after).ToList());

    public Task UpsertAsync(FeedAd ad, DateTimeOffset seenAt, CancellationToken ct = default)
    {
        if (ThrowOnUpsert) throw new InvalidOperationException("disken er full");

        if (Store.TryGetValue(ad.FeedId, out var existing))
        {
            existing.Title = ad.Title;
            existing.EmployerName = ad.EmployerName;
            existing.EmployerOrgnr = ad.EmployerOrgnr;
            existing.MunicipalityNumber = ad.MunicipalityNumber;
            existing.Published = ad.Published;
            existing.Expires = ad.Expires;
            existing.SourceUrl = ad.SourceUrl;
            existing.Category = ad.Category;
            existing.IsActive = ad.IsActive;
        }
        else
        {
            Store[ad.FeedId] = new Ad
            {
                FeedId = ad.FeedId,
                Title = ad.Title,
                EmployerName = ad.EmployerName,
                EmployerOrgnr = ad.EmployerOrgnr,
                MunicipalityNumber = ad.MunicipalityNumber,
                Published = ad.Published,
                Expires = ad.Expires,
                SourceUrl = ad.SourceUrl,
                Category = ad.Category,
                FirstSeen = seenAt,
                IsActive = ad.IsActive,
            };
        }

        return Task.CompletedTask;
    }

    public Task<IReadOnlyList<Ad>> GetActiveAsync(string? municipalityNumber = null,
        bool includeHidden = false, CancellationToken ct = default) =>
        Task.FromResult<IReadOnlyList<Ad>>(Store.Values
            .Where(a => a.IsActive
                && (municipalityNumber is null || a.MunicipalityNumber == municipalityNumber)
                && (includeHidden || !a.Hidden))
            .ToList());

    public Task<bool> SetHiddenAsync(string feedId, bool hidden, CancellationToken ct = default)
    {
        if (!Store.TryGetValue(feedId, out var ad)) return Task.FromResult(false);
        ad.Hidden = hidden;
        return Task.FromResult(true);
    }

    public Task<int> DeactivateExpiredAsync(DateTimeOffset now, CancellationToken ct = default)
    {
        var stale = Store.Values.Where(a => a.IsActive && a.Expires is not null && a.Expires < now).ToList();
        foreach (var ad in stale) ad.IsActive = false;
        return Task.FromResult(stale.Count);
    }
}

internal sealed class FakePipelineRepository : IPipelineRepository
{
    public List<PipelineEntry> Store { get; } = [];

    public Task<PipelineEntry?> GetByOrgnrAsync(string orgnr, CancellationToken ct = default) =>
        Task.FromResult(Store.FirstOrDefault(p => p.Orgnr == orgnr));

    public Task<IReadOnlyList<PipelineEntry>> GetAllAsync(PipelineStatus? status = null, CancellationToken ct = default) =>
        Task.FromResult<IReadOnlyList<PipelineEntry>>(
            Store.Where(p => status is null || p.Status == status).ToList());

    public Task<IReadOnlyList<PipelineEntry>> GetUpdatedAfterAsync(DateTimeOffset after, CancellationToken ct = default) =>
        Task.FromResult<IReadOnlyList<PipelineEntry>>(Store.Where(p => p.Updated >= after).ToList());

    public Task UpsertAsync(PipelineEntry entry, CancellationToken ct = default)
    {
        var existing = Store.FirstOrDefault(p => p.Orgnr == entry.Orgnr);

        if (existing is null)
        {
            Store.Add(entry);
        }
        else
        {
            existing.Status = entry.Status;
            existing.Route = entry.Route;
            existing.Why = entry.Why;
            existing.Note = entry.Note;
            existing.SvarText = entry.SvarText;
            existing.Updated = entry.Updated;
        }

        return Task.CompletedTask;
    }
}

internal sealed class FakeSyncStateRepository : ISyncStateRepository
{
    public Dictionary<string, SyncState> Store { get; } = [];

    public Task<SyncState?> GetAsync(string source, CancellationToken ct = default) =>
        Task.FromResult(Store.GetValueOrDefault(source));

    public Task SetAsync(string source, string? cursor, DateTimeOffset lastSyncUtc, CancellationToken ct = default)
    {
        Store[source] = new SyncState { Source = source, Cursor = cursor, LastSyncUtc = lastSyncUtc };
        return Task.CompletedTask;
    }
}

internal sealed class FakeReviewMarkRepository : IReviewMarkRepository
{
    public DateTimeOffset? Mark { get; set; }

    public Task<DateTimeOffset?> GetAsync(CancellationToken ct = default) => Task.FromResult(Mark);

    public Task SetAsync(DateTimeOffset mark, CancellationToken ct = default)
    {
        Mark = mark;
        return Task.CompletedTask;
    }
}
