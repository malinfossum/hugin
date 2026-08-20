# Hugin v3 — the generalization pivot

2026-08-20 · Status: approved (decisions taken with Malin in-session)

Hugin stops being a GET Prepared-shaped tool and becomes a job radar for anyone: generalized statuses, starring, bilingual UI, format-choice data extract, own theme, single-exe distribution. Functionality-first, but visual quality is an explicit goal.

## Decisions (Malin, 2026-08-20)

1. **De-GET-ify the whole tool** — web AND CLI. The Preparelogg-specific export (Søkt selv / Bedt GET tables, Route attribution) is removed; the weekly routine is served by the new extract's Applied table.
2. **Status model**: `Active` (found) → `Applied` → `Answered`; independent ⭐ `Starred` flag on any entry ("want to apply"); sorting: starred first / deadline / updated / name. Migration maps Funnet→Active, SoektSelv→Applied, BedtGetSjekke→Applied, Svar→Answered; `OutreachRoute` is dropped.
3. **Language**: EN + NO, auto-detected from the browser on first visit, visible toggle, choice persisted (localStorage). NO labels: Aktiv / Søkt / Svar.
4. Renames: "Funnet"→Active/Aktiv; the "Pipeline" view → **Applications / Søknader**.
5. **Extract replaces export**: formats `.txt` / `.md` / `.json`; scopes **newest** (since the review mark), **category** (one NAV category's active ads), **everything** (companies + ads + tracker). Downloaded as a file (Content-Disposition) with copy-to-clipboard for the text formats. The `.md` everything/tracker output includes an Applied table (date, company, website, reason, answer) — Preparelogg-compatible by copy-paste.
6. **Links**: every company row/detail always offers a working link: verified website when present, else labeled **Proff.no** and **Google** search links plus a muted "no own website / har ikke egen nettside" note. No crawling.
7. **Theme**: base = DS "Daily"; a dedicated **Hugin palette** is created in the workbench DS (canonical) and consumed here via `data-palette="hugin"`. Heading scale reduced (first pass was too large). "Daily" also becomes the DS default (consumers pinning palettes unaffected).
8. **Distribution**: self-contained single-file `Hugin.exe` (win-x64, wwwroot embedded, no runtime install) as the headline release asset; the existing zip remains.
9. CLI: text stays bokmål; status slugs become `active | applied | answered`; `hugin export` becomes the extract command surface (`hugin export [--format md|txt|json] [--scope new|category:<name>|all]`, default md/all).

## Contracts

- `PipelineStatus { Active, Applied, Answered }`; `PipelineEntry` gains `bool Starred`, loses nothing else; `Route` column dropped in the migration after mapping.
- API: status slugs `active|applied|answered`; `PUT /api/pipeline/{orgnr}` body gains `starred: bool?` (null = unchanged); `GET /api/extract?scope=new|category|all&category=<name>&format=txt|md|json` → file response; old `/api/export` removed.
- Frontend i18n: hand-rolled (no libs) — `src/i18n/{nb,en}.ts` string tables, `useT()` hook + `LanguageProvider`, `<html lang>` kept in sync, toggle in the topbar.
- Link fallback builds URLs client-side: `https://www.proff.no/search?q=<name>` and `https://www.google.com/search?q="<name>" <kommuneNavn>`.

## Stress notes (four lenses, applied)

- **Security**: extract endpoint is GET-only behind the existing Host/loopback model; filenames are server-chosen constants (no user input in Content-Disposition); JSON serializes DTOs, never EF entities. Search-link URLs are `encodeURIComponent`-escaped; `rel="noopener noreferrer"` everywhere.
- **Privacy**: extract includes the personal tracker only in `all` scope — same data the owner already holds locally; nothing leaves the machine.
- **A11y**: language toggle is a labeled button group reflecting state (`aria-pressed`), `<html lang>` switches with it; star is a real button with accessible name (Star/Fjern stjerne ↔ localized), never color/icon-only; sort control is a labeled `<select>`.
- **Loopholes**: migration is one-way (Route data folded into Applied) — the pre-migration db is preserved by a `.bak` copy the migration step writes first; star survives status edits (test); extract of an empty scope produces a valid empty document, not an error; language files drift is guarded by a test asserting both tables have identical key sets.

## Out of scope (recorded)

Branding assets (icon, banner, OG) — separate effort, noted in memory. Cloud/hosted variant — previously rejected. CLI localization to EN.
