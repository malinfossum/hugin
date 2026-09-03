using System.Net;
using System.Net.Http.Json;
using Hugin.Core.Abstractions;
using Hugin.Core.Models;
using Microsoft.Extensions.DependencyInjection;

namespace Hugin.Tests.Api;

public sealed record TrackResponseProbe(PipelineDtoProbe Entry, string? Warning);

[TestFixture]
public sealed class WriteEndpointTests
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
    public async Task Track_unknown_orgnr_returns_404()
    {
        var response = await _client.PutAsJsonAsync("/api/pipeline/000000000",
            new { status = "applied", why = "", note = (string?)null, svar = (string?)null });

        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.NotFound));
    }

    [Test]
    public async Task Track_known_orgnr_updates_pipeline()
    {
        using (var scope = _factory.Services.CreateScope())
        {
            await scope.ServiceProvider.GetRequiredService<ICompanyRepository>()
                .UpsertAsync(new RegisterCompany("999888777", "Sporbar AS", "3407", "62.100", null, false, null),
                    DateTimeOffset.UtcNow);
        }

        var first = await _client.PutAsJsonAsync("/api/pipeline/999888777",
            new { status = "applied", why = "", note = (string?)null, svar = (string?)null });
        Assert.That(first.StatusCode, Is.EqualTo(HttpStatusCode.OK));

        var firstDto = await first.Content.ReadFromJsonAsync<TrackResponseProbe>();
        Assert.That(firstDto!.Warning, Is.Not.Null);
        Assert.That(firstDto.Entry.Status, Is.EqualTo("applied"));

        var second = await _client.PutAsJsonAsync("/api/pipeline/999888777",
            new { status = "answered", why = "god match", note = (string?)null, svar = (string?)null });
        Assert.That(second.StatusCode, Is.EqualTo(HttpStatusCode.OK));

        var secondDto = await second.Content.ReadFromJsonAsync<TrackResponseProbe>();
        Assert.That(secondDto!.Warning, Is.Null);
        Assert.That(secondDto.Entry.Status, Is.EqualTo("answered"));
    }

    [Test]
    public async Task Track_response_carries_the_derived_expiry_flag()
    {
        var now = DateTimeOffset.UtcNow;
        using (var scope = _factory.Services.CreateScope())
        {
            await scope.ServiceProvider.GetRequiredService<ICompanyRepository>()
                .UpsertAsync(new RegisterCompany("999888777", "Utgått AS", "3407", "62.100", null, false, null), now);
            await scope.ServiceProvider.GetRequiredService<IAdRepository>()
                .UpsertAsync(new FeedAd("a", "Utvikler", "Utgått AS", "999888777", "3407", now.AddDays(-30), now.AddDays(-1), null, true), now);
        }

        var response = await _client.PutAsJsonAsync("/api/pipeline/999888777",
            new { status = "active", why = "", note = (string?)null, svar = (string?)null });

        var dto = await response.Content.ReadFromJsonAsync<TrackResponseProbe>();
        Assert.That(dto!.Entry.AdsExpired, Is.True);
    }

    [Test]
    public async Task Track_starred_survives_a_status_only_edit()
    {
        using (var scope = _factory.Services.CreateScope())
        {
            await scope.ServiceProvider.GetRequiredService<ICompanyRepository>()
                .UpsertAsync(new RegisterCompany("999888777", "Sporbar AS", "3407", "62.100", null, false, null),
                    DateTimeOffset.UtcNow);
        }

        var starred = await _client.PutAsJsonAsync("/api/pipeline/999888777",
            new { status = "active", why = "fordi", note = (string?)null, svar = (string?)null, starred = true });
        Assert.That(starred.StatusCode, Is.EqualTo(HttpStatusCode.OK));
        var starredDto = await starred.Content.ReadFromJsonAsync<TrackResponseProbe>();
        Assert.That(starredDto!.Entry.Starred, Is.True);

        // A status-only edit (starred omitted, i.e. null) must not clear the star.
        var statusOnly = await _client.PutAsJsonAsync("/api/pipeline/999888777",
            new { status = "applied", why = (string?)null, note = (string?)null, svar = (string?)null });
        Assert.That(statusOnly.StatusCode, Is.EqualTo(HttpStatusCode.OK));
        var statusOnlyDto = await statusOnly.Content.ReadFromJsonAsync<TrackResponseProbe>();
        Assert.That(statusOnlyDto!.Entry.Starred, Is.True, "star must survive a status-only edit");
        Assert.That(statusOnlyDto.Entry.Status, Is.EqualTo("applied"));

        // Explicitly clearing it still works.
        var cleared = await _client.PutAsJsonAsync("/api/pipeline/999888777",
            new { status = "applied", why = (string?)null, note = (string?)null, svar = (string?)null, starred = false });
        var clearedDto = await cleared.Content.ReadFromJsonAsync<TrackResponseProbe>();
        Assert.That(clearedDto!.Entry.Starred, Is.False);
    }

    [Test]
    public async Task Track_unknown_status_returns_400()
    {
        using (var scope = _factory.Services.CreateScope())
        {
            await scope.ServiceProvider.GetRequiredService<ICompanyRepository>()
                .UpsertAsync(new RegisterCompany("999888777", "Sporbar AS", "3407", "62.100", null, false, null),
                    DateTimeOffset.UtcNow);
        }

        var response = await _client.PutAsJsonAsync("/api/pipeline/999888777",
            new { status = "tull", why = (string?)null, note = (string?)null, svar = (string?)null });

        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.BadRequest));
    }

    [Test]
    public async Task Hide_unknown_feedId_returns_404()
    {
        var response = await _client.PostAsync("/api/ads/unknown/hide", null);
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.NotFound));
    }

    [Test]
    public async Task Hide_then_unhide_toggles_ad_visibility()
    {
        var now = DateTimeOffset.UtcNow;
        using (var scope = _factory.Services.CreateScope())
        {
            var ads = scope.ServiceProvider.GetRequiredService<IAdRepository>();
            await ads.UpsertAsync(new FeedAd("a1", "Utvikler", "Firma", "999888777", "3407",
                now, now.AddDays(5), "https://x", true, "IT"), now);
        }

        var hide = await _client.PostAsync("/api/ads/a1/hide", null);
        Assert.That(hide.StatusCode, Is.EqualTo(HttpStatusCode.NoContent));

        var afterHide = await _client.GetFromJsonAsync<List<AdDtoProbe>>("/api/ads");
        Assert.That(afterHide!.Select(a => a.FeedId), Does.Not.Contain("a1"));

        var unhide = await _client.SendAsync(new HttpRequestMessage(HttpMethod.Delete, "/api/ads/a1/hide"));
        Assert.That(unhide.StatusCode, Is.EqualTo(HttpStatusCode.NoContent));

        var afterUnhide = await _client.GetFromJsonAsync<List<AdDtoProbe>>("/api/ads");
        Assert.That(afterUnhide!.Select(a => a.FeedId), Does.Contain("a1"));
    }

    [Test]
    public async Task Seen_advances_mark_but_never_moves_it_backwards()
    {
        var t0 = new DateTimeOffset(2026, 8, 10, 0, 0, 0, TimeSpan.Zero);
        var t1 = new DateTimeOffset(2026, 8, 15, 0, 0, 0, TimeSpan.Zero);

        using (var scope = _factory.Services.CreateScope())
        {
            await scope.ServiceProvider.GetRequiredService<IReviewMarkRepository>().SetAsync(t0);
        }

        var advance = await _client.PostAsJsonAsync("/api/seen", new { asOf = t1 });
        Assert.That(advance.StatusCode, Is.EqualTo(HttpStatusCode.NoContent));

        using (var scope = _factory.Services.CreateScope())
        {
            var mark = await scope.ServiceProvider.GetRequiredService<IReviewMarkRepository>().GetAsync();
            Assert.That(mark, Is.EqualTo(t1));
        }

        var stale = await _client.PostAsJsonAsync("/api/seen", new { asOf = t0 });
        Assert.That(stale.StatusCode, Is.EqualTo(HttpStatusCode.NoContent));

        using (var scope = _factory.Services.CreateScope())
        {
            var mark = await scope.ServiceProvider.GetRequiredService<IReviewMarkRepository>().GetAsync();
            Assert.That(mark, Is.EqualTo(t1));
        }
    }
}
