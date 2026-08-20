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
    public List<Kommune> Kommuner { get; init; } = [];
    public bool Throws { get; set; }

    /// <summary>Makes only GetByOrgnrAsync fail, leaving GetCompaniesAsync (discovery) alone —
    /// for tests isolating employer-enrichment failure from discovery failure.</summary>
    public bool ThrowsOnGetByOrgnr { get; set; }

    /// <summary>Makes only GetKommunerAsync fail — for tests isolating the kommune-register
    /// fetch from discovery failure.</summary>
    public bool ThrowsOnGetKommuner { get; set; }

    /// <summary>Every orgnr GetByOrgnrAsync was actually called with, in call order.</summary>
    public List<string> ByOrgnrRequests { get; } = [];

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
        ByOrgnrRequests.Add(orgnr);
        if (OnCall is not null) await OnCall();
        if (Throws || ThrowsOnGetByOrgnr) throw new HttpRequestException("brreg utilgjengelig");
        return ByOrgnr.GetValueOrDefault(orgnr);
    }

    public async Task<IReadOnlyList<Kommune>> GetKommunerAsync(CancellationToken ct = default)
    {
        if (OnCall is not null) await OnCall();
        if (Throws || ThrowsOnGetKommuner) throw new HttpRequestException("brreg utilgjengelig");
        return Kommuner;
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
    public bool ThrowOnGetWebsitesDueForCheck { get; set; }

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

            if (existing.Website != company.Website)
            {
                existing.WebsiteOk = null;
                existing.WebsiteResolved = null;
                existing.WebsiteCheckedUtc = null;
            }

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

    public Task<IReadOnlyList<Company>> GetWebsitesDueForCheckAsync(DateTimeOffset olderThan, int take,
        CancellationToken ct = default)
    {
        if (ThrowOnGetWebsitesDueForCheck) throw new InvalidOperationException("databasen er utilgjengelig");

        return Task.FromResult<IReadOnlyList<Company>>(Store.Values
            .Where(c => c.Website != null && (c.WebsiteCheckedUtc == null || c.WebsiteCheckedUtc < olderThan))
            .OrderBy(c => c.WebsiteCheckedUtc == null ? 0 : 1)
            .ThenBy(c => c.WebsiteCheckedUtc)
            .Take(take)
            .ToList());
    }

    public Task SetWebsiteCheckAsync(string orgnr, bool ok, string? resolvedUrl, DateTimeOffset checkedUtc,
        CancellationToken ct = default)
    {
        if (Store.TryGetValue(orgnr, out var company))
        {
            company.WebsiteOk = ok;
            company.WebsiteResolved = resolvedUrl;
            company.WebsiteCheckedUtc = checkedUtc;
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

    public Task<IReadOnlyList<Ad>> GetByEmployerAsync(string orgnr, CancellationToken ct = default) =>
        Task.FromResult<IReadOnlyList<Ad>>(Store.Values
            .Where(a => a.EmployerOrgnr == orgnr)
            .OrderByDescending(a => a.Published)
            .ToList());
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

public sealed class FakeWebsiteProber : IWebsiteProber
{
    public Dictionary<string, WebsiteProbeResult> Results { get; } = [];
    public WebsiteProbeResult Default { get; set; } = new(true, null);

    /// <summary>Every url ProbeAsync was actually called with, in call order.</summary>
    public List<string> Requests { get; } = [];

    public int MaxConcurrent { get; private set; }
    private int _current;
    private readonly object _gate = new();

    /// <summary>Awaited before every call returns — lets a test hold several probes open at
    /// once, to observe how many run concurrently.</summary>
    public Func<Task>? OnCall { get; set; }

    public async Task<WebsiteProbeResult> ProbeAsync(string url, CancellationToken ct = default)
    {
        lock (_gate)
        {
            Requests.Add(url);
            _current++;
            if (_current > MaxConcurrent) MaxConcurrent = _current;
        }

        if (OnCall is not null) await OnCall();

        lock (_gate) { _current--; }

        return Results.GetValueOrDefault(url, Default);
    }
}

internal sealed class FakeKommuneRepository : IKommuneRepository
{
    public Dictionary<string, string> Store { get; } = [];

    public Task<IReadOnlyDictionary<string, string>> GetAllAsync(CancellationToken ct = default) =>
        Task.FromResult<IReadOnlyDictionary<string, string>>(Store);

    public Task UpsertManyAsync(IReadOnlyList<Kommune> kommuner, CancellationToken ct = default)
    {
        foreach (var kommune in kommuner) Store[kommune.Number] = kommune.Name;
        return Task.CompletedTask;
    }
}
