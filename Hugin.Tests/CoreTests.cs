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
        // NAV's expires is end-of-day in local time (23:59:59+02:00). The deadline day counts.
        var endOfToday = new DateTimeOffset(2026, 9, 3, 23, 59, 59, TimeSpan.FromHours(2));
        Assert.That(MakeAd(true, endOfToday).IsOpenAt(Now), Is.True);
    }

    [Test]
    public void Retrack_keeps_every_value_that_was_not_passed()
    {
        var entry = PipelineEntry.Track("123456789", PipelineStatus.Active, "god grunn", "notat", null,
            starred: true, Now);

        entry.Retrack(PipelineStatus.Applied, why: null, note: null, svar: "takk", starred: null, Now.AddDays(7));

        Assert.That(entry.Status, Is.EqualTo(PipelineStatus.Applied));
        Assert.That(entry.Why, Is.EqualTo("god grunn"));
        Assert.That(entry.Note, Is.EqualTo("notat"));
        Assert.That(entry.SvarText, Is.EqualTo("takk"));
        Assert.That(entry.Starred, Is.True);
        Assert.That(entry.Created, Is.EqualTo(Now), "Created belongs to the first sighting");
        Assert.That(entry.Updated, Is.EqualTo(Now.AddDays(7)));
    }

    [Test]
    public void Retrack_can_clear_the_star_on_purpose()
    {
        var entry = PipelineEntry.Track("123456789", PipelineStatus.Active, null, null, null, starred: true, Now);

        entry.Retrack(PipelineStatus.Active, null, null, null, starred: false, Now);

        Assert.That(entry.Starred, Is.False);
    }

    [TestCase(PipelineStatus.Active, "", false)]
    [TestCase(PipelineStatus.Applied, "", true)]
    [TestCase(PipelineStatus.Answered, "   ", true)]
    [TestCase(PipelineStatus.Applied, "god grunn", false)]
    public void Only_applied_and_answered_entries_need_a_why(PipelineStatus status, string why, bool needsWhy)
    {
        var entry = PipelineEntry.Track("123456789", status, why, null, null, null, Now);

        Assert.That(entry.NeedsWhy, Is.EqualTo(needsWhy));
    }
}
