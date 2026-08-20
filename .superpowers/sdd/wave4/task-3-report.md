# Task 3 — applications view (rename, starring, sorting) + every company gets a link

2026-08-20 · Wave 4, Task 3 of the Hugin v3 pivot (docs/specs/2026-08-20-hugin-v3-pivot.md,
decisions 2, 4, 6). Frontend only — the API already supported `starred` on PUT and served it in
`PipelineDto` (task 1).

## Scope delivered

1. **Rename**: `PipelineView.tsx`/`.test.tsx` → `ApplicationsView.tsx`/`.test.tsx`
   (`git mv`, component renamed `PipelineView` → `ApplicationsView`). `App.tsx`'s nav array swaps
   `'Pipeline'` for `'Søknader'` and imports `ApplicationsView`; `App.test.tsx` updated to match.
   Section heading ids stay `pipeline-heading-*` — an internal DOM detail, not user-visible, left
   alone.

2. **Starring**: each entry's header is now a `cluster-between` row (company name + a star
   `icon-btn`). The button carries `aria-pressed={entry.starred}` and
   `aria-label="Gi stjerne"`/`"Fjern stjerne"`, with the glyph (★/☆) marked `aria-hidden` so the
   accessible name is the label text, never the symbol alone. `toggleStar` PUTs
   `/api/pipeline/{orgnr}` with `{ status, why, note, svar, starred: !entry.starred }` — the other
   four fields come straight from the entry object (not the edit-form's draft state, which may not
   even be open), matching the "reuse the prefill pattern, current stored values" instruction. On
   success it re-threads any `response.warning` through the existing warning-banner state and
   reloads; on failure it announces the error via the live region rather than silently swallowing
   it.

3. **Sorting**: a labeled `<select id="soknader-sortering">` ("Sorter etter") with options
   Stjerne først (default) / Sist oppdatert / Navn. `sortEntries()` runs on each status section's
   filtered slice independently — grouping is untouched, only in-section order changes.
   Persistence: `localStorage` key `hugin-soknader-sortering`, read on mount (`loadSortMode`,
   defaulting to `'starred'` on any missing/invalid/unavailable value) and written on every change
   (`saveSortMode`), both wrapped in `try/catch` so a private-mode/storage-disabled browser degrades
   to "just doesn't persist" instead of crashing the view.

4. **Sections**: verified — the three sections already use `PIPELINE_LABELS` (Aktiv/Søkt/Svar) and
   the Aktiv section already carried the exact hint text `"Aktiv-oppføringer tas aldri med i
   eksporten."` from task 1; no change needed there.

5. **Always-a-link**: new `src/links.ts` (`googleSearchUrl`, `proffSearchUrl` — build the exact
   URLs from the spec's Contracts section, `encodeURIComponent`-escaped) and a shared
   `src/components/CompanyLink.tsx` that renders either the plain website `<a>` (unchanged
   behaviour, same `target="_blank" rel="noopener noreferrer"`) or, when `website` is `null`, a
   muted `cluster` group: `"har ikke egen nettside —"` followed by "Google-søk" and "Proff" links,
   both `target="_blank" rel="noopener noreferrer"`. Wired into `BedrifterView.tsx` (replacing the
   row's conditional website `<a>`) and `CompanyDetail.tsx` (replacing the detail page's
   conditional website `<a>`) — one component, two call sites, so the fallback copy/URLs can never
   drift between the list and the detail view.

## Tests (TDD)

- `ApplicationsView.test.tsx`: rewrote the import/describe block for the rename; all 8 pre-existing
  cases pass unchanged. Added:
  - `starring`: toggle PUTs the flipped `starred` with the other four fields taken verbatim from
    the entry (including `null` note/svar), and `aria-pressed`/accessible name flip after refetch;
    a second test confirms un-starring sends `starred:false`.
  - `sorting`: select defaults to `'starred'`; "Stjerne først" puts starred entries first within a
    section; "Navn" sorts alphabetically; "Sist oppdatert" puts the most-recently-updated entry
    first; a persistence test selects a mode, unmounts, remounts, and confirms the select comes up
    pre-set from `localStorage`.
- `BedrifterView.test.tsx`: added three cases — website-present row unchanged (link text, `href`,
  `target`, `rel`), website-`null` row shows the note plus both fallback links with
  `encodeURIComponent`-correct hrefs, and the same null-website assertions against `CompanyDetail`
  (opened via the existing row-click flow).
- `App.test.tsx`: nav-button regex and click-target updated from `Pipeline` to `Søknader`.

## Verify

- `npm test` (hugin-web) — **67/67 green** (was 57, net +10: 2 starring + 5 sorting + 3
  BedrifterView/CompanyDetail link cases).
- `npm run build` — `tsc -b && vite build` clean.
- `npx biome check .` — 0 errors, the same 3 known warnings (`main.tsx` non-null assertion,
  `main.css` `!important` ×2).
- `dotnet test Hugin.slnx` — **206/206 green**, untouched (confirms this task never touched the
  API/Core/CLI).

## Deviations / judgment calls

- **Test-environment fix (not scope creep, but load-bearing):** every `localStorage`-touching test
  failed with `Cannot read properties of undefined (reading 'removeItem')` before any feature code
  ran. Root cause: Node 22+'s own global `localStorage` getter (a no-op unless the process is
  started with `--localstorage-file`) already exists on `globalThis`, and vitest's jsdom
  environment (`populateGlobal`) only copies a `window` property onto `globalThis` when the key
  *isn't* already present there — so jsdom's real, working `localStorage` never got attached, and
  every access hit Node's inert stub instead. Fixed in `src/test-setup.ts` with a small in-memory
  `Storage`-compatible polyfill installed only when `globalThis.localStorage` is `undefined`, so
  real browsers (where this collision doesn't exist) are unaffected. Also added
  `environmentOptions.jsdom.url: 'http://localhost/'` to `vite.config.ts` — jsdom's own
  `localStorage` throws for the opaque `about:blank` origin it otherwise defaults to; harmless
  either way but makes the environment's origin match what a real deployed app has.
- **Bug caught before it shipped:** `main.css`'s list-style reset targeted `.pipeline-view ul`;
  renaming the view's root class to `.applications-view` would have silently brought back bullet
  points on every Søknader-view list. Caught by inspection (no test asserts `list-style`) and fixed
  by updating the selector alongside the rename.
- `CompanyLink` takes `kommuneNavn: string | null` directly (not the company's `kommune` code) —
  matches the spec's contract text (`... <kommuneNavn>`) rather than falling back to the raw code
  the way `BedrifterView`'s municipality label already does elsewhere; a missing name just yields a
  slightly shorter Google query, never a bare kommune number in the URL.
- Star-toggle failures are surfaced via the existing live region (`announce(...)`) rather than a
  new per-entry error UI — consistent with how the rest of the view already reports errors, and
  avoids adding a second parallel error-display mechanism for one button.

## Status contract

Task 3 complete. `npm test` 67/67 green, `npm run build` clean, `npx biome check .` 0 errors/3
known warnings, `dotnet test` 206/206 green and untouched. One commit created per the ask. Nav +
view renamed to Søknader, starring wired end-to-end with aria-pressed state, sort control persists
across sessions, and every company row/detail now always resolves to a working link (verified site
or Google/Proff fallback).
