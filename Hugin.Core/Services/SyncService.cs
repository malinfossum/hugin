using Hugin.Core.Abstractions;
using Hugin.Core.Config;

namespace Hugin.Core.Services;

public sealed record SourceResult(bool Succeeded, int Fetched, string? Error);

public sealed record SyncSummary(SourceResult Brreg, SourceResult Nav, bool BaselineSet,
    int WebsitesChecked = 0, int WebsitesDead = 0)
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
    IKommuneRepository kommuner,
    IAdRepository ads,
    ISyncStateRepository syncState,
    IReviewMarkRepository reviewMark,
    IWebsiteProber websiteProber,
    IClock clock,
    HuginConfig config)
{
    // A generous stop so a malformed next_id chain cannot loop forever. Daily syncs from
    // yesterday's tail need a handful of pages; a full backfill walks the whole feed and
    // gets a far higher ceiling that only a broken cursor chain could ever reach.
    private const int MaxPagesPerSync = 100;
    private const int MaxPagesFullSync = 20_000;

    // A website check is a "keep it fresh" background nicety, not tracked sync data — a small
    // daily slice keeps the whole tracked set current within a couple of weeks without ever
    // making a sync noticeably slower.
    private const int WebsiteCheckStaleness = 7;
    private const int WebsiteCheckBatchSize = 40;
    private const int WebsiteCheckMaxConcurrency = 8;

    /// <param name="fullNav">Walk the NAV feed from its oldest page (or the stored cursor)
    /// to the tail, instead of the capped daily pull. First run: the whole history.</param>
    /// <param name="onNavPage">Called after each stored page with (pages, adsStored) — a
    /// backfill takes minutes and deserves a heartbeat.</param>
    public async Task<SyncSummary> SyncAsync(bool fullNav = false,
        Action<int, int>? onNavPage = null, CancellationToken ct = default)
    {
        var now = clock.UtcNow;

        // The register must be current before the scope is built from it — a first-ever run
        // with an unreachable register simply degrades to config-only scope (kommuner.GetAllAsync
        // returns whatever is already stored, empty on a fresh database).
        await SyncKommunerAsync(ct);
        var scope = MunicipalityScope.Build(config, await kommuner.GetAllAsync(ct));

        var brregResult = await SyncBrregAsync(now, scope, ct);
        var navResult = await SyncNavAsync(now, fullNav, scope, onNavPage, ct);

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

        var (websitesChecked, websitesDead) = await SyncWebsitesAsync(now, ct);

        var baselineSet = false;
        if ((brregResult.Succeeded || navResult.Succeeded) && await reviewMark.GetAsync(ct) is null)
        {
            // The first successful sync becomes the baseline, so `hugin new` starts near-empty
            // instead of dumping several hundred companies that were merely never seen before.
            await reviewMark.SetAsync(now, ct);
            baselineSet = true;
        }

        return new SyncSummary(brregResult, navResult, baselineSet, websitesChecked, websitesDead);
    }

    /// <summary>
    /// Best-effort like the kommune register: a website's reachability is a display nicety, not
    /// tracked sync data, so any failure here — the due-query, a probe, storing a result — must
    /// never fail the sync that just ran. The network probes run with bounded concurrency so a
    /// batch of dead or slow hosts cannot turn this into dozens of sequential 6-second waits;
    /// the results are then written back one at a time — the scoped <c>HuginDbContext</c> a
    /// repository call closes over is not safe to use from more than one task at once.
    /// </summary>
    private async Task<(int Checked, int Dead)> SyncWebsitesAsync(DateTimeOffset now, CancellationToken ct)
    {
        try
        {
            var due = await companies.GetWebsitesDueForCheckAsync(
                now.AddDays(-WebsiteCheckStaleness), WebsiteCheckBatchSize, ct);
            if (due.Count == 0) return (0, 0);

            using var gate = new SemaphoreSlim(WebsiteCheckMaxConcurrency);

            var probed = await Task.WhenAll(due.Select(async company =>
            {
                await gate.WaitAsync(ct);
                try
                {
                    return (company.Orgnr, Result: await websiteProber.ProbeAsync(company.Website!, ct));
                }
                finally
                {
                    gate.Release();
                }
            }));

            var deadCount = 0;
            foreach (var (orgnr, result) in probed)
            {
                await companies.SetWebsiteCheckAsync(orgnr, result.Ok, result.ResolvedUrl, now, ct);
                if (!result.Ok) deadCount++;
            }

            return (probed.Length, deadCount);
        }
        catch (Exception)
        {
            return (0, 0);
        }
    }

    /// <summary>
    /// One <see cref="IBrregClient.GetCompaniesAsync"/> call when the scope is still the plain
    /// configured municipalities (today's behavior, byte-identical). When the scope was expanded
    /// — fylker or all-of-Norway — the allowed numbers are chunked by 2-char fylke prefix so
    /// each query stays under Brreg's pagination window.
    /// </summary>
    private async Task<SourceResult> SyncBrregAsync(DateTimeOffset now, MunicipalityScope scope, CancellationToken ct)
    {
        // Declared outside the try so a later chunk's failure can still report what earlier
        // chunks already fetched and stored — same convention as SyncNavAsync's `stored`.
        var fetchedTotal = 0;
        try
        {
            // Every scope number must be a real 4-digit kommunenummer before it is used to
            // chunk or query Brreg. Checked ahead of the branch below, for both branches —
            // a malformed configured number (too short, too long, non-digit) is just as wrong
            // in a plain unscaled config as in a fylke-expanded one, and either way it must
            // surface as this clear message instead of an ArgumentOutOfRangeException from
            // GroupBy(n => n[..2]) or a confusing failure once it reaches Brreg.
            if (scope.AllowedNumbers.FirstOrDefault(n => !IsValidKommuneNumber(n)) is { } invalid)
                return new SourceResult(false, 0,
                    $"Ugyldig kommunenummer i konfigurasjonen: «{invalid}» — må være 4 sifre");

            var configured = config.Municipalities.Select(m => m.Number).ToHashSet();
            var chunks = scope.AllowedNumbers.SetEquals(configured)
                ? [scope.AllowedNumbers.ToArray()]
                : scope.AllowedNumbers.GroupBy(n => n[..2]).Select(g => g.ToArray()).ToList();

            foreach (var chunk in chunks)
            {
                var fetched = await brreg.GetCompaniesAsync(config.Naeringskoder, chunk, ct);
                foreach (var company in fetched) await companies.UpsertAsync(company, now, ct);
                fetchedTotal += fetched.Count;
            }

            await syncState.SetAsync("brreg", null, now, ct);

            return new SourceResult(true, fetchedTotal, null);
        }
        catch (Exception ex)
        {
            return new SourceResult(false, fetchedTotal, ex.Message);
        }
    }

    private static bool IsValidKommuneNumber(string n) => n.Length == 4 && n.All(char.IsAsciiDigit);

    /// <summary>
    /// The kommune register is a name lookup, not tracked data — a failure here must never
    /// fail the brreg result that companies were just synced under. Names simply stay stale
    /// until the next successful sync.
    /// </summary>
    private async Task SyncKommunerAsync(CancellationToken ct)
    {
        try
        {
            var fetched = await brreg.GetKommunerAsync(ct);
            await kommuner.UpsertManyAsync(fetched, ct);
        }
        catch (Exception)
        {
            // Best-effort — see summary above.
        }
    }

    private async Task<SourceResult> SyncNavAsync(DateTimeOffset now, bool full, MunicipalityScope scope,
        Action<int, int>? onPage, CancellationToken ct)
    {
        var stored = 0;
        // Orgnrs already attempted this run — one Brreg lookup per unknown employer,
        // no matter how many ads (or pages, in a --full backfill) report it.
        var attemptedEmployerOrgnrs = new HashSet<string>();

        try
        {
            var cursor = (await syncState.GetAsync("nav", ct))?.Cursor;
            var maxPages = full ? MaxPagesFullSync : MaxPagesPerSync;
            var firstFetch = true;

            for (var page = 0; page < maxPages; page++)
            {
                // A backfill with no stored position starts at the feed's oldest page; with
                // one, it resumes — so an interrupted backfill continues instead of restarting.
                var feedPage = full && firstFetch && cursor is null
                    ? await nav.GetFirstPageAsync(scope, ct)
                    : await nav.GetPageAsync(cursor, scope, ct);
                firstFetch = false;

                foreach (var ad in feedPage.Ads)
                {
                    if (!AdFilter.Matches(ad, config, scope)) continue;

                    await ads.UpsertAsync(ad, now, ct);
                    stored++;

                    await EnrichEmployerAsync(ad.EmployerOrgnr, attemptedEmployerOrgnrs, now, ct);

                    if (ad.EmployerOrgnr is { } orgnr && UrlGuard.Website(ad.EmployerHomepage) is { } homepage)
                    {
                        try
                        {
                            await companies.AdoptWebsiteAsync(orgnr, homepage, ct);
                        }
                        catch (Exception)
                        {
                            // Best-effort, same rule as employer enrichment — never fails the NAV sync.
                        }
                    }
                }

                // Cursor after commit: everything on this page is stored before we move on.
                cursor = feedPage.NextCursor;

                // At the tail there is no next page yet, but that page keeps collecting entries
                // until it fills and rolls over. Resuming from it — rather than from "newest"
                // — is what stops those entries being skipped; re-reading it is harmless
                // because upserts are idempotent.
                await syncState.SetAsync("nav", cursor ?? feedPage.PageId, now, ct);

                onPage?.Invoke(page + 1, stored);
                if (cursor is null) break;
            }

            return new SourceResult(true, stored, null);
        }
        catch (Exception ex)
        {
            return new SourceResult(false, stored, ex.Message);
        }
    }

    /// <summary>
    /// Discovery (SyncBrregAsync) only pulls companies matching the configured nace/kommune
    /// filter, so an ad's employer can be a registry unit no local row exists for (e.g. NT ads
    /// carrying NACE 92, which the discovery filter never fetches) — and the parent-chain
    /// pipeline join in <see cref="AdOverviewService"/> needs that row to resolve up to the
    /// tracked orgnr. Best-effort, like track's out-of-filter fetch: a Brreg hiccup here must
    /// never fail the NAV sync or skip the ad, which is already stored by the time this runs.
    /// </summary>
    private async Task EnrichEmployerAsync(string? employerOrgnr, HashSet<string> attempted,
        DateTimeOffset now, CancellationToken ct)
    {
        if (employerOrgnr is null || !attempted.Add(employerOrgnr)) return;
        if (await companies.GetAsync(employerOrgnr, ct) is not null) return;

        try
        {
            if (await brreg.GetByOrgnrAsync(employerOrgnr, ct) is { } fetched)
                await companies.UpsertAsync(fetched, now, ct);
        }
        catch (Exception)
        {
            // Orgnr stays in `attempted` either way — no retry within this run.
        }
    }
}
