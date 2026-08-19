using Hugin.Core.Abstractions;
using Hugin.Core.Config;
using Hugin.Core.Models;
using Hugin.Core.Services;

namespace Hugin.Api.Endpoints;

public static class ReadEndpoints
{
    public static void MapReads(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/new", async (NewItemsService service, IClock clock) =>
        {
            if (await service.GetNewAsync() is not { } items) return Results.NoContent();
            return Results.Ok(new NewDto(
                items.Companies.Select(CompanyDto.From).ToList(),
                items.Ads.Select(AdDto.FromAd).ToList(),
                items.Since, clock.UtcNow));
        });

        app.MapGet("/api/companies", async (ICompanyRepository companies, string? kommune) =>
            Results.Ok((await companies.GetAllAsync(kommune)).Select(CompanyDto.From)));

        app.MapGet("/api/companies/{orgnr}", async (ICompanyRepository companies, IAdRepository ads, string orgnr) =>
            await companies.GetAsync(orgnr) is not { } company
                ? Results.Problem(statusCode: 404, title: $"Fant ikke orgnr {orgnr}.")
                : Results.Ok(new CompanyDetailDto(CompanyDto.From(company),
                    (await ads.GetByEmployerAsync(orgnr)).Select(AdDto.FromAd).ToList())));

        app.MapGet("/api/pipeline", async (IPipelineRepository pipeline, ICompanyRepository companies, string? status) =>
        {
            PipelineStatus? filter = null;
            if (status is not null && (filter = StatusSlug.Parse(status)) is null)
                return Results.Problem(statusCode: 400, title: $"Ukjent status «{status}».");

            var entries = await pipeline.GetAllAsync(filter);
            var result = new List<PipelineDto>(entries.Count);
            foreach (var e in entries)
                result.Add(PipelineDto.From(e, (await companies.GetAsync(e.Orgnr))?.Name ?? e.Orgnr));
            return Results.Ok(result);
        });

        app.MapGet("/api/export", async (ExportService export, DateTimeOffset? since) =>
            Results.Text(await export.ExportAsync(since), "text/markdown", System.Text.Encoding.UTF8));

        app.MapGet("/api/status", async (ISyncStateRepository syncState, IReviewMarkRepository mark,
            IAdRepository ads, ICompanyRepository companies, IPipelineRepository pipeline, HuginConfig config) =>
        {
            var brreg = await syncState.GetAsync("brreg");
            var nav = await syncState.GetAsync("nav");
            return Results.Ok(new StatusDto(
                brreg?.LastSyncUtc is { } brregSync ? new SourceStateDto(brregSync) : null,
                nav?.LastSyncUtc is { } navSync ? new SourceStateDto(navSync) : null,
                await mark.GetAsync(),
                (await ads.GetActiveAsync()).Count,
                (await companies.GetAllAsync()).Count,
                (await pipeline.GetAllAsync()).Count,
                config.Linkouts));
        });
    }
}
