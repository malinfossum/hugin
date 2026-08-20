# Task 5 — the theme

2026-08-20 · Wave 4, Task 5 of the Hugin v3 pivot. Two repos: workbench (canonical design
system, PR opened, not merged) and Hugin (committed to `main`).

## Scope delivered

### Workbench — `feat/hugin-palette` branch, PR opened, not merged

PR: **https://github.com/malinfossum/workbench/pull/15**
("feat: Hugin palette + Daily as default look")

1. **New palette `hugin.css`** (`data-palette="hugin"`): a v1 daily-derived copy, header-flagged
   `"Hugin — daily-derived v1; dedicated branding pending"`, registered in
   `tokens/palettes/index.css`, the gallery switcher button, and the gallery's
   active-palette-highlight rule (`gallery.css`) — the same three touch points the Kenaz/Tidsro
   precedent used. Also added to `_oled.css`'s shared selector (true black / warm ivory text /
   warm borders), since Hugin needs the same foundation daily/ignite share.

2. **Daily promoted to the default identity** — the mechanism, in detail below.

3. **Release conventions**: VERSION `2.1.0 -> 3.0.0` (MAJOR — this changes what unpinned
   consumers render, the same justification 2.0.0 used for its own identity change), a CHANGELOG
   entry, README + `docs/oled-palettes.md` updated. Both `scaffolds/web-vite` and
   `scaffolds/web-react-ts` re-extracted so the scaffold-drift CI guard stays green.

4. **Checks run locally**: `node --test "tools/*.test.mjs"` — **63/63 green**. `node
   tools/check-links.mjs` — OK (3 pages). `node tools/extract.mjs design-system
   scaffolds/{web-vite,web-react-ts} --check` — both `current`.

### The default-mechanism decision

The brief's own hint — "the root defaults in `tokens/colors.css`/typography adopt Daily's
override values, with Daily's opt-in palette file left in place as a no-op" — turns out to be
unsafe taken literally. `gold`, `wend`, `tidsro` and `kenaz` are *accent-only* (or
accent-plus-surface) palettes: none of them declare their own `--surface-1.."5"`,
`--on-accent`, `--accent-solid(-strong)`, or `--font-display` — they've always derived those
straight from the plain `:root` block. Editing that block in place to Daily's values would have
silently reskinned all four (confirmed by grep: `gold.css`'s dark mode declares *none* of those
four token families; `wend`/`tidsro` declare surfaces but not font-display/on-accent/
accent-solid; `kenaz` declares on-accent but not accent-solid).

**What shipped instead**: the plain `:root` / `:root[data-theme="light"]` blocks in
`colors.css` and `typography.css` are **untouched**. Daily's surface/accent/on-accent/
accent-solid/font-display values are added under a new selector pair —

```css
[data-palette="default"],
html:not([data-palette])
```

— appended *after* the existing rules. `"default"` is what
`theme/theme-init-snippet.html` literally writes to `data-palette` when nothing is saved
(`localStorage.getItem("palette") || "default"`), so this is the state real pages actually
reach; `html:not([data-palette])` covers markup that never ran the init script at all. Both
branches are **mutually exclusive with every named palette selector by construction** — an
element can't simultaneously have `data-palette="gold"` and have the attribute absent or equal
to `"default"` — so this can never win or lose a specificity fight against
`[data-palette="gold"]` etc.; it simply never matches the same element. `_oled.css` (already
shared by `daily`+`ignite`) got the same pair added for `--surface-0`/`--text`/`--border`.

Verified by hand against each of the six "must stay unaffected" consumers (see the PR body for
the full per-palette breakdown) — none of them declare any of the properties the new block
touches in the branch that would apply to them, so all six resolve exactly as before. `daily.css`
itself is untouched and is now a documented no-op relative to the new default. The automated
"solid primary button meets 4.5:1" test still passes because the new block reuses `daily.css`'s
exact already-tested hex values rather than new ones.

Light mode needed no special-casing: the existing `:root[data-theme="light"]` block already has
higher specificity than the new default-scoped rules for every property it also declares
(surfaces/text/border/on-accent/accent-solid), so — same as real `daily.css` already behaves —
light mode falls through to the pre-existing base light values, and only `--accent-rgb`/
`--accent-strong-rgb` get Daily's light-tuned re-tune. This is the exact mechanism daily.css's
own comment describes ("light theme resolves the base light accent below, which passes on its
own") — confirmed by reasoning through the cascade, not guessed.

`tools/design-system.test.mjs` changes: split the old single "default identity is Sora..." test
into a base-identity test (still asserts `--font-display: "Sora"...` in the plain `:root` — the
fallback gold/wend/tidsro/kenaz still resolve to) and a new default-identity test (asserts the
`[data-palette="default"], html:not([data-palette])` block sets Space Grotesk); added
`hugin.css` to the AA-contrast-check loop; bumped the VERSION pin and added `Daily`/`hugin` to
the README-needle check.

### Hugin repo — committed to `main`

Commit: `feat: hugin palette via workbench, calmer heading scale`

1. Re-extracted the design system from workbench's `feat/hugin-palette` **branch working tree**
   (`node tools/extract.mjs design-system <hugin-web abs path>`, run from the workbench repo) —
   picks up design-system 3.0.0, including `hugin.css` and the new default mechanism, even though
   that branch isn't merged yet.
2. `hugin-web/index.html`: `<html>` now carries `data-palette="hugin"` alongside the existing
   `data-typeskin="nordic"`. Explicit rather than relying on the new DS default (which would
   already render identically, since Hugin currently sets no `data-theme`/`data-palette` at all
   and has no init snippet wired) — so Hugin's look stays pinned even if the workbench default
   moves again later.
3. **Heading scale**, in `hugin-web/src/styles/main.css` (project CSS, DS untouched): the DS base
   sizes are built for marketing/hero pages (h1 up to 3.75rem, h2 up to 1.75rem). Hugin's actual
   page title is a visually-hidden `<h1>` (`App.tsx`); every *visible* section title across the
   app is an `<h2>` (FristerList, NyttSidenSist, TrengerHandling, ApplicationsView,
   SyncHeader, CompanyDetail, ConfirmDialog) — that's the size that was actually "way too big".
   Capped each level one DS type-scale token down: `h1 → --text-2xl`, `h2 → --text-xl` (~1.25rem),
   `h3 → --text-md` (~1rem, matches `CompanyDetail`'s ad-history heading and
   `NyttSidenSist`'s company-group headings). `h4` needed no change — the DS never set its
   font-size, so it already rendered at the browser default (~1rem).

## Verify

- `npm test` (hugin-web) — **74/74 green**, unchanged.
- `npm run build` — `tsc -b && vite build` clean; fonts/CSS/JS emit into `../Hugin.Api/wwwroot`
  as before.
- `npx biome check .` — **0 errors, 3 known warnings** (`main.tsx` non-null assertion,
  `main.css` `!important` ×2 in the reduced-motion block) — unchanged from before this task.
- `dotnet test` — **206/206 green**, run once, untouched (frontend/design-system-only task).
- Workbench: `node --test "tools/*.test.mjs"` **63/63**, `node tools/check-links.mjs` OK,
  both scaffolds `current` against the new VERSION.

## Deviations / judgment calls

- **Did not edit `:root` in place**, despite the brief's "likely" phrasing suggesting it — see
  the default-mechanism section above for why that would have broken gold/wend/tidsro/kenaz.
  The selector-pair approach achieves the same visible outcome ("Daily renders when nothing else
  is chosen") without touching a single byte any pinned consumer depends on.
- **VERSION bumped to 3.0.0 in the same PR**, not deferred to a later "stamp" commit. The
  Kenaz/Tidsro precedent (PRs #13/#14) initially shipped without a version bump and had to be
  corrected in a follow-up commit — CHANGELOG 2.1.0's own "Housekeeping" note states "the rule
  stands that any canonical content change bumps VERSION." Since this PR changes canonical
  content (and, unlike Kenaz/Tidsro, changes what unpinned consumers render), bumping here
  follows the stated rule rather than repeating the earlier oversight.
- **Added `hugin.css` to the automated AA-contrast test loop** (`gold.css`/`wend.css`/
  `daily.css`/`ignite.css` → +`hugin.css`) even though the brief didn't explicitly ask — it's a
  new palette shipping in this PR, and the check is free (it reuses `daily.css`'s already-passing
  hex values, so it can't fail).
- **`html:not([data-palette])` over `:root:not([data-palette])`** for the "attribute genuinely
  absent" branch: `:root:not(...)` ties in specificity with `:root[data-theme="light"]`
  ((0,0,2,0) each), which would let source order (not intent) decide whether light-mode surfaces
  correctly fall back to the base light block for that edge case. `html:not(...)` scores
  (0,0,1,1) — reliably lower than `:root[data-theme="light"]`'s (0,0,2,0) regardless of source
  order — so the light-mode fallback the OLED palettes already lean on stays correct rather than
  fragile.
- **Did not touch `Hugin.Api`'s built `wwwroot` output** beyond what `npm run build` regenerates —
  no manual edits to generated assets.

## Post-review fix (2026-08-20)

Review flagged one Important gap: the consumer-impact analysis only covered palettes living
inside the workbench repo. It missed that a real downstream repo, `varde/web` (public, live),
has **no `data-palette` pin** and is still on design-system **2.0.2** — its next extract would
have silently flipped it from the pre-3.0.0 default to Daily, with no way back short of
freezing the whole design system at 2.0.2 forever, since the old default look wasn't preserved
anywhere as an opt-in.

Fix, all on the `feat/hugin-palette` branch (workbench, not merged):

1. **New opt-in palette `classic.css`** (`data-palette="classic"`): the pre-3.0.0 default
   identity, restated byte-for-byte from the unedited plain `:root`/`:root[data-theme="light"]`
   blocks in `colors.css` and `typography.css` — true-black surfaces, cool blue-grey accent,
   Sora display, dark-ink solid-button formula (`--accent-solid: var(--accent)`, unlike
   daily/hugin's hardcoded ember ink, since the old accent was light enough to pass AA against
   dark ink on its own). Registered in `tokens/palettes/index.css`, the gallery switcher button,
   and the gallery active-highlight rule — the same three touch points every other palette uses.
   Added to the AA-contrast test loop and the README-needle check in
   `tools/design-system.test.mjs`.
2. **PR body rewritten** with the real downstream table: `hugin`/`ignite`/`kenaz`/`tidsro` all
   pin their own palette explicitly (unaffected); `varde/web` is unpinned on 2.0.2 and will
   adopt Daily on its next sync — called out as Malin's decision (pin `classic` to keep today's
   look, or accept the reskin), not acted on here. The `varde` repo itself was not touched, per
   instruction.
3. **Fixed an inaccurate aside**: the "Default identity" comment in `colors.css` and the
   CHANGELOG both claimed none of gold/wend/tidsro/kenaz touch `--on-accent`/`--accent-solid` —
   false for `kenaz`, which declares its own dark `--on-accent` and light `--accent-solid`
   (`kenaz.css`). Doesn't change the actual conclusion (the new default selector pair still never
   matches `[data-palette="kenaz"]`, so kenaz is unaffected regardless of what it declares), but
   the prose was wrong and now names exactly what kenaz overrides and what it doesn't.
4. Re-ran `node --test "tools/*.test.mjs"` (**63/63 green** — same count as before; `classic.css`
   added scopes to the existing contrast-loop test rather than new top-level tests) and
   `node tools/check-links.mjs` (OK). Both scaffolds re-extracted with `--force` (VERSION stays
   3.0.0 — this is still-unmerged content on the same unreleased version) and confirmed
   `current` via `--check`. Pushed `50e1589` to `feat/hugin-palette`; PR #15 updated in place.

Then in Hugin: re-extracted `hugin-web`'s design-system mirror from the updated branch
(`node tools/extract.mjs design-system <hugin-web> --force`, since the same-version content
drift halt applies here too) — picks up `classic.css` and the corrected comments. `npm test`
**74/74 green**, `npm run build` clean. Commit `b60a293`,
`chore: DS re-extract — classic palette added upstream`.

## Status contract

Task 5 complete, including the post-review fix. Workbench: branch `feat/hugin-palette` pushed
(now at `50e1589`), PR #15 open, not merged. Hugin: two commits on `main` —
`feat: hugin palette via workbench, calmer heading scale` and
`chore: DS re-extract — classic palette added upstream`. `npm test` 74/74, `npm run build`
clean, `npx biome check .` 0 errors/3 known warnings (unchanged by the fix), `dotnet test`
206/206 unchanged (not re-run for the fix — frontend/design-system-only). No `git stash` used
in either repo. `varde/web`'s reskin decision is flagged in PR #15, not acted on.
