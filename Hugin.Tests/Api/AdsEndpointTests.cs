using System.Net.Http.Json;
using Hugin.Core.Abstractions;
using Microsoft.Extensions.DependencyInjection;

namespace Hugin.Tests.Api;

public sealed record AdDtoProbe(string FeedId, string? PipelineStatus, int? DaysLeft, bool Hidden, bool IsActive);

[TestFixture]
public sealed class AdsEndpointTests
{
    private ApiFactory _factory = null!;
    private HttpClient _client = null!;

    [OneTimeSetUp]
    public void Up()
    {
        _factory = new ApiFactory();
        _client = _factory.CreateApiClient();
    }

    [OneTimeTearDown] public void Down() { _client.Dispose(); _factory.Dispose(); }

    [Test]
    public async Task Ads_hidden_filter_and_shape()
    {
        // Seed through the repository layer, scoped from the factory's services.
        using (var scope = _factory.Services.CreateScope())
        {
            var repo = scope.ServiceProvider.GetRequiredService<IAdRepository>();
            await repo.UpsertAsync(new FeedAd("a1", "Utvikler", "Firma", "999888777", "3407",
                DateTimeOffset.UtcNow, DateTimeOffset.UtcNow.AddDays(5), "https://x", true, "IT"), DateTimeOffset.UtcNow);
            await repo.UpsertAsync(new FeedAd("a2", "Utvikler 2", "Firma", "999888777", "3407",
                DateTimeOffset.UtcNow, DateTimeOffset.UtcNow.AddDays(9), "https://x", true, "IT"), DateTimeOffset.UtcNow);
            await repo.SetHiddenAsync("a2", true);
        }

        var visible = await _client.GetFromJsonAsync<List<AdDtoProbe>>("/api/ads");
        Assert.That(visible!.Select(a => a.FeedId), Is.EquivalentTo(new[] { "a1" }));

        var all = await _client.GetFromJsonAsync<List<AdDtoProbe>>("/api/ads?hidden=true");
        Assert.That(all!.Count, Is.EqualTo(2));
        Assert.That(all.Single(a => a.FeedId == "a2").Hidden, Is.True);
    }
}
