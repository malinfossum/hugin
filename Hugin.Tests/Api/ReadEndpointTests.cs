using System.Net;
using System.Net.Http.Json;
using Hugin.Core.Abstractions;
using Hugin.Core.Models;
using Microsoft.Extensions.DependencyInjection;

namespace Hugin.Tests.Api;

public sealed record NewDtoProbe(List<CompanyDtoProbe> Companies, List<object> Ads, DateTimeOffset Since, DateTimeOffset AsOf);
public sealed record CompanyDtoProbe(string Orgnr, string Name, string? KommuneNavn);
public sealed record CompanyDetailDtoProbe(CompanyDtoProbe Company, List<AdDtoProbe> Ads);
public sealed record PipelineDtoProbe(string Orgnr, string CompanyName, string Status, string Route);
public sealed record StatusDtoProbe(object? Brreg, object? Nav, DateTimeOffset? ReviewMark, int ActiveAds,
    int Companies, int PipelineEntries, List<LinkoutProbe> Linkouts);
public sealed record LinkoutProbe(string Label, string Url);

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
                Orgnr = "1", Status = PipelineStatus.Funnet, Created = DateTimeOffset.UtcNow, Updated = DateTimeOffset.UtcNow,
            });
            await pipeline.UpsertAsync(new PipelineEntry
            {
                Orgnr = "2", Status = PipelineStatus.SoektSelv, Route = OutreachRoute.SoektSelv,
                Created = DateTimeOffset.UtcNow, Updated = DateTimeOffset.UtcNow,
            });
        }

        var response = await _client.GetAsync("/api/pipeline?status=funnet");
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.OK));

        var entries = await response.Content.ReadFromJsonAsync<List<PipelineDtoProbe>>();
        Assert.That(entries!.Select(e => e.Orgnr), Is.EqualTo(new[] { "1" }));
    }

    [Test]
    public async Task Export_returns_markdown_content_type_and_body()
    {
        using (var scope = _factory.Services.CreateScope())
        {
            var now = DateTimeOffset.UtcNow;
            await scope.ServiceProvider.GetRequiredService<ICompanyRepository>()
                .UpsertAsync(new RegisterCompany("1", "Eksport AS", null, null, null, false, null), now);
            await scope.ServiceProvider.GetRequiredService<IPipelineRepository>().UpsertAsync(new PipelineEntry
            {
                Orgnr = "1", Status = PipelineStatus.SoektSelv, Route = OutreachRoute.SoektSelv, Why = "fordi",
                Created = now, Updated = now,
            });
        }

        var response = await _client.GetAsync("/api/export");
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.OK));
        Assert.That(response.Content.Headers.ContentType!.MediaType, Is.EqualTo("text/markdown"));

        var body = await response.Content.ReadAsStringAsync();
        Assert.That(body, Does.Contain("## Søkt selv"));
    }

    [Test]
    public async Task Status_returns_counts_and_configured_linkouts()
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
                Orgnr = "1", Status = PipelineStatus.Funnet, Created = now, Updated = now,
            });
        }

        var response = await _client.GetAsync("/api/status");
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.OK));

        var dto = await response.Content.ReadFromJsonAsync<StatusDtoProbe>();
        Assert.That(dto!.ActiveAds, Is.EqualTo(1));
        Assert.That(dto.Companies, Is.EqualTo(1));
        Assert.That(dto.PipelineEntries, Is.EqualTo(1));
        Assert.That(dto.Linkouts.Select(l => l.Label), Is.EqualTo(new[] { "Finn.no" }));
    }
}
