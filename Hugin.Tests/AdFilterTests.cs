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

    // The category gate: keywords cast a wide net ("utvikler" also catches
    // prosjektutvikler massivtre); NAV's own occupation category separates the
    // developer roles from the compounds.

    [Test]
    public void It_category_passes_the_gate()
        => Assert.That(AdFilter.MatchesCategory(["IT"], Config), Is.True);

    [Test]
    public void Category_match_is_case_insensitive()
        => Assert.That(AdFilter.MatchesCategory(["it"], Config), Is.True);

    [Test]
    public void Non_it_category_is_rejected()
        => Assert.That(AdFilter.MatchesCategory(["Bygg og anlegg"], Config), Is.False);

    [Test]
    public void One_matching_category_among_several_is_enough()
        => Assert.That(AdFilter.MatchesCategory(["Ingeniør", "IT"], Config), Is.True);

    [Test]
    public void Uncategorized_ad_passes_the_gate()
        => Assert.That(AdFilter.MatchesCategory([], Config), Is.True,
            "fail open — never discard what NAV did not categorize");

    [Test]
    public void No_configured_categories_disables_the_gate()
    {
        var cfg = new HuginConfig { Categories = [] };
        Assert.That(AdFilter.MatchesCategory(["Bygg og anlegg"], cfg), Is.True);
    }
}
