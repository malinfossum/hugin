using System.Net;
using System.Net.Http.Json;
using Hugin.Api;
using Hugin.Api.Services;
using Hugin.Core.Abstractions;
using Hugin.Core.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Hugin.Tests.Api;

[TestFixture]
public sealed class BootSyncTests
{
    [Test]
    public async Task Fresh_install_holds_the_boot_sync_until_first_run_is_dismissed()
    {
        using var factory = new ApiFactory(autosync: true);
        using var client = factory.CreateApiClient();

        await Task.Delay(300);
        var held = await client.GetFromJsonAsync<SyncRunStatus>("/api/sync/status");
        Assert.That(held!.Running, Is.False);
        Assert.That(held.FinishedUtc, Is.Null, "no sync may run before the first-run dialog resolves");

        var dismiss = await client.PostAsync("/api/first-run-dismissed", null);
        Assert.That(dismiss.StatusCode, Is.EqualTo(HttpStatusCode.NoContent));

        var status = await SyncEndpointTests.PollUntilFinished(client);
        Assert.That(status.Brreg!.Succeeded, Is.True, "dismiss releases the hold with config defaults");
    }

    [Test]
    public async Task Existing_install_syncs_on_boot_immediately()
    {
        using var factory = new ApiFactory(autosync: true, existingDb: true);
        using var client = factory.CreateApiClient();

        var status = await SyncEndpointTests.PollUntilFinished(client);

        Assert.That(status.FinishedUtc, Is.Not.Null);
    }

    [Test]
    public async Task Dismiss_on_an_existing_install_does_not_start_a_second_sync()
    {
        using var factory = new ApiFactory(autosync: true, existingDb: true);
        using var client = factory.CreateApiClient();
        var first = await SyncEndpointTests.PollUntilFinished(client);

        var dismiss = await client.PostAsync("/api/first-run-dismissed", null);
        await Task.Delay(300);
        var after = await client.GetFromJsonAsync<SyncRunStatus>("/api/sync/status");

        Assert.That(dismiss.StatusCode, Is.EqualTo(HttpStatusCode.NoContent));
        Assert.That(after!.StartedUtc, Is.EqualTo(first.StartedUtc), "nothing was held, so nothing is released");
    }

    [Test]
    public async Task Dismiss_needs_the_write_header()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient(); // no X-Hugin

        var response = await client.PostAsync("/api/first-run-dismissed", null);

        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.Forbidden));
    }

    [Test]
    public async Task Saving_discovery_releases_the_hold_without_starting_a_sync_itself()
    {
        using var factory = new ApiFactory(autosync: true);
        factory.Brreg.Kommuner.Add(new Kommune { Number = "3909", Name = "Larvik" });
        using var client = factory.CreateApiClient();

        var put = await client.PutAsJsonAsync("/api/config/discovery", new DiscoveryWriteRequest(["3909"], [], false));
        Assert.That(put.StatusCode, Is.EqualTo(HttpStatusCode.OK));

        await Task.Delay(300);
        var status = await client.GetFromJsonAsync<SyncRunStatus>("/api/sync/status");
        Assert.That(status!.FinishedUtc, Is.Null, "the dashboard starts the sync — the PUT only lifts the hold");

        var start = await client.PostAsync("/api/sync", null);
        Assert.That(start.StatusCode, Is.EqualTo(HttpStatusCode.Accepted), "no 409 — nothing else is running");
        var finished = await SyncEndpointTests.PollUntilFinished(client);
        Assert.That(finished.Brreg!.Succeeded, Is.True);
    }

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

    [Test]
    public async Task Public_mode_seeds_the_pipeline_and_writes_the_snapshot_after_the_boot_sync()
    {
        using var factory = new ApiFactory(autosync: true, publicMode: true);
        factory.Brreg.Companies.Add(new RegisterCompany("922425620", "TRETOEN AS", "3403", "62.100", null, false, null));
        // StateDir itself isn't created until ConfigureWebHost runs (lazily, on the first
        // CreateClient() call below) — create it now so the seed file is in place before boot.
        Directory.CreateDirectory(factory.StateDir);
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

    /// <summary>Important 1 fix: seeder + copy-back run in their own try in SyncRunner, so a
    /// throw from the sync scope itself must not also cost the demo its persisted snapshot —
    /// and must not be mislabelled as coming from the seeder/copy step. IKommuneRepository's
    /// GetAllAsync is the one unguarded call inside SyncService.SyncAsync (used to build the
    /// scope before either source runs), so swapping it for one that throws reproduces exactly
    /// the "sync throws" scenario without touching SyncService itself.</summary>
    [Test]
    public async Task Public_mode_still_writes_the_snapshot_when_the_sync_itself_throws()
    {
        using var factory = new ApiFactory(autosync: true, publicMode: true); // no db on disk
        using var throwingFactory = factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll(typeof(IKommuneRepository));
            services.AddScoped<IKommuneRepository, ThrowingKommuneRepository>();
        }));
        using var client = throwingFactory.CreateClient();

        var status = await SyncEndpointTests.PollUntilFinished(client);
        Assert.That(status.Brreg!.Succeeded, Is.False, "the sync scope threw before either source ran");

        var snapshotPath = Path.Combine(factory.StateDir, "hugin.db");
        await WaitForFileAsync(snapshotPath);
    }

    private sealed class ThrowingKommuneRepository : IKommuneRepository
    {
        public Task<IReadOnlyDictionary<string, string>> GetAllAsync(CancellationToken ct = default) =>
            throw new InvalidOperationException("kommuneregisteret utilgjengelig (test)");

        public Task UpsertManyAsync(IReadOnlyList<Kommune> kommuner, CancellationToken ct = default) =>
            Task.CompletedTask;
    }

    private static async Task WaitForFileAsync(string path)
    {
        for (var i = 0; i < 50 && !File.Exists(path); i++) await Task.Delay(100);
        Assert.That(File.Exists(path), Is.True, $"snapshot never appeared at {path}");
    }
}
