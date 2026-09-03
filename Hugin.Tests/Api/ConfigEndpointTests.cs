using System.Net;
using System.Net.Http.Json;
using Hugin.Api;
using Hugin.Core.Config;
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

    [Test]
    public async Task Get_discovery_reads_defaults_when_no_file_exists()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();

        var dto = await client.GetFromJsonAsync<DiscoveryConfigDto>("/api/config/discovery");

        Assert.That(dto!.Municipalities.Select(m => m.Number), Is.EquivalentTo(new[] { "3407", "3403", "3405", "3411" }));
        Assert.That(dto.AllOfNorway, Is.False);
    }

    [Test]
    public async Task Put_discovery_derives_names_from_the_register_writes_the_file_and_reads_back()
    {
        using var factory = new ApiFactory();
        factory.Brreg.Kommuner.AddRange(Register);
        using var client = factory.CreateApiClient();

        var response = await client.PutAsJsonAsync("/api/config/discovery",
            new DiscoveryWriteRequest(["3909", "3405", "3909"], [], false));

        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.OK));
        var dto = await response.Content.ReadFromJsonAsync<DiscoveryConfigDto>();
        Assert.That(dto!.Municipalities, Is.EqualTo(new[] { new MunicipalityRef("Larvik", "3909"), new MunicipalityRef("Lillehammer", "3405") }),
            "names come from the register, duplicates collapse, order is kept");
        Assert.That(File.ReadAllText(factory.ConfigPath), Does.Contain("Larvik"));

        var again = await client.GetFromJsonAsync<DiscoveryConfigDto>("/api/config/discovery");
        Assert.That(again!.Municipalities.Select(m => m.Number), Is.EqualTo(new[] { "3909", "3405" }));
    }

    [Test]
    public async Task Put_discovery_with_a_fylke_only_is_accepted()
    {
        using var factory = new ApiFactory();
        factory.Brreg.Kommuner.AddRange(Register);
        using var client = factory.CreateApiClient();

        var response = await client.PutAsJsonAsync("/api/config/discovery", new DiscoveryWriteRequest([], ["39"], false));

        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.OK));
        var dto = await response.Content.ReadFromJsonAsync<DiscoveryConfigDto>();
        Assert.That(dto!.Fylker, Is.EqualTo(new[] { "39" }));
        Assert.That(dto.Municipalities, Is.Empty);
    }

    [TestCase("1234", "Ukjent kommunenummer «1234».")]
    [TestCase("34", "Ugyldig kommunenummer «34» — må være 4 sifre.")]
    [TestCase("abcd", "Ugyldig kommunenummer «abcd» — må være 4 sifre.")]
    public async Task Put_discovery_rejects_bad_numbers_and_writes_nothing(string number, string title)
    {
        using var factory = new ApiFactory();
        factory.Brreg.Kommuner.AddRange(Register);
        using var client = factory.CreateApiClient();

        var response = await client.PutAsJsonAsync("/api/config/discovery", new DiscoveryWriteRequest([number], [], false));

        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.BadRequest));
        var problem = await response.Content.ReadFromJsonAsync<ProblemDetailsProbe>();
        Assert.That(problem!.Title, Is.EqualTo(title));
        Assert.That(File.Exists(factory.ConfigPath), Is.False, "nothing written");
    }

    [TestCase("99", "Ukjent fylkesnummer «99».")]
    [TestCase("3", "Ugyldig fylkesnummer «3» — må være 2 sifre.")]
    public async Task Put_discovery_rejects_bad_fylker(string fylke, string title)
    {
        using var factory = new ApiFactory();
        factory.Brreg.Kommuner.AddRange(Register);
        using var client = factory.CreateApiClient();

        var response = await client.PutAsJsonAsync("/api/config/discovery", new DiscoveryWriteRequest([], [fylke], false));

        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.BadRequest));
        Assert.That((await response.Content.ReadFromJsonAsync<ProblemDetailsProbe>())!.Title, Is.EqualTo(title));
    }

    [Test]
    public async Task Put_discovery_rejects_an_empty_scope_and_writes_nothing()
    {
        // Nothing selected at all would be written as an empty allow-set, which the sync can
        // only read as "no scope" — and an empty kommunenummer filter is exactly what makes
        // Brreg answer with the whole country. Refuse it at the door instead.
        using var factory = new ApiFactory();
        factory.Brreg.Kommuner.AddRange(Register);
        using var client = factory.CreateApiClient();

        var response = await client.PutAsJsonAsync("/api/config/discovery", new DiscoveryWriteRequest([], [], false));

        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.BadRequest));
        Assert.That((await response.Content.ReadFromJsonAsync<ProblemDetailsProbe>())!.Title,
            Is.EqualTo("Tom dekning — velg minst én kommune, ett fylke eller hele Norge."));
        Assert.That(File.Exists(factory.ConfigPath), Is.False, "nothing written");
    }

    [Test]
    public async Task Put_discovery_with_numbers_is_503_when_the_register_is_unavailable_but_fylke_only_still_saves()
    {
        using var factory = new ApiFactory();
        factory.Brreg.ThrowsOnGetKommuner = true;
        using var client = factory.CreateApiClient();

        var numbers = await client.PutAsJsonAsync("/api/config/discovery", new DiscoveryWriteRequest(["3405"], [], false));
        Assert.That(numbers.StatusCode, Is.EqualTo(HttpStatusCode.ServiceUnavailable));
        Assert.That(File.Exists(factory.ConfigPath), Is.False);

        var fylke = await client.PutAsJsonAsync("/api/config/discovery", new DiscoveryWriteRequest([], ["34"], false));
        Assert.That(fylke.StatusCode, Is.EqualTo(HttpStatusCode.OK), "the dialog degrades to fylke granularity — that save must still work");
    }

    [Test]
    public async Task Put_discovery_rejects_an_unknown_fylke_even_when_the_register_is_unavailable()
    {
        // Degraded mode used to check the fylke's format only, so a well-formed nonsense prefix
        // was written and the next sync fetched nothing for it. The 2024 fylke set is static.
        using var factory = new ApiFactory();
        factory.Brreg.ThrowsOnGetKommuner = true;
        using var client = factory.CreateApiClient();

        var response = await client.PutAsJsonAsync("/api/config/discovery", new DiscoveryWriteRequest([], ["99"], false));

        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.BadRequest));
        Assert.That((await response.Content.ReadFromJsonAsync<ProblemDetailsProbe>())!.Title, Is.EqualTo("Ukjent fylkesnummer «99»."));
        Assert.That(File.Exists(factory.ConfigPath), Is.False, "nothing written");
    }

    [Test]
    public async Task Put_discovery_keeps_hand_edited_keys()
    {
        using var factory = new ApiFactory();
        factory.Brreg.Kommuner.AddRange(Register);
        File.WriteAllText(factory.ConfigPath, """{ "keywords": ["rust"], "custom": { "a": 1 }, "allOfNorway": true }""");
        using var client = factory.CreateApiClient();

        await client.PutAsJsonAsync("/api/config/discovery", new DiscoveryWriteRequest(["0301"], [], false));

        var text = File.ReadAllText(factory.ConfigPath);
        Assert.That(text, Does.Contain("\"rust\"").And.Contain("\"custom\"").And.Contain("\"a\": 1"));
        Assert.That(text, Does.Contain("\"allOfNorway\": false"));
        Assert.That(File.Exists(factory.ConfigPath + ".bak"), Is.True);
    }

    [Test]
    public async Task Put_discovery_returns_500_and_leaves_the_file_untouched_when_the_write_fails()
    {
        using var factory = new ApiFactory();
        File.WriteAllText(factory.ConfigPath, "{ this is not json");
        factory.Brreg.Kommuner.AddRange(Register);
        using var client = factory.CreateApiClient();

        var response = await client.PutAsJsonAsync("/api/config/discovery", new DiscoveryWriteRequest(["3405"], [], false));

        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.InternalServerError));
        Assert.That(File.ReadAllText(factory.ConfigPath), Is.EqualTo("{ this is not json"));
        Assert.That(File.Exists(factory.ConfigPath + ".bak"), Is.False);
    }

    [Test]
    public async Task Put_discovery_needs_the_write_header()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient(); // no X-Hugin

        var response = await client.PutAsJsonAsync("/api/config/discovery", new DiscoveryWriteRequest([], [], true));

        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.Forbidden));
    }
}
