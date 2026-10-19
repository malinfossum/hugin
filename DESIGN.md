---
name: Hugin
description: A local-first job radar; the morning delta drawn on one topographic map sheet.
colors:
  paper: "#f6f6f3"
  sheet: "#fbfbf9"
  wash: "#eeede8"
  rule: "#e2e1db"
  rule-strong: "#c9c6bb"
  ink: "#22262a"
  ink-secondary: "#555a5f"
  ink-tertiary: "#686c71"
  contour: "#76593c"
  forest: "#4a6b46"
  forest-wash: "rgb(74 107 70 / 0.15)"
  lake: "#2f6a8f"
  rust: "#a24b16"
  rust-wash: "rgb(162 75 22 / 0.07)"
  danger: "#b3261e"
  select: "rgb(47 106 143 / 0.18)"
  paper-dark: "#171918"
  sheet-dark: "#1c1f1d"
  wash-dark: "#232624"
  rule-dark: "#2c302d"
  rule-strong-dark: "#454a46"
  ink-dark: "#e8e7e2"
  ink-secondary-dark: "#b0b0a8"
  ink-tertiary-dark: "#9a9a92"
  contour-dark: "#c9a882"
  forest-dark: "#97c290"
  forest-wash-dark: "rgb(151 194 144 / 0.12)"
  lake-dark: "#8bbadb"
  rust-dark: "#e6935f"
  rust-wash-dark: "rgb(230 147 95 / 0.08)"
  danger-dark: "#f28b82"
  select-dark: "rgb(139 186 219 / 0.25)"
typography:
  headline:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "34px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  headline-narrow:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    letterSpacing: "-0.01em"
  brand:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 700
  body:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  row-title:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: 1.3
  body-secondary:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
  meta:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.3
  small:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
  map-label:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    letterSpacing: "0.1em"
  scale-figure:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    fontFeature: "\"tnum\" 1"
rounded:
  focus: "3px"
  control: "6px"
  popover: "8px"
  dot: "50%"
spacing:
  edge: "48px"
  edge-narrow: "18px"
  content-max: "1320px"
  title-column: "360px"
  title-column-medium: "280px"
  topbar: "64px"
  row-min: "70px"
  gap-xs: "4px"
  gap-sm: "8px"
  gap-md: "12px"
  gap-lg: "16px"
  section-sm: "28px"
  section-md: "36px"
  section-lg: "56px"
  section-xl: "64px"
components:
  button:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    typography: "{typography.body-secondary}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  button-hover:
    backgroundColor: "{colors.wash}"
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  icon-button:
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.control}"
    size: "44px"
  icon-button-hover:
    backgroundColor: "{colors.wash}"
    textColor: "{colors.ink}"
  nav-link:
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.control}"
    padding: "6px 12px"
  nav-link-active:
    backgroundColor: "{colors.wash}"
    textColor: "{colors.ink}"
  select:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 10px"
    height: "44px"
  popover:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.popover}"
    padding: "16px"
  map-label:
    textColor: "{colors.contour}"
    typography: "{typography.map-label}"
  deadline-row:
    padding: "14px 20px 14px 0"
    height: "70px"
  deadline-row-hover:
    backgroundColor: "{colors.wash}"
---

# Design System: Hugin

## Overview

**Creative North Star: "The Topographic Sheet"**

Hugin is a map sheet, not a dashboard. The page is warm-grey paper with ink on it, and the only colours are the map's own: contour brown, forest, lake and rust, each with one job. Structure comes from hairlines and alignment, the way a printed sheet separates its parts, never from boxed panels or tiles. Time is the main axis: every open ad is drawn as a lifeline from the day it appeared to its frist, under one alternating week scale bar, with a solid today line and a dashed seen mark the user moves.

Density is that of a working map: a daily tool, read in a short morning session, so rows are compact (70px), figures are tabular, and the type stays in one family at modest sizes. Emphasis comes from weight and from the map colours, not from size jumps or decoration. The dark theme is the same sheet at night: same hues, lifted in lightness and muted in chroma, never glowing.

The world refuses the card-grid dashboard: KPI tiles, bordered or filled content panels, filled callouts and coloured side stripes. It refuses synthesized small caps (map lettering is real uppercase, tracked) and neon-on-dark.

**Key Characteristics:**
- Warm-grey paper (light) or night-map charcoal (dark), ink text, four map colours with one job each.
- Hairline rules (1px) separate everything; no content sits inside a card.
- One content edge at 48px, a 360px title column, and a second edge where the scale bar and lifelines begin.
- Time drawn, not listed: lifelines, a week scale bar, a today line and a movable seen mark.
- Hanken Grotesk throughout; tracked uppercase map lettering for months and kommuner.
- Motion is rare and meaningful: the seen mark sliding to today is the signature.

## Colors

A muted survey-map palette: neutral warm greys and ink, with four desaturated map hues that each carry exactly one meaning.

### Primary
- **Survey Ink** (`ink` / `ink-dark`): all primary text, the today line, the primary button fill (with `paper` as its text). Ink is the system's primary action colour; there is no brand accent.

### Secondary (the map colours: one job each)
- **Contour Brown** (`contour` / `contour-dark`): the map's own lettering and its time furniture. Month labels on the scale bar, kommune labels in arrivals, open (not closing, not applied) lifelines and their frist tick, the dashed seen mark and its label.
- **Forest** (`forest` / `forest-dark`): new since the last Mark as seen. The counts in the delta headline, a new ad's past lifeline (1.5px) and filled start dot, the "New" state label, "New ad" in arrivals, a highlighted arrival. **Forest Wash** (`forest-wash`) fills only the time band between the seen mark and today.
- **Lake** (`lake` / `lake-dark`): applied, in data (the "Applied" state label, an applied ad's future lifeline and tick). Lake is also the interaction colour: focus ring, caret, native `accent-color`, and (as `select`) the text-selection fill. It never marks anything else.
- **Rust** (`rust` / `rust-dark`): closing within 7 days. The future lifeline (3px, one step heavier than the others), tick and frist figure of a closing ad, and the run-in "Needs action." lead of the needs-action sentence. `rust-wash` is defined for closing-zone use but unused on the dashboard; reach for it only for the same meaning.
- **Danger** (`danger` / `danger-dark`): errors and actions that cannot be undone. The warning mark beside a failure sentence, and the destructive buttons of the reset section and their confirms. A crimson, a clear step in hue from rust so the two never read as one; it is not a map colour and never marks data. Clears 5.6:1 on wash in light and 6.4:1 in dark.

### Neutral
- **Map Paper** (`paper`): the page. Also the hollow fill of a not-new start dot and the text on ink buttons.
- **Sheet** (`sheet`): one step lighter; controls (buttons, select) and the floating confirm popover sit on it.
- **Wash** (`wash`): hover and current-state fill for nav links, icon buttons, buttons and deadline rows.
- **Hairline** (`rule`): every section and row divider.
- **Strong Hairline** (`rule-strong`): control borders, link underlines at rest, the scrollbar thumb. Never a line that carries data.
- **Ink Secondary** (`ink-secondary`): meta lines, captions, row subtitles, row actions, nav at rest; the scale bar's segments in light.
- **Ink Tertiary** (`ink-tertiary`): scale-bar date figures, empty-state text, the start-dot outline and a not-new past lifeline; the scale bar's segments in dark. Every text pairing measured clears 4.5:1 on paper and wash in both themes (lowest: ink-tertiary on wash, 4.51:1).

When the app's shadcn roles move to this world, map them: background → paper, foreground → ink, card/popover → sheet, muted/accent (hover wash) → wash, muted-foreground → ink-secondary, border → rule, input → rule-strong, ring → lake, primary → ink, primary-foreground → paper, destructive → danger.

### Named Rules
**The One Job Rule.** Each map colour means one thing: contour is time and map lettering, forest is new, lake is applied (and the interaction layer), rust is closing within 7 days. Danger, outside the map, means an error or an action that cannot be undone. A colour that appears somewhere must mean its job there. Never use a map colour for decoration or for a second data meaning.

**The Never Only Colour Rule.** Every coloured state also has a word, a figure or a line style: "New", "Applied" and "Watching" as text, "3 days" in weight 600 beside a rust frist and a heavier closing line, today solid versus seen dashed, a legend under the sheet. Colour is never the only signal.

**The Night Map Rule.** Dark is the same sheet at night: the same four hues raised in lightness and lowered in chroma, on near-neutral charcoal. No neon, no glows, no pure black.

## Typography

**Display Font:** none separate; headings use Hanken Grotesk at weight 600.
**Body Font:** Hanken Grotesk (with system-ui, sans-serif), weights 400, 500, 600, 700.

**Character:** One humanist grotesk doing every job, the way a map sheet uses one lettering family at several weights. The type is quiet; the map colours and the lifelines carry the drama.

The prototype loads Hanken Grotesk from Google Fonts; the shipped app must self-host the font files (400, 500, 600, 700, latin and latin-ext for æ, ø, å) and bundle them, because the product runs offline as a single executable. No runtime request to a font CDN.

### Hierarchy
- **Headline** (600, 34px, 1.15, -0.02em; 26px below 760px): the delta headline, one per view, balanced, max 26ch. Counts inside it are set in forest, not italic.
- **Title** (600, 20px, -0.01em): section heads ("Deadlines", "Arrived since…"), followed on the same baseline by a 15px ink-secondary caption.
- **Brand** (700, 18px): the wordmark beside the 32px raven.
- **Body** (400, 16px, 1.5): running text.
- **Row title** (500, 16px, 1.3): item titles in lists and deadline rows; single line with ellipsis on wide screens, wrapping on narrow.
- **Body secondary** (400 or 500, 15px): the needs-action sentence, section captions, button labels (500), popover text.
- **Meta** (400, 14px): sync meta lines, row subtitles, frist figures beside lifelines, select and filter labels, footer. Bold figures inside meta go to ink at 500.
- **Small** (400, 13px): row actions, legend, mark labels, arrival sublines.
- **Map label** (600, 12px, 0.1em, uppercase): month names on the scale bar and kommune names over arrivals, in contour. Nothing else.
- **Scale figure** (400, 12px, tabular): week dates under the scale bar, "since" labels (in ink-secondary).

Tabular figures (`font-variant-numeric: tabular-nums`) on every date, count and scale figure.

### Named Rules
**The Map Lettering Rule.** Tracked uppercase (12px, 600, 0.1em) belongs to place and time names on the map: months and kommuner. It is never a section kicker, an eyebrow, a button style or a status label.

**The Real Caps Rule.** Map lettering is real uppercase with tracking. Never synthesize small caps (`font-variant: small-caps` on a family without them).

## Layout

One content column, max 1320px, centred, with a 48px side edge (18px below 760px). Every section starts on that one edge; the top bar, demo line, headline, needs-action sentence, sheet, arrivals and footer all align to it.

Inside the column the sheet uses a two-column grid: a 360px title column (280px at 760–1100px) and the time field. The left edge of the time field is the second edge: the scale bar, every lifeline, the today line and the seen mark start there, and arrivals' kommune columns start on the same line, with the arrivals heading and caption in the 360px column beside them. Below 760px the grid collapses to one column: title above, lifeline below (40px tall), the scale bar grows to 84px with its labels stacked, and the overlay marks are redrawn per row.

Vertical rhythm by section: 28px before the needs-action sentence, 36px before the sheet, 56px before arrivals, 64px before the footer. The top bar is 64px tall. Deadline rows are at least 70px with 14px block padding and 20px between title and time field. Gaps inside groups step 4, 8, 10, 12, 16px; arrival columns are 32px apart (4 columns, 2 at ≤1100px, 1 at ≤760px).

### Named Rules
**The Two Edges Rule.** There is one content edge and one time edge. Content that is not drawn in time aligns to the content edge; anything drawn in time, or listed beside the title column, starts at the 360px time edge. Don't introduce a third.

**The Scale Bar Rule.** Time is read off one scale bar per sheet: alternating filled and hollow 4px week segments starting on Mondays (ink-secondary in light, ink-tertiary in dark), a 12px tabular date under each Monday (every other date hidden on narrow), and contour map-label month names above. Every lifeline on the sheet uses that same scale; never give rows their own scale. A company's ad history spans months or years, so its sheet reads off a bar of alternating whole months instead (the same 4px segments), with years in contour map lettering above it at each January and short month names under it while they fit (every month up to a year, every quarter up to three years, none past that).

**The Lifeline Rule.** A lifeline runs from the day an ad appeared to its frist. The past (appeared to today) is a 1px ink-tertiary line, or 1.5px forest if new; it starts at a 7px dot (hollow ink-tertiary, or filled forest if new) or, if it began before the window, fades in over 40px with a "since" label in ink-secondary (it can sit on the forest wash, where ink-tertiary falls under 4.5:1). The past carries data, so it never takes a hairline tone: strong hairline measures 1.6:1 on paper. The future (today to frist) is 2px in the ad's one colour (contour open, lake applied) and ends in a 2×12px tick with the frist and days left beside it (flipped above the line near the right edge). A closing future is 3px rust with a 3×12px tick and its days left in weight 600: rust and contour sit too close in lightness to be told apart by hue alone. Closing beats applied: an applied ad closing within 7 days is rust.

## Elevation & Depth

The sheet is flat. Depth is carried by hairlines, the wash fill and the paper/sheet tonal step, not shadows. The single shadow belongs to floating layers (the Mark as seen confirm popover), which sit above the sheet and must read as lifted off it.

### Shadow Vocabulary
- **Floating layer** (`0 10px 28px rgb(34 38 42 / 0.12), 0 2px 6px rgb(34 38 42 / 0.06)`; dark `0 10px 28px rgb(0 0 0 / 0.4), 0 2px 6px rgb(0 0 0 / 0.25)`): popovers, menus, dialogs. Never on in-flow content.

### Named Rules
**The Hairline Not Panel Rule.** Sections and rows are separated by 1px `rule` lines (top and bottom borders), never by enclosing boxes, filled panels or shadows.

## Shapes

Mostly square: the page has no rounded containers because it has no containers. Interactive controls take a gentle 6px radius (buttons, select, nav links, icon buttons), the floating popover 8px, and the focus ring 3px. The only round form is the 7px lifeline start dot. Lines carry the form language: 1px hairlines, 1.5–2px lifelines, a 1px solid today line, a 1px dashed seen mark.

## Components

### Buttons
Quiet, paper-toned, labelled with a 16px stroke icon and a word.
- **Shape:** gently rounded (6px), 44px tall (the touch-target floor; full-width on narrow where a view says so), 16px inline padding, 8px icon gap, 15px weight 500.
- **Default:** sheet fill, 1px strong-hairline border, ink text. Hover goes to wash.
- **Primary:** ink fill, ink border, paper text; hover drops to 0.86 opacity. One primary per view or section: Mark as seen on the dashboard, a section's Save in Settings, Download in Export.
- **Destructive:** danger text on a 10% danger wash (20% at night); the reset levels and their confirms only.
- **Disabled:** 0.4 opacity, default cursor (Mark as seen after the mark has moved).
- **Icon button:** 44px square, wash on hover; theme and language toggles, move up and down, a chip's remove, a disclosure.

### Text actions
Row actions, the needs-action jump and similar secondary actions are underlined text buttons: ink-secondary, underline in strong hairline at 3px offset, ink on hover, at least 24px tall.

### Inputs / Fields
- **Select:** native, sheet fill, 1px strong-hairline border, 6px radius, 44px tall, 14px weight 500 ink text, a drawn chevron; paired with a 14px ink-secondary label, inline in a filter line, above the field in a form.
- **Text field and text area:** the select's fill, border and radius, 44px tall (the area at least 96px), with the label above.
- **Checkbox:** native, 18px, lake through `accent-color`, in a 44px row with its label; groups sit in an unboxed fieldset with a 14px weight-500 legend.
- **Focus:** the global focus ring (below).

### Navigation
Top bar: the 32px raven and wordmark, then text links (6px 12px, 6px radius) in ink-secondary; hover and current page get wash fill and ink, current page also weight 500. Tools (language, theme) are icon buttons at the right. A 1px hairline closes the bar. On narrow, nav moves to its own horizontally scrolling line.

### Deadline rows and row actions
A row is a title cell (title, then a 14px subline of state label and "employer · kommune") and a lifeline cell, separated from its neighbours by a top hairline. Row actions (Watch, Link to company, Hide) sit under the subline at 13px, hidden until the row is hovered or contains focus, fading in over 150ms; on touch devices (`hover: none`) they are always visible. Hover (or a linked highlight) fills the whole row with wash, bleeding 12px left past the content edge so the title does not sit on the wash's edge. A row linked from elsewhere (needs-action, an arrival) lights the same way; the needs-action jump scrolls the row to centre and lights it for 1.8s.

State labels are words in weight 600: "New" in forest, "Applied" in lake, "Watching" in ink.

### Needs-action sentence
One plain sentence between two hairlines (12px block padding, 15px), starting with a rust weight-600 run-in "Needs action." and naming the ad, its frist and days left, and why. A text action ("Show in deadlines") sits at the right. It is never a filled panel, a coloured box, an icon alert or a side-striped callout.

### Arrivals by kommune
Columns headed by a contour map label with the count at the right (14px, ink-secondary, tabular, normal case) over a hairline. Items are 500-weight links with a 13px ink-secondary subline; new ads lead their subline with "New ad" in forest. Empty kommune: "Nothing new" in ink-tertiary.

### Popover (confirm)
Sheet fill, 1px hairline border, 8px radius, 16px padding, floating-layer shadow, 310px wide (full width on narrow), anchored under its trigger. Plain sentence, then Cancel and the primary action right-aligned. Focus moves to the primary action on open; Escape, Cancel and outside click close it and return focus to the trigger.

### Mark as seen (signature interaction)
The seen mark is a 1px dashed contour line through the whole sheet, labelled "Seen 9 Oct" under the sheet and on the scale bar; the forest wash fills the band from it to the today line. Pressing Mark as seen opens the confirm popover ("The seen mark moves to now… can't be undone."). Confirming slides the seen line to today and collapses the wash (left, width and opacity) over 700ms on `cubic-bezier(0.16, 1, 0.3, 1)`; then the headline, rows and arrivals re-render to the new state (arrivals dim to 0.45 over 600ms) and the button disables. Under `prefers-reduced-motion: reduce` the transitions are removed and the state changes at once.

### Ad history sheet
A company's ads drawn on one month scale that holds the whole history and today, with the today line through it and a legend under it. Rows follow the deadline rows: title (a link to the ad when there is one) and a subline with the state, published date and frist, so every date is also text. An open ad's past runs to today and its future in its tone, with days left beside the tick; an expired ad is drawn all past, in ink-tertiary, ending in a 1px tick, and its title drops to ink-secondary.

### Legend
A key under each sheet, after a hairline: 20px line samples in each map colour, the wash, and the dashed seen mark, each with its meaning in 13px ink-secondary. Any view that draws lifelines carries it.

### Sheet rows
Lists that are not drawn in time (companies, the sources in Settings) are rows between hairlines: the name in weight 500 in the 360px title column, anything beside it from the time edge, quiet facts and counts at the right in 14px ink-secondary. A company row's kommune, from the time edge, is contour map lettering: a place on the map. A whole-row button is at least 52px and takes the wash on hover. On narrow the beside-facts drop to a subline. An expired item's name drops to ink-secondary, so it never reads as active.

### Page head
A view without a delta leads with its own count or name in the headline size (the companies count, the count in Applications; a company's name; Export's name), with its context in a 14px line under it. A view's controls sit right of the head on wide screens (Applications' sort) or under it (Export's form), never above it.

### Settings sections
Settings is one sheet: each section a row under a hairline (the first has none), its title (20px) and hint (15px ink-secondary) in the 360px title column, its controls from the time edge, stacked on narrow. No cards, no side stripes. The sections run in the order the data flows: Coverage (what is fetched), Focus (what is kept), Display filter (what is shown), then Sources, and Reset last.

### Removable chips
An item the person can take out again (an industry code, a keyword, a region in the display filter, coverage outside the shown fylke) is a 44px chip in the select's shape with a 44px ghost × inside. Read-only, the same item is plain weight-500 text: on the sheet only controls get a border.

### Pipeline columns
Applications is four columns on wide screens (two on a tablet, stacked on a phone): Watching, Applied, Answered, Expired, each titled over a hairline with its count at the right. Entries are rows with the company name as a heading, a star toggle, the justification in ink, note and response in ink-secondary, and the last change date in ink-tertiary. Column hints sit under the list as footnotes, so every first row starts on one line.

### Dialogs
Dialogs and confirm dialogs are floating layers like the popover: sheet fill, 1px hairline ring, 12px radius, the floating shadow, at most 90% of the viewport tall. The title (18px, 600) takes focus on open; the actions sit right-aligned under a hairline that sticks to the dialog's foot while a long body scrolls. The backdrop never closes a dialog; Escape and Cancel do.

### Alerts
A failure is a sentence, never a box: a 16px warning mark in danger, the message in 15px ink, a "Try again" text action when there is one, between two hairlines when it stands on its own.

### Focus, selection, scrollbar
- **Focus:** 2px solid lake outline, 2px offset, on every focusable element via `:focus-visible`; shadcn controls draw the same lake as a 3px ring.
- **Selection:** `select` fill (lake at 18%, 25% in dark) with ink text. Caret and native `accent-color` are lake.
- **Scrollbar:** strong-hairline thumb on paper track.
- **Links:** inherit colour, 1px underline in strong hairline at 3px offset, underline goes to currentColor on hover; title and name links are un-underlined until hover.

### Icons
16px stroke icons (1.75 stroke, round caps and joins, currentColor), inline SVG, always beside a word or with an accessible label. The raven is the only filled mark, per the brand rules.

## Do's and Don'ts

### Do:
- **Do** separate sections and rows with 1px `rule` hairlines and nothing else.
- **Do** give each map colour exactly one job: contour for time and map lettering, forest for new, lake for applied and focus, rust for closing within 7 days.
- **Do** pair every coloured state with a word, figure or line style, and carry the legend wherever lifelines are drawn.
- **Do** align content to the one 48px edge and anything drawn in time to the 360px time edge.
- **Do** set dates, counts and scale figures in tabular figures.
- **Do** keep row actions revealed on hover and focus-within, and always visible when `hover: none`.
- **Do** self-host Hanken Grotesk in the shipped app; it runs offline.
- **Do** honour `prefers-reduced-motion` by removing the seen-mark slide and fades.

### Don't:
- **Don't** build cards, KPI tiles or bordered/filled content panels; the dashboard is one sheet.
- **Don't** render needs-action or any alert as a filled callout or a box with a coloured side stripe; it is a sentence between hairlines.
- **Don't** use tracked uppercase for kickers, eyebrows, buttons or status labels; it is map lettering for months and kommuner only.
- **Don't** synthesize small caps.
- **Don't** put a shadow on anything in the page flow; shadow is for floating layers only.
- **Don't** use neon or glowing saturated hues on the dark theme; it is a night map of the same colours.
- **Don't** use a map colour for decoration or a second meaning.
- **Don't** load fonts from a CDN in the shipped app.
