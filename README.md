# Hugin

Hugin is a command-line job radar for the Norwegian developer job market: it watches public registries for new companies and job ads in your region and tracks your outreach pipeline.

Named after Odin's raven of thought, who flies out each morning and returns with tidings — while his sibling Munin remembers.

## Stack

C# / .NET 10, EF Core with SQLite, NUnit. Layered: `Hugin.Core` holds the domain and has no I/O; `Hugin.Console` is the CLI and the I/O boundary; `Hugin.Tests` covers both.

## Setup

```bash
cp hugin.json.example hugin.json
dotnet run --project Hugin.Console -- sync
```

Edit `hugin.json` to set your municipalities, industry codes, and keywords. Municipality numbers come from [Brreg's kommune register](https://data.brreg.no/enhetsregisteret/api/kommuner?size=400); industry codes are SN2025, where a prefix such as `62` matches every sub-code beneath it.

`hugin.json` and the `hugin.db` database are gitignored — the pipeline holds your own outreach history.

## Commands

| Command | What it does |
|---|---|
| `hugin sync` | Pulls companies from Brreg and job ads from the NAV feed |
| `hugin new [--seen]` | Everything first seen since the last review; `--seen` advances the mark |
| `hugin track <orgnr> <status>` | Sets pipeline status: `funnet`, `soekt-selv`, `bedt-get`, `svar`. Options: `--why`, `--note`, `--svar` |
| `hugin list [--status <s>]` | Shows the pipeline; `--companies [--kommune <nr>]` browses the full synced inventory |
| `hugin export [--since ÅÅÅÅ-MM-DD]` | Writes markdown tables of the week's outreach (defaults to the last 7 days) |

`--config <path>` points at a different `hugin.json`. The database is created next to it.

The first sync sets a baseline, so `hugin new` starts empty rather than listing every company in the register. Use `hugin list --companies` to browse that initial inventory.

## Data sources

- **Enhetsregisteret** (Brønnøysundregistrene) — open company data, no authentication. Both hovedenheter and underenheter are read, because regional branch offices are registered as underenheter of parents elsewhere.
- **NAV stillingsfeed** (arbeidsplassen.no) — job ads under the [API terms](https://arbeidsplassen.nav.no/vilkar-api). Hugin stores the deep-link NAV requires, marks ads inactive as the feed reports them gone, and never presents an expired ad as active. A rotating public token is fetched automatically; a registered token can be set as `navToken`.

Ads posted only on finn.no are not in the NAV feed, and neither finn.no nor proff.no permits scraping — configure them as `linkouts` instead, and Hugin will remind you to check them by hand.

## Tests

```bash
dotnet test
```
