# Hugin phase 2 — web dashboard design spec

2026-08-19 · Status: approved — stress-tested (security/privacy/a11y/loopholes), all 13 findings folded in

Phase 2 puts a web dashboard over Hugin's existing Core and database: an ASP.NET Core minimal API plus a React + TypeScript frontend. The CLI keeps working unchanged. The dashboard is a **full daily driver** — reads and writes — so the whole morning routine (sync → review new → track → export) can run in the browser.

## Purpose

- Surface **deadlines first**: the dashboard's front page answers "what needs action before it's too late" — active ads sorted by days-until-deadline. The CLI is worst at exactly this (scanning `list --ads` output); the nødnett-frist-fredag catch must be impossible to miss.
- Run the full daily routine in the browser: auto-sync on launch, review what's new, track pipeline changes, copy the Preparelogg export.
- Stay **local-only but cloud-ready**: one machine, no auth, SQLite — but nothing hardcoded that would block a later Azure/Neon phase.

## Non-goals (phase 2)

- No cloud deployment, no auth, no multi-user, no phone access. The API binds to localhost only.
- No changes to CLI behavior beyond the project refactor. Known accepted seam: the CLI's `list --ads` does not respect the new `Hidden` flag (below) in this phase.
- No full ad-text storage — NAV's terms want the deep-link as the canonical view, and the link is already there.
- No follow-up/purring reminders, no stats or trend charts, no PWA.

## Decisions (agreed 2026-08-19)

1. **Full daily driver** — the API has write endpoints (track, seen-mark, sync trigger), not just reads.
2. **Local now, cloud-ready** — localhost host, SQLite, config beside the exe; the repository layer and config discipline keep a later Neon/Azure swap inside Infrastructure.
3. **Auto-sync on launch + manual button** — the app kicks off a background sync at startup and offers "Synk nå" for re-runs.
4. Four extra features accepted after gap review: **Skjul (dismiss) on ads**, **company ad-history**, **config linkouts in the header**, **"Trenger handling" callout**.

## Stack and project layout

The refactor extracts everything in `Hugin.Console` except `Program.cs` into a new Infrastructure project:

| Project | Responsibility |
|---|---|
| `Hugin.Core` | Unchanged — domain, services, repository + client interfaces. No I/O. |
| `Hugin.Infrastructure` | **New, moved from Console:** EF Core + SQLite (`Data/` incl. migrations), HTTP clients (`Http/`: NavFeedClient, BrregClient, NavTokenProvider), ConfigLoader. |
| `Hugin.Console` | Thin CLI host: `Program.cs` + DI wiring only. Behavior unchanged. |
| `Hugin.Api` | **New** — ASP.NET Core minimal API host. Endpoints → Core services → Infrastructure repositories; no EF or HttpClient code in endpoint handlers. Serves the built frontend from `wwwroot`. |
| `Hugin.Tests` | Re-pointed: references Core + Infrastructure + Api. |
| `hugin-web/` | **New** — Vite + React + TypeScript. Varde conventions, no UI libraries, no state libraries. |

**Refactor rules:**

- Move-only, no behavior change. EF identifies migrations by their IDs (filenames), not namespaces, so the existing `hugin.db` upgrades cleanly.
- **Gate zero:** the existing 106 NUnit tests stay green after the extraction, before any new code. The refactor lands as its own commit.
- Both hosts publish into the same `publish\` folder: `hugin.exe` and `hugin-api.exe` side by side, sharing `hugin.json` and `hugin.db`. Config discovery stays "beside the exe" — no third database location.

**Dev workflow:** `dotnet run` on Hugin.Api + `npm run dev` in hugin-web with a Vite proxy to the API port. Prod: `npm run build` output copied into Api's `wwwroot` at publish.

## Data model changes

One addition: `Ad.Hidden` (bool, default false) — the dismiss flag. Hidden ads are excluded from `GET /api/ads` and everything the dashboard derives from it (unless `?hidden=true` asks for them — the "Vis skjulte" toggle). One migration. All other new features are queries and UI over existing data.

**`Hidden` is sync-proof.** The feed knows nothing about this field, so the ad upsert's update path must never touch it — the v1 upsert trap (Route and Category both once dropped by an update path) in the inverse direction: a field to *preserve*, not to copy. A dedicated test pins it; without one, every daily sync would resurrect everything dismissed.

## API surface

All JSON under `/api/*`, minimal API style. Responses are thin DTOs, not domain models — they carry computed fields the dashboard needs (`daysLeft`, pipeline badges) and nothing more.

### API security (localhost is not a boundary against the browser)

Any website can fire requests at `http://localhost:*`; simple cross-origin POSTs reach the server, and DNS rebinding can read responses. The pipeline holds personal assessments of employers — it must not be readable or writable by a page Malin happens to visit.

- **Loopback binding set in code**, not config: Kestrel listens on `127.0.0.1` only, asserted by a test. Never `0.0.0.0`.
- **No CORS headers, ever** — cross-origin reads stay default-denied.
- **Every write endpoint requires the custom header `X-Hugin: 1`** — forces a CORS preflight, which fails without CORS headers. Missing header → 403.
- **Host-header validation**: requests whose `Host` is not `localhost`/`127.0.0.1` (any port) are rejected — kills DNS rebinding for reads too.

### Reads

| Endpoint | Mirrors | Notes |
|---|---|---|
| `GET /api/ads?kommune=&hidden=` | `list --ads` | Active, non-hidden ads; each with `daysLeft` and the employer's pipeline status joined in. `hidden=true` includes dismissed ads (flagged) so they can be un-hidden. Ads without `Expires` sort last, `daysLeft` null → shown as "ingen frist". |
| `GET /api/new` | `hugin new` | New companies + ads since the review mark. Response carries an `asOf` timestamp — the moment the list was computed. |
| `GET /api/companies?kommune=` | `list --companies` | |
| `GET /api/companies/{orgnr}` | — | Company detail incl. **ad history** (all stored ads for that orgnr, active and expired) — feeds the "how often do they hire?" answer behind the `Why` column. |
| `GET /api/pipeline?status=` | `list` | |
| `GET /api/export?since=` | `hugin export` | Preparelogg markdown as text; UI adds copy-to-clipboard. |
| `GET /api/status` | — | Last sync per source, review mark, counts, configured linkouts — feeds the dashboard header. |

### Writes

| Endpoint | Mirrors | Notes |
|---|---|---|
| `PUT /api/pipeline/{orgnr}` | `track` | Body: status, why, note, svar. Unknown orgnr → 404 (dashboard tracking starts from synced data; the CLI's fetch-from-Brreg-on-track stays CLI-only this phase). |
| `POST /api/ads/{feedId}/hide` · `DELETE …/hide` | — | Set / clear the dismiss flag. |
| `POST /api/seen` | `new --seen` | Body: the `asOf` value from the `GET /api/new` response the user was looking at. The mark advances **to that timestamp, never to server-now** — a dashboard open since morning must not swallow finds that synced in after the list was rendered. UI confirms first — the mark is one-way. |
| `POST /api/sync` | `sync` | Returns 202 immediately; a second call while running gets 409. Progress via `GET /api/sync/status`. |

### Sync mechanics

A `SyncRunner` singleton wraps the existing `SyncService` with a semaphore — one sync in flight per process. Auto-sync-on-launch is a hosted service firing the same runner at startup. Cross-process overlap (CLI sync while the API syncs) is the same accepted risk as two concurrent CLI syncs today: SQLite locking protects the file; no cross-process coordination is built.

With two processes on one file, the connection setup (Infrastructure, so both hosts get it) enables **WAL mode and a busy-timeout** — readers stop blocking the writer, and brief lock contention retries instead of erroring.

`GET /api/sync/status` reports per-source outcome (ok / failed, timestamps, error text) — the web equivalent of the CLI's "exit 1 only when both sources fail" rule. Partial failure renders as a warning banner over live data from the db, never a dead dashboard.

## Frontend

Four views, tab-based navigation (plain state switching — no router; four flat views don't earn one and it can be added later). Bokmål UI. Dark-mode-first, mobile-first CSS (min-width breakpoints 768/1024), design-system tokens synced from workbench. Data layer is plain `fetch` + hooks.

### 1. Dashboard (default)

- **Header strip:** last sync per source, spinner while syncing, "Synk nå" button, quick counts, and the configured **linkouts** from `hugin.json` (finn lagret søk, LinkedIn) — the dashboard is the single starting point for the whole radar routine, including sources NAV's feed can't see.
- **Trenger handling:** promoted callout — pipeline entries at `Funnet` whose ad deadline is within 7 days: "funnet, ikke søkt, frist fredag."
- **Frister:** active ads sorted by days-until-deadline ascending (no deadline → last, "ingen frist"). Urgency: ≤3 days red, ≤7 amber — color never the only signal, the days-left number is always printed. Each row: title, employer, deadline + days left, category, pipeline badge if tracked, NAV deep-link, and a "Skjul" action. A **"Vis skjulte"** toggle reveals dismissed ads with an "Angre skjul" action — a mis-click must be recoverable from the UI.
- While a sync runs, the dashboard polls `GET /api/sync/status` and re-fetches its views when the sync completes — fresh data appears without a manual reload.
- **Nytt siden sist:** new ads and companies since the mark, with "Merk som sett" (confirm dialog before advancing).

### 2. Pipeline

Entries grouped by status (Funnet / Søkt selv / Bedt GET / Svar). Inline editing of status, why, note, svar → `PUT`. Empty `Why` shows a visible warning mirroring the export flag. A hint notes the Funnet-never-exports rule.

### 3. Bedrifter

Company browser: kommune filter, name search, branch/parent indicated, website links (already https-guarded by UrlGuard). Row click → detail with the **ad history** panel.

### 4. Eksport

Since-date picker, the Preparelogg markdown shown **raw in a styled `<pre>`** (which is exactly what gets pasted into the log), copy-to-clipboard. No markdown→HTML rendering: ad titles and company names are third-party input sanitized only for control characters, an HTML renderer would both add a library and open an injection path.

### Accessibility

- Semantic HTML; every action a `<button>` or `<a>`; visible focus states; text markers alongside color (the v1 `⚠` pattern carries over); touch targets ≥ 44×44 px.
- View switcher is a `<nav>` of buttons with `aria-current="page"` on the active view.
- **Async state is announced**: one `aria-live="polite"` region carries sync start / completed / failed (including the partial-failure warning) — the spinner is never the only signal.
- **Focus management on destructive actions**: hiding an ad or clearing the Nytt list moves focus to the next row (or the list heading when empty) and announces the change via the live region. Confirm dialogs are focus-trapped and return focus to their trigger on close.
- Spinner and transitions respect `prefers-reduced-motion`.
- External links (company websites, NAV deep-links) opening in new tabs carry `rel="noopener noreferrer"`.

## Error handling

- API errors are ProblemDetails; user-facing messages in bokmål like the CLI.
- Validation mirrors the CLI: unknown orgnr or feedId → 404, invalid status → 400, missing `X-Hugin` header on writes → 403.
- Frontend updates are pessimistic — await the write, re-fetch. No optimistic UI. Fetch errors render inline with a retry action, not a vanishing toast.

## Testing

- **Gate zero** (above): 106 existing tests green after the refactor, before new code.
- **API:** integration tests via `WebApplicationFactory` against SQLite in a temp file — every endpoint, the sync single-flight rule (second POST → 409), hidden-ad exclusion and `hidden=true` inclusion, **`Hidden` surviving a sync upsert**, the trenger-handling query, the seen-mark advancing to `asOf` (not now), writes without `X-Hugin` → 403, non-localhost Host rejected, loopback-only binding.
- **Frontend:** Vitest + Testing Library, Varde conventions — deadline sorting incl. null-Expires-last and urgency thresholds, handling-callout rendering, mark-as-seen confirm flow (asOf passed through), hide/unhide incl. focus movement, live-region announcements.
- Built TDD, task by task, via the implementation plan.

## Risks / known constraints

- **Two processes, one SQLite file.** WAL mode and busy-timeout make CLI-while-API-running safe in practice, but simultaneous *syncs* from both remain an accepted (documented) race on cursor state — same class as two CLI syncs today.
- **CLI/dashboard seam:** `list --ads` ignores `Hidden`; CLI `track` can fetch unknown orgnrs from Brreg, the API can't. Both noted as CLI-only behaviors until a later phase unifies them.
- **Cloud-ready is a discipline, not a feature:** nothing in Api or hugin-web may read machine-specific paths; everything flows through ConfigLoader. The later Azure phase swaps Infrastructure internals (SQLite → Neon PG) and adds auth — hosts and frontend untouched.

## Future path

1. Phase 3 — cloud: Azure F1 + Static Web Apps per the hosting-stack decisions, Neon PG, auth.
2. Unify the CLI/dashboard seams (Hidden flag, track-by-fetch).

## Post-implementation corrections (2026-08-20)

Five defects/omissions found after the build, against the running host rather than in review:

1. **Content root anchors to the exe directory.** `WebApplicationOptions.ContentRootPath` defaults to the process's launch cwd, which breaks `wwwroot` lookup when the published exe is started from anywhere other than its own folder (`ASPNETCORE_CONTENTROOT` unset is the common case). Program.cs now defaults content root to `AppContext.BaseDirectory`, with `ASPNETCORE_CONTENTROOT` still overriding when set (so `WebApplicationFactory` test hosts, which set it themselves, are unaffected). Found running the published exe from a different cwd during integration smoke.
2. **`AdDto` gained `Published`.** The ad-history view (`Bedrifter` company detail) needs the ad's original publish date to answer "how often do they hire?" — the deadline alone doesn't show cadence. Plan omission; both `AdDto.From` and `AdDto.FromAd` now carry it.
3. **Loopback-only binding test.** The Testing section below promises this asserted by a test; `WebApplicationFactory` swaps Kestrel for an in-memory `TestServer` and structurally cannot exercise the real `Listen(IPAddress.Loopback, port)` call. `Hugin.Tests/Api/RealHostBindingTests.cs` closes the gap by launching the real host as a subprocess and reading the OS's TCP listener table for the port, asserting every bound address is loopback — real Kestrel, no reliance on LAN reachability or firewall behavior.
4. **Orgnr join for pipeline badges / Trenger handling.** Both joined ads to pipeline entries by exact `EmployerOrgnr`, but NAV sometimes reports a different registry unit than the one actually tracked (real case: a Norsk Tipping ad carried orgnr `972483672`, while the company was tracked under `925836613`). **Resolved 2026-08-20:** `AdOverviewService` now falls back to parent-chain root matching — both the ad's orgnr and each pipeline entry's orgnr are resolved to their registry root by following `Company.ParentOrgnr` (max 4 hops), and matched on that root when the exact orgnr misses. Exact match is always preferred over a root match. **Correction (same day, found in live verification):** the chain can only resolve if the local `Company` row exists — and NT's `972483672` never did, because discovery only fetches companies matching the configured NACE/kommune filter (NT is NACE 92, never discovered). Fixed by having `SyncService.SyncNavAsync` enrich unknown ad employers from Brreg at sync time: after storing a filtered ad, if `EmployerOrgnr` has no local `Company` row, `SyncService` fetches it via `IBrregClient.GetByOrgnrAsync` (which already resolves both enheter and underenheter, ParentOrgnr included) and upserts it — best-effort (a Brreg failure never fails the NAV sync or drops the ad) and deduped per sync run (one lookup per unknown orgnr, however many ads report it). Same philosophy as `track`'s existing out-of-filter fetch: the discovery filter governs discovery, not what can be tracked or joined.
5. **Nytt siden sist / Bedrifter show raw kommune numbers.** No municipality-name lookup existed in the web DTOs, so both views printed `3407` rather than "Gjøvik". **Resolved 2026-08-20:** `CompanyDto` gained `KommuneNavn`, resolved from `HuginConfig.Municipalities` in `CompanyDto.From`; `NyttSidenSist`, `BedrifterView`, and the company detail view all prefer the name, falling back to the raw kommune number when it's outside the configured list.

## Stress-test record (2026-08-19)

Reviewed through the four-lens stress test (security, privacy, accessibility, loopholes); all 13 findings folded into the sections above — the largest being the localhost-API security model (loopback binding, `X-Hugin` write header, Host validation), the sync-proof `Hidden` flag, the `asOf` seen-mark contract, and the async/focus accessibility rules. Accepted non-fixes:

- **Two tabs, concurrent edits** — last-write-wins; single user, pessimistic re-fetch.
- **Funnet entries whose ad already expired** don't appear in Trenger handling (inactive ads drop out) — deadline passed means nothing actionable.
- **Company ad-history misses ads with null `EmployerOrgnr`** — NAV data gap, not fixable locally.
- **CLI sync racing an API sync** — same class as two CLI syncs today; SQLite locking protects the file.
- **Full auth/CSRF tokens** — overkill for single-user loopback once Host validation and the write header land; real auth arrives with the cloud phase.
