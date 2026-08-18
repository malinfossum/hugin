# Hugin — design spec

2026-08-18 · Status: approved — stress-tested (security/privacy/a11y/loopholes), all 11 findings folded in

Hugin is a command-line job radar for the Norwegian developer job market. It watches open data sources for new companies and job ads in a configured region, tracks the outreach pipeline per company, and exports Preparelogg-ready markdown. Named for Odin's raven of thought — it flies out each morning and returns with tidings, while its sibling Munin remembers.

## Purpose

- Surface **new companies** (Brønnøysundregistrene) and **new job ads** (NAV stillingsfeed) in the configured municipalities since the last check.
- Track each company through the GET Prepared pipeline: funnet → søkt selv / bedt GET sjekke → svar — including **why the company is interesting** (the begrunnelse GET requires).
- Export the week's findings as a markdown table matching the Preparelogg "Jobbsøk" structure, so the "2 nye bedrifter i uka" requirement becomes copy-paste.

## Non-goals (v1)

- No scraping of finn.no or proff.no (terms forbid it). finn/LinkedIn remain configured **link-outs** printed in output.
- No web UI, no API, no notifications, no multi-user. The React + TypeScript frontend is a planned later phase, not part of v1.
- No AI/text generation. Hugin stores and surfaces the begrunnelse; writing it is Malin's job.

## Stack and project layout

From the `workbench/scaffolds/csharp-layered` scaffold (net10.0, NUnit 4.x, `.slnx`, global.json 10.0.300/latestFeature), renamed `App.*` → `Hugin.*`:

| Project | Responsibility |
|---|---|
| `Hugin.Core` | Domain: entities, repository + client **interfaces**, services (filtering, diffing, export formatting, pipeline rules). **No I/O.** |
| `Hugin.Console` | Console front-end + the I/O boundary: EF Core (SQLite), HTTP clients for Brreg and NAV, config loading, DI wiring via `Microsoft.Extensions.Hosting` generic host. |
| `Hugin.Tests` | NUnit tests — Core services with fakes, plus EF repositories against in-memory SQLite. *(Deliberate deviation from the scaffold's "Tests reference Core only" rule: repository tests require a reference to `Hugin.Console`, where the EF code lives.)* |

*(Project names follow the scaffold's `App.Core / App.Console / App.Tests` shape, renamed.)*

**Storage: SQLite via EF Core**, single file `hugin.db` next to the config. A single-user CLI needs no database server; the repository interfaces in Core make a later PostgreSQL swap a provider change, not a rewrite. Migrations from day one (the schema will evolve).

**Why this shape:** it is the GET Prepared backend curriculum in miniature — datamodellering, dependency injection, layered responsibility, repository pattern — on a tool with a real daily user.

## Configuration — `hugin.json`

Lives next to the executable (or `--config <path>`). This file is the whole "preferences" story, which is what makes Hugin usable by anyone in any region without code changes:

```json
{
  "municipalities": [
    { "name": "Gjøvik", "number": "3407" },
    { "name": "Hamar", "number": "3403" },
    { "name": "Lillehammer", "number": "3405" },
    { "name": "Ringsaker", "number": "3411" }
  ],
  "naeringskoder": ["62"],
  "keywords": ["utvikler", "developer", "backend", "frontend", "fullstack", "programvare"],
  "navToken": null,
  "linkouts": [
    { "label": "FINN utvikler × Innlandet", "url": "https://www.finn.no/job/search?..." },
    { "label": "LinkedIn entry-level", "url": "https://www.linkedin.com/jobs/search/?..." }
  ]
}
```

- `linkouts` URLs above are illustrative — Malin's actual saved-search URLs (her existing finn.no search, the LinkedIn `f_E=1,2` search) go in at setup.
- `naeringskoder` uses **SN2025** codes (prefix `62` matches all sub-codes; the old `62.010` returns zero results — documented gotcha).
- `navToken: null` → Hugin fetches NAV's rotating public token from `/api/publicToken` automatically; a registered stable token can be pasted in later.
- Keywords filter **ads** (title/occupation), not companies — a company is interesting regardless of ad wording.

## Data model

| Entity | Fields | Notes |
|---|---|---|
| `Company` | `Orgnr` (PK, string), `Name`, `MunicipalityNumber`, `NaceCode`, `ParentOrgnr?`, `IsBranch`, `Website?`, `FirstSeen`, `LastSeenInRegister` | From Brreg — both hovedenheter and **underenheter** (branch offices have their own orgnr; `ParentOrgnr` links to the parent). Never deleted; companies that disappear from the register are marked, not removed. |
| `Ad` | `FeedId` (PK), `Title`, `EmployerName`, `EmployerOrgnr?`, `MunicipalityNumber?`, `Published`, `Expires?`, `SourceUrl`, `FirstSeen`, `IsActive` | From NAV feed. `SourceUrl` is the deep-link NAV's terms require; `IsActive` flips on sync when the feed reports the ad gone. |
| `PipelineEntry` | `Id` (PK), `Orgnr` (FK → Company), `Status` (enum: `Funnet`, `SoektSelv`, `BedtGetSjekke`, `Svar`), `Route` (enum: `Ingen`, `SoektSelv`, `BedtGetSjekke`), `Why` (begrunnelse, text), `Note?`, `SvarText?`, `Created`, `Updated` | One entry per company. `Why` is the "Grunn til at de er interessante" column — export flags entries where it is empty. `Route` records how the company was approached and survives the move to `Svar`, so an answered self-application is not filed under GET (see corrections below). |
| `SyncState` | `Source` (PK: `brreg` / `nav`), `LastSyncUtc`, `Cursor?` | Feed position / incremental state per source. |
| `ReviewMark` | `LastReviewedUtc` (single row) | What "new" means: everything with `FirstSeen` after this. Advanced only by `hugin new --seen` — except the **first successful sync sets it as the baseline**, so `new` starts near-empty instead of dumping several hundred "new" companies. The initial inventory is browsed deliberately via `list --companies`. |

Relationships stay flat and simple — no navigations Hugin doesn't need.

## External integrations

Both clients are interfaces in Core (`IBrregClient`, `INavFeedClient`); HTTP implementations in Cli.

**Input hygiene (all sources):** every external string (company names, ad titles, employer names) passes a sanitizer at ingest — C0/C1 control characters and ESC stripped — before storage or display. Company names and ad titles are third-party input; unsanitized, an ANSI escape sequence in an ad title could retitle the terminal or spoof output. One sanitizer, tested.

**Sync semantics (all sources):** at-least-once. Upserts are idempotent; `SyncState.Cursor` advances only **after** the batch commits, so a crash mid-sync re-fetches rather than skips.

**Brreg Enhetsregisteret** — open, no auth.
`GET https://data.brreg.no/enhetsregisteret/api/enheter?naeringskode={codes}&kommunenummer={numbers}` **and the same query against `/underenheter`** — paginated JSON; walk all pages, upsert by orgnr. Querying `/enheter` alone misses branch offices entirely: regional consultancy offices (Sopra Steria avd Hamar, Bouvet Innlandet, Atea Hamar) are underenheter of Oslo-registered parents and never match a kommunenummer filter on hovedenheter.

**NAV stillingsfeed** — free, JWT bearer.
Docs: navikt.github.io/pam-stilling-feed. On 401, refetch the public token from `/api/publicToken` and retry once. Consume the feed incrementally from the stored cursor; filter to configured municipalities + keywords before storing.
Terms compliance (arbeidsplassen.nav.no/vilkar-api): store the deep-link, mark ads inactive as the feed reports it, never present stale ads as active. Ads past their `Expires` date are treated as inactive even if the feed hasn't said so yet. `SourceUrl` is accepted only with an `http`/`https` scheme; anything else is stored as plain text and never rendered as a link. **finn.no ads are not in the feed** — hence the link-outs.

**Logging policy:** console only — warnings and the per-source sync summary. Never log tokens, request headers, or response bodies.

Network failure on either source: warn, continue with cached data, exit code 0 (a flaky connection must not kill the morning routine); exit non-zero only when *both* sources fail on `sync`.

## Commands

| Command | Behavior |
|---|---|
| `hugin sync` | Pull Brreg (upsert companies) + NAV feed (upsert ads, flip `IsActive`). Prints a one-line summary per source. |
| `hugin new` | Everything first seen since `ReviewMark`: new companies grouped by municipality, new ads with deep-links, then the configured link-outs as a reminder. `--seen` advances the mark. |
| `hugin track <orgnr> <status>` | Create/update the company's `PipelineEntry`. Options: `--why "..."`, `--note "..."`, `--svar "..."`. Warns when setting a status beyond `Funnet` with an empty `Why`. **Unknown orgnr:** fetched directly from Brreg (`/enheter/{orgnr}`, fallback `/underenheter/{orgnr}`) and stored regardless of NACE code — the NACE filter governs *discovery*, never *tracking* (Norsk Tipping is NACE 92, Statens vegvesen 84; both must be trackable). |
| `hugin list [--status <s>]` | Pipeline overview table. `--companies [--kommune <nr>]` browses the full synced company inventory instead — this is how the first-sync backlog is explored. |
| `hugin export [--since <date>]` | Markdown tables in Preparelogg shape (Dato · Bedrift · Annonse/Nettside · Grunn · Svar), split "Søkt selv" / "Bedt GET sjekke". Entries with empty `Why` are included but marked `⚠ mangler begrunnelse`. Defaults to the last 7 days. |

Output is plain text/markdown to stdout — pipe or copy directly into the Preparelogg.

**Output rules:**

- `Console.OutputEncoding` set to UTF-8 at startup; exported files written UTF-8 without BOM. (Windows console defaults mangle æ/ø/å and `⚠` into mojibake.)
- Markdown cells escape `|` and newlines — an ad titled "Utvikler | 100% remote" must not break the exported table.
- Status is never signaled by color alone; text markers (the `⚠` prefix pattern) carry the meaning, color may only reinforce it.

## Testing

NUnit against Core with fakes — no network, no real database:

- **Filtering:** keyword/municipality matching on ads; NACE prefix matching on companies.
- **Diffing:** what counts as "new" relative to `ReviewMark`; first-sync baseline behavior; ad inactivation (feed-reported and past-`Expires`).
- **Pipeline rules:** status transitions; the empty-`Why` warning; track-by-unknown-orgnr regardless of NACE.
- **Sanitizing:** control characters stripped at ingest; `SourceUrl` scheme validation.
- **Export:** exact markdown shape, cell escaping (`|`, newlines), date windows, the `mangler begrunnelse` flag.

EF Core-backed repository tests use SQLite in-memory. The Stop-hook (`dotnet test`) covers the rest.

## Future path (out of scope now, shapes nothing prematurely)

1. **Phase 2 — web:** thin ASP.NET Core API over the same Core + database, React + TypeScript frontend (also prep for Norsk Tipping's stack). The CLI keeps working; Core is shared.
2. Possible PostgreSQL swap if the web phase wants it.
3. Open-source from the start: English README, `hugin.json.example`, no personal data committed (`hugin.json` + `hugin.db` gitignored — the pipeline contains her real outreach history).

## Risks / known constraints

- NAV's public token rotates at irregular intervals — handled by refetch-on-401; a registered stable token is the durable fix.
- NAV feed excludes finn-only ads — accepted; link-outs cover it.
- Brreg lists ~140 NACE-62 entities in Gjøvik alone — most are one-person consultancies. The `new` output groups and counts rather than judging; curation (the `Why`) stays human.
- Of the default kommunenummer values, only Gjøvik (3407) is verified against the live API; Hamar (3403), Lillehammer (3405) and Ringsaker (3411) are assumed. **The implementation plan must include a verification step against Brreg's `/kommuner` endpoint before the defaults ship.**

## Post-implementation corrections (2026-08-18)

Three defects found after the build, against the live APIs rather than in review:

1. **NAV feed resume point.** At the feed tail `next_id` is null, and storing that as the cursor sent every later sync back to `?last=true` — the newest page — skipping every page that completed in between. Tail pages roll over within the hour, so a daily sync would have missed almost all ads. `FeedPage` now also carries the page `id`, and sync stores `next_id ?? id`; re-reading one page is harmless because upserts are idempotent.
2. **Company websites.** Brreg stores `hjemmeside` as a bare hostname (`www.innit.no`) — of 200 companies sampled across the configured municipalities, 39 had one and none carried a scheme, so `UrlGuard.HttpOrHttps` discarded all of them and the export's Nettside column was always empty. `UrlGuard.Website` now assumes https for a scheme-less hostname, still refusing any value that declares a different scheme, and requires a dot so a typed note does not become a link.
3. **Answered outreach attribution.** Because `Status` is linear and ends at `Svar`, an answer to an application Malin sent herself moved into the "Bedt GET om å sjekke" section. Hence the `Route` field above; export now splits on route rather than status.

## Stress-test record (2026-08-18)

Reviewed through the four-lens stress test (security, privacy, accessibility, loopholes); all 11 findings folded into the sections above. Accepted non-fixes: plaintext `navToken` in gitignored config (public-data API); ads retained indefinitely (public data, small file); no finn/proff ingestion (terms); no rate limiting beyond retry-once (one user, one sync/day).
