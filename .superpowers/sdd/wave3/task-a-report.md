# Task A — kommune names for every number

## What shipped

- `Hugin.Core/Models/Kommune.cs` — new model (`Number` key, mutable `Name`).
- `HuginDbContext` — `DbSet<Kommune> Kommuner`, `HasKey(Number)`.
- Migration `AddKommuneRegister` (generated via `dotnet ef migrations add AddKommuneRegister --project Hugin.Infrastructure --startup-project Hugin.Infrastructure --output-dir Data/Migrations`) — creates the `Kommuner` table.
- `IKommuneRepository` (`Hugin.Core/Abstractions/Repositories.cs`) — `GetAllAsync` (number → name dictionary) and `UpsertManyAsync`. EF impl `EfKommuneRepository` in `Hugin.Infrastructure/Data/Repositories.cs`; fake `FakeKommuneRepository` in `Hugin.Tests/Fakes.cs`. Registered scoped in both `Hugin.Api/Program.cs` and `Hugin.Console/Program.cs`.
- `IBrregClient.GetKommunerAsync` — `Hugin.Infrastructure/Http/BrregClient.cs` does `GET kommuner?size=400`, maps `_embedded.kommuner[].{nummer,navn}`.
- `KommuneNameNormalizer` (`Hugin.Core/Services/KommuneNameNormalizer.cs`) — pure static, nb-NO-aware title-casing per space- and hyphen-separated segment (`VÅGÅ`→`Vågå`, `NORD-AURDAL`→`Nord-Aurdal`, `NORDRE LAND`→`Nordre Land`). Handles the `ToTitleCase`-treats-ALL-CAPS-as-acronym trap by lowercasing each segment first.
- `SyncService.SyncBrregAsync` — after companies upsert successfully, best-effort fetches + upserts the kommune register (try/catch; a failure never fails the brreg `SourceResult`).
- `CompanyDto.From` — new signature `(Company, HuginConfig, IReadOnlyDictionary<string,string> kommuner)`; resolution order is config name → kommune-table name → raw number, null only when the company has no kommune number. All three `ReadEndpoints.cs` call sites (`/api/new`, `/api/companies`, `/api/companies/{orgnr}`) now load the dictionary once per request via `IKommuneRepository.GetAllAsync` and pass it through.

## Tests added (TDD, all new tests written before their implementation)

- `KommuneNameNormalizerTests.cs` — 6 cases incl. the three from the spec plus null/empty safety.
- `BrregClientTests.GetKommuner_maps_and_normalizes_names` — fixture-style inline JSON, asserts mapping + normalization together.
- `SyncServiceTests` — `Kommune_register_is_upserted_after_a_successful_brreg_sync`, `Kommune_fetch_failure_does_not_fail_the_brreg_result`.
- `RepositoryTests.Kommune_upsert_many_inserts_and_updates` — insert then update via real EF/SQLite.
- `ReadEndpointTests.Companies_list_resolves_kommune_navn_from_the_register_when_config_does_not_have_it` — orgnr in kommune `0301` (register-only, `0301`→`Oslo`) resolves via the table; orgnr in `3407` still resolves via config (`Gjøvik`), confirming config wins.

## Verify

- `dotnet build` — clean, 0 warnings, 0 errors.
- `dotnet test` — **163/163 green** (152 baseline + 11 new).
- `npm test` (hugin-web) — **53/53 green**, untouched (kommuneNavn plumbing already existed frontend-side).

## Concerns / notes

- None outstanding. The normalizer is a pure static so it's directly unit-testable without HTTP fixtures, matching `Sanitizer`'s pattern.
- `GetKommunerAsync` does a single `size=400` fetch (no paging loop) per the design — Norway has ~356 kommuner, well under that cap.
- Did not touch `docs/specs/2026-08-19-hugin-phase2-web-design.md`'s "Post-implementation corrections" section — out of scope for this task's instructions (implementation + tests + one commit only). Flag if that changelog entry should also be extended.

## Commit

One commit: `feat: kommune names resolved from the Brreg register for every number`
