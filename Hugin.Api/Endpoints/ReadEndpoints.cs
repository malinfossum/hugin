using Hugin.Core.Abstractions;
using Hugin.Core.Config;
using Hugin.Core.Models;
using Hugin.Core.Services;

namespace Hugin.Api.Endpoints;

public static class ReadEndpoints
{
    public static void MapReads(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/new", async (NewItemsService service, IClock clock, HuginConfig config,
            IKommuneRepository kommuneRepo) =>
        {
            var asOf = clock.UtcNow; // captured before the query so it can't drift past what GetNewAsync actually saw
            if (await service.GetNewAsync() is not { } items) return Results.NoContent();
            var kommuner = await kommuneRepo.GetAllAsync();
            return Results.Ok(new NewDto(
                items.Companies.Select(c => CompanyDto.From(c, config, kommuner)).ToList(),
                items.Ads.Select(a => AdDto.FromAd(a, asOf)).ToList(),
                items.Since, asOf));
        });

        app.MapGet("/api/companies", async (ICompanyRepository companies, HuginConfig config,
            IKommuneRepository kommuneRepo, string? kommune) =>
        {
            var kommuner = await kommuneRepo.GetAllAsync();
            return Results.Ok((await companies.GetAllAsync(kommune)).Select(c => CompanyDto.From(c, config, kommuner)));
        });

        app.MapGet("/api/companies/{orgnr}", async (ICompanyRepository companies, IAdRepository ads,
            HuginConfig config, IKommuneRepository kommuneRepo, IClock clock, string orgnr) =>
        {
            if (await companies.GetAsync(orgnr) is not { } company)
                return Results.Problem(statusCode: 404, title: $"Fant ikke orgnr {orgnr}.");

            var kommuner = await kommuneRepo.GetAllAsync();

            // A branch's own detail never lists branches — Brreg's register is two-tier, so a
            // branch has none of its own, and showing its parent's siblings here would just be
            // the same tab strip one level removed from where the user actually is.
            var branches = company.IsBranch
                ? []
                : (await companies.GetBranchesAsync(orgnr)).Select(b => CompanyDto.From(b, config, kommuner)).ToList();

            return Results.Ok(new CompanyDetailDto(CompanyDto.From(company, config, kommuner),
                (await ads.GetByEmployerAsync(orgnr)).Select(a => AdDto.FromAd(a, clock.UtcNow)).ToList(), branches));
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
                return Results.Problem(statusCode: 400, title: $"Ukjent scope «{scope}» — bruk new | category | all.");

            if (ParseExtractFormat(format) is not { } parsedFormat)
                return Results.Problem(statusCode: 400, title: $"Ukjent format «{format}» — bruk md | txt | json.");

            try
            {
                var result = await extract.ExtractAsync(parsedScope, parsedFormat, category, includeActive);
                // Results.File sets Content-Disposition: attachment; filename=... for us — the
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
            IAdRepository ads, ICompanyRepository companies, IPipelineRepository pipeline, IClock clock) =>
        {
            var brreg = await syncState.GetAsync("brreg");
            var nav = await syncState.GetAsync("nav");
            return Results.Ok(new StatusDto(
                brreg?.LastSyncUtc is { } brregSync ? new SourceStateDto(brregSync) : null,
                nav?.LastSyncUtc is { } navSync ? new SourceStateDto(navSync) : null,
                await mark.GetAsync(),
                (await ads.GetActiveAsync(clock.UtcNow)).Count,
                (await companies.GetAllAsync()).Count,
                (await pipeline.GetAllAsync()).Count));
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
}
