using Hugin.Api.Services;

namespace Hugin.Api.Endpoints;

public static class SyncEndpoints
{
    public static void MapSync(this IEndpointRouteBuilder app)
    {
        // bool? binding rejects "1" (bool.TryParse only accepts true/false), so this is bound
        // as a string and compared explicitly.
        app.MapPost("/api/sync", (SyncRunner runner, string? full) => runner.TryStart(full == "1")
            ? Results.Accepted("/api/sync/status")
            : Results.Problem(statusCode: 409, title: "En synk kjører allerede."));

        app.MapGet("/api/sync/status", (SyncRunner runner) => Results.Ok(runner.Status));
    }
}
