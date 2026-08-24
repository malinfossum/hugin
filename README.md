# Hugin

Hugin is a job radar for the Norwegian developer job market: it watches public registries for new companies and job ads in your region and tracks your outreach pipeline — from the command line or a local web dashboard.

Named after Odin's raven of thought, who flies out each morning and returns with tidings — while his sibling Munin remembers.

## Stack

C# / .NET 10, EF Core with SQLite, NUnit; the dashboard is ASP.NET Core with a React + TypeScript frontend (Vite, Vitest). Layered: `Hugin.Core` holds the domain and has no I/O; `Hugin.Infrastructure` is the I/O boundary (database, HTTP clients, config); `Hugin.Console` and `Hugin.Api` are thin hosts; `Hugin.Tests` covers it all.

## Quick start

Get it from the [Releases page](https://github.com/malinfossum/hugin/releases):

- **`Hugin.exe`** — single self-contained file, dashboard only, frontend included. No .NET install needed. Put it anywhere, add a `hugin.json` beside it (start from `hugin.json.example`), double-click it. The dashboard opens in your browser at `http://localhost:5111`.
- **Zip** — `hugin.exe` (CLI) + `hugin-api.exe` (dashboard) sharing one `hugin.json`/`hugin.db`. Requires the [.NET 10 runtime](https://dotnet.microsoft.com/download/dotnet/10.0). Double-click `hugin-api.exe` for the dashboard, or use `hugin.exe` from a terminal.

`hugin.json` and the `hugin.db` database are gitignored — the pipeline holds your own outreach history. See [Configuration](#configuration) below.

## CLI-only usage

| Command | What it does |
|---|---|
| `hugin sync [--full]` | Pulls companies from Brreg and job ads from the NAV feed. `--full` walks the entire feed history — run it once after setup to load every currently-open ad; interrupted runs resume |
| `hugin new [--seen]` | Everything first seen since the last review; `--seen` advances the mark |
| `hugin track <orgnr> <status>` | Sets pipeline status: `active`, `applied`, `answered`. Options: `--why`, `--note`, `--svar` |
| `hugin list [--status <s>]` | Shows the pipeline; `--companies [--kommune <nr>]` browses the full synced inventory; `--ads [--kommune <nr>]` lists currently-open ads |
| `hugin export [--format md\|txt\|json] [--scope new\|category\|all] [--category <navn>] [--include-active]` | Writes data to stdout (default: `md`/`all`); `--scope category` requires `--category`; `--include-active` includes pipeline entries with status `Active` in the Søkt/tracker section (excluded by default) |

`--config <path>` points at a different `hugin.json`. The database is created next to it.

The first sync sets a baseline, so `hugin new` starts empty rather than listing every company in the register. Use `hugin list --companies` to browse that initial inventory, and `hugin sync --full` once to backfill every open job ad from the feed's history — after that, plain `hugin sync` keeps up day to day.

## The localhost API as a machine interface

`hugin-api.exe` (or `Hugin.exe`) also exposes its data as a plain HTTP API over the same `hugin.db` — JSON in, JSON out, suitable for scripting or AI/tooling integration against your own data. It binds to loopback only, so nothing outside the machine can reach it, and every state-changing request requires an `X-Hugin: 1` header (the dashboard's own frontend sets it; a stray browser tab can't). This is CSRF protection, not authentication — any process already running on the machine is trusted.

| Endpoint | What it does |
|---|---|
| `GET /api/status` | Sync timestamps, review mark, active-ad/company/pipeline counts, configured linkouts |
| `GET /api/ads` | Active ads (`?kommune`, `?hidden`) |
| `GET /api/new` | Companies and ads first seen since the last review mark |
| `GET /api/companies` | Full synced company inventory (`?kommune`) |
| `GET /api/companies/{orgnr}` | One company plus its ads |
| `GET /api/pipeline` | Pipeline entries (`?status`) |
| `GET /api/extract` | Downloadable data extract (`?scope`, `?format`, `?category`, `?includeActive`) |
| `GET /api/sync/status` | Whether a background sync is currently running |
| `PUT /api/pipeline/{orgnr}` | Sets pipeline status for a company |
| `POST /api/ads/{feedId}/hide` | Hides an ad from the dashboard view |
| `DELETE /api/ads/{feedId}/hide` | Unhides an ad |
| `POST /api/seen` | Advances the review mark |
| `POST /api/sync` | Starts a background sync run |

## Configuration

`hugin.json` sits beside the exe (start from `hugin.json.example`):

| Field | What it does |
|---|---|
| `municipalities` | Array of `{ "name", "number" }` — Brreg kommune numbers to watch. Add one by appending an entry, e.g. `{ "name": "Larvik", "number": "3909" }` |
| `fylker` | 2-digit fylke codes (e.g. `"39"` for Vestfold og Telemark) — expands discovery to every kommune in the fylke, resolved against the synced kommune register |
| `allOfNorway` | `true` watches every kommune in the register — the widest scope |
| `naeringskoder` | SN2025 industry codes; a prefix such as `"62"` matches every sub-code beneath it |
| `keywords` | The ad-title recall net — can stay broad, `categories` narrows it |
| `categories` | NAV's occupation categories (default `["IT"]`) filters out keyword coincidences like *prosjektutvikler massivtre*; ads NAV hasn't categorized always pass. `hugin list --ads` groups results by category |
| `linkouts` | `{ "label", "url" }` pairs for sources Hugin can't fetch itself (finn.no, proff.no) — shown as a manual-check reminder in `hugin new` and the dashboard |
| `navToken` | `null` fetches NAV's rotating public token automatically; set a registered token here instead |

Municipality numbers come from [Brreg's kommune register](https://data.brreg.no/enhetsregisteret/api/kommuner?size=400).

## Data sources

- **Enhetsregisteret** (Brønnøysundregistrene) — open company data, no authentication. Both hovedenheter and underenheter are read, because regional branch offices are registered as underenheter of parents elsewhere.
- **NAV stillingsfeed** (arbeidsplassen.no) — job ads under the [API terms](https://arbeidsplassen.nav.no/vilkar-api). Hugin stores the deep-link NAV requires, marks ads inactive as the feed reports them gone, and never presents an expired ad as active. A rotating public token is fetched automatically; a registered token can be set as `navToken`.

Ads posted only on finn.no are not in the NAV feed, and neither finn.no nor proff.no permits scraping — configure them as `linkouts` instead, and Hugin will remind you to check them by hand.

## Web dashboard

A localhost dashboard over the same `hugin.json` / `hugin.db` as the CLI — browse the **Applications** (Søknader) view, active ads, and company inventory, track outreach through `Active` → `Applied` → `Answered`, star the ones you want to apply to, sort the list, and download a data extract (`.md`/`.txt`/`.json`), all from a browser instead of the terminal. English and Norwegian (bokmål) are both built in, and a dark/light theme toggle sits next to the language switch in the topbar — both pick a default from your browser and remember your choice after that.

`--port` picks the listening port (default `5111`); `--config <path>` points at a different `hugin.json`, same as the CLI; `--no-browser` skips the automatic browser launch. Closing the console window stops it.

For local development, run the API and the Vite dev server side by side:

```bash
dotnet run --project Hugin.Api
cd hugin-web && npm run dev
```

## Build from source

Needs the [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0) and Node for the frontend:

```bash
git clone https://github.com/malinfossum/hugin.git
cd hugin
cp hugin.json.example hugin.json
```

```powershell
.\build.ps1
```

This runs `npm run build` in `hugin-web`, publishes `Hugin.Console` and `Hugin.Api` into `publish\`, and publishes a self-contained, single-file `Hugin.exe` (frontend embedded) into `publish-single\`. Run the dashboard:

```bash
publish\hugin-api.exe
# or, the single-file build:
publish-single\Hugin.exe
```

## Tests

```bash
dotnet test
```
