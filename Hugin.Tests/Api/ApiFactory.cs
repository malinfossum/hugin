using Hugin.Core.Abstractions;
using Hugin.Core.Config;
using Hugin.Infrastructure;
using Hugin.Infrastructure.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Hugin.Tests.Api;

/// <param name="autosync">Let StartupSync run on boot — only the boot-hold tests want that.</param>
/// <param name="existingDb">Pre-create hugin.db so the host sees an existing install, not a fresh one.</param>
public sealed class ApiFactory(bool autosync = false, bool existingDb = false) : WebApplicationFactory<Program>
{
    private readonly DirectoryInfo _dir = Directory.CreateTempSubdirectory("hugin-api-");

    public string ConfigPath => Path.Combine(_dir.FullName, "hugin.json");
    public string DbPath => Path.Combine(_dir.FullName, "hugin.db");

    public FakeBrregClient Brreg { get; } = new();
    public FakeNavFeedClient Nav { get; } = new();
    public FakeWebsiteProber Prober { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        // A 0-byte file is a valid empty SQLite database; InitAsync migrates it like any other.
        if (existingDb && !File.Exists(DbPath)) File.WriteAllBytes(DbPath, []);

        builder.UseSetting("hugin:autosync", autosync ? "true" : "false");
        builder.UseSetting("hugin:openbrowser", "false"); // never pop a browser from a test host
        builder.ConfigureServices(services =>
        {
            services.RemoveAll(typeof(DbContextOptions<HuginDbContext>));
            services.AddDbContext<HuginDbContext>(o =>
                o.UseSqlite(HuginDbInitializer.ConnectionString(DbPath)));

            // Config file beside the test db, so the fresh-install detection and the discovery
            // endpoints both work against this factory's own temp directory.
            var configFile = new HuginConfigFile(ConfigPath);
            services.RemoveAll(typeof(HuginConfigFile));
            services.RemoveAll(typeof(IConfigSource));
            services.AddSingleton(configFile);
            services.AddSingleton<IConfigSource>(configFile);

            services.RemoveAll(typeof(IBrregClient));
            services.RemoveAll(typeof(INavFeedClient));
            services.RemoveAll(typeof(IWebsiteProber));
            services.AddSingleton<IBrregClient>(Brreg);
            services.AddSingleton<INavFeedClient>(Nav);
            services.AddSingleton<IWebsiteProber>(Prober);

            // Otherwise-default config, but with one linkout so /api/status's passthrough is observable.
            services.RemoveAll(typeof(HuginConfig));
            services.AddSingleton(new HuginConfig
            {
                Linkouts = [new Linkout("Finn.no", "https://finn.no")],
            });
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
        try { _dir.Delete(recursive: true); } catch (IOException) { }
    }
}
