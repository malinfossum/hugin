using System.Net;
using System.Net.Http.Json;

namespace Hugin.Tests.Api;

[TestFixture]
public sealed class PublicSecurityTests
{
    private ApiFactory _factory = null!;

    [OneTimeSetUp] public void Up() => _factory = new ApiFactory(publicMode: true);
    [OneTimeTearDown] public void Down() => _factory.Dispose();

    [Test]
    public async Task Write_with_the_dashboard_header_is_still_403_with_the_demo_title()
    {
        using var client = _factory.CreateApiClient(); // X-Hugin: 1 — irrelevant in public mode
        var response = await client.PostAsync("/api/seen", JsonContent.Create(new { asOf = DateTimeOffset.UtcNow }));
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.Forbidden));
        Assert.That(await response.Content.ReadAsStringAsync(), Does.Contain("Demo — skrivebeskyttet"));
    }

    [Test]
    public async Task Every_write_verb_under_api_is_refused()
    {
        using var client = _factory.CreateApiClient();
        var put = await client.PutAsJsonAsync("/api/pipeline/922425620", new { status = "active" });
        var del = await client.DeleteAsync("/api/ads/x/hide");
        var sync = await client.PostAsync("/api/sync", null);
        Assert.Multiple(() =>
        {
            Assert.That(put.StatusCode, Is.EqualTo(HttpStatusCode.Forbidden));
            Assert.That(del.StatusCode, Is.EqualTo(HttpStatusCode.Forbidden));
            Assert.That(sync.StatusCode, Is.EqualTo(HttpStatusCode.Forbidden));
        });
    }

    [Test]
    public async Task Get_passes_and_a_foreign_host_header_is_fine()
    {
        using var client = _factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/status");
        request.Headers.TryAddWithoutValidation("Host", "hugin-demo.azurewebsites.net");
        var response = await client.SendAsync(request);
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.OK));
    }

    [Test]
    public async Task Public_responses_carry_the_three_hardening_headers()
    {
        using var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/status");
        Assert.Multiple(() =>
        {
            Assert.That(response.Headers.GetValues("X-Content-Type-Options").Single(), Is.EqualTo("nosniff"));
            Assert.That(response.Headers.GetValues("X-Frame-Options").Single(), Is.EqualTo("DENY"));
            Assert.That(response.Headers.GetValues("Referrer-Policy").Single(), Is.EqualTo("no-referrer"));
        });
    }
}
