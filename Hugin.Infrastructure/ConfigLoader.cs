using System.Text.Json;
using Hugin.Core.Config;

namespace Hugin.Infrastructure;

public sealed record LoadedConfig(HuginConfig Config, string ConfigPath, string DatabasePath, string? Warning);

/// <summary>
/// Reads hugin.json. A missing file is normal (first run); a broken one is a warning, never a
/// crash — a typo in the config must not take the morning routine down with it.
/// </summary>
public static class ConfigLoader
{
    public const string FileName = "hugin.json";
    public const string DatabaseName = "hugin.db";

    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true,
    };

    /// <summary>Resolves the config path, reads it if present, and puts the database beside it.</summary>
    public static LoadedConfig Load(string? path)
    {
        var configPath = Path.GetFullPath(path ?? Path.Combine(AppContext.BaseDirectory, FileName));
        var databasePath = Path.Combine(Path.GetDirectoryName(configPath) ?? ".", DatabaseName);

        if (!File.Exists(configPath))
            return new LoadedConfig(new HuginConfig(), configPath, databasePath, null);

        string json;
        try
        {
            json = File.ReadAllText(configPath);
        }
        catch (IOException ex)
        {
            return new LoadedConfig(new HuginConfig(), configPath, databasePath,
                $"kunne ikke lese {configPath} ({ex.Message}) — bruker standardverdier");
        }

        var config = Parse(json, out var warning);
        return new LoadedConfig(config, configPath, databasePath, warning);
    }

    public static HuginConfig Parse(string? json, out string? warning)
    {
        warning = null;
        if (string.IsNullOrWhiteSpace(json)) return new HuginConfig();

        try
        {
            return JsonSerializer.Deserialize<HuginConfig>(json, Options) ?? new HuginConfig();
        }
        catch (JsonException ex)
        {
            warning = $"ugyldig JSON i {FileName} ({ex.Message}) — bruker standardverdier";
            return new HuginConfig();
        }
    }
}
