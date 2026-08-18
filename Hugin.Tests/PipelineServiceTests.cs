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

    [Test]
    public async Task Known_company_creates_entry()
    {
        var h = await BuildAsync();

        var result = await h.Service.TrackAsync("934161181", PipelineStatus.Funnet, "nær Lillehammer", null, null);

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

        var result = await h.Service.TrackAsync(NorskTipping, PipelineStatus.Funnet, "stor IT-avdeling", null, null);

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
            await h.Service.TrackAsync("000000000", PipelineStatus.Funnet, null, null, null));

        Assert.That(ex!.Orgnr, Is.EqualTo("000000000"));
    }

    [Test]
    public async Task Status_beyond_funnet_with_empty_why_warns()
    {
        var h = await BuildAsync();

        var result = await h.Service.TrackAsync("934161181", PipelineStatus.SoektSelv, null, null, null);

        Assert.That(result.Warning, Does.Contain("begrunnelse"));
    }

    [Test]
    public async Task Funnet_without_why_does_not_warn()
    {
        var h = await BuildAsync();

        var result = await h.Service.TrackAsync("934161181", PipelineStatus.Funnet, null, null, null);

        Assert.That(result.Warning, Is.Null);
    }

    [Test]
    public async Task Second_track_updates_same_entry_and_preserves_created()
    {
        var h = await BuildAsync();
        await h.Service.TrackAsync("934161181", PipelineStatus.Funnet, "fordi", null, null);

        h.Clock.UtcNow = T2;
        var result = await h.Service.TrackAsync("934161181", PipelineStatus.SoektSelv, null, null, null);

        Assert.That(h.Pipeline.Store, Has.Count.EqualTo(1));
        Assert.That(result.Entry.Status, Is.EqualTo(PipelineStatus.SoektSelv));
        Assert.That(result.Entry.Created, Is.EqualTo(T1));
        Assert.That(result.Entry.Updated, Is.EqualTo(T2));
    }

    [Test]
    public async Task Why_is_never_overwritten_with_null()
    {
        var h = await BuildAsync();
        await h.Service.TrackAsync("934161181", PipelineStatus.Funnet, "den gode grunnen", "notat", "svaret");

        var result = await h.Service.TrackAsync("934161181", PipelineStatus.SoektSelv, null, null, null);

        Assert.That(result.Entry.Why, Is.EqualTo("den gode grunnen"));
        Assert.That(result.Entry.Note, Is.EqualTo("notat"));
        Assert.That(result.Entry.SvarText, Is.EqualTo("svaret"));
        Assert.That(result.Warning, Is.Null, "an existing begrunnelse still counts");
    }
}
