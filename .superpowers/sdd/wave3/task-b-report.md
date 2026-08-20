# Task B — website checker: dead links stop rendering

## What shipped

- `Hugin.Core/Models/Company.cs` — `string? WebsiteResolved`, `bool? WebsiteOk`, `DateTimeOffset? WebsiteCheckedUtc`.
- Migration `AddWebsiteCheck` (`dotnet ef migrations add AddWebsiteCheck --project Hugin.Infrastructure --startup-project Hugin.Infrastructure --output-dir Data/Migrations`) — three nullable columns on `Companies`.
- `EfCompanyRepository.UpsertAsync` update path — the trap-class rule: incoming website equals stored → check fields preserved; differs (or becomes null) → `Website` overwritten and all three check fields cleared, forcing a re-check next sync. Insert path leaves them null. `FakeCompanyRepository` mirrors the same rule so sync tests behave identically to production.
- `IWebsiteProber` / `WebsiteProbeResult(bool Ok, string? ResolvedUrl)` — `Hugin.Core/Abstractions/Clients.cs`. Impl `Hugin.Infrastructure/Http/WebsiteProber.cs`: strips any existing scheme and rebuilds both an `https://` and `http://` variant from the bare host+path (so scheme-less input and an explicit scheme probe identically), tries https then http with GET, `< 400` status = Ok, any exception on a variant just fails that variant. Never throws. `WebsiteProber.CreateHttpClient()` builds the shared client (6s timeout, browser UA, `AllowAutoRedirect`); DI registers one instance as a singleton in both hosts. The constructor takes an `HttpClient` (public primary constructor, same shape as `BrregClient`) so tests inject a fixture-backed client instead of needing `InternalsVisibleTo`.
- `ICompanyRepository.GetWebsitesDueForCheckAsync(olderThan, take, ct)` — `Website != null && (never checked || WebsiteCheckedUtc < olderThan)`, never-checked first then oldest-checked, capped. `SetWebsiteCheckAsync(orgnr, ok, resolvedUrl, checkedUtc, ct)`. EF impl + fake, both tested.
- `SyncService` — ctor gains `IWebsiteProber`; after the expiry sweep, `SyncWebsitesAsync` fetches up to 40 companies due (`olderThan = now - 7 days`), probes them **concurrently** (`SemaphoreSlim(8)`), then writes results back **sequentially** — see "correction" below. Wrapped in try/catch so no failure (due-query, probe, write) ever fails the sync; `SyncSummary` gains `WebsitesChecked`/`WebsitesDead` (default 0, so every existing call site keeps compiling). CLI prints `nettsteder: X sjekket, Y døde` only when `WebsitesChecked > 0`.
- `CompanyDto.From` — `WebsiteOk == false → null` (link suppressed); otherwise `WebsiteResolved ?? Website`. Verified `BedrifterView.tsx` / `CompanyDetail.tsx` already gate the `<a>` on truthy `company.website` — zero frontend changes needed.
- DI: `IWebsiteProber` registered as a singleton in `Hugin.Api/Program.cs` and `Hugin.Console/Program.cs`.

## Correction made mid-implementation (worth flagging)

The spec's "`Task.WhenAll` over chunks or a `SemaphoreSlim`" bounded-concurrency instruction, read literally as "probe and store inside the same gated task," would call `ICompanyRepository.SetWebsiteCheckAsync` from up to 8 concurrent tasks against the **same scoped `HuginDbContext`** — EF Core contexts are not thread-safe, so this would throw or corrupt state under real concurrent traffic (not exercised by the fakes, since `FakeCompanyRepository` is a plain `Dictionary`). Fixed by splitting the pass in two: probes run concurrently under the semaphore (the actual expensive part — up to 6s network I/O each), then results are written back to the repository one at a time in a plain `foreach`. Concurrency is still bounded to 8 in-flight *probes*, which is what actually matters for wall-clock time; the DB writes are cheap and sequential.

## Tests added (TDD)

- `WebsiteProberTests.cs` (5) — https-ok, https-fails-http-ok, both-fail, exception-never-throws, scheme-less input.
- `RepositoryTests.cs` (+7) — preserve-on-unchanged, clear-on-changed, clear-on-null, insert-leaves-null, due-query (never-checked + staleness + null-website exclusion), due-query oldest-first-and-capped, `SetWebsiteCheckAsync` roundtrip.
- `SyncServiceTests.cs` (+5) — due websites probed and stored with correct counts, 7-day staleness window respected, max-8-concurrent probes (via a `FakeWebsiteProber` that tracks in-flight count), repo failure during the due-query doesn't fail the sync, zero-due reports zero and never probes.
- `ReadEndpointTests.cs` (+3) — `WebsiteOk == false` → `website: null`; `WebsiteResolved` wins when set; unchecked still shows the register value.

## Verify

- `dotnet build` — clean, 0 warnings, 0 errors.
- `dotnet test` — **183/183 green** (163 baseline + 20 new: 5 prober + 7 repository + 5 sync + 3 endpoint).
- `npm test` (hugin-web) — **53/53 green**, untouched.

## Commit

One commit: `feat: website checker — dead links stop rendering, http-only sites resolve`
