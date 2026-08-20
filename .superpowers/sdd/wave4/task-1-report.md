# Task 1 — status-model pivot, backend + CLI

2026-08-20 · Wave 4, Task 1 of the Hugin v3 pivot (docs/specs/2026-08-20-hugin-v3-pivot.md).

## Scope delivered

1. **Enum pivot**: `PipelineStatus { Funnet, SoektSelv, BedtGetSjekke, Svar }` → `{ Active, Applied, Answered }`.
   `OutreachRoute` and `PipelineEntry.Route` deleted outright. `PipelineEntry.Starred` (bool, default
   false) added. Rippled through:
   - `PipelineService` — `RouteFor` removed; `TrackAsync` gains an optional `bool? starred = null`
     parameter (null preserves the stored value, same null-preserves pattern as `why`/`note`/`svar`);
     the empty-why warning condition is now `status != PipelineStatus.Active` (previously `!= Funnet`),
     so it fires for both Applied and Answered.
   - `EfPipelineRepository.UpsertAsync` / `FakePipelineRepository.UpsertAsync` — copy `Starred` on the
     update path (the copy-every-field trap the domain notes call out; both fakes and EF repo fixed
     and covered by new tests).
   - API `StatusSlug` — slugs now `active | applied | answered`.
   - `PipelineDto` — `Route` replaced with `Starred` (bool); `TrackRequest` gains `bool? Starred`.
   - `WriteEndpoints` — `PUT /api/pipeline/{orgnr}` plumbs `request.Starred` through to `TrackAsync`.
   - CLI — `Command`/`CommandParser`: `track <orgnr> active|applied|answered`; usage text and
     `StatusHelp` updated. `Console/Program.cs`: `StatusLabel` → aktiv/søkt/svar; usage banner updated.
     CLI does not expose `--starred` (not asked for; stays an API-only field for now).
   - `AdOverviewService` — no source change needed (status-agnostic); only its tests updated to the
     new enum values.

2. **Migration `V3StatusModel`** (`Hugin.Infrastructure/Data/Migrations/20260820141353_V3StatusModel.cs`,
   generated via `dotnet ef migrations add V3StatusModel --project Hugin.Infrastructure --startup-project
   Hugin.Infrastructure`, then hand-edited): adds `Starred` (bool, default false), remaps `Status` ints
   via `UPDATE Pipeline SET Status = CASE Status WHEN 0 THEN 0 WHEN 1 THEN 1 WHEN 2 THEN 1 WHEN 3 THEN 2
   END` (Funnet→Active, SoektSelv/BedtGetSjekke→Applied, Svar→Answered), then drops `Route` — in that
   order, so the mapping runs before the column it reads is gone. SQLite rebuilds the `Pipeline` table
   for the column drop (EF logs a benign "cannot run PRAGMA foreign_keys in a transaction" warning,
   informational only — the drop succeeds, verified by the full suite passing). `Down()` is a
   best-effort inverse (Applied collapses to SoektSelv on the way back — the real Route data is gone,
   which is exactly why the pre-migration `.bak` exists).

3. **Pre-migration backup**: `HuginDbInitializer.InitAsync` gained an optional `string? databasePath`
   parameter (both `Hugin.Console/Program.cs` and `Hugin.Api/Program.cs` now pass `loaded.DatabasePath`).
   Before `MigrateAsync`, if `databasePath` is non-null, the file exists, and
   `GetPendingMigrationsAsync()` is non-empty, the file is copied to `<path>.bak` (overwrite, best-effort
   — an `IOException` during backup never blocks the migration). Two new tests in
   `HuginDbInitializerTests`: a pre-existing sqlite file with no `__EFMigrationsHistory` table (i.e.
   every migration pending) produces a `.bak`; a path with no file yet produces none.

4. **MarkdownExporter** rewritten to the minimal shape: one section, `## Søkt`, entries with
   `Status >= PipelineStatus.Applied` (enum ordering: Active=0 < Applied=1 ≤ Answered=2) and
   `Updated >= since`. Active never exports (rule preserved). Route-based section splitting deleted.
   `EscapeCell`/`MissingWhyMarker` unchanged. `ExportService` needed no code change (it only calls
   `MarkdownExporter.Export`), but its tests were updated (`## Søkt selv` → `## Søkt`, entries built
   with `Status = Applied`, no `Route`).

5. **`PUT /api/pipeline/{orgnr}` star toggle**: `TrackRequest.Starred` (`bool?`, null = keep stored
   value) plumbed through. Dedicated trap-class test
   (`WriteEndpointTests.Track_starred_survives_a_status_only_edit`): star it, then send a status-only
   PUT with `starred` omitted → star survives; explicit `starred: false` still clears it. Mirrored at
   the service layer (`PipelineServiceTests.Starred_survives_a_status_only_edit`, checked against both
   the returned entry and the stored repository row) and the repository layer
   (`RepositoryTests.Pipeline_upsert_persists_the_starred_flag`).

## Web (minimal, per scope)

- `hugin-web/src/types.ts`: `PipelineStatusSlug` → `'active' | 'applied' | 'answered'`;
  `PipelineDto.route` replaced with `starred: boolean`.
- `hugin-web/src/pipelineLabels.ts`: `PIPELINE_LABELS` → `{ active: 'Aktiv', applied: 'Søkt',
  answered: 'Svar' }`.
- `PipelineView.tsx` / `TrengerHandling.tsx`: literal fixes only — `SECTIONS` array, the
  `status === 'active'` guards (was `'funnet'`), and the funnet-hint copy ("Aktiv-oppføringer tas
  aldri med i eksporten."). No new UI (star toggle, sort, i18n) — that's later work per the brief.
- Corresponding test files (`PipelineView.test.tsx`, `TrengerHandling.test.tsx`) updated to the new
  slugs; assertions kept equivalent (three sections instead of four, section names Aktiv/Søkt/Svar).

## Verify

- `dotnet build Hugin.slnx` — clean, 0 warnings, 0 errors.
- `dotnet test Hugin.slnx` — **188/188 green** (was 183; net +5: 4 new `PipelineServiceTests` starred
  cases, 1 `RepositoryTests` starred-persistence case, 2 `HuginDbInitializerTests` backup cases, 1 new
  `WriteEndpointTests` star-toggle case, minus tests removed for the deleted Route mechanism — net
  delta is +5 after removals).
- `npm run build` (hugin-web) — `tsc -b && vite build` clean.
- `npm test` (hugin-web) — **53/53 green**, unchanged count.
- `npx biome check src` — 3 pre-existing warnings (unrelated: `main.tsx` non-null assertion,
  `main.css` `!important`), no new issues.
- `README.md` — the CLI command table's status-slug list corrected to `active`/`applied`/`answered`
  (was still `funnet`/`soekt-selv`/`bedt-get`/`svar`), since I'd just changed the CLI it documents.

## Deviations / judgment calls

- `dotnet ef migrations add` initially auto-detected the property rename as `Route` → `Starred`
  (same column position, both `int`-shaped in the diff), which would have silently reinterpreted old
  Route ints (0/1/2) as Starred booleans. Discarded and hand-wrote the migration body per the spec's
  exact instructions (add column, SQL remap, then drop) while keeping the EF-generated
  Designer/snapshot (which correctly reflect the final model — `Starred bool`, no `Route`).
- `PipelineService.TrackAsync`'s empty-why warning message text (mentioning "GET") is untouched —
  the task scope is the status/starred model, not the de-GET-ify wording pass (later task).
- CLI does not gain a `--starred` flag — the task's CLI bullet only asked for `track <orgnr>
  active|applied|answered` with existing options; starring is API-only for now.
