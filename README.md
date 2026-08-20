# Hugin

Hugin is a command-line job radar for the Norwegian developer job market: it watches public registries for new companies and job ads in your region and tracks your outreach pipeline.

Named after Odin's raven of thought, who flies out each morning and returns with tidings — while his sibling Munin remembers.

## Stack

C# / .NET 10, EF Core with SQLite, NUnit. Layered: `Hugin.Core` holds the domain and has no I/O; `Hugin.Console` is the CLI and the I/O boundary; `Hugin.Tests` covers both.

## Setup

Requires the [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0).

```bash
git clone https://github.com/malinfossum/hugin.git
cd hugin
cp hugin.json.example hugin.json
dotnet run --project Hugin.Console -- sync
```

Edit `hugin.json` to set your municipalities, industry codes, and keywords. Keywords are the recall net and can stay broad — `categories` (NAV's occupation categories, default `["IT"]`) filters out keyword coincidences like *prosjektutvikler massivtre*; ads NAV has not categorized always pass. `hugin list --ads` groups results by that category. Municipality numbers come from [Brreg's kommune register](https://data.brreg.no/enhetsregisteret/api/kommuner?size=400); industry codes are SN2025, where a prefix such as `62` matches every sub-code beneath it.

`hugin.json` and the `hugin.db` database are gitignored — the pipeline holds your own outreach history.

## Commands

| Command | What it does |
|---|---|
| `hugin sync [--full]` | Pulls companies from Brreg and job ads from the NAV feed. `--full` walks the entire feed history — run it once after setup to load every currently-open ad; interrupted runs resume |
| `hugin new [--seen]` | Everything first seen since the last review; `--seen` advances the mark |
| `hugin track <orgnr> <status>` | Sets pipeline status: `funnet`, `soekt-selv`, `bedt-get`, `svar`. Options: `--why`, `--note`, `--svar` |
| `hugin list [--status <s>]` | Shows the pipeline; `--companies [--kommune <nr>]` browses the full synced inventory; `--ads [--kommune <nr>]` lists currently-open ads |
| `hugin export [--since ÅÅÅÅ-MM-DD]` | Writes markdown tables of the week's outreach (defaults to the last 7 days) |

`--config <path>` points at a different `hugin.json`. The database is created next to it.

The first sync sets a baseline, so `hugin new` starts empty rather than listing every company in the register. Use `hugin list --companies` to browse that initial inventory, and `hugin sync --full` once to backfill every open job ad from the feed's history — after that, plain `hugin sync` keeps up day to day.

## Data sources

- **Enhetsregisteret** (Brønnøysundregistrene) — open company data, no authentication. Both hovedenheter and underenheter are read, because regional branch offices are registered as underenheter of parents elsewhere.
- **NAV stillingsfeed** (arbeidsplassen.no) — job ads under the [API terms](https://arbeidsplassen.nav.no/vilkar-api). Hugin stores the deep-link NAV requires, marks ads inactive as the feed reports them gone, and never presents an expired ad as active. A rotating public token is fetched automatically; a registered token can be set as `navToken`.

Ads posted only on finn.no are not in the NAV feed, and neither finn.no nor proff.no permits scraping — configure them as `linkouts` instead, and Hugin will remind you to check them by hand.

## Web dashboard

A localhost dashboard over the same `hugin.json` / `hugin.db` as the CLI — browse the pipeline, active ads, and company inventory, track outreach, and export the week's markdown, all from a browser instead of the terminal.

Build both hosts side by side:

```powershell
.\build.ps1
```

This runs `npm run build` in `hugin-web`, then publishes `Hugin.Console` and `Hugin.Api` into `publish\`. Run the dashboard:

```bash
publish\hugin-api.exe --port 5111
```

`--port` picks the listening port (default `5111`); `--config <path>` points at a different `hugin.json`, same as the CLI.

For local development, run the API and the Vite dev server side by side:

```bash
dotnet run --project Hugin.Api
cd hugin-web && npm run dev
```

The API binds to loopback only, and every state-changing request (sync, track, mark-seen, hide) requires a header the dashboard's own frontend sets — the API is not reachable, or writable, from anywhere but that page on that machine.

## Tests

```bash
dotnet test
```
