namespace Hugin.Core.Services;

/// <summary>
/// Calendar days in Norway. A NAV frist is the end of a Norwegian day (NAV sends
/// <c>23:59:59+01:00</c> in winter, <c>+02:00</c> in summer) and Brreg's registration dates are
/// Norwegian days too, so day counts and printed dates go through this zone. Never the UTC date,
/// which lags it by up to two hours, and never the machine's zone, which is UTC in the container.
/// </summary>
public static class NorwegianDate
{
    public static TimeZoneInfo Zone { get; } = FindZone();

    /// <summary>The Norwegian calendar date of an instant.</summary>
    public static DateOnly Of(DateTimeOffset instant) =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(instant, Zone).DateTime);

    /// <summary>23:59:59 on a Norwegian date, with that date's offset (summer time included).</summary>
    public static DateTimeOffset EndOf(DateOnly date)
    {
        var local = date.ToDateTime(new TimeOnly(23, 59, 59));
        return new DateTimeOffset(local, Zone.GetUtcOffset(local));
    }

    private static TimeZoneInfo FindZone()
    {
        foreach (var id in new[] { "Europe/Oslo", "W. Europe Standard Time" })
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById(id);
            }
            catch (TimeZoneNotFoundException)
            {
            }
            catch (InvalidTimeZoneException)
            {
            }
        }
        return TimeZoneInfo.Local;
    }
}
