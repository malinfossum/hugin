using System.Net.Http.Json;
using Hugin.Api;

namespace Hugin.Tests.Api;

[TestFixture]
public sealed class PublicModeEndpointTests
{
    [Test]
    public async Task Status_reports_read_only_in_public_mode()
    {
        using var factory = new ApiFactory(publicMode: true);
        using var client = factory.CreateClient();
        var status = await client.GetFromJsonAsync<StatusDto>("/api/status");
        Assert.That(status!.ReadOnly, Is.True);
    }

    [Test]
    public async Task Status_is_writable_in_normal_mode()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        var status = await client.GetFromJsonAsync<StatusDto>("/api/status");
        Assert.That(status!.ReadOnly, Is.False);
    }

    [Test]
    public async Task New_since_is_a_rolling_seven_day_window_in_public_mode()
    {
        using var factory = new ApiFactory(publicMode: true);
        using var client = factory.CreateClient();
        var response = await client.GetAsync("/api/new");
        Assert.That(response.StatusCode, Is.EqualTo(System.Net.HttpStatusCode.OK),
            "no stored mark, yet public mode always has a baseline");
        var items = await response.Content.ReadFromJsonAsync<NewDto>();
        var expected = DateTimeOffset.UtcNow.AddDays(-7);
        Assert.That(items!.Since, Is.EqualTo(expected).Within(TimeSpan.FromMinutes(1)));
    }
}
