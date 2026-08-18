using Hugin.Core.Abstractions;
using Hugin.Core.Config;
using Hugin.Core.Services;

namespace Hugin.Tests;

public class AdFilterTests
{
    private static readonly HuginConfig Config = new();  // defaults: Innlandet municipalities + dev keywords

    private static FeedAd Ad(string title, string? kommune) =>
        new("id1", title, "Firma AS", null, kommune, null, null, null, true);

    [Test]
    public void Matches_keyword_in_configured_municipality()
        => Assert.That(AdFilter.Matches(Ad("Utvikler søkes", "3405"), Config), Is.True);

    [Test]
    public void Keyword_match_is_case_insensitive()
        => Assert.That(AdFilter.Matches(Ad("BACKEND-UTVIKLER", "3407"), Config), Is.True);

    [Test]
    public void Rejects_wrong_municipality()
        => Assert.That(AdFilter.Matches(Ad("Utvikler søkes", "0301"), Config), Is.False);

    [Test]
    public void Rejects_no_keyword()
        => Assert.That(AdFilter.Matches(Ad("Sykepleier natt", "3405"), Config), Is.False);

    [Test]
    public void Missing_municipality_rejected()
        => Assert.That(AdFilter.Matches(Ad("Utvikler", null), Config), Is.False);

    [Test]
    public void Empty_keyword_list_matches_all_titles_in_region()
    {
        var cfg = new HuginConfig { Keywords = [] };
        Assert.That(AdFilter.Matches(Ad("Hva som helst", "3403"), cfg), Is.True);
    }
}
