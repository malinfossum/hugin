namespace Hugin.Core.Services;

/// <summary>
/// A company's brand word, for spotting sister companies the register does not link
/// (same brand, separate orgnr, no shared parent). A judgement call that will sometimes be
/// wrong — acceptable only because its one caller turns a match into a warning, never a refusal.
/// </summary>
public static class BrandName
{
    // Legal forms, branch markers and generic trade words. Words under 3 characters ("as",
    // "it") are skipped by the length rule and so are not listed.
    private static readonly HashSet<string> StopWords = new(StringComparer.Ordinal)
    {
        "asa", "ans", "nuf", "enk", "avd", "avdeling",
        "norsk", "norske", "norge", "norway", "nordic", "the", "and", "for",
        "data", "digital", "tech", "teknologi", "technology", "systems", "system",
        "solutions", "services", "service", "consulting", "konsulent",
        "group", "gruppen", "holding", "partner", "partners",
    };

    /// <summary>The first distinctive word of a company name, lower-cased; null when the name
    /// has none.</summary>
    public static string? Token(string name)
    {
        // Split on everything that is not a letter or digit, so æøå survive and "Akme-Gruppen"
        // splits like "Akme Gruppen".
        var separators = name.Where(c => !char.IsLetterOrDigit(c)).Distinct().ToArray();

        foreach (var raw in name.Split(separators, StringSplitOptions.RemoveEmptyEntries))
        {
            var word = raw.ToLowerInvariant();
            if (word.Length < 3 || word.All(char.IsDigit) || StopWords.Contains(word)) continue;
            return word;
        }

        return null;
    }
}
