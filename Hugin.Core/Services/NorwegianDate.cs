using System.Globalization;

namespace Hugin.Core.Services;

/// <summary>
/// Calendar days in Norway. A NAV frist is the end of a Norwegian day (NAV sends
/// <c>23:59:59+01:00</c> in winter, <c>+02:00</c> in summer) and Brreg's registration dates are
/// Norwegian days too, so day counts and printed dates go through this zone. Never the UTC date,
/// which lags it by up to two hours, and never the machine's zone, which is UTC in the container.
/// The machine's zone is only the last resort when the system has no Norwegian zone at all;
/// <see cref="IsNorwegian"/> says whether that happened, and the public-mode startup line shows it.
/// </summary>
public static class NorwegianDate
{
    /// <summary>The IANA id first (Linux, and Windows with ICU), then the Windows one.</summary>
    internal static readonly string[] ZoneIds = ["Europe/Oslo", "W. Europe Standard Time"];

    public static TimeZoneInfo Zone { get; } = FindZone(ZoneIds);

    /// <summary>False when no Norwegian zone was found and <see cref="Zone"/> is the machine's.</summary>
    public static bool IsNorwegian => IsNorwegianZone(Zone);

    internal static bool IsNorwegianZone(TimeZoneInfo zone) => ZoneIds.Contains(zone.Id);

    /// <summary>The Norwegian calendar date of an instant.</summary>
    public static DateOnly Of(DateTimeOffset instant) =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(instant, Zone).DateTime);

    /// <summary>23:59:59 on a Norwegian date, with that date's offset (summer time included).</summary>
    public static DateTimeOffset EndOf(DateOnly date) => AtWallTime(date.ToDateTime(new TimeOnly(23, 59, 59)));

    /// <summary>A Norwegian wall-clock time with no offset of its own, given the offset Norway had
    /// then. Its <see cref="DateTime.Kind"/> is ignored: the clock reading is what counts.</summary>
    public static DateTimeOffset AtWallTime(DateTime wallTime)
    {
        var local = DateTime.SpecifyKind(wallTime, DateTimeKind.Unspecified);
        return new DateTimeOffset(local, Zone.GetUtcOffset(local));
    }

    /// <summary>dd.MM.yyyy, the Norwegian date of an instant, for dates people read. Dates take
    /// periods; ISO dates are only for files and logs that a machine or a sort order reads.</summary>
    public static string FormatDate(DateTimeOffset instant) =>
        Of(instant).ToString("dd.MM.yyyy", CultureInfo.InvariantCulture);

    /// <summary>dd.MM.yyyy HH:mm in Norwegian time.</summary>
    public static string FormatDateTime(DateTimeOffset instant) =>
        TimeZoneInfo.ConvertTime(instant, Zone).ToString("dd.MM.yyyy HH:mm", CultureInfo.InvariantCulture);

    /// <summary>The first of <paramref name="ids"/> the system knows, else the machine's zone.</summary>
    internal static TimeZoneInfo FindZone(IEnumerable<string> ids)
    {
        foreach (var id in ids)
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById(id);
            }
            // An unreadable zoneinfo file throws SecurityException on Unix. Escaping this static
            // initializer would break every deadline call for the life of the process.
            catch (Exception e) when (e is TimeZoneNotFoundException or InvalidTimeZoneException
                                          or System.Security.SecurityException)
            {
            }
        }
        return TimeZoneInfo.Local;
    }
}
