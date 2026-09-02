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
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging;

var configPath = ArgValue(args, "--config");
var port = int.TryParse(ArgValue(args, "--port"), out var p) ? p : 5111;

var loaded = ConfigLoader.Load(configPath);
if (loaded.Warning is not null) Console.Error.WriteLine($"Advarsel: {loaded.Warning}");

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

// Loopback in code, not config: a copied launchSettings must never expose the pipeline on LAN.
builder.WebHost.ConfigureKestrel(o => o.Listen(System.Net.IPAddress.Loopback, port));

builder.Logging.SetMinimumLevel(LogLevel.Warning);

builder.Services.AddSingleton(loaded.Config);
builder.Services.AddSingleton(configFile);
builder.Services.AddSingleton<IConfigSource>(configFile);
builder.Services.AddSingleton<IClock, SystemClock>();
builder.Services.AddDbContext<HuginDbContext>(o =>
    o.UseSqlite(HuginDbInitializer.ConnectionString(loaded.DatabasePath)));

builder.Services.AddScoped<ICompanyRepository, EfCompanyRepository>();
builder.Services.AddScoped<IAdRepository, EfAdRepository>();
builder.Services.AddScoped<IPipelineRepository, EfPipelineRepository>();
builder.Services.AddScoped<ISyncStateRepository, EfSyncStateRepository>();
builder.Services.AddScoped<IReviewMarkRepository, EfReviewMarkRepository>();
builder.Services.AddScoped<IKommuneRepository, EfKommuneRepository>();
builder.Services.AddScoped<ISourceRepository, EfSourceRepository>();

builder.Services.AddSingleton<IBrregClient>(sp =>
    new BrregClient(new HttpClient { BaseAddress = new Uri(BrregClient.BaseAddress) },
        sp.GetRequiredService<ILogger<BrregClient>>()));
builder.Services.AddSingleton<INavFeedClient>(_ =>
{
    var http = new HttpClient { BaseAddress = new Uri(NavFeedClient.BaseAddress) };
    // The token is the one config value that stays a startup snapshot (not part of the v3.4 UI).
    return new NavFeedClient(http, new NavTokenProvider(http, loaded.Config.NavToken));
});
builder.Services.AddSingleton<IWebsiteProber>(_ => new WebsiteProber(WebsiteProber.CreateHttpClient()));

builder.Services.AddScoped<SyncService>();
builder.Services.AddScoped<NewItemsService>();
builder.Services.AddScoped<PipelineService>();
builder.Services.AddScoped<AdOverviewService>();
builder.Services.AddScoped<ExtractService>();
builder.Services.AddScoped<KommuneRegister>();

builder.Services.AddSingleton<SyncRunner>();
builder.Services.AddSingleton<BootSyncGate>();
builder.Services.AddHostedService<StartupSync>();

var app = builder.Build();

await using (var scope = app.Services.CreateAsyncScope())
{
    var services = scope.ServiceProvider;
    // DI-resolved (not the outer locals) so a test host can point config + db at its own temp dir.
    var file = services.GetRequiredService<HuginConfigFile>();

    // Fresh install = no db on disk BEFORE InitAsync creates it: hold the boot sync for first-run.
    if (!File.Exists(file.DatabasePath)) services.GetRequiredService<BootSyncGate>().Hold();

    await HuginDbInitializer.InitAsync(services.GetRequiredService<HuginDbContext>(), file.DatabasePath,
        services.GetRequiredService<HuginConfig>(), services.GetRequiredService<IClock>().UtcNow);
}

app.UseHuginSecurity();

// Physical wwwroot (a normal `dotnet publish`, or dev after `npm run build`) wins when present;
// otherwise fall back to the frontend embedded into this assembly at publish time (the
// single-file exe, which has no physical wwwroot beside it at all). UseDefaultFiles/UseStaticFiles
// both resolve IWebHostEnvironment.WebRootFileProvider synchronously right here, at startup — so
// this must run before those two calls, not lazily inside a request.
//
// Set explicitly in BOTH branches rather than leaving the physical case to ASP.NET Core's default:
// Microsoft.NET.Sdk.Web's "static web assets" dev convenience wraps the default WebRootFileProvider
// in a CompositeFileProvider that resolves wwwroot/* back to this PROJECT'S OWN SOURCE TREE
// (Hugin.Api\wwwroot on the machine that built it) ahead of the content-root-relative physical
// folder — harmless for the real beside-the-exe deployment (no such manifest ships with a publish),
// but it silently defeats the ASPNETCORE_CONTENTROOT-based content-root override the test suite
// uses to point at a temp wwwroot. A plain PhysicalFileProvider anchored at wwwrootPhysicalPath
// sidesteps that composite entirely and keeps the beside-the-exe rule exact.
var wwwrootPhysicalPath = Path.Combine(app.Environment.ContentRootPath, "wwwroot");
app.Environment.WebRootFileProvider = Directory.Exists(wwwrootPhysicalPath)
    ? new PhysicalFileProvider(wwwrootPhysicalPath)
    : new ManifestEmbeddedFileProvider(typeof(Program).Assembly, "wwwroot");

app.UseDefaultFiles();
app.UseStaticFiles();

app.MapAds();
app.MapReads();
app.MapWrites();
app.MapSync();
app.MapSources();
app.MapConfig();

// SPA fallback — but /api stays API-shaped: an unknown endpoint is a 404 there, never index.html.
app.MapFallback(async context =>
{
    if (context.Request.Path.StartsWithSegments("/api"))
    {
        context.Response.StatusCode = StatusCodes.Status404NotFound;
        return;
    }

    // Goes through the same IFileProvider as UseStaticFiles above (physical or embedded) rather
    // than a hardcoded physical path, so the SPA fallback works from inside the single-file exe too.
    var index = app.Environment.WebRootFileProvider.GetFileInfo("index.html");
    if (index.Exists)
    {
        context.Response.ContentType = "text/html";
        context.Response.ContentLength = index.Length;
        await using var stream = index.CreateReadStream();
        await stream.CopyToAsync(context.Response.Body);
    }
    else
    {
        context.Response.StatusCode = StatusCodes.Status404NotFound; // API-only dev host
    }
});

// One double-click is the whole start-up: open the dashboard in the default browser once the
// host is listening. Every test host sets hugin:openbrowser=false (ApiFactory, and
// RealHostBindingTests via env var), so tests never pop a browser; --no-browser opts out for people.
var openBrowser = Array.IndexOf(args, "--no-browser") < 0
    && app.Configuration["hugin:openbrowser"] != "false";

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
