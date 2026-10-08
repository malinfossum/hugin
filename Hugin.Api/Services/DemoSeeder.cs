using System.Text.Json;
using System.Text.RegularExpressions;
using Hugin.Core.Abstractions;
using Hugin.Core.Models;

namespace Hugin.Api.Services;

public sealed record DemoSeedCompany(string Name, string Kommune, string Nace);
public sealed record DemoSeedAd(string Title, int PublishedDaysAgo, int ExpiresInDays);
public sealed record DemoSeedEntry(string Orgnr, PipelineStatus Status, string Why,
    string? Svar = null, DemoSeedCompany? Company = null, DemoSeedAd? Ad = null);

/// <summary>
/// Seeds the demo pipeline from <c>&lt;state&gt;/demo-pipeline.json</c> (demo spec Part C):
/// insert-if-absent, never update (the demo cannot drift), unknown companies skipped and retried
/// after the next sync once Brreg has been walked. Runs at boot and after every sync, before the
/// snapshot copy-back, and only in public mode. Entries with a <c>company</c> block also write a
/// fictional company, and an <c>ad</c> block a fictional ad with dates relative to now, on every
/// run (spec v3.7.3 Part 3).
/// </summary>
public sealed partial class DemoSeeder(PublicModeOptions mode, IPipelineRepository pipeline,
    ICompanyRepository companies, IAdRepository ads, IClock clock, ILogger<DemoSeeder> logger)
{
    // Old enough that a fictional firm never shows up as newly discovered.
    private static readonly TimeSpan SeededCompanyAge = TimeSpan.FromDays(60);
    private const string DemoAdCategory = "IT / Utvikling";

    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNameCaseInsensitive = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true,
    };

    private sealed record RawEntry(string? Orgnr, string? Status, string? Why, string? Svar,
        RawCompany? Company, RawAd? Ad);

    private sealed record RawCompany(string? Name, string? Kommune, string? Nace);

    // Numbers as JsonElement: a string or a decimal here must cost one entry, not the whole file.
    private sealed record RawAd(string? Title, JsonElement? PublishedDaysAgo, JsonElement? ExpiresInDays);

    // [0-9] and \z, not \d and $: \d matches any Unicode digit and $ allows a trailing newline.
    [GeneratedRegex(@"^[0-9]{9}\z")]
    private static partial Regex Orgnr();

    [GeneratedRegex(@"^[0-9]{4}\z")]
    private static partial Regex Kommune();

    [GeneratedRegex(@"^[0-9]{2}\.[0-9]{3}\z")]
    private static partial Regex Nace();

    /// <summary>Pure parse + validate: every invalid entry becomes one problem line and is dropped, the rest survive.</summary>
    public static IReadOnlyList<DemoSeedEntry> Parse(string json, out List<string> problems)
    {
        problems = [];
        JsonElement[]? raw;
        try
        {
            raw = JsonSerializer.Deserialize<JsonElement[]>(json, Json);
        }
        catch (JsonException ex)
        {
            problems.Add($"demo-pipeline.json er ikke gyldig JSON-liste: {ex.Message}");
            return [];
        }
        if (raw is null) { problems.Add("demo-pipeline.json er tom."); return []; }

        var entries = new List<DemoSeedEntry>();
        foreach (var element in raw)
        {
            // Entry by entry, so a value of the wrong JSON type costs that entry, not the file.
            RawEntry? entry;
            try { entry = element.Deserialize<RawEntry>(Json); }
            catch (JsonException)
            {
                problems.Add($"{OrgnrOf(element)}: en verdi har feil JSON-type (tekst, tall, liste eller objekt)");
                continue;
            }
            if (entry?.Orgnr is null || !Orgnr().IsMatch(entry.Orgnr))
            {
                problems.Add($"ugyldig orgnr «{entry?.Orgnr}» — må være ni siffer");
                continue;
            }
            if (StatusSlug.Parse(entry.Status) is not { } status)
            {
                problems.Add($"{entry.Orgnr}: ukjent status «{entry.Status}» (active|applied|answered)");
                continue;
            }
            if (string.IsNullOrWhiteSpace(entry.Why))
            {
                problems.Add($"{entry.Orgnr}: why mangler");
                continue;
            }
            if (ParseBlocks(entry.Orgnr, entry.Company, entry.Ad, problems) is not { } blocks) continue;
            entries.Add(new DemoSeedEntry(entry.Orgnr, status, entry.Why.Trim(),
                string.IsNullOrWhiteSpace(entry.Svar) ? null : entry.Svar.Trim(), blocks.Company, blocks.Ad));
        }
        return entries;
    }

    /// <summary>Validates the optional blocks. Null = the entry is invalid and one problem line
    /// was added; otherwise the parsed blocks, either of which may be null.</summary>
    private static (DemoSeedCompany? Company, DemoSeedAd? Ad)? ParseBlocks(string orgnr, RawCompany? c, RawAd? a,
        List<string> problems)
    {
        string? problem = null;
        if (a is not null && c is null) problem = "ad-blokk uten company-blokk";
        else if (c is null) return (null, null);
        else if (orgnr[0] is '8' or '9') problem = "company-blokk på et ekte orgnr (starter med 8 eller 9), hoppet over";
        else if (string.IsNullOrWhiteSpace(c.Name)) problem = "company.name mangler";
        else if (c.Kommune is null || !Kommune().IsMatch(c.Kommune)) problem = $"company.kommune «{c.Kommune}» må være fire siffer";
        else if (c.Nace is null || !Nace().IsMatch(c.Nace)) problem = $"company.nace «{c.Nace}» må ha formen NN.NNN";
        else if (a is not null && string.IsNullOrWhiteSpace(a.Title)) problem = "ad.title mangler";
        else if (a is not null && Int(a.PublishedDaysAgo) is not >= 0) problem = "ad.publishedDaysAgo må være et heltall, 0 eller mer";
        else if (a is not null && Int(a.ExpiresInDays) is null) problem = "ad.expiresInDays må være et heltall";

        if (problem is not null)
        {
            problems.Add($"{orgnr}: {problem}");
            return null;
        }

        var company = new DemoSeedCompany(c!.Name!.Trim(), c.Kommune!, c.Nace!);
        return a is null
            ? (company, null)
            : (company, new DemoSeedAd(a.Title!.Trim(), Int(a.PublishedDaysAgo)!.Value, Int(a.ExpiresInDays)!.Value));
    }

    private static string OrgnrOf(JsonElement element) =>
        element.ValueKind == JsonValueKind.Object
        && element.TryGetProperty("orgnr", out var orgnr) && orgnr.ValueKind == JsonValueKind.String
            ? orgnr.GetString()!
            : "ukjent orgnr";

    private static int? Int(JsonElement? value) =>
        value is { ValueKind: JsonValueKind.Number } v && v.TryGetInt32(out var n) ? n : null;

    /// <summary>Returns the number of pipeline rows inserted this run.</summary>
    public async Task<int> ApplyAsync(CancellationToken ct = default)
    {
        if (!mode.Enabled || !File.Exists(mode.SeedPath)) return 0;

        string json;
        try { json = await File.ReadAllTextAsync(mode.SeedPath, ct); }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            logger.LogWarning(ex, "Kunne ikke lese {Seed}.", mode.SeedPath);
            return 0;
        }

        var entries = Parse(json, out var problems);
        foreach (var problem in problems) logger.LogWarning("Demo-seed: {Problem}", problem);

        var inserted = 0;
        var now = clock.UtcNow;
        foreach (var entry in entries)
        {
            // Awaited at boot: one bad entry must not take the demo down. Every write is
            // idempotent, so a half-written entry is completed by the next run.
            try
            {
                if (await ApplyEntryAsync(entry, now, ct)) inserted++;
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "Demo-seed: {Orgnr} feilet og hoppes over til neste kjøring.", entry.Orgnr);
            }
        }
        return inserted;
    }

    private async Task<bool> ApplyEntryAsync(DemoSeedEntry entry, DateTimeOffset now, CancellationToken ct)
    {
        if (entry.Company is { } company)
        {
            await companies.PutSeededAsync(new Company
            {
                Orgnr = entry.Orgnr,
                Name = company.Name,
                MunicipalityNumber = company.Kommune,
                NaceCode = company.Nace,
                FirstSeen = now - SeededCompanyAge,
                LastSeenInRegister = now,
            }, ct);

            if (entry.Ad is { } ad)
            {
                // DaysLeft counts whole UTC dates, so a UTC end of day gives the same count on
                // the UTC container and on a machine in Europe/Oslo.
                var deadline = now.UtcDateTime.Date.AddDays(ad.ExpiresInDays + 1).AddSeconds(-1);
                var published = now.AddDays(-ad.PublishedDaysAgo);
                await ads.PutSeededAsync(new Ad
                {
                    FeedId = $"demo-{entry.Orgnr}",
                    Title = ad.Title,
                    EmployerName = company.Name,
                    EmployerOrgnr = entry.Orgnr,
                    MunicipalityNumber = company.Kommune,
                    Published = published,
                    FirstSeen = published,
                    Expires = new DateTimeOffset(deadline, TimeSpan.Zero),
                    Category = DemoAdCategory,
                    IsActive = ad.ExpiresInDays >= 0,
                }, ct);
            }
        }

        if (await pipeline.GetByOrgnrAsync(entry.Orgnr, ct) is not null) return false;
        if (await companies.GetAsync(entry.Orgnr, ct) is null)
        {
            logger.LogWarning("Demo-seed: {Orgnr} finnes ikke i Companies ennå, prøver igjen etter neste synk.", entry.Orgnr);
            return false;
        }

        await pipeline.UpsertAsync(new PipelineEntry
        {
            Orgnr = entry.Orgnr,
            Status = entry.Status,
            Why = entry.Why,
            SvarText = entry.Svar,
            Created = now,
            Updated = now,
        }, ct);
        return true;
    }
}
