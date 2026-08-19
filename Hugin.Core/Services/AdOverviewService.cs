using Hugin.Core.Abstractions;
using Hugin.Core.Models;

namespace Hugin.Core.Services;

public sealed record AdOverview(string FeedId, string Title, string? EmployerName, string? EmployerOrgnr,
    string? MunicipalityNumber, DateTimeOffset? Expires, int? DaysLeft, string? Category,
    string? SourceUrl, PipelineStatus? PipelineStatus, bool Hidden);

/// <summary>
/// The dashboard's deadline view: active ads with the outreach pipeline joined in, soonest
/// frist first. Ads without a frist sort last — a missing deadline is not an urgent one.
/// </summary>
public sealed class AdOverviewService(IAdRepository ads, IPipelineRepository pipeline, IClock clock)
{
    public async Task<IReadOnlyList<AdOverview>> GetAsync(string? municipalityNumber = null,
        bool includeHidden = false, CancellationToken ct = default)
    {
        var today = clock.UtcNow.UtcDateTime.Date;
        var active = await ads.GetActiveAsync(municipalityNumber, includeHidden, ct);
        var entries = (await pipeline.GetAllAsync(ct: ct)).ToDictionary(e => e.Orgnr);

        return active
            .Select(a => new AdOverview(a.FeedId, a.Title, a.EmployerName, a.EmployerOrgnr,
                a.MunicipalityNumber, a.Expires,
                a.Expires is { } e ? (e.UtcDateTime.Date - today).Days : null,
                a.Category, a.SourceUrl,
                a.EmployerOrgnr is { } o && entries.TryGetValue(o, out var entry) ? entry.Status : null,
                a.Hidden))
            .OrderBy(a => a.Expires is null)      // nulls last
            .ThenBy(a => a.Expires)
            .ToList();
    }
}
