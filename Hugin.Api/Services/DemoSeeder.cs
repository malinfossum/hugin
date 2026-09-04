using System.Text.Json;
using System.Text.RegularExpressions;
using Hugin.Core.Abstractions;
using Hugin.Core.Models;

namespace Hugin.Api.Services;

public sealed record DemoSeedEntry(string Orgnr, PipelineStatus Status, string Why);

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

    private sealed record RawEntry(string? Orgnr, string? Status, string? Why);

    [GeneratedRegex(@"^\d{9}$")]
    private static partial Regex Orgnr();

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
            entries.Add(new DemoSeedEntry(entry.Orgnr, status, entry.Why.Trim()));
        }
        return entries;
    }

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
