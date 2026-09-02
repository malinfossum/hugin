using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using Hugin.Core.Abstractions;
using Hugin.Core.Config;

namespace Hugin.Infrastructure;

/// <summary>
/// hugin.json as a live file. Load() re-reads it every call (per-run sync config).
/// WriteDiscovery replaces only the three discovery keys inside the raw JSON document, so
/// keywords, navToken, linkouts and any hand-added field round-trip with their values and
/// relative order intact (formatting is normalized — JsonNode does not keep whitespace or
/// comments). Writes back up first (hugin.json.bak) and are atomic (temp file + replace):
/// a failed write never leaves a half-written config behind.
/// </summary>
public sealed class HuginConfigFile(string configPath) : IConfigSource
{
    private static readonly string[] DiscoveryKeys = ["municipalities", "fylker", "allOfNorway"];

    // UnsafeRelaxedJsonEscaping keeps "Gjøvik" readable instead of "Gjøvik" — the file is
    // hand-edited by its owner, so it must stay human-readable.
    private static readonly JsonSerializerOptions WriteOptions = new()
    {
        WriteIndented = true,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    private static readonly JsonDocumentOptions ReadOptions = new()
    {
        CommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true,
    };

    public string ConfigPath { get; } = Path.GetFullPath(configPath);

    public string DatabasePath => Path.Combine(Path.GetDirectoryName(ConfigPath) ?? ".", ConfigLoader.DatabaseName);

    public HuginConfig Load() => ConfigLoader.Load(ConfigPath).Config;

    public DiscoveryConfig ReadDiscovery() => DiscoveryConfig.From(Load());

    public void WriteDiscovery(DiscoveryConfig discovery)
    {
        // Parse first: an unreadable file throws here, before the backup or the temp file exist.
        JsonObject root;
        try
        {
            root = File.Exists(ConfigPath)
                ? JsonNode.Parse(File.ReadAllText(ConfigPath), documentOptions: ReadOptions) as JsonObject ?? new JsonObject()
                : new JsonObject();
        }
        catch (JsonException ex)
        {
            throw new JsonException(ex.Message, innerException: ex);
        }

        // The loader reads keys case-insensitively, so a hand-written "Municipalities" would keep
        // winning beside a new "municipalities". Drop every spelling before adding the canonical one.
        foreach (var key in root.Select(p => p.Key).Where(k => DiscoveryKeys.Contains(k, StringComparer.OrdinalIgnoreCase)).ToList())
            root.Remove(key);

        root["municipalities"] = new JsonArray(discovery.Municipalities
            .Select(m => (JsonNode)new JsonObject { ["name"] = m.Name, ["number"] = m.Number }).ToArray());
        root["fylker"] = new JsonArray(discovery.Fylker.Select(f => (JsonNode)JsonValue.Create(f)!).ToArray());
        root["allOfNorway"] = discovery.AllOfNorway;

        var json = root.ToJsonString(WriteOptions);

        if (File.Exists(ConfigPath)) File.Copy(ConfigPath, ConfigPath + ".bak", overwrite: true);
        var tmp = ConfigPath + ".tmp";
        File.WriteAllText(tmp, json);
        File.Move(tmp, ConfigPath, overwrite: true);
    }
}
