---
version: 1
slug: "hugin-web-src-views-dashboard-dashboardview-tsx"
primary_target: "hugin-web/src/views/dashboard/DashboardView.tsx"
related_targets: []
---

# Dashboard

Scope: the dashboard route (`/`), the first surface of the Hugin redesign. Visitor mode: Operate.
Audience: the daily user doing the morning round, and the cold demo visitor judging the product (equal weight, see PRODUCT.md).
Task: see what changed since the last "Mark as seen", what needs action, and every open deadline in time; then mark as seen.
Constraints: WCAG 2.2 AA; standard web controls (shadcn on Base UI in the build); no Norse costume, no gamification; expired ads never shown as active.
Approved prototype (finish review: ship): `docs/design/dashboard-prototype.html` (static, real demo data snapshot). Production build target: `hugin-web/src/views/dashboard/`.

## Direction contract

THESIS: The morning delta on one map sheet. Every open ad is a lifeline from the day it appeared to its frist, all on one time scale, with the seen mark as a line the user moves. It refuses the card-grid dashboard of KPI tiles and bordered panels.

OWN-WORLD: A Kartverket topographic sheet. Warm-grey paper, ink, and map colours with jobs only: contour brown for time, open ads and the seen mark; forest for new; lake for applied; rust for closing within 7 days. Hairlines instead of panels. Hanken Grotesk; small caps for month and kommune labels; an alternating week scale bar. Dark theme is a night map of the same hues.

STORY: Read the delta headline, see the one thing that needs action, read each deadline against today, check arrivals by kommune, press Mark as seen.

FIRST VIEWPORT: Top bar with nav and theme/language; demo line; delta headline left with sync meta, Sync now and Mark as seen right; needs-action sentence; Deadlines sheet with titles in a 360px column and lifelines under the scale bar, today line, dashed seen mark and a forest wash between; arrivals by kommune below.

FORM: Topographic Sheet, 2nd of the safer-register lineup, user-chosen. seed:2d77ba6b683f9e97. Signature interaction: Mark as seen (after a popover confirm) slides the seen line to today and the wash collapses.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
