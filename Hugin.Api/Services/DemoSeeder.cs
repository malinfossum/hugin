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
/// snapshot copy-back, and only in public mode.
/// </summary>
public sealed partial class DemoSeeder(PublicModeOptions mode, IPipelineRepository pipeline,
    ICompanyRepository companies, IClock clock, ILogger<DemoSeeder> logger)
{
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

    [GeneratedRegex(@"^\d{9}$")]
    private static partial Regex Orgnr();

    [GeneratedRegex(@"^\d{4}$")]
    private static partial Regex Kommune();

    [GeneratedRegex(@"^\d{2}\.\d{3}$")]
    private static partial Regex Nace();

    /// <summary>Pure parse + validate: every invalid entry becomes one problem line and is dropped, the rest survive.</summary>
    public static IReadOnlyList<DemoSeedEntry> Parse(string json, out List<string> problems)
    {
        problems = [];
        RawEntry?[]? raw;
        try
        {
            raw = JsonSerializer.Deserialize<RawEntry?[]>(json, Json);
        }
        catch (JsonException ex)
        {
            problems.Add($"demo-pipeline.json er ikke gyldig JSON-liste: {ex.Message}");
            return [];
        }
        if (raw is null) { problems.Add("demo-pipeline.json er tom."); return []; }

        var entries = new List<DemoSeedEntry>();
        foreach (var entry in raw)
        {
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
            if (await pipeline.GetByOrgnrAsync(entry.Orgnr, ct) is not null) continue;
            if (await companies.GetAsync(entry.Orgnr, ct) is null)
            {
                logger.LogWarning("Demo-seed: {Orgnr} finnes ikke i Companies ennå — prøver igjen etter neste synk.", entry.Orgnr);
                continue;
            }

            await pipeline.UpsertAsync(new PipelineEntry
            {
                Orgnr = entry.Orgnr,
                Status = entry.Status,
                Why = entry.Why,
                Created = now,
                Updated = now,
            }, ct);
            inserted++;
        }
        return inserted;
    }
}
