# Hugin demo — a hosted, read-only showcase

2026-09-03. Decisions locked: the demo is a **browser-only showcase for colleagues and friends**,
hosted on **Azure App Service F1 (Linux, free tier)**, with **live sync** from NAV and Brreg for a
public region (the default Innlandet scope) and a **small seeded pipeline** so the pipeline view
and the ad badges are not empty. It never touches my real data: own config, own database, no
notes, no applied/answered statuses. Visitors can look at everything and change nothing.

Read-only mode is **option 1** from the design round: one `--public` flag on the API host and one
middleware rule that refuses every write. No auth, no accounts. Interactive visitors (real auth)
stay out of scope until someone actually asks for them.

The local app is untouched: without `--public` every rule below is inert, and the shipped exes
behave exactly as in v3.4.1. This ships as release **v3.4.2** (nothing changes for local users)
plus the first deployment of the demo.

## Part A — public mode in the API host

`hugin-api --public --state <dir> [--port N]`. `--public` without `--state` is a startup error,
and so is `--public` together with `--config` (the state dir owns the config in public mode; two
sources of truth is how a real `hugin.json` ends up served to the internet). Startup prints one
line naming the mode, the bind address and the state dir, plus a warning that public mode
serves everything in that state dir read-only to anyone who can reach the port — the flag is
for the hosted demo, never for a machine holding a real pipeline. The README says the same.

1. **Bind.** Public mode listens on **all interfaces**, on `--port` when given, else the `PORT`
   environment variable (App Service sets it, default 8080), else 5111. The address choice lives
   in a small pure helper (`ListenAddress(public, portArg, env)`) so it is unit-tested without
   binding a socket. Normal mode stays loopback-only in code, as today.
2. **Host allowlist off.** The loopback Host check exists to stop DNS rebinding against a
   localhost API; on a public host the platform routes by hostname, so the check is skipped in
   public mode. The rest of `UseHuginSecurity` stays.
3. **Every write is refused.** Before the `X-Hugin` rule: in public mode any request to `/api`
   whose method is not GET, HEAD or OPTIONS gets `403` with the problem title
   «Demo — skrivebeskyttet». That covers pipeline, hide, link, seen, sources, sync start and the
   discovery config PUT in one place, with or without the header. GETs (including `/api/extract`
   and `/api/sync/status`) work as before.
4. **`/api/status` gains `readOnly`** (`bool`, `false` in normal mode). It is the only signal the
   web needs (Part D).
5. **No first-run.** Public mode requires `<state>/hugin.json` to exist and parse; a missing or
   broken file is a startup error with a clear message, never a first-run dialog for a visitor.
   `BootSyncGate` is never held in public mode.
6. **Boot sync, throttled.** Public mode runs the boot sync only when the last NAV sync is older
   than **6 hours** (or has never run). F1 sleeps after ~20 minutes idle and every wake is a cold
   start, so an unthrottled boot sync would spend the daily CPU quota on repeat visitors. Normal
   mode keeps today's behaviour (sync on every start). There is no timer: a sync per wake is
   fresh enough for a demo, and F1 cannot run one while asleep anyway.
7. **No browser launch, no config writes.** `--public` implies `--no-browser`. The config file is
   never written in public mode (the PUT is refused in 3, and nothing else writes it).
8. **«Nytt siden sist» is a rolling window.** Nobody can press «Sett som sett» on the demo, so
   the stored review mark would freeze at the snapshot date and the new-list would grow
   without bound — the first thing a visitor sees would be hundreds of "new" items. In public
   mode the review mark is read as **now minus 7 days** (a decorator over
   `IReviewMarkRepository`, read side only); `/api/new`, the dashboard card and
   `extract?scope=new` all follow it. `POST /api/seen` is already refused by 3.
9. **Three response headers in public mode** (scope growth, deliberate: the app is internet-
   facing for the first time): `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
   `Referrer-Policy: no-referrer`, added in `UseHuginSecurity` under the public-mode branch.
   No CSP in this wave — the SPA is same-origin with no third-party assets, and a wrong CSP
   breaks the demo silently.
10. **Production is the default.** `ASPNETCORE_ENVIRONMENT` is left unset on App Service, so
    ASP.NET Core runs as Production: no developer exception page, problem details without
    stack traces. Startup errors go to the container log, never to a response.

## Part B — persistence on Azure

App Service mounts `/home` as a CIFS share, and SQLite's locking does not work there
(Microsoft: "not supported"). The app content itself lives under `/home/site/wwwroot`, so the
database cannot sit beside the exe the way it does locally. Public mode therefore separates the
**working database** from the **persisted snapshot**:

1. **Working copy on local disk.** In public mode the database path is
   `<tmp>/hugin-demo/hugin.db` (`Path.GetTempPath()`, container-local, ephemeral). WAL and the
   busy-timeout work there exactly as they do locally. `ConfigLoader` keeps its "db beside the
   config" rule for normal mode; public mode overrides only the database path.
2. **Snapshot in the state dir.** `<state>/hugin.db` is the persisted copy. On boot, if it exists
   **and no working copy exists yet**, it is copied to the working path before `InitAsync`
   (migrations then run on the local copy). A working copy that is already there — an in-place
   process restart after a crash — is newer than or equal to the snapshot and is kept; copying
   the snapshot over it would throw away a sync that never got copied back. If neither exists
   the host starts empty and the boot sync does the full walk — slow on F1, which is why the
   first snapshot is built locally (Part E).
3. **Copy-back after every sync, in a fixed order.** When a sync run finishes (success or not,
   as long as the db opened): **sync → seeder (Part C) → `PRAGMA wal_checkpoint(TRUNCATE)` →
   copy** the working db to `<state>/hugin.db.tmp` → move it over `<state>/hugin.db`. The
   seeder runs before the copy so the snapshot carries the demo pipeline. A plain file copy
   needs no SQLite locking on the share. In read-only mode the sync is the only writer, so the
   copy is always a consistent database, and the NAV cursor inside it means the next cold start
   only does a delta sync. A restart mid-copy (a zip deploy restarts the container) leaves a
   partial `.tmp` and an intact old snapshot; the next copy-back overwrites the `.tmp`, and
   copy-in ignores it.
4. **Failure is loud but not fatal.** A failed copy-in or copy-back logs a warning and the host
   keeps serving from the working copy. The worst case is a full re-walk on the next cold start,
   not a broken demo.

The `--state` dir holds three files: `hugin.json`, `demo-pipeline.json` (Part C) and `hugin.db`,
plus a transient `hugin.db.tmp` during copy-back. Nothing under `/home/site/wwwroot` is ever
written, so a redeploy never touches data. Never roll a deploy back to an older app version
without also restoring an older snapshot: the working copy would carry a newer schema.

## Part C — the seeded pipeline

`<state>/demo-pipeline.json`:

```json
[
  { "orgnr": "922425620", "status": "active", "why": "Demo: sporet for å vise pipeline og badges." }
]
```

1. **Applied idempotently**: at boot after `InitAsync`, and again after every sync completes
   (before copy-back, Part B). An orgnr already in the pipeline is left alone (never updated,
   so the demo cannot drift); an orgnr with no company row in the db is skipped with a warning
   and retried after the next sync (the company appears once Brreg has been walked). `starred`
   defaults to false. The file is validated on read: nine-digit orgnr, a known status slug, a
   non-empty why; an invalid entry is skipped with a warning naming it, an unreadable file logs
   once and seeds nothing. The why text is rendered by React like any pipeline why — escaped.
2. **Content rules**: three to five real Innlandet IT employers that appear in the snapshot,
   status `active` only, the same neutral why-line on all of them. No `applied`, no `answered`,
   no notes, no svar — nothing that could read as a real job hunt. Both demo files live in the
   repo under `demo/`: `demo/demo-pipeline.json` and `demo/hugin.demo.json` (the demo config,
   named so the `hugin.json` gitignore rule does not swallow it; it is uploaded as
   `hugin.json`). The demo config is the example config's Innlandet ×4 scope, NACE 62, the
   IT keywords and categories, no navToken and no linkouts.
3. **Normal mode ignores the file** even if one is present; the seeder only runs with `--public`.

## Part D — web UI in read-only mode

1. **One flag, resolved before anything that could write.** `App.tsx` fetches `/api/status`
   once at boot and provides `readOnly` through a small context (`useReadOnly()`). Until that
   fetch resolves the shell renders its views but **not the first-run dialog** — otherwise a
   fresh visitor sees the dialog flash open (focus is null) and close, or worse, gets it for
   real if the status call is slow, and its Save can only 403. If the status call fails the
   existing error state shows and the dialog still does not open; a reload retries.
2. **Banner.** When read-only, a banner directly after the header on every view, in DOM order
   so a screen reader meets it once, as a static region (no `aria-live`; it never changes):
   «Demo — skrivebeskyttet. Ekte stillinger og selskaper fra NAV og Brreg for Innlandet.
   Pipelinen er eksempeldata. Ingen sporing, ingen informasjonskapsler; temavalg lagres bare
   i din nettleser.» with a link to the GitHub repo. nb + en keys in `i18n`. It uses the
   existing surface tokens, so contrast is the design system's.
3. **Write controls disappear** (hidden, not disabled — a disabled button invites a click that
   can only fail): track/status/star controls in the applications and companies views, «Skjul»
   and «Koble til bedrift» on the deadline list, «Sett som sett», the manual sync button, the
   coverage form and the sources editor in Settings (Settings shows the current values as text).
   Export stays: it is a GET and shows the feature.
4. **First-run never opens.** Read-only mode treats first-run as done and seeds the render focus
   from `GET /api/config/discovery` (allowed) when no focus is stored, so the dashboard opens
   straight onto Innlandet with the right filter — the same screen I see locally.
5. **Defensive fallback.** If a write still fires (a stale tab, a bug), the existing 403 toast
   path shows the server's «Demo — skrivebeskyttet» title. No new error UI.

## Part E — build and deployment

1. **Publish target.** A new `publish-demo.ps1` runs the frontend build and
   `dotnet publish Hugin.Api -c Release -r linux-x64 --self-contained true -o publish-linux`
   (framework-dependent would tie the demo to whichever .NET stacks App Service offers;
   self-contained runs on the plain Linux image with a startup command). Physical `wwwroot` is
   fine here; the single-file embedding is Windows-only and stays untouched. The script zips
   `publish-linux\` for `az webapp deploy`. `publish-linux/` joins `.gitignore`.
2. **Azure, once.** Resource group `hugin-demo`, App Service plan **F1 Linux** (region: Norway
   East if F1 is offered there, else West Europe), web app `hugin-demo` (global name; fall back to
   `hugin-demo-mf`). Startup command:
   `/home/site/wwwroot/hugin-api --public --state /home/data`. App setting
   `WEBSITES_ENABLE_APP_SERVICE_STORAGE=true` (default for code deploys; set explicitly so
   `/home` is guaranteed persistent). No Always On (not on F1), no custom domain (not on F1).
   Publishing credentials and the publish profile stay out of the repo (`*.publishsettings` is
   already gitignored; the az CLI keeps its own login).
   **Linux runtime facts to prove on the first boot:** a self-contained .NET app on Linux needs
   ICU (`libicu`) for cultures — App Service's built-in images ship it, but a missing ICU kills
   the process at startup — and `TimeZoneInfo` needs `tzdata` for `Europe/Oslo`. The startup
   line (Part A) therefore also logs the resolved culture and the resolved time zone, so the
   first log shows both. `InvariantGlobalization` is not the fallback: it would break æøå
   collation and Norwegian formatting throughout.
3. **First snapshot built locally.** Run the published Windows exe once in a scratch dir with
   `demo/hugin.demo.json` as its config (normal mode, sync completes in minutes here), stop it,
   and upload `hugin.db` + `hugin.json` + `demo-pipeline.json` to `/home/data` through Kudu's
   VFS API. Azure then only ever does delta syncs. The scratch db is a public-region db with no
   pipeline; the seed file adds the demo entries on first boot.
4. **Deploy = zip deploy.** `az webapp deploy --src-path hugin-demo.zip --type zip`. Manual for
   the first release; a GitHub Actions workflow on tag is a follow-up, not part of this wave.
5. **README** gets a short "Demo" section with the URL and one line on what it is (read-only,
   public data, resets nothing). The release notes for v3.4.2 say the same.

Cost: F1 is free with a hard stop at quota (HTTP 403 for the rest of the day, never a charge).
The az CLI is not installed yet (`winget install Microsoft.AzureCLI`), and an Azure account with
a subscription is needed before step 2.

## Part F — testing

C# (NUnit, `ApiFactory` gains a `publicMode` switch that sets `--public` behaviour through
configuration, the same way `hugin:autosync` works today):

- `ListenAddress`: normal → loopback; public with `--port` → any:port; public with `PORT` env →
  any:env; public with neither → any:5111.
- Security middleware in public mode: PUT/POST/DELETE under `/api` → 403 with the demo title,
  with and without `X-Hugin`; GET passes; a foreign `Host` header passes. Normal mode: the
  existing tests unchanged.
- `/api/status.readOnly`: true in public mode, false otherwise.
- Boot-sync throttle with `FakeClock`: last NAV sync 5 h ago → no sync; 7 h ago → sync; never →
  sync; normal mode ignores the rule.
- Rolling review mark: in public mode `/api/new` reports `since` = now − 7 days regardless of
  the stored mark; normal mode reads the stored mark as before.
- Response headers: present on every public-mode response, absent in normal mode.
- Snapshot: copy-in when the snapshot exists and no working copy does; no copy-in when a
  working copy is already present; empty start when neither exists; copy-back produces a
  snapshot that opens as a valid db with the working copy's rows and the seeded pipeline; a
  stale `.tmp` is overwritten; a read-only state dir logs and continues.
- Seeder: inserts absent entries, never updates present ones, skips unknown orgnr with a
  warning, retries after sync, rejects a malformed entry without dropping the rest, does
  nothing in normal mode.
- `--public` with `--config`, or without `--state`, or with a missing/broken state config:
  startup fails with the specific message.
- Real-host binding test: stays loopback-only for normal mode. No real all-interfaces bind test
  (it would trip the Windows firewall prompt on my machine); the pure helper covers the choice.

Web (Vitest): banner rendered and every write control absent when `readOnly` is true; first-run
dialog not shown while `/api/status` is pending, not shown when it resolves read-only, and
focus seeded from discovery; shown as today when it resolves `readOnly: false` with no focus;
all existing tests pass unchanged with `readOnly` false (the status mock gains the field).

Live smoke before release: run `hugin-api.exe --public --state <scratch>` on Windows, then
`curl` a GET with a foreign Host header (200), a POST with `X-Hugin: 1` (403), and open the
dashboard (banner, no write controls, data present). After deploy: the same three checks against
the Azure URL, plus a cold start after 30 minutes idle to see the copy-in and the throttle in
the startup log.

## Out of scope

Real auth and interactive visitors · custom domain (needs B1) · automatic deploys from GitHub ·
Windows App Service (SQLite on its share has the same class of problem) · rate limiting (F1's
quota is the limiter; an abusive visitor takes the demo down for the day, not my data) ·
security headers beyond what the app sends today (same-origin SPA, no third-party assets).

## Verify-first items

1. **Startup command on F1 Linux** accepts a self-contained executable (documented for custom
   commands; confirm on the first deploy, with the startup log open).
2. **Copy-in/copy-back timing on CIFS** for a db of the demo's size (the local Innlandet db is
   ~10 MB) — measure once; if copy-back is slow, it still runs off the request path.
3. **F1 CPU quota** against a delta sync per wake: check the quota graph after the first day.
4. **`PORT`** is 8080 on the Linux image; the helper reads it, but confirm the app answers on
   the platform URL before assuming the bind is right.
5. **ICU and tzdata on the image** (Part E): read the first startup log for the culture and
   time-zone line before anything else.
6. **NAV feed terms for closed ads.** The feed terms ask consumers to keep data fresh and to
   remove inactive ads. Locally the derived «Utløpt» section is my own history; on a public
   page it is republishing closed ads. Read the terms once before the first deploy. If they do
   not allow it, read-only mode hides the «Utløpt» section and company ad history keeps only
   open ads — one more use of the same flag, no new mechanism.

## Stress-test record (2026-09-04)

Four lenses (security, privacy, accessibility, loopholes) run on the 03.09 draft; every finding
above 🟡 folded into the parts above. Folded: `--public` + `--config` conflict and the startup
warning (A); rolling 7-day review mark (A8); three response headers (A9, deliberate scope
growth); Production default (A10); copy-in guard when a working copy exists, fixed
sync → seed → checkpoint → copy order, stale `.tmp`, rollback note (B); seed-file validation
(C); first-run dialog gated on the status fetch, banner wording and semantics (D); ICU/tzdata
proof and credentials note (E); tests for all of it (F); NAV terms as a verify-first item.

Considered and rejected: keeping the Host allowlist with the platform hostname
(`WEBSITE_HOSTNAME`) — the platform already routes by hostname and rebinding needs a private
address, so it buys nothing; a retry storm when NAV is down — the throttle keys on the last
successful sync, so a down NAV means one attempt per cold start, which is bounded by the
cold-start rate; a real all-interfaces bind test — the Windows firewall prompt on my machine,
the pure helper covers the decision; rate limiting — F1's quota is the limiter and my data is
never on the box; `InvariantGlobalization` as an ICU fallback — breaks æøå.
