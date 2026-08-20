# Task 2 — extract system (txt/md/json, three scopes)

2026-08-20 · Wave 4, Task 2 of the Hugin v3 pivot (docs/specs/2026-08-20-hugin-v3-pivot.md,
decisions 5 + 9, Contracts section).

## Scope delivered

1. **Core `ExtractService`** (`Hugin.Core/Services/ExtractService.cs` + `ExtractRenderer.cs`),
   replacing `ExportService`/`MarkdownExporter` (both deleted, along with their test files —
   `MarkdownExporter.EscapeCell`'s pipe/newline-collapsing logic was moved into
   `ExtractRenderer.Cell`, with a sibling `Plain` for the pipe-free `.txt` variant).
   - `Task<ExtractResult> ExtractAsync(ExtractScope scope, ExtractFormat format, string? category = null, ct)`
     — `ExtractResult(string Content, string FileName, string ContentType)`.
   - `ExtractScope { New, Category, All }`, `ExtractFormat { Md, Txt, Json }`.
   - **New**: companies + ads `FirstSeen` after the review mark (via `IReviewMarkRepository` +
     `GetFirstSeenAfterAsync`) — empty-but-valid (not an error) when no mark exists yet, same
     "starts empty" rule as `hugin new`.
   - **Category**: active ads (`GetActiveAsync`, hidden excluded) whose `Category` contains the
     given string, `OrdinalIgnoreCase`. Throws `MissingCategoryException` when `category` is
     null/blank — a dedicated exception type (same pattern as `PipelineService`'s
     `CompanyNotFoundException`) so both the CLI and API can catch it cleanly.
   - **All**: every company (kommune name+number resolved the same way `CompanyDto.From` does —
     configured municipalities first, then the Brreg register, raw number as last resort; a
     confirmed-dead website is never surfaced), every active ad, and the full "Søkt" tracker
     (`Status >= Applied`, no time window — this scope is "everything").
   - DTO records only (`ExtractCompanyRow`, `ExtractAdRow`, `ExtractTrackerRow`,
     `ExtractDocument`) — never EF entities — serialized via `JsonSerializerOptions.Web`
     (camelCase) for the json format.
   - Filenames: `hugin-<scope>-<yyyyMMdd>.<ext>` from `clock.UtcNow` — server-chosen, no user
     input. Content types: `text/markdown` / `text/plain` / `application/json`, UTF-8 throughout.
   - Markdown sections mirror existing vocabulary: New → "## Nye selskaper (N)" / "## Nye
     annonser (N)" (same headers `hugin new` already prints); Category → "## Aktiv — \<kategori\>
     (N)"; All → "## Bedrifter (N)", "## Aktiv (N)", and the Preparelogg-compatible "## Søkt"
     table (`| Dato | Bedrift | Nettside | Grunn | Svar |`, unchanged from the old
     MarkdownExporter). Empty sections render "(ingen)" rather than an empty table. `.txt` mirrors
     the same section order and per-row fields with no `|` characters at all.

2. **API**: `GET /api/extract?scope=new|category|all&format=md|txt|json&category=<name>` in
   `Hugin.Api/Endpoints/ReadEndpoints.cs`, replacing `/api/export`. Scope/format are parsed from
   query strings into the enums at the endpoint (missing or unrecognized → 400 bokmål
   `ProblemDetails`, same as the existing `/api/pipeline?status=` pattern) before the service is
   even called; `MissingCategoryException` from the service is caught for the
   scope=category-without-category case → 400. Success responses use `Results.File(bytes,
   contentType, fileName)`, which sets `Content-Disposition: attachment; filename=...`
   automatically. `ExportService` removed from DI in `Hugin.Api/Program.cs`, `ExtractService`
   registered scoped instead.

3. **CLI**: `hugin export [--format md|txt|json] [--scope new|category|all] [--category <navn>]`
   in `Hugin.Core/Cli/CommandParser.cs` — defaults `md`/`all`; `--scope category` without
   `--category` is rejected as an `InvalidCommand` before the service ever runs (fail fast, same
   style as the other CLI validations). The old `--since` window is gone entirely (`TryParseDate`
   deleted, no longer used anywhere). `ExportCommand` now carries `(ExtractFormat, ExtractScope,
   string? Category)`. `Hugin.Console/Program.cs`'s `RunExportAsync` calls `ExtractService` and
   prints `result.Content` to stdout (piping stays the workflow); usage banner updated.

4. **Web `EksportView.tsx` rework**:
   - `<select>` pickers for Omfang (Nytt/Kategori/Alt) and Format (md/txt/json) — a `<select>`
     was used for scope too (not radio buttons): the design-system has no radio/fieldset
     primitive yet, and `design-system/` is read-only per project convention, so reusing the
     existing `.select`/`.field`/`.label` primitives (already used for Format and elsewhere in
     the app) keeps the view visually consistent instead of introducing unstyled markup.
   - A free-text Kategori `<input>` appears only when scope=Kategori.
   - "Last ned" is a real `<a href={...} download>` to the `/api/extract` URL — a same-origin GET,
     so the browser just downloads it; href/disabled state tracks `categoryReady` (scope !=
     category, or category has non-blank text).
   - Preview (`<pre>` + "Kopier") is kept for all three formats — json included, still raw text,
     never parsed/rendered as markup. For scope=Kategori, no preview fetch fires until a category
     is typed (avoids hammering the API with a 400 on every keystroke); a muted hint line explains
     why in that state.
   - `api.ts` gained `api.getText(path)` — always reads the body as text regardless of the
     response's `content-type`, needed because the existing `api.get<T>` auto-parses
     `application/json` bodies into objects, which would break the "always show raw text in
     `<pre>`" rule for the json format. Shared the 403/404-style error-title extraction with
     `request<T>` via a small `throwIfError` helper (light refactor, no behavior change to the
     existing `api.get/post/put/del`).

5. **Sweep**: grepped for `ExportService`, `/api/export`, `--since` — the only remaining hits are
   the CLI's `ExportCommand` record name (deliberately kept: `hugin export` stays the verb per
   spec decision 9), doc-comment mentions of the deleted types for historical context, and the
   test that asserts `/api/export` now 404s. Historical plan/spec docs under `docs/plans/` and the
   phase-2 `docs/specs/` file were left untouched (dated records of earlier waves, not live docs).
   `README.md`'s command table and web-dashboard blurb updated to the new `hugin export` syntax
   and "download a data extract" wording.

## Tests (TDD)

- `Hugin.Tests/ExtractServiceTests.cs` (new, 13 tests): each scope's shape (new scope
  empty-but-valid with no review mark, and populated via `FirstSeen` filtering; category
  case-insensitive match + inactive-ad exclusion + missing/blank-category throws; all scope's
  companies/active-ads/Søkt-tracker, Active excluded from the tracker, empty-why warning marker),
  markdown pipe/newline escaping, `.txt` has zero `|` characters, json parses with
  `generatedUtc`/`scope`/`companies`/`ads`/`tracker` keys (including the new-scope-with-no-mark
  case), and filename/content-type per format.
- `Hugin.Tests/Api/ExtractEndpointTests.cs` (new, 10 tests): 200 + `Content-Disposition:
  attachment` + correct content-type per format (md/txt/json) for the all scope, new scope 200
  with no review mark, category scope returns matching ads, 400 for missing/unknown scope,
  unknown format, and category-scope-without-category, and a dedicated test that `/api/export`
  is now 404.
- `Hugin.Tests/CommandParserTests.cs`: replaced the single `--since` test with defaults
  (md/all), explicit format+scope, category carried through, category-scope-without-category
  invalid, bad format invalid, bad scope invalid (6 tests, net +5 over the one removed).
- `hugin-web/src/views/EksportView.test.tsx`: rewrote all 4 existing cases against the new
  component (script-in-title still renders inert in `<pre>`, never as markup) and added 4 more —
  default `scope=all&format=md` fetch URL, refetch on scope change, refetch on format change,
  category-scope defers fetching until typed then includes `&category=`, and the download link's
  `href` tracking scope/format. Net 8 tests (+4).

## Verify

- `dotnet build Hugin.slnx` — clean, 0 warnings, 0 errors.
- `dotnet test Hugin.slnx` — **206/206 green** (was 189). Arithmetic: 189 − 2 (deleted
  `ExportServiceTests`) − 8 (deleted `MarkdownExporterTests`) − 1 (old `CommandParserTests`
  `--since` test) − 1 (old `ReadEndpointTests` export test) + 6 (new `CommandParserTests` export
  cases) + 13 (`ExtractServiceTests`) + 10 (`ExtractEndpointTests`) = 206, confirmed by the run.
- `npm run build` (hugin-web) — `tsc -b && vite build` clean.
- `npm test` (hugin-web) — **57/57 green** (was 53, net +4).
- `npx biome check src` — same 3 pre-existing warnings as task 1 (`main.tsx` non-null assertion,
  `main.css` `!important`), no new issues; one formatting fix applied to `EksportView.tsx` via
  `npx biome format --write`.
- Manual CLI smoke test against a throwaway db/config: `hugin export` (defaults) → valid
  empty-but-valid markdown (`## Bedrifter (0)` / `(ingen)` etc.); `hugin export --scope new
  --format json` → well-formed empty-array json; `hugin export --scope category` (no
  `--category`) → usage/error, no crash.

## Deviations / judgment calls

- API-level scope/format validation happens by parsing the query string directly in the endpoint
  (mirrors the existing `StatusSlug.Parse` pattern for `/api/pipeline?status=`) rather than
  inventing shared parsing types in Core — same duplication the codebase already has between the
  CLI's status parsing and the API's `StatusSlug`. Missing scope/format (omitted query param) is
  treated as "unknown" → 400, since the API contract in the spec doesn't specify defaults the way
  the CLI does (decision 9 only gives the CLI a default).
- `ExtractService.ExtractAsync` throws `MissingCategoryException` for scope=Category with a
  blank category (defense at the service boundary, not just the callers) — both the CLI
  (pre-validated in `CommandParser`, so this path is normally unreachable but still caught) and
  the API (caught → 400) rely on it as the single source of truth for the rule.
- Web scope picker uses a `<select>`, not radio buttons — the task allowed either, and the
  design-system (read-only) has no radio/fieldset styling, so a second `<select>` keeps the view
  consistent with the existing Format picker and the rest of the app instead of adding unstyled
  markup.
- `All` scope's tracker has no time window at all (full history) — matches "the full tracker" in
  the task description; the old `since`-day window is gone along with `--since`.

## Status contract

Task 2 complete. `dotnet test` 206/206 green, `npm test` 57/57 green, both builds clean, one
commit created per the ask. Extract replaces export end-to-end: Core service + renderer, API
endpoint with correct download headers, CLI surface, and the web Eksport view — old
ExportService/MarkdownExporter/`/api/export`/`--since` fully removed and swept.
