# Hugin

![Hugin — job radar for the Norwegian developer market](docs/brand/banner.png)

Hugin is a job radar for the Norwegian developer job market: it watches public registries for new companies and job ads in your region and tracks your outreach pipeline — from the command line or a local web dashboard.

Named after Odin's raven of thought, who flies out each morning and returns with tidings — while his sibling Munin remembers.

## Stack

C# / .NET 10, EF Core with SQLite, NUnit; the dashboard is ASP.NET Core with a React + TypeScript frontend (Vite, Vitest). Layered: `Hugin.Core` (pure domain, no I/O) · `Hugin.Infrastructure` (database, HTTP clients, config) · `Hugin.Console` and `Hugin.Api` (thin hosts) · `Hugin.Tests`.

## Quick start

Get it from the [Releases page](https://github.com/malinfossum/hugin/releases):

- **`Hugin.exe`** — single self-contained file, dashboard only, no .NET install needed. Put it anywhere, add a `hugin.json` beside it (start from `hugin.json.example`), double-click. The dashboard opens at `http://localhost:5111`.
- **Zip** — `hugin.exe` (CLI) + `hugin-api.exe` (dashboard) sharing one `hugin.json`/`hugin.db`. Requires the [.NET 10 runtime](https://dotnet.microsoft.com/download/dotnet/10.0).

`hugin.json` and the `hugin.db` database are gitignored — the pipeline holds your own outreach history.

## Web dashboard

Browse active ads, the company inventory (one row per company, branches as tabs on the detail page), and the Applications view; track outreach through `Active` → `Applied` → `Answered`, star the ones you want to apply to, and download a data extract (`.md`/`.txt`/`.json`). Settings manages the link-out Sources plus language (English/bokmål) and dark/light theme — both default from your browser and remember your choice. Every view is a real URL, so back/forward, reload, and deep links work.

`--port` picks the port (default `5111`), `--config <path>` points at a different `hugin.json`, `--no-browser` skips the launch. For development, run `dotnet run --project Hugin.Api` and `cd hugin-web && npm run dev` side by side.

## CLI

| Command | What it does |
|---|---|
| `hugin sync [--full]` | Pulls companies from Brreg and ads from NAV. `--full` walks the whole feed history — run once after setup; interrupted runs resume |
| `hugin new [--seen]` | Everything first seen since the last review; `--seen` advances the mark |
| `hugin track <orgnr> <status>` | Sets pipeline status: `active`, `applied`, `answered`. Options: `--why`, `--note`, `--svar` |
| `hugin list [--status <s>]` | Shows the pipeline; `--companies` / `--ads` (each with `--kommune <nr>`) browse the synced inventory |
| `hugin export` | Writes data to stdout. `--format md\|txt\|json`, `--scope new\|category\|all` (`category` needs `--category <navn>`), `--include-active` |

The first sync sets a baseline, so `hugin new` starts empty rather than listing the whole register — browse that initial inventory with `hugin list --companies`. `--config <path>` works here too; the database is created next to the config.

## The localhost API as a machine interface

The dashboard host also exposes its data as plain HTTP/JSON over the same `hugin.db` — suitable for scripting or AI/tooling integration against your own data. It binds to loopback only, and every state-changing request requires an `X-Hugin: 1` header (CSRF protection, not authentication — local processes are trusted).

- **Read:** `/api/status`, `/api/ads`, `/api/new`, `/api/companies`, `/api/companies/{orgnr}`, `/api/pipeline`, `/api/extract`, `/api/sources`, `/api/sync/status`
- **Write:** `PUT /api/pipeline/{orgnr}` · `POST|PUT|DELETE /api/sources` (+ `/reorder`) · `POST|DELETE /api/ads/{feedId}/hide` · `POST /api/seen` · `POST /api/sync`

## Configuration

`hugin.json` sits beside the exe (start from `hugin.json.example`):

| Field | What it does |
|---|---|
| `municipalities` | `{ "name", "number" }` pairs — Brreg kommune numbers to watch |
| `fylker` | 2-digit fylke codes — expands to every kommune in the fylke |
| `allOfNorway` | `true` watches every kommune in the register |
| `naeringskoder` | SN2025 industry codes; a prefix like `"62"` matches every sub-code |
| `keywords` | The ad-title recall net — can stay broad, `categories` narrows it |
| `categories` | NAV occupation categories (default `["IT"]`) filter out keyword coincidences; uncategorized ads always pass |
| `linkouts` | `{ "label", "url" }` pairs — imported into the dashboard's Sources on first run only; manage them under Settings afterwards |
| `navToken` | `null` fetches NAV's rotating public token automatically; set a registered token instead |

Municipality numbers come from [Brreg's kommune register](https://data.brreg.no/enhetsregisteret/api/kommuner?size=400).

## Data sources

- **Enhetsregisteret** (Brønnøysundregistrene) — open company data, no authentication. Reads both hovedenheter and underenheter, because regional branch offices are registered as underenheter of parents elsewhere.
- **NAV stillingsfeed** (arbeidsplassen.no) — job ads under the [API terms](https://arbeidsplassen.nav.no/vilkar-api): the required deep-link is stored, and an expired ad is never presented as active.

Ads posted only on finn.no are not in the NAV feed, and neither finn.no nor proff.no permits scraping — Hugin lists them (plus LinkedIn) as **Sources**: link-out reminders to check by hand.

## Build from source

Needs the [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0) and Node:

```bash
git clone https://github.com/malinfossum/hugin.git
cd hugin
cp hugin.json.example hugin.json
```

```powershell
.\build.ps1
```

This builds the frontend, publishes both exes into `publish\`, and a self-contained single-file `Hugin.exe` (frontend embedded) into `publish-single\`. Run `publish\hugin-api.exe` — or `publish-single\Hugin.exe` — for the dashboard.

## Tests

```bash
dotnet test
```
