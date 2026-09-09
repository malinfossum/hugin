using System.Net.Http.Json;
using Hugin.Api;
using Hugin.Core.Abstractions;
using Hugin.Core.Models;
using Microsoft.Extensions.DependencyInjection;

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

    // NAV feed terms: a republished ad is removed the moment it goes inactive. The demo republishes.
    [Test]
    public async Task Company_history_holds_open_ads_only_in_public_mode()
    {
        using var factory = new ApiFactory(publicMode: true);
        using var client = factory.CreateClient();
        var now = DateTimeOffset.UtcNow;
        using (var scope = factory.Services.CreateScope())
        {
            await scope.ServiceProvider.GetRequiredService<ICompanyRepository>()
                .UpsertAsync(new RegisterCompany("999888777", "Ferskvare AS", "3407", "62.100", null, false, null), now);
            var adRepo = scope.ServiceProvider.GetRequiredService<IAdRepository>();
            await adRepo.UpsertAsync(new FeedAd("closed", "Utvikler", "Ferskvare AS", "999888777", "3407",
                now.AddDays(-20), now.AddDays(10), "https://x", false, "IT"), now);
            await adRepo.UpsertAsync(new FeedAd("stale", "Utvikler 2", "Ferskvare AS", "999888777", "3407",
                now.AddDays(-20), now.AddHours(-1), "https://x", true, "IT"), now);
            await adRepo.UpsertAsync(new FeedAd("open", "Utvikler 3", "Ferskvare AS", "999888777", "3407",
                now, now.AddDays(10), "https://x", true, "IT"), now);
        }

        var dto = await client.GetFromJsonAsync<CompanyDetailDtoProbe>("/api/companies/999888777");

        Assert.That(dto!.Ads.Select(a => a.FeedId), Is.EqualTo(new[] { "open" }),
            "neither the feed-closed ad nor the one past its frist may be republished");
    }

    [Test]
    public async Task New_list_holds_open_ads_only_in_public_mode()
    {
        using var factory = new ApiFactory(publicMode: true);
        using var client = factory.CreateClient();
        var now = DateTimeOffset.UtcNow;
        using (var scope = factory.Services.CreateScope())
        {
            var adRepo = scope.ServiceProvider.GetRequiredService<IAdRepository>();
            await adRepo.UpsertAsync(new FeedAd("closed", "Utvikler", "Ferskvare AS", "999888777", "3407",
                now.AddDays(-2), now.AddDays(10), "https://x", false, "IT"), now);
            await adRepo.UpsertAsync(new FeedAd("open", "Utvikler 2", "Ferskvare AS", "999888777", "3407",
                now.AddDays(-1), now.AddDays(10), "https://x", true, "IT"), now);
        }

        var items = await client.GetFromJsonAsync<NewDto>("/api/new");

        Assert.That(items!.Ads.Select(a => a.FeedId), Is.EqualTo(new[] { "open" }));
    }

    [Test]
    public async Task Preview_is_refused_in_public_mode()
    {
        using var factory = new ApiFactory(publicMode: true);
        using var client = factory.CreateApiClient();

        var response = await client.GetAsync("/api/config/focus/preview?nace=62");

        Assert.That(response.StatusCode, Is.EqualTo(System.Net.HttpStatusCode.Forbidden));
    }
}
