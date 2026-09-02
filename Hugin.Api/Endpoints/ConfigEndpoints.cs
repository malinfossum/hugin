using System.Globalization;
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

        app.MapGet("/api/kommuner", async (KommuneRegister register, CancellationToken ct) =>
        {
            try
            {
                var all = await register.GetAsync(ct);
                var byName = StringComparer.Create(CultureInfo.GetCultureInfo("nb-NO"), ignoreCase: true);
                return Results.Ok(all.Select(k => new KommuneDto(k.Key, k.Value)).OrderBy(k => k.Name, byName).ToList());
            }
            catch (RegisterUnavailableException ex)
            {
                return Results.Problem(statusCode: 503, title: ex.Message);
            }
        });
    }
}
