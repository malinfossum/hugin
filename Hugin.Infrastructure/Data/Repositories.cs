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

    public async Task<IReadOnlyList<Company>> GetBranchesAsync(string orgnr, CancellationToken ct = default) =>
        await db.Companies
            .Where(c => c.IsBranch && c.ParentOrgnr == orgnr)
            .OrderBy(c => c.MunicipalityNumber)
            .ThenBy(c => c.Name)
            .ToListAsync(ct);

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

            // The register offering no website must not erase one adopted from an ad
            // (v3.1 item 24) — absence is not a correction, a different value is.
            if (company.Website is not null)
            {
                // A website check is only meaningful for the URL it was run against — a
                // changed website invalidates it, so it must be re-checked on the next sync.
                if (existing.Website != company.Website)
                {
                    existing.WebsiteOk = null;
                    existing.WebsiteResolved = null;
                    existing.WebsiteCheckedUtc = null;
                }

                existing.Website = company.Website;
            }

            existing.LastSeenInRegister = seenAt;
        }

        await db.SaveChangesAsync(ct);
    }

    public async Task<IReadOnlyList<Company>> GetWebsitesDueForCheckAsync(DateTimeOffset olderThan, int take,
        CancellationToken ct = default) =>
        await db.Companies
            .Where(c => c.Website != null && (c.WebsiteCheckedUtc == null || c.WebsiteCheckedUtc < olderThan))
            .OrderBy(c => c.WebsiteCheckedUtc == null ? 0 : 1)
            .ThenBy(c => c.WebsiteCheckedUtc)
            .Take(take)
            .ToListAsync(ct);

    public async Task SetWebsiteCheckAsync(string orgnr, bool ok, string? resolvedUrl, DateTimeOffset checkedUtc,
        CancellationToken ct = default)
    {
        if (await db.Companies.FindAsync([orgnr], ct) is not { } company) return;

        company.WebsiteOk = ok;
        company.WebsiteResolved = resolvedUrl;
        company.WebsiteCheckedUtc = checkedUtc;

        await db.SaveChangesAsync(ct);
    }

    public async Task<bool> AdoptWebsiteAsync(string orgnr, string website, CancellationToken ct = default)
    {
        if (await db.Companies.FindAsync([orgnr], ct) is not { } company) return false;
        // Only fill a gap or replace a confirmed-dead register link — a healthy register
        // website always outranks what an ad happens to claim.
        if (company.Website is not null && company.WebsiteOk != false) return false;

        company.Website = website;
        company.WebsiteOk = null;
        company.WebsiteResolved = null;
        company.WebsiteCheckedUtc = null;
        await db.SaveChangesAsync(ct);
        return true;
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
            // Feed-owned fields. The enrichment-only ones (orgnr, dates, link, category) are
            // null in the stub NAV sends once an ad is closed — keep what an earlier enrichment
            // stored, or the ad loses its employer link and vanishes from company history and
            // the Expired section. Hugin-owned fields (Hidden) are never touched here.
            existing.Title = ad.Title;
            existing.EmployerName = ad.EmployerName ?? existing.EmployerName;
            existing.EmployerOrgnr = ad.EmployerOrgnr ?? existing.EmployerOrgnr;
            existing.MunicipalityNumber = ad.MunicipalityNumber;
            existing.Published = ad.Published ?? existing.Published;
            existing.Expires = ad.Expires ?? existing.Expires;
            existing.SourceUrl = ad.SourceUrl ?? existing.SourceUrl;
            existing.Category = ad.Category ?? existing.Category;
            existing.IsActive = ad.IsActive;
        }

        await db.SaveChangesAsync(ct);
    }

    public async Task<IReadOnlyList<Ad>> GetActiveAsync(DateTimeOffset now, string? municipalityNumber = null,
        bool includeHidden = false, CancellationToken ct = default) =>
        await db.Ads
            // SQL twin of Ad.IsOpenAt — EF cannot translate the method itself.
            .Where(a => a.IsActive && (a.Expires == null || a.Expires >= now)
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

    public async Task<IReadOnlyList<Ad>> GetAllAsync(CancellationToken ct = default) =>
        await db.Ads.ToListAsync(ct);
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
            existing.Starred = entry.Starred;
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

public sealed class EfKommuneRepository(HuginDbContext db) : IKommuneRepository
{
    public async Task<IReadOnlyDictionary<string, string>> GetAllAsync(CancellationToken ct = default) =>
        await db.Kommuner.ToDictionaryAsync(k => k.Number, k => k.Name, ct);

    public async Task UpsertManyAsync(IReadOnlyList<Kommune> kommuner, CancellationToken ct = default)
    {
        foreach (var kommune in kommuner)
        {
            var existing = await db.Kommuner.FindAsync([kommune.Number], ct);

            if (existing is null)
                db.Kommuner.Add(new Kommune { Number = kommune.Number, Name = kommune.Name });
            else
                existing.Name = kommune.Name;
        }

        await db.SaveChangesAsync(ct);
    }
}

public sealed class EfSourceRepository(HuginDbContext db) : ISourceRepository
{
    public async Task<IReadOnlyList<Source>> GetAllAsync(CancellationToken ct) =>
        await db.Sources.OrderBy(s => s.Position).ToListAsync(ct);

    public async Task<Source?> GetAsync(int id, CancellationToken ct) =>
        await db.Sources.FindAsync([id], ct);

    public async Task<Source> AddAsync(string label, string url, CancellationToken ct)
    {
        var maxPosition = await db.Sources.Select(s => (int?)s.Position).MaxAsync(ct) ?? 0;
        var source = new Source { Label = label, Url = url, Position = maxPosition + 1 };
        db.Sources.Add(source);
        await db.SaveChangesAsync(ct);
        return source;
    }

    public async Task<bool> UpdateAsync(int id, string label, string url, CancellationToken ct)
    {
        if (await db.Sources.FindAsync([id], ct) is not { } source) return false;

        source.Label = label;
        source.Url = url;
        await db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<bool> DeleteAsync(int id, CancellationToken ct)
    {
        if (await db.Sources.FindAsync([id], ct) is not { } source) return false;

        db.Sources.Remove(source);

        // ISourceRepository documents Position as 1-based and dense after every write that
        // changes the set — a delete must close the gap it would otherwise leave, not just
        // shrink the set, or a downstream consumer inferring position from list index would
        // silently desync from the stored value.
        var remaining = await db.Sources.Where(s => s.Id != id).OrderBy(s => s.Position).ToListAsync(ct);
        for (var i = 0; i < remaining.Count; i++)
            remaining[i].Position = i + 1;

        await db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<bool> ReorderAsync(IReadOnlyList<int> orderedIds, CancellationToken ct)
    {
        var sources = await db.Sources.ToListAsync(ct);

        // Every existing id must appear exactly once — a mismatch (missing or extra) leaves
        // positions untouched rather than silently dropping or orphaning a source.
        if (sources.Count != orderedIds.Count || !sources.Select(s => s.Id).ToHashSet().SetEquals(orderedIds))
            return false;

        for (var i = 0; i < orderedIds.Count; i++)
            sources.First(s => s.Id == orderedIds[i]).Position = i + 1;

        await db.SaveChangesAsync(ct);
        return true;
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
