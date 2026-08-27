using System.Net;
using System.Net.Http.Json;
using Hugin.Core.Abstractions;
using Hugin.Core.Models;
using Microsoft.Extensions.DependencyInjection;

namespace Hugin.Tests.Api;

public sealed record NewDtoProbe(List<CompanyDtoProbe> Companies, List<object> Ads, DateTimeOffset Since, DateTimeOffset AsOf);
public sealed record CompanyDtoProbe(string Orgnr, string Name, string? KommuneNavn, string? Website);
public sealed record CompanyDetailDtoProbe(CompanyDtoProbe Company, List<AdDtoProbe> Ads,
    List<CompanyDtoProbe> Branches);
public sealed record PipelineDtoProbe(string Orgnr, string CompanyName, string Status, bool Starred);
public sealed record StatusDtoProbe(object? Brreg, object? Nav, DateTimeOffset? ReviewMark, int ActiveAds,
    int Companies, int PipelineEntries);

[TestFixture]
public sealed class ReadEndpointTests
{
    private ApiFactory _factory = null!;
    private HttpClient _client = null!;

    [SetUp]
    public void Up()
    {
        _factory = new ApiFactory();
        _client = _factory.CreateApiClient();
    }

    [TearDown]
    public void Down()
    {
        _client.Dispose();
        _factory.Dispose();
    }

    [Test]
    public async Task New_returns_204_when_no_sync_has_run()
    {
        var response = await _client.GetAsync("/api/new");
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.NoContent));
    }

    [Test]
    public async Task New_returns_200_with_asof_after_mark_is_set()
    {
        var since = new DateTimeOffset(2026, 8, 10, 0, 0, 0, TimeSpan.Zero);
        using (var scope = _factory.Services.CreateScope())
        {
            await scope.ServiceProvider.GetRequiredService<IReviewMarkRepository>().SetAsync(since);
            await scope.ServiceProvider.GetRequiredService<ICompanyRepository>()
                .UpsertAsync(new RegisterCompany("999888777", "Ferskvare AS", "3407", "62.100", null, false, null),
                    since.AddDays(1));
        }

        var response = await _client.GetAsync("/api/new");
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.OK));

        var dto = await response.Content.ReadFromJsonAsync<NewDtoProbe>();
        Assert.That(dto!.Companies.Select(c => c.Orgnr), Is.EqualTo(new[] { "999888777" }));
        Assert.That(dto.Since, Is.EqualTo(since));
        Assert.That(dto.AsOf, Is.GreaterThanOrEqualTo(dto.Since));
    }

    [Test]
    public async Task Companies_list_resolves_kommune_navn_from_config()
    {
        var now = DateTimeOffset.UtcNow;
        using (var scope = _factory.Services.CreateScope())
        {
            await scope.ServiceProvider.GetRequiredService<ICompanyRepository>()
                .UpsertAsync(new RegisterCompany("999888777", "Ferskvare AS", "3407", "62.100", null, false, null), now);
        }

        var response = await _client.GetAsync("/api/companies");
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.OK));

        var companies = await response.Content.ReadFromJsonAsync<List<CompanyDtoProbe>>();
        Assert.That(companies!.Single(c => c.Orgnr == "999888777").KommuneNavn, Is.EqualTo("Gjøvik"));
    }

    [Test]
    public async Task Companies_list_resolves_kommune_navn_from_the_register_when_config_does_not_have_it()
    {
        var now = DateTimeOffset.UtcNow;
        using (var scope = _factory.Services.CreateScope())
        {
            // 0301 (Oslo) is outside the configured municipality list — a parent or an
            // enriched ad employer sitting in the capital, resolved only via the register.
            await scope.ServiceProvider.GetRequiredService<ICompanyRepository>()
                .UpsertAsync(new RegisterCompany("111222333", "Oslo-kontoret AS", "0301", "62.100", null, false, null), now);
            await scope.ServiceProvider.GetRequiredService<ICompanyRepository>()
                .UpsertAsync(new RegisterCompany("999888777", "Ferskvare AS", "3407", "62.100", null, false, null), now);
            await scope.ServiceProvider.GetRequiredService<IKommuneRepository>()
                .UpsertManyAsync([new Kommune { Number = "0301", Name = "Oslo" }]);
        }

        var response = await _client.GetAsync("/api/companies");
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.OK));

        var companies = await response.Content.ReadFromJsonAsync<List<CompanyDtoProbe>>();
        Assert.That(companies!.Single(c => c.Orgnr == "111222333").KommuneNavn, Is.EqualTo("Oslo"));
        Assert.That(companies!.Single(c => c.Orgnr == "999888777").KommuneNavn, Is.EqualTo("Gjøvik"),
            "the configured municipality name still wins over the register");
    }

    [Test]
    public async Task Companies_list_hides_the_website_when_the_check_marks_it_dead()
    {
        var now = DateTimeOffset.UtcNow;
        using (var scope = _factory.Services.CreateScope())
        {
            var repo = scope.ServiceProvider.GetRequiredService<ICompanyRepository>();
            await repo.UpsertAsync(new RegisterCompany("999888777", "Dødt AS", "3407", "62.100", null, false,
                "https://dodt-firma.no"), now);
            await repo.SetWebsiteCheckAsync("999888777", ok: false, resolvedUrl: null, now);
        }

        var response = await _client.GetAsync("/api/companies");
        var companies = await response.Content.ReadFromJsonAsync<List<CompanyDtoProbe>>();

        Assert.That(companies!.Single(c => c.Orgnr == "999888777").Website, Is.Null,
            "a confirmed-dead website must not be rendered as a link");
    }

    [Test]
    public async Task Companies_list_prefers_the_resolved_website_when_the_check_confirms_a_different_variant()
    {
        var now = DateTimeOffset.UtcNow;
        using (var scope = _factory.Services.CreateScope())
        {
            var repo = scope.ServiceProvider.GetRequiredService<ICompanyRepository>();
            await repo.UpsertAsync(new RegisterCompany("999888777", "Http-firma AS", "3407", "62.100", null, false,
                "https://httponly.no"), now);
            await repo.SetWebsiteCheckAsync("999888777", ok: true, resolvedUrl: "http://httponly.no", now);
        }

        var response = await _client.GetAsync("/api/companies");
        var companies = await response.Content.ReadFromJsonAsync<List<CompanyDtoProbe>>();

        Assert.That(companies!.Single(c => c.Orgnr == "999888777").Website, Is.EqualTo("http://httponly.no"));
    }

    [Test]
    public async Task Companies_list_shows_the_register_website_when_never_checked()
    {
        var now = DateTimeOffset.UtcNow;
        using (var scope = _factory.Services.CreateScope())
        {
            await scope.ServiceProvider.GetRequiredService<ICompanyRepository>()
                .UpsertAsync(new RegisterCompany("999888777", "Ukontrollert AS", "3407", "62.100", null, false,
                    "https://ukontrollert.no"), now);
        }

        var response = await _client.GetAsync("/api/companies");
        var companies = await response.Content.ReadFromJsonAsync<List<CompanyDtoProbe>>();

        Assert.That(companies!.Single(c => c.Orgnr == "999888777").Website, Is.EqualTo("https://ukontrollert.no"));
    }

    [Test]
    public async Task Company_detail_404_for_unknown_orgnr()
    {
        var response = await _client.GetAsync("/api/companies/000000000");
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.NotFound));
    }

    [Test]
    public async Task Company_detail_returns_ad_history_for_known_orgnr()
    {
        var now = DateTimeOffset.UtcNow;
        using (var scope = _factory.Services.CreateScope())
        {
            await scope.ServiceProvider.GetRequiredService<ICompanyRepository>()
                .UpsertAsync(new RegisterCompany("999888777", "Ferskvare AS", "3407", "62.100", null, false, null), now);
            var adRepo = scope.ServiceProvider.GetRequiredService<IAdRepository>();
            await adRepo.UpsertAsync(new FeedAd("a1", "Utvikler", "Ferskvare AS", "999888777", "3407",
                now.AddDays(-40), now.AddDays(-30), "https://x", false, "IT"), now);
            await adRepo.UpsertAsync(new FeedAd("a2", "Utvikler 2", "Ferskvare AS", "999888777", "3407",
                now, now.AddDays(10), "https://x", true, "IT"), now);
        }

        var response = await _client.GetAsync("/api/companies/999888777");
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.OK));

        var dto = await response.Content.ReadFromJsonAsync<CompanyDetailDtoProbe>();
        Assert.That(dto!.Company.Name, Is.EqualTo("Ferskvare AS"));
        Assert.That(dto.Ads.Select(a => a.FeedId), Is.EqualTo(new[] { "a2", "a1" }));
    }

    [Test]
    public async Task Company_detail_lists_branches_ordered_by_kommune_then_name()
    {
        var now = DateTimeOffset.UtcNow;
        using (var scope = _factory.Services.CreateScope())
        {
            var repo = scope.ServiceProvider.GetRequiredService<ICompanyRepository>();
            await repo.UpsertAsync(new RegisterCompany("925836613", "Norsk Tipping AS", "3407", "62.100", null,
                false, null), now);
            // Muni 4601 sorts after 0301 — asserting on kommune order, not insertion order, catches an
            // impl that accidentally orders by name only (which would put these two the other way).
            await repo.UpsertAsync(new RegisterCompany("111111111", "Norsk Tipping AS Avd B", "4601", "62.100",
                "925836613", true, null), now);
            await repo.UpsertAsync(new RegisterCompany("222222222", "Norsk Tipping AS Avd A", "0301", "62.100",
                "925836613", true, null), now);
        }

        var response = await _client.GetAsync("/api/companies/925836613");
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.OK));

        var dto = await response.Content.ReadFromJsonAsync<CompanyDetailDtoProbe>();
        Assert.That(dto!.Branches.Select(b => b.Orgnr), Is.EqualTo(new[] { "222222222", "111111111" }),
            "0301 (muni) sorts before 4601 regardless of name");
    }

    [Test]
    public async Task Company_detail_branches_empty_when_the_requested_orgnr_is_itself_a_branch()
    {
        var now = DateTimeOffset.UtcNow;
        using (var scope = _factory.Services.CreateScope())
        {
            var repo = scope.ServiceProvider.GetRequiredService<ICompanyRepository>();
            await repo.UpsertAsync(new RegisterCompany("925836613", "Norsk Tipping AS", "3407", "62.100", null,
                false, null), now);
            await repo.UpsertAsync(new RegisterCompany("111111111", "Norsk Tipping AS Avd B", "4601", "62.100",
                "925836613", true, null), now);
        }

        var response = await _client.GetAsync("/api/companies/111111111");
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.OK));

        var dto = await response.Content.ReadFromJsonAsync<CompanyDetailDtoProbe>();
        Assert.That(dto!.Branches, Is.Empty);
    }

    [Test]
    public async Task Pipeline_unknown_status_returns_400()
    {
        var response = await _client.GetAsync("/api/pipeline?status=tull");
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.BadRequest));
    }

    [Test]
    public async Task Pipeline_filters_by_known_status()
    {
        using (var scope = _factory.Services.CreateScope())
        {
            var pipeline = scope.ServiceProvider.GetRequiredService<IPipelineRepository>();
            await pipeline.UpsertAsync(new PipelineEntry
            {
                Orgnr = "1", Status = PipelineStatus.Active, Created = DateTimeOffset.UtcNow, Updated = DateTimeOffset.UtcNow,
            });
            await pipeline.UpsertAsync(new PipelineEntry
            {
                Orgnr = "2", Status = PipelineStatus.Applied,
                Created = DateTimeOffset.UtcNow, Updated = DateTimeOffset.UtcNow,
            });
        }

        var response = await _client.GetAsync("/api/pipeline?status=active");
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.OK));

        var entries = await response.Content.ReadFromJsonAsync<List<PipelineDtoProbe>>();
        Assert.That(entries!.Select(e => e.Orgnr), Is.EqualTo(new[] { "1" }));
    }

    [Test]
    public async Task Status_returns_counts()
    {
        using (var scope = _factory.Services.CreateScope())
        {
            var now = DateTimeOffset.UtcNow;
            await scope.ServiceProvider.GetRequiredService<ICompanyRepository>()
                .UpsertAsync(new RegisterCompany("1", "Status AS", null, null, null, false, null), now);
            await scope.ServiceProvider.GetRequiredService<IAdRepository>()
                .UpsertAsync(new FeedAd("a1", "Utvikler", "Status AS", "1", "3407",
                    now, now.AddDays(5), "https://x", true, "IT"), now);
            await scope.ServiceProvider.GetRequiredService<IPipelineRepository>().UpsertAsync(new PipelineEntry
            {
                Orgnr = "1", Status = PipelineStatus.Active, Created = now, Updated = now,
            });
        }

        var response = await _client.GetAsync("/api/status");
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.OK));

        var dto = await response.Content.ReadFromJsonAsync<StatusDtoProbe>();
        Assert.That(dto!.ActiveAds, Is.EqualTo(1));
        Assert.That(dto.Companies, Is.EqualTo(1));
        Assert.That(dto.PipelineEntries, Is.EqualTo(1));
    }
}
