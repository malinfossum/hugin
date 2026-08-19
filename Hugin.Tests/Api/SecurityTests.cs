using System.Net;
using System.Net.Http.Json;

namespace Hugin.Tests.Api;

[TestFixture]
public sealed class SecurityTests
{
    private ApiFactory _factory = null!;

    [OneTimeSetUp] public void Up() => _factory = new ApiFactory();
    [OneTimeTearDown] public void Down() => _factory.Dispose();

    [Test]
    public async Task Get_without_write_header_is_allowed()
    {
        using var client = _factory.CreateClient(); // no X-Hugin
        var response = await client.GetAsync("/api/status");
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.OK));
    }

    [Test]
    public async Task Write_without_header_is_403()
    {
        using var client = _factory.CreateClient(); // no X-Hugin
        var response = await client.PostAsync("/api/seen", JsonContent.Create(new { asOf = DateTimeOffset.UtcNow }));
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.Forbidden));
    }

    [Test]
    public async Task Foreign_host_header_is_403()
    {
        using var client = _factory.CreateApiClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/status");
        request.Headers.TryAddWithoutValidation("Host", "evil.example");
        var response = await client.SendAsync(request);
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.Forbidden));
    }

    [Test]
    public async Task No_cors_headers_on_any_response()
    {
        using var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/status");
        Assert.That(response.Headers.Contains("Access-Control-Allow-Origin"), Is.False);
    }
}
