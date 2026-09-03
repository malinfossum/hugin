using Hugin.Core.Models;

namespace Hugin.Tests;

public class CoreTests
{
    private static readonly DateTimeOffset Now = new(2026, 9, 3, 10, 0, 0, TimeSpan.Zero);

    private static Ad MakeAd(bool isActive, DateTimeOffset? expires) =>
        new() { FeedId = "a", Title = "Utvikler", IsActive = isActive, Expires = expires };

    [Test]
    public void Scaffold_compiles_and_test_runs()
    {
        Assert.Pass();
    }

    [Test]
    public void An_active_ad_with_a_future_deadline_is_open()
    {
        Assert.That(MakeAd(true, Now.AddDays(3)).IsOpenAt(Now), Is.True);
    }

    [Test]
    public void An_active_ad_past_its_deadline_is_not_open()
    {
        Assert.That(MakeAd(true, Now.AddMinutes(-1)).IsOpenAt(Now), Is.False);
    }

    [Test]
    public void An_active_ad_without_a_deadline_is_open()
    {
        Assert.That(MakeAd(true, null).IsOpenAt(Now), Is.True);
    }

    [Test]
    public void An_ad_the_feed_has_closed_is_not_open_even_before_its_deadline()
    {
        Assert.That(MakeAd(false, Now.AddDays(3)).IsOpenAt(Now), Is.False);
    }

    [Test]
    public void An_ad_expiring_at_the_end_of_today_is_still_open()
    {
        // NAV's expires is end-of-day in local time (23:59:59+02:00) — the deadline day counts.
        var endOfToday = new DateTimeOffset(2026, 9, 3, 23, 59, 59, TimeSpan.FromHours(2));
        Assert.That(MakeAd(true, endOfToday).IsOpenAt(Now), Is.True);
    }
}
