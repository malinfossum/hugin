using System.Net;
using Hugin.Core.Abstractions;
using Hugin.Core.Config;
using Hugin.Infrastructure.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.FileProviders;

namespace Hugin.Tests.Api;

/// <summary>
/// Dedicated factory pointing content root at a temp dir with a marker wwwroot/index.html —
/// the shared ApiFactory stays untouched because no other suite needs a fake frontend build.
///
/// Program.cs anchors content root to AppContext.BaseDirectory (the beside-the-exe rule, so a
/// published exe finds wwwroot regardless of launch CWD) via an explicit
/// WebApplicationOptions.ContentRootPath. That's set once, directly on the environment, before
/// WebApplicationFactory gets a chance to intercept via ConfigureWebHost/UseSetting — by the time
/// that callback runs, ContentRootPath is already fixed and no longer config-driven, so
/// UseSetting("contentRoot", ...) is silently ignored (verified empirically). The one thing that
/// still reaches Program.cs before it decides the content root is a real process environment
/// variable, which Program.cs already treats as the standard override (ASPNETCORE_CONTENTROOT) —
/// so that's the lever this factory pulls instead.
/// </summary>
public sealed class StaticServingFactory : WebApplicationFactory<Program>
{
    public const string Marker = "<!-- hugin-static-serving-marker -->";

    private const string ContentRootEnvVar = "ASPNETCORE_CONTENTROOT";

    private readonly string _tempDir =
        Path.Combine(Path.GetTempPath(), $"hugin-static-{Guid.NewGuid():N}");
    private readonly string _dbPath =
        Path.Combine(Path.GetTempPath(), $"hugin-static-db-{Guid.NewGuid():N}.db");

    public StaticServingFactory()
    {
        Directory.CreateDirectory(Path.Combine(_tempDir, "wwwroot"));
        File.WriteAllText(Path.Combine(_tempDir, "wwwroot", "index.html"), Marker);

        // Must be set before the host is first built (lazily, on CreateClient()/Services access) —
        // NUnit runs fixtures in this project sequentially (no [Parallelizable]), so this process-
        // wide variable is safely scoped to this factory's lifetime: set here, cleared in Dispose.
        Environment.SetEnvironmentVariable(ContentRootEnvVar, _tempDir);
    }

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
            services.AddSingleton<IBrregClient>(new FakeBrregClient());
            services.AddSingleton<INavFeedClient>(new FakeNavFeedClient());

            services.RemoveAll(typeof(HuginConfig));
            services.AddSingleton(new HuginConfig());
        });
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        Environment.SetEnvironmentVariable(ContentRootEnvVar, null);
        SqliteConnection.ClearAllPools();
        try { File.Delete(_dbPath); } catch (IOException) { }
        try { Directory.Delete(_tempDir, recursive: true); } catch (IOException) { }
    }
}

[TestFixture]
public sealed class StaticServingTests
{
    private StaticServingFactory _factory = null!;
    private HttpClient _client = null!;

    [OneTimeSetUp]
    public void Up()
    {
        _factory = new StaticServingFactory();
        _client = _factory.CreateClient();
    }

    [OneTimeTearDown]
    public void Down()
    {
        _client.Dispose();
        _factory.Dispose();
    }

    [Test]
    public async Task Root_serves_the_marker_index()
    {
        var response = await _client.GetAsync("/");
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.OK));
        Assert.That(await response.Content.ReadAsStringAsync(), Does.Contain(StaticServingFactory.Marker));
    }

    [Test]
    public async Task Unknown_non_api_path_falls_back_to_the_marker_index()
    {
        var response = await _client.GetAsync("/noe-annet");
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.OK));
        Assert.That(await response.Content.ReadAsStringAsync(), Does.Contain(StaticServingFactory.Marker));
    }

    [Test]
    public async Task Unknown_api_path_is_404_not_the_fallback_page()
    {
        var response = await _client.GetAsync("/api/finnes-ikke");
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.NotFound));
        Assert.That(response.Content.Headers.ContentType?.MediaType, Is.Not.EqualTo("text/html"));
        Assert.That(await response.Content.ReadAsStringAsync(), Does.Not.Contain(StaticServingFactory.Marker));
    }
}

/// <summary>
/// Points content root at a temp dir with NO wwwroot subfolder at all — forces Program.cs into the
/// embedded-frontend branch (ManifestEmbeddedFileProvider) instead of the physical-folder one
/// StaticServingFactory above exercises. Same env-var lever as StaticServingFactory; see its doc
/// comment for why.
/// </summary>
public sealed class EmbeddedServingFactory : WebApplicationFactory<Program>
{
    private const string ContentRootEnvVar = "ASPNETCORE_CONTENTROOT";

    private readonly string _tempDir =
        Path.Combine(Path.GetTempPath(), $"hugin-embedded-{Guid.NewGuid():N}");
    private readonly string _dbPath =
        Path.Combine(Path.GetTempPath(), $"hugin-embedded-db-{Guid.NewGuid():N}.db");

    public EmbeddedServingFactory()
    {
        Directory.CreateDirectory(_tempDir); // deliberately no "wwwroot" subfolder underneath
        Environment.SetEnvironmentVariable(ContentRootEnvVar, _tempDir);
    }

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
            services.AddSingleton<IBrregClient>(new FakeBrregClient());
            services.AddSingleton<INavFeedClient>(new FakeNavFeedClient());

            services.RemoveAll(typeof(HuginConfig));
            services.AddSingleton(new HuginConfig());
        });
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        Environment.SetEnvironmentVariable(ContentRootEnvVar, null);
        SqliteConnection.ClearAllPools();
        try { File.Delete(_dbPath); } catch (IOException) { }
        try { Directory.Delete(_tempDir, recursive: true); } catch (IOException) { }
    }
}

/// <summary>
/// Exercises the embedded-frontend branch end-to-end — but only when this test run's Hugin.Api
/// build actually has a frontend embedded. Hugin.Api.csproj embeds wwwroot conditionally on
/// `Exists('wwwroot')` at build time, so an API-only dev build (no `npm run build` yet) has nothing
/// embedded to serve. Forcing that precondition from here would mean either running the frontend
/// build as a `dotnet test` dependency (couples the .NET suite to node tooling) or shipping a fake
/// embedded resource the real csproj doesn't carry — both worse than a clean, self-documenting
/// skip. When wwwroot IS present (as it normally is on Malin's machine after `.\build.ps1` or
/// `npm run build`), this runs for real and proves the whole path; the task 6 smoke step
/// additionally verifies it against the actual single-file publish.
/// </summary>
[TestFixture]
public sealed class EmbeddedServingTests
{
    private EmbeddedServingFactory? _factory;
    private HttpClient? _client;
    private bool _embeddedFrontendPresent;

    [OneTimeSetUp]
    public void Up()
    {
        _embeddedFrontendPresent = new ManifestEmbeddedFileProvider(typeof(Program).Assembly, "wwwroot")
            .GetFileInfo("index.html").Exists;
        if (!_embeddedFrontendPresent) return;

        _factory = new EmbeddedServingFactory();
        _client = _factory.CreateClient();
    }

    [OneTimeTearDown]
    public void Down()
    {
        _client?.Dispose();
        _factory?.Dispose();
    }

    private void SkipIfNothingEmbedded()
    {
        if (_embeddedFrontendPresent) return;
        Assert.Ignore("This Hugin.Api build has no wwwroot embedded (no `npm run build` yet) — " +
            "run `.\\build.ps1` to exercise the embedded branch. See EmbeddedServingTests' doc " +
            "comment and the task 6 smoke step for the full story.");
    }

    [Test]
    public async Task Root_serves_the_embedded_index_when_no_physical_wwwroot_exists()
    {
        SkipIfNothingEmbedded();

        var response = await _client!.GetAsync("/");
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.OK));
        Assert.That(response.Content.Headers.ContentType?.MediaType, Is.EqualTo("text/html"));
    }

    [Test]
    public async Task Unknown_non_api_path_falls_back_to_the_embedded_index()
    {
        SkipIfNothingEmbedded();

        var response = await _client!.GetAsync("/noe-annet");
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.OK));
        Assert.That(response.Content.Headers.ContentType?.MediaType, Is.EqualTo("text/html"));
    }

    [Test]
    public async Task Unknown_api_path_is_still_404_not_the_embedded_fallback()
    {
        SkipIfNothingEmbedded();

        var response = await _client!.GetAsync("/api/finnes-ikke");
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.NotFound));
    }
}
