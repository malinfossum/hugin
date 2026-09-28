using Hugin.Core.Abstractions;
using Hugin.Core.Models;
using Hugin.Core.Services;

namespace Hugin.Tests;

public class PipelineServiceTests
{
    private static readonly DateTimeOffset T1 = new(2026, 8, 18, 8, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset T2 = T1.AddDays(1);

    // NACE 92 — the discovery filter would never surface it, but tracking must still work.
    private const string NorskTipping = "925836613";

    private static RegisterCompany Known() =>
        new("934161181", "Norkart AS avd Lillehammer", "3405", "62.100", "934161000", true, null);

    private sealed record Harness(PipelineService Service, FakePipelineRepository Pipeline,
        FakeCompanyRepository Companies, FakeBrregClient Brreg, FakeClock Clock);

    private static async Task<Harness> BuildAsync(bool withKnownCompany = true, RegisterCompany? inBrreg = null)
    {
        var pipeline = new FakePipelineRepository();
        var companies = new FakeCompanyRepository();
        var clock = new FakeClock(T1);

        if (withKnownCompany) await companies.UpsertAsync(Known(), T1);

        var brreg = new FakeBrregClient();
        if (inBrreg is not null) brreg.ByOrgnr[inBrreg.Orgnr] = inBrreg;

        return new Harness(new PipelineService(pipeline, companies, brreg, clock), pipeline, companies, brreg, clock);
    }

    private static Task Register(Harness h, string orgnr, string name, string? parent = null) =>
        h.Companies.UpsertAsync(new RegisterCompany(orgnr, name, "3403", "62.100", parent, parent is not null, null), T1);

    private static void Tracked(Harness h, string orgnr, DateTimeOffset updated,
        PipelineStatus status = PipelineStatus.Applied) =>
        h.Pipeline.Store.Add(new PipelineEntry { Orgnr = orgnr, Status = status, Created = updated, Updated = updated });

    [Test]
    public async Task Known_company_creates_entry()
    {
        var h = await BuildAsync();

        var result = await h.Service.TrackAsync("934161181", PipelineStatus.Active, "nær Lillehammer", null, null);

        Assert.That(result.CompanyFetchedFromBrreg, Is.False);
        Assert.That(result.Warning, Is.Null);
        Assert.That(result.Entry.Why, Is.EqualTo("nær Lillehammer"));
        Assert.That(h.Pipeline.Store, Has.Count.EqualTo(1));
        Assert.That(result.Entry.Created, Is.EqualTo(T1));
    }

    [Test]
    public async Task Unknown_orgnr_is_fetched_from_brreg_and_stored()
    {
        var tipping = new RegisterCompany(NorskTipping, "NORSK TIPPING AS", "3407", "92.000", null, false, null);
        var h = await BuildAsync(inBrreg: tipping);

        var result = await h.Service.TrackAsync(NorskTipping, PipelineStatus.Active, "stor IT-avdeling", null, null);

        Assert.That(result.CompanyFetchedFromBrreg, Is.True);
        Assert.That(h.Companies.Store.ContainsKey(NorskTipping), Is.True,
            "the NACE filter governs discovery, never tracking");
        Assert.That(h.Companies.Store[NorskTipping].NaceCode, Is.EqualTo("92.000"));
    }

    [Test]
    public void Unknown_orgnr_not_in_brreg_throws_CompanyNotFound()
    {
        var h = BuildAsync().Result;

        var ex = Assert.ThrowsAsync<CompanyNotFoundException>(async () =>
            await h.Service.TrackAsync("000000000", PipelineStatus.Active, null, null, null));

        Assert.That(ex!.Orgnr, Is.EqualTo("000000000"));
    }

    [Test]
    public async Task Status_beyond_active_with_empty_why_warns()
    {
        var h = await BuildAsync();

        var result = await h.Service.TrackAsync("934161181", PipelineStatus.Applied, null, null, null);

        Assert.That(result.Warning, Does.Contain("begrunnelse"));
    }

    [Test]
    public async Task Answered_with_empty_why_also_warns()
    {
        var h = await BuildAsync();

        var result = await h.Service.TrackAsync("934161181", PipelineStatus.Answered, null, null, null);

        Assert.That(result.Warning, Does.Contain("begrunnelse"));
    }

    [Test]
    public async Task Active_without_why_does_not_warn()
    {
        var h = await BuildAsync();

        var result = await h.Service.TrackAsync("934161181", PipelineStatus.Active, null, null, null);

        Assert.That(result.Warning, Is.Null);
    }

    [Test]
    public async Task Second_track_updates_same_entry_and_preserves_created()
    {
        var h = await BuildAsync();
        await h.Service.TrackAsync("934161181", PipelineStatus.Active, "fordi", null, null);

        h.Clock.UtcNow = T2;
        var result = await h.Service.TrackAsync("934161181", PipelineStatus.Applied, null, null, null);

        Assert.That(h.Pipeline.Store, Has.Count.EqualTo(1));
        Assert.That(result.Entry.Status, Is.EqualTo(PipelineStatus.Applied));
        Assert.That(result.Entry.Created, Is.EqualTo(T1));
        Assert.That(result.Entry.Updated, Is.EqualTo(T2));
    }

    [Test]
    public async Task Why_is_never_overwritten_with_null()
    {
        var h = await BuildAsync();
        await h.Service.TrackAsync("934161181", PipelineStatus.Active, "den gode grunnen", "notat", "svaret");

        var result = await h.Service.TrackAsync("934161181", PipelineStatus.Applied, null, null, null);

        Assert.That(result.Entry.Why, Is.EqualTo("den gode grunnen"));
        Assert.That(result.Entry.Note, Is.EqualTo("notat"));
        Assert.That(result.Entry.SvarText, Is.EqualTo("svaret"));
        Assert.That(result.Warning, Is.Null, "an existing begrunnelse still counts");
    }

    [Test]
    public async Task Starred_defaults_to_false()
    {
        var h = await BuildAsync();

        var result = await h.Service.TrackAsync("934161181", PipelineStatus.Active, "fordi", null, null);

        Assert.That(result.Entry.Starred, Is.False);
    }

    [Test]
    public async Task Starred_can_be_set_on_track()
    {
        var h = await BuildAsync();

        var result = await h.Service.TrackAsync("934161181", PipelineStatus.Active, "fordi", null, null, starred: true);

        Assert.That(result.Entry.Starred, Is.True);
    }

    [Test]
    public async Task Starred_survives_a_status_only_edit()
    {
        var h = await BuildAsync();
        await h.Service.TrackAsync("934161181", PipelineStatus.Active, "fordi", null, null, starred: true);

        var result = await h.Service.TrackAsync("934161181", PipelineStatus.Applied, null, null, null);

        Assert.That(result.Entry.Starred, Is.True, "a status-only edit must not clear the star");
        Assert.That((await h.Pipeline.GetByOrgnrAsync("934161181"))!.Starred, Is.True,
            "the stored row must keep the star too, not just the returned entry");
    }

    [Test]
    public async Task Starred_can_be_cleared_explicitly()
    {
        var h = await BuildAsync();
        await h.Service.TrackAsync("934161181", PipelineStatus.Active, "fordi", null, null, starred: true);

        var result = await h.Service.TrackAsync("934161181", PipelineStatus.Active, null, null, null, starred: false);

        Assert.That(result.Entry.Starred, Is.False);
    }

    [Test]
    public async Task Untrack_returns_the_removed_entry_and_the_company_name()
    {
        var h = await BuildAsync();
        await h.Service.TrackAsync("934161181", PipelineStatus.Applied, "grunn", "notat", null);

        var result = await h.Service.UntrackAsync("934161181");

        Assert.That(result, Is.Not.Null);
        Assert.That(result!.Removal.Entry.Orgnr, Is.EqualTo("934161181"));
        Assert.That(result.Removal.Entry.Note, Is.EqualTo("notat"));
        Assert.That(result.CompanyName, Is.EqualTo("Norkart AS avd Lillehammer"));
        Assert.That(h.Pipeline.Store, Is.Empty);
        Assert.That(h.Companies.Store.ContainsKey("934161181"), Is.True, "companies are never deleted");
    }

    [Test]
    public async Task Untrack_of_an_untracked_orgnr_returns_null()
    {
        var h = await BuildAsync();

        Assert.That(await h.Service.UntrackAsync("934161181"), Is.Null);
    }

    [Test]
    public async Task Untrack_without_a_company_row_gives_a_null_name()
    {
        var h = await BuildAsync(withKnownCompany: false);
        h.Pipeline.Store.Add(new PipelineEntry { Orgnr = "111111111", Created = T1, Updated = T1 });

        var result = await h.Service.UntrackAsync("111111111");

        Assert.That(result!.CompanyName, Is.Null);
        Assert.That(h.Pipeline.Store, Is.Empty);
    }

    [Test]
    public async Task Untrack_never_calls_brreg()
    {
        var h = await BuildAsync(withKnownCompany: false);
        h.Pipeline.Store.Add(new PipelineEntry { Orgnr = "111111111", Created = T1, Updated = T1 });

        await h.Service.UntrackAsync("111111111");

        Assert.That(h.Brreg.ByOrgnrRequests, Is.Empty, "untrack never touches the network");
    }

    [Test]
    public async Task A_branch_of_a_tracked_parent_is_family()
    {
        var h = await BuildAsync(withKnownCompany: false);
        await Register(h, "200000000", "NORDLYS KONSULENT AS");
        await Register(h, "111111111", "BERGTATT AS AVD HAMAR", parent: "200000000");
        Tracked(h, "200000000", T1);
        h.Clock.UtcNow = T2;

        var result = await h.Service.TrackAsync("111111111", PipelineStatus.Active, "grunn", null, null);

        Assert.That(result.Related, Has.Count.EqualTo(1));
        Assert.That(result.Related[0].Entry.Orgnr, Is.EqualTo("200000000"));
        Assert.That(result.Related[0].Name, Is.EqualTo("NORDLYS KONSULENT AS"));
        Assert.That(result.Related[0].Kind, Is.EqualTo(RelationKind.Family));
        Assert.That(h.Pipeline.Store, Has.Count.EqualTo(2), "warn, never block");
    }

    [Test]
    public async Task The_parent_of_a_tracked_branch_is_family()
    {
        var h = await BuildAsync(withKnownCompany: false);
        await Register(h, "200000000", "NORDLYS KONSULENT AS");
        await Register(h, "111111111", "BERGTATT AS AVD HAMAR", parent: "200000000");
        Tracked(h, "111111111", T1);

        var result = await h.Service.TrackAsync("200000000", PipelineStatus.Active, "grunn", null, null);

        Assert.That(result.Related.Select(r => (r.Entry.Orgnr, r.Kind)),
            Is.EqualTo(new[] { ("111111111", RelationKind.Family) }));
    }

    [Test]
    public async Task Two_branches_of_a_parent_without_its_own_row_are_family()
    {
        var h = await BuildAsync(withKnownCompany: false);
        await Register(h, "111111111", "NORDLYS AS AVD HAMAR", parent: "300000000");
        await Register(h, "222222222", "BERGTATT AS AVD GJØVIK", parent: "300000000");
        Tracked(h, "222222222", T1);

        var result = await h.Service.TrackAsync("111111111", PipelineStatus.Active, "grunn", null, null);

        Assert.That(result.Related.Select(r => (r.Entry.Orgnr, r.Kind)),
            Is.EqualTo(new[] { ("222222222", RelationKind.Family) }));
    }

    [Test]
    public async Task A_branch_sharing_a_brand_with_a_standalone_tracked_company_is_brand()
    {
        // The shape that triggered v3.7: the new branch's parent is not tracked, and the tracked
        // company is a separate company with no parent — only the brand word links them.
        var h = await BuildAsync(withKnownCompany: false);
        await Register(h, "222222222", "AKME IT SOLUTIONS AS");
        await Register(h, "111111111", "AKME PROFESSIONALS AS AVD HEDMARK", parent: "333333333");
        Tracked(h, "222222222", T1);

        var result = await h.Service.TrackAsync("111111111", PipelineStatus.Applied, "grunn", null, null);

        Assert.That(result.Related.Select(r => (r.Entry.Orgnr, r.Name, r.Kind)),
            Is.EqualTo(new[] { ("222222222", "AKME IT SOLUTIONS AS", RelationKind.Brand) }));
    }

    [Test]
    public async Task A_company_fetched_from_brreg_on_this_call_is_compared_by_its_fetched_name()
    {
        var branch = new RegisterCompany("111111111", "AKME PROFESSIONALS AS AVD HEDMARK", "3403", "62.100",
            "333333333", true, null);
        var h = await BuildAsync(withKnownCompany: false, inBrreg: branch);
        await Register(h, "222222222", "AKME IT SOLUTIONS AS");
        Tracked(h, "222222222", T1);

        var result = await h.Service.TrackAsync("111111111", PipelineStatus.Applied, "grunn", null, null);

        Assert.That(result.CompanyFetchedFromBrreg, Is.True);
        Assert.That(result.Related.Select(r => r.Kind), Is.EqualTo(new[] { RelationKind.Brand }));
    }

    [Test]
    public async Task Unrelated_companies_give_no_relatives_and_the_new_row_is_not_its_own_relative()
    {
        var h = await BuildAsync(withKnownCompany: false);
        await Register(h, "222222222", "FJELLTOPP DATA AS");
        await Register(h, "111111111", "AKME PROFESSIONALS AS");
        Tracked(h, "222222222", T1);

        var result = await h.Service.TrackAsync("111111111", PipelineStatus.Active, "grunn", null, null);

        Assert.That(result.Related, Is.Empty);
    }

    [Test]
    public async Task Generic_only_names_give_no_relatives()
    {
        var h = await BuildAsync(withKnownCompany: false);
        await Register(h, "222222222", "NORSK DATA SYSTEMS AS");
        await Register(h, "111111111", "IT DATA AS");
        Tracked(h, "222222222", T1);

        var result = await h.Service.TrackAsync("111111111", PipelineStatus.Active, "grunn", null, null);

        Assert.That(result.Related, Is.Empty);
    }

    [Test]
    public async Task Re_tracking_an_existing_entry_never_warns()
    {
        var h = await BuildAsync(withKnownCompany: false);
        await Register(h, "222222222", "AKME IT SOLUTIONS AS");
        await Register(h, "111111111", "AKME PROFESSIONALS AS");
        Tracked(h, "222222222", T1);
        Tracked(h, "111111111", T1, PipelineStatus.Active);

        var result = await h.Service.TrackAsync("111111111", PipelineStatus.Applied, "grunn", null, null);

        Assert.That(result.Related, Is.Empty);
    }

    [Test]
    public async Task Family_and_brand_on_one_entry_is_one_family_line()
    {
        var h = await BuildAsync(withKnownCompany: false);
        await Register(h, "200000000", "AKME AS");
        await Register(h, "111111111", "AKME AS AVD HAMAR", parent: "200000000");
        Tracked(h, "200000000", T1);

        var result = await h.Service.TrackAsync("111111111", PipelineStatus.Active, "grunn", null, null);

        Assert.That(result.Related.Select(r => r.Kind), Is.EqualTo(new[] { RelationKind.Family }));
    }

    [Test]
    public async Task Relatives_are_ordered_newest_first_then_by_orgnr()
    {
        var h = await BuildAsync(withKnownCompany: false);
        await Register(h, "444444444", "AKME DRIFT AS");
        await Register(h, "333333333", "AKME SKY AS");
        await Register(h, "222222222", "AKME KODE AS");
        await Register(h, "111111111", "AKME PROFESSIONALS AS");
        Tracked(h, "444444444", T1);
        Tracked(h, "333333333", T1);
        Tracked(h, "222222222", T1.AddHours(-1));
        h.Clock.UtcNow = T2;

        var result = await h.Service.TrackAsync("111111111", PipelineStatus.Active, "grunn", null, null);

        Assert.That(result.Related.Select(r => r.Entry.Orgnr),
            Is.EqualTo(new[] { "333333333", "444444444", "222222222" }));
    }

    [Test]
    public async Task A_tracked_entry_without_a_company_row_is_skipped()
    {
        var h = await BuildAsync(withKnownCompany: false);
        await Register(h, "111111111", "AKME PROFESSIONALS AS");
        Tracked(h, "999999999", T1);

        var result = await h.Service.TrackAsync("111111111", PipelineStatus.Active, "grunn", null, null);

        Assert.That(result.Related, Is.Empty);
        Assert.That(h.Pipeline.Store, Has.Count.EqualTo(2));
    }
}
