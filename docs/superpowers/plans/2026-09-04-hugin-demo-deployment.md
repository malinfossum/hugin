# Hugin demo — hosted read-only showcase — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `--public --state <dir>` mode for `hugin-api` that serves a read-only demo on Azure App Service F1 Linux — every write refused, live NAV/Brreg sync throttled per cold start, the SQLite working copy on local disk with a snapshot persisted to the state dir after each sync, a seeded demo pipeline, and a dashboard that hides every write control behind a demo banner.

**Architecture:** One `PublicModeOptions` singleton (built from `--public`/`--state` or, for tests, the `hugin:public`/`hugin:state`/`hugin:workingdb` settings) drives five small pieces in `Hugin.Api`: the bind + startup validation (`PublicMode`), the security middleware's public branch, a `RollingReviewMark` decorator, `DemoSnapshot` (copy-in / copy-back) and `DemoSeeder` (idempotent pipeline seed). `SyncRunner` runs seeder → checkpoint → copy-back after every sync. The web adds one `ReadOnlyProvider` fed by `/api/status.readOnly`; views hide write controls under it. Nothing changes for local users: with `Enabled == false` every branch is inert.

**Tech Stack:** ASP.NET Core minimal APIs + EF Core/SQLite + NUnit (`dotnet test`); React 19 + TypeScript, Vite, Vitest + Testing Library (`cd hugin-web; npm test`). No new dependencies. Deployment: self-contained `linux-x64` publish + `az webapp deploy`.

**Spec:** `docs/specs/2026-09-03-hugin-demo-deployment.md`

## Global Constraints

- **Nothing changes for local users.** Without `--public` the host binds loopback, keeps the Host allowlist, requires `X-Hugin: 1` on writes, holds the boot sync on a fresh install, opens the browser. Every existing test must pass unchanged.
- `--public` **requires** `--state <dir>`; `--public` **with** `--config` is a startup error; a missing or unparseable `<state>/hugin.json` is a startup error. Messages are Norwegian, printed to stderr, exit code 1.
- Public bind: all interfaces; port = `--port`, else `PORT` env, else 5111. Normal mode ignores `PORT`.
- Public mode: every non-GET/HEAD/OPTIONS under `/api` → `403` with problem title **«Demo — skrivebeskyttet»**, before the `X-Hugin` rule. Host allowlist skipped. Response headers `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` on every public-mode response, absent in normal mode.
- `/api/status` gains `readOnly: bool`. Boot sync in public mode only when the `nav` sync state is missing or older than **6 hours**. Review mark in public mode = **now − 7 days** at read time.
- Working db = `<tmp>/hugin-demo/hugin.db` (overridable by `hugin:workingdb`); snapshot = `<state>/hugin.db`; copy-in only when no working copy exists; copy-back order **sync → seeder → `wal_checkpoint(TRUNCATE)` → copy to `.tmp` → move**. Failures log a warning, never throw.
- Seed file `<state>/demo-pipeline.json`: array of `{ orgnr, status, why }`; nine-digit orgnr, status slug `active|applied|answered`, non-empty why; invalid entries skipped with a warning naming them; existing pipeline rows never updated; unknown company skipped and retried after the next sync.
- Web: write controls **hidden** (not disabled) when read-only; banner is a static region after the header (no `aria-live`); first-run dialog never renders until `/api/status` has resolved and only when `readOnly` is false. Every new string in BOTH `hugin-web/src/i18n/nb.ts` and `en.ts` (key-parity test).
- `design-system/` is read-only. New CSS goes in `hugin-web/src/styles/main.css`, mobile-first (`min-width` queries only).
- Scripted edits keep each file's own BOM/EOL (repo files: no BOM; working copy CRLF).
- Tests: backend `dotnet test` from the repo root; frontend `cd hugin-web; npx vitest run <file>` (full: `npm test`), lint `npm run lint`, build `npm run build`.
- Commits: conventional prefix, one commit per task, **no `Co-Authored-By` or "Generated with" trailers** (repo rule overrides any default template). Branch: `feat/demo-deployment` off `main`. Release tag at the end: `v3.4.2` (no version string lives in the code; tags only).

---

### Task 1: `PublicModeOptions` + `PublicMode` (pure: bind address, startup validation)

**Files:**
- Create: `Hugin.Api/PublicMode.cs`
- Test: `Hugin.Tests/Api/PublicModeTests.cs`

**Interfaces:**
- Produces `PublicModeOptions(bool Enabled, string StateDir, string WorkingDbPath)` with `Off`, `ConfigPath`, `SnapshotPath`, `SeedPath`; `PublicMode.ListenAddress(bool isPublic, string? portArg, string? portEnv) → (IPAddress, int)`; `PublicMode.Validate(bool isPublic, string? stateDir, string? configArg) → string?`; `PublicMode.WriteRefusedTitle`. Tasks 2–9 consume these exact names.

- [ ] **Step 1: Write the failing tests.** Create `Hugin.Tests/Api/PublicModeTests.cs`:

```csharp
using System.Net;
using Hugin.Api;

namespace Hugin.Tests.Api;

[TestFixture]
public sealed class PublicModeTests
{
    [Test]
    public void Normal_mode_is_loopback_and_ignores_PORT()
    {
        var (address, port) = PublicMode.ListenAddress(isPublic: false, portArg: null, portEnv: "8080");
        Assert.That(address, Is.EqualTo(IPAddress.Loopback));
        Assert.That(port, Is.EqualTo(5111));
    }

    [Test]
    public void Port_arg_wins_in_both_modes()
    {
        Assert.That(PublicMode.ListenAddress(false, "6000", "8080").Port, Is.EqualTo(6000));
        Assert.That(PublicMode.ListenAddress(true, "6000", "8080").Port, Is.EqualTo(6000));
    }

    [Test]
    public void Public_mode_binds_any_and_reads_PORT()
    {
        var (address, port) = PublicMode.ListenAddress(true, null, "8080");
        Assert.That(address, Is.EqualTo(IPAddress.Any));
        Assert.That(port, Is.EqualTo(8080));
    }

    [Test]
    public void Public_mode_without_PORT_falls_back_to_5111()
    {
        Assert.That(PublicMode.ListenAddress(true, null, null).Port, Is.EqualTo(5111));
        Assert.That(PublicMode.ListenAddress(true, null, "not-a-port").Port, Is.EqualTo(5111));
    }

    [Test]
    public void Validate_passes_normal_mode_through()
    {
        Assert.That(PublicMode.Validate(false, null, null), Is.Null);
        Assert.That(PublicMode.Validate(false, null, @"C:\somewhere\hugin.json"), Is.Null);
    }

    [Test]
    public void Public_needs_state_and_refuses_config()
    {
        Assert.That(PublicMode.Validate(true, null, null), Does.Contain("--state"));
        var dir = Directory.CreateTempSubdirectory("hugin-public-");
        try
        {
            File.WriteAllText(Path.Combine(dir.FullName, "hugin.json"), "{}");
            Assert.That(PublicMode.Validate(true, dir.FullName, "x.json"), Does.Contain("--config"));
            Assert.That(PublicMode.Validate(true, dir.FullName, null), Is.Null);
        }
        finally { dir.Delete(recursive: true); }
    }

    [Test]
    public void Public_needs_the_state_config_to_exist()
    {
        var dir = Directory.CreateTempSubdirectory("hugin-public-");
        try
        {
            var error = PublicMode.Validate(true, dir.FullName, null);
            Assert.That(error, Does.Contain("hugin.json"));
        }
        finally { dir.Delete(recursive: true); }
    }

    [Test]
    public void Options_derive_the_three_state_paths()
    {
        var o = new PublicModeOptions(true, @"C:\state", @"C:\tmp\hugin.db");
        Assert.That(o.ConfigPath, Is.EqualTo(Path.Combine(@"C:\state", "hugin.json")));
        Assert.That(o.SnapshotPath, Is.EqualTo(Path.Combine(@"C:\state", "hugin.db")));
        Assert.That(o.SeedPath, Is.EqualTo(Path.Combine(@"C:\state", "demo-pipeline.json")));
        Assert.That(PublicModeOptions.Off.Enabled, Is.False);
    }
}
```

- [ ] **Step 2: Run to verify it fails.** Run: `dotnet test --filter PublicModeTests`. Expected: build error, `PublicMode` does not exist.

- [ ] **Step 3: Write the implementation.** Create `Hugin.Api/PublicMode.cs`:

```csharp
using System.Net;
using Hugin.Infrastructure;

namespace Hugin.Api;

/// <summary>
/// Everything the host decides differently under <c>--public</c> (spec Part A). Enabled=false is
/// the local app exactly as before: loopback, Host allowlist, writes with X-Hugin. In public mode
/// the state dir owns the config, the seed file and the persisted snapshot; the working database
/// lives on local disk because SQLite locking does not work on App Service's /home share (Part B).
/// </summary>
public sealed record PublicModeOptions(bool Enabled, string StateDir, string WorkingDbPath)
{
    public static readonly PublicModeOptions Off = new(false, "", "");

    public string ConfigPath => Path.Combine(StateDir, ConfigLoader.FileName);
    public string SnapshotPath => Path.Combine(StateDir, ConfigLoader.DatabaseName);
    public string SeedPath => Path.Combine(StateDir, "demo-pipeline.json");
}

public static class PublicMode
{
    public const string WriteRefusedTitle = "Demo — skrivebeskyttet";

    /// <summary>Loopback unless public. Port: --port, then (public only) the PORT env App Service sets, then 5111.</summary>
    public static (IPAddress Address, int Port) ListenAddress(bool isPublic, string? portArg, string? portEnv)
    {
        var port = int.TryParse(portArg, out var fromArg) ? fromArg
            : isPublic && int.TryParse(portEnv, out var fromEnv) ? fromEnv
            : 5111;
        return (isPublic ? IPAddress.Any : IPAddress.Loopback, port);
    }

    /// <summary>The startup error for a --public invocation, or null when it can run. Normal mode never fails here.</summary>
    public static string? Validate(bool isPublic, string? stateDir, string? configArg)
    {
        if (!isPublic) return null;
        if (stateDir is null) return "--public krever --state <mappe>.";
        if (configArg is not null) return "--public og --config kan ikke kombineres — state-mappen eier hugin.json.";
        var config = Path.Combine(stateDir, ConfigLoader.FileName);
        if (!File.Exists(config)) return $"Fant ikke {config} — public-modus starter aldri en førstegangsdialog.";
        return null;
    }
}
```

- [ ] **Step 4: Run to verify it passes.** Run: `dotnet test --filter PublicModeTests`. Expected: 8 passed.

- [ ] **Step 5: Commit.**

```bash
git add Hugin.Api/PublicMode.cs Hugin.Tests/Api/PublicModeTests.cs
git commit -m "feat(api): public-mode options with bind address and startup validation"
```

---

### Task 2: Wire public mode into `Program.cs` + `ApiFactory(publicMode:)`

**Files:**
- Modify: `Hugin.Api/Program.cs` (arg parsing at the top; builder section; the init scope; the started message)
- Modify: `Hugin.Tests/Api/ApiFactory.cs` (new `publicMode` switch, `StateDir`)

**Interfaces:**
- Consumes `PublicMode.Validate`, `PublicMode.ListenAddress`, `PublicModeOptions` (Task 1).
- Produces: `PublicModeOptions` registered as a **singleton** in DI (every later task resolves it); `ApiFactory(bool autosync = false, bool existingDb = false, bool publicMode = false)` with `public string StateDir` (`<tempdir>/state`, created, holding `hugin.json` = `{}`), and in public mode the settings `hugin:public=true`, `hugin:state=<StateDir>`, `hugin:workingdb=<DbPath>`.

- [ ] **Step 1: Replace the top of `Program.cs`** (everything from `var configPath = ArgValue(args, "--config");` through the `builder.WebHost.ConfigureKestrel(...)` line) with:

```csharp
var configArg = ArgValue(args, "--config");
var portArg = ArgValue(args, "--port");
var publicFlag = Array.IndexOf(args, "--public") >= 0;
var stateArg = ArgValue(args, "--state");

if (PublicMode.Validate(publicFlag, stateArg, configArg) is { } startupError)
{
    Console.Error.WriteLine(startupError);
    return 1;
}

// Public mode: the state dir owns hugin.json (validated above); normal mode: --config or beside the exe.
var loaded = ConfigLoader.Load(publicFlag ? Path.Combine(stateArg!, ConfigLoader.FileName) : configArg);
if (loaded.Warning is not null)
{
    Console.Error.WriteLine($"Advarsel: {loaded.Warning}");
    // A broken demo config must never silently become the defaults on a public host.
    if (publicFlag) return 1;
}

var configFile = new HuginConfigFile(loaded.ConfigPath);

// Beside-the-exe rule (matches ConfigLoader): default content root to the exe's own directory,
// not the launch CWD — a published exe started from elsewhere must still find wwwroot. The
// standard ASPNETCORE_CONTENTROOT env var still wins when set, e.g. for test hosts.
var contentRoot = Environment.GetEnvironmentVariable("ASPNETCORE_CONTENTROOT") ?? AppContext.BaseDirectory;

var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    ContentRootPath = contentRoot,
});

// Public mode is decided from the flag for real runs, or from configuration for test hosts
// (ApiFactory sets hugin:public/hugin:state/hugin:workingdb the way it sets hugin:autosync).
var isPublic = publicFlag || builder.Configuration["hugin:public"] == "true";
var publicMode = isPublic
    ? new PublicModeOptions(true,
        stateArg ?? builder.Configuration["hugin:state"]
            ?? throw new InvalidOperationException("hugin:state mangler i public-modus"),
        builder.Configuration["hugin:workingdb"] ?? Path.Combine(Path.GetTempPath(), "hugin-demo", "hugin.db"))
    : PublicModeOptions.Off;
builder.Services.AddSingleton(publicMode);

// Loopback in code, not config: a copied launchSettings must never expose the pipeline on LAN.
// Public mode is the one deliberate exception, and it prints a warning at startup for it.
var (listenAddress, port) = PublicMode.ListenAddress(isPublic, portArg, Environment.GetEnvironmentVariable("PORT"));
builder.WebHost.ConfigureKestrel(o => o.Listen(listenAddress, port));

// SQLite creates the file but not its directory; the working copy lives under the temp dir.
var databasePath = publicMode.Enabled ? publicMode.WorkingDbPath : loaded.DatabasePath;
Directory.CreateDirectory(Path.GetDirectoryName(databasePath)!);
```

Then change the `AddDbContext` registration to use `databasePath`:

```csharp
builder.Services.AddDbContext<HuginDbContext>(o =>
    o.UseSqlite(HuginDbInitializer.ConnectionString(databasePath)));
```

- [ ] **Step 2: Replace the init scope** (the `await using (var scope = app.Services.CreateAsyncScope()) { ... }` block) with:

```csharp
await using (var scope = app.Services.CreateAsyncScope())
{
    var services = scope.ServiceProvider;
    // DI-resolved (not the outer locals) so a test host can point config + db at its own temp dir.
    var file = services.GetRequiredService<HuginConfigFile>();
    var mode = services.GetRequiredService<PublicModeOptions>();
    var dbPath = mode.Enabled ? mode.WorkingDbPath : file.DatabasePath;

    // Fresh install = no db on disk BEFORE InitAsync creates it: hold the boot sync for first-run.
    // Never in public mode — there is no first-run dialog for a visitor to resolve (spec A5).
    if (!mode.Enabled && !File.Exists(dbPath)) services.GetRequiredService<BootSyncGate>().Hold();

    await HuginDbInitializer.InitAsync(services.GetRequiredService<HuginDbContext>(), dbPath,
        services.GetRequiredService<HuginConfig>(), services.GetRequiredService<IClock>().UtcNow);
}
```

- [ ] **Step 3: Replace the open-browser + started message block** (from `var openBrowser = ...` through the end of `app.Lifetime.ApplicationStarted.Register(...)`) with:

```csharp
// One double-click is the whole start-up: open the dashboard in the default browser once the
// host is listening. Every test host sets hugin:openbrowser=false (ApiFactory, and
// RealHostBindingTests via env var), so tests never pop a browser; --no-browser opts out for
// people, and public mode never opens one (nobody is sitting at a server).
var openBrowser = Array.IndexOf(args, "--no-browser") < 0
    && app.Configuration["hugin:openbrowser"] != "false"
    && !isPublic;

app.Lifetime.ApplicationStarted.Register(() =>
{
    if (isPublic)
    {
        // The first log line of a deploy proves the two Linux runtime facts the spec asks for
        // (ICU-backed culture, tzdata-backed Europe/Oslo) before anything else can go wrong.
        string oslo;
        try { oslo = TimeZoneInfo.FindSystemTimeZoneById("Europe/Oslo").Id; }
        catch (TimeZoneNotFoundException) { oslo = "IKKE FUNNET — tzdata mangler"; }
        Console.WriteLine($"Hugin kjører i public-modus på {listenAddress}:{port} — state: {publicMode.StateDir}. "
            + $"Kultur: {System.Globalization.CultureInfo.CurrentCulture.Name}, tidssone Europe/Oslo: {oslo}.");
        Console.WriteLine("ADVARSEL: alt i state-mappen serveres skrivebeskyttet til alle som når porten. "
            + "Bruk aldri --public på en maskin med en ekte pipeline.");
        return;
    }

    Console.WriteLine($"Hugin kjører på http://localhost:{port} — lukk dette vinduet for å avslutte.");

    if (!openBrowser) return;
    try
    {
        System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
        {
            FileName = $"http://localhost:{port}",
            UseShellExecute = true,
        });
    }
    catch (Exception)
    {
        // Best-effort: no default browser (or a locked-down shell) must not stop the server.
    }
});
```

`app.Run();` stays. Because the file now contains `return 1;`, the implicit entry point returns `int`; falling off the end returns 0 — no other change needed.

- [ ] **Step 4: Extend `ApiFactory`.** Change the class header and add the state dir:

```csharp
/// <param name="autosync">Let StartupSync run on boot — only the boot-hold tests want that.</param>
/// <param name="existingDb">Pre-create hugin.db so the host sees an existing install, not a fresh one.</param>
/// <param name="publicMode">Boot the host as the hosted demo: hugin:public + hugin:state (a state dir
/// under the temp dir holding an empty hugin.json) + hugin:workingdb pointed at this factory's DbPath.</param>
public sealed class ApiFactory(bool autosync = false, bool existingDb = false, bool publicMode = false) : WebApplicationFactory<Program>
{
    private readonly DirectoryInfo _dir = Directory.CreateTempSubdirectory("hugin-api-");

    public string ConfigPath => Path.Combine(_dir.FullName, "hugin.json");
    public string DbPath => Path.Combine(_dir.FullName, "hugin.db");
    /// <summary>Public-mode state dir: config, seed file and snapshot live here (spec Part B/C).</summary>
    public string StateDir => Path.Combine(_dir.FullName, "state");
```

and inside `ConfigureWebHost`, right after the existing two `UseSetting` lines:

```csharp
        if (publicMode)
        {
            Directory.CreateDirectory(StateDir);
            File.WriteAllText(Path.Combine(StateDir, "hugin.json"), "{}");
            builder.UseSetting("hugin:public", "true");
            builder.UseSetting("hugin:state", StateDir);
            builder.UseSetting("hugin:workingdb", DbPath);
        }
```

- [ ] **Step 5: Build and run the whole backend suite.** Run: `dotnet build` (expect 0 warnings) then `dotnet test`. Expected: every existing test passes (340 before this wave) plus the 8 from Task 1. If `RealHostBindingTests` fails on the `return 1;` change, the cause is the `int` entry point — it is not; it still binds loopback because no `--public` is passed.

- [ ] **Step 6: Smoke the startup errors by hand** (no test can exercise the real arg path without a process):

```powershell
dotnet run --project Hugin.Api -- --public
dotnet run --project Hugin.Api -- --public --state C:\nonexistent
```

Expected: the first prints «--public krever --state <mappe>.» and exits 1; the second prints «Fant ikke C:\nonexistent\hugin.json …» and exits 1.

- [ ] **Step 7: Commit.**

```bash
git add Hugin.Api/Program.cs Hugin.Tests/Api/ApiFactory.cs
git commit -m "feat(api): --public --state wiring, all-interfaces bind, no first-run hold, startup line"
```

---

### Task 3: Security middleware — public branch (refuse writes, skip Host check, three headers)

**Files:**
- Modify: `Hugin.Api/Security.cs`
- Modify: `Hugin.Api/Program.cs` (the `app.UseHuginSecurity();` line)
- Modify: `Hugin.Tests/Api/SecurityTests.cs` (one new test)
- Create: `Hugin.Tests/Api/PublicSecurityTests.cs`

**Interfaces:**
- Consumes `PublicModeOptions`, `PublicMode.WriteRefusedTitle`, `ApiFactory(publicMode: true)`.
- Produces `UseHuginSecurity(this IApplicationBuilder app, PublicModeOptions mode)`.

- [ ] **Step 1: Write the failing tests.** Create `Hugin.Tests/Api/PublicSecurityTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;

namespace Hugin.Tests.Api;

[TestFixture]
public sealed class PublicSecurityTests
{
    private ApiFactory _factory = null!;

    [OneTimeSetUp] public void Up() => _factory = new ApiFactory(publicMode: true);
    [OneTimeTearDown] public void Down() => _factory.Dispose();

    [Test]
    public async Task Write_with_the_dashboard_header_is_still_403_with_the_demo_title()
    {
        using var client = _factory.CreateApiClient(); // X-Hugin: 1 — irrelevant in public mode
        var response = await client.PostAsync("/api/seen", JsonContent.Create(new { asOf = DateTimeOffset.UtcNow }));
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.Forbidden));
        Assert.That(await response.Content.ReadAsStringAsync(), Does.Contain("Demo — skrivebeskyttet"));
    }

    [Test]
    public async Task Every_write_verb_under_api_is_refused()
    {
        using var client = _factory.CreateApiClient();
        var put = await client.PutAsJsonAsync("/api/pipeline/922425620", new { status = "active" });
        var del = await client.DeleteAsync("/api/ads/x/hide");
        var sync = await client.PostAsync("/api/sync", null);
        Assert.Multiple(() =>
        {
            Assert.That(put.StatusCode, Is.EqualTo(HttpStatusCode.Forbidden));
            Assert.That(del.StatusCode, Is.EqualTo(HttpStatusCode.Forbidden));
            Assert.That(sync.StatusCode, Is.EqualTo(HttpStatusCode.Forbidden));
        });
    }

    [Test]
    public async Task Get_passes_and_a_foreign_host_header_is_fine()
    {
        using var client = _factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/status");
        request.Headers.TryAddWithoutValidation("Host", "hugin-demo.azurewebsites.net");
        var response = await client.SendAsync(request);
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.OK));
    }

    [Test]
    public async Task Public_responses_carry_the_three_hardening_headers()
    {
        using var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/status");
        Assert.Multiple(() =>
        {
            Assert.That(response.Headers.GetValues("X-Content-Type-Options").Single(), Is.EqualTo("nosniff"));
            Assert.That(response.Headers.GetValues("X-Frame-Options").Single(), Is.EqualTo("DENY"));
            Assert.That(response.Headers.GetValues("Referrer-Policy").Single(), Is.EqualTo("no-referrer"));
        });
    }
}
```

Add to the existing `SecurityTests` fixture (normal mode):

```csharp
    [Test]
    public async Task No_hardening_headers_in_normal_mode()
    {
        using var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/status");
        Assert.That(response.Headers.Contains("X-Frame-Options"), Is.False,
            "the public-mode headers are a public-mode thing — the local app is unchanged");
    }
```

- [ ] **Step 2: Run to verify they fail.** Run: `dotnet test --filter "PublicSecurityTests|SecurityTests"`. Expected: the four public tests fail (403 on GET with foreign Host, 403 without the demo title, headers missing); the normal-mode one passes already.

- [ ] **Step 3: Rewrite `Security.cs`:**

```csharp
using Microsoft.AspNetCore.Http;

namespace Hugin.Api;

/// <summary>
/// Localhost is not a boundary against the browser: any web page can fire simple requests at
/// http://localhost:*, and DNS rebinding can read responses. Two cheap rules close both holes
/// for a single-user loopback API — see the phase-2 spec's "API security" section.
///
/// Public mode (the hosted demo) swaps the model: the platform routes by hostname so the Host
/// allowlist is skipped, and instead of gating writes on a header, every write is refused —
/// there is nothing a visitor may change. Three response headers harden the now internet-facing
/// SPA (demo spec A9).
/// </summary>
public static class Security
{
    private static readonly string[] AllowedHosts = ["localhost", "127.0.0.1", "[::1]"];

    public static IApplicationBuilder UseHuginSecurity(this IApplicationBuilder app, PublicModeOptions mode) =>
        app.Use(async (context, next) =>
        {
            if (mode.Enabled)
            {
                context.Response.OnStarting(() =>
                {
                    var headers = context.Response.Headers;
                    headers["X-Content-Type-Options"] = "nosniff";
                    headers["X-Frame-Options"] = "DENY";
                    headers["Referrer-Policy"] = "no-referrer";
                    return Task.CompletedTask;
                });
            }
            else
            {
                var host = context.Request.Host.Host;
                if (!AllowedHosts.Contains(host, StringComparer.OrdinalIgnoreCase))
                {
                    await Results.Problem(statusCode: StatusCodes.Status403Forbidden,
                        title: "Ukjent Host-header — Hugin svarer bare på localhost.")
                        .ExecuteAsync(context);
                    return;
                }
            }

            var method = context.Request.Method;
            var isWrite = method != HttpMethods.Get && method != HttpMethods.Head && method != HttpMethods.Options;
            if (isWrite && context.Request.Path.StartsWithSegments("/api"))
            {
                if (mode.Enabled)
                {
                    await Results.Problem(statusCode: StatusCodes.Status403Forbidden,
                        title: PublicMode.WriteRefusedTitle).ExecuteAsync(context);
                    return;
                }

                if (context.Request.Headers["X-Hugin"] != "1")
                {
                    // A missing custom header means the request never passed a CORS preflight —
                    // i.e. it did not come from the dashboard.
                    await Results.Problem(statusCode: StatusCodes.Status403Forbidden,
                        title: "Mangler X-Hugin-header — skriving er forbeholdt dashbordet.")
                        .ExecuteAsync(context);
                    return;
                }
            }

            await next();
        });
}
```

In `Program.cs` replace `app.UseHuginSecurity();` with:

```csharp
app.UseHuginSecurity(app.Services.GetRequiredService<PublicModeOptions>());
```

- [ ] **Step 4: Run to verify they pass.** Run: `dotnet test --filter "PublicSecurityTests|SecurityTests|BootSyncTests|WriteEndpointTests"`. Expected: all pass (the normal-mode write tests prove the `X-Hugin` branch is intact).

- [ ] **Step 5: Commit.**

```bash
git add Hugin.Api/Security.cs Hugin.Api/Program.cs Hugin.Tests/Api/SecurityTests.cs Hugin.Tests/Api/PublicSecurityTests.cs
git commit -m "feat(api): public mode refuses every write, skips the Host allowlist, adds hardening headers"
```

---

### Task 4: `/api/status.readOnly`

**Files:**
- Modify: `Hugin.Api/Contracts.cs` (`StatusDto`)
- Modify: `Hugin.Api/Endpoints/ReadEndpoints.cs` (the `/api/status` handler)
- Create: `Hugin.Tests/Api/PublicModeEndpointTests.cs`

**Interfaces:**
- Produces `StatusDto(..., int PipelineEntries, bool ReadOnly)` — the JSON field `readOnly` the web reads in Task 10.

- [ ] **Step 1: Write the failing tests.** Create `Hugin.Tests/Api/PublicModeEndpointTests.cs`:

```csharp
using System.Net.Http.Json;
using Hugin.Api;

namespace Hugin.Tests.Api;

[TestFixture]
public sealed class PublicModeEndpointTests
{
    [Test]
    public async Task Status_reports_read_only_in_public_mode()
    {
        using var factory = new ApiFactory(publicMode: true);
        using var client = factory.CreateClient();
        var status = await client.GetFromJsonAsync<StatusDto>("/api/status");
        Assert.That(status!.ReadOnly, Is.True);
    }

    [Test]
    public async Task Status_is_writable_in_normal_mode()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        var status = await client.GetFromJsonAsync<StatusDto>("/api/status");
        Assert.That(status!.ReadOnly, Is.False);
    }
}
```

- [ ] **Step 2: Run to verify it fails.** Run: `dotnet test --filter PublicModeEndpointTests`. Expected: build error, `ReadOnly` not a member of `StatusDto`.

- [ ] **Step 3: Implement.** In `Contracts.cs`:

```csharp
public sealed record StatusDto(SourceStateDto? Brreg, SourceStateDto? Nav, DateTimeOffset? ReviewMark,
    int ActiveAds, int Companies, int PipelineEntries, bool ReadOnly);
```

In `ReadEndpoints.cs` the `/api/status` handler gains `PublicModeOptions mode` as its last parameter and passes `mode.Enabled`:

```csharp
        app.MapGet("/api/status", async (ISyncStateRepository syncState, IReviewMarkRepository mark,
            IAdRepository ads, ICompanyRepository companies, IPipelineRepository pipeline, IClock clock,
            PublicModeOptions mode) =>
        {
            var brreg = await syncState.GetAsync("brreg");
            var nav = await syncState.GetAsync("nav");
            return Results.Ok(new StatusDto(
                brreg?.LastSyncUtc is { } brregSync ? new SourceStateDto(brregSync) : null,
                nav?.LastSyncUtc is { } navSync ? new SourceStateDto(navSync) : null,
                await mark.GetAsync(),
                (await ads.GetActiveAsync(clock.UtcNow)).Count,
                (await companies.GetAllAsync()).Count,
                (await pipeline.GetAllAsync()).Count,
                mode.Enabled));
        });
```

- [ ] **Step 4: Run to verify it passes.** Run: `dotnet test --filter "PublicModeEndpointTests|ReadEndpointTests"`. Expected: all pass.

- [ ] **Step 5: Commit.**

```bash
git add Hugin.Api/Contracts.cs Hugin.Api/Endpoints/ReadEndpoints.cs Hugin.Tests/Api/PublicModeEndpointTests.cs
git commit -m "feat(api): /api/status reports readOnly"
```

---

### Task 5: Boot-sync throttle (6 h) in public mode

**Files:**
- Modify: `Hugin.Api/Services/StartupSync.cs`
- Modify: `Hugin.Tests/Api/BootSyncTests.cs` (three new tests + one helper)

**Interfaces:**
- Consumes `PublicModeOptions`, `ISyncStateRepository` (`GetAsync("nav")`), `IClock`.
- Produces `StartupSync.PublicMinimumInterval = 6 h`.

- [ ] **Step 1: Write the failing tests.** Append to `BootSyncTests`:

```csharp
    /// <summary>Pre-seeds the nav sync state in the factory's db BEFORE the host starts, so
    /// StartupSync sees an existing snapshot of a given age. Mirrors how the demo's copy-in
    /// hands the host a db with history.</summary>
    private static async Task SeedNavSyncAsync(ApiFactory factory, TimeSpan age)
    {
        var options = new Microsoft.EntityFrameworkCore.DbContextOptionsBuilder<Hugin.Infrastructure.Data.HuginDbContext>()
            .UseSqlite(Hugin.Infrastructure.Data.HuginDbInitializer.ConnectionString(factory.DbPath))
            .Options;
        await using var db = new Hugin.Infrastructure.Data.HuginDbContext(options);
        await Hugin.Infrastructure.Data.HuginDbInitializer.InitAsync(db);
        await new Hugin.Infrastructure.Data.EfSyncStateRepository(db).SetAsync("nav", null, DateTimeOffset.UtcNow - age);
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
    }

    [Test]
    public async Task Public_mode_skips_the_boot_sync_when_nav_synced_five_hours_ago()
    {
        using var factory = new ApiFactory(autosync: true, publicMode: true);
        await SeedNavSyncAsync(factory, TimeSpan.FromHours(5));
        using var client = factory.CreateClient();

        await Task.Delay(300);
        var status = await client.GetFromJsonAsync<SyncRunStatus>("/api/sync/status");
        Assert.That(status!.Running, Is.False);
        Assert.That(status.StartedUtc, Is.Null, "a fresh cold start must not re-sync inside the 6 h window");
    }

    [Test]
    public async Task Public_mode_syncs_when_nav_synced_seven_hours_ago()
    {
        using var factory = new ApiFactory(autosync: true, publicMode: true);
        await SeedNavSyncAsync(factory, TimeSpan.FromHours(7));
        using var client = factory.CreateClient();

        var status = await SyncEndpointTests.PollUntilFinished(client);
        Assert.That(status.FinishedUtc, Is.Not.Null);
    }

    [Test]
    public async Task Public_mode_never_holds_the_boot_sync_on_an_empty_db()
    {
        using var factory = new ApiFactory(autosync: true, publicMode: true); // no db on disk
        using var client = factory.CreateClient();

        var status = await SyncEndpointTests.PollUntilFinished(client);
        Assert.That(status.Brreg!.Succeeded, Is.True, "no first-run dialog exists to release a hold");
    }
```

Add `using Microsoft.EntityFrameworkCore;` at the top of the file (for `UseSqlite`).

- [ ] **Step 2: Run to verify they fail.** Run: `dotnet test --filter BootSyncTests`. Expected: the five-hour test fails (a sync starts).

- [ ] **Step 3: Rewrite `StartupSync.cs`:**

```csharp
using Hugin.Core.Abstractions;

namespace Hugin.Api.Services;

/// <summary>
/// Boot sync. Normal mode: every start (a held gate means a fresh install waiting for first-run —
/// the dialog, or its Esc, starts the sync). Public mode: F1 sleeps after ~20 min idle and every
/// wake is a cold start, so the boot sync only runs when the last NAV sync is missing or older
/// than <see cref="PublicMinimumInterval"/> — otherwise repeat visitors would spend the daily
/// CPU quota on syncs that fetch nothing (demo spec A6).
/// </summary>
public sealed class StartupSync(SyncRunner runner, BootSyncGate gate, IConfiguration configuration,
    PublicModeOptions mode, IServiceScopeFactory scopes, IClock clock) : IHostedService
{
    public static readonly TimeSpan PublicMinimumInterval = TimeSpan.FromHours(6);

    public async Task StartAsync(CancellationToken ct)
    {
        if (configuration["hugin:autosync"] == "false" || gate.Held) return;
        if (mode.Enabled && !await NavIsStaleAsync(ct)) return;
        runner.TryStart();
    }

    public Task StopAsync(CancellationToken ct) => Task.CompletedTask;

    private async Task<bool> NavIsStaleAsync(CancellationToken ct)
    {
        await using var scope = scopes.CreateAsyncScope();
        var nav = await scope.ServiceProvider.GetRequiredService<ISyncStateRepository>().GetAsync("nav", ct);
        return nav is null || clock.UtcNow - nav.LastSyncUtc >= PublicMinimumInterval;
    }
}
```

- [ ] **Step 4: Run to verify they pass.** Run: `dotnet test --filter BootSyncTests`. Expected: all (existing five + new three) pass.

- [ ] **Step 5: Commit.**

```bash
git add Hugin.Api/Services/StartupSync.cs Hugin.Tests/Api/BootSyncTests.cs
git commit -m "feat(api): throttle the public-mode boot sync to once per six hours"
```

---

### Task 6: Rolling 7-day review mark in public mode

**Files:**
- Create: `Hugin.Api/Services/RollingReviewMark.cs`
- Modify: `Hugin.Api/Program.cs` (the `IReviewMarkRepository` registration)
- Modify: `Hugin.Tests/Api/PublicModeEndpointTests.cs` (one new test)

**Interfaces:**
- Produces `RollingReviewMark(IReviewMarkRepository inner, IClock clock) : IReviewMarkRepository` with `Window = 7 days`.

- [ ] **Step 1: Write the failing test.** Append to `PublicModeEndpointTests`:

```csharp
    [Test]
    public async Task New_since_is_a_rolling_seven_day_window_in_public_mode()
    {
        using var factory = new ApiFactory(publicMode: true);
        using var client = factory.CreateClient();
        var response = await client.GetAsync("/api/new");
        Assert.That(response.StatusCode, Is.EqualTo(System.Net.HttpStatusCode.OK),
            "no stored mark, yet public mode always has a baseline");
        var items = await response.Content.ReadFromJsonAsync<NewDto>();
        var expected = DateTimeOffset.UtcNow.AddDays(-7);
        Assert.That(items!.Since, Is.EqualTo(expected).Within(TimeSpan.FromMinutes(1)));
    }
```

- [ ] **Step 2: Run to verify it fails.** Run: `dotnet test --filter PublicModeEndpointTests`. Expected: FAIL — `/api/new` returns 204 (no mark).

- [ ] **Step 3: Implement.** Create `Hugin.Api/Services/RollingReviewMark.cs`:

```csharp
using Hugin.Core.Abstractions;

namespace Hugin.Api.Services;

/// <summary>
/// Public-mode review mark: nobody can press «Merk som sett» on the demo, so a stored mark would
/// freeze at the snapshot date and «Nytt siden sist» would grow without bound. Reads answer
/// "now minus a week" instead; writes still go to the real row (the sync's initial-baseline write
/// never fires because a read is never null). Demo spec A8.
/// </summary>
public sealed class RollingReviewMark(IReviewMarkRepository inner, IClock clock) : IReviewMarkRepository
{
    public static readonly TimeSpan Window = TimeSpan.FromDays(7);

    public Task<DateTimeOffset?> GetAsync(CancellationToken ct = default) =>
        Task.FromResult<DateTimeOffset?>(clock.UtcNow - Window);

    public Task SetAsync(DateTimeOffset mark, CancellationToken ct = default) => inner.SetAsync(mark, ct);
}
```

In `Program.cs` replace `builder.Services.AddScoped<IReviewMarkRepository, EfReviewMarkRepository>();` with:

```csharp
if (publicMode.Enabled)
    builder.Services.AddScoped<IReviewMarkRepository>(sp => new RollingReviewMark(
        new EfReviewMarkRepository(sp.GetRequiredService<HuginDbContext>()), sp.GetRequiredService<IClock>()));
else
    builder.Services.AddScoped<IReviewMarkRepository, EfReviewMarkRepository>();
```

- [ ] **Step 4: Run to verify it passes.** Run: `dotnet test --filter "PublicModeEndpointTests|ReadEndpointTests|ExtractEndpointTests"`. Expected: all pass (normal mode unchanged).

- [ ] **Step 5: Commit.**

```bash
git add Hugin.Api/Services/RollingReviewMark.cs Hugin.Api/Program.cs Hugin.Tests/Api/PublicModeEndpointTests.cs
git commit -m "feat(api): rolling seven-day review mark in public mode"
```

---

### Task 7: `DemoSnapshot` — copy-in at boot, copy-back after sync

**Files:**
- Create: `Hugin.Api/Services/DemoSnapshot.cs`
- Test: `Hugin.Tests/Api/DemoSnapshotTests.cs`

**Interfaces:**
- Consumes `PublicModeOptions` (`WorkingDbPath`, `SnapshotPath`, `StateDir`).
- Produces `DemoSnapshot(PublicModeOptions mode, ILogger<DemoSnapshot> logger)` with `bool CopyIn()` and `Task<bool> CopyBackAsync(HuginDbContext db, CancellationToken ct = default)`. Task 9 wires both.

- [ ] **Step 1: Write the failing tests.** Create `Hugin.Tests/Api/DemoSnapshotTests.cs`:

```csharp
using Hugin.Api;
using Hugin.Api.Services;
using Hugin.Core.Models;
using Hugin.Infrastructure.Data;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;

namespace Hugin.Tests.Api;

[TestFixture]
public sealed class DemoSnapshotTests
{
    private DirectoryInfo _root = null!;
    private PublicModeOptions _mode = null!;

    [SetUp]
    public void Up()
    {
        _root = Directory.CreateTempSubdirectory("hugin-snapshot-");
        var state = Path.Combine(_root.FullName, "state");
        Directory.CreateDirectory(state);
        _mode = new PublicModeOptions(true, state, Path.Combine(_root.FullName, "work", "hugin.db"));
    }

    [TearDown]
    public void Down()
    {
        SqliteConnection.ClearAllPools();
        try { _root.Delete(recursive: true); } catch (IOException) { }
    }

    private DemoSnapshot Snapshot() => new(_mode, NullLogger<DemoSnapshot>.Instance);

    private static DbContextOptions<HuginDbContext> Options(string path) =>
        new DbContextOptionsBuilder<HuginDbContext>().UseSqlite(HuginDbInitializer.ConnectionString(path)).Options;

    [Test]
    public void Copy_in_copies_the_snapshot_when_no_working_copy_exists()
    {
        File.WriteAllText(_mode.SnapshotPath, "snapshot-bytes");
        Assert.That(Snapshot().CopyIn(), Is.True);
        Assert.That(File.ReadAllText(_mode.WorkingDbPath), Is.EqualTo("snapshot-bytes"));
    }

    [Test]
    public void Copy_in_keeps_an_existing_working_copy()
    {
        File.WriteAllText(_mode.SnapshotPath, "old-snapshot");
        Directory.CreateDirectory(Path.GetDirectoryName(_mode.WorkingDbPath)!);
        File.WriteAllText(_mode.WorkingDbPath, "newer-working-copy");
        Assert.That(Snapshot().CopyIn(), Is.False);
        Assert.That(File.ReadAllText(_mode.WorkingDbPath), Is.EqualTo("newer-working-copy"));
    }

    [Test]
    public void Copy_in_without_a_snapshot_starts_empty()
    {
        Assert.That(Snapshot().CopyIn(), Is.False);
        Assert.That(File.Exists(_mode.WorkingDbPath), Is.False);
    }

    [Test]
    public void Nothing_happens_in_normal_mode()
    {
        var off = new DemoSnapshot(PublicModeOptions.Off, NullLogger<DemoSnapshot>.Instance);
        Assert.That(off.CopyIn(), Is.False);
    }

    [Test]
    public async Task Copy_back_writes_a_valid_snapshot_and_clears_a_stale_tmp()
    {
        Directory.CreateDirectory(Path.GetDirectoryName(_mode.WorkingDbPath)!);
        File.WriteAllText(_mode.SnapshotPath + ".tmp", "stale");
        await using (var db = new HuginDbContext(Options(_mode.WorkingDbPath)))
        {
            await HuginDbInitializer.InitAsync(db);
            db.Sources.Add(new Source { Label = "Demo", Url = "https://example.org", Position = 99 });
            await db.SaveChangesAsync();
            Assert.That(await Snapshot().CopyBackAsync(db), Is.True);
        }

        Assert.That(File.Exists(_mode.SnapshotPath + ".tmp"), Is.False, "the tmp is moved, never left behind");
        await using var check = new HuginDbContext(Options(_mode.SnapshotPath));
        Assert.That(await check.Sources.AnyAsync(s => s.Label == "Demo"), Is.True);
    }

    [Test]
    public async Task Copy_back_into_an_unwritable_state_dir_logs_and_returns_false()
    {
        var blocked = new PublicModeOptions(true, Path.Combine(_root.FullName, "not-a-dir"), _mode.WorkingDbPath);
        File.WriteAllText(blocked.StateDir, "a file where the dir should be");
        Directory.CreateDirectory(Path.GetDirectoryName(_mode.WorkingDbPath)!);
        await using var db = new HuginDbContext(Options(_mode.WorkingDbPath));
        await HuginDbInitializer.InitAsync(db);

        var snapshot = new DemoSnapshot(blocked, NullLogger<DemoSnapshot>.Instance);
        Assert.That(await snapshot.CopyBackAsync(db), Is.False);
    }
}
```

- [ ] **Step 2: Run to verify they fail.** Run: `dotnet test --filter DemoSnapshotTests`. Expected: build error, `DemoSnapshot` missing.

- [ ] **Step 3: Implement.** Create `Hugin.Api/Services/DemoSnapshot.cs`:

```csharp
using Hugin.Infrastructure.Data;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Hugin.Api.Services;

/// <summary>
/// Public-mode persistence (demo spec Part B). App Service mounts /home as a CIFS share where
/// SQLite locking does not work, so the host runs on a working copy on local disk and keeps a
/// plain-file snapshot in the state dir: copy-in once at boot (only when no working copy is
/// there — an in-place restart keeps its newer copy), copy-back after every sync via a
/// checkpoint, a .tmp and a move. Every failure is a warning: the worst case is a full re-walk
/// on the next cold start, never a broken demo.
/// </summary>
public sealed class DemoSnapshot(PublicModeOptions mode, ILogger<DemoSnapshot> logger)
{
    /// <summary>True when the snapshot was copied into place; false when skipped, absent or failed.</summary>
    public bool CopyIn()
    {
        if (!mode.Enabled) return false;
        if (File.Exists(mode.WorkingDbPath))
        {
            logger.LogInformation("Arbeidskopi finnes allerede — beholder den framfor snapshot i {State}.", mode.StateDir);
            return false;
        }
        if (!File.Exists(mode.SnapshotPath))
        {
            logger.LogWarning("Ingen snapshot i {State} — starter tom (full synk).", mode.StateDir);
            return false;
        }

        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(mode.WorkingDbPath)!);
            File.Copy(mode.SnapshotPath, mode.WorkingDbPath);
            return true;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            logger.LogWarning(ex, "Kunne ikke kopiere inn snapshot fra {State}.", mode.StateDir);
            return false;
        }
    }

    /// <summary>Checkpoint, copy to .tmp beside the snapshot, move over it. Runs after the seeder (Task 9).</summary>
    public async Task<bool> CopyBackAsync(HuginDbContext db, CancellationToken ct = default)
    {
        if (!mode.Enabled) return false;
        var tmp = mode.SnapshotPath + ".tmp";
        try
        {
            await db.Database.ExecuteSqlRawAsync("PRAGMA wal_checkpoint(TRUNCATE);", ct);
            Directory.CreateDirectory(mode.StateDir);
            File.Copy(mode.WorkingDbPath, tmp, overwrite: true);
            File.Move(tmp, mode.SnapshotPath, overwrite: true);
            return true;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or SqliteException)
        {
            logger.LogWarning(ex, "Kunne ikke kopiere snapshot tilbake til {State}.", mode.StateDir);
            return false;
        }
    }
}
```

- [ ] **Step 4: Run to verify they pass.** Run: `dotnet test --filter DemoSnapshotTests`. Expected: 6 passed. If `Copy_back_into_an_unwritable_state_dir…` throws instead of returning false, the exception type escaped the filter — add it to the `when` clause rather than widening to `Exception`.

- [ ] **Step 5: Commit.**

```bash
git add Hugin.Api/Services/DemoSnapshot.cs Hugin.Tests/Api/DemoSnapshotTests.cs
git commit -m "feat(api): demo snapshot copy-in and copy-back around the local working db"
```

---

### Task 8: `DemoSeeder` — idempotent pipeline seed from `demo-pipeline.json`

**Files:**
- Create: `Hugin.Api/Services/DemoSeeder.cs`
- Test: `Hugin.Tests/Api/DemoSeederTests.cs`

**Interfaces:**
- Consumes `PublicModeOptions.SeedPath`, `IPipelineRepository`, `ICompanyRepository`, `IClock`, `StatusSlug.Parse` (in `Hugin.Api/Contracts.cs`).
- Produces `DemoSeeder.Parse(string json, out List<string> problems) → IReadOnlyList<DemoSeedEntry>` and `Task<int> ApplyAsync(CancellationToken ct = default)` (returns rows inserted). Task 9 wires `ApplyAsync`.

- [ ] **Step 1: Write the failing tests.** Create `Hugin.Tests/Api/DemoSeederTests.cs`:

```csharp
using Hugin.Api;
using Hugin.Api.Services;
using Hugin.Core.Abstractions;
using Hugin.Core.Models;
using Hugin.Infrastructure.Data;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;

namespace Hugin.Tests.Api;

[TestFixture]
public sealed class DemoSeederTests
{
    private DirectoryInfo _root = null!;
    private PublicModeOptions _mode = null!;
    private HuginDbContext _db = null!;

    [SetUp]
    public async Task Up()
    {
        _root = Directory.CreateTempSubdirectory("hugin-seed-");
        _mode = new PublicModeOptions(true, _root.FullName, Path.Combine(_root.FullName, "hugin.db"));
        var options = new DbContextOptionsBuilder<HuginDbContext>()
            .UseSqlite(HuginDbInitializer.ConnectionString(_mode.WorkingDbPath)).Options;
        _db = new HuginDbContext(options);
        await HuginDbInitializer.InitAsync(_db);
        _db.Companies.Add(new Company { Orgnr = "922425620", Name = "TRETOEN AS", FirstSeen = DateTimeOffset.UtcNow, LastSeenInRegister = DateTimeOffset.UtcNow });
        await _db.SaveChangesAsync();
    }

    [TearDown]
    public async Task Down()
    {
        await _db.DisposeAsync();
        SqliteConnection.ClearAllPools();
        try { _root.Delete(recursive: true); } catch (IOException) { }
    }

    private DemoSeeder Seeder(PublicModeOptions? mode = null) => new(mode ?? _mode,
        new EfPipelineRepository(_db), new EfCompanyRepository(_db), new SystemClock(), NullLogger<DemoSeeder>.Instance);

    private void WriteSeed(string json) => File.WriteAllText(_mode.SeedPath, json);

    [Test]
    public void Parse_accepts_valid_entries_and_names_each_invalid_one()
    {
        var entries = DemoSeeder.Parse("""
            [
              { "orgnr": "922425620", "status": "active", "why": "Demo." },
              { "orgnr": "12345", "status": "active", "why": "kort orgnr" },
              { "orgnr": "983398308", "status": "hired", "why": "ukjent status" },
              { "orgnr": "935567343", "status": "active", "why": "" }
            ]
            """, out var problems);
        Assert.That(entries.Select(e => e.Orgnr), Is.EqualTo(new[] { "922425620" }));
        Assert.That(problems, Has.Count.EqualTo(3));
        Assert.That(problems[0], Does.Contain("12345"));
    }

    [Test]
    public void Parse_of_broken_json_yields_nothing_and_one_problem()
    {
        var entries = DemoSeeder.Parse("{ not an array", out var problems);
        Assert.That(entries, Is.Empty);
        Assert.That(problems, Has.Count.EqualTo(1));
    }

    [Test]
    public async Task Apply_inserts_an_absent_entry_for_a_known_company()
    {
        WriteSeed("""[{ "orgnr": "922425620", "status": "active", "why": "Demo: sporet for å vise badges." }]""");
        Assert.That(await Seeder().ApplyAsync(), Is.EqualTo(1));
        var entry = await _db.Pipeline.SingleAsync();
        Assert.That(entry.Status, Is.EqualTo(PipelineStatus.Active));
        Assert.That(entry.Why, Is.EqualTo("Demo: sporet for å vise badges."));
        Assert.That(entry.Starred, Is.False);
    }

    [Test]
    public async Task Apply_never_updates_an_existing_entry()
    {
        _db.Pipeline.Add(new PipelineEntry { Orgnr = "922425620", Status = PipelineStatus.Applied, Why = "handwritten", Created = DateTimeOffset.UtcNow, Updated = DateTimeOffset.UtcNow });
        await _db.SaveChangesAsync();
        WriteSeed("""[{ "orgnr": "922425620", "status": "active", "why": "Demo." }]""");
        Assert.That(await Seeder().ApplyAsync(), Is.EqualTo(0));
        var entry = await _db.Pipeline.SingleAsync();
        Assert.That(entry.Why, Is.EqualTo("handwritten"));
        Assert.That(entry.Status, Is.EqualTo(PipelineStatus.Applied));
    }

    [Test]
    public async Task Apply_skips_an_unknown_company_so_the_next_sync_can_retry()
    {
        WriteSeed("""[{ "orgnr": "983398308", "status": "active", "why": "Demo." }]""");
        Assert.That(await Seeder().ApplyAsync(), Is.EqualTo(0));
        Assert.That(await _db.Pipeline.AnyAsync(), Is.False);

        _db.Companies.Add(new Company { Orgnr = "983398308", Name = "ARRIBATEC CLOUD AS", FirstSeen = DateTimeOffset.UtcNow, LastSeenInRegister = DateTimeOffset.UtcNow });
        await _db.SaveChangesAsync();
        Assert.That(await Seeder().ApplyAsync(), Is.EqualTo(1));
    }

    [Test]
    public async Task Apply_is_a_no_op_without_a_file_or_outside_public_mode()
    {
        Assert.That(await Seeder().ApplyAsync(), Is.EqualTo(0), "no seed file");
        WriteSeed("""[{ "orgnr": "922425620", "status": "active", "why": "Demo." }]""");
        Assert.That(await Seeder(PublicModeOptions.Off).ApplyAsync(), Is.EqualTo(0), "normal mode ignores the file");
    }
}
```

- [ ] **Step 2: Run to verify they fail.** Run: `dotnet test --filter DemoSeederTests`. Expected: build error, `DemoSeeder` missing.

- [ ] **Step 3: Implement.** Create `Hugin.Api/Services/DemoSeeder.cs`:

```csharp
using System.Text.Json;
using System.Text.RegularExpressions;
using Hugin.Core.Abstractions;
using Hugin.Core.Models;

namespace Hugin.Api.Services;

public sealed record DemoSeedEntry(string Orgnr, PipelineStatus Status, string Why);

/// <summary>
/// Seeds the demo pipeline from <c>&lt;state&gt;/demo-pipeline.json</c> (demo spec Part C):
/// insert-if-absent, never update (the demo cannot drift), unknown companies skipped and retried
/// after the next sync once Brreg has been walked. Runs at boot and after every sync, before the
/// snapshot copy-back, and only in public mode.
/// </summary>
public sealed partial class DemoSeeder(PublicModeOptions mode, IPipelineRepository pipeline,
    ICompanyRepository companies, IClock clock, ILogger<DemoSeeder> logger)
{
    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNameCaseInsensitive = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true,
    };

    private sealed record RawEntry(string? Orgnr, string? Status, string? Why);

    [GeneratedRegex(@"^\d{9}$")]
    private static partial Regex Orgnr();

    /// <summary>Pure parse + validate: every invalid entry becomes one problem line and is dropped, the rest survive.</summary>
    public static IReadOnlyList<DemoSeedEntry> Parse(string json, out List<string> problems)
    {
        problems = [];
        RawEntry?[]? raw;
        try
        {
            raw = JsonSerializer.Deserialize<RawEntry?[]>(json, Json);
        }
        catch (JsonException ex)
        {
            problems.Add($"demo-pipeline.json er ikke gyldig JSON-liste: {ex.Message}");
            return [];
        }
        if (raw is null) { problems.Add("demo-pipeline.json er tom."); return []; }

        var entries = new List<DemoSeedEntry>();
        foreach (var entry in raw)
        {
            if (entry?.Orgnr is null || !Orgnr().IsMatch(entry.Orgnr))
            {
                problems.Add($"ugyldig orgnr «{entry?.Orgnr}» — må være ni siffer");
                continue;
            }
            if (StatusSlug.Parse(entry.Status) is not { } status)
            {
                problems.Add($"{entry.Orgnr}: ukjent status «{entry.Status}» (active|applied|answered)");
                continue;
            }
            if (string.IsNullOrWhiteSpace(entry.Why))
            {
                problems.Add($"{entry.Orgnr}: why mangler");
                continue;
            }
            entries.Add(new DemoSeedEntry(entry.Orgnr, status, entry.Why.Trim()));
        }
        return entries;
    }

    /// <summary>Returns the number of pipeline rows inserted this run.</summary>
    public async Task<int> ApplyAsync(CancellationToken ct = default)
    {
        if (!mode.Enabled || !File.Exists(mode.SeedPath)) return 0;

        string json;
        try { json = await File.ReadAllTextAsync(mode.SeedPath, ct); }
        catch (IOException ex)
        {
            logger.LogWarning(ex, "Kunne ikke lese {Seed}.", mode.SeedPath);
            return 0;
        }

        var entries = Parse(json, out var problems);
        foreach (var problem in problems) logger.LogWarning("Demo-seed: {Problem}", problem);

        var inserted = 0;
        var now = clock.UtcNow;
        foreach (var entry in entries)
        {
            if (await pipeline.GetByOrgnrAsync(entry.Orgnr, ct) is not null) continue;
            if (await companies.GetAsync(entry.Orgnr, ct) is null)
            {
                logger.LogWarning("Demo-seed: {Orgnr} finnes ikke i Companies ennå — prøver igjen etter neste synk.", entry.Orgnr);
                continue;
            }

            await pipeline.UpsertAsync(new PipelineEntry
            {
                Orgnr = entry.Orgnr,
                Status = entry.Status,
                Why = entry.Why,
                Created = now,
                Updated = now,
            }, ct);
            inserted++;
        }
        return inserted;
    }
}
```

- [ ] **Step 4: Run to verify they pass.** Run: `dotnet test --filter DemoSeederTests`. Expected: 6 passed.

- [ ] **Step 5: Commit.**

```bash
git add Hugin.Api/Services/DemoSeeder.cs Hugin.Tests/Api/DemoSeederTests.cs
git commit -m "feat(api): idempotent demo pipeline seeder"
```

---

### Task 9: Wire snapshot + seeder into boot and into `SyncRunner` completion

**Files:**
- Modify: `Hugin.Api/Program.cs` (registrations + the init scope)
- Modify: `Hugin.Api/Services/SyncRunner.cs`
- Modify: `Hugin.Tests/Api/BootSyncTests.cs` (one integration test)

**Interfaces:**
- Consumes `DemoSnapshot.CopyIn/CopyBackAsync` (Task 7), `DemoSeeder.ApplyAsync` (Task 8).
- Produces: after every sync run in public mode the order **sync → seeder → copy-back**.

- [ ] **Step 1: Write the failing test.** Append to `BootSyncTests`:

```csharp
    [Test]
    public async Task Public_mode_seeds_the_pipeline_and_writes_the_snapshot_after_the_boot_sync()
    {
        using var factory = new ApiFactory(autosync: true, publicMode: true);
        factory.Brreg.Companies.Add(new RegisterCompany("922425620", "TRETOEN AS", "3403", "62.100", null, false, null));
        File.WriteAllText(Path.Combine(factory.StateDir, "demo-pipeline.json"),
            """[{ "orgnr": "922425620", "status": "active", "why": "Demo: sporet for å vise badges." }]""");
        using var client = factory.CreateClient();

        var status = await SyncEndpointTests.PollUntilFinished(client);
        Assert.That(status.Brreg!.Succeeded, Is.True);

        // The seeder ran before copy-back, so the snapshot carries the demo pipeline.
        var snapshotPath = Path.Combine(factory.StateDir, "hugin.db");
        await WaitForFileAsync(snapshotPath);
        var options = new DbContextOptionsBuilder<Hugin.Infrastructure.Data.HuginDbContext>()
            .UseSqlite(Hugin.Infrastructure.Data.HuginDbInitializer.ConnectionString(snapshotPath)).Options;
        await using var snapshot = new Hugin.Infrastructure.Data.HuginDbContext(options);
        Assert.That(await snapshot.Pipeline.AnyAsync(p => p.Orgnr == "922425620"), Is.True);
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
    }

    private static async Task WaitForFileAsync(string path)
    {
        for (var i = 0; i < 50 && !File.Exists(path); i++) await Task.Delay(100);
        Assert.That(File.Exists(path), Is.True, $"snapshot never appeared at {path}");
    }
```

Add `using Hugin.Core.Abstractions;` for `RegisterCompany` if not already imported. The `RegisterCompany` positional order is `(Orgnr, Name, MunicipalityNumber, NaceCode, ParentOrgnr, IsBranch, Website)`.

- [ ] **Step 2: Run to verify it fails.** Run: `dotnet test --filter Public_mode_seeds_the_pipeline`. Expected: FAIL — no snapshot file appears.

- [ ] **Step 3: Register and wire.** In `Program.cs`, next to `builder.Services.AddSingleton<SyncRunner>();` add:

```csharp
builder.Services.AddSingleton<DemoSnapshot>();
builder.Services.AddScoped<DemoSeeder>();
```

In the init scope (Task 2, Step 2) wrap `InitAsync` with copy-in before and the seeder after:

```csharp
    if (mode.Enabled) services.GetRequiredService<DemoSnapshot>().CopyIn();

    await HuginDbInitializer.InitAsync(services.GetRequiredService<HuginDbContext>(), dbPath,
        services.GetRequiredService<HuginConfig>(), services.GetRequiredService<IClock>().UtcNow);

    if (mode.Enabled) await services.GetRequiredService<DemoSeeder>().ApplyAsync();
```

Rewrite `SyncRunner.RunAsync` so the completion hook runs inside the same scope:

```csharp
    private async Task RunAsync()
    {
        SourceResult brreg, nav;
        try
        {
            await using var scope = scopes.CreateAsyncScope();
            var summary = await scope.ServiceProvider.GetRequiredService<SyncService>().SyncAsync();
            (brreg, nav) = (summary.Brreg, summary.Nav);

            // Demo spec B3: seeder → checkpoint → copy-back, in that order, so the persisted
            // snapshot carries the seeded pipeline. Both are no-ops outside public mode.
            await scope.ServiceProvider.GetRequiredService<DemoSeeder>().ApplyAsync();
            await scope.ServiceProvider.GetRequiredService<DemoSnapshot>()
                .CopyBackAsync(scope.ServiceProvider.GetRequiredService<HuginDbContext>());
        }
        catch (Exception ex)
        {
            brreg = nav = new SourceResult(false, 0, ex.Message);
        }

        lock (_lock)
            _status = new SyncRunStatus(false, _status.StartedUtc, clock.UtcNow, brreg, nav);
    }
```

Add `using Hugin.Infrastructure.Data;` to `SyncRunner.cs`.

- [ ] **Step 4: Run the whole backend suite.** Run: `dotnet test`. Expected: all pass, including every normal-mode sync test (seeder and snapshot return immediately when `Enabled` is false).

- [ ] **Step 5: Commit.**

```bash
git add Hugin.Api/Program.cs Hugin.Api/Services/SyncRunner.cs Hugin.Tests/Api/BootSyncTests.cs
git commit -m "feat(api): copy-in at boot, seed + copy-back after every sync in public mode"
```

---

### Task 10: Web — `ReadOnlyProvider`, gated first-run, seeded focus, banner

**Files:**
- Create: `hugin-web/src/readOnly.tsx`
- Modify: `hugin-web/src/types.ts` (`StatusDto`)
- Modify: `hugin-web/src/App.tsx`
- Modify: `hugin-web/src/i18n/nb.ts`, `hugin-web/src/i18n/en.ts`
- Modify: `hugin-web/src/styles/main.css`
- Test: `hugin-web/src/readOnly.test.tsx`, `hugin-web/src/App.test.tsx` (three new tests + the fake server gains `/api/status`)

**Interfaces:**
- Consumes `/api/status.readOnly` (Task 4), `useFocus().setFocus(focus, { persist })`, `fromDiscoveryConfig`, `toFocusSeed`, `KNOWN_CATEGORIES`.
- Produces `ReadOnlyProvider` and `useReadOnly(): { readOnly: boolean; resolved: boolean }`. Task 11 consumes `useReadOnly`.

- [ ] **Step 1: Write the failing provider test.** Create `hugin-web/src/readOnly.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReadOnlyProvider, useReadOnly } from './readOnly'

function Probe() {
  const { readOnly, resolved } = useReadOnly()
  return <p>{`resolved=${resolved} readOnly=${readOnly}`}</p>
}

function statusServer(body: unknown, ok = true) {
  return vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status: ok ? 200 : 500,
        headers: { 'content-type': 'application/json' },
      })
    )
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('ReadOnlyProvider', () => {
  it('starts unresolved and writable, then reflects the server flag', async () => {
    vi.stubGlobal('fetch', statusServer({ readOnly: true }))
    render(
      <ReadOnlyProvider>
        <Probe />
      </ReadOnlyProvider>
    )
    expect(screen.getByText('resolved=false readOnly=false')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('resolved=true readOnly=true')).toBeInTheDocument())
  })

  it('stays unresolved when /api/status fails', async () => {
    vi.stubGlobal('fetch', statusServer({ title: 'boom' }, false))
    render(
      <ReadOnlyProvider>
        <Probe />
      </ReadOnlyProvider>
    )
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled())
    expect(screen.getByText('resolved=false readOnly=false')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails.** Run: `cd hugin-web; npx vitest run src/readOnly.test.tsx`. Expected: FAIL — module not found.

- [ ] **Step 3: Implement the provider.** Create `hugin-web/src/readOnly.tsx`:

```tsx
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react'
import { api } from './api'
import type { StatusDto } from './types'

interface ReadOnlyState {
  /** true only on the hosted demo (server `--public`). */
  readOnly: boolean
  /** false until /api/status has answered — the first-run dialog must not render before then. */
  resolved: boolean
}

const ReadOnlyContext = createContext<ReadOnlyState>({ readOnly: false, resolved: false })

/** One status fetch at boot decides the whole session's mode. A failed fetch leaves the app
 * unresolved: views still render (each has its own error state), but nothing that could write
 * on the user's behalf — the first-run dialog above all — opens on a guess. A reload retries. */
export function ReadOnlyProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ReadOnlyState>({ readOnly: false, resolved: false })

  useEffect(() => {
    let cancelled = false
    api
      .get<StatusDto>('/api/status')
      .then((status) => {
        if (!cancelled) setState({ readOnly: status.readOnly, resolved: true })
      })
      .catch(() => {
        /* stays unresolved */
      })
    return () => {
      cancelled = true
    }
  }, [])

  return <ReadOnlyContext.Provider value={state}>{children}</ReadOnlyContext.Provider>
}

export function useReadOnly(): ReadOnlyState {
  return useContext(ReadOnlyContext)
}
```

Add `readOnly: boolean` to `StatusDto` in `types.ts`:

```ts
export interface StatusDto {
  brreg: SourceStateDto | null
  nav: SourceStateDto | null
  reviewMark: string | null
  activeAds: number
  companies: number
  pipelineEntries: number
  readOnly: boolean
}
```

- [ ] **Step 4: Run to verify it passes.** Run: `npx vitest run src/readOnly.test.tsx`. Expected: 2 passed. Then `npx tsc -b` — expect every status mock in existing tests to still type-check (object literals passed through `jsonResponse(...)` are `unknown`, so no test breaks; `SyncHeader.test.tsx` builds `StatusDto` literals — add `readOnly: false` to each if `tsc` complains).

- [ ] **Step 5: Write the failing App tests.** In `App.test.tsx`, extend `fakeServer` with a `readOnly` option and a status route. Change the signature and add the route at the top of the handler:

```ts
function fakeServer(options: { putFails?: boolean; readOnly?: boolean; statusFails?: boolean } = {}) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const method = init?.method ?? 'GET'
    if (url === '/api/status') {
      if (options.statusFails) {
        return Promise.resolve(new Response(JSON.stringify({ title: 'nede' }), { status: 500, headers: { 'content-type': 'application/json' } }))
      }
      return Promise.resolve(
        jsonResponse({
          brreg: null,
          nav: null,
          reviewMark: null,
          activeAds: 0,
          companies: 0,
          pipelineEntries: 0,
          readOnly: options.readOnly ?? false,
        })
      )
    }
```

Then add, inside `describe('App', …)`:

```tsx
  it('read-only: shows the demo banner and never opens the first-run dialog', async () => {
    vi.stubGlobal('fetch', fakeServer({ readOnly: true }))
    render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Demo' })).toHaveTextContent('Demo — skrivebeskyttet')
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Kildekode på GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/malinfossum/hugin'
    )
  })

  it('read-only: seeds the focus from the server scope instead of asking', async () => {
    const fetchMock = fakeServer({ readOnly: true })
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/config/discovery', undefined))
    expect(window.localStorage.getItem('hugin-focus')).toBeNull()
  })

  it('keeps the first-run dialog closed until /api/status has answered, then opens it locally', async () => {
    vi.stubGlobal('fetch', fakeServer({ readOnly: false }))
    render(<App />)
    // Synchronous first render: status still pending → no dialog yet.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    expect(screen.queryByRole('region', { name: 'Demo' })).not.toBeInTheDocument()
  })

  it('never opens the first-run dialog when /api/status fails', async () => {
    const fetchMock = fakeServer({ statusFails: true })
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/status', undefined))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
```

Existing App tests that assert the first-run dialog is open must now `await waitFor(...)` for it — update each `getByRole('dialog')` right after `render(<App />)` to `await screen.findByRole('dialog')`.

- [ ] **Step 6: Run to verify they fail.** Run: `npx vitest run src/App.test.tsx`. Expected: the four new tests fail (no banner, dialog opens immediately).

- [ ] **Step 7: Implement in `App.tsx`.** Imports:

```tsx
import { fromDiscoveryConfig, toFocusSeed } from './coverage'
import { KNOWN_CATEGORIES, FocusProvider, useFocus } from './focus'
import { ReadOnlyProvider, useReadOnly } from './readOnly'
import type { DiscoveryConfigDto } from './types'
```

In `AppShell`, after `const { focus, setFocus } = useFocus()`:

```tsx
  const { readOnly, resolved } = useReadOnly()
```

Replace the `focusDialogOpen` line:

```tsx
  // Never before /api/status has answered (a fresh visitor would see it flash, or worse, get it
  // for real and a Save that can only 403), and never on the read-only demo.
  const focusDialogOpen =
    resolved && !readOnly && (focus === null || !firstRunDone) && !focusPromptDismissed
```

Add the seed effect after the popstate effect:

```tsx
  // Read-only demo: the first-run dialog never opens, so seed the render lens from the server's
  // own scope (a GET, allowed) — the dashboard then opens straight onto Innlandet. Session-only:
  // nothing is written to the visitor's storage that a Settings reset would have to undo.
  useEffect(() => {
    if (!readOnly || focus !== null) return
    let cancelled = false
    api
      .get<DiscoveryConfigDto>('/api/config/discovery')
      .then((config) => {
        if (cancelled) return
        setFocus(toFocusSeed(fromDiscoveryConfig(config), [...KNOWN_CATEGORIES]), { persist: false })
      })
      .catch(() => {
        /* no lens: every filter fails open, the demo still shows everything */
      })
    return () => {
      cancelled = true
    }
  }, [readOnly, focus, setFocus])
```

Insert the banner between `</header>` and `<main …>`:

```tsx
        {readOnly && (
          <section className="demo-banner" aria-label={t('demo.regionLabel')}>
            <div className="container">
              <p>
                {t('demo.banner')}{' '}
                <a href="https://github.com/malinfossum/hugin" rel="noreferrer">
                  {t('demo.repoLink')}
                </a>
              </p>
            </div>
          </section>
        )}
```

Wrap the tree in `App()` so the provider sits inside `LanguageProvider` and outside `FocusProvider` (find the existing `export default function App()` and add `<ReadOnlyProvider>` around the `FocusProvider`):

```tsx
export default function App() {
  return (
    <LanguageProvider>
      <ReadOnlyProvider>
        <FocusProvider>
          <AppShell />
        </FocusProvider>
      </ReadOnlyProvider>
    </LanguageProvider>
  )
}
```

(If the current `App()` body differs in nesting, keep its existing providers and add `ReadOnlyProvider` directly inside `LanguageProvider`.)

i18n — append to `nb.ts`:

```ts
  'demo.regionLabel': 'Demo',
  'demo.banner':
    'Demo — skrivebeskyttet. Ekte stillinger og selskaper fra NAV og Brreg for Innlandet. Pipelinen er eksempeldata. Ingen sporing, ingen informasjonskapsler; temavalg lagres bare i din nettleser.',
  'demo.repoLink': 'Kildekode på GitHub',
```

and to `en.ts`:

```ts
  'demo.regionLabel': 'Demo',
  'demo.banner':
    'Demo — read-only. Real job ads and companies from NAV and Brreg for Innlandet. The pipeline is sample data. No tracking, no cookies; your theme choice is stored only in your browser.',
  'demo.repoLink': 'Source code on GitHub',
```

CSS — append to `main.css` (mobile-first, tokens only):

```css
/* Demo banner (read-only showcase): a static region right after the header. */
.demo-banner {
  background: var(--color-surface-raised);
  border-bottom: 1px solid var(--color-border);
  padding: var(--space-sm) 0;
  font-size: var(--font-size-sm);
}
.demo-banner p {
  margin: 0;
}
```

If any of those token names do not exist in `design-system/` (check `design-system/tokens/*.css` — read-only, never edit), substitute the nearest existing surface/border/space/font-size token; the rule is "existing tokens only".

- [ ] **Step 8: Run to verify they pass.** Run: `npx vitest run src/App.test.tsx src/readOnly.test.tsx src/i18n/index.test.ts`. Expected: all pass (the key-parity test proves nb/en match). Then `npm run lint` (0 warnings) and `npx tsc -b`.

- [ ] **Step 9: Commit.**

```bash
git add hugin-web/src/readOnly.tsx hugin-web/src/readOnly.test.tsx hugin-web/src/types.ts hugin-web/src/App.tsx hugin-web/src/App.test.tsx hugin-web/src/i18n/nb.ts hugin-web/src/i18n/en.ts hugin-web/src/styles/main.css
git commit -m "feat(web): read-only mode — status-gated first-run, seeded focus, demo banner"
```

---

### Task 11: Web — hide every write control when read-only

**Files:**
- Modify: `hugin-web/src/views/dashboard/SyncHeader.tsx`, `NyttSidenSist.tsx`, `FristerList.tsx`
- Modify: `hugin-web/src/views/ApplicationsView.tsx`, `SettingsView.tsx`
- Modify: `hugin-web/src/components/CoverageSection.tsx`
- Test: `hugin-web/src/views/readOnlyControls.test.tsx` (new)

**Interfaces:**
- Consumes `useReadOnly()` (Task 10). Every component reads `const { readOnly } = useReadOnly()` and wraps its write controls in `{!readOnly && (...)}`.

- [ ] **Step 1: Write the failing tests.** Create `hugin-web/src/views/readOnlyControls.test.tsx`. It renders each component inside a `ReadOnlyProvider` whose status says read-only, with a fake server that answers the component's own GETs:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../i18n'
import { LiveRegionProvider } from '../components/LiveRegion'
import { FocusProvider } from '../focus'
import { ReadOnlyProvider } from '../readOnly'
import { ApplicationsView } from './ApplicationsView'
import { SettingsView } from './SettingsView'
import { FristerList } from './dashboard/FristerList'
import { NyttSidenSist } from './dashboard/NyttSidenSist'
import { SyncHeader } from './dashboard/SyncHeader'

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

const AD = {
  feedId: 'a1', title: 'Utvikler', employer: 'TRETOEN AS', employerOrgnr: '922425620', kommune: '3403',
  expires: '2099-01-01T00:00:00Z', daysLeft: 30, category: 'IT / Utvikling', sourceUrl: 'https://example.org',
  pipelineStatus: null, hidden: false, isActive: true, published: '2026-09-01T00:00:00Z', linkedOrgnr: null,
}

const ENTRY = {
  orgnr: '922425620', companyName: 'TRETOEN AS', status: 'active', starred: false,
  why: 'Demo.', note: null, svar: null, updated: '2026-09-01T00:00:00Z', adsExpired: false,
}

function demoServer() {
  return vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url === '/api/status') return Promise.resolve(json({ brreg: null, nav: null, reviewMark: null, activeAds: 1, companies: 1, pipelineEntries: 1, readOnly: true }))
    if (url === '/api/sync/status') return Promise.resolve(json({ running: false, startedUtc: null, finishedUtc: null, brreg: null, nav: null }))
    if (url.startsWith('/api/ads')) return Promise.resolve(json([AD]))
    if (url.startsWith('/api/pipeline')) return Promise.resolve(json([ENTRY]))
    if (url === '/api/new') return Promise.resolve(json({ companies: [], ads: [AD], since: '2026-08-28T00:00:00Z', asOf: '2026-09-04T00:00:00Z' }))
    if (url === '/api/sources') return Promise.resolve(json([{ id: 1, label: 'FINN', url: 'https://finn.no', position: 1 }]))
    if (url === '/api/companies') return Promise.resolve(json([]))
    if (url === '/api/config/discovery') return Promise.resolve(json({ municipalities: [{ name: 'Hamar', number: '3403' }], fylker: [], allOfNorway: false }))
    if (url === '/api/kommuner') return Promise.resolve(json([{ number: '3403', name: 'Hamar' }]))
    return Promise.reject(new Error(`unhandled ${url}`))
  })
}

function wrap(ui: React.ReactElement) {
  return render(
    <LanguageProvider>
      <ReadOnlyProvider>
        <FocusProvider>
          <LiveRegionProvider>{ui}</LiveRegionProvider>
        </FocusProvider>
      </ReadOnlyProvider>
    </LanguageProvider>
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('read-only mode hides write controls', () => {
  it('SyncHeader has no «Synk nå»', async () => {
    vi.stubGlobal('fetch', demoServer())
    wrap(<SyncHeader onSyncCompleted={() => {}} />)
    await waitFor(() => expect(screen.getByText(/Synkronisering/)).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Synk nå' })).not.toBeInTheDocument()
  })

  it('NyttSidenSist has no «Merk som sett»', async () => {
    vi.stubGlobal('fetch', demoServer())
    wrap(<NyttSidenSist refreshKey={0} />)
    await screen.findByText('Utvikler')
    expect(screen.queryByRole('button', { name: 'Merk som sett' })).not.toBeInTheDocument()
  })

  it('FristerList has no track, link or hide buttons', async () => {
    vi.stubGlobal('fetch', demoServer())
    wrap(<FristerList refreshKey={0} />)
    await screen.findByText('Utvikler')
    for (const name of ['Følg opp', 'Koble til bedrift', 'Skjul']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }
  })

  it('ApplicationsView has no star or edit', async () => {
    vi.stubGlobal('fetch', demoServer())
    wrap(<ApplicationsView />)
    await screen.findByText('TRETOEN AS')
    expect(screen.queryByRole('button', { name: 'Gi stjerne' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rediger' })).not.toBeInTheDocument()
  })

  it('SettingsView shows sources and coverage without any editing', async () => {
    vi.stubGlobal('fetch', demoServer())
    wrap(<SettingsView theme="dark" onToggleTheme={() => {}} onSourcesChanged={() => {}} />)
    await screen.findByText('FINN')
    expect(screen.queryByRole('button', { name: 'Legg til lenke' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rediger' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Fjern' })).not.toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Lagre dekning' })).not.toBeInTheDocument())
    expect(screen.getByRole('group', { name: /Dekning/ })).toBeDisabled()
  })
})
```

If a prop name above differs from the component's real props (e.g. `FristerList` takes more than `refreshKey`), use the real props — the assertions are what matter.

- [ ] **Step 2: Run to verify they fail.** Run: `npx vitest run src/views/readOnlyControls.test.tsx`. Expected: 5 failing (buttons present).

- [ ] **Step 3: Implement, one component at a time.** In each file add `import { useReadOnly } from '../readOnly'` (`'../../readOnly'` under `dashboard/`) and `const { readOnly } = useReadOnly()` near the other hooks.

`SyncHeader.tsx` — wrap the sync button:

```tsx
      {!readOnly && (
        <button
          type="button"
          className="btn btn-primary"
          onClick={startSync}
          disabled={sync?.running ?? false}
        >
          {sync?.running ? (
            <>
              <span className="spinner" aria-hidden="true" />
              {t('sync.syncing')}
            </>
          ) : (
            t('sync.now')
          )}
        </button>
      )}
```

`NyttSidenSist.tsx` — the mark-seen block becomes:

```tsx
          {hasNew ? (
            !readOnly && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  reviewedAsOf.current = data.asOf
                  setConfirmOpen(true)
                }}
              >
                {t('newSince.markSeen')}
              </button>
            )
          ) : (
            <p className="empty-hint">{t('newSince.none')}</p>
          )}
```

`FristerList.tsx` — wrap the whole `<div className="cluster cluster-sm">` that holds the badge and the four buttons so the badge stays and the buttons go:

```tsx
            <div className="cluster cluster-sm">
              {ad.pipelineStatus && (
                <span className="badge badge-accent">{pipelineLabel(t, ad.pipelineStatus)}</span>
              )}
              {!readOnly && ad.linkedOrgnr && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => handleUnlink(ad.feedId)}
                >
                  {t('frister.unlink')}
                </button>
              )}
              {!readOnly && !ad.pipelineStatus && ad.employerOrgnr && (
                <button type="button" className="btn btn-ghost" onClick={() => handleTrack(ad)}>
                  {t('frister.track')}
                </button>
              )}
              {!readOnly && !ad.pipelineStatus && linking !== ad.feedId && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  ref={(el) => {
                    if (el) linkRefs.current.set(ad.feedId, el)
                    else linkRefs.current.delete(ad.feedId)
                  }}
                  onClick={() => openLink(ad.feedId)}
                >
                  {t('frister.link')}
                </button>
              )}
              {!readOnly &&
                (ad.hidden ? (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => handleAngreSkjul(ad.feedId)}
                  >
                    {t('frister.undoHide')}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    ref={(el) => {
                      if (el) skjulRefs.current.set(ad.feedId, el)
                      else skjulRefs.current.delete(ad.feedId)
                    }}
                    onClick={() => handleSkjul(ad.feedId)}
                  >
                    {t('frister.hide')}
                  </button>
                ))}
            </div>
```

Only the `!readOnly &&` prefixes are new; every button body is the current JSX. The link form below this block already renders only while `linking === ad.feedId`, which nothing can set once the button is gone.

`ApplicationsView.tsx` — the star button and the «Rediger» button each get `{!readOnly && (...)}` around them; the edit form already depends on `isEditing`, which `startEdit` alone sets.

`SettingsView.tsx` — the per-source `Rediger`/`Fjern`/`Flytt opp`/`Flytt ned` buttons and the add form: wrap the button cluster inside each `<li>` and the whole `<form className="stack stack-sm" onSubmit={handleAdd}>` in `{!readOnly && (...)}`. The language and theme sections stay (they are browser-local).

`CoverageSection.tsx` — disable the whole fieldset and drop Save:

```tsx
      {coverage && (
        <>
          <fieldset className="stack" disabled={readOnly} aria-label={t('coverage.heading')}>
            <CoverageFields
              idPrefix="settings-coverage"
              draft={coverage}
              onChange={setCoverage}
              kommuner={kommuner}
            />
          </fieldset>
          {!readOnly && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving || kommuner === undefined}
            >
              {t('coverage.save')}
            </button>
          )}
        </>
      )}
```

A disabled `<fieldset>` shows the current scope as inert form values with nothing to click — the spec's "current values as text" without a second rendering path. Record that reading in the spec's corrections (Task 12).

- [ ] **Step 4: Run to verify they pass.** Run: `npx vitest run` (the whole suite: every existing view test runs with `readOnly: false` because no `ReadOnlyProvider` wraps them — the context default). Expected: all pass. Then `npm run lint`, `npx tsc -b`, `npm run build`.

- [ ] **Step 5: Commit.**

```bash
git add hugin-web/src/views hugin-web/src/components/CoverageSection.tsx
git commit -m "feat(web): hide every write control in read-only mode"
```

---

### Task 12: Demo files, Linux publish script, README, spec corrections

**Files:**
- Create: `demo/hugin.demo.json`, `demo/demo-pipeline.json`, `publish-demo.ps1`
- Modify: `.gitignore`, `README.md`, `docs/specs/2026-09-03-hugin-demo-deployment.md` (corrections section)

- [ ] **Step 1: Demo config.** Create `demo/hugin.demo.json` — the example config's scope and lens, nothing personal:

```json
{
  "municipalities": [
    { "name": "Gjøvik", "number": "3407" },
    { "name": "Hamar", "number": "3403" },
    { "name": "Lillehammer", "number": "3405" },
    { "name": "Ringsaker", "number": "3411" }
  ],
  "fylker": [],
  "allOfNorway": false,
  "naeringskoder": ["62"],
  "keywords": [
    "utvikler", "developer", "engineer", "programmerer", "fullstack", "backend", "frontend",
    "devops", "programvare", "software", "arkitekt", "IT-konsulent", "kunstig intelligens",
    "maskinlæring", "machine learning"
  ],
  "categories": ["IT"],
  "navToken": null,
  "linkouts": []
}
```

- [ ] **Step 2: Demo pipeline.** Create `demo/demo-pipeline.json` — four real Innlandet IT employers present in the Innlandet ×4 snapshot, `active` only, one neutral why:

```json
[
  { "orgnr": "922425620", "status": "active", "why": "Demo: sporet for å vise pipeline og badges." },
  { "orgnr": "983398308", "status": "active", "why": "Demo: sporet for å vise pipeline og badges." },
  { "orgnr": "935567343", "status": "active", "why": "Demo: sporet for å vise pipeline og badges." },
  { "orgnr": "925836613", "status": "active", "why": "Demo: sporet for å vise pipeline og badges." }
]
```

(TRETOEN AS, Arribatec Cloud AS, Sopra Steria avd Hamar, Norsk Tipping AS — Norsk Tipping is NACE 92 and is not in the discovery walk, so it stays "skipped, retried after sync" until it appears as an enriched ad employer; that is the seeder's documented behaviour and a live demonstration of it. Swap it for another 62-company from the snapshot if an empty fourth badge bothers you at deploy time.)

- [ ] **Step 3: Publish script.** Create `publish-demo.ps1`:

```powershell
# Builds the dashboard and publishes a self-contained linux-x64 hugin-api into publish-linux\,
# then zips it for `az webapp deploy`. Self-contained on purpose: the demo must not depend on
# which .NET stacks App Service happens to offer — it runs on the plain Linux image with a
# startup command (demo spec Part E).
$ErrorActionPreference = "Stop"
Push-Location hugin-web
npm run build
Pop-Location

dotnet publish Hugin.Api -c Release -r linux-x64 --self-contained true -p:DebugType=None -o publish-linux

$zip = "hugin-demo.zip"
if (Test-Path $zip) { Remove-Item $zip }
Compress-Archive -Path (Join-Path "publish-linux" "*") -DestinationPath $zip
Write-Host "publish-linux\ + $zip klar. Deploy: az webapp deploy --resource-group hugin-demo --name hugin-demo --src-path $zip --type zip"
```

Append to `.gitignore`:

```
# Demo publish output (Linux) — rebuilt from publish-demo.ps1
publish-linux/
hugin-demo.zip
```

- [ ] **Step 4: README.** After the "Web dashboard" section's `--port` paragraph, add:

```markdown
`--public --state <dir>` runs the **hosted demo mode**: all interfaces, every write refused, config and seed file read from `<dir>`, database snapshot persisted there after each sync. It is for the demo server only — never run it on a machine holding a real pipeline, it serves everything in the state dir to anyone who reaches the port.
```

And a new section before "CLI":

```markdown
## Demo

A read-only showcase runs at https://hugin-demo.azurewebsites.net (free tier: the first visit after idle takes a few seconds). Real job ads and companies from NAV and Brreg for Innlandet, a seeded example pipeline, no personal data, no tracking. Built with `publish-demo.ps1`; deployment notes in `docs/specs/2026-09-03-hugin-demo-deployment.md`.
```

(Replace the URL with the real one once the web app name is settled — `hugin-demo-mf` if `hugin-demo` is taken.)

- [ ] **Step 5: Spec corrections.** Append to the spec:

```markdown
## Post-implementation corrections (the merge date, YYYY-MM-DD)

1. **Coverage in read-only Settings** renders as a disabled `<fieldset>` around the existing
   fields, not as a separate text rendering — the values are visible and inert, one code path.
2. **`--public` parsing** lives in `PublicMode` (pure) and is proven by unit tests; the real
   process path for the three startup errors was smoke-tested by hand (Task 2, Step 6).
3. **Copy-back runs inside the sync scope**, after the seeder, so the snapshot always holds the
   seeded rows; `SyncRunner` is the single place the order is fixed.
```

Write the real merge date into that heading. Run `dotnet build` and `npm run build` once more.

- [ ] **Step 6: Commit.**

```bash
git add demo/hugin.demo.json demo/demo-pipeline.json publish-demo.ps1 .gitignore README.md docs/specs/2026-09-03-hugin-demo-deployment.md
git commit -m "docs+build: demo config and seed, linux publish script, README demo section"
```

---

### Task 13: Local smoke, PR, then the Azure runbook (Malin's steps)

No new code. This task is the verification gate before the PR, then the manual deployment the spec's Part E describes.

- [ ] **Step 1: Full local verification.** From the repo root: `dotnet build` (0 warnings), `dotnet test` (all green), `cd hugin-web; npm test; npm run lint; npm run build`.

- [ ] **Step 2: Live smoke on Windows.** Build `.\build.ps1`, then in a scratch dir `S`: copy `demo\hugin.demo.json` to `S\hugin.json` and `demo\demo-pipeline.json` to `S\demo-pipeline.json`, then:

```powershell
.\publish\hugin-api.exe --public --state S --port 5199
```

Expected startup log: the public-mode line with the culture and time-zone, then the ADVARSEL line, no browser. Then, from another shell:

```powershell
curl.exe -s -o NUL -w "%{http_code}`n" -H "Host: hugin-demo.azurewebsites.net" http://localhost:5199/api/status
curl.exe -s -o NUL -w "%{http_code}`n" -X POST -H "X-Hugin: 1" http://localhost:5199/api/sync
curl.exe -s -I http://localhost:5199/api/status | findstr /I "x-frame-options nosniff referrer"
```

Expected: `200`, `403`, three header lines. Open `http://localhost:5199` — banner present, no write controls anywhere (dashboard, Søknader, Bedrifter, Innstillinger), data loading after the boot sync, «Nytt siden sist» bounded to a week. Wait for the sync to finish and confirm `S\hugin.db` exists and `S\hugin.db.tmp` does not. Restart the exe: the log shows the working copy was kept, and no second boot sync starts (inside 6 h).

- [ ] **Step 3: PR.** Push `feat/demo-deployment`, open the PR with the spec link and the smoke results above; Malin merges (the auto-mode classifier blocks `gh pr merge`). Tag `v3.4.2` after merge and create the release with both Windows zips as usual (`gh release view v3.4.2 --json assets` before calling it done).

- [ ] **Step 4: Azure, once (Malin, ~30 min).** Prerequisites: an Azure subscription; `winget install Microsoft.AzureCLI`; `az login`.

```bash
az group create --name hugin-demo --location norwayeast
az appservice plan create --name hugin-demo-plan --resource-group hugin-demo --sku F1 --is-linux
az webapp create --name hugin-demo --resource-group hugin-demo --plan hugin-demo-plan --runtime "DOTNETCORE:10.0"
az webapp config set --name hugin-demo --resource-group hugin-demo --startup-file "/home/site/wwwroot/hugin-api --public --state /home/data"
az webapp config appsettings set --name hugin-demo --resource-group hugin-demo --settings WEBSITES_ENABLE_APP_SERVICE_STORAGE=true
```

If F1 is not offered in `norwayeast`, use `westeurope`; if `DOTNETCORE:10.0` is not in `az webapp list-runtimes --os linux`, pick the newest listed — the self-contained publish does not use it. If the name `hugin-demo` is taken, use `hugin-demo-mf` everywhere (and in the README).

- [ ] **Step 5: First snapshot, built locally.** Run the Windows exe once in normal mode against the demo config so the full NAV walk happens here, not on F1:

```powershell
mkdir S2; copy demo\hugin.demo.json S2\hugin.json
.\publish\hugin-api.exe --config S2\hugin.json --no-browser
```

Wait for the sync to finish (dashboard shows counts), stop it. Upload `S2\hugin.db`, `S2\hugin.json` and `demo\demo-pipeline.json` to `/home/data/` through Kudu's VFS (PUT `https://hugin-demo.scm.azurewebsites.net/api/vfs/data/<file>` with the publishing credentials from `az webapp deployment list-publishing-credentials`), or via the Kudu file browser at `https://hugin-demo.scm.azurewebsites.net/newui/fileManager`. Never commit those credentials.

- [ ] **Step 6: Deploy and verify.**

```powershell
.\publish-demo.ps1
az webapp deploy --resource-group hugin-demo --name hugin-demo --src-path hugin-demo.zip --type zip
az webapp log tail --resource-group hugin-demo --name hugin-demo
```

The first log lines must show the public-mode line with a real culture name and `Europe/Oslo` (verify-first items 1, 4, 5). Then the same three curls as Step 2 against `https://hugin-demo.azurewebsites.net`, the dashboard in a browser, and after 30 minutes idle a cold start whose log shows «Arbeidskopi finnes allerede» or the copy-in line and no boot sync (verify-first items 2, 3). Check the F1 quota graph the next day. Read the NAV feed terms before this step (verify-first item 6); if closed ads may not be republished, add hiding the «Utløpt» section under `readOnly` as a follow-up commit before the deploy.

- [ ] **Step 7: Record.** Put the final URL in the README, note the deploy date and any deviation in the spec's corrections section, commit to `main` via a small PR.
