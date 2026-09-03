using Hugin.Core.Abstractions;
using Hugin.Core.Models;

namespace Hugin.Core.Services;

public sealed record AdOverview(string FeedId, string Title, string? EmployerName, string? EmployerOrgnr,
    string? MunicipalityNumber, DateTimeOffset? Expires, int? DaysLeft, string? Category,
    string? SourceUrl, PipelineStatus? PipelineStatus, bool Hidden, DateTimeOffset? Published);

/// <summary>
/// One pipeline entry with the ads it is linked to summarised: <see cref="AdsExpired"/> is true
/// when the entry has ads and none of them is still open. Derived on every read, never stored —
/// a fresh ad from the same employer brings the entry back by itself.
/// </summary>
public sealed record PipelineOverview(PipelineEntry Entry, bool AdsExpired);

/// <summary>
/// The dashboard's deadline view: active ads with the outreach pipeline joined in, soonest
/// frist first. Ads without a frist sort last — a missing deadline is not an urgent one.
/// </summary>
/// <remarks>
/// NAV sometimes reports a different registry unit than the one actually tracked (real case:
/// an ad carried orgnr 972483672 while the company was tracked under 925836613, whose
/// <see cref="Company.ParentOrgnr"/> chain leads to 972483672). Exact orgnr match is tried
/// first; when it misses, both the ad's orgnr and every pipeline entry's orgnr are resolved
/// to their registry root (following ParentOrgnr, max 4 hops) and matched on that root instead.
/// </remarks>
public sealed class AdOverviewService(IAdRepository ads, IPipelineRepository pipeline, IClock clock,
    ICompanyRepository companies)
{
    private const int MaxRootHops = 4;

    public async Task<IReadOnlyList<AdOverview>> GetAsync(string? municipalityNumber = null,
        bool includeHidden = false, CancellationToken ct = default)
    {
        var now = clock.UtcNow;
        var today = now.UtcDateTime.Date;
        var active = await ads.GetActiveAsync(now, municipalityNumber, includeHidden, ct);
        var index = await IndexAsync(await pipeline.GetAllAsync(ct: ct), ct);

        var results = new List<AdOverview>(active.Count);
        foreach (var a in active)
        {
            var status = (await MatchAsync(a, index, ct))?.Status;

            results.Add(new AdOverview(a.FeedId, a.Title, a.EmployerName, a.EmployerOrgnr,
                a.MunicipalityNumber, a.Expires,
                a.Expires is { } e ? (e.UtcDateTime.Date - today).Days : null,
                a.Category, a.SourceUrl, status, a.Hidden, a.Published));
        }

        return results
            .OrderBy(a => a.Expires is null)      // nulls last
            .ThenBy(a => a.Expires)
            .ToList();
    }

    /// <summary>
    /// Every pipeline entry (optionally one status) with its expiry summary. Ads are assigned to
    /// entries by the same rule the dashboard badges use, so the two views agree ad for ad: an
    /// ad belongs to the entry with its exact orgnr, else to the entry sharing its registry root.
    /// The index is always built from all entries — filtering first would hand an ad to the
    /// wrong entry when its exact match sits outside the filter.
    /// </summary>
    public async Task<IReadOnlyList<PipelineOverview>> GetPipelineOverviewAsync(PipelineStatus? status = null,
        CancellationToken ct = default)
    {
        var now = clock.UtcNow;
        var entries = await pipeline.GetAllAsync(ct: ct);
        var index = await IndexAsync(entries, ct);

        var linked = entries.ToDictionary(e => e.Orgnr, _ => new List<Ad>());
        foreach (var ad in await ads.GetAllAsync(ct))
        {
            if (await MatchAsync(ad, index, ct) is { } entry) linked[entry.Orgnr].Add(ad);
        }

        return entries
            .Where(e => status is null || e.Status == status)
            .Select(e => new PipelineOverview(e,
                AdsExpired: linked[e.Orgnr].Count > 0 && !linked[e.Orgnr].Any(a => a.IsOpenAt(now))))
            .ToList();
    }

    private sealed record EntryIndex(Dictionary<string, PipelineEntry> ByOrgnr, Dictionary<string, PipelineEntry> ByRoot);

    private async Task<EntryIndex> IndexAsync(IReadOnlyList<PipelineEntry> entries, CancellationToken ct)
    {
        var byRoot = new Dictionary<string, PipelineEntry>();
        foreach (var entry in entries)
        {
            var root = await ResolveRootAsync(entry.Orgnr, ct);
            byRoot.TryAdd(root, entry); // collisions: first-wins
        }

        return new EntryIndex(entries.ToDictionary(e => e.Orgnr), byRoot);
    }

    /// <summary>Exact orgnr match wins; otherwise the entry sharing the ad's registry root, if any.</summary>
    private async Task<PipelineEntry?> MatchAsync(Ad ad, EntryIndex index, CancellationToken ct)
    {
        if (ad.EmployerOrgnr is not { } orgnr) return null;
        if (index.ByOrgnr.TryGetValue(orgnr, out var exact)) return exact;
        return index.ByRoot.GetValueOrDefault(await ResolveRootAsync(orgnr, ct));
    }

    /// <summary>
    /// Follows ParentOrgnr upward from <paramref name="orgnr"/>, at most <see cref="MaxRootHops"/>
    /// hops, stopping at a missing company row, a missing parent, or a self-reference. A missing
    /// company row for an orgnr means the orgnr is its own root.
    /// </summary>
    private async Task<string> ResolveRootAsync(string orgnr, CancellationToken ct)
    {
        var current = orgnr;
        for (var hop = 0; hop < MaxRootHops; hop++)
        {
            var company = await companies.GetAsync(current, ct);
            if (company?.ParentOrgnr is not { } parent || parent == current) break;
            current = parent;
        }

        return current;
    }
}
