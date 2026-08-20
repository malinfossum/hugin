# Task 4 — bilingual dashboard (Norwegian + English)

2026-08-20 · Wave 4, Task 4 of the Hugin v3 pivot (docs/specs/2026-08-20-hugin-v3-pivot.md,
decision 3 + Contracts). Frontend only, hand-rolled i18n, no new dependencies.

## Scope delivered

1. **String tables**: `src/i18n/nb.ts` and `src/i18n/en.ts`, each `export const <lang> = {...} as
   const` with identical flat, dot-ish keys (`nav.dashboard`, `sync.now`, `frister.hide`, ...) —
   118 keys, namespaced by view/component (`nav.*`, `sync.*`, `trenger.*`, `frister.*`,
   `newSince.*`, `applications.*`, `companies.*`, `export.*`, `status.*`, `common.*`,
   `lang.*`).

2. **`src/i18n/index.ts`**: `Lang = 'nb' | 'en'`; `LanguageProvider` (React context) whose
   initial state reads localStorage `hugin-lang`, falling back to
   `navigator.language.startsWith('nb'|'no') ? 'nb' : 'en'`; `useT()` returns a `(key, params?)
   => string` translator, `useLang()` returns `[lang, setLang]`. `setLang` persists to
   localStorage and an effect syncs `document.documentElement.lang`. The context's default value
   (used only if a component somehow renders outside a `LanguageProvider`) is a static
   `{ lang: 'nb', setLang: noop }` — mirrors the existing `AnnounceContext` convention in
   `LiveRegion.tsx` (working fallback, not a throw) rather than inventing a new pattern.
   `localeFor(lang)` maps to `nb-NO`/`en-GB` for date formatting.

3. **Interpolation**: minimal `{param}` regex replace (`interpolate()` in `index.ts`) — used for
   counts, names, and dates (`sync.counts`, `frister.daysBadge`, `companies.published`, etc.).

4. **Toggle**: topbar `<fieldset className="lang-toggle">` (a11y lint prefers a semantic
   grouping element over a bare `role="group"` div) with a visually-hidden `<legend>` and two
   plain-text `NO`/`EN` buttons carrying `aria-pressed` — accessible with text alone, no icon.
   `src/styles/main.css` gained a small reset (`border/margin/padding/min-width: 0`) since the
   design-system has no fieldset reset and it's off-limits to edit.

5. **Every user-facing literal swept** into the tables: `App.tsx` nav (view identity separated
   from display text — `ViewName` slugs are now `'dashboard'|'applications'|'companies'|'export'`,
   translated via `t()` at render time instead of being the state value itself), `SyncHeader`
   (including the "Synk ferdig."/failure-message announcements and the Brreg/NAV labels),
   `TrengerHandling`, `FristerList` (hide/undo-hide/show-hidden/deadline badges),
   `NyttSidenSist` (confirm dialog + "Merket som sett." announcement), `ApplicationsView`
   (pipeline status labels moved from a static `PIPELINE_LABELS` table into
   `pipelineLabels.ts`'s `pipelineLabel(t, status)` function — a function of the current
   language, per the spec — plus sort options, star labels, form labels), `BedrifterView` /
   `CompanyDetail` / `CompanyLink` (including "har ikke egen nettside", "publisert",
   "[avdeling]", "(ingen annonser)"), `EksportView` (scopes/formats/copy/download/announcements),
   `ConfirmDialog`'s hardcoded "Avbryt" cancel button. Dates: `toLocaleDateString`/
   `toLocaleString` now take `localeFor(lang)` (`nb-NO` for nb, `en-GB` for en) instead of a
   hardcoded `'nb-NO'`, in `SyncHeader`, `FristerList`, `ApplicationsView`, `CompanyDetail`; name
   sorting (`ApplicationsView`'s `.localeCompare`) also takes the current locale.

6. **English copy**: written plain and short per the brief's examples ("Deadlines", "New since
   last visit", "Mark as seen", "Sync now", "no website of their own", "Show hidden", "Hide");
   statuses Active/Applied/Answered; view names Dashboard/Applications/Companies/Export.

7. **Key-parity test**: `src/i18n/index.test.ts` — asserts `Object.keys(nb)` and
   `Object.keys(en)` are equal sets, plus a no-empty-string sanity check on both tables.

8. **Existing tests**: `test-setup.ts` now does `localStorage.setItem('hugin-lang', 'nb')` in a
   global `beforeEach` — every test file shares this setup file, so this pins the whole suite to
   nb deterministically (documented inline; chose localStorage over mocking
   `navigator.language` since it exercises the same code path `LanguageProvider` uses in
   production). Every component test file that renders an i18n-consuming component now also
   wraps its render helper in `<LanguageProvider>` (SyncHeader, TrengerHandling, FristerList,
   NyttSidenSist — including its second `rerender()` call site, ApplicationsView, BedrifterView,
   EksportView) so the suite exercises the real detection/localStorage path rather than only the
   context's static fallback. `ConfirmDialog.test.tsx` needed no changes — it doesn't render
   inside any of the wrapped views and the fallback context already resolves to nb. `App.test.tsx`
   needed no changes to its two existing tests (App wraps itself in `LanguageProvider`
   internally, same as `LiveRegionProvider`) — added one new test for the toggle (see below).
   Both `PIPELINE_LABELS[status]` call sites (`FristerList`, `ApplicationsView`) switched to
   `pipelineLabel(t, status)`.

9. **New toggle test** (`App.test.tsx`): clicks `EN`, asserts `Dashboard`/`Applications` labels
   appear and `Dashbord`/`Søknader` don't, `aria-pressed` flips on both buttons,
   `document.documentElement.lang === 'en'`, and `localStorage.getItem('hugin-lang') === 'en'`.

## Verify

- `npm test` (hugin-web) — **70/70 green** (was 67; +2 key-parity/sanity in
  `i18n/index.test.ts`, +1 toggle test in `App.test.tsx`). No existing assertion's expected text
  changed — every nb string kept byte-for-byte identical to what the pre-i18n code hardcoded,
  confirmed by grepping every `toHaveTextContent`/`getByText`/`getByRole(...,{name})` literal
  across the test files before writing the tables.
- `npm run build` — `tsc -b && vite build` clean.
- `npx biome check .` — 0 errors, the same 3 known warnings (`main.tsx` non-null assertion,
  `main.css` `!important` ×2). One new a11y finding surfaced mid-task (`role="group"` on a div →
  lint wants a `<fieldset>`) and was fixed by switching the toggle wrapper to `<fieldset>` +
  visually-hidden `<legend>`.
- `dotnet test Hugin.slnx` — **206/206 green**, untouched (frontend-only task).

## Deviations / judgment calls

- **File extension**: spec says `src/i18n/index.ts`; it contains a component
  (`LanguageProvider`). Wrote it as `.ts` using `createElement` instead of JSX to honor the
  literal filename, rather than silently renaming to `.tsx`.
- **Context default value**: not specified by the brief. Chose a working `{ lang: 'nb', setLang:
  noop }` fallback (matches `LiveRegion.tsx`'s `AnnounceContext` convention) over throwing when
  no `LanguageProvider` is present — consistent with the rest of the codebase and avoids a class
  of test-only crashes for components rendered in isolation.
- **`pipelineLabels.ts`** was rewritten from a static `Record` to a `pipelineLabel(t, status)`
  function, per the spec's explicit instruction ("labels become functions of lang or move into
  the tables") — chose the function form since it's called from two files and keeps the
  language-dependent lookup in one place rather than duplicating a `t('status.X')` switch at
  each call site.
- **Brreg/NAV labels**: technically proper nouns/data-source names identical in both languages,
  but added `sync.brregLabel`/`sync.navLabel` keys anyway (both langs = the same value) for full
  compliance with "sweep every user-facing literal" rather than leaving two hardcoded strings
  behind.
- **`⚠ {warning.message}` in ApplicationsView** was left as a static `⚠ ` prefix around the raw
  API warning text — that message is server-generated bokmål regardless of UI language (out of
  frontend i18n's scope per the spec's "CLI localization to EN" being explicitly out of scope,
  and the API wasn't touched this task).

## Status contract

Task 4 complete. `npm test` 70/70 green, `npm run build` clean, `npx biome check .` 0 errors/3
known warnings, `dotnet test` 206/206 green and untouched. One commit created per the ask.
Every user-facing string in `hugin-web/src` now flows through `useT()`/`pipelineLabel()`; the
language toggle in the topbar switches instantly, persists to `localStorage`, and keeps
`<html lang>` in sync; dates format with `nb-NO`/`en-GB` depending on the active language.

## Post-review fix (2026-08-20)

Review flagged one Important issue: `detectLang()` only matched `startsWith('nb')`/`'no'` —
a Nynorsk browser (`navigator.language` = `nn`/`nn-NO`) fell through to English instead of
bokmål. Also flagged: the whole `navigator.language` branch was structurally untested, since
`test-setup.ts`'s `beforeEach` pre-seeds `localStorage['hugin-lang']` on every test, which
short-circuits `detectLang()` before it ever reaches the browser-language check.

Fix:

1. Added `browserLang.startsWith('nn')` to the Norwegian bucket in `detectLang()`
   (`hugin-web/src/i18n/index.ts`) alongside the existing `nb`/`no` checks — Nynorsk users now
   get the bokmål table (the only Norwegian table this app ships), never English.
2. Exported `detectLang()` (previously module-private) so it can be unit-tested directly rather
   than only indirectly through `LanguageProvider`'s initial state.
3. Added a `describe('detectLang (browser fallback, no stored preference)', ...)` block to
   `hugin-web/src/i18n/index.test.ts`: a `beforeEach` removes the pinned `hugin-lang` localStorage
   key (undoing `test-setup.ts`'s global pin just for this block) so the navigator-language
   branch is actually reached, and each test mocks `navigator.language` via
   `Object.defineProperty(navigator, 'language', { value, configurable: true })`, restored in
   `afterEach`. Four cases: `nn-NO` → `nb`, `nb-NO` → `nb`, `sv-SE` → `en`, `en-US` → `en`.

Verify: `npm test` — **74/74 green** (was 70; +4 detection tests). `npm run build` — clean.
`npx biome check .` — 0 errors, the same 3 known warnings (import-order in the new test file
was auto-fixed by `biome check --write`, no behavior change). `dotnet test` not re-run — this
fix only touches `hugin-web/src/i18n/`, no backend surface.

Commit: `fix: nynorsk browsers get bokmål, detection path tested`.
