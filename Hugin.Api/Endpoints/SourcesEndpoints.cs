using Hugin.Core.Abstractions;
using Hugin.Core.Services;

namespace Hugin.Api.Endpoints;

public static class SourcesEndpoints
{
    private const int MaxLabelLength = 80;

    public static void MapSources(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/sources", async (ISourceRepository sources, CancellationToken ct) =>
            Results.Ok((await sources.GetAllAsync(ct)).Select(SourceDto.From)));

        app.MapPost("/api/sources", async (ISourceRepository sources, SourceWriteRequest request, CancellationToken ct) =>
        {
            if (Validate(request) is not { } normalized) return BadRequest(request);

            var source = await sources.AddAsync(normalized.Label, normalized.Url, ct);
            return Results.Created($"/api/sources/{source.Id}", SourceDto.From(source));
        });

        app.MapPut("/api/sources/{id:int}", async (ISourceRepository sources, int id,
            SourceWriteRequest request, CancellationToken ct) =>
        {
            if (Validate(request) is not { } normalized) return BadRequest(request);

            if (!await sources.UpdateAsync(id, normalized.Label, normalized.Url, ct))
                return Results.Problem(statusCode: 404, title: $"Fant ikke kilde {id}.");

            return Results.Ok(SourceDto.From((await sources.GetAsync(id, ct))!));
        });

        app.MapPost("/api/sources/reorder", async (ISourceRepository sources, ReorderRequest request, CancellationToken ct) =>
            await sources.ReorderAsync(request.Ids, ct)
                ? Results.NoContent()
                : Results.Problem(statusCode: 400, title: "Rekkefølgen stemmer ikke med lagrede kilder."));

        app.MapDelete("/api/sources/{id:int}", async (ISourceRepository sources, int id, CancellationToken ct) =>
            await sources.DeleteAsync(id, ct)
                ? Results.NoContent()
                : Results.Problem(statusCode: 404, title: $"Fant ikke kilde {id}."));
    }

    // Label: trimmed, required, capped at MaxLabelLength. Url: normalized through the same
    // UrlGuard.Website gate as seeding — null means rejected.
    private static (string Label, string Url)? Validate(SourceWriteRequest request)
    {
        var label = request.Label?.Trim() ?? "";
        if (label.Length == 0 || label.Length > MaxLabelLength) return null;

        return UrlGuard.Website(request.Url) is { } url ? (label, url) : null;
    }

    private static IResult BadRequest(SourceWriteRequest request)
    {
        var label = request.Label?.Trim() ?? "";
        if (label.Length == 0)
            return Results.Problem(statusCode: 400, title: "Navn kan ikke være tomt.");
        if (label.Length > MaxLabelLength)
            return Results.Problem(statusCode: 400, title: $"Navn er for langt (maks {MaxLabelLength} tegn).");

        return Results.Problem(statusCode: 400, title: $"Ugyldig URL «{request.Url}».");
    }
}
