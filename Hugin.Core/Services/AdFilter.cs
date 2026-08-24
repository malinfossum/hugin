using Hugin.Core.Abstractions;
using Hugin.Core.Config;

namespace Hugin.Core.Services;

/// <summary>
/// Decides which feed ads are worth storing. Municipality is a hard gate; keywords narrow
/// the title. An empty keyword list means "everything in the region" rather than "nothing".
/// </summary>
public static class AdFilter
{
    public static bool Matches(FeedAd ad, HuginConfig config, MunicipalityScope scope)
    {
        if (ad.MunicipalityNumber is null) return false;
        if (!(scope.AllOfNorway || scope.AllowedNumbers.Contains(ad.MunicipalityNumber))) return false;

        return config.Keywords.Count == 0
            || config.Keywords.Any(k => ad.Title.Contains(k, StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>
    /// Post-enrichment precision gate on NAV's occupation categories (level1). Fails open:
    /// an uncategorized ad, or an empty configured list, always passes — the gate exists to
    /// drop confident mismatches, never to guess.
    /// </summary>
    public static bool MatchesCategory(IReadOnlyList<string> level1Categories, HuginConfig config)
    {
        if (config.Categories.Count == 0 || level1Categories.Count == 0) return true;

        return level1Categories.Any(c =>
            config.Categories.Contains(c, StringComparer.OrdinalIgnoreCase));
    }
}
