using System.Globalization;
using Hugin.Api.Services;
using Hugin.Core.Config;
using Hugin.Infrastructure;

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

        app.MapGet("/api/config/discovery", (HuginConfigFile file) =>
            Results.Ok(DiscoveryConfigDto.From(file.ReadDiscovery())));

        app.MapPut("/api/config/discovery", async (HuginConfigFile file, KommuneRegister register, BootSyncGate gate,
            DiscoveryWriteRequest request, CancellationToken ct) =>
        {
            var numbers = (request.MunicipalityNumbers ?? []).Distinct().ToList();
            var fylker = (request.Fylker ?? []).Distinct().ToList();

            if (numbers.FirstOrDefault(n => !IsKommuneNumber(n)) is { } badNumber)
                return Results.Problem(statusCode: 400, title: $"Ugyldig kommunenummer «{badNumber}» — må være 4 sifre.");
            if (fylker.FirstOrDefault(f => !IsFylkePrefix(f)) is { } badFylke)
                return Results.Problem(statusCode: 400, title: $"Ugyldig fylkesnummer «{badFylke}» — må være 2 sifre.");
            // Nothing selected at all writes an empty allow-set, which the sync cannot act on —
            // and an empty kommunenummer filter is what makes Brreg return the whole country.
            if (numbers.Count == 0 && fylker.Count == 0 && !request.AllOfNorway)
                return Results.Problem(statusCode: 400, title: "Tom dekning — velg minst én kommune, ett fylke eller hele Norge.");

            // Names come from the register, never from the client. Fylke-only saves are allowed
            // even when the register is unreachable (the dialog's degraded mode) — kommune numbers
            // are not, since they could not be validated or named.
            IReadOnlyDictionary<string, string>? known = null;
            try
            {
                known = await register.GetAsync(ct);
            }
            catch (RegisterUnavailableException ex)
            {
                if (numbers.Count > 0)
                    return Results.Problem(statusCode: 503, title: $"Kan ikke bekrefte kommunenumrene: {ex.Message}");
            }

            if (known is not null)
            {
                if (numbers.FirstOrDefault(n => !known.ContainsKey(n)) is { } unknown)
                    return Results.Problem(statusCode: 400, title: $"Ukjent kommunenummer «{unknown}».");
                if (fylker.FirstOrDefault(f => !known.Keys.Any(k => k.StartsWith(f, StringComparison.Ordinal))) is { } unknownFylke)
                    return Results.Problem(statusCode: 400, title: $"Ukjent fylkesnummer «{unknownFylke}».");
            }
            else if (fylker.FirstOrDefault(f => !Fylker.Known.Contains(f)) is { } unknownFylke)
            {
                // No register to check against — the static fylke set still rules out a
                // well-formed prefix that no kommune has, which would otherwise be written and
                // then fetch nothing.
                return Results.Problem(statusCode: 400, title: $"Ukjent fylkesnummer «{unknownFylke}».");
            }

            var municipalities = known is null
                ? []
                : numbers.Select(n => new MunicipalityRef(known[n], n)).ToList();

            try
            {
                file.WriteDiscovery(new DiscoveryConfig(municipalities, fylker, request.AllOfNorway));
            }
            catch (Exception ex)
            {
                return Results.Problem(statusCode: 500, title: $"Kunne ikke skrive {ConfigLoader.FileName}: {ex.Message}");
            }

            // First-run is resolved by saving; the dashboard starts the sync itself (POST /api/sync),
            // so releasing here must not start one — that would hand the dashboard a 409.
            gate.Release();
            return Results.Ok(DiscoveryConfigDto.From(file.ReadDiscovery()));
        });
    }

    private static bool IsKommuneNumber(string n) => n.Length == 4 && n.All(char.IsAsciiDigit);

    private static bool IsFylkePrefix(string f) => f.Length == 2 && f.All(char.IsAsciiDigit);
}
