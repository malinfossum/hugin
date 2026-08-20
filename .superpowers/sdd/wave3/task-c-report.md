# Task C — the dashboard dresses in the design system

## Correction made before implementing (worth flagging)

The brief said `<html data-palette="nordic">`. There is no palette named `nordic` in
`design-system/tokens/palettes/` (the palettes are `_oled`, `gold`, `wend`, `daily`, `ignite`,
`kenaz`, `tidsro`). "Nordic" is a **typeskin**, opted into via `data-typeskin="nordic"`
(`design-system/tokens/palettes/nordic.css`) — Schibsted Grotesk display over Atkinson
Hyperlegible Next body, the DS's accessibility-first pairing. Setting `data-palette="nordic"`
would have silently no-opped (no matching selector) and left the default root palette in
force. Used `data-typeskin="nordic"` instead, on `<html>` in `hugin-web/index.html`, and left
`data-palette` unset — the default root palette is already a clean, minimal dark set that
matches "structure over decoration."

## What shipped

- **`hugin-web/src/styles/main.css`** — rewritten to import the DS in the order its own index
  files intend: `base/reset.css` → `tokens/index.css` → `base/base.css` →
  `primitives/index.css` → `components/index.css` → `utilities/index.css`, then project rules.
  Kept `.frist-rod`/`.frist-gul`/`.visually-hidden`/`.eksport-markdown`/the 44px rule, now
  reading DS tokens instead of hardcoded fallback hex values. Added: `.main-content` (vertical
  rhythm for `<main>`, tokens matching the original 1rem/1.5rem/2rem breakpoints), `.frist-row`
  (mobile-stacked → 4-col grid at `768px`), `.bedrifter-row` (mobile-stacked → spread row at
  `768px`), `.company-detail-dl` (2-col term/value grid), `.empty-hint` (muted, centered
  one-liners), a `list-style: none` reset scoped to the app's own content-list parent classes
  (DS has no generic list reset), and a **`.nav-link { min-height: 44px }`** override — see
  bug found below.
- **`index.html`** — `data-typeskin="nordic"` on `<html>`.
- **`App.tsx`** — `.app-shell` wrapper; `.topbar` > `.container.cluster-between` holding
  `.brand` "Hugin" and `<nav>` > `.nav-list` of `.nav-link` buttons (`[aria-current="page"]`
  styling comes from `nav.css`); `<main>` = `.container.main-content.stack.stack-lg`.
- **`DashboardView.tsx`** — `.dashboard.stack.stack-lg` for rhythm between the four sections.
- **`SyncHeader.tsx`** — `.card`; source times as a muted `.cluster`; counts line muted; "Synk
  nå" = `.btn.btn-primary` (spinner state unchanged); linkouts as `.cluster.cluster-sm`;
  failure banner now `.alert.alert-danger` (replaced the one-off `.advarsel` class, which had
  no other callers).
- **`TrengerHandling.tsx`** — `.alert.alert-warning` plus the pre-existing 3px accent
  left-border, kept as the deliberately loudest element on the page.
- **`FristerList.tsx`** — new `daysLeftBadgeClass()` combines a badge class
  (`badge-danger`/`badge-warning`/`badge`) with the existing `frist-rod`/`frist-gul` color
  class on the *same* span, so `toHaveClass('frist-rod')` in the test suite still passes.
  Grid row: title+employer | date+chip | category | actions. Pipeline badge →
  `.badge-accent`. Skjul/Angre skjul → `.btn.btn-ghost`. "Vis skjulte" checkbox in a
  `.cluster.cluster-sm` label (not `.field` — that primitive is a column layout meant for
  labeled text inputs, a poor fit for an inline checkbox+label).
- **`NyttSidenSist.tsx`** — `.card`; kommune groups keep the same div→h4→ul nesting the tests
  anchor on (`.closest('div')`), just with `.stack`/`.text-muted` added; "Merk som sett" =
  `.btn.btn-secondary`; empty states → `.empty-hint`.
- **`ConfirmDialog.tsx`** — native `<dialog>` styled via `.modal`; actions row =
  `.cluster.cluster-sm`; Avbryt = `.btn.btn-ghost`, confirm = `.btn.btn-primary`. Handlers/refs
  untouched.
- **`PipelineView.tsx`** — each status a `.card`; entries as `.panel`s; funnet hint = `.help`;
  "Rediger" = `.btn.btn-ghost`; edit form fields wrapped in `.field`/`.label` +
  `.select`/`.textarea`/`.input`, save/cancel row = `.cluster.cluster-sm`; the "⚠ mangler
  begrunnelse" and "⚠ {warning}" markers both use `.badge.badge-warning` (the latter keeps its
  `role="status"` directly on the badge element, per the test that asserts on it).
- **`BedrifterView.tsx`** — filters = `.cluster` of `.field`s (kommune `.select`, search
  `.input`); result count muted; each row = `.panel.panel-hover.bedrifter-row` button (name
  bold, kommune muted, stacked on mobile / spread from `768px`); website link separated below.
- **`CompanyDetail.tsx`** — `.card`; `.company-detail-dl` definition list; ad history as
  `.panel` rows; empty state → `.empty-hint`.
- **`EksportView.tsx`** — date field wrapped in `.field`; "Kopier" = `.btn.btn-primary`;
  markdown `<pre>` now sits inside a `.panel` (removed the duplicate border/padding/radius
  from `.eksport-markdown`, which now only sets `overflow-x` + mono font).

## Bug found and fixed: nav buttons dipped below the 44px touch-target floor

`design-system/components/nav.css` sizes `.nav-link` at `min-height: 2.5rem` (40px). The
project's global touch-target rule targets the bare `button` element selector, which loses the
specificity fight to `.nav-link`'s class selector regardless of import order — so the four nav
buttons rendered at 40px, under the spec's non-negotiable 44px floor. Fixed with an explicit
`.nav-link { min-height: 44px; }` override in `main.css` (not in the read-only design-system).
Caught by inspecting computed styles in a live browser render, not by the test suite — jsdom
doesn't compute layout, so this class of regression is invisible to Vitest.

## Verification

- `npm test` — **53/53 green**, no query changes needed (structure/`aria-*`/label text/role
  all preserved; only classNames and wrapper elements were added).
- `npm run build` — clean; `Hugin.Api/wwwroot` contains the built CSS and JS, `index.html`
  references them and carries `data-typeskin="nordic"` through.
- `npx biome check .` — **0 new errors, 3 warnings** (unchanged baseline:
  `noNonNullAssertion` in untouched `main.tsx`, two `noImportantStyles` in the untouched
  reduced-motion block). The 33 "format" errors biome reports are pre-existing CRLF-vs-LF
  diffs from this Windows checkout's `core.autocrlf=true` — confirmed via `git ls-files
  --eol` on files I never touched (e.g. `api.ts`, `types.ts`); not attributable to this change.
- `dotnet test` — **183/183 green**, untouched.
- Rendered the build via `vite preview` in the Browser pane: verified computed styles (dark
  body background/text, `.btn-primary` accent fill, `.card` background+radius,
  `data-typeskin="nordic"` resolving to the Atkinson/Schibsted font stack, badge classes
  combined with `frist-rod` correctly), the 4-column `.frist-row` grid at desktop width
  collapsing to 1 column at 375px, `.panel-hover` rows on Bedrifter, and all four views
  navigable with no console errors — before and after the nav-link fix above.

## Commit

One commit: `feat: the dashboard dresses in the design system`
