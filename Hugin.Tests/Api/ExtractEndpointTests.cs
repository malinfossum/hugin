using System.Net;
using Hugin.Core.Abstractions;
using Hugin.Core.Models;
using Microsoft.Extensions.DependencyInjection;

namespace Hugin.Tests.Api;

[TestFixture]
public sealed class ExtractEndpointTests
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

    private async Task SeedAppliedEntryAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var now = DateTimeOffset.UtcNow;
        await scope.ServiceProvider.GetRequiredService<ICompanyRepository>()
            .UpsertAsync(new RegisterCompany("1", "Eksport AS", null, null, null, false, null), now);
        await scope.ServiceProvider.GetRequiredService<IPipelineRepository>().UpsertAsync(new PipelineEntry
        {
            Orgnr = "1", Status = PipelineStatus.Applied, Why = "fordi",
            Created = now, Updated = now,
        });
    }

    [Test]
    public async Task All_scope_md_returns_200_with_download_headers_and_body()
    {
        await SeedAppliedEntryAsync();

        var response = await _client.GetAsync("/api/extract?scope=all&format=md");

        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.OK));
        Assert.That(response.Content.Headers.ContentType!.MediaType, Is.EqualTo("text/markdown"));
        Assert.That(response.Content.Headers.ContentDisposition!.DispositionType, Is.EqualTo("attachment"));
        Assert.That(response.Content.Headers.ContentDisposition.FileName, Does.StartWith("hugin-all-"));
        Assert.That(response.Content.Headers.ContentDisposition.FileName, Does.EndWith(".md"));

        var body = await response.Content.ReadAsStringAsync();
        Assert.That(body, Does.Contain("## Søkt"));
        Assert.That(body, Does.Contain("Eksport AS"));
    }

    [Test]
    public async Task Txt_format_returns_plain_text_content_type()
    {
        var response = await _client.GetAsync("/api/extract?scope=all&format=txt");

        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.OK));
        Assert.That(response.Content.Headers.ContentType!.MediaType, Is.EqualTo("text/plain"));
        Assert.That(response.Content.Headers.ContentDisposition!.FileName, Does.EndWith(".txt"));
    }

    [Test]
    public async Task Json_format_returns_application_json_content_type()
    {
        var response = await _client.GetAsync("/api/extract?scope=all&format=json");

        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.OK));
        Assert.That(response.Content.Headers.ContentType!.MediaType, Is.EqualTo("application/json"));
        Assert.That(response.Content.Headers.ContentDisposition!.FileName, Does.EndWith(".json"));

        var body = await response.Content.ReadAsStringAsync();
        Assert.That(body, Does.Contain("\"scope\""));
    }

    [Test]
    public async Task New_scope_returns_200_even_with_no_review_mark()
    {
        var response = await _client.GetAsync("/api/extract?scope=new&format=md");

        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.OK));
        var body = await response.Content.ReadAsStringAsync();
        Assert.That(body, Does.Contain("## Nye selskaper (0)"));
    }

    [Test]
    public async Task Category_scope_returns_matching_active_ads()
    {
        using (var scope = _factory.Services.CreateScope())
        {
            var now = DateTimeOffset.UtcNow;
            await scope.ServiceProvider.GetRequiredService<IAdRepository>()
                .UpsertAsync(new FeedAd("a1", "Utvikler", "Firma AS", "1", "3407",
                    now, now.AddDays(10), "https://x", true, "IT / Utvikling"), now);
        }

        var response = await _client.GetAsync("/api/extract?scope=category&format=md&category=it");

        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.OK));
        var body = await response.Content.ReadAsStringAsync();
        Assert.That(body, Does.Contain("Utvikler"));
    }

    [Test]
    public async Task Category_scope_without_category_returns_400()
    {
        var response = await _client.GetAsync("/api/extract?scope=category&format=md");
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.BadRequest));
    }

    [Test]
    public async Task Unknown_scope_returns_400()
    {
        var response = await _client.GetAsync("/api/extract?scope=tull&format=md");
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.BadRequest));
    }

    [Test]
    public async Task Unknown_format_returns_400()
    {
        var response = await _client.GetAsync("/api/extract?scope=all&format=pdf");
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.BadRequest));
    }

    [Test]
    public async Task Missing_scope_returns_400()
    {
        var response = await _client.GetAsync("/api/extract?format=md");
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.BadRequest));
    }

    [Test]
    public async Task Old_export_endpoint_is_gone()
    {
        var response = await _client.GetAsync("/api/export");
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.NotFound));
    }
}
