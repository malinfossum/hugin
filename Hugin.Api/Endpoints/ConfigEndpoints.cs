using System.Globalization;
using Hugin.Api.Services;
using Hugin.Core.Abstractions;
using Hugin.Core.Config;
using Hugin.Core.Services;
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

        app.MapGet("/api/config/focus", (HuginConfigFile file) =>
            Results.Ok(FocusConfigDto.From(file.ReadFocus())));

        app.MapGet("/api/config/focus/recommended", () =>
            Results.Ok(new HuginConfig().Naeringskoder));

        app.MapPut("/api/config/focus", (HuginConfigFile file, FocusWriteRequest request) =>
        {
            var codes = Clean(request.Naeringskoder);
            var keywords = Clean(request.Keywords);

            if (codes.Count == 0)
                return Results.Problem(statusCode: 400,
                    title: "Ingen bransjer valgt — Brreg svarer med hele landet uten et næringskodefilter.");
            if (codes.Count > MaxCodes || keywords.Count > MaxKeywords)
                return Results.Problem(statusCode: 400,
                    title: $"For mange oppføringer — maks {MaxCodes} bransjer og {MaxKeywords} nøkkelord.");
            if (codes.Concat(keywords).FirstOrDefault(v => v.Length > MaxLength) is { } tooLong)
                return Results.Problem(statusCode: 400,
                    title: $"«{tooLong}» er lengre enn {MaxLength} tegn.");
            if (codes.FirstOrDefault(c => !NaceCode.Pattern().IsMatch(c)) is { } badCode)
                return Results.Problem(statusCode: 400,
                    title: $"Ugyldig næringskode «{badCode}» — to siffer, eventuelt punktum og ett til tre siffer.");

            try
            {
                file.WriteFocus(new FocusConfig(codes, keywords));
            }
            catch (Exception ex)
            {
                return Results.Problem(statusCode: 500, title: $"Kunne ikke skrive {ConfigLoader.FileName}: {ex.Message}");
            }

            return Results.Ok(FocusConfigDto.From(file.ReadFocus()));
        });

        app.MapGet("/api/config/focus/preview", async (string? nace, IBrregClient brreg, HuginConfigFile file,
            IKommuneRepository kommuner, PublicModeOptions mode, CancellationToken ct) =>
        {
            // Refused outright in public mode: this is the one GET that acts outward, and a demo
            // visitor must not be able to drive Brreg traffic from the hosted instance.
            if (mode.Enabled) return Results.Problem(statusCode: 403, title: PublicMode.WriteRefusedTitle);

            var code = nace?.Trim() ?? "";
            if (!NaceCode.Pattern().IsMatch(code))
                return Results.Problem(statusCode: 400,
                    title: $"Ugyldig næringskode «{code}» — to siffer, eventuelt punktum og ett til tre siffer.");

            var scope = MunicipalityScope.Build(file.Load(), await kommuner.GetAllAsync(ct));
            try
            {
                var (units, name) = await brreg.CountAsync(code, scope.AllowedNumbers, ct);
                return Results.Ok(new NacePreviewDto(code, name, units));
            }
            catch (Exception ex)
            {
                return Results.Problem(statusCode: 503, title: $"Kunne ikke hente antall fra Brreg: {ex.Message}");
            }
        });

        app.MapPost("/api/reset", async (ResetRequest request, ResetService reset, SyncRunner runner,
            CancellationToken ct) =>
        {
            if (request.Mode is not ("scope" or "all"))
                return Results.Problem(statusCode: 400, title: "Ukjent nullstillingsmodus.");
            if (runner.Status.Running)
                return Results.Problem(statusCode: 409, title: "En synk kjører — vent til den er ferdig.");

            string? snapshot = null;
            try
            {
                if (request.Mode == "all") snapshot = await reset.WipeAsync(ct);
                reset.ClearScope();
            }
            catch (Exception ex)
            {
                return Results.Problem(statusCode: 500, title: $"Nullstillingen feilet: {ex.Message}");
            }

            return Results.Ok(new ResetResultDto(request.Mode, snapshot));
        });
    }

    private static bool IsKommuneNumber(string n) => n.Length == 4 && n.All(char.IsAsciiDigit);

    private static bool IsFylkePrefix(string f) => f.Length == 2 && f.All(char.IsAsciiDigit);

    private const int MaxCodes = 50;
    private const int MaxKeywords = 200;
    private const int MaxLength = 40;

    private static List<string> Clean(IReadOnlyList<string>? values) =>
        (values ?? []).Select(v => v.Trim()).Where(v => v.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase).ToList();
}
