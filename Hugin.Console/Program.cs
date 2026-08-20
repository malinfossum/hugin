using System.Text;
using Hugin.Core.Abstractions;
using Hugin.Core.Cli;
using Hugin.Core.Config;
using Hugin.Core.Models;
using Hugin.Core.Services;
using Hugin.Infrastructure;
using Hugin.Infrastructure.Data;
using Hugin.Infrastructure.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Hugin.Console;

// This namespace is itself called Hugin.Console, so the bare name Console would bind to the
// namespace rather than the type. The alias must sit inside the namespace to outrank it.
using Console = System.Console;

internal static class Program
{
    private static async Task<int> Main(string[] args)
    {
        // Windows consoles otherwise mangle æ/ø/å and ⚠ into mojibake.
        try
        {
            Console.OutputEncoding = Encoding.UTF8;
        }
        catch (IOException)
        {
            // Output is redirected somewhere that will not take an encoding change; carry on.
        }

        var command = CommandParser.Parse(StripConfigOption(args, out var configPath));

        switch (command)
        {
            case HelpCommand:
                PrintUsage();
                return 0;

            case InvalidCommand invalid:
                Console.Error.WriteLine($"Feil: {invalid.Error}");
                Console.Error.WriteLine();
                PrintUsage();
                return 2;
        }

        var loaded = ConfigLoader.Load(configPath);
        if (loaded.Warning is not null) Console.Error.WriteLine($"Advarsel: {loaded.Warning}");

        using var host = BuildHost(loaded);

        await using (var scope = host.Services.CreateAsyncScope())
        {
            await HuginDbInitializer.InitAsync(scope.ServiceProvider.GetRequiredService<HuginDbContext>());
        }

        await using var runScope = host.Services.CreateAsyncScope();
        var services = runScope.ServiceProvider;

        return command switch
        {
            SyncCommand cmd => await RunSyncAsync(services, cmd),
            NewCommand cmd => await RunNewAsync(services, cmd, loaded.Config),
            TrackCommand cmd => await RunTrackAsync(services, cmd),
            ListCommand cmd => await RunListAsync(services, cmd, loaded.Config),
            ExportCommand cmd => await RunExportAsync(services, cmd),
            _ => 2,
        };
    }

    /// <summary>
    /// --config is a global option rather than a per-command one, so it is pulled out before
    /// the parser sees the arguments.
    /// </summary>
    private static string[] StripConfigOption(string[] args, out string? configPath)
    {
        configPath = null;
        var remaining = new List<string>(args.Length);

        for (var i = 0; i < args.Length; i++)
        {
            if (string.Equals(args[i], "--config", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length)
            {
                configPath = args[++i];
                continue;
            }

            remaining.Add(args[i]);
        }

        return [.. remaining];
    }

    private static IHost BuildHost(LoadedConfig loaded)
    {
        var builder = Host.CreateApplicationBuilder();

        // Logging policy: warnings only, console only. Command output is written directly, so
        // a token or a response body can never reach a log sink.
        builder.Logging.ClearProviders();
        builder.Logging.AddSimpleConsole(o => o.SingleLine = true);
        builder.Logging.SetMinimumLevel(LogLevel.Warning);

        var services = builder.Services;

        services.AddSingleton(loaded.Config);
        services.AddSingleton<IClock, SystemClock>();

        services.AddDbContext<HuginDbContext>(o => o.UseSqlite(HuginDbInitializer.ConnectionString(loaded.DatabasePath)));

        services.AddScoped<ICompanyRepository, EfCompanyRepository>();
        services.AddScoped<IAdRepository, EfAdRepository>();
        services.AddScoped<IPipelineRepository, EfPipelineRepository>();
        services.AddScoped<ISyncStateRepository, EfSyncStateRepository>();
        services.AddScoped<IReviewMarkRepository, EfReviewMarkRepository>();
        services.AddScoped<IKommuneRepository, EfKommuneRepository>();

        services.AddSingleton<IBrregClient>(_ =>
            new BrregClient(new HttpClient { BaseAddress = new Uri(BrregClient.BaseAddress) }));

        services.AddSingleton<INavFeedClient>(sp =>
        {
            var http = new HttpClient { BaseAddress = new Uri(NavFeedClient.BaseAddress) };
            var config = sp.GetRequiredService<HuginConfig>();
            return new NavFeedClient(http, new NavTokenProvider(http, config.NavToken), config);
        });
        services.AddSingleton<IWebsiteProber>(_ => new WebsiteProber(WebsiteProber.CreateHttpClient()));

        services.AddScoped<SyncService>();
        services.AddScoped<NewItemsService>();
        services.AddScoped<PipelineService>();

        return builder.Build();
    }

    private static async Task<int> RunSyncAsync(IServiceProvider services, SyncCommand command)
    {
        if (command.Full)
            Console.WriteLine("Full gjennomgang av NAV-feeden — første gang tar dette noen minutter. "
                + "Avbrytes den, fortsetter neste `hugin sync --full` der den slapp.");

        var summary = await services.GetRequiredService<SyncService>().SyncAsync(
            fullNav: command.Full,
            onNavPage: command.Full
                ? (pages, ads) => { if (pages % 50 == 0) Console.WriteLine($"  nav: {pages} sider lest, {ads} annonser lagret …"); }
        : null);

        Console.WriteLine(Line("brreg", summary.Brreg, "selskaper"));
        Console.WriteLine(Line("nav", summary.Nav, "annonser"));

        if (summary.WebsitesChecked > 0)
            Console.WriteLine($"nettsteder: {summary.WebsitesChecked} sjekket, {summary.WebsitesDead} døde");

        if (summary.BaselineSet)
            Console.WriteLine("Første sync: nullpunktet er satt nå, så `hugin new` starter tomt. "
                + "Bruk `hugin list --companies` for å bla i det som allerede ligger der.");

        if (summary.BothFailed)
        {
            Console.Error.WriteLine("Begge kildene feilet — ingenting ble oppdatert.");
            return 1;
        }

        return 0;

        static string Line(string source, SourceResult result, string unit) =>
            result.Succeeded
                ? $"{source}: {result.Fetched} {unit}"
                : $"{source}: feilet ({result.Error}) — fortsetter med lagrede data";
    }

    private static async Task<int> RunNewAsync(IServiceProvider services, NewCommand command, HuginConfig config)
    {
        var service = services.GetRequiredService<NewItemsService>();
        var items = await service.GetNewAsync();

        if (items is null)
        {
            Console.WriteLine("Ingen sync er kjørt ennå — kjør `hugin sync` først.");
            return 0;
        }

        Console.WriteLine($"Nytt siden {items.Since:yyyy-MM-dd HH:mm} UTC");
        Console.WriteLine();

        Console.WriteLine($"## Nye selskaper ({items.Companies.Count})");
        Console.WriteLine();

        if (items.Companies.Count == 0)
        {
            Console.WriteLine("(ingen)");
            Console.WriteLine();
        }
        else
        {
            foreach (var group in items.Companies.GroupBy(c => c.MunicipalityNumber).OrderBy(g => g.Key))
            {
                Console.WriteLine($"### {MunicipalityName(config, group.Key)} ({group.Count()})");
                foreach (var company in group.OrderBy(c => c.Name))
                    Console.WriteLine($"  {company.Orgnr}  {company.Name}{(company.IsBranch ? "  [avdeling]" : "")}");
                Console.WriteLine();
            }
        }

        Console.WriteLine($"## Nye annonser ({items.Ads.Count})");
        Console.WriteLine();

        if (items.Ads.Count == 0)
        {
            Console.WriteLine("(ingen)");
        }
        else
        {
            foreach (var ad in items.Ads)
            {
                var marker = ad.IsActive ? "" : "  [utgått]";
                var category = ad.Category is null ? "" : $"  [{ad.Category}]";
                Console.WriteLine($"  {ad.Title} — {ad.EmployerName}{category}{marker}");
                if (ad.SourceUrl is not null) Console.WriteLine($"    {ad.SourceUrl}");
            }
        }

        if (config.Linkouts.Count > 0)
        {
            Console.WriteLine();
            Console.WriteLine("## Husk å sjekke manuelt");
            Console.WriteLine();
            foreach (var linkout in config.Linkouts)
                Console.WriteLine($"  {linkout.Label}: {linkout.Url}");
        }

        if (command.MarkSeen)
        {
            await service.MarkSeenAsync();
            Console.WriteLine();
            Console.WriteLine("Merket som sett.");
        }

        return 0;
    }

    private static async Task<int> RunTrackAsync(IServiceProvider services, TrackCommand command)
    {
        try
        {
            var result = await services.GetRequiredService<PipelineService>()
                .TrackAsync(command.Orgnr, command.Status, command.Why, command.Note, command.Svar);

            if (result.CompanyFetchedFromBrreg)
                Console.WriteLine($"Hentet {command.Orgnr} fra Enhetsregisteret.");

            Console.WriteLine($"{result.Entry.Orgnr}: {StatusLabel(result.Entry.Status)}");
            if (!string.IsNullOrWhiteSpace(result.Entry.Why)) Console.WriteLine($"  Grunn: {result.Entry.Why}");
            if (!string.IsNullOrWhiteSpace(result.Entry.Note)) Console.WriteLine($"  Notat: {result.Entry.Note}");
            if (!string.IsNullOrWhiteSpace(result.Entry.SvarText)) Console.WriteLine($"  Svar: {result.Entry.SvarText}");

            if (result.Warning is not null) Console.Error.WriteLine($"⚠ {result.Warning}");

            return 0;
        }
        catch (CompanyNotFoundException ex)
        {
            Console.Error.WriteLine($"Feil: {ex.Message}");
            return 1;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            // Only an unknown orgnr needs the network (the Brreg lookup); a known one never
            // gets here. Offline is an inconvenience, not a crash.
            Console.Error.WriteLine($"Feil: fikk ikke kontakt med Enhetsregisteret ({ex.Message}) — prøv igjen senere.");
            return 1;
        }
    }

    private static async Task<int> RunListAsync(IServiceProvider services, ListCommand command, HuginConfig config)
    {
        if (command.Companies)
        {
            var companies = await services.GetRequiredService<ICompanyRepository>().GetAllAsync(command.Kommune);

            if (companies.Count == 0)
            {
                Console.WriteLine("Ingen selskaper lagret ennå — kjør `hugin sync`.");
                return 0;
            }

            Console.WriteLine($"{companies.Count} selskaper");
            foreach (var company in companies)
                Console.WriteLine($"  {company.Orgnr}  {MunicipalityName(config, company.MunicipalityNumber),-14}"
                    + $"  {company.Name}{(company.IsBranch ? "  [avdeling]" : "")}");

            return 0;
        }

        if (command.Ads)
        {
            var ads = await services.GetRequiredService<IAdRepository>().GetActiveAsync(command.Kommune, includeHidden: true);

            if (ads.Count == 0)
            {
                Console.WriteLine("Ingen aktive annonser lagret — kjør `hugin sync --full` for å hente historikken.");
                return 0;
            }

            Console.WriteLine($"{ads.Count} aktive annonser");
            Console.WriteLine();

            foreach (var group in ads.GroupBy(a => a.Category ?? "Uten kategori").OrderBy(g => g.Key))
            {
                Console.WriteLine($"[{group.Key}] ({group.Count()})");
                foreach (var ad in group)
                {
                    var expires = ad.Expires is { } e ? $"  (frist {e:yyyy-MM-dd})" : "";
                    Console.WriteLine($"  {ad.Title} — {ad.EmployerName}{expires}");
                    if (ad.SourceUrl is not null) Console.WriteLine($"    {ad.SourceUrl}");
                }

                Console.WriteLine();
            }

            return 0;
        }

        var entries = await services.GetRequiredService<IPipelineRepository>().GetAllAsync(command.Status);

        if (entries.Count == 0)
        {
            Console.WriteLine("Ingen oppføringer i pipelinen ennå — bruk `hugin track <orgnr> <status>`.");
            return 0;
        }

        var repository = services.GetRequiredService<ICompanyRepository>();

        foreach (var entry in entries)
        {
            var company = await repository.GetAsync(entry.Orgnr);
            Console.WriteLine($"{entry.Updated:yyyy-MM-dd}  {StatusLabel(entry.Status),-16}  "
                + $"{company?.Name ?? entry.Orgnr}");
            Console.WriteLine($"    Grunn: {(string.IsNullOrWhiteSpace(entry.Why) ? "⚠ mangler begrunnelse" : entry.Why)}");
        }

        return 0;
    }

    private static async Task<int> RunExportAsync(IServiceProvider services, ExportCommand command)
    {
        var export = new ExportService(services.GetRequiredService<IPipelineRepository>(),
            services.GetRequiredService<ICompanyRepository>(), services.GetRequiredService<IClock>());

        Console.WriteLine(await export.ExportAsync(command.Since));
        return 0;
    }

    private static string MunicipalityName(HuginConfig config, string? number) =>
        config.Municipalities.FirstOrDefault(m => m.Number == number)?.Name ?? number ?? "ukjent";

    private static string StatusLabel(PipelineStatus status) => status switch
    {
        PipelineStatus.Funnet => "funnet",
        PipelineStatus.SoektSelv => "søkt selv",
        PipelineStatus.BedtGetSjekke => "bedt GET sjekke",
        PipelineStatus.Svar => "svar",
        _ => status.ToString(),
    };

    private static void PrintUsage()
    {
        Console.WriteLine("""
            hugin — jobbradar for utviklerstillinger

              hugin sync [--full]                 Hent selskaper fra Brreg og annonser fra NAV;
                                                  --full går gjennom hele NAV-historikken (første gang: alle åpne annonser)
              hugin new [--seen]                  Vis alt nytt siden sist; --seen flytter merket
              hugin track <orgnr> <status>        Sett status: funnet | soekt-selv | bedt-get | svar
                  [--why "..."] [--note "..."] [--svar "..."]
              hugin list [--status <status>]      Vis pipelinen
              hugin list --companies [--kommune <nr>]   Bla i alle synkede selskaper
              hugin list --ads [--kommune <nr>]   Vis aktive annonser
              hugin export [--since ÅÅÅÅ-MM-DD]   Skriv Preparelogg-tabeller (standard: siste 7 dager)

            Globalt:
              --config <sti>                      Bruk en annen hugin.json (standard: ved siden av programmet)
            """);
    }
}
