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

namespace Hugin.Tests.Api;

/// <summary>
/// Dedicated factory pointing content root at a temp dir with a marker wwwroot/index.html —
/// the shared ApiFactory stays untouched because no other suite needs a fake frontend build.
/// </summary>
public sealed class StaticServingFactory : WebApplicationFactory<Program>
{
    public const string Marker = "<!-- hugin-static-serving-marker -->";

    private readonly string _tempDir =
        Path.Combine(Path.GetTempPath(), $"hugin-static-{Guid.NewGuid():N}");
    private readonly string _dbPath =
        Path.Combine(Path.GetTempPath(), $"hugin-static-db-{Guid.NewGuid():N}.db");

    public StaticServingFactory()
    {
        Directory.CreateDirectory(Path.Combine(_tempDir, "wwwroot"));
        File.WriteAllText(Path.Combine(_tempDir, "wwwroot", "index.html"), Marker);
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("contentRoot", _tempDir);
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
