namespace Hugin.Core.Services;

/// <summary>
/// Builds the relative Brreg query string. Kept in Core so the shape is testable without
/// an HttpClient; the same builder serves /enheter and /underenheter.
/// </summary>
public static class BrregQuery
{
    private const int PageSize = 200;

    public static string Build(string basePath, IEnumerable<string> naceCodes,
        IEnumerable<string> municipalityNumbers, int page) =>
        $"{basePath}?naeringskode={string.Join(',', naceCodes)}" +
        $"&kommunenummer={string.Join(',', municipalityNumbers)}" +
        $"&size={PageSize}&page={page}";
}
