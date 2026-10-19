using Hugin.Core.Models;
using Hugin.Core.Services;

namespace Hugin.Tests;

public class CompanyListingTests
{
    private static Company C(string orgnr, string name, string? kommune = "3403", string? parent = null,
        bool branch = false, string? website = null) =>
        new()
        {
            Orgnr = orgnr,
            Name = name,
            MunicipalityNumber = kommune,
            ParentOrgnr = parent,
            IsBranch = branch,
            Website = website
        };

    private static CompanyListQuery Query(string[]? fylker = null, string[]? kommuner = null, string? search = null,
        WebsiteFilter website = WebsiteFilter.Any, bool openOnly = false, int offset = 0, int limit = 100) =>
        new(fylker ?? [], kommuner ?? [], search, website, openOnly, offset, limit);

    private static readonly Dictionary<string, int> NoAds = [];

    private static CompanyPage Page(IReadOnlyList<Company> companies, CompanyListQuery query,
        Dictionary<string, int>? openAds = null) =>
        CompanyListing.Page(companies, query, openAds ?? NoAds, c => c.Website is not null);

    private static string[] Mains(CompanyPage page) => page.Groups.Select(g => g.Main.Orgnr).ToArray();

    [Test]
    public void Groups_branches_under_their_parent_in_list_order()
    {
        var page = Page([C("1", "ACME AS"), C("2", "ACME AS", parent: "1", branch: true), C("3", "BETA AS")], Query());

        Assert.That(Mains(page), Is.EqualTo(new[] { "1", "3" }));
        Assert.That(page.Groups[0].Branches.Select(b => b.Orgnr), Is.EqualTo(new[] { "2" }));
        Assert.That(page.Total, Is.EqualTo(2));
    }

    [Test]
    public void A_branch_without_its_parent_in_the_store_stands_alone()
    {
        var page = Page([C("2", "ACME AVD", parent: "1", branch: true)], Query());

        Assert.That(Mains(page), Is.EqualTo(new[] { "2" }));
    }

    [Test]
    public void A_branch_pointing_at_another_branch_is_not_grouped_under_it()
    {
        var page = Page([C("1", "A", branch: true, parent: "9"), C("2", "B", branch: true, parent: "1")], Query());

        Assert.That(Mains(page), Is.EqualTo(new[] { "1", "2" }));
    }

    [Test]
    public void Region_lens_matches_whole_fylker_and_single_kommuner()
    {
        var companies = new[] { C("1", "HAMAR AS", "3403"), C("2", "OSLO AS", "0301"), C("3", "BERGEN AS", "4601") };

        Assert.That(Mains(Page(companies, Query(fylker: ["34"]))), Is.EqualTo(new[] { "1" }));
        Assert.That(Mains(Page(companies, Query(fylker: ["34"], kommuner: ["0301"]))), Is.EqualTo(new[] { "1", "2" }));
    }

    [Test]
    public void Coverage_is_the_hard_gate_under_the_display_filter()
    {
        // The store still holds companies from a wider coverage chosen earlier.
        var companies = new[] { C("1", "GJØVIK AS", "3407"), C("2", "OSLO AS", "0301"), C("3", "STEDLØS AS", null) };
        var coverage = new HashSet<string> { "3407" };

        Assert.That(Mains(Page(companies, Query() with { Coverage = coverage })), Is.EqualTo(new[] { "1", "3" }));
        Assert.That(Mains(Page(companies, Query(kommuner: ["0301"]) with { Coverage = coverage })),
            Is.EqualTo(new[] { "3" }), "the display filter narrows within the coverage, never past it");
    }

    [Test]
    public void A_parent_outside_the_coverage_is_listed_for_its_branch_inside()
    {
        var companies = new[] { C("1", "ACME AS", "0301"), C("2", "ACME AS", "3407", parent: "1", branch: true) };

        var page = Page(companies, Query() with { Coverage = new HashSet<string> { "3407" } });

        Assert.That(Mains(page), Is.EqualTo(new[] { "1" }));
    }

    [Test]
    public void A_company_without_a_kommune_passes_the_region_lens()
    {
        var page = Page([C("1", "STEDLØS AS", kommune: null)], Query(fylker: ["34"]));

        Assert.That(Mains(page), Is.EqualTo(new[] { "1" }));
    }

    [Test]
    public void A_group_shows_when_only_a_branch_is_in_the_region()
    {
        var companies = new[] { C("1", "ACME AS", "0301"), C("2", "ACME AS", "3403", parent: "1", branch: true) };

        var page = Page(companies, Query(kommuner: ["3403"]));

        Assert.That(Mains(page), Is.EqualTo(new[] { "1" }));
        Assert.That(page.Groups[0].Branches, Has.Count.EqualTo(1));
    }

    [Test]
    public void Search_is_a_case_insensitive_name_substring()
    {
        var page = Page([C("1", "NYFJELL SPILL AS"), C("2", "BETA AS")], Query(search: "  spill "));

        Assert.That(Mains(page), Is.EqualTo(new[] { "1" }));
    }

    [Test]
    public void Website_filter_has_and_none()
    {
        var companies = new[] { C("1", "MED AS", website: "https://med.no"), C("2", "UTEN AS") };

        Assert.That(Mains(Page(companies, Query(website: WebsiteFilter.Has))), Is.EqualTo(new[] { "1" }));
        Assert.That(Mains(Page(companies, Query(website: WebsiteFilter.None))), Is.EqualTo(new[] { "2" }));
    }

    [Test]
    public void Open_ads_only_counts_the_whole_group()
    {
        var companies = new[] { C("1", "ACME AS"), C("2", "ACME AS", parent: "1", branch: true), C("3", "BETA AS") };

        var page = Page(companies, Query(openOnly: true), new Dictionary<string, int> { ["2"] = 1 });

        Assert.That(Mains(page), Is.EqualTo(new[] { "1" }));
    }

    [Test]
    public void Pages_by_group_and_reports_the_full_total()
    {
        var companies = Enumerable.Range(1, 5).Select(i => C($"{i}", $"FIRMA {i}")).ToArray();

        var page = Page(companies, Query(offset: 2, limit: 2));

        Assert.That(page.Total, Is.EqualTo(5));
        Assert.That(Mains(page), Is.EqualTo(new[] { "3", "4" }));
    }
}
