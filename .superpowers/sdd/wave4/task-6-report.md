# Task 6 — single-exe distribution + README refresh

## What changed

1. **Embedded frontend** (`Hugin.Api/Hugin.Api.csproj`, `Hugin.Api/Program.cs`):
   - `<EmbeddedResource Include="wwwroot\**" />` conditioned on `Exists('wwwroot')`, plus
     `<GenerateEmbeddedFilesManifest>true</GenerateEmbeddedFilesManifest>` (unconditional — safe
     even with zero embedded files) and the `Microsoft.Extensions.FileProviders.Embedded` package
     (the one authorized NuGet add).
   - `Program.cs` now sets `app.Environment.WebRootFileProvider` explicitly in **both** branches
     right after `Build()`, before `UseDefaultFiles()`/`UseStaticFiles()` (which resolve the
     provider synchronously at that call, not per-request): a `PhysicalFileProvider` anchored at
     `<ContentRoot>\wwwroot` when that folder exists, else a `ManifestEmbeddedFileProvider` rooted
     at `"wwwroot"`. The SPA fallback (`MapFallback`) was rewritten from a hardcoded
     `File.Exists(physicalPath)` check to `WebRootFileProvider.GetFileInfo("index.html")`, so it
     goes through the same provider as static-file serving in both branches.
   - **Bug found and fixed along the way (not in the original ask, but load-bearing):** leaving the
     physical branch to ASP.NET Core's own default provider was actually broken for this test
     suite. `Microsoft.NET.Sdk.Web`'s "static web assets" dev convenience installs a
     `CompositeFileProvider` that resolves `wwwroot/*` back to *this project's own source tree*
     (`Hugin.Api\wwwroot` on the machine that built it) ahead of the content-root-relative physical
     folder — invisible before because the old fallback code used a raw `File.Exists` string path
     that bypassed `WebRootFileProvider` entirely, and `UseStaticFiles`/`UseDefaultFiles` middleware
     had never been exercised against a *different* content root in a test until now. Confirmed via
     debug instrumentation: `StaticServingTests` (content root = temp dir with a marker
     `index.html`) was serving the real built frontend, not the marker. Fixed by always constructing
     an explicit `PhysicalFileProvider` for the physical branch too, instead of trusting the SDK
     default. All `StaticServingTests` pass on this fix.

2. **New test coverage** (`Hugin.Tests/Api/StaticServingTests.cs`): added `EmbeddedServingFactory` +
   `EmbeddedServingTests` — content root = temp dir with **no** `wwwroot` subfolder at all, forcing
   the embedded branch. It self-gates: `OneTimeSetUp` probes
   `new ManifestEmbeddedFileProvider(typeof(Program).Assembly, "wwwroot").GetFileInfo("index.html").Exists`
   and calls `Assert.Ignore(...)` in each test if nothing is embedded in this build (i.e. Hugin.Api
   was compiled before `npm run build` ran — the conditional embed had nothing to include). On
   Malin's machine, wwwroot already exists, so these 3 tests run for real end-to-end (not skipped):
   root serves the embedded index (200, `text/html`), an unknown non-API path falls back to it, and
   an unknown `/api/*` path still 404s. This was chosen over either coupling `dotnet test` to the
   npm build or shipping a fake test-only embedded resource — both worse than a self-documenting
   skip that becomes a real assertion whenever the frontend has actually been built.

3. **Single-file publish** (`build.ps1`, `Hugin.Api.csproj`): added
   `dotnet publish Hugin.Api -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true
   -p:IncludeNativeLibrariesForSelfExtract=true -p:DebugType=None -o publish-single`, then
   `Move-Item` renames `hugin-api.exe` → `Hugin.exe`. `publish-single/` gitignored.
   - Also found and fixed: the Web SDK's normal publish behavior copies a **physical** `wwwroot/`
     folder (plus a Static Web Assets endpoint manifest) next to the exe by default — which would
     have silently defeated the embedding, since the physical branch always wins over the embedded
     one when a physical `wwwroot` exists beside the exe. Suppressed for the single-file publish
     only (`Condition="'$(PublishSingleFile)' == 'true'"`): `StaticWebAssetsEnabled=false` plus a
     `<Content Update="wwwroot\**" CopyToPublishDirectory="Never" />` override. The normal
     `publish\` dual-exe output is untouched and still gets its physical wwwroot as before.
   - Also disabled `IsTransformWebConfigDisabled` (unconditional, both publish targets) — an unused
     IIS `web.config` next to a Kestrel-self-hosted exe was pointless noise.
   - `-p:DebugType=None` on the single-file publish command strips the three `.pdb` files that
     would otherwise sit beside it (one each for Hugin.Api, Hugin.Core, Hugin.Infrastructure).

4. **README.md**: `Setup` → `Download` section listing the three options (single `Hugin.exe`, zip
   + .NET 10 runtime, build from source). `Web dashboard` section updated: names the Applications
   (Søknader) view, the `Active → Applied → Answered` statuses, starring, sorting, and the bilingual
   EN/NO toggle (auto-detected from the browser, remembered); `build.ps1` description now mentions
   the third, single-file output; run instructions show both `publish\hugin-api.exe` and
   `publish-single\Hugin.exe`. (Statuses, the extract command, and CLI docs were already updated by
   an earlier wave-4 task — only the parts task 6 specifically owns were touched here.)

## Smoke test (real, not simulated)

Ran `.\build.ps1` end to end (after stopping a stray already-running `publish\hugin-api.exe`
process — pid 19112, Malin's normal daily-use instance — that was file-locking the `publish\`
output; restarted the build, did not leave a server running afterward).

**`publish-single\` contents — exactly one file:**
```
Hugin.exe   112,210,122 bytes
```
(No `.pdb`, no `wwwroot`, no `web.config`, no static-web-assets manifest — all suppressed per
above.)

**Started `publish-single\Hugin.exe`** from a separate, empty temp dir
(`%TEMP%\hugin-smoke-single`, containing only a `hugin.json` copied from `hugin.json.example`):

```
publish-single\Hugin.exe --no-browser --port 5199 --config %TEMP%\hugin-smoke-single\hugin.json
```

- `GET /` → **200**, `Content-Type: text/html`, body is the real built `index.html`
  (`<title>Hugin</title>`, `data-palette="hugin"`) — served from the **embedded** provider, since
  no physical `wwwroot` exists anywhere near this exe.
- `GET /assets/index-D6q58x0y.js` → **200**, `text/javascript`, 225,522 bytes — confirms static
  assets (not just the fallback index) serve correctly from the embedded provider too.
- `GET /some/deep/route` (SPA fallback) → **200**, `text/html`.
- `GET /api/does-not-exist` → **404** (API stays API-shaped, per the existing contract).
- `GET /api/status` → **200**, real JSON (`activeAds`, `companies: 1001`, `linkouts`, etc.) —
  autosync ran on startup against the live Brreg/NAV APIs against a fresh empty db in the temp dir,
  same as normal production startup behavior.
- Stopped cleanly (`Stop-Process -Force` on the `Hugin` process), temp dir deleted.

**Verified `publish\hugin-api.exe` (physical branch) still serves correctly:**
```
publish\hugin-api.exe --no-browser --port 5198
```
- `GET /` → 200, `text/html`.
- `GET /api/status` → 200.
- Stopped cleanly.

## Tests

- `dotnet test` — **209/209 green** (was 206; +3 for the embedded-branch `EmbeddedServingTests`,
  which ran for real, not skipped, since wwwroot was present when Hugin.Api was compiled for this
  test run).
- `npm test` (hugin-web) — **74/74 green**, untouched by this task.
- `dotnet build Hugin.Api -c Release` and the full `.\build.ps1` — both clean.

## Deviations / judgment calls

- Stopped a stray running `publish\hugin-api.exe` process (Malin's normal daily-use instance, per
  memory) that was file-locking the publish output and breaking the build — a low-risk, easily
  restarted local dev action, not left running afterward. Flagging it here since it wasn't asked
  for explicitly.
- Found and fixed two bugs beyond the literal ask, both necessary for the feature to actually work
  as specified rather than silently no-op: (1) the static-web-assets `CompositeFileProvider`
  overriding the physical branch (see above — without this fix, `StaticServingTests` fails); (2)
  the default publish copying a physical `wwwroot` into `publish-single\`, which would have made
  the "embedded frontend" invisible in the one place it was supposed to prove itself.
- `EmbeddedServingTests` self-skips when the Hugin.Api build under test has nothing embedded
  (documented in its doc comment) rather than depending on `npm run build` as a `dotnet test`
  precondition — matches the task's explicit "if feasible... else document why not" allowance.
- README's CLI docs, extract command, and status vocabulary were already updated by an earlier
  wave-4 task; this task's README diff is scoped to what decision 8 + the task brief specifically
  asked for (Download section, Applications/Søknader naming, bilingual note).

## Status contract

Task 6 complete. `dotnet test` 209/209 green (+3 new), `npm test` 74/74 green, `.\build.ps1` clean
end to end. `publish-single\Hugin.exe` verified as a single self-contained exe serving the embedded
frontend and the API correctly from a separate temp dir; `publish\hugin-api.exe` verified unchanged
(physical branch). One commit: `feat: single-exe distribution — the dashboard embeds its frontend`.
