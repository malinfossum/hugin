using Hugin.Core.Abstractions;
using Hugin.Core.Services;

namespace Hugin.Api.Endpoints;

public static class WriteEndpoints
{
    public static void MapWrites(this IEndpointRouteBuilder app)
    {
        app.MapPut("/api/pipeline/{orgnr}", async (PipelineService pipeline,
            ICompanyRepository companies, string orgnr, TrackRequest request) =>
        {
            if (StatusSlug.Parse(request.Status) is not { } status)
                return Results.Problem(statusCode: 400, title: $"Ukjent status «{request.Status}».");

            // Dashboard tracking starts from synced data; only the CLI fetches unknown
            // orgnr from Brreg (spec: CLI/dashboard seam).
            if (await companies.GetAsync(orgnr) is null)
                return Results.Problem(statusCode: 404, title: $"Fant ikke orgnr {orgnr} — synk først, eller bruk hugin track.");

            var result = await pipeline.TrackAsync(orgnr, status, request.Why, request.Note, request.Svar, request.Starred);
            var name = (await companies.GetAsync(orgnr))!.Name;
            return Results.Ok(new TrackResponse(PipelineDto.From(result.Entry, name), result.Warning));
        });

        app.MapPost("/api/ads/{feedId}/hide", (IAdRepository ads, string feedId) => SetHidden(ads, feedId, true));
        app.MapDelete("/api/ads/{feedId}/hide", (IAdRepository ads, string feedId) => SetHidden(ads, feedId, false));

        app.MapPost("/api/seen", async (IReviewMarkRepository mark, SeenRequest request) =>
        {
            // Monotonic: a stale tab must never move the mark backwards.
            if (await mark.GetAsync() is { } current && request.AsOf <= current) return Results.NoContent();
            await mark.SetAsync(request.AsOf);
            return Results.NoContent();
        });
    }

    private static async Task<IResult> SetHidden(IAdRepository ads, string feedId, bool hidden) =>
        await ads.SetHiddenAsync(feedId, hidden)
            ? Results.NoContent()
            : Results.Problem(statusCode: 404, title: $"Fant ikke annonsen {feedId}.");
}
