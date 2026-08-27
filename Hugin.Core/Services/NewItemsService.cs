using Hugin.Core.Abstractions;
using Hugin.Core.Models;

namespace Hugin.Core.Services;

public sealed record NewItems(IReadOnlyList<Company> Companies, IReadOnlyList<Ad> Ads, DateTimeOffset Since,
    IReadOnlyList<Source> Sources);

/// <summary>
/// Answers "what has turned up since I last looked". The mark moves only when Malin says so
/// (<c>hugin new --seen</c>), so an interrupted morning does not silently lose a day.
/// </summary>
public sealed class NewItemsService(
    ICompanyRepository companies,
    IAdRepository ads,
    ISourceRepository sources,
    IReviewMarkRepository reviewMark,
    IClock clock)
{
    /// <summary>Returns null when no sync has ever completed — there is no baseline to diff against.</summary>
    public async Task<NewItems?> GetNewAsync(CancellationToken ct = default)
    {
        if (await reviewMark.GetAsync(ct) is not { } since) return null;

        return new NewItems(
            await companies.GetFirstSeenAfterAsync(since, ct),
            await ads.GetFirstSeenAfterAsync(since, ct),
            since,
            await sources.GetAllAsync(ct));
    }

    public Task MarkSeenAsync(CancellationToken ct = default) => reviewMark.SetAsync(clock.UtcNow, ct);
}
