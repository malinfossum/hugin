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

builder.Logging.SetMinimumLevel(LogLevel.Warning);

builder.Services.AddSingleton(loaded.Config);
builder.Services.AddSingleton(configFile);
builder.Services.AddSingleton<IConfigSource>(configFile);
builder.Services.AddSingleton<IClock, SystemClock>();
builder.Services.AddDbContext<HuginDbContext>(o =>
    o.UseSqlite(HuginDbInitializer.ConnectionString(databasePath)));

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
    var mode = services.GetRequiredService<PublicModeOptions>();
    var dbPath = mode.Enabled ? mode.WorkingDbPath : file.DatabasePath;

    // Fresh install = no db on disk BEFORE InitAsync creates it: hold the boot sync for first-run.
    // Never in public mode — there is no first-run dialog for a visitor to resolve (spec A5).
    if (!mode.Enabled && !File.Exists(dbPath)) services.GetRequiredService<BootSyncGate>().Hold();

    await HuginDbInitializer.InitAsync(services.GetRequiredService<HuginDbContext>(), dbPath,
        services.GetRequiredService<HuginConfig>(), services.GetRequiredService<IClock>().UtcNow);
}

app.UseHuginSecurity(app.Services.GetRequiredService<PublicModeOptions>());

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

app.Run();
return 0;

static string? ArgValue(string[] args, string name)
{
    var i = Array.IndexOf(args, name);
    return i >= 0 && i + 1 < args.Length ? args[i + 1] : null;
}

public partial class Program { }
