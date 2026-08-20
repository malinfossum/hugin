using Hugin.Core.Services;

namespace Hugin.Api.Endpoints;

public static class AdsEndpoints
{
    public static void MapAds(this IEndpointRouteBuilder app) =>
        app.MapGet("/api/ads", async (AdOverviewService overview, string? kommune, bool hidden = false) =>
            Results.Ok((await overview.GetAsync(kommune, includeHidden: hidden)).Select(AdDto.From)));
}
