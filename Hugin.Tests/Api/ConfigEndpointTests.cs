using System.Net;
using System.Net.Http.Json;
using Hugin.Api;
using Hugin.Core.Models;

namespace Hugin.Tests.Api;

[TestFixture]
public sealed class ConfigEndpointTests
{
    private static readonly Kommune[] Register =
    [
        new() { Number = "3405", Name = "Lillehammer" },
        new() { Number = "3403", Name = "Hamar" },
        new() { Number = "3909", Name = "Larvik" },
        new() { Number = "0301", Name = "Oslo" },
    ];

    [Test]
    public async Task Kommuner_falls_back_to_live_brreg_on_a_fresh_install_and_caches_it()
    {
        using var factory = new ApiFactory();
        factory.Brreg.Kommuner.AddRange(Register);
        using var client = factory.CreateClient();

        var first = await client.GetFromJsonAsync<List<KommuneDto>>("/api/kommuner");
        Assert.That(first!.Select(k => k.Name), Is.EqualTo(new[] { "Hamar", "Larvik", "Lillehammer", "Oslo" }), "sorted by name");

        factory.Brreg.Kommuner.Clear();
        factory.Brreg.ThrowsOnGetKommuner = true;
        var second = await client.GetFromJsonAsync<List<KommuneDto>>("/api/kommuner");

        Assert.That(second, Has.Count.EqualTo(4), "the first fallback was stored, so Brreg is not needed again");
    }

    [Test]
    public async Task Kommuner_is_503_when_the_register_is_empty_and_brreg_is_down()
    {
        using var factory = new ApiFactory();
        factory.Brreg.ThrowsOnGetKommuner = true;
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/api/kommuner");

        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.ServiceUnavailable));
    }
}
