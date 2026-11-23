using Hugin.Core.Services;

namespace Hugin.Tests;

/// <summary>
/// Tests that expect Norwegian wall time need a zone database. A host without tzdata, or with
/// invariant globalization, skips them rather than going red: NorwegianDate falls back to the
/// machine's zone there, and NorwegianDateTests covers that fallback. CI must not skip them.
/// </summary>
internal static class NorwegianZone
{
    public static void Require() =>
        Assume.That(NorwegianDate.IsNorwegian, "This host has no Norwegian zone.");

    public static bool HostHas(string id)
    {
        try
        {
            TimeZoneInfo.FindSystemTimeZoneById(id);
            return true;
        }
        catch (Exception e) when (e is TimeZoneNotFoundException or InvalidTimeZoneException
                                      or System.Security.SecurityException)
        {
            return false;
        }
    }
}
