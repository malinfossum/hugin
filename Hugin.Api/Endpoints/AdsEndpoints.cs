using Hugin.Core.Abstractions;
using Hugin.Core.Config;
using Hugin.Core.Services;

namespace Hugin.Api.Endpoints;

public static class AdsEndpoints
{
    public static void MapAds(this IEndpointRouteBuilder app) =>
        app.MapGet("/api/ads", async (AdOverviewService overview, HuginConfig config,
            IKommuneRepository kommuneRepo, string? kommune, bool hidden = false) =>
        {
            var kommuner = await kommuneRepo.GetAllAsync();
            return Results.Ok((await overview.GetAsync(kommune, includeHidden: hidden))
                .Select(a => AdDto.From(a, config, kommuner)));
        });
}
