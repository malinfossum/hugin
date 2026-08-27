using System.Net;
using System.Net.Http.Json;

namespace Hugin.Tests.Api;

public sealed record SourceDtoProbe(int Id, string Label, string Url, int Position);

[TestFixture]
public sealed class SourcesEndpointTests
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

    private async Task<List<SourceDtoProbe>> GetSources() =>
        (await _client.GetFromJsonAsync<List<SourceDtoProbe>>("/api/sources"))!;

    [Test]
    public async Task Get_returns_seeded_defaults_and_the_config_linkout_ordered()
    {
        var response = await _client.GetAsync("/api/sources");
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.OK));

        var sources = (await response.Content.ReadFromJsonAsync<List<SourceDtoProbe>>())!;
        Assert.That(sources.Select(s => s.Label), Is.EqualTo(new[] { "FINN", "LinkedIn", "Proff", "Finn.no" }));
        Assert.That(sources.Select(s => s.Position), Is.EqualTo(new[] { 1, 2, 3, 4 }));
    }

    [Test]
    public async Task Post_adds_a_source_at_the_end()
    {
        var response = await _client.PostAsJsonAsync("/api/sources", new { label = "Nav", url = "https://nav.no" });
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.Created));

        var created = await response.Content.ReadFromJsonAsync<SourceDtoProbe>();
        Assert.That(created!.Label, Is.EqualTo("Nav"));
        Assert.That(created.Url, Is.EqualTo("https://nav.no"));
        Assert.That(created.Position, Is.EqualTo(5)); // 3 seeded defaults + the factory's config linkout

        var after = await GetSources();
        Assert.That(after.Select(s => s.Label), Has.Member("Nav"));
        Assert.That(after.Last().Label, Is.EqualTo("Nav"));
    }

    [Test]
    public async Task Post_blank_label_returns_400()
    {
        var response = await _client.PostAsJsonAsync("/api/sources", new { label = "   ", url = "https://nav.no" });
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.BadRequest));
    }

    [Test]
    public async Task Post_label_over_80_chars_returns_400()
    {
        var response = await _client.PostAsJsonAsync("/api/sources",
            new { label = new string('x', 81), url = "https://nav.no" });
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.BadRequest));
    }

    [Test]
    public async Task Post_url_rejected_by_urlguard_returns_400()
    {
        var response = await _client.PostAsJsonAsync("/api/sources", new { label = "Nav", url = "javascript:alert(1)" });
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.BadRequest));
    }

    [Test]
    public async Task Put_edits_label_and_url()
    {
        var id = (await GetSources()).First(s => s.Label == "Proff").Id;

        var response = await _client.PutAsJsonAsync($"/api/sources/{id}", new { label = "Proff.no", url = "proff.no" });
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.OK));

        var updated = await response.Content.ReadFromJsonAsync<SourceDtoProbe>();
        Assert.That(updated!.Label, Is.EqualTo("Proff.no"));
        Assert.That(updated.Url, Is.EqualTo("https://proff.no"), "same normalization as seeding — bare host gains https://");
    }

    [Test]
    public async Task Put_unknown_id_returns_404()
    {
        var response = await _client.PutAsJsonAsync("/api/sources/999999", new { label = "X", url = "https://x.no" });
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.NotFound));
    }

    [Test]
    public async Task Reorder_happy_path_changes_get_order()
    {
        var ids = (await GetSources()).Select(s => s.Id).ToList();
        var reversed = ((IEnumerable<int>)ids).Reverse().ToList();

        var response = await _client.PostAsJsonAsync("/api/sources/reorder", new { ids = reversed });
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.NoContent));

        var after = await GetSources();
        Assert.That(after.Select(s => s.Id), Is.EqualTo(reversed));
    }

    [Test]
    public async Task Reorder_with_wrong_id_set_returns_400_and_order_unchanged()
    {
        var before = await GetSources();

        var response = await _client.PostAsJsonAsync("/api/sources/reorder", new { ids = new[] { 999999 } });
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.BadRequest));

        var after = await GetSources();
        Assert.That(after.Select(s => s.Id), Is.EqualTo(before.Select(s => s.Id)));
    }

    [Test]
    public async Task Delete_removes_a_source()
    {
        var id = (await GetSources()).First(s => s.Label == "LinkedIn").Id;

        var response = await _client.DeleteAsync($"/api/sources/{id}");
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.NoContent));

        var after = await GetSources();
        Assert.That(after.Select(s => s.Label), Does.Not.Contain("LinkedIn"));
    }

    [Test]
    public async Task Delete_unknown_id_returns_404()
    {
        var response = await _client.DeleteAsync("/api/sources/999999");
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.NotFound));
    }

    [Test]
    public async Task Post_without_write_header_is_403()
    {
        using var client = _factory.CreateClient(); // no X-Hugin
        var response = await client.PostAsJsonAsync("/api/sources", new { label = "Nav", url = "https://nav.no" });
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.Forbidden));
    }
}
