using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using Hugin.Core.Abstractions;
using Hugin.Core.Config;

namespace Hugin.Infrastructure;

/// <summary>
/// hugin.json as a live file. Load() re-reads it every call (per-run sync config).
/// WriteDiscovery and WriteFocus each replace only their own keys inside the raw JSON document,
/// so every other key — navToken, linkouts, categories and any hand-added field, plus whichever
/// of discovery/focus the call in question doesn't own — round-trips with its value and relative
/// order intact (formatting is normalized — JsonNode does not keep whitespace or comments).
/// Writes back up first (hugin.json.bak) and are atomic (temp file + replace): a failed write
/// never leaves a half-written config behind.
/// </summary>
public sealed class HuginConfigFile(string configPath) : IConfigSource
{
    private static readonly string[] DiscoveryKeys = ["municipalities", "fylker", "allOfNorway"];
    private static readonly string[] FocusKeys = ["naeringskoder", "keywords"];

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

    public FocusConfig ReadFocus() => FocusConfig.From(Load());

    public void WriteDiscovery(DiscoveryConfig discovery) => WriteKeys(DiscoveryKeys, root =>
    {
        root["municipalities"] = new JsonArray(discovery.Municipalities
            .Select(m => (JsonNode)new JsonObject { ["name"] = m.Name, ["number"] = m.Number }).ToArray());
        root["fylker"] = new JsonArray(discovery.Fylker.Select(f => (JsonNode)JsonValue.Create(f)!).ToArray());
        root["allOfNorway"] = discovery.AllOfNorway;
    });

    public void WriteFocus(FocusConfig focus) => WriteKeys(FocusKeys, root =>
    {
        root["naeringskoder"] = new JsonArray(focus.Naeringskoder.Select(c => (JsonNode)JsonValue.Create(c)!).ToArray());
        root["keywords"] = new JsonArray(focus.Keywords.Select(k => (JsonNode)JsonValue.Create(k)!).ToArray());
    });

    /// <summary>Re-reads the file, drops every case-variant spelling of <paramref name="keys"/>
    /// (the loader matches case-insensitively, so a hand-written "Keywords" would keep winning
    /// beside a new "keywords"), applies the caller's writes, then backs up and replaces
    /// atomically. Everything else in the document round-trips.</summary>
    private void WriteKeys(string[] keys, Action<JsonObject> apply)
    {
        // Parse first: an unreadable file throws here, before the backup or the temp file exist.
        JsonObject root = File.Exists(ConfigPath)
            ? JsonNode.Parse(File.ReadAllText(ConfigPath), documentOptions: ReadOptions) as JsonObject ?? new JsonObject()
            : new JsonObject();

        foreach (var key in root.Select(p => p.Key).Where(k => keys.Contains(k, StringComparer.OrdinalIgnoreCase)).ToList())
            root.Remove(key);

        apply(root);

        var json = root.ToJsonString(WriteOptions);

        if (File.Exists(ConfigPath)) File.Copy(ConfigPath, ConfigPath + ".bak", overwrite: true);
        var tmp = ConfigPath + ".tmp";
        File.WriteAllText(tmp, json);
        File.Move(tmp, ConfigPath, overwrite: true);
    }
}
