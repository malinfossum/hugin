using Hugin.Core.Models;

namespace Hugin.Core.Services;

public enum WebsiteFilter { Any, Has, None }

/// <summary>One page of the company list. <see cref="Coverage"/> is the configured coverage
/// (null: all of Norway, or none chosen yet); the store keeps companies from wider coverage
/// chosen earlier, and those are out of the list. <see cref="Fylker"/> (whole fylker, two-digit
/// codes) and <see cref="Kommuner"/> (single kommuner) are the dashboard's display filter, sent by
/// the browser that holds it; both empty means all of the coverage.</summary>
public sealed record CompanyListQuery(
    IReadOnlyCollection<string> Fylker,
    IReadOnlyCollection<string> Kommuner,
    string? Search,
    WebsiteFilter Website,
    bool OpenAdsOnly,
    int Offset,
    int Limit,
    IReadOnlySet<string>? Coverage = null);

/// <summary>A hovedenhet with the branches (underenheter) listed under it.</summary>
public sealed record CompanyGroup(Company Main, IReadOnlyList<Company> Branches);

/// <summary><see cref="Total"/> counts every group that matches, not just this page's.</summary>
public sealed record CompanyPage(int Total, IReadOnlyList<CompanyGroup> Groups);

/// <summary>
/// The Companies view's list, filtered and paged on the server so a browser never downloads the
/// whole register (tens of thousands of rows with coverage across Norway). One row per company:
/// branches group under their parent when the parent is in the store. A group is listed when its
/// main unit or any branch matches the region, search and website filters; "open ads only" counts
/// the whole group's open ads. Groups keep the order of <paramref name="companies"/> by main unit.
/// </summary>
public static class CompanyListing
{
    public static CompanyPage Page(
        IReadOnlyList<Company> companies,
        CompanyListQuery query,
        IReadOnlyDictionary<string, int> openAds,
        Func<Company, bool> hasWebsite)
    {
        var groups = Group(companies);
        var search = string.IsNullOrWhiteSpace(query.Search) ? null : query.Search.Trim().ToLowerInvariant();

        bool Matches(Company c) =>
            InCoverage(c.MunicipalityNumber, query.Coverage)
            && InRegion(c.MunicipalityNumber, query)
            && (search is null || c.Name.ToLowerInvariant().Contains(search))
            && query.Website switch
            {
                WebsiteFilter.Has => hasWebsite(c),
                WebsiteFilter.None => !hasWebsite(c),
                _ => true,
            };

        int OpenAds(CompanyGroup g) =>
            openAds.GetValueOrDefault(g.Main.Orgnr) + g.Branches.Sum(b => openAds.GetValueOrDefault(b.Orgnr));

        var visible = groups
            .Where(g => (Matches(g.Main) || g.Branches.Any(Matches)) && (!query.OpenAdsOnly || OpenAds(g) > 0))
            .ToList();
        return new CompanyPage(visible.Count, visible.Skip(query.Offset).Take(query.Limit).ToList());
    }

    /// <summary>Region is the hard gate: a company placed outside the coverage is not listed. One
    /// with no kommune can't be placed, so it passes, as it does the display filter.</summary>
    private static bool InCoverage(string? kommune, IReadOnlySet<string>? coverage) =>
        coverage is null || kommune is null || coverage.Contains(kommune);

    /// <summary>No region chosen, or no kommune on the company (it can't be placed): it passes.
    /// Otherwise its fylke is the first two digits of its kommune number.</summary>
    private static bool InRegion(string? kommune, CompanyListQuery query)
    {
        if ((query.Fylker.Count == 0 && query.Kommuner.Count == 0) || kommune is null) return true;
        var fylke = kommune.Length >= 2 ? kommune[..2] : null;
        return (fylke is not null && query.Fylker.Contains(fylke)) || query.Kommuner.Contains(kommune);
    }

    /// <summary>Brreg's register is two-tier (hovedenhet + underenheter). A branch groups under
    /// its parent only when the parent is present and is not itself a branch; otherwise the branch
    /// stands as its own row, so a chain or a loop never duplicates a row.</summary>
    private static List<CompanyGroup> Group(IReadOnlyList<Company> companies)
    {
        var byOrgnr = companies.ToDictionary(c => c.Orgnr);
        var branches = new Dictionary<string, List<Company>>();
        var mains = new List<Company>();
        foreach (var c in companies)
        {
            if (c.ParentOrgnr is { } parentOrgnr && parentOrgnr != c.Orgnr
                && byOrgnr.TryGetValue(parentOrgnr, out var parent) && !parent.IsBranch)
            {
                if (!branches.TryGetValue(parentOrgnr, out var list)) branches[parentOrgnr] = list = [];
                list.Add(c);
            }
            else
            {
                mains.Add(c);
            }
        }
        // Mains are collected in input order, which is the list's order.
        return mains.Select(m => new CompanyGroup(m, branches.TryGetValue(m.Orgnr, out var b) ? b : [])).ToList();
    }
}
