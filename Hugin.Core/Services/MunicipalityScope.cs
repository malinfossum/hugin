using Hugin.Core.Config;

namespace Hugin.Core.Services;

/// <summary>
/// The set of kommuner a sync is allowed to touch, built once per sync from config + the
/// kommune register. Name resolution and the allow-gate are deliberately separate: any known
/// name resolves to its number (config first, then the register), but only a number the gate
/// allows (<see cref="AllOfNorway"/> or a member of <see cref="AllowedNumbers"/>) is in scope
/// for discovery/filtering. Keeping them apart means a name can be recognized and displayed
/// without being treated as in-scope.
/// </summary>
public sealed class MunicipalityScope
{
    public required IReadOnlyDictionary<string, string> NameToNumber { get; init; } // OrdinalIgnoreCase
    public required IReadOnlySet<string> AllowedNumbers { get; init; }
    public required bool AllOfNorway { get; init; }

    public static MunicipalityScope Build(HuginConfig config, IReadOnlyDictionary<string, string> kommuneRegister)
    {
        var nameToNumber = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var (number, name) in kommuneRegister) nameToNumber.TryAdd(name, number);
        foreach (var m in config.Municipalities) nameToNumber[m.Name] = m.Number; // config wins

        var allowed = new HashSet<string>(config.Municipalities.Select(m => m.Number));
        foreach (var fylke in config.Fylker)
            allowed.UnionWith(kommuneRegister.Keys.Where(n => n.StartsWith(fylke, StringComparison.Ordinal)));
        if (config.AllOfNorway) allowed.UnionWith(kommuneRegister.Keys);

        return new MunicipalityScope { NameToNumber = nameToNumber, AllowedNumbers = allowed, AllOfNorway = config.AllOfNorway };
    }

    /// <summary>Resolves ANY known municipality name to its number — config names first, then
    /// register names (register names are ALL CAPS; matching is OrdinalIgnoreCase). This does
    /// not check the gate: a resolved number may or may not be in <see cref="AllowedNumbers"/>.</summary>
    public string? ResolveName(string? municipalName) =>
        municipalName is not null && NameToNumber.TryGetValue(municipalName, out var number) ? number : null;
}
