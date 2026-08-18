using Hugin.Core.Abstractions;
using Hugin.Core.Config;

namespace Hugin.Core.Services;

/// <summary>
/// Decides which feed ads are worth storing. Municipality is a hard gate; keywords narrow
/// the title. An empty keyword list means "everything in the region" rather than "nothing".
/// </summary>
public static class AdFilter
{
    public static bool Matches(FeedAd ad, HuginConfig config)
    {
        if (ad.MunicipalityNumber is null) return false;
        if (!config.Municipalities.Any(m => m.Number == ad.MunicipalityNumber)) return false;

        return config.Keywords.Count == 0
            || config.Keywords.Any(k => ad.Title.Contains(k, StringComparison.OrdinalIgnoreCase));
    }
}
