using System.Net.Http.Json;
using Hugin.Core.Abstractions;
using Microsoft.Extensions.DependencyInjection;

namespace Hugin.Tests.Api;

public sealed record AdDtoProbe(string FeedId, string? PipelineStatus, int? DaysLeft, bool Hidden, bool IsActive,
    DateTimeOffset? Published = null, DateTimeOffset? FirstSeen = null);

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

    [Test]
    public async Task Ads_carry_when_hugin_first_saw_them_apart_from_when_nav_published_them()
    {
        // Published before the fetch: "new since last visit" goes by the fetch, so the client needs both.
        var published = new DateTimeOffset(2026, 10, 1, 9, 0, 0, TimeSpan.Zero);
        var seen = new DateTimeOffset(2026, 10, 1, 12, 0, 0, TimeSpan.Zero);
        using var factory = new ApiFactory();
        using var client = factory.CreateApiClient();
        using (var scope = factory.Services.CreateScope())
        {
            await scope.ServiceProvider.GetRequiredService<IAdRepository>().UpsertAsync(new FeedAd("a3", "Utvikler 3",
                "Firma", "999888777", "3407", published, DateTimeOffset.UtcNow.AddDays(7), "https://x", true, "IT"), seen);
        }

        var ad = (await client.GetFromJsonAsync<List<AdDtoProbe>>("/api/ads"))!.Single();

        Assert.That(ad.Published, Is.EqualTo(published));
        Assert.That(ad.FirstSeen, Is.EqualTo(seen));
    }
}
