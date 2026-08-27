# Hugin brand

Hugin is Odin's raven of thought — it flies out each morning and returns with tidings. The mark is a reduced raven head in profile, scanning ahead; the eye is a true cut-out so the glyph works on any background.

## Files

- `mark.svg` — the raven glyph, 32×32, single `currentColor` fill (defaults to ember via an inline `color`). Consumers set the color in CSS; never hardcode a fill on the path — `var()` does not resolve in SVG presentation attributes.
- `banner.png` — README hero, 1280×320.
- `social-preview.png` — GitHub social preview / OG card, 1280×640. Upload under repo Settings → General → Social preview; `index.html`'s `og:image` points at this file on `main`.
- `src/` — the HTML sources for both rasters (brand fonts embedded as data URIs) plus `cdp-shot.mjs`, a zero-dependency Brave-CDP screenshotter.
- The favicon lives in the app at `hugin-web/public/favicon.svg` (mark on a rounded near-black tile); the topbar mark is inlined in `hugin-web/src/App.tsx` and colored by `.brand-mark` in `main.css`.

## Color and type

From the design system's `hugin` palette (`hugin-web/design-system/tokens/palettes/hugin.css`):

- Ground `#0a0806` (warm near-black) · text `#fbf7ef` · muted `#cfc5b4`
- Ember accent `#d66a30` (`--accent-rgb: 214 106 48`); light theme uses the palette's darker ember automatically wherever the mark is colored via `currentColor`.
- Type: Space Grotesk 700 (display) + Figtree 500 (body), both bundled in the design system.

One warm accent family, structure over decoration — no gradients, no second hue.

## Regenerating the rasters

```bash
node docs/brand/src/cdp-shot.mjs docs/brand/src/banner.html docs/brand/banner.png 1280 320
node docs/brand/src/cdp-shot.mjs docs/brand/src/social.html docs/brand/social-preview.png 1280 640
```

Requires Brave at `C:\Program Files\BraveSoftware\Brave-Origin\Application\brave.exe` (the script drives it headless over CDP; one-shot `--screenshot` mode is broken on this build and is deliberately not used).
