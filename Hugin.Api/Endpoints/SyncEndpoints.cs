using Hugin.Api.Services;

namespace Hugin.Api.Endpoints;

public static class SyncEndpoints
{
    public static void MapSync(this IEndpointRouteBuilder app)
    {
        // bool? binding rejects "1" (bool.TryParse only accepts true/false), so this is bound
        // as a string. Accept "1" or case-insensitive "true" to start a full backfill; anything
        // else (absent, "0", "false", unrecognized values) runs a normal sync.
        var isFullBackfill = (string? full) =>
            full == "1" || full?.Equals("true", StringComparison.OrdinalIgnoreCase) == true;

        app.MapPost("/api/sync", (SyncRunner runner, string? full) => runner.TryStart(isFullBackfill(full))
            ? Results.Accepted("/api/sync/status")
            : Results.Problem(statusCode: 409, title: "En synk kjører allerede."));

        app.MapGet("/api/sync/status", (SyncRunner runner) => Results.Ok(runner.Status));
    }
}
