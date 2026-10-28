# Hugin reference

The details behind the [README](../README.md): the dashboard, host flags, the CLI first run, the localhost API and every `hugin.json` field.

## Web dashboard

Browse active ads, the company inventory (one row per company, branches as tabs on the detail page), and the Applications view; track outreach through `Watching` → `Applied` → `Answered` (the CLI value is still `active`; a `Watching` entry whose ads have all expired moves to `Expired` on its own, and back when a new ad appears), star the ones you want to apply to, link an ad by hand to the company you track when the registry chain does not join them, and download a data extract (`.md`/`.txt`/`.json`). Settings manages the link-out Sources; language (English/bokmål) and dark/light theme are the two toggles in the top bar. Both default from your browser and remember your choice. Every view is a real URL, so back/forward, reload, and deep links work. The display filter (Settings → Visningsfilter) is a per-browser lens over what the dashboard and the company list show: any number of fylker, each whole or narrowed to chosen kommuner, plus NAV categories. It is edited in Settings only; the company list shows the current choice and links there.

`--port` picks the port (default `5111`), `--config <path>` points at a different `hugin.json`, `--no-browser` skips the launch. For development, run `dotnet run --project Hugin.Api` and `cd hugin-web && npm run dev` side by side.

`--public --state <dir>` runs the **hosted demo mode**: all interfaces, every write refused, config and seed file read from `<dir>`, database snapshot persisted there after each sync. It is for the demo server only. Never run it on a machine holding a real pipeline. It serves everything in the state dir to anyone who reaches the port.

## CLI first run

A fresh install has no coverage until it is chosen. Choose it in the dashboard, or by hand under `municipalities` in `hugin.json`; `hugin sync` prints how before it exits. The first sync then sets a baseline, so `hugin new` starts empty rather than listing the whole register. Browse that initial inventory with `hugin list --companies`. `--config <path>` works here too; the database is created next to the config.

## The localhost API as a machine interface

The dashboard host also exposes its data as plain HTTP/JSON over the same `hugin.db`. It suits scripting or AI/tooling integration against your own data. It binds to loopback only, and every state-changing request requires an `X-Hugin: 1` header. It is CSRF protection, not authentication: local processes are trusted.

- **Read:** `/api/status`, `/api/ads`, `/api/new`, `/api/companies`, `/api/companies/{orgnr}`, `/api/pipeline`, `/api/extract`, `/api/sources`, `/api/sync/status`, `/api/kommuner`, `/api/config/discovery`, `/api/config/focus`, `/api/config/focus/recommended`
- **Write:** `PUT /api/pipeline/{orgnr}` · `POST|PUT|DELETE /api/sources` (+ `/reorder`) · `POST|DELETE /api/ads/{feedId}/hide` · `PUT|DELETE /api/ads/{feedId}/link` · `POST /api/seen` · `POST /api/sync` (`?full=1` for a full backfill) · `PUT /api/config/discovery` · `PUT /api/config/focus` · `GET /api/config/focus/preview` (side-effecting, needs `X-Hugin: 1` too) · `POST /api/reset` · `POST /api/first-run-dismissed`
- **Paging:** `/api/companies` without `limit` returns the full list. With `limit` (and `offset`) it returns one page of grouped companies, `{ total, groups: [{ main, branches }] }`, kept to the configured coverage (companies left from a wider coverage chosen earlier stay in the store but out of the page, and out of `/api/status`'s count) and filtered by the optional `fylker`/`kommuner` (comma-separated), `q`, `website=has|none` and `ads=open`.

## Configuration

`hugin.json` sits beside the exe (start from `hugin.json.example`):

| Field | What it does |
|---|---|
| `municipalities` | `{ "name", "number" }` pairs of Brreg kommune numbers to watch |
| `fylker` | 2-digit fylke codes. Each expands to every kommune in the fylke |
| `allOfNorway` | `true` watches every kommune in the register |
| `naeringskoder` | SN2025 industry codes; a prefix like `"62"` matches every sub-code |
| `keywords` | The ad-title recall net. It can stay broad because `categories` narrows it |
| `categories` | NAV occupation categories (default `["IT"]`) filter out keyword coincidences; uncategorized ads always pass |
| `linkouts` | `{ "label", "url" }` pairs, imported into the dashboard's Sources on first run only; manage them under Settings afterwards |
| `navToken` | `null` fetches NAV's rotating public token automatically; set a registered token instead |

`municipalities`, `fylker` and `allOfNorway` are editable from the dashboard (first-run dialog and Settings → Dekning); `naeringskoder` and `keywords` are editable from Settings → Fokus, with a per-code company-count preview from Brreg and a "Legg til anbefalte" button that adds the curated default set. `categories`, `navToken` and `linkouts` stay hand-edited. Saving from the UI rewrites only the changed keys and keeps everything else as it was, after backing the file up to `hugin.json.bak`.

Settings → Nullstilling resets in two levels. The first clears the coverage (`municipalities`, `fylker`, `allOfNorway`) so the first-run dialog asks again, and keeps the database. The second deletes everything: it snapshots the database to `hugin.db.reset-<timestamp>.bak` first, then wipes the companies, ads, pipeline and review marks. To restore a snapshot, stop the app and rename `hugin.db.reset-<timestamp>.bak` to `hugin.db`, replacing the current file, before relaunching.

A full NAV backfill button in Settings → Fokus walks the entire feed history to pick up ads matching a widened keyword list. It takes minutes and recovers open ads only. NAV returns closed ads content-stripped.

Municipality numbers come from [Brreg's kommune register](https://data.brreg.no/enhetsregisteret/api/kommuner?size=400).
