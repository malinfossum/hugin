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
}
