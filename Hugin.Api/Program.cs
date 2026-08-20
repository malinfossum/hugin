using Hugin.Api;
using Hugin.Api.Endpoints;
using Hugin.Api.Services;
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

// Beside-the-exe rule (matches ConfigLoader): default content root to the exe's own directory,
// not the launch CWD — a published exe started from elsewhere must still find wwwroot. The
// standard ASPNETCORE_CONTENTROOT env var still wins when set, e.g. for test hosts.
var contentRoot = Environment.GetEnvironmentVariable("ASPNETCORE_CONTENTROOT") ?? AppContext.BaseDirectory;

var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    ContentRootPath = contentRoot,
});

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
builder.Services.AddScoped<IKommuneRepository, EfKommuneRepository>();

builder.Services.AddSingleton<IBrregClient>(_ =>
    new BrregClient(new HttpClient { BaseAddress = new Uri(BrregClient.BaseAddress) }));
builder.Services.AddSingleton<INavFeedClient>(sp =>
{
    var http = new HttpClient { BaseAddress = new Uri(NavFeedClient.BaseAddress) };
    var config = sp.GetRequiredService<HuginConfig>();
    return new NavFeedClient(http, new NavTokenProvider(http, config.NavToken), config);
});
builder.Services.AddSingleton<IWebsiteProber>(_ => new WebsiteProber(WebsiteProber.CreateHttpClient()));

builder.Services.AddScoped<SyncService>();
builder.Services.AddScoped<NewItemsService>();
builder.Services.AddScoped<PipelineService>();
builder.Services.AddScoped<AdOverviewService>();
builder.Services.AddScoped<ExportService>();

builder.Services.AddSingleton<SyncRunner>();
builder.Services.AddHostedService<StartupSync>();

var app = builder.Build();

await using (var scope = app.Services.CreateAsyncScope())
    await HuginDbInitializer.InitAsync(scope.ServiceProvider.GetRequiredService<HuginDbContext>(), loaded.DatabasePath);

app.UseHuginSecurity();

app.UseDefaultFiles();
app.UseStaticFiles();

app.MapAds();
app.MapReads();
app.MapWrites();
app.MapSync();

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

// One double-click is the whole start-up: open the dashboard in the default browser once the
// host is listening. Every test host sets hugin:autosync=false (the RealHostBindingTests
// subprocess included, via env var), so tests never pop a browser; --no-browser opts out.
var openBrowser = Array.IndexOf(args, "--no-browser") < 0
    && app.Configuration["hugin:autosync"] != "false";

app.Lifetime.ApplicationStarted.Register(() =>
{
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

app.Run();

static string? ArgValue(string[] args, string name)
{
    var i = Array.IndexOf(args, name);
    return i >= 0 && i + 1 < args.Length ? args[i + 1] : null;
}

public partial class Program { }
