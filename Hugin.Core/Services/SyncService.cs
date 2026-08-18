using Hugin.Core.Abstractions;
using Hugin.Core.Config;

namespace Hugin.Core.Services;

public sealed record SourceResult(bool Succeeded, int Fetched, string? Error);

public sealed record SyncSummary(SourceResult Brreg, SourceResult Nav, bool BaselineSet)
{
    public bool BothFailed => !Brreg.Succeeded && !Nav.Succeeded;
}

/// <summary>
/// Pulls both sources into storage. Sync semantics are at-least-once: upserts are idempotent
/// and the feed cursor advances only after its batch is stored, so a crash re-fetches a page
/// rather than skipping it. Neither source can take the other down — a flaky connection must
/// not kill the morning routine — so each is wrapped in its own result.
/// </summary>
public sealed class SyncService(
    IBrregClient brreg,
    INavFeedClient nav,
    ICompanyRepository companies,
    IAdRepository ads,
    ISyncStateRepository syncState,
    IReviewMarkRepository reviewMark,
    IClock clock,
    HuginConfig config)
{
    // A generous stop so a malformed next_id chain cannot loop forever; the real feed
    // reports a null cursor at the tail long before this.
    private const int MaxPagesPerSync = 100;

    public async Task<SyncSummary> SyncAsync(CancellationToken ct = default)
    {
        var now = clock.UtcNow;

        var brregResult = await SyncBrregAsync(now, ct);
        var navResult = await SyncNavAsync(now, ct);

        // Expiry is a local sweep, not feed data: an ad past its date is stale whether or not
        // NAV was reachable this morning.
        try
        {
            await ads.DeactivateExpiredAsync(now, ct);
        }
        catch (Exception)
        {
            // Nothing to report — the ads simply keep their previous flag until the next run.
        }

        var baselineSet = false;
        if ((brregResult.Succeeded || navResult.Succeeded) && await reviewMark.GetAsync(ct) is null)
        {
            // The first successful sync becomes the baseline, so `hugin new` starts near-empty
            // instead of dumping several hundred companies that were merely never seen before.
            await reviewMark.SetAsync(now, ct);
            baselineSet = true;
        }

        return new SyncSummary(brregResult, navResult, baselineSet);
    }

    private async Task<SourceResult> SyncBrregAsync(DateTimeOffset now, CancellationToken ct)
    {
        try
        {
            var municipalities = config.Municipalities.Select(m => m.Number).ToArray();
            var fetched = await brreg.GetCompaniesAsync(config.Naeringskoder, municipalities, ct);

            foreach (var company in fetched)
                await companies.UpsertAsync(company, now, ct);

            await syncState.SetAsync("brreg", null, now, ct);
            return new SourceResult(true, fetched.Count, null);
        }
        catch (Exception ex)
        {
            return new SourceResult(false, 0, ex.Message);
        }
    }

    private async Task<SourceResult> SyncNavAsync(DateTimeOffset now, CancellationToken ct)
    {
        var stored = 0;

        try
        {
            var cursor = (await syncState.GetAsync("nav", ct))?.Cursor;

            for (var page = 0; page < MaxPagesPerSync; page++)
            {
                var feedPage = await nav.GetPageAsync(cursor, ct);

                foreach (var ad in feedPage.Ads)
                {
                    if (!AdFilter.Matches(ad, config)) continue;

                    await ads.UpsertAsync(ad, now, ct);
                    stored++;
                }

                // Cursor after commit: everything on this page is stored before we move on.
                cursor = feedPage.NextCursor;
                await syncState.SetAsync("nav", cursor, now, ct);

                if (cursor is null) break;
            }

            return new SourceResult(true, stored, null);
        }
        catch (Exception ex)
        {
            return new SourceResult(false, stored, ex.Message);
        }
    }
}
