# Hugin Phase 2 — Web Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A localhost web dashboard (ASP.NET Core minimal API + React/TS) over Hugin's existing Core and SQLite db — full daily driver, CLI keeps working.

**Architecture:** Extract EF/HTTP/config code from `Hugin.Console` into a new `Hugin.Infrastructure` classlib; add `Hugin.Api` (minimal API host, loopback-only, serves the built frontend from wwwroot) and `hugin-web/` (Vite + React + TS). Endpoints → Core services → Infrastructure repositories; no EF or HttpClient code in endpoint handlers.

**Tech Stack:** net10.0, EF Core 10 + SQLite, NUnit 4, `Microsoft.AspNetCore.Mvc.Testing`, Vite, React 19, TypeScript, Vitest + Testing Library, Biome.

**Spec:** `docs/specs/2026-08-19-hugin-phase2-web-design.md` — read it first; every rule below argues from it.

## Global Constraints

- net10.0 everywhere; solution file is `hugin.slnx` (XML slnx format, not .sln).
- Existing suite = 106 NUnit tests. **Gate zero: they stay green after Task 1, before any new code.**
- API binds `127.0.0.1` only, set in code. No CORS headers, ever. Writes require header `X-Hugin: 1` → else 403. Host header must be `localhost` / `127.0.0.1` / `[::1]` (any port) → else 403.
- All user-facing text (API error messages, UI strings) in **bokmål**. Code, comments, commits in English.
- Frontend: no UI libraries, no state libraries, no router. Plain `fetch` + hooks. Mobile-first CSS (`min-width` 768px/1024px), dark-mode-first.
- Commit after every task; message style `feat:`/`refactor:`/`test:`/`docs:`. **Never add Co-Authored-By or any Claude attribution.**
- Run C# tests with `dotnet test` from the repo root. Frontend tests with `npm test` inside `hugin-web/`.
- `Ad.Hidden` must survive sync upserts (v1 trap class). Seen-mark advances only to the client-supplied `asOf`, never server-now, and never backwards.
- API port default **5111** (`--port` overrides). The CLI's behavior does not change in this phase (its `list --ads` still shows hidden ads).

---

### Task 1: Extract `Hugin.Infrastructure` (gate zero — move-only refactor)

**Files:**
- Create: `Hugin.Infrastructure/Hugin.Infrastructure.csproj`
- Move (git mv): `Hugin.Console/Data/**` → `Hugin.Infrastructure/Data/**` (incl. `Migrations/`), `Hugin.Console/Http/**` → `Hugin.Infrastructure/Http/**`, `Hugin.Console/ConfigLoader.cs` → `Hugin.Infrastructure/ConfigLoader.cs`
- Modify: namespaces in every moved file, `Hugin.Console/Program.cs` usings, `Hugin.Console/Hugin.Console.csproj`, `Hugin.Tests/Hugin.Tests.csproj`, `hugin.slnx`, test file usings

**Interfaces:**
- Consumes: nothing new.
- Produces: namespaces `Hugin.Infrastructure` (ConfigLoader, `LoadedConfig`), `Hugin.Infrastructure.Data` (`HuginDbContext`, `Ef*Repository`, `HuginDbContextFactory`, migrations), `Hugin.Infrastructure.Http` (`BrregClient`, `NavFeedClient`, `NavTokenProvider`). All types keep their exact names and members.

This is a refactor task — no new tests, no behavior change. The 106 existing tests ARE the test.

- [ ] **Step 1: Create the classlib and add it to the solution**

`Hugin.Infrastructure/Hugin.Infrastructure.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
  </PropertyGroup>

  <ItemGroup>
    <ProjectReference Include="..\Hugin.Core\Hugin.Core.csproj" />
  </ItemGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.EntityFrameworkCore.Design" Version="10.0.11">
      <IncludeAssets>runtime; build; native; contentfiles; analyzers; buildtransitive</IncludeAssets>
      <PrivateAssets>all</PrivateAssets>
    </PackageReference>
    <PackageReference Include="Microsoft.EntityFrameworkCore.Sqlite" Version="10.0.11" />
  </ItemGroup>

</Project>
```

In `hugin.slnx`, add `<Project Path="Hugin.Infrastructure/Hugin.Infrastructure.csproj" />` alongside the existing three.

- [ ] **Step 2: git mv the files**

```bash
mkdir -p Hugin.Infrastructure
git mv Hugin.Console/Data Hugin.Infrastructure/Data
git mv Hugin.Console/Http Hugin.Infrastructure/Http
git mv Hugin.Console/ConfigLoader.cs Hugin.Infrastructure/ConfigLoader.cs
```

- [ ] **Step 3: Rename namespaces in the moved files**

In every file under `Hugin.Infrastructure/`: `namespace Hugin.Console` → `namespace Hugin.Infrastructure`, `namespace Hugin.Console.Data` → `namespace Hugin.Infrastructure.Data`, `namespace Hugin.Console.Http` → `namespace Hugin.Infrastructure.Http`. This includes the three migration files, their `.Designer.cs` partners, and `HuginDbContextModelSnapshot.cs` (they carry `namespace Hugin.Console.Data.Migrations` → `Hugin.Infrastructure.Data.Migrations`). EF identifies applied migrations by their string IDs (`20260818152328_Initial` etc.), which do not change — the existing `hugin.db` upgrades cleanly.

Also fix `using Hugin.Console.Data;` → `using Hugin.Infrastructure.Data;` inside moved files that cross-reference each other (e.g. `HuginDbContextFactory`, `NavFeedClient` if it uses ConfigLoader types).

- [ ] **Step 4: Re-point the hosts and tests**

- `Hugin.Console/Hugin.Console.csproj`: add `<ProjectReference Include="..\Hugin.Infrastructure\Hugin.Infrastructure.csproj" />`; **remove** the `Microsoft.EntityFrameworkCore.Design` and `Microsoft.EntityFrameworkCore.Sqlite` package references (they travel with Infrastructure); keep `Microsoft.Extensions.Hosting`.
- `Hugin.Console/Program.cs`: `using Hugin.Console.Data;` → `using Hugin.Infrastructure.Data;`, `using Hugin.Console.Http;` → `using Hugin.Infrastructure.Http;`, and `ConfigLoader`/`LoadedConfig` now come from `using Hugin.Infrastructure;`.
- `Hugin.Tests/Hugin.Tests.csproj`: replace the `Hugin.Console` project reference with `Hugin.Infrastructure`. Tests never touched `Program.cs`, so nothing else from Console is needed — this also closes the v1 documented deviation ("Tests reference Console").
- Test files: update `using Hugin.Console.*` → `using Hugin.Infrastructure.*` (expect hits in `RepositoryTests.cs`, `ConfigLoaderTests.cs`, `BrregClientTests.cs`, `NavFeedClientTests.cs`, `HttpFixtures.cs`, `Fakes.cs` — grep for `Hugin.Console`).

- [ ] **Step 5: Build, test, verify count**

Run: `dotnet build` then `dotnet test`
Expected: build clean, **106 passed, 0 failed** — the same count as before the move. If anything fails, fix the refactor; do not proceed.

- [ ] **Step 6: Verify the CLI still runs against its dev db**

Run: `dotnet run --project Hugin.Console -- list`
Expected: pipeline listing (or the empty-pipeline message) — proves migrations still resolve.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: extract Hugin.Infrastructure from Hugin.Console

Move-only: Data/ (incl. migrations), Http/, ConfigLoader. Tests now
reference Infrastructure instead of Console, closing the v1 deviation.
106 tests green before and after."
```

---

### Task 2: Shared db initialization — migrate + WAL + busy-timeout

**Files:**
- Create: `Hugin.Infrastructure/Data/HuginDbInitializer.cs`
- Modify: `Hugin.Console/Program.cs` (replace the inline `MigrateAsync` block)
- Test: `Hugin.Tests/HuginDbInitializerTests.cs`

**Interfaces:**
- Produces: `public static class HuginDbInitializer { public static Task InitAsync(HuginDbContext db, CancellationToken ct = default); }` — runs `Database.MigrateAsync()` then `PRAGMA journal_mode=WAL;`. Both hosts call this exactly once at startup. Busy-timeout comes from the connection string: `Data Source={path};Default Timeout=5` — produce it via `public static string ConnectionString(string databasePath)` on the same class so Console and Api can never drift.

- [ ] **Step 1: Write the failing test**

`Hugin.Tests/HuginDbInitializerTests.cs`:

```csharp
using Hugin.Infrastructure.Data;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Hugin.Tests;

[TestFixture]
public sealed class HuginDbInitializerTests
{
    [Test]
    public async Task InitAsync_migrates_and_enables_wal()
    {
        var path = Path.Combine(Path.GetTempPath(), $"hugin-init-{Guid.NewGuid():N}.db");
        try
        {
            var options = new DbContextOptionsBuilder<HuginDbContext>()
                .UseSqlite(HuginDbInitializer.ConnectionString(path))
                .Options;

            await using (var db = new HuginDbContext(options))
                await HuginDbInitializer.InitAsync(db);

            await using var check = new HuginDbContext(options);
            // Migrations ran: the Ads table exists and is queryable.
            Assert.That(await check.Ads.CountAsync(), Is.Zero);

            // WAL is persisted in the db file.
            var connection = check.Database.GetDbConnection();
            await connection.OpenAsync();
            await using var cmd = connection.CreateCommand();
            cmd.CommandText = "PRAGMA journal_mode;";
            Assert.That((string?)await cmd.ExecuteScalarAsync(), Is.EqualTo("wal").IgnoreCase);
        }
        finally
        {
            SqliteConnection.ClearAllPools();
            File.Delete(path);
        }
    }

    [Test]
    public void ConnectionString_carries_path_and_busy_timeout()
    {
        var cs = HuginDbInitializer.ConnectionString(@"C:\x\hugin.db");
        Assert.That(cs, Does.Contain(@"Data Source=C:\x\hugin.db"));
        Assert.That(cs, Does.Contain("Default Timeout=5"));
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `dotnet test --filter HuginDbInitializerTests`
Expected: FAIL — `HuginDbInitializer` does not exist.

- [ ] **Step 3: Implement**

`Hugin.Infrastructure/Data/HuginDbInitializer.cs`:

```csharp
using Microsoft.EntityFrameworkCore;

namespace Hugin.Infrastructure.Data;

/// <summary>
/// One-stop startup for every host that opens the db. WAL + a busy-timeout matter from phase 2
/// on: two processes (CLI + API) share one SQLite file, so readers must not block the writer
/// and brief lock contention must retry instead of erroring.
/// </summary>
public static class HuginDbInitializer
{
    /// <summary>"Default Timeout" doubles as SQLite's busy-timeout in Microsoft.Data.Sqlite.</summary>
    public static string ConnectionString(string databasePath) =>
        $"Data Source={databasePath};Default Timeout=5";

    public static async Task InitAsync(HuginDbContext db, CancellationToken ct = default)
    {
        await db.Database.MigrateAsync(ct);
        // WAL is a property of the db file, not the connection — setting it once persists.
        await db.Database.ExecuteSqlRawAsync("PRAGMA journal_mode=WAL;", ct);
    }
}
```

- [ ] **Step 4: Wire the CLI through it**

In `Hugin.Console/Program.cs`:
- `services.AddDbContext<HuginDbContext>(o => o.UseSqlite($"Data Source={loaded.DatabasePath}"));` → `services.AddDbContext<HuginDbContext>(o => o.UseSqlite(HuginDbInitializer.ConnectionString(loaded.DatabasePath)));`
- The migrate block `await scope.ServiceProvider.GetRequiredService<HuginDbContext>().Database.MigrateAsync();` → `await HuginDbInitializer.InitAsync(scope.ServiceProvider.GetRequiredService<HuginDbContext>());`

- [ ] **Step 5: Run the full suite**

Run: `dotnet test`
Expected: 108 passed (106 + the 2 new).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: shared db initializer with WAL and busy-timeout

Two processes share one SQLite file from phase 2 on; WAL keeps readers
from blocking the writer, Default Timeout=5 retries brief contention."
```

---

### Task 3: `Ad.Hidden` — model, migration, repository, sync-proof test

**Files:**
- Modify: `Hugin.Core/Models/Ad.cs`, `Hugin.Core/Abstractions/Repositories.cs` (IAdRepository), `Hugin.Infrastructure/Data/Repositories.cs` (EfAdRepository), `Hugin.Console/Program.cs` (one call site)
- Create: migration `AddAdHidden` (generated)
- Test: `Hugin.Tests/RepositoryTests.cs` (extend)

**Interfaces:**
- Produces on `Ad`: `public bool Hidden { get; set; }` (default false).
- Produces on `IAdRepository`:
  - `Task<bool> SetHiddenAsync(string feedId, bool hidden, CancellationToken ct = default)` — returns false when the feedId is unknown (API maps that to 404).
  - `GetActiveAsync` gains a parameter: `Task<IReadOnlyList<Ad>> GetActiveAsync(string? municipalityNumber = null, bool includeHidden = false, CancellationToken ct = default)`. `includeHidden: false` filters `!a.Hidden`; `true` returns everything active.
- CLI behavior is UNCHANGED: the one `GetActiveAsync` call in `Program.cs` (`RunListAsync`) passes `includeHidden: true` explicitly — per spec, `list --ads` does not respect the flag this phase.

- [ ] **Step 1: Write the failing tests**

Add to `Hugin.Tests/RepositoryTests.cs` (reuse the fixture's existing in-memory-SQLite context creation pattern — read the top of the file and follow it):

```csharp
[Test]
public async Task SetHiddenAsync_flags_ad_and_reports_unknown()
{
    var repo = new EfAdRepository(Db);
    await repo.UpsertAsync(SomeFeedAd("ad-1"), Now);

    Assert.That(await repo.SetHiddenAsync("ad-1", true), Is.True);
    Assert.That((await Db.Ads.FindAsync("ad-1"))!.Hidden, Is.True);
    Assert.That(await repo.SetHiddenAsync("finnes-ikke", true), Is.False);
}

[Test]
public async Task GetActiveAsync_excludes_hidden_unless_asked()
{
    var repo = new EfAdRepository(Db);
    await repo.UpsertAsync(SomeFeedAd("ad-1"), Now);
    await repo.UpsertAsync(SomeFeedAd("ad-2"), Now);
    await repo.SetHiddenAsync("ad-2", true);

    Assert.That((await repo.GetActiveAsync()).Select(a => a.FeedId), Is.EquivalentTo(new[] { "ad-1" }));
    Assert.That((await repo.GetActiveAsync(includeHidden: true)).Count, Is.EqualTo(2));
}

[Test]
public async Task Upsert_preserves_hidden_flag()
{
    // The v1 upsert trap in reverse: Hidden is Hugin's own field — the feed knows nothing
    // about it, so the update path must never touch it or every daily sync would resurrect
    // everything dismissed.
    var repo = new EfAdRepository(Db);
    await repo.UpsertAsync(SomeFeedAd("ad-1"), Now);
    await repo.SetHiddenAsync("ad-1", true);

    await repo.UpsertAsync(SomeFeedAd("ad-1"), Now.AddDays(1));

    Assert.That((await Db.Ads.FindAsync("ad-1"))!.Hidden, Is.True);
}
```

If the fixture has no `SomeFeedAd` helper, add one locally:

```csharp
private static FeedAd SomeFeedAd(string id) =>
    new(id, "Utvikler", "Firma AS", "999888777", "3407",
        Published: DateTimeOffset.UtcNow, Expires: DateTimeOffset.UtcNow.AddDays(14),
        SourceUrl: "https://arbeidsplassen.nav.no/x", IsActive: true, Category: "IT / Utvikling");
```

- [ ] **Step 2: Run to verify failure**

Run: `dotnet test --filter RepositoryTests`
Expected: FAIL — `SetHiddenAsync` / `Hidden` do not exist.

- [ ] **Step 3: Implement model + repository**

`Ad.cs` — add below `IsActive`:

```csharp
    // Dashboard dismiss flag ("Skjul") — Hugin's own field, never touched by sync upserts.
    public bool Hidden { get; set; }
```

`IAdRepository` — change `GetActiveAsync` signature as in Interfaces above, and add:

```csharp
    /// <summary>Dashboard dismiss flag. Returns false when the feedId is unknown.</summary>
    public Task<bool> SetHiddenAsync(string feedId, bool hidden, CancellationToken ct = default);
```

`EfAdRepository`:

```csharp
    public async Task<IReadOnlyList<Ad>> GetActiveAsync(string? municipalityNumber = null,
        bool includeHidden = false, CancellationToken ct = default) =>
        await db.Ads
            .Where(a => a.IsActive
                && (municipalityNumber == null || a.MunicipalityNumber == municipalityNumber)
                && (includeHidden || !a.Hidden))
            .OrderByDescending(a => a.Published)
            .ToListAsync(ct);

    public async Task<bool> SetHiddenAsync(string feedId, bool hidden, CancellationToken ct = default)
    {
        if (await db.Ads.FindAsync([feedId], ct) is not { } ad) return false;
        ad.Hidden = hidden;
        await db.SaveChangesAsync(ct);
        return true;
    }
```

The upsert update path needs **no edit** — `Hidden` simply must not be added there; the test pins it.

In `Program.cs` `RunListAsync`, change the ads call to `.GetActiveAsync(command.Kommune, includeHidden: true)`.

- [ ] **Step 4: Generate the migration**

Run from repo root:
```bash
dotnet ef migrations add AddAdHidden --project Hugin.Infrastructure --startup-project Hugin.Console --output-dir Data/Migrations
```
Expected: three files appear under `Hugin.Infrastructure/Data/Migrations/`; the migration adds a non-null `Hidden` column with default `false`. (If `dotnet ef` is missing: `dotnet tool restore` or `dotnet tool install --global dotnet-ef`.)

- [ ] **Step 5: Run the full suite**

Run: `dotnet test`
Expected: 111 passed (108 + 3).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: Ad.Hidden dismiss flag, sync-proof by test

GetActiveAsync filters hidden ads unless asked; SetHiddenAsync toggles.
CLI list --ads passes includeHidden:true (unchanged behavior this phase).
Upsert-preserves-Hidden test pins the v1 trap class in reverse."
```

---

### Task 4: `Hugin.Api` skeleton — host, loopback binding, security middleware, test factory

**Files:**
- Create: `Hugin.Api/Hugin.Api.csproj`, `Hugin.Api/Program.cs`, `Hugin.Api/Security.cs`
- Modify: `hugin.slnx`, `Hugin.Tests/Hugin.Tests.csproj`
- Test: `Hugin.Tests/Api/ApiFactory.cs`, `Hugin.Tests/Api/SecurityTests.cs`

**Interfaces:**
- Produces: a bootable minimal API host. `public partial class Program {}` marker in `Hugin.Api` so `WebApplicationFactory<Program>` can see it.
- Produces `ApiFactory : WebApplicationFactory<Program>` for ALL later API tests: temp-file SQLite (fresh per fixture), fake clients (`FakeBrregClient`, `FakeNavFeedClient` — reuse/extend the fakes in `Hugin.Tests/Fakes.cs`), auto-sync disabled via `builder.UseSetting("hugin:autosync", "false")`, and a helper `HttpClient CreateApiClient()` that pre-sets the `X-Hugin: 1` header (tests that probe the header rules build their own client without it).
- Produces middleware behavior every later endpoint inherits: Host allowlist (`localhost`, `127.0.0.1`, `[::1]`, any port) → else 403 ProblemDetails; non-GET/HEAD/OPTIONS under `/api` without `X-Hugin: 1` → 403 ProblemDetails; all error bodies bokmål.

- [ ] **Step 1: Create the project**

`Hugin.Api/Hugin.Api.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk.Web">

  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <AssemblyName>hugin-api</AssemblyName>
  </PropertyGroup>

  <ItemGroup>
    <ProjectReference Include="..\Hugin.Core\Hugin.Core.csproj" />
    <ProjectReference Include="..\Hugin.Infrastructure\Hugin.Infrastructure.csproj" />
  </ItemGroup>

</Project>
```

Add to `hugin.slnx`. In `Hugin.Tests.csproj` add:

```xml
    <ProjectReference Include="..\Hugin.Api\Hugin.Api.csproj" />
```
and
```xml
    <PackageReference Include="Microsoft.AspNetCore.Mvc.Testing" Version="10.0.11" />
```

- [ ] **Step 2: Write the failing security tests**

`Hugin.Tests/Api/ApiFactory.cs`:

```csharp
using Hugin.Core.Abstractions;
using Hugin.Infrastructure.Data;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.AspNetCore.Hosting;

namespace Hugin.Tests.Api;

public sealed class ApiFactory : WebApplicationFactory<Program>
{
    private readonly string _dbPath =
        Path.Combine(Path.GetTempPath(), $"hugin-api-{Guid.NewGuid():N}.db");

    public FakeBrregClient Brreg { get; } = new();
    public FakeNavFeedClient Nav { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("hugin:autosync", "false");
        builder.ConfigureServices(services =>
        {
            services.RemoveAll(typeof(DbContextOptions<HuginDbContext>));
            services.AddDbContext<HuginDbContext>(o =>
                o.UseSqlite(HuginDbInitializer.ConnectionString(_dbPath)));

            services.RemoveAll(typeof(IBrregClient));
            services.RemoveAll(typeof(INavFeedClient));
            services.AddSingleton<IBrregClient>(Brreg);
            services.AddSingleton<INavFeedClient>(Nav);
        });
    }

    /// <summary>Client with the write header pre-set — the default for endpoint tests.</summary>
    public HttpClient CreateApiClient()
    {
        var client = CreateClient();
        client.DefaultRequestHeaders.Add("X-Hugin", "1");
        return client;
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        SqliteConnection.ClearAllPools();
        try { File.Delete(_dbPath); } catch (IOException) { }
    }
}
```

(`services.RemoveAll` is `Microsoft.Extensions.DependencyInjection.Extensions` — add the using. If `Fakes.cs` has no client fakes with settable results, extend it: `FakeBrregClient` holds `List<RegisterCompany> Companies` returned by `GetCompaniesAsync`, `GetByOrgnrAsync` looks up by orgnr; `FakeNavFeedClient` holds a queue of `FeedPage`s; both may also expose an optional `Func<Task>? OnCall` gate — Task 8 uses it to hold a sync open.)

`Hugin.Tests/Api/SecurityTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;

namespace Hugin.Tests.Api;

[TestFixture]
public sealed class SecurityTests
{
    private ApiFactory _factory = null!;

    [OneTimeSetUp] public void Up() => _factory = new ApiFactory();
    [OneTimeTearDown] public void Down() => _factory.Dispose();

    [Test]
    public async Task Get_without_write_header_is_allowed()
    {
        using var client = _factory.CreateClient(); // no X-Hugin
        var response = await client.GetAsync("/api/status");
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.OK));
    }

    [Test]
    public async Task Write_without_header_is_403()
    {
        using var client = _factory.CreateClient(); // no X-Hugin
        var response = await client.PostAsync("/api/seen", JsonContent.Create(new { asOf = DateTimeOffset.UtcNow }));
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.Forbidden));
    }

    [Test]
    public async Task Foreign_host_header_is_403()
    {
        using var client = _factory.CreateApiClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/status");
        request.Headers.TryAddWithoutValidation("Host", "evil.example");
        var response = await client.SendAsync(request);
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.Forbidden));
    }

    [Test]
    public async Task No_cors_headers_on_any_response()
    {
        using var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/status");
        Assert.That(response.Headers.Contains("Access-Control-Allow-Origin"), Is.False);
    }
}
```

(`/api/status` arrives in Task 6 — for THIS task, map a placeholder `GET /api/status` returning `Results.Ok(new { ok = true })` so the security tests have a target; Task 6 replaces it.)

- [ ] **Step 3: Run to verify failure**

Run: `dotnet test --filter SecurityTests`
Expected: FAIL — `Program` / `ApiFactory` don't compile yet.

- [ ] **Step 4: Implement the host**

`Hugin.Api/Security.cs`:

```csharp
using Microsoft.AspNetCore.Http;

namespace Hugin.Api;

/// <summary>
/// Localhost is not a boundary against the browser: any web page can fire simple requests at
/// http://localhost:*, and DNS rebinding can read responses. Two cheap rules close both holes
/// for a single-user loopback API — see the spec's "API security" section.
/// </summary>
public static class Security
{
    private static readonly string[] AllowedHosts = ["localhost", "127.0.0.1", "[::1]"];

    public static IApplicationBuilder UseHuginSecurity(this IApplicationBuilder app) =>
        app.Use(async (context, next) =>
        {
            var host = context.Request.Host.Host;
            if (!AllowedHosts.Contains(host, StringComparer.OrdinalIgnoreCase))
            {
                await Results.Problem(statusCode: StatusCodes.Status403Forbidden,
                    title: "Ukjent Host-header — Hugin svarer bare på localhost.")
                    .ExecuteAsync(context);
                return;
            }

            var method = context.Request.Method;
            var isWrite = method != HttpMethods.Get && method != HttpMethods.Head && method != HttpMethods.Options;
            if (isWrite && context.Request.Path.StartsWithSegments("/api")
                && context.Request.Headers["X-Hugin"] != "1")
            {
                // A missing custom header means the request never passed a CORS preflight —
                // i.e. it did not come from the dashboard.
                await Results.Problem(statusCode: StatusCodes.Status403Forbidden,
                    title: "Mangler X-Hugin-header — skriving er forbeholdt dashbordet.")
                    .ExecuteAsync(context);
                return;
            }

            await next();
        });
}
```

`Hugin.Api/Program.cs`:

```csharp
using Hugin.Api;
using Hugin.Core.Abstractions;
using Hugin.Core.Config;
using Hugin.Core.Services;
using Hugin.Infrastructure;
using Hugin.Infrastructure.Data;
using Hugin.Infrastructure.Http;
using Microsoft.EntityFrameworkCore;

var configPath = ArgValue(args, "--config");
var port = int.TryParse(ArgValue(args, "--port"), out var p) ? p : 5111;

var loaded = ConfigLoader.Load(configPath);
if (loaded.Warning is not null) Console.Error.WriteLine($"Advarsel: {loaded.Warning}");

var builder = WebApplication.CreateBuilder(args);

// Loopback in code, not config: a copied launchSettings must never expose the pipeline on LAN.
builder.WebHost.ConfigureKestrel(o => o.Listen(System.Net.IPAddress.Loopback, port));

builder.Logging.SetMinimumLevel(LogLevel.Warning);

builder.Services.AddSingleton(loaded.Config);
builder.Services.AddSingleton<IClock, SystemClock>();
builder.Services.AddDbContext<HuginDbContext>(o =>
    o.UseSqlite(HuginDbInitializer.ConnectionString(loaded.DatabasePath)));

builder.Services.AddScoped<ICompanyRepository, EfCompanyRepository>();
builder.Services.AddScoped<IAdRepository, EfAdRepository>();
builder.Services.AddScoped<IPipelineRepository, EfPipelineRepository>();
builder.Services.AddScoped<ISyncStateRepository, EfSyncStateRepository>();
builder.Services.AddScoped<IReviewMarkRepository, EfReviewMarkRepository>();

builder.Services.AddSingleton<IBrregClient>(_ =>
    new BrregClient(new HttpClient { BaseAddress = new Uri(BrregClient.BaseAddress) }));
builder.Services.AddSingleton<INavFeedClient>(sp =>
{
    var http = new HttpClient { BaseAddress = new Uri(NavFeedClient.BaseAddress) };
    var config = sp.GetRequiredService<HuginConfig>();
    return new NavFeedClient(http, new NavTokenProvider(http, config.NavToken), config);
});

builder.Services.AddScoped<SyncService>();
builder.Services.AddScoped<NewItemsService>();
builder.Services.AddScoped<PipelineService>();

var app = builder.Build();

await using (var scope = app.Services.CreateAsyncScope())
    await HuginDbInitializer.InitAsync(scope.ServiceProvider.GetRequiredService<HuginDbContext>());

app.UseHuginSecurity();

app.MapGet("/api/status", () => Results.Ok(new { ok = true })); // placeholder until Task 6

app.Run();

static string? ArgValue(string[] args, string name)
{
    var i = Array.IndexOf(args, name);
    return i >= 0 && i + 1 < args.Length ? args[i + 1] : null;
}

public partial class Program { }
```

`SystemClock` currently lives as `internal` in `Hugin.Console/Program.cs` — move it to `Hugin.Core/Abstractions/SystemClock.cs` as `public sealed class SystemClock : IClock` and delete the Console copy (update its registration to the Core type).

- [ ] **Step 5: Run the security tests, then the full suite**

Run: `dotnet test --filter SecurityTests` → 4 passed. Then `dotnet test` → 115 passed, 0 failed.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: Hugin.Api skeleton with loopback-only security model

Kestrel bound to 127.0.0.1 in code; Host-header allowlist and X-Hugin
write header enforced by middleware; no CORS. ApiFactory test harness
with temp SQLite and fake feed clients."
```

---

### Task 5: Ad overview — Core service + `GET /api/ads`

**Files:**
- Create: `Hugin.Core/Services/AdOverviewService.cs`, `Hugin.Api/Contracts.cs`, `Hugin.Api/Endpoints/AdsEndpoints.cs`
- Modify: `Hugin.Api/Program.cs` (register service, map endpoints)
- Test: `Hugin.Tests/AdOverviewServiceTests.cs`, `Hugin.Tests/Api/AdsEndpointTests.cs`

**Interfaces:**
- Produces `Hugin.Core.Services.AdOverviewService` (ctor: `IAdRepository, IPipelineRepository, IClock`):
  - `public sealed record AdOverview(string FeedId, string Title, string? EmployerName, string? EmployerOrgnr, string? MunicipalityNumber, DateTimeOffset? Expires, int? DaysLeft, string? Category, string? SourceUrl, PipelineStatus? PipelineStatus, bool Hidden);`
  - `Task<IReadOnlyList<AdOverview>> GetAsync(string? municipalityNumber = null, bool includeHidden = false, CancellationToken ct = default)` — active ads, pipeline status joined by `EmployerOrgnr`, sorted by `Expires` ascending with nulls LAST. `DaysLeft = (Expires.UtcDateTime.Date - now.UtcDateTime.Date).Days` (frist today = 0), null when no Expires.
- Produces `Hugin.Api` slug helper used by ALL later endpoints, in `Contracts.cs`:
  - `public static class StatusSlug { public static string ToSlug(PipelineStatus s); public static PipelineStatus? Parse(string? slug); }` — slugs exactly as the CLI: `funnet`, `soekt-selv`, `bedt-get`, `svar`.
- Produces DTO (JSON camelCase is ASP.NET default): `public sealed record AdDto(string FeedId, string Title, string? Employer, string? EmployerOrgnr, string? Kommune, DateTimeOffset? Expires, int? DaysLeft, string? Category, string? SourceUrl, string? PipelineStatus, bool Hidden);`
- Route: `GET /api/ads?kommune=&hidden=` — `hidden=true` → `includeHidden: true`.

- [ ] **Step 1: Write the failing Core tests**

`Hugin.Tests/AdOverviewServiceTests.cs` — use the existing fakes in `Fakes.cs` (`FakeAdRepository`, `FakePipelineRepository`, fixed-clock fake; follow the naming already there, extending fakes with the new members where the interface grew):

```csharp
using Hugin.Core.Models;
using Hugin.Core.Services;

namespace Hugin.Tests;

[TestFixture]
public sealed class AdOverviewServiceTests
{
    private static Ad MakeAd(string id, string? orgnr = null, DateTimeOffset? expires = null, bool hidden = false) =>
        new() { FeedId = id, Title = "Utvikler", EmployerName = "Firma", EmployerOrgnr = orgnr,
                Expires = expires, IsActive = true, Hidden = hidden };

    [Test]
    public async Task Sorts_by_deadline_ascending_with_null_expires_last()
    {
        var now = new DateTimeOffset(2026, 8, 19, 8, 0, 0, TimeSpan.Zero);
        var ads = new FakeAdRepository(
            MakeAd("late", expires: now.AddDays(10)),
            MakeAd("none"),
            MakeAd("soon", expires: now.AddDays(3)));
        var sut = new AdOverviewService(ads, new FakePipelineRepository(), new FakeClock(now));

        var result = await sut.GetAsync();

        Assert.That(result.Select(a => a.FeedId), Is.EqualTo(new[] { "soon", "late", "none" }));
        Assert.That(result[0].DaysLeft, Is.EqualTo(3));
        Assert.That(result[2].DaysLeft, Is.Null);
    }

    [Test]
    public async Task Joins_pipeline_status_by_employer_orgnr()
    {
        var now = DateTimeOffset.UtcNow;
        var ads = new FakeAdRepository(MakeAd("a", orgnr: "999888777"), MakeAd("b", orgnr: "111222333"));
        var pipeline = new FakePipelineRepository(new PipelineEntry
            { Orgnr = "999888777", Status = PipelineStatus.Funnet, Created = now, Updated = now });
        var sut = new AdOverviewService(ads, pipeline, new FakeClock(now));

        var result = await sut.GetAsync();

        Assert.That(result.Single(a => a.FeedId == "a").PipelineStatus, Is.EqualTo(PipelineStatus.Funnet));
        Assert.That(result.Single(a => a.FeedId == "b").PipelineStatus, Is.Null);
    }

    [Test]
    public async Task Deadline_today_is_zero_days_left()
    {
        var now = new DateTimeOffset(2026, 8, 19, 8, 0, 0, TimeSpan.Zero);
        var ads = new FakeAdRepository(MakeAd("today", expires: new DateTimeOffset(2026, 8, 19, 23, 59, 0, TimeSpan.Zero)));
        var sut = new AdOverviewService(ads, new FakePipelineRepository(), new FakeClock(now));

        Assert.That((await sut.GetAsync())[0].DaysLeft, Is.Zero);
    }
}
```

- [ ] **Step 2: Run to verify failure** — `dotnet test --filter AdOverviewServiceTests` → FAIL (type missing).

- [ ] **Step 3: Implement the Core service**

`Hugin.Core/Services/AdOverviewService.cs`:

```csharp
using Hugin.Core.Abstractions;
using Hugin.Core.Models;

namespace Hugin.Core.Services;

public sealed record AdOverview(string FeedId, string Title, string? EmployerName, string? EmployerOrgnr,
    string? MunicipalityNumber, DateTimeOffset? Expires, int? DaysLeft, string? Category,
    string? SourceUrl, PipelineStatus? PipelineStatus, bool Hidden);

/// <summary>
/// The dashboard's deadline view: active ads with the outreach pipeline joined in, soonest
/// frist first. Ads without a frist sort last — a missing deadline is not an urgent one.
/// </summary>
public sealed class AdOverviewService(IAdRepository ads, IPipelineRepository pipeline, IClock clock)
{
    public async Task<IReadOnlyList<AdOverview>> GetAsync(string? municipalityNumber = null,
        bool includeHidden = false, CancellationToken ct = default)
    {
        var today = clock.UtcNow.UtcDateTime.Date;
        var active = await ads.GetActiveAsync(municipalityNumber, includeHidden, ct);
        var entries = (await pipeline.GetAllAsync(ct: ct)).ToDictionary(e => e.Orgnr);

        return active
            .Select(a => new AdOverview(a.FeedId, a.Title, a.EmployerName, a.EmployerOrgnr,
                a.MunicipalityNumber, a.Expires,
                a.Expires is { } e ? (e.UtcDateTime.Date - today).Days : null,
                a.Category, a.SourceUrl,
                a.EmployerOrgnr is { } o && entries.TryGetValue(o, out var entry) ? entry.Status : null,
                a.Hidden))
            .OrderBy(a => a.Expires is null)      // nulls last
            .ThenBy(a => a.Expires)
            .ToList();
    }
}
```

- [ ] **Step 4: Run Core tests** — `dotnet test --filter AdOverviewServiceTests` → 3 passed.

- [ ] **Step 5: Write the failing endpoint test**

`Hugin.Tests/Api/AdsEndpointTests.cs`:

```csharp
using System.Net.Http.Json;
using Hugin.Core.Abstractions;

namespace Hugin.Tests.Api;

public sealed record AdDtoProbe(string FeedId, string? PipelineStatus, int? DaysLeft, bool Hidden);

[TestFixture]
public sealed class AdsEndpointTests
{
    private ApiFactory _factory = null!;
    private HttpClient _client = null!;

    [OneTimeSetUp]
    public void Up()
    {
        _factory = new ApiFactory();
        _client = _factory.CreateApiClient();
    }

    [OneTimeTearDown] public void Down() { _client.Dispose(); _factory.Dispose(); }

    [Test]
    public async Task Ads_hidden_filter_and_shape()
    {
        // Seed through the repository layer, scoped from the factory's services.
        using (var scope = _factory.Services.CreateScope())
        {
            var repo = scope.ServiceProvider.GetRequiredService<IAdRepository>();
            await repo.UpsertAsync(new FeedAd("a1", "Utvikler", "Firma", "999888777", "3407",
                DateTimeOffset.UtcNow, DateTimeOffset.UtcNow.AddDays(5), "https://x", true, "IT"), DateTimeOffset.UtcNow);
            await repo.UpsertAsync(new FeedAd("a2", "Utvikler 2", "Firma", "999888777", "3407",
                DateTimeOffset.UtcNow, DateTimeOffset.UtcNow.AddDays(9), "https://x", true, "IT"), DateTimeOffset.UtcNow);
            await repo.SetHiddenAsync("a2", true);
        }

        var visible = await _client.GetFromJsonAsync<List<AdDtoProbe>>("/api/ads");
        Assert.That(visible!.Select(a => a.FeedId), Is.EquivalentTo(new[] { "a1" }));

        var all = await _client.GetFromJsonAsync<List<AdDtoProbe>>("/api/ads?hidden=true");
        Assert.That(all!.Count, Is.EqualTo(2));
        Assert.That(all.Single(a => a.FeedId == "a2").Hidden, Is.True);
    }
}
```

- [ ] **Step 6: Run to verify failure** — 404, endpoint missing.

- [ ] **Step 7: Implement contracts + endpoint**

`Hugin.Api/Contracts.cs`:

```csharp
using Hugin.Core.Models;
using Hugin.Core.Services;

namespace Hugin.Api;

public sealed record AdDto(string FeedId, string Title, string? Employer, string? EmployerOrgnr,
    string? Kommune, DateTimeOffset? Expires, int? DaysLeft, string? Category, string? SourceUrl,
    string? PipelineStatus, bool Hidden, bool IsActive)
{
    // AdOverview only ever holds active ads.
    public static AdDto From(AdOverview a) => new(a.FeedId, a.Title, a.EmployerName, a.EmployerOrgnr,
        a.MunicipalityNumber, a.Expires, a.DaysLeft, a.Category, a.SourceUrl,
        a.PipelineStatus is { } s ? StatusSlug.ToSlug(s) : null, a.Hidden, IsActive: true);
}

/// <summary>Same slugs as the CLI's track command — one vocabulary across both frontends.</summary>
public static class StatusSlug
{
    public static string ToSlug(PipelineStatus status) => status switch
    {
        PipelineStatus.Funnet => "funnet",
        PipelineStatus.SoektSelv => "soekt-selv",
        PipelineStatus.BedtGetSjekke => "bedt-get",
        PipelineStatus.Svar => "svar",
        _ => status.ToString().ToLowerInvariant(),
    };

    public static PipelineStatus? Parse(string? slug) => slug switch
    {
        "funnet" => PipelineStatus.Funnet,
        "soekt-selv" => PipelineStatus.SoektSelv,
        "bedt-get" => PipelineStatus.BedtGetSjekke,
        "svar" => PipelineStatus.Svar,
        _ => null,
    };
}
```

`Hugin.Api/Endpoints/AdsEndpoints.cs`:

```csharp
using Hugin.Core.Services;

namespace Hugin.Api.Endpoints;

public static class AdsEndpoints
{
    public static void MapAds(this IEndpointRouteBuilder app) =>
        app.MapGet("/api/ads", async (AdOverviewService overview, string? kommune, bool hidden = false) =>
            Results.Ok((await overview.GetAsync(kommune, includeHidden: hidden)).Select(AdDto.From)));
}
```

In `Program.cs`: `builder.Services.AddScoped<AdOverviewService>();` and `app.MapAds();`.

- [ ] **Step 8: Run the full suite** — `dotnet test` → 119 passed (115 + 3 Core + 1 endpoint).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: ad overview service and GET /api/ads

Deadline-sorted active ads with pipeline join, daysLeft, hidden filter."
```

---

### Task 6: Remaining read endpoints — new, companies, pipeline, export, status

**Files:**
- Create: `Hugin.Core/Services/ExportService.cs`, `Hugin.Api/Endpoints/ReadEndpoints.cs`
- Modify: `Hugin.Core/Abstractions/Repositories.cs` (+`GetByEmployerAsync`), `Hugin.Infrastructure/Data/Repositories.cs`, `Hugin.Api/Contracts.cs`, `Hugin.Api/Program.cs`, `Hugin.Console/Program.cs` (RunExportAsync delegates to ExportService)
- Test: `Hugin.Tests/RepositoryTests.cs`, `Hugin.Tests/ExportServiceTests.cs`, `Hugin.Tests/Api/ReadEndpointTests.cs`

**Interfaces:**
- Produces `IAdRepository.GetByEmployerAsync(string orgnr, CancellationToken ct = default)` → all stored ads for that employer (active AND expired), newest `Published` first.
- Produces `Hugin.Core.Services.ExportService` (ctor: `IPipelineRepository, ICompanyRepository, IClock`): `Task<string> ExportAsync(DateTimeOffset? since = null, CancellationToken ct = default)` — default window `UtcNow.AddDays(-7)`; assembles the `(PipelineEntry, Company)` rows exactly as `Program.RunExportAsync` does today and calls `MarkdownExporter.Export`. The CLI's `RunExportAsync` shrinks to one service call — same output, pinned by existing MarkdownExporter tests.
- Produces DTOs in `Contracts.cs`:
  - `public sealed record NewDto(IReadOnlyList<CompanyDto> Companies, IReadOnlyList<AdDto> Ads, DateTimeOffset Since, DateTimeOffset AsOf);` — **`AsOf` = clock.UtcNow captured when the list was computed; Task 7's seen endpoint consumes exactly this value.** Ads inside `NewDto` reuse `AdDto` with `PipelineStatus` null-joined the cheap way (`AdDto.From` needs an `AdOverview`; for /api/new build `AdDto` directly from `Ad` with `PipelineStatus: null, DaysLeft: null`) — the new-list is a review list, not the deadline view.
  - `public sealed record CompanyDto(string Orgnr, string Name, string? Kommune, string? NaceCode, bool IsBranch, string? Website, string? ParentOrgnr);`
  - `public sealed record CompanyDetailDto(CompanyDto Company, IReadOnlyList<AdDto> Ads);`
  - `public sealed record PipelineDto(string Orgnr, string CompanyName, string Status, string Route, string Why, string? Note, string? Svar, DateTimeOffset Updated);` (`Route` slugs: `ingen`, `soekt-selv`, `bedt-get`.)
  - `public sealed record SourceStateDto(DateTimeOffset LastSyncUtc);`
  - `public sealed record StatusDto(SourceStateDto? Brreg, SourceStateDto? Nav, DateTimeOffset? ReviewMark, int ActiveAds, int Companies, int PipelineEntries, IReadOnlyList<Linkout> Linkouts);`
- Routes: `GET /api/new`, `GET /api/companies?kommune=`, `GET /api/companies/{orgnr}` (404 unknown), `GET /api/pipeline?status=` (400 on unknown slug), `GET /api/export?since=` (returns `text/markdown; charset=utf-8`), `GET /api/status` (replaces Task 4's placeholder).

- [ ] **Step 1: Failing repository test** (`RepositoryTests.cs`):

```csharp
[Test]
public async Task GetByEmployerAsync_returns_expired_too_newest_first()
{
    var repo = new EfAdRepository(Db);
    await repo.UpsertAsync(SomeFeedAd("old") with { EmployerOrgnr = "999888777",
        Published = Now.AddDays(-30), IsActive = false }, Now);
    await repo.UpsertAsync(SomeFeedAd("new") with { EmployerOrgnr = "999888777",
        Published = Now }, Now);
    await repo.UpsertAsync(SomeFeedAd("other") with { EmployerOrgnr = "111" }, Now);

    var ads = await repo.GetByEmployerAsync("999888777");
    Assert.That(ads.Select(a => a.FeedId), Is.EqualTo(new[] { "new", "old" }));
}
```

- [ ] **Step 2: Run → FAIL.** Implement in `EfAdRepository`:

```csharp
    public async Task<IReadOnlyList<Ad>> GetByEmployerAsync(string orgnr, CancellationToken ct = default) =>
        await db.Ads.Where(a => a.EmployerOrgnr == orgnr)
            .OrderByDescending(a => a.Published).ToListAsync(ct);
```

Add the member to `IAdRepository` and to the test fakes. Run → PASS.

- [ ] **Step 3: Failing ExportService test** (`ExportServiceTests.cs`): seed a fake pipeline repo with one `SoektSelv` entry updated now and a fake company repo with the matching company; assert the returned string contains `## Søkt selv` and the company name; assert an entry updated 10 days ago is excluded by the default window. Use the fixed-clock fake. Then implement `ExportService` (move the row-assembly loop out of `Program.RunExportAsync` verbatim), re-point the CLI, run → PASS plus all existing MarkdownExporter/CLI tests stay green.

- [ ] **Step 4: Failing endpoint tests** (`ReadEndpointTests.cs`, one fixture, seeded via scoped repositories like Task 5):
  - `/api/new` before any mark → 200 with `{"companies":[],"ads":[],...}`? **No** — mirror the CLI: no mark yet → `Results.Ok` with an explicit empty DTO and `since = null` is WRONG per contract; instead return 204 No Content when `GetNewAsync()` is null, and the frontend renders "Ingen sync er kjørt ennå". Test both 204 (fresh db) and 200 with seeded mark + one newer company (set the mark via `IReviewMarkRepository`, then upsert a company with later `FirstSeen`). Assert `asOf` is present and ≥ `since`.
  - `/api/companies/{orgnr}` unknown → 404; known → 200 with `ads` array from `GetByEmployerAsync`.
  - `/api/pipeline?status=tull` → 400. `/api/pipeline?status=funnet` filters.
  - `/api/export` → content type `text/markdown`, body contains `## Søkt selv`.
  - `/api/status` → 200 with counts and `linkouts` (the test factory's `HuginConfig` is the default — override the singleton in `ApiFactory.ConfigureServices` with one linkout so the passthrough is observable).

- [ ] **Step 5: Implement `ReadEndpoints.cs`** — all handlers take repositories/services from DI; no EF here:

```csharp
using Hugin.Core.Abstractions;
using Hugin.Core.Config;
using Hugin.Core.Models;
using Hugin.Core.Services;

namespace Hugin.Api.Endpoints;

public static class ReadEndpoints
{
    public static void MapReads(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/new", async (NewItemsService service, IClock clock) =>
        {
            if (await service.GetNewAsync() is not { } items) return Results.NoContent();
            return Results.Ok(new NewDto(
                items.Companies.Select(CompanyDto.From).ToList(),
                items.Ads.Select(AdDto.FromAd).ToList(),
                items.Since, clock.UtcNow));
        });

        app.MapGet("/api/companies", async (ICompanyRepository companies, string? kommune) =>
            Results.Ok((await companies.GetAllAsync(kommune)).Select(CompanyDto.From)));

        app.MapGet("/api/companies/{orgnr}", async (ICompanyRepository companies, IAdRepository ads, string orgnr) =>
            await companies.GetAsync(orgnr) is not { } company
                ? Results.Problem(statusCode: 404, title: $"Fant ikke orgnr {orgnr}.")
                : Results.Ok(new CompanyDetailDto(CompanyDto.From(company),
                    (await ads.GetByEmployerAsync(orgnr)).Select(AdDto.FromAd).ToList())));

        app.MapGet("/api/pipeline", async (IPipelineRepository pipeline, ICompanyRepository companies, string? status) =>
        {
            PipelineStatus? filter = null;
            if (status is not null && (filter = StatusSlug.Parse(status)) is null)
                return Results.Problem(statusCode: 400, title: $"Ukjent status «{status}».");

            var entries = await pipeline.GetAllAsync(filter);
            var result = new List<PipelineDto>(entries.Count);
            foreach (var e in entries)
                result.Add(PipelineDto.From(e, (await companies.GetAsync(e.Orgnr))?.Name ?? e.Orgnr));
            return Results.Ok(result);
        });

        app.MapGet("/api/export", async (ExportService export, DateTimeOffset? since) =>
            Results.Text(await export.ExportAsync(since), "text/markdown", System.Text.Encoding.UTF8));

        app.MapGet("/api/status", async (ISyncStateRepository syncState, IReviewMarkRepository mark,
            IAdRepository ads, ICompanyRepository companies, IPipelineRepository pipeline, HuginConfig config) =>
        {
            var brreg = await syncState.GetAsync("brreg");
            var nav = await syncState.GetAsync("nav");
            return Results.Ok(new StatusDto(
                brreg is null ? null : new SourceStateDto(brreg.LastSyncUtc),
                nav is null ? null : new SourceStateDto(nav.LastSyncUtc),
                await mark.GetAsync(),
                (await ads.GetActiveAsync()).Count,
                (await companies.GetAllAsync()).Count,
                (await pipeline.GetAllAsync()).Count,
                config.Linkouts));
        });
    }
}
```

Add the static factory helpers referenced above to `Contracts.cs` (`CompanyDto.From(Company)`, `AdDto.FromAd(Ad)` building with `DaysLeft: null, PipelineStatus: null, Hidden: a.Hidden, IsActive: a.IsActive`, `PipelineDto.From(PipelineEntry, string name)` using `StatusSlug.ToSlug` and route slugs `ingen`/`soekt-selv`/`bedt-get`). Remove the Task 4 placeholder `/api/status`. Register `ExportService` scoped; `app.MapReads();`.

- [ ] **Step 6: Full suite** — `dotnet test`. Expected: all green (count grows by this task's tests; record the new total in the commit message).

- [ ] **Step 7: Commit** — `feat: read endpoints — new (asOf), companies incl. ad history, pipeline, export, status`

---

### Task 7: Write endpoints — track, hide/unhide, seen

**Files:**
- Create: `Hugin.Api/Endpoints/WriteEndpoints.cs`
- Modify: `Hugin.Api/Contracts.cs`, `Hugin.Api/Program.cs`
- Test: `Hugin.Tests/Api/WriteEndpointTests.cs`

**Interfaces:**
- Requests in `Contracts.cs`: `public sealed record TrackRequest(string Status, string? Why, string? Note, string? Svar);` · `public sealed record SeenRequest(DateTimeOffset AsOf);`
- Routes: `PUT /api/pipeline/{orgnr}` (404 when the company is not already in the db — no Brreg fetch from the API; 400 unknown status slug; returns the updated `PipelineDto` plus `warning` string when Why is empty beyond funnet — wrap as `public sealed record TrackResponse(PipelineDto Entry, string? Warning);`), `POST /api/ads/{feedId}/hide` / `DELETE /api/ads/{feedId}/hide` (404 unknown feedId, 204 on success), `POST /api/seen` (204; monotonic — an `AsOf` older than the current mark is a no-op so a stale tab can never move the mark backwards).

- [ ] **Step 1: Failing tests** (`WriteEndpointTests.cs`, seeding via scoped repositories; client = `CreateApiClient()`):
  - Track unknown orgnr → 404. Seed company `999888777`, `PUT /api/pipeline/999888777` with `{"status":"soekt-selv","why":"","note":null,"svar":null}` → 200, `warning` non-null, entry status slug `soekt-selv`. Second PUT `{"status":"svar","why":"god match"}` → warning null, `route` still `soekt-selv` (Route survival — spec's export-attribution rule).
  - Hide: unknown feedId → 404; seed ad → POST hide → 204 and `/api/ads` no longer lists it; DELETE hide → 204 and it's back.
  - Seen: set mark to T0 via repository; POST `{"asOf": T1}` (T1 > T0) → 204, mark now T1 (read back via repository). POST `{"asOf": T0}` again → 204, mark STILL T1 (monotonic no-op).

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `WriteEndpoints.cs`:**

```csharp
using Hugin.Core.Abstractions;
using Hugin.Core.Services;

namespace Hugin.Api.Endpoints;

public static class WriteEndpoints
{
    public static void MapWrites(this IEndpointRouteBuilder app)
    {
        app.MapPut("/api/pipeline/{orgnr}", async (PipelineService pipeline,
            ICompanyRepository companies, string orgnr, TrackRequest request) =>
        {
            if (StatusSlug.Parse(request.Status) is not { } status)
                return Results.Problem(statusCode: 400, title: $"Ukjent status «{request.Status}».");

            // Dashboard tracking starts from synced data; only the CLI fetches unknown
            // orgnr from Brreg (spec: CLI/dashboard seam).
            if (await companies.GetAsync(orgnr) is null)
                return Results.Problem(statusCode: 404, title: $"Fant ikke orgnr {orgnr} — synk først, eller bruk hugin track.");

            var result = await pipeline.TrackAsync(orgnr, status, request.Why, request.Note, request.Svar);
            var name = (await companies.GetAsync(orgnr))!.Name;
            return Results.Ok(new TrackResponse(PipelineDto.From(result.Entry, name), result.Warning));
        });

        app.MapPost("/api/ads/{feedId}/hide", (IAdRepository ads, string feedId) => SetHidden(ads, feedId, true));
        app.MapDelete("/api/ads/{feedId}/hide", (IAdRepository ads, string feedId) => SetHidden(ads, feedId, false));

        app.MapPost("/api/seen", async (IReviewMarkRepository mark, SeenRequest request) =>
        {
            // Monotonic: a stale tab must never move the mark backwards.
            if (await mark.GetAsync() is { } current && request.AsOf <= current) return Results.NoContent();
            await mark.SetAsync(request.AsOf);
            return Results.NoContent();
        });
    }

    private static async Task<IResult> SetHidden(IAdRepository ads, string feedId, bool hidden) =>
        await ads.SetHiddenAsync(feedId, hidden)
            ? Results.NoContent()
            : Results.Problem(statusCode: 404, title: $"Fant ikke annonsen {feedId}.");
}
```

`app.MapWrites();` in Program.cs.

- [ ] **Step 4: Full suite green. Commit** — `feat: write endpoints — track (404 seam), hide/unhide, monotonic seen mark`

---

### Task 8: SyncRunner, sync endpoints, auto-sync on launch

**Files:**
- Create: `Hugin.Api/Services/SyncRunner.cs`, `Hugin.Api/Services/StartupSync.cs`, `Hugin.Api/Endpoints/SyncEndpoints.cs`
- Modify: `Hugin.Api/Program.cs`, `Hugin.Api/Contracts.cs`
- Test: `Hugin.Tests/Api/SyncEndpointTests.cs`

**Interfaces:**
- `public sealed record SyncRunStatus(bool Running, DateTimeOffset? StartedUtc, DateTimeOffset? FinishedUtc, SourceResult? Brreg, SourceResult? Nav);`
- `public sealed class SyncRunner(IServiceScopeFactory scopes, IClock clock)` — singleton. `bool TryStart()` (false while running; on true, runs `SyncService.SyncAsync` on a background task inside its own scope, storing outcome); `SyncRunStatus Status { get; }` (thread-safe via lock). Exceptions land in the status (`Nav`/`Brreg` already carry per-source errors; a runner-level crash records both failed with the message) — never unhandled.
- Routes: `POST /api/sync` → `202 Accepted` or `409 Conflict` (bokmål title "En synk kjører allerede."); `GET /api/sync/status` → `SyncRunStatus`.
- `StartupSync : IHostedService` — on `StartAsync`, calls `runner.TryStart()` **unless** configuration `hugin:autosync` is `"false"` (how `ApiFactory` keeps tests deterministic).

- [ ] **Step 1: Failing tests** (`SyncEndpointTests.cs`):
  - POST `/api/sync` → 202; poll `GET /api/sync/status` until `running == false` (timeout 5s); assert `nav`/`brreg` results present. Fakes return one page with zero ads — success path.
  - Single-flight: gate the fake NAV client open (`Nav.OnCall` waits on a `TaskCompletionSource`), POST → 202, POST again → 409, release the gate, poll to completion.
  - `ApiFactory` (autosync=false) never syncs on boot: fresh factory, immediately `GET /api/sync/status` → `running == false`, `finishedUtc == null`.

- [ ] **Step 2: Run → FAIL. Step 3: Implement:**

```csharp
using Hugin.Core.Abstractions;
using Hugin.Core.Services;

namespace Hugin.Api.Services;

public sealed record SyncRunStatus(bool Running, DateTimeOffset? StartedUtc,
    DateTimeOffset? FinishedUtc, SourceResult? Brreg, SourceResult? Nav);

/// <summary>
/// One sync in flight per process. SyncService and its repositories are scoped, so each run
/// gets a fresh scope; cross-process overlap with the CLI stays an accepted risk (spec).
/// </summary>
public sealed class SyncRunner(IServiceScopeFactory scopes, IClock clock)
{
    private readonly Lock _lock = new();
    private SyncRunStatus _status = new(false, null, null, null, null);

    public SyncRunStatus Status { get { lock (_lock) return _status; } }

    public bool TryStart()
    {
        lock (_lock)
        {
            if (_status.Running) return false;
            _status = new SyncRunStatus(true, clock.UtcNow, null, null, null);
        }

        _ = Task.Run(RunAsync);
        return true;
    }

    private async Task RunAsync()
    {
        SourceResult brreg, nav;
        try
        {
            await using var scope = scopes.CreateAsyncScope();
            var summary = await scope.ServiceProvider.GetRequiredService<SyncService>().SyncAsync();
            (brreg, nav) = (summary.Brreg, summary.Nav);
        }
        catch (Exception ex)
        {
            brreg = nav = new SourceResult(false, 0, ex.Message);
        }

        lock (_lock)
            _status = new SyncRunStatus(false, _status.StartedUtc, clock.UtcNow, brreg, nav);
    }
}
```

`StartupSync.cs`:

```csharp
namespace Hugin.Api.Services;

public sealed class StartupSync(SyncRunner runner, IConfiguration configuration) : IHostedService
{
    public Task StartAsync(CancellationToken ct)
    {
        if (configuration["hugin:autosync"] != "false") runner.TryStart();
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken ct) => Task.CompletedTask;
}
```

`SyncEndpoints.cs`:

```csharp
using Hugin.Api.Services;

namespace Hugin.Api.Endpoints;

public static class SyncEndpoints
{
    public static void MapSync(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/sync", (SyncRunner runner) => runner.TryStart()
            ? Results.Accepted("/api/sync/status")
            : Results.Problem(statusCode: 409, title: "En synk kjører allerede."));

        app.MapGet("/api/sync/status", (SyncRunner runner) => Results.Ok(runner.Status));
    }
}
```

Program.cs: `builder.Services.AddSingleton<SyncRunner>(); builder.Services.AddHostedService<StartupSync>(); app.MapSync();`

- [ ] **Step 4: Full suite green. Commit** — `feat: SyncRunner single-flight, sync endpoints, auto-sync on launch`

---

### Task 9: Static frontend serving + publish wiring

**Files:**
- Modify: `Hugin.Api/Program.cs`, `Hugin.Api/Hugin.Api.csproj`, `.gitignore`, `README.md` (run section)
- Test: `Hugin.Tests/Api/StaticServingTests.cs`

**Interfaces:**
- The API serves `wwwroot/` (the Vite build output, arriving in Task 10): `UseDefaultFiles` + `UseStaticFiles` + `MapFallbackToFile("index.html")` for non-`/api` paths. With no `wwwroot/index.html` (API-only dev), `/` returns 404 and `/api/*` keeps working — the fallback must not crash an empty host.
- `.gitignore` gains `Hugin.Api/wwwroot/` (build output, rebuilt from `hugin-web`).

- [ ] **Step 1: Failing test** (`StaticServingTests.cs`): a fixture that writes a marker `index.html` into the factory's content-root `wwwroot` (use `builder.UseSetting("contentRoot", tempDir)` on a dedicated factory instance), then: `GET /` → 200 containing the marker; `GET /noe-annet` → 200 (SPA fallback, same marker); `GET /api/finnes-ikke` → 404 JSON, NOT the fallback page.

- [ ] **Step 2: Run → FAIL. Step 3: Implement** in Program.cs, after `UseHuginSecurity()` and BEFORE the endpoint mappings:

```csharp
app.UseDefaultFiles();
app.UseStaticFiles();

// SPA fallback — but /api stays API-shaped: an unknown endpoint is a 404 there, never index.html.
app.MapFallback(async context =>
{
    if (context.Request.Path.StartsWithSegments("/api"))
    {
        context.Response.StatusCode = StatusCodes.Status404NotFound;
        return;
    }

    var index = Path.Combine(app.Environment.WebRootPath ?? "wwwroot", "index.html");
    if (File.Exists(index))
    {
        context.Response.ContentType = "text/html";
        await context.Response.SendFileAsync(index);
    }
    else
    {
        context.Response.StatusCode = StatusCodes.Status404NotFound; // API-only dev host
    }
});
```

Mapped endpoints always win over the fallback, so every `/api` route from Tasks 5–8 is unaffected.

- [ ] **Step 4: Full suite green. Step 5: Commit** — `feat: serve SPA from wwwroot with /api-safe fallback`

---

### Task 10: `hugin-web` scaffold — Vite, Biome, Vitest, tokens, shell styles

**Files:**
- Create: `hugin-web/` (Vite react-ts template), `hugin-web/biome.json`, `hugin-web/vitest.config.ts` additions, `hugin-web/src/styles/main.css`, design-system sync
- Modify: `.gitignore`

**Interfaces:**
- Produces the toolchain every later frontend task assumes: `npm run dev` (proxy `/api` → `http://127.0.0.1:5111`), `npm run build` (outputs to `../Hugin.Api/wwwroot`), `npm test` (Vitest + Testing Library, jsdom).

- [ ] **Step 1: Scaffold**

```bash
npm create vite@latest hugin-web -- --template react-ts
cd hugin-web
npm install
npm install -D vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom @biomejs/biome
```

Delete the template's demo content (`App.css`, logo assets, counter code in `App.tsx`) — Task 11 replaces `App.tsx` wholesale.

- [ ] **Step 2: Configure**

`hugin-web/vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://127.0.0.1:5111" } },
  build: { outDir: "../Hugin.Api/wwwroot", emptyOutDir: true },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test-setup.ts",
    globals: true,
  },
});
```

(If the Vite/Vitest versions want a separate `vitest.config.ts`, put the `test` block there with the same values — one config file wins, don't keep both.)

`hugin-web/src/test-setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

`package.json` scripts: `"test": "vitest run"`, keep `dev`/`build`. `hugin-web/biome.json`: copy the shape used in Varde (2-space, recommended rules); add `"files": { "ignore": ["design-system/**"] }`. Root `.gitignore`: add `hugin-web/node_modules/`.

- [ ] **Step 3: Design system + base styles**

Sync the workbench design system: `node C:\Users\Nugget\Documents\Development\workbench\tools\extract.mjs design-system hugin-web` (from the workbench repo; if the extract target layout doesn't fit a Vite root cleanly, fall back to copying `design-system/tokens` CSS files into `hugin-web/src/styles/tokens.css` and note the deviation in the commit). `src/styles/main.css` — dark-first, mobile-first project styles only:

```css
@import "./tokens.css"; /* or the design-system entry the extract produced */

body {
  margin: 0;
  background: var(--color-bg, #101014);
  color: var(--color-text, #e8e8ec);
  font-family: var(--font-body, system-ui, sans-serif);
}

main { padding: 1rem; max-width: 72rem; margin-inline: auto; }

/* Urgency — color never alone; the days-left number always renders beside it. */
.frist-rod { color: var(--color-danger, #ff6b6b); }
.frist-gul { color: var(--color-warning, #ffc957); }

.visually-hidden {
  position: absolute; width: 1px; height: 1px;
  clip-path: inset(50%); overflow: hidden; white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition: none !important; }
}

@media (min-width: 768px) { main { padding: 1.5rem; } }
@media (min-width: 1024px) { main { padding: 2rem; } }
```

- [ ] **Step 4: Smoke-verify** — `npm test` (0 tests, exit 0 — add a trivial `src/smoke.test.ts` asserting `true` to prove the runner, delete it in Task 11), `npm run build` → files appear in `Hugin.Api/wwwroot/` and are git-ignored (`git status` clean of wwwroot).

- [ ] **Step 5: Commit** — `feat: hugin-web scaffold — vite + vitest + biome, builds into Hugin.Api/wwwroot`

---

### Task 11: Frontend data layer + app shell

**Files:**
- Create: `hugin-web/src/api.ts`, `hugin-web/src/types.ts`, `hugin-web/src/App.tsx` (replace), `hugin-web/src/components/LiveRegion.tsx`, `hugin-web/src/components/ConfirmDialog.tsx`, `hugin-web/src/main.tsx` (adjust imports)
- Test: `hugin-web/src/api.test.ts`, `hugin-web/src/App.test.tsx`, `hugin-web/src/components/ConfirmDialog.test.tsx`

**Interfaces (every later frontend task imports these — exact names):**

`types.ts` — mirrors of the C# DTOs (camelCase as serialized):

```ts
export type PipelineStatusSlug = "funnet" | "soekt-selv" | "bedt-get" | "svar";

export interface AdDto {
  feedId: string; title: string; employer: string | null; employerOrgnr: string | null;
  kommune: string | null; expires: string | null; daysLeft: number | null;
  category: string | null; sourceUrl: string | null;
  pipelineStatus: PipelineStatusSlug | null; hidden: boolean; isActive: boolean;
}
export interface CompanyDto {
  orgnr: string; name: string; kommune: string | null; naceCode: string | null;
  isBranch: boolean; website: string | null; parentOrgnr: string | null;
}
export interface CompanyDetailDto { company: CompanyDto; ads: AdDto[]; }
export interface NewDto { companies: CompanyDto[]; ads: AdDto[]; since: string; asOf: string; }
export interface PipelineDto {
  orgnr: string; companyName: string; status: PipelineStatusSlug;
  route: "ingen" | "soekt-selv" | "bedt-get"; why: string; note: string | null;
  svar: string | null; updated: string;
}
export interface TrackResponse { entry: PipelineDto; warning: string | null; }
export interface SourceStateDto { lastSyncUtc: string; }
export interface LinkoutDto { label: string; url: string; }
export interface StatusDto {
  brreg: SourceStateDto | null; nav: SourceStateDto | null; reviewMark: string | null;
  activeAds: number; companies: number; pipelineEntries: number; linkouts: LinkoutDto[];
}
export interface SourceResultDto { succeeded: boolean; fetched: number; error: string | null; }
export interface SyncRunStatus {
  running: boolean; startedUtc: string | null; finishedUtc: string | null;
  brreg: SourceResultDto | null; nav: SourceResultDto | null;
}
```

`api.ts`:

```ts
/** Thin fetch wrapper. Writes always carry X-Hugin: 1 — the API's CSRF gate. */
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    let title = `Feil (${response.status})`;
    try { title = (await response.json()).title ?? title; } catch { /* non-JSON body */ }
    throw new ApiError(response.status, title);
  }
  if (response.status === 204) return undefined as T;
  const type = response.headers.get("content-type") ?? "";
  return (type.includes("json") ? response.json() : response.text()) as Promise<T>;
}

const writeHeaders = { "X-Hugin": "1", "Content-Type": "application/json" };

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", headers: writeHeaders, body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", headers: writeHeaders, body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE", headers: writeHeaders }),
};
```

`LiveRegion.tsx` — one polite region for the whole app:

```tsx
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

const AnnounceContext = createContext<(message: string) => void>(() => {});
export const useAnnounce = () => useContext(AnnounceContext);

export function LiveRegionProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  const clearTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const announce = useCallback((next: string) => {
    setMessage("");                       // retrigger even for identical text
    clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => setMessage(next), 50);
  }, []);

  return (
    <AnnounceContext.Provider value={announce}>
      {children}
      <div aria-live="polite" className="visually-hidden">{message}</div>
    </AnnounceContext.Provider>
  );
}
```

`ConfirmDialog.tsx` — native `<dialog>` (focus trap and Escape for free), returns focus to the trigger because `showModal`/`close` restores it natively:

```tsx
import { useEffect, useRef, type ReactNode } from "react";

interface Props { open: boolean; title: string; children?: ReactNode;
  confirmLabel: string; onConfirm: () => void; onCancel: () => void; }

export function ConfirmDialog({ open, title, children, confirmLabel, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} onClose={onCancel} aria-label={title}>
      <h2>{title}</h2>
      {children}
      <div className="dialog-actions">
        <button type="button" onClick={onCancel}>Avbryt</button>
        <button type="button" onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </dialog>
  );
}
```

`App.tsx` — tab shell (no router), views arrive as placeholders now and are replaced by Tasks 12–17:

```tsx
import { useState } from "react";
import { LiveRegionProvider } from "./components/LiveRegion";
import "./styles/main.css";

const VIEWS = ["Dashbord", "Pipeline", "Bedrifter", "Eksport"] as const;
export type ViewName = (typeof VIEWS)[number];

export default function App() {
  const [view, setView] = useState<ViewName>("Dashbord");

  return (
    <LiveRegionProvider>
      <nav aria-label="Hovedmeny">
        {VIEWS.map((name) => (
          <button key={name} type="button" onClick={() => setView(name)}
            aria-current={view === name ? "page" : undefined}>
            {name}
          </button>
        ))}
      </nav>
      <main>
        <h1 className="visually-hidden">Hugin</h1>
        {view === "Dashbord" && <p>Dashbord kommer.</p>}
        {view === "Pipeline" && <p>Pipeline kommer.</p>}
        {view === "Bedrifter" && <p>Bedrifter kommer.</p>}
        {view === "Eksport" && <p>Eksport kommer.</p>}
      </main>
    </LiveRegionProvider>
  );
}
```

- [ ] **Step 1: Write the failing tests** — `api.test.ts`: stub `fetch` (`vi.stubGlobal`) and assert (a) `api.post` sends `X-Hugin: 1`, (b) a 403 JSON problem becomes `ApiError` with the bokmål title, (c) 204 resolves undefined. `App.test.tsx`: render, assert nav has 4 buttons, `Dashbord` has `aria-current="page"`, clicking `Pipeline` moves `aria-current`. `ConfirmDialog.test.tsx`: renders with `open`, confirm fires `onConfirm`, Avbryt fires `onCancel`. (jsdom lacks `HTMLDialogElement.showModal` — polyfill in `test-setup.ts`: assign minimal `showModal`/`close` mocks on the prototype that toggle the `open` attribute.)

- [ ] **Step 2: Run → FAIL (`npm test`). Step 3: Implement the files above (delete `smoke.test.ts`). Step 4: `npm test` → green. Also `npm run build` still succeeds.**

- [ ] **Step 5: Commit** — `feat: hugin-web data layer and app shell — typed api client, live region, dialog, nav`

---

### Task 12: Dashboard — sync header (status, Synk nå, polling, linkouts)

**Files:**
- Create: `hugin-web/src/views/dashboard/SyncHeader.tsx`, `hugin-web/src/views/dashboard/DashboardView.tsx`
- Modify: `hugin-web/src/App.tsx` (mount DashboardView)
- Test: `hugin-web/src/views/dashboard/SyncHeader.test.tsx`

**Interfaces:**
- `SyncHeader` props: `{ onSyncCompleted: () => void }` — DashboardView passes a callback that bumps a `refreshKey` state; **every data-fetching child of DashboardView refetches when `refreshKey` changes** (they take it as a prop and list it in their effect deps). Tasks 13–14 rely on this exact mechanism.
- Behavior: on mount, fetch `/api/status` (render last-sync times, counts, linkouts with `rel="noopener noreferrer" target="_blank"`) and `/api/sync/status`. While `running`, poll `/api/sync/status` every 2s; on the transition running→finished, call `onSyncCompleted()`, re-fetch `/api/status`, and announce via `useAnnounce`: success `"Synk ferdig."`, partial `"Synk delvis feilet: …"` (include the failed source's error), both-failed `"Synk feilet: …"`. "Synk nå" button POSTs `/api/sync`; a 409 is not an error — announce `"En synk kjører allerede."` and start polling.

- [ ] **Step 1: Failing tests** (`SyncHeader.test.tsx`, fake timers + stubbed fetch): (a) renders linkouts from status; (b) clicking "Synk nå" POSTs and starts polling; (c) when the polled status flips to finished, `onSyncCompleted` fires once and the live region receives "Synk ferdig."; (d) partial failure announces the error text and renders a warning banner with the same text (`role="status"` element — visible, not just the live region).

- [ ] **Step 2: Run → FAIL. Step 3: Implement.** Component outline:

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../api";
import type { StatusDto, SyncRunStatus } from "../../types";
import { useAnnounce } from "../../components/LiveRegion";

export function SyncHeader({ onSyncCompleted }: { onSyncCompleted: () => void }) {
  const [status, setStatus] = useState<StatusDto | null>(null);
  const [sync, setSync] = useState<SyncRunStatus | null>(null);
  const announce = useAnnounce();
  const wasRunning = useRef(false);

  const loadStatus = useCallback(() => { api.get<StatusDto>("/api/status").then(setStatus).catch(() => {}); }, []);

  useEffect(loadStatus, [loadStatus]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const poll = async () => {
      const s = await api.get<SyncRunStatus>("/api/sync/status").catch(() => null);
      if (!s) return;
      setSync(s);
      if (wasRunning.current && !s.running) {
        wasRunning.current = false;
        clearInterval(timer);
        const failed = [s.brreg, s.nav].filter((r) => r && !r.succeeded);
        announce(failed.length === 2 ? `Synk feilet: ${failed[0]?.error}`
          : failed.length === 1 ? `Synk delvis feilet: ${failed[0]?.error}`
          : "Synk ferdig.");
        loadStatus();
        onSyncCompleted();
      }
      if (s.running) wasRunning.current = true;
    };
    poll();
    timer = setInterval(poll, 2000);
    return () => clearInterval(timer);
  }, [announce, loadStatus, onSyncCompleted]);

  const startSync = async () => {
    try { await api.post("/api/sync"); }
    catch { announce("En synk kjører allerede."); }
    wasRunning.current = true;
  };
  // render: last-sync per source, counts, Synk nå button (disabled while running,
  // with a spinner span + text "synker …"), linkouts list, and when the last run
  // had a failed source: <p role="status" className="advarsel">…same text…</p>
}
```

Fill in the JSX per the render comment (all text bokmål). `DashboardView` for now: `SyncHeader` + `refreshKey` state + the three placeholder sections Tasks 13–14 replace.

- [ ] **Step 4: `npm test` green. Step 5: Commit** — `feat: dashboard sync header — status, polling, announcements, linkouts`

---

### Task 13: Dashboard — Frister list, Trenger handling, Skjul/Vis skjulte

**Files:**
- Create: `hugin-web/src/views/dashboard/FristerList.tsx`, `hugin-web/src/views/dashboard/TrengerHandling.tsx`
- Modify: `hugin-web/src/views/dashboard/DashboardView.tsx`
- Test: `hugin-web/src/views/dashboard/FristerList.test.tsx`, `TrengerHandling.test.tsx`

**Interfaces:**
- Both components take `{ refreshKey: number }` and fetch `/api/ads` (FristerList adds `?hidden=true` when its "Vis skjulte" checkbox is on).
- `TrengerHandling`: filters ads where `pipelineStatus === "funnet" && daysLeft !== null && daysLeft <= 7`, renders a callout list ("funnet, ikke søkt — frist om N dager"). Empty → renders nothing.
- `FristerList` rows: title (link to `sourceUrl`, `target="_blank" rel="noopener noreferrer"`), employer, frist date + `daysLeft` text ("i dag" for 0, "N dager" otherwise, "ingen frist" for null), category, pipeline badge (slug label), Skjul button (`POST /api/ads/{id}/hide`) / Angre skjul (`DELETE`) on hidden rows when visible. Urgency classes: `frist-rod` when `daysLeft ≤ 3`, `frist-gul` when `≤ 7` — on the days-left text span, number always printed.
- **Focus rule (spec):** after Skjul removes a row, move focus to the next row's Skjul button, or to the list heading (`tabIndex={-1}` on the `<h2>`) when the list emptied; announce `"Annonsen er skjult."` / `"Annonsen vises igjen."` via `useAnnounce`.

- [ ] **Step 1: Failing tests:** (a) sort comes from the API — render preserves order and prints "ingen frist" last-row text; (b) urgency class + always-printed number for daysLeft 2 / 5 / 12; (c) Skjul click calls POST, removes the row, focus lands on the next row's Skjul button, announcement fired; (d) "Vis skjulte" refetches with `hidden=true` and shows Angre skjul; (e) TrengerHandling shows only funnet-with-near-frist entries and renders nothing when none.

- [ ] **Step 2: Run → FAIL. Step 3: Implement** (pessimistic writes: await the POST, then refetch the list; focus via `ref` map keyed by feedId, applied in a `useEffect` after the refetched list renders — capture "the feedId after the hidden one" before the POST). 

- [ ] **Step 4: `npm test` green. Step 5: Commit** — `feat: dashboard frister and trenger-handling — urgency, hide/unhide with focus rules`

---

### Task 14: Dashboard — Nytt siden sist + Merk som sett

**Files:**
- Create: `hugin-web/src/views/dashboard/NyttSidenSist.tsx`
- Modify: `hugin-web/src/views/dashboard/DashboardView.tsx` (mount; final composition: SyncHeader → TrengerHandling → FristerList → NyttSidenSist)
- Test: `hugin-web/src/views/dashboard/NyttSidenSist.test.tsx`

**Interfaces:**
- Props `{ refreshKey: number }`. Fetches `/api/new`. 204 → render "Ingen sync er kjørt ennå — trykk Synk nå." Otherwise: new companies (grouped list) and new ads, plus "Merk som sett" button.
- "Merk som sett" opens `ConfirmDialog` ("Merket flyttes — dette kan ikke angres."); confirm → `POST /api/seen` with `{ asOf }` **from the fetched `NewDto`** (never a client clock), then refetch, announce `"Merket som sett."`, and move focus to the section heading (`tabIndex={-1}`).

- [ ] **Step 1: Failing tests:** (a) 204 renders the empty-state text; (b) confirm flow POSTs the exact `asOf` string from the stubbed response body; (c) cancel POSTs nothing; (d) after confirm, announcement + focus on heading.
- [ ] **Step 2: Run → FAIL. Step 3: Implement. Step 4: green. Step 5: Commit** — `feat: nytt-siden-sist with asOf-anchored merk-som-sett`

---

### Task 15: Pipeline view

**Files:**
- Create: `hugin-web/src/views/PipelineView.tsx`
- Modify: `hugin-web/src/App.tsx` (mount)
- Test: `hugin-web/src/views/PipelineView.test.tsx`

**Interfaces:**
- Fetches `/api/pipeline`, groups client-side by `status` into four sections in order: Funnet / Søkt selv / Bedt GET sjekke / Svar (section headings exactly those labels). Under the Funnet heading, a muted hint: `"Funnet-oppføringer tas aldri med i eksporten."`
- Each entry renders company name + a "Rediger" button toggling an inline `<form>`: status `<select>` (the four slugs with bokmål labels), `why` textarea, `note` input, `svar` input. Submit → `PUT /api/pipeline/{orgnr}` with `TrackRequest` shape `{ status, why, note, svar }`; on response, refetch, announce `"Lagret."`, and if `warning` is non-null render it inline with the `⚠` prefix (`role="status"`). Empty `why` on a beyond-funnet entry shows the same `⚠ mangler begrunnelse` marker in the read view (mirror of the export flag).
- Fetch errors render inline with a "Prøv igjen" button (the App-wide pattern from the spec: no vanishing toasts).

- [ ] **Step 1: Failing tests:** (a) grouping into the four sections with correct membership; (b) `⚠ mangler begrunnelse` visible for a beyond-funnet entry with empty why; (c) edit-submit PUTs the right body and announces "Lagret."; (d) a `warning` in the response renders with `⚠`; (e) funnet-hint text present.
- [ ] **Step 2: Run → FAIL. Step 3: Implement. Step 4: green. Step 5: Commit** — `feat: pipeline view with inline editing and why-warnings`

---

### Task 16: Bedrifter view + company detail with ad history

**Files:**
- Create: `hugin-web/src/views/BedrifterView.tsx`, `hugin-web/src/views/CompanyDetail.tsx`
- Modify: `hugin-web/src/App.tsx` (mount)
- Test: `hugin-web/src/views/BedrifterView.test.tsx`

**Interfaces:**
- `BedrifterView`: fetches `/api/companies` once (client-side filter is fine at this scale); kommune `<select>` (options = distinct kommune values from the data), name search `<input type="search">` (case-insensitive substring). Rows: name (+ `[avdeling]` when `isBranch`), kommune, website link (`target="_blank" rel="noopener noreferrer"`). Row is a `<button>` opening `CompanyDetail` for that orgnr.
- `CompanyDetail`: props `{ orgnr: string; onClose: () => void }`; fetches `/api/companies/{orgnr}`; renders company facts + **Annonsehistorikk**: all ads, active and expired — `[utgått]` marker when `isActive` is false (the field is on `AdDto` since Task 5; `AdDto.FromAd` carries the real `Ad.IsActive`). Each row: title, published date, frist, NAV link. Back button (`"Tilbake"`) calls `onClose`, focus returns to the row that opened it (pass the trigger ref or refocus by orgnr after close).

- [ ] **Step 1: Failing tests:** (a) search filters by substring case-insensitively; (b) kommune select filters; (c) clicking a row fetches detail and shows Annonsehistorikk with `[utgått]` on inactive ads; (d) Tilbake returns to the list and focus lands back on the opening row.
- [ ] **Step 2: Run → FAIL. Step 3: Implement. Step 4: green. Step 5: Commit** — `feat: bedrifter browser with ad history detail`

---

### Task 17: Eksport view

**Files:**
- Create: `hugin-web/src/views/EksportView.tsx`
- Modify: `hugin-web/src/App.tsx` (mount — all four placeholders now gone)
- Test: `hugin-web/src/views/EksportView.test.tsx`

**Interfaces:**
- Since-date `<input type="date">` defaulting to 7 days ago; fetches `/api/export?since=` (the api client returns text for non-JSON). Renders the markdown **raw inside `<pre>`** (spec: no markdown→HTML rendering — third-party input, no-library rule). "Kopier" button → `navigator.clipboard.writeText(markdown)`, announce `"Kopiert til utklippstavlen."`; clipboard failure announces `"Kunne ikke kopiere — merk teksten manuelt."` (no throw).

- [ ] **Step 1: Failing tests:** (a) fetched markdown lands verbatim in a `<pre>` (assert an ad-title with `<script>` in it renders as text, not as an element); (b) date change refetches with the `since` param; (c) Kopier writes the exact text and announces.
- [ ] **Step 2: Run → FAIL. Step 3: Implement. Step 4: green. Step 5: Commit** — `feat: eksport view — raw preparelogg markdown with copy`

---

### Task 18: Publish integration, docs, final verification

**Files:**
- Create: `build.ps1` (repo root)
- Modify: `README.md`, `docs/specs/2026-08-19-hugin-phase2-web-design.md` (post-implementation corrections section if any accumulated), `~` project memory notes happen outside the repo
- Test: manual smoke against the real published pair

**Interfaces:** none new — this task proves the seams.

- [ ] **Step 1: Build script**

`build.ps1`:

```powershell
# Builds the dashboard and publishes both hosts side by side into publish\.
$ErrorActionPreference = "Stop"
Push-Location hugin-web
npm run build
Pop-Location
dotnet publish Hugin.Console -c Release -o publish
dotnet publish Hugin.Api -c Release -o publish
Write-Host "publish\hugin.exe og publish\hugin-api.exe deler hugin.json + hugin.db."
```

(Vite already wrote `Hugin.Api/wwwroot`, and `dotnet publish` of a Web SDK project carries `wwwroot` into the output — verify `publish\wwwroot\index.html` exists after running; if the two publishes fight over shared files, publish order above wins because outputs are additive.)

- [ ] **Step 2: Run the script**

Run: `.\build.ps1`
Expected: `publish\hugin.exe`, `publish\hugin-api.exe`, `publish\wwwroot\index.html` all present.

- [ ] **Step 3: Smoke test the real thing (manual, against Malin's live db — READ-ONLY steps only)**

```bash
./publish/hugin-api.exe --port 5111
```

In a browser at `http://localhost:5111`: dashboard renders; auto-sync runs and the header announces completion; Frister shows the known ads (nødnett, Norsk Tipping) with sane daysLeft; pipeline view shows the real entries; eksport preview matches `hugin export` output run side by side. **Do not** click Merk som sett or Skjul against the real db in the smoke test. Then Ctrl+C, run `./publish/hugin.exe list` — CLI still works against the same db (WAL journal files beside it are normal).

- [ ] **Step 4: Full suites one last time**

Run: `dotnet test` and `cd hugin-web && npm test`
Expected: all green. Record both totals for the commit message.

- [ ] **Step 5: README**

Add a "Web dashboard" section: what it is (localhost dashboard over the same db), how to build (`.\build.ps1`), run (`publish\hugin-api.exe`, port 5111, `--port`/`--config` flags), dev loop (`dotnet run --project Hugin.Api` + `npm run dev`), and the security model in two sentences (loopback-only; writes require the dashboard's header). Keep the existing CLI sections untouched. English, no marketing.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: build script, README web section, phase 2 integration verified"
```

---

## Self-review record

Checked against the spec after writing:
- **Spec coverage:** every spec section maps to a task — security model (4), Hidden (3, 13), asOf seen (6, 7, 14), WAL (2), ad history (6, 16), linkouts (12), trenger handling (13), raw export `<pre>` (17), focus/live-region rules (11–14), publish seam (18). Trenger handling is computed client-side from `/api/ads` (the pipeline join is the API-tested part) — deviation from a literal reading of the spec's API-test list, noted deliberately.
- **Type consistency:** `AdDto` carries `IsActive` from Task 5, mirrored in `types.ts` (Task 16 depends on it); `StatusSlug` defined once (Task 5), consumed in 6/7/15; `SyncRunStatus` (8) matches the TS mirror (11); `TrackRequest`/`TrackResponse` (7) match `PipelineView` (15); `refreshKey` mechanism defined in 12, consumed in 13–14.
- **Placeholders:** none — every code step has real code or an exact assertion list.




