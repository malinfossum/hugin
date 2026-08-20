using Hugin.Core.Abstractions;
using Hugin.Core.Models;

namespace Hugin.Core.Services;

public sealed record AdOverview(string FeedId, string Title, string? EmployerName, string? EmployerOrgnr,
    string? MunicipalityNumber, DateTimeOffset? Expires, int? DaysLeft, string? Category,
    string? SourceUrl, PipelineStatus? PipelineStatus, bool Hidden, DateTimeOffset? Published);

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
        var today = clock.UtcNow.UtcDateTime.Date;
        var active = await ads.GetActiveAsync(municipalityNumber, includeHidden, ct);
        var pipelineEntries = await pipeline.GetAllAsync(ct: ct);
        var byOrgnr = pipelineEntries.ToDictionary(e => e.Orgnr);

        var byRoot = new Dictionary<string, PipelineEntry>();
        foreach (var entry in pipelineEntries)
        {
            var root = await ResolveRootAsync(entry.Orgnr, ct);
            byRoot.TryAdd(root, entry); // collisions: first-wins
        }

        var results = new List<AdOverview>(active.Count);
        foreach (var a in active)
        {
            PipelineStatus? status = null;
            if (a.EmployerOrgnr is { } o)
            {
                if (byOrgnr.TryGetValue(o, out var exact))
                {
                    status = exact.Status;
                }
                else
                {
                    var root = await ResolveRootAsync(o, ct);
                    if (byRoot.TryGetValue(root, out var rootEntry)) status = rootEntry.Status;
                }
            }

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
