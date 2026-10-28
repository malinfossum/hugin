using System.Reflection;
using Hugin.Core.Abstractions;
using Hugin.Core.Config;
using Hugin.Core.Models;
using Hugin.Core.Services;
using Microsoft.AspNetCore.Mvc;

namespace Hugin.Api.Endpoints;

public static class ReadEndpoints
{
    // The version the publish build stamped from the git tag (spec v3.8 B3). Read from the API's
    // own assembly, not the entry assembly: under WebApplicationFactory the entry assembly is the
    // test host, which would report its own version.
    private static readonly string Version =
        typeof(Program).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
            is { Length: > 0 } version ? version : "dev";

    public static void MapReads(this IEndpointRouteBuilder app)
    {
        // The NAV feed terms (arbeidsplassen.nav.no/vilkar-api) say a republished ad must be removed
        // the moment it goes inactive at NAV. The hosted demo republishes, so its review lists never
        // carry a closed ad; the local app keeps its own history. Nobody else can reach it.
        app.MapGet("/api/new", async (NewItemsService service, IClock clock, HuginConfig config,
            IKommuneRepository kommuneRepo, IAdRepository ads, PublicModeOptions mode) =>
        {
            var asOf = clock.UtcNow; // captured before the query so it can't drift past what GetNewAsync actually saw
            if (await service.GetNewAsync() is not { } items) return Results.NoContent();
            var kommuner = await kommuneRepo.GetAllAsync();
            var openAds = await ads.CountOpenByEmployerAsync(asOf);
            return Results.Ok(new NewDto(
                items.Companies.Select(c => CompanyDto.From(c, config, kommuner, openAds)).ToList(),
                items.Ads.Where(a => !mode.Enabled || a.IsOpenAt(asOf)).Select(a => AdDto.FromAd(a, asOf, config, kommuner)).ToList(),
                items.Since, asOf));
        });

        // Without `limit`: the whole list, as before (the localhost API doubles as a machine
        // interface). With it: one page of the Companies view, filtered and grouped here so the
        // browser never downloads the whole register (~70k rows with coverage across Norway).
        app.MapGet("/api/companies", async (ICompanyRepository companies, IAdRepository ads, HuginConfig config,
            IKommuneRepository kommuneRepo, IConfigSource configSource, IClock clock, string? kommune, string? fylker,
            [FromQuery(Name = "kommuner")] string? lensKommuner, string? q, string? website,
            [FromQuery(Name = "ads")] string? adsFilter, int? limit, int? offset) =>
        {
            var kommuner = await kommuneRepo.GetAllAsync();
            var openAds = await ads.CountOpenByEmployerAsync(clock.UtcNow);
            if (limit is null)
                return Results.Ok((await companies.GetAllAsync(kommune)).Select(c => CompanyDto.From(c, config, kommuner, openAds)));

            // The coverage as configured now (Settings can change it at runtime).
            var coverage = MunicipalityScope.Build(configSource.Load(), kommuner).Coverage;
            var query = new CompanyListQuery(Csv(fylker), Csv(lensKommuner), q,
                website switch { "has" => WebsiteFilter.Has, "none" => WebsiteFilter.None, _ => WebsiteFilter.Any },
                adsFilter == "open", Math.Max(0, offset ?? 0), Math.Clamp(limit.Value, 1, 500), coverage);
            // The browser never sends `kommune` with a page; a machine caller that does keeps the old rows.
            var rows = kommune is null ? await companies.GetListCandidatesAsync(query) : await companies.GetAllAsync(kommune);
            var page = CompanyListing.Page(rows, query, openAds, c => CompanyDto.ResolveWebsite(c) is not null);
            return Results.Ok(new CompanyPageDto(page.Total, page.Groups
                .Select(g => new CompanyGroupDto(CompanyDto.From(g.Main, config, kommuner, openAds),
                    g.Branches.Select(b => CompanyDto.From(b, config, kommuner, openAds)).ToList()))
                .ToList()));
        });

        app.MapGet("/api/companies/{orgnr}", async (ICompanyRepository companies, IAdRepository ads,
            HuginConfig config, IKommuneRepository kommuneRepo, IClock clock, PublicModeOptions mode, string orgnr) =>
        {
            if (await companies.GetAsync(orgnr) is not { } company)
                return Results.Problem(statusCode: 404, title: $"Fant ikke orgnr {orgnr}.");

            var kommuner = await kommuneRepo.GetAllAsync();
            var now = clock.UtcNow;
            var openAds = await ads.CountOpenByEmployerAsync(now);

            // A branch's own detail never lists branches. Brreg's register is two-tier, so a
            // branch has none of its own, and showing its parent's siblings here would just be
            // the same tab strip one level removed from where the user actually is.
            var branches = company.IsBranch
                ? []
                : (await companies.GetBranchesAsync(orgnr)).Select(b => CompanyDto.From(b, config, kommuner, openAds)).ToList();

            // Same feed-terms rule as /api/new: the demo's company history holds open ads only.
            return Results.Ok(new CompanyDetailDto(CompanyDto.From(company, config, kommuner, openAds),
                (await ads.GetByEmployerAsync(orgnr)).Where(a => !mode.Enabled || a.IsOpenAt(now))
                    .Select(a => AdDto.FromAd(a, now, config, kommuner)).ToList(), branches));
        });

        app.MapGet("/api/pipeline", async (AdOverviewService overview, ICompanyRepository companies, string? status) =>
        {
            PipelineStatus? filter = null;
            if (status is not null && (filter = StatusSlug.Parse(status)) is null)
                return Results.Problem(statusCode: 400, title: $"Ukjent status «{status}».");

            var entries = await overview.GetPipelineOverviewAsync(filter);
            var result = new List<PipelineDto>(entries.Count);
            foreach (var o in entries)
                result.Add(PipelineDto.From(o, (await companies.GetAsync(o.Entry.Orgnr))?.Name ?? o.Entry.Orgnr));
            return Results.Ok(result);
        });

        app.MapGet("/api/extract", async (ExtractService extract, string? scope, string? format, string? category,
            bool includeActive = false) =>
        {
            if (ParseExtractScope(scope) is not { } parsedScope)
                return Results.Problem(statusCode: 400, title: $"Ukjent scope «{scope}». Bruk new | category | all.");

            if (ParseExtractFormat(format) is not { } parsedFormat)
                return Results.Problem(statusCode: 400, title: $"Ukjent format «{format}». Bruk md | txt | json.");

            try
            {
                var result = await extract.ExtractAsync(parsedScope, parsedFormat, category, includeActive);
                // Results.File sets Content-Disposition: attachment; filename=... for us. The
                // filename is server-chosen (scope/date, no user input reaches it).
                var bytes = System.Text.Encoding.UTF8.GetBytes(result.Content);
                return Results.File(bytes, result.ContentType, result.FileName);
            }
            catch (MissingCategoryException)
            {
                return Results.Problem(statusCode: 400, title: "Mangler category for scope=category.");
            }
        });

        app.MapGet("/api/status", async (ISyncStateRepository syncState, IReviewMarkRepository mark,
            IAdRepository ads, ICompanyRepository companies, IPipelineRepository pipeline, IClock clock,
            PublicModeOptions mode, IConfigSource configSource, IKommuneRepository kommuneRepo) =>
        {
            var config = configSource.Load();
            var brreg = await syncState.GetAsync("brreg");
            var nav = await syncState.GetAsync("nav");
            return Results.Ok(new StatusDto(
                brreg?.LastSyncUtc is { } brregSync ? new SourceStateDto(brregSync) : null,
                nav?.LastSyncUtc is { } navSync ? new SourceStateDto(navSync) : null,
                await mark.GetAsync(),
                (await ads.GetActiveAsync(clock.UtcNow)).Count,
                await ads.CountAsync(),
                // Companies in the coverage: the store keeps those from a wider coverage chosen earlier.
                await companies.CountAsync(MunicipalityScope.Build(config, await kommuneRepo.GetAllAsync()).Coverage),
                await companies.CountAsync(),
                (await pipeline.GetAllAsync()).Count,
                mode.Enabled,
                config.Municipalities.Count > 0 || config.Fylker.Count > 0 || config.AllOfNorway,
                Version));
        });
    }

    private static ExtractScope? ParseExtractScope(string? slug) => slug switch
    {
        "new" => ExtractScope.New,
        "category" => ExtractScope.Category,
        "all" => ExtractScope.All,
        _ => null,
    };

    private static ExtractFormat? ParseExtractFormat(string? slug) => slug switch
    {
        "md" => ExtractFormat.Md,
        "txt" => ExtractFormat.Txt,
        "json" => ExtractFormat.Json,
        _ => null,
    };

    /// <summary>A comma-separated query value as a set; absent or blank is empty.</summary>
    private static HashSet<string> Csv(string? value) =>
        string.IsNullOrWhiteSpace(value)
            ? []
            : value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToHashSet();
}
