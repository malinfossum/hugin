using System.Net;
using System.Net.Http.Json;
using Hugin.Api;
using Hugin.Api.Services;
using Hugin.Core.Abstractions;
using Hugin.Core.Config;
using Hugin.Core.Models;
using Hugin.Infrastructure;
using Hugin.Infrastructure.Data;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Hugin.Tests.Api;

[TestFixture]
public sealed class ResetEndpointTests
{
    [Test]
    public async Task Reset_all_wipes_the_data_keeps_the_sources_and_snapshots_first()
    {
        using var factory = new ApiFactory();
        using (var scope = factory.Services.CreateScope())
        {
            var companies = scope.ServiceProvider.GetRequiredService<ICompanyRepository>();
            await companies.UpsertAsync(new RegisterCompany("934161181", "Norkart AS", "3405", "62.100", null, false, null),
                DateTimeOffset.UtcNow);
            var pipeline = scope.ServiceProvider.GetRequiredService<IPipelineRepository>();
            await pipeline.UpsertAsync(new PipelineEntry
            {
                Orgnr = "934161181", Status = PipelineStatus.Active, Why = "fordi",
                Created = DateTimeOffset.UtcNow, Updated = DateTimeOffset.UtcNow,
            });
        }
        using var client = factory.CreateApiClient();

        var response = await client.PostAsJsonAsync("/api/reset", new ResetRequest("all"));
        var result = await response.Content.ReadFromJsonAsync<ResetResultDto>();

        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.OK));
        Assert.That(Path.GetFileName(result!.SnapshotPath)!, Does.StartWith("hugin.db"),
            "the ignore and packaging filters match hugin.db*");
        Assert.That(File.Exists(result.SnapshotPath), Is.True);

        var status = await client.GetFromJsonAsync<StatusDto>("/api/status");
        Assert.That(status!.Companies, Is.Zero);
        Assert.That(status.PipelineEntries, Is.Zero);
        Assert.That(status.ScopeConfigured, Is.False);

        var sources = await client.GetFromJsonAsync<List<SourceDto>>("/api/sources");
        Assert.That(sources, Is.Not.Empty, "the user's own links survive a reset");
    }

    [Test]
    public async Task Reset_scope_keeps_the_data_and_the_bransjer()
    {
        using var factory = new ApiFactory();
        using (var scope = factory.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<ICompanyRepository>()
                .UpsertAsync(new RegisterCompany("934161181", "Norkart AS", "3405", "62.100", null, false, null),
                    DateTimeOffset.UtcNow);
        using var client = factory.CreateApiClient();

        var response = await client.PostAsJsonAsync("/api/reset", new ResetRequest("scope"));
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.OK));
        var result = await response.Content.ReadFromJsonAsync<ResetResultDto>();
        Assert.That(result!.SnapshotPath, Is.Null, "a scope reset never touches the database, so nothing is snapshotted");

        var status = await client.GetFromJsonAsync<StatusDto>("/api/status");
        Assert.That(status!.Companies, Is.EqualTo(1));
        Assert.That(status.ScopeConfigured, Is.False);
        var focus = await client.GetFromJsonAsync<FocusConfigDto>("/api/config/focus");
        Assert.That(focus!.Naeringskoder, Is.Not.Empty);
    }

    [Test]
    public async Task Reset_scope_clears_only_the_three_discovery_keys_and_nothing_else()
    {
        using var factory = new ApiFactory();
        File.WriteAllText(factory.ConfigPath, """
            { "municipalities": [{ "name": "Hamar", "number": "3403" }], "fylker": ["03"], "allOfNorway": false,
              "keywords": ["rust"], "navToken": "abc", "custom": { "a": 1 } }
            """);
        using var client = factory.CreateApiClient();

        var response = await client.PostAsJsonAsync("/api/reset", new ResetRequest("scope"));
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.OK));

        var text = File.ReadAllText(factory.ConfigPath);
        Assert.That(text, Does.Contain("\"rust\"").And.Contain("\"navToken\": \"abc\"").And.Contain("\"custom\""),
            "only the discovery keys are cleared — everything else round-trips");

        var discovery = await client.GetFromJsonAsync<DiscoveryConfigDto>("/api/config/discovery");
        Assert.That(discovery!.Municipalities, Is.Empty);
        Assert.That(discovery.Fylker, Is.Empty);
        Assert.That(discovery.AllOfNorway, Is.False);
    }

    [Test]
    public async Task Reset_returns_409_while_a_sync_is_running()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateApiClient();

        var gate = new TaskCompletionSource();
        factory.Nav.OnCall = () => gate.Task;

        try
        {
            var started = await client.PostAsync("/api/sync", null);
            Assert.That(started.StatusCode, Is.EqualTo(HttpStatusCode.Accepted));

            var response = await client.PostAsJsonAsync("/api/reset", new ResetRequest("all"));
            Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.Conflict));
        }
        finally
        {
            gate.SetResult();
        }

        await SyncEndpointTests.PollUntilFinished(client);
    }

    [Test]
    public async Task Reset_rejects_an_unknown_mode()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateApiClient();

        var response = await client.PostAsJsonAsync("/api/reset", new ResetRequest("everything"));

        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.BadRequest));
    }

    [Test]
    public async Task Reset_needs_the_write_header()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient(); // no X-Hugin

        var response = await client.PostAsJsonAsync("/api/reset", new ResetRequest("scope"));

        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.Forbidden));
    }

    [Test]
    public async Task Reset_is_forbidden_in_public_mode()
    {
        using var factory = new ApiFactory(publicMode: true);
        using var client = factory.CreateApiClient(); // X-Hugin: 1 — irrelevant in public mode

        var response = await client.PostAsJsonAsync("/api/reset", new ResetRequest("all"));

        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.Forbidden));
    }

    [Test]
    public async Task WipeAsync_round_trips_a_database_path_containing_an_apostrophe()
    {
        // VACUUM INTO takes a string literal, not a parameter, so an unescaped apostrophe in the
        // path would break the SQL rather than merely fail to match a file — "C:\Users\O'Brien\"
        // is an ordinary Windows path and must not throw.
        var dir = Path.Combine(Path.GetTempPath(), $"hugin-o'brien-{Guid.NewGuid():N}");
        Directory.CreateDirectory(dir);
        var configPath = Path.Combine(dir, "hugin.json");
        var dbPath = Path.Combine(dir, "hugin.db");
        try
        {
            var options = new DbContextOptionsBuilder<HuginDbContext>()
                .UseSqlite(HuginDbInitializer.ConnectionString(dbPath)).Options;
            await using var db = new HuginDbContext(options);
            await HuginDbInitializer.InitAsync(db, dbPath);

            var file = new HuginConfigFile(configPath);
            var service = new ResetService(db, file, new FakeClock(DateTimeOffset.UtcNow));

            var snapshot = await service.WipeAsync();

            Assert.That(File.Exists(snapshot), Is.True);
            Assert.That(snapshot, Does.StartWith(dbPath));
        }
        finally
        {
            SqliteConnection.ClearAllPools();
            Directory.Delete(dir, recursive: true);
        }
    }
}
