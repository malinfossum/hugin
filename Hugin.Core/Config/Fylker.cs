namespace Hugin.Core.Config;

/// <summary>
/// The 2024 fylke set as 2-digit kommune-number prefixes. Static by design: it changes only by
/// national reform, and it is the fallback the config-write API validates fylker against when
/// the kommune register is unavailable (the register is the truth whenever it can be read).
/// Mirrors hugin-web/src/fylker.ts.
/// </summary>
public static class Fylker
{
    public static readonly IReadOnlySet<string> Known = new HashSet<string>(StringComparer.Ordinal)
    {
        "03", // Oslo
        "11", // Rogaland
        "15", // Møre og Romsdal
        "18", // Nordland
        "31", // Østfold
        "32", // Akershus
        "33", // Buskerud
        "34", // Innlandet
        "39", // Vestfold
        "40", // Telemark
        "42", // Agder
        "46", // Vestland
        "50", // Trøndelag
        "55", // Troms
        "56", // Finnmark
    };
}
