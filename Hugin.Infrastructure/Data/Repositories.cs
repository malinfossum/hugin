using Hugin.Core.Abstractions;
using Hugin.Core.Models;
using Microsoft.EntityFrameworkCore;

namespace Hugin.Infrastructure.Data;

public sealed class EfCompanyRepository(HuginDbContext db) : ICompanyRepository
{
    public async Task<Company?> GetAsync(string orgnr, CancellationToken ct = default) =>
        await db.Companies.FindAsync([orgnr], ct);

    public async Task<IReadOnlyList<Company>> GetAllAsync(string? municipalityNumber = null, CancellationToken ct = default) =>
        await db.Companies
            .Where(c => municipalityNumber == null || c.MunicipalityNumber == municipalityNumber)
            .OrderBy(c => c.Name)
            .ToListAsync(ct);

    public async Task<IReadOnlyList<Company>> GetFirstSeenAfterAsync(DateTimeOffset after, CancellationToken ct = default) =>
        await db.Companies.Where(c => c.FirstSeen > after).OrderBy(c => c.Name).ToListAsync(ct);

    public async Task UpsertAsync(RegisterCompany company, DateTimeOffset seenAt, CancellationToken ct = default)
    {
        var existing = await db.Companies.FindAsync([company.Orgnr], ct);

        if (existing is null)
        {
            db.Companies.Add(new Company
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
            });
        }
        else
        {
            // FirstSeen is never touched again — it is what "new" is measured against.
            existing.Name = company.Name;
            existing.MunicipalityNumber = company.MunicipalityNumber;
            existing.NaceCode = company.NaceCode;
            existing.ParentOrgnr = company.ParentOrgnr;
            existing.IsBranch = company.IsBranch;
            existing.Website = company.Website;
            existing.LastSeenInRegister = seenAt;
        }

        await db.SaveChangesAsync(ct);
    }
}

public sealed class EfAdRepository(HuginDbContext db) : IAdRepository
{
    public async Task<IReadOnlyList<Ad>> GetFirstSeenAfterAsync(DateTimeOffset after, CancellationToken ct = default) =>
        await db.Ads.Where(a => a.FirstSeen > after).OrderByDescending(a => a.Published).ToListAsync(ct);

    public async Task UpsertAsync(FeedAd ad, DateTimeOffset seenAt, CancellationToken ct = default)
    {
        var existing = await db.Ads.FindAsync([ad.FeedId], ct);

        if (existing is null)
        {
            db.Ads.Add(new Ad
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
            });
        }
        else
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

        await db.SaveChangesAsync(ct);
    }

    public async Task<IReadOnlyList<Ad>> GetActiveAsync(string? municipalityNumber = null,
        bool includeHidden = false, CancellationToken ct = default) =>
        await db.Ads
            .Where(a => a.IsActive
                && (municipalityNumber == null || a.MunicipalityNumber == municipalityNumber)
                && (includeHidden || !a.Hidden))
            .OrderByDescending(a => a.Published)
            .ToListAsync(ct);

    public async Task<bool> SetHiddenAsync(string feedId, bool hidden, CancellationToken ct = default)
    {
        if (await db.Ads.FindAsync([feedId], ct) is not { } ad) return false;
        ad.Hidden = hidden;
        await db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<int> DeactivateExpiredAsync(DateTimeOffset now, CancellationToken ct = default)
    {
        // Expiry is a local fallback: an ad past its date is stale even if the feed has not said so.
        var stale = await db.Ads
            .Where(a => a.IsActive && a.Expires != null && a.Expires < now)
            .ToListAsync(ct);

        foreach (var ad in stale) ad.IsActive = false;

        await db.SaveChangesAsync(ct);
        return stale.Count;
    }

    public async Task<IReadOnlyList<Ad>> GetByEmployerAsync(string orgnr, CancellationToken ct = default) =>
        await db.Ads.Where(a => a.EmployerOrgnr == orgnr)
            .OrderByDescending(a => a.Published).ToListAsync(ct);
}

public sealed class EfPipelineRepository(HuginDbContext db) : IPipelineRepository
{
    public async Task<PipelineEntry?> GetByOrgnrAsync(string orgnr, CancellationToken ct = default) =>
        await db.Pipeline.FirstOrDefaultAsync(p => p.Orgnr == orgnr, ct);

    public async Task<IReadOnlyList<PipelineEntry>> GetAllAsync(PipelineStatus? status = null, CancellationToken ct = default) =>
        await db.Pipeline
            .Where(p => status == null || p.Status == status)
            .OrderByDescending(p => p.Updated)
            .ToListAsync(ct);

    public async Task<IReadOnlyList<PipelineEntry>> GetUpdatedAfterAsync(DateTimeOffset after, CancellationToken ct = default) =>
        await db.Pipeline.Where(p => p.Updated >= after).OrderBy(p => p.Updated).ToListAsync(ct);

    public async Task UpsertAsync(PipelineEntry entry, CancellationToken ct = default)
    {
        var existing = await db.Pipeline.FirstOrDefaultAsync(p => p.Orgnr == entry.Orgnr, ct);

        if (existing is null)
        {
            db.Pipeline.Add(entry);
        }
        else
        {
            // Created belongs to the first sighting; everything else is the current state.
            existing.Status = entry.Status;
            existing.Route = entry.Route;
            existing.Why = entry.Why;
            existing.Note = entry.Note;
            existing.SvarText = entry.SvarText;
            existing.Updated = entry.Updated;
        }

        await db.SaveChangesAsync(ct);
    }
}

public sealed class EfSyncStateRepository(HuginDbContext db) : ISyncStateRepository
{
    public async Task<SyncState?> GetAsync(string source, CancellationToken ct = default) =>
        await db.SyncStates.FindAsync([source], ct);

    public async Task SetAsync(string source, string? cursor, DateTimeOffset lastSyncUtc, CancellationToken ct = default)
    {
        var existing = await db.SyncStates.FindAsync([source], ct);

        if (existing is null)
            db.SyncStates.Add(new SyncState { Source = source, Cursor = cursor, LastSyncUtc = lastSyncUtc });
        else
        {
            existing.Cursor = cursor;
            existing.LastSyncUtc = lastSyncUtc;
        }

        await db.SaveChangesAsync(ct);
    }
}

public sealed class EfReviewMarkRepository(HuginDbContext db) : IReviewMarkRepository
{
    private const int SingletonId = 1;

    public async Task<DateTimeOffset?> GetAsync(CancellationToken ct = default) =>
        (await db.ReviewMarks.FindAsync([SingletonId], ct))?.LastReviewedUtc;

    public async Task SetAsync(DateTimeOffset mark, CancellationToken ct = default)
    {
        var existing = await db.ReviewMarks.FindAsync([SingletonId], ct);

        if (existing is null)
            db.ReviewMarks.Add(new ReviewMarkRow { Id = SingletonId, LastReviewedUtc = mark });
        else
            existing.LastReviewedUtc = mark;

        await db.SaveChangesAsync(ct);
    }
}
