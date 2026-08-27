# Hugin brand

Hugin is Odin's raven of thought — it flies out each morning and returns with tidings. The identity is a responsive two-mark system: a watchful raven in profile, scanning ahead.

**Source of truth:** Hugin Brand Pack v1.0.0 (local: `Development\Assets\Brand_Project_Design\Hugin-Brand-Pack\`). This folder holds only the copies the repo references; regenerate nothing here — re-export from the pack. Full usage rules live in the pack's `07-guidelines/brand-guidelines.md`.

## The two marks

- **Primary (1B Corvid)** — 32 px and up: headers, lockups, GitHub artwork, docs.
- **Micro (1H Hybrid)** — 16–24 px: favicons, compact UI. Simplified silhouette; never scale the primary mark below 32 px or use the micro mark large.

## Files

- `mark.svg` — primary mark, `viewBox 0 0 100 100`, single `currentColor` fill. Consumers set the color in CSS; never hardcode a fill on the path — `var()` does not resolve in SVG presentation attributes.
- `banner.png` — README hero, 1280×320 (pack `04-github/readme-banner-1280x320.png`).
- `social-preview.png` — GitHub social preview / OG card, 1280×640 (pack `04-github/social-preview-1280x640.png`). Upload under repo Settings → General → Social preview; `index.html`'s `og:image` points at this file on `main`.
- `src/cdp-shot.mjs` — zero-dependency Brave-CDP screenshotter, kept as a general visual-verification tool (the old raster sources it rendered are gone — rasters now come from the pack).
- In the app: `hugin-web/public/` carries the pack's web set (favicon.svg/.ico, apple-touch-icon, PWA icons, site.webmanifest); the topbar uses `hugin-web/src/components/HuginMark.tsx` (micro variant, colored by `.brand-mark` in `main.css`).

## Color and type

Pack tokens match the design system's `hugin` palette (`hugin-web/design-system/tokens/palettes/hugin.css`):

- Ground `#0a0806` (warm near-black) · ivory text `#fbf7ef` · muted `#cfc5b4`
- Ember accent `#d66a30` (`--accent-rgb: 214 106 48`); light theme uses the darker ember (`#9e3e16`) automatically wherever the mark is colored via `currentColor`.
- Type: Space Grotesk 700 (display) + Figtree 500 (body), both bundled in the design system.

One warm accent family, structure over decoration — no gradients, no second hue.
