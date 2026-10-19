# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences, weighted equally:

- **The daily user.** A developer looking for work in Norway, running Hugin on their own machine. Each morning they open the dashboard, start a sync, read what is new since yesterday in their region, star what is worth applying to, move companies through their pipeline, and mark the batch as seen. Sessions are short and repeated; the job is "what changed, and what do I do about it".
- **The demo visitor.** Someone opening the hosted read-only demo cold, often to evaluate the work behind it (recruiters, employers, other developers). They have no pipeline of their own and no context; the job is "understand what this does and judge how well it is made", within a minute or two.

## Product Purpose

Hugin is a job radar for the Norwegian developer job market. It does the morning round across the public registries (NAV's job-ad feed and Brønnøysundregistrene's company register), filters to the user's region and field, and shows only the difference since the last time they looked. It also tracks who they have applied to. Success is the user no longer opening five sites every morning and trying to remember what they already saw.

## Positioning

- Local-first: one self-contained executable, the browser opens on localhost, and the data never leaves the machine.
- Shows the delta, not the inventory: "new since last visit" is anchored to a stored "I have seen this" mark.
- Region is a hard gate: fylker and kommuner come first, then industry codes, keywords and NAV occupation categories narrow it.
- The CLI and the dashboard are two faces of one program over the same SQLite file.

## Operating Context

- The morning run: sync, review new ads and companies, star, set pipeline status, export a shortlist, mark as seen.
- Views: Dashboard (sync header, needs-action, new since last visit, deadlines, sources), Companies (one row per company, branches as tabs on the detail page), Applications (the pipeline), Export (`.md`/`.txt`/`.json`), Settings (coverage, focus profile, display filter, link-out sources, reset).
- Every view is a real URL; back/forward, reload and deep links work.
- Bilingual: English and Norwegian bokmål, toggled in the top bar. Both light and dark themes, toggled in the top bar; both default from the browser and remember the choice.
- The hosted demo runs on Azure's free tier (first visit after idle is slow), read-only, with real Innlandet data and a seeded example pipeline.

## Capabilities and Constraints

- Pipeline statuses: `Watching` → `Applied` → `Answered`, plus `Expired`, which a `Watching` entry enters on its own when all its ads expire and leaves when a new ad appears.
- Expired ads are never shown as active (NAV's API terms require removing inactive ads); the demo filters closed ads out entirely.
- Norwegian domain terms stay as they are in the UI: fylke, kommune, NAV, Brreg, Visningsfilter, frist.
- Data is dense and tabular in places (company lists, deadline lists); the dashboard is used daily, not occasionally.
- Frontend: React 19, TypeScript, Vite, TanStack Router and Query, Tailwind v4 with shadcn/ui on Base UI (migration from the workbench design system in progress).

## Redesign Constraints

Set by the maintainer (Malin) for the 2026 redesign. Colours, fonts and layout are open; these are not:

- Functionality and routes stay as they are. Any change to what a screen does goes to the maintainer for approval first.
- New UI text is welcome. Every string goes in both `hugin-web/src/i18n/nb.ts` and `en.ts`, never hardcoded in a component, and each pull request lists its new texts in the description so the maintainer can review the wording there.
- Both themes, dark and light, remain.
- The accessibility floor: WCAG AA contrast, 44 px click targets, visible focus.
- Anything drawn, like the deadline timeline, must also be readable by keyboard and screen reader, with a list or table behind it carrying the same information.
- Redesign proposals go to the maintainer as mockups; she approved the dashboard direction on 16 October 2026.

## Brand Commitments

- Name: Hugin, after Odin's raven of thought, who flies out each morning and returns with tidings (his sibling Munin remembers).
- The raven marks are binding: Primary (1B Corvid) at 32 px and up, Micro (1H Hybrid) at 16–24 px, single `currentColor` fill, with the brand pack's usage rules (no stretching, recoloring parts, runes, helmets, knotwork, radar arcs or decorative feathers; no other bird substituted). Source: `docs/brand/`.
- Palette and typography from the brand pack (ember on slate, Space Grotesk + Figtree) are **not** binding for the redesign.

## Evidence on Hand

- Real public data from NAV and Brønnøysundregistrene, visible in the demo.
- `docs/project-note.md`: plain-language account of what Hugin is and how it is built.
- Brand assets in `docs/brand/` (mark, banner, social preview) and `hugin-web/public/` (favicons, PWA icons).
- There are no testimonials, user counts, or third-party endorsements. Do not invent any.

## Product Principles

1. The delta comes first: what is new since last time outranks everything else on screen.
2. Truth over completeness: never present an expired ad as active, never hide that a sync failed.
3. The user's data is theirs: local, inspectable, exportable.
4. A cold visitor should understand the product from the screen alone, without having to read docs.

## Accessibility & Inclusion

WCAG 2.2 AA is the floor: contrast, keyboard operation with visible focus, target size, and status announced to assistive tech. Color is never the only signal (deadline urgency, sync state, pipeline status).
