# Hugin

![Hugin: job radar for the Norwegian developer market](docs/brand/banner.png)

Hugin is a job radar for the Norwegian developer job market: it watches public registries for new companies and job ads in your region and tracks your outreach pipeline. Use it from the command line or a local web dashboard.

Named after Odin's raven of thought, who flies out each morning and returns with tidings. His sibling Munin remembers.

## Stack

C# / .NET 10, EF Core with SQLite, NUnit; the dashboard is ASP.NET Core with a React + TypeScript frontend (Vite, Tailwind CSS, shadcn/ui, TanStack Router and Query, Vitest). Layered: `Hugin.Core` (pure domain, no I/O) · `Hugin.Infrastructure` (database, HTTP clients, config) · `Hugin.Console` and `Hugin.Api` (thin hosts) · `Hugin.Tests`.

## Quick start

Get it from the [Releases page](https://github.com/malinfossum/hugin/releases):

- **`Hugin.exe`**: single self-contained file, dashboard only, no .NET install needed. Put it anywhere and double-click. The dashboard opens at `http://localhost:5111` and asks which part of Norway to cover on first run. A `hugin.json` beside the exe (start from `hugin.json.example`) is optional and overrides the defaults.
- **Zip**: `hugin.exe` (CLI) + `hugin-api.exe` (dashboard) sharing one `hugin.json`/`hugin.db`. Requires the [.NET 10 runtime](https://dotnet.microsoft.com/download/dotnet/10.0).

`hugin.json` and the `hugin.db` database are gitignored. The pipeline holds your own outreach history.

## Web dashboard

Review what is new since your last visit, track outreach through `Watching` → `Applied` → `Answered`, star the ones you want to apply to, and export a shortlist (`.md`/`.txt`/`.json`). Every view is a real URL. English or bokmål, dark or light theme, from a phone up to a wide screen.

## Demo

A read-only showcase runs at https://hugin-demo.azurewebsites.net on Azure App Service (free tier: the first visit after idle takes a few seconds). Real job ads and companies from NAV and Brreg for Innlandet, an example pipeline of fictional firms, no personal data, no tracking. It is built mobile-first, so it works on a phone. `publish-demo.ps1` builds it; deployment notes are in `docs/specs/2026-09-03-hugin-demo-deployment.md`.

[`docs/project-note.md`](docs/project-note.md) is a plain-language summary of what Hugin is, how it works, how it is built and where it stands.

## CLI

| Command | What it does |
|---|---|
| `hugin sync [--full]` | Pulls companies from Brreg and ads from NAV. `--full` walks the whole feed history from the oldest page. Run it once after setup and again after widening keywords; interrupted runs resume |
| `hugin new [--seen]` | Everything first seen since the last review; `--seen` advances the mark |
| `hugin track <orgnr> <status>` | Sets pipeline status: `active`, `applied`, `answered`. Options: `--why`, `--note`, `--svar` |
| `hugin untrack <orgnr>` | Removes one pipeline row and clears manual ad links to it. The company stays. Cannot be undone. The printout lists what was removed |
| `hugin list [--status <s>]` | Shows the pipeline; `--companies` / `--ads` (each with `--kommune <nr>`) browse the synced inventory |
| `hugin export` | Writes data to stdout. `--format md\|txt\|json`, `--scope new\|category\|all` (`category` needs `--category <navn>`), `--include-active` |

Host flags (`--port`, `--config`, the `--public` demo mode), first-run steps, the localhost API and every `hugin.json` field are in [`docs/reference.md`](docs/reference.md).

## Data sources

- **Enhetsregisteret** (Brønnøysundregistrene): open company data, no authentication. Reads both hovedenheter and underenheter, because regional branch offices are registered as underenheter of parents elsewhere.
- **NAV stillingsfeed** (arbeidsplassen.no): job ads under the [API terms](https://arbeidsplassen.nav.no/vilkar-api): the required deep-link is stored, and an expired ad is never presented as active.

Ads posted only on finn.no are not in the NAV feed, and neither finn.no nor proff.no permits scraping. Hugin lists them (plus LinkedIn) as **Sources**: link-out reminders to check by hand.

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

This builds the frontend, publishes both exes into `publish\`, and a self-contained single-file `Hugin.exe` (frontend embedded) into `publish-single\`. Run `publish\hugin-api.exe` (or `publish-single\Hugin.exe`) for the dashboard.

## Tests

```bash
dotnet test
```
