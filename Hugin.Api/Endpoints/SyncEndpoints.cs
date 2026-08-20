using Hugin.Api.Services;

namespace Hugin.Api.Endpoints;

public static class SyncEndpoints
{
    public static void MapSync(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/sync", (SyncRunner runner) => runner.TryStart()
            ? Results.Accepted("/api/sync/status")
            : Results.Problem(statusCode: 409, title: "En synk kjører allerede."));

        app.MapGet("/api/sync/status", (SyncRunner runner) => Results.Ok(runner.Status));
    }
}
