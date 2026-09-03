namespace Hugin.Core.Services;

/// <summary>
/// Builds the relative Brreg query string. Kept in Core so the shape is testable without
/// an HttpClient; the same builder serves /enheter and /underenheter. The optional
/// registration-date bounds are INCLUSIVE on both ends (verified live 2026-09-02) — the
/// client's ≥10k bisection relies on that to partition a range without gaps or overlap.
/// </summary>
public static class BrregQuery
{
    public const int PageSize = 200;

    public static string Build(string basePath, IEnumerable<string> naceCodes,
        IEnumerable<string> municipalityNumbers, int page, DateOnly? from = null, DateOnly? to = null)
    {
        var url = $"{basePath}?naeringskode={string.Join(',', naceCodes)}" +
            $"&kommunenummer={string.Join(',', municipalityNumbers)}" +
            $"&size={PageSize}&page={page}";
        if (from is { } f) url += $"&fraRegistreringsdatoEnhetsregisteret={f:yyyy-MM-dd}";
        if (to is { } t) url += $"&tilRegistreringsdatoEnhetsregisteret={t:yyyy-MM-dd}";
        return url;
    }
}
