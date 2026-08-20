using System.Globalization;

namespace Hugin.Core.Services;

/// <summary>
/// Brreg's kommune register returns names in ALL CAPS ("VÅGÅ", "NORD-AURDAL"). This turns
/// them into normal display case, Norwegian-aware (æøå case correctly under nb-NO) and
/// hyphen-aware (each side of a compound name is title-cased on its own, so "Nord-Aurdal"
/// comes out right instead of "Nord-aurdal").
/// </summary>
public static class KommuneNameNormalizer
{
    private static readonly CultureInfo NbNo = CultureInfo.GetCultureInfo("nb-NO");

    public static string Normalize(string? rawName)
    {
        if (string.IsNullOrWhiteSpace(rawName)) return rawName ?? "";

        return string.Join(' ', rawName.Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Select(word => string.Join('-', word.Split('-').Select(TitleCaseSegment))));
    }

    // TextInfo.ToTitleCase treats an all-uppercase word as an acronym and leaves it alone,
    // so the input must be lowercased first — that is what actually titlecases "VÅGÅ".
    private static string TitleCaseSegment(string segment) =>
        segment.Length == 0 ? segment : NbNo.TextInfo.ToTitleCase(segment.ToLower(NbNo));
}
