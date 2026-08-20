using Hugin.Core.Abstractions;
using Hugin.Core.Config;
using Hugin.Infrastructure.Data;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
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
        try { File.Delete(_dbPath); } catch (IOException) { }
    }
}
