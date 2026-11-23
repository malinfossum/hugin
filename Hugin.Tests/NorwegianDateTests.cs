using Hugin.Core.Services;

namespace Hugin.Tests;

[TestFixture]
public sealed class NorwegianDateTests
{
    [Test]
    public void Unknown_zone_ids_fall_back_to_the_machine_zone()
    {
        var zone = NorwegianDate.FindZone(["Nowhere/Atlantis", "Not A Zone"]);

        Assert.That(zone, Is.SameAs(TimeZoneInfo.Local));
    }

    [Test]
    public void The_real_ids_resolve_to_Norwegian_time()
    {
        var zone = NorwegianDate.FindZone(NorwegianDate.ZoneIds);

        Assert.That(NorwegianDate.IsNorwegianZone(zone), Is.True);
        Assert.That(zone.GetUtcOffset(new DateTime(2026, 11, 23)), Is.EqualTo(TimeSpan.FromHours(1)));
        Assert.That(zone.GetUtcOffset(new DateTime(2026, 6, 15)), Is.EqualTo(TimeSpan.FromHours(2)));
    }

    [Test]
    public void Each_id_resolves_on_its_own_when_the_other_is_missing()
    {
        foreach (var id in NorwegianDate.ZoneIds)
        {
            var zone = NorwegianDate.FindZone(["Nowhere/Atlantis", id]);
            Assert.That(NorwegianDate.IsNorwegianZone(zone), Is.True, id);
        }
    }

    [Test]
    public void Only_the_Norwegian_ids_count_as_Norwegian()
    {
        Assert.That(NorwegianDate.IsNorwegianZone(TimeZoneInfo.Utc), Is.False);
        var custom = TimeZoneInfo.CreateCustomTimeZone("Oslo-ish", TimeSpan.FromHours(1), "Oslo-ish", "Oslo-ish");
        Assert.That(NorwegianDate.IsNorwegianZone(custom), Is.False);
        Assert.That(NorwegianDate.IsNorwegian, Is.True, "This machine has a Norwegian zone.");
    }

    [Test]
    public void FormatDate_prints_the_Norwegian_date_with_periods()
    {
        Assert.That(NorwegianDate.FormatDate(new DateTimeOffset(2026, 11, 23, 23, 30, 0, TimeSpan.Zero)),
            Is.EqualTo("24.11.2026"));
        Assert.That(NorwegianDate.FormatDate(new DateTimeOffset(2026, 11, 23, 22, 59, 59, TimeSpan.Zero)),
            Is.EqualTo("23.11.2026"));
        Assert.That(NorwegianDate.FormatDate(new DateTimeOffset(2026, 1, 5, 12, 0, 0, TimeSpan.Zero)),
            Is.EqualTo("05.01.2026"));
    }

    [Test]
    public void FormatDateTime_prints_Norwegian_wall_time()
    {
        Assert.That(NorwegianDate.FormatDateTime(new DateTimeOffset(2026, 11, 23, 23, 30, 0, TimeSpan.Zero)),
            Is.EqualTo("24.11.2026 00:30"));
        // Summer time: 22:30 UTC is 00:30 the next day.
        Assert.That(NorwegianDate.FormatDateTime(new DateTimeOffset(2026, 6, 15, 22, 30, 0, TimeSpan.Zero)),
            Is.EqualTo("16.06.2026 00:30"));
    }

    [Test]
    public void AtWallTime_gives_a_Norwegian_wall_time_its_offset()
    {
        Assert.That(NorwegianDate.AtWallTime(new DateTime(2026, 11, 25, 23, 59, 59)),
            Is.EqualTo(new DateTimeOffset(2026, 11, 25, 23, 59, 59, TimeSpan.FromHours(1))));
        Assert.That(NorwegianDate.AtWallTime(new DateTime(2026, 6, 15, 23, 59, 59)).Offset,
            Is.EqualTo(TimeSpan.FromHours(2)));
    }
}
