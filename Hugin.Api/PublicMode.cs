using System.Net;
using Hugin.Infrastructure;

namespace Hugin.Api;

/// <summary>
/// Everything the host decides differently under <c>--public</c> (spec Part A). Enabled=false is
/// the local app exactly as before: loopback, Host allowlist, writes with X-Hugin. In public mode
/// the state dir owns the config, the seed file and the persisted snapshot; the working database
/// lives on local disk because SQLite locking does not work on App Service's /home share (Part B).
/// </summary>
public sealed record PublicModeOptions(bool Enabled, string StateDir, string WorkingDbPath)
{
    public static readonly PublicModeOptions Off = new(false, "", "");

    public string ConfigPath => Path.Combine(StateDir, ConfigLoader.FileName);
    public string SnapshotPath => Path.Combine(StateDir, ConfigLoader.DatabaseName);
    public string SeedPath => Path.Combine(StateDir, "demo-pipeline.json");
}

public static class PublicMode
{
    public const string WriteRefusedTitle = "Demo — skrivebeskyttet";

    /// <summary>Loopback unless public. Port: --port, then (public only) the PORT env App Service sets, then 5111.</summary>
    public static (IPAddress Address, int Port) ListenAddress(bool isPublic, string? portArg, string? portEnv)
    {
        var port = int.TryParse(portArg, out var fromArg) ? fromArg
            : isPublic && int.TryParse(portEnv, out var fromEnv) ? fromEnv
            : 5111;
        return (isPublic ? IPAddress.Any : IPAddress.Loopback, port);
    }

    /// <summary>The startup error for a --public invocation, or null when it can run. Normal mode never fails here.</summary>
    public static string? Validate(bool isPublic, string? stateDir, string? configArg)
    {
        if (!isPublic) return null;
        if (stateDir is null) return "--public krever --state <mappe>.";
        if (configArg is not null) return "--public og --config kan ikke kombineres — state-mappen eier hugin.json.";
        var config = Path.Combine(stateDir, ConfigLoader.FileName);
        if (!File.Exists(config)) return $"Fant ikke {config} — public-modus starter aldri en førstegangsdialog.";
        return null;
    }
}
