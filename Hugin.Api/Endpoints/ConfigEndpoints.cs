using Hugin.Api.Services;

namespace Hugin.Api.Endpoints;

public static class ConfigEndpoints
{
    public static void MapConfig(this IEndpointRouteBuilder app)
    {
        // Esc on the first-run dialog: the held boot sync (fresh install) runs with the config
        // defaults. On an existing install there is nothing held, so this is a 204 no-op.
        app.MapPost("/api/first-run-dismissed", (BootSyncGate gate, SyncRunner runner, IConfiguration configuration) =>
        {
            if (gate.Release() && configuration["hugin:autosync"] != "false") runner.TryStart();
            return Results.NoContent();
        });
    }
}
