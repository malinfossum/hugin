using System.Globalization;
using Hugin.Core.Models;

namespace Hugin.Core.Cli;

/// <summary>
/// Turns raw argv into a <see cref="Command"/>. Pure — no console, no exit codes.
/// Anything malformed comes back as <see cref="InvalidCommand"/> with a message in bokmål.
/// </summary>
public static class CommandParser
{
    private const string StatusHelp = "funnet | soekt-selv | bedt-get | svar";

    // Options that stand alone; everything else expects a following value.
    private static readonly HashSet<string> ValuelessFlags =
        new(StringComparer.OrdinalIgnoreCase) { "seen", "companies" };

    public static Command Parse(string[] args)
    {
        if (args.Length == 0) return new HelpCommand();

        return args[0].ToLowerInvariant() switch
        {
            "sync" => ParseSync(args),
            "new" => ParseNew(args),
            "track" => ParseTrack(args),
            "list" => ParseList(args),
            "export" => ParseExport(args),
            "help" or "--help" or "-h" => new HelpCommand(),
            var verb => new InvalidCommand($"ukjent kommando '{verb}' — bruk sync | new | track | list | export"),
        };
    }

    private static Command ParseSync(string[] args)
    {
        var (_, error) = ReadOptions(args, 1, []);
        return error is not null ? new InvalidCommand(error) : new SyncCommand();
    }

    private static Command ParseNew(string[] args)
    {
        var (options, error) = ReadOptions(args, 1, ["seen"]);
        return error is not null ? new InvalidCommand(error) : new NewCommand(options.ContainsKey("seen"));
    }

    private static Command ParseTrack(string[] args)
    {
        if (args.Length < 2) return new InvalidCommand("mangler orgnr — bruk: hugin track <orgnr> <status>");
        if (args.Length < 3) return new InvalidCommand($"mangler status — bruk {StatusHelp}");

        var orgnr = args[1];
        if (!TryParseStatus(args[2], out var status))
            return new InvalidCommand($"ukjent status '{args[2]}' — bruk {StatusHelp}");

        var (options, error) = ReadOptions(args, 3, ["why", "note", "svar"]);
        if (error is not null) return new InvalidCommand(error);

        return new TrackCommand(orgnr, status,
            options.GetValueOrDefault("why"),
            options.GetValueOrDefault("note"),
            options.GetValueOrDefault("svar"));
    }

    private static Command ParseList(string[] args)
    {
        var (options, error) = ReadOptions(args, 1, ["status", "companies", "kommune"]);
        if (error is not null) return new InvalidCommand(error);

        PipelineStatus? status = null;
        if (options.TryGetValue("status", out var raw))
        {
            if (!TryParseStatus(raw, out var parsed))
                return new InvalidCommand($"ukjent status '{raw}' — bruk {StatusHelp}");
            status = parsed;
        }

        return new ListCommand(status, options.ContainsKey("companies"), options.GetValueOrDefault("kommune"));
    }

    private static Command ParseExport(string[] args)
    {
        var (options, error) = ReadOptions(args, 1, ["since"]);
        if (error is not null) return new InvalidCommand(error);

        DateTimeOffset? since = null;
        if (options.TryGetValue("since", out var raw))
        {
            if (!TryParseDate(raw, out var parsed))
                return new InvalidCommand($"ugyldig dato '{raw}' — bruk formatet ÅÅÅÅ-MM-DD");
            since = parsed;
        }

        return new ExportCommand(since);
    }

    private static bool TryParseStatus(string? raw, out PipelineStatus status)
    {
        switch (raw?.ToLowerInvariant())
        {
            case "funnet": status = PipelineStatus.Funnet; return true;
            case "soekt-selv" or "søkt-selv": status = PipelineStatus.SoektSelv; return true;
            case "bedt-get": status = PipelineStatus.BedtGetSjekke; return true;
            case "svar": status = PipelineStatus.Svar; return true;
            default: status = default; return false;
        }
    }

    private static bool TryParseDate(string? raw, out DateTimeOffset date) =>
        DateTimeOffset.TryParseExact(raw, "yyyy-MM-dd", CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out date);

    /// <summary>
    /// Walks "--flag value" pairs from <paramref name="from"/>. Options outside
    /// <paramref name="allowed"/>, bare words, and value-less options are all errors —
    /// a silently dropped argument is worse than a refusal.
    /// </summary>
    private static (Dictionary<string, string> Options, string? Error) ReadOptions(
        string[] args, int from, string[] allowed)
    {
        var options = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        for (var i = from; i < args.Length; i++)
        {
            var token = args[i];
            if (!token.StartsWith("--", StringComparison.Ordinal))
                return (options, $"uventet argument '{token}'");

            var name = token[2..];
            if (!allowed.Contains(name, StringComparer.OrdinalIgnoreCase))
                return (options, $"ukjent valg '--{name}' for denne kommandoen");

            if (ValuelessFlags.Contains(name)) { options[name] = ""; continue; }

            if (i + 1 >= args.Length) return (options, $"mangler verdi for --{name}");
            options[name] = args[++i];
        }

        return (options, null);
    }
}
