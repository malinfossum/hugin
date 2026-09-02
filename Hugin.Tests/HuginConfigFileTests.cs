using System.Text.Json;
using System.Text.Json.Nodes;
using Hugin.Core.Config;
using Hugin.Infrastructure;

namespace Hugin.Tests;

public class HuginConfigFileTests
{
    private string _dir = null!;
    private string ConfigPath => Path.Combine(_dir, "hugin.json");

    [SetUp] public void Up() => _dir = Directory.CreateTempSubdirectory("hugin-config-").FullName;
    [TearDown] public void Down() { try { Directory.Delete(_dir, recursive: true); } catch (IOException) { } }

    [Test]
    public void Load_rereads_the_file_on_every_call()
    {
        var file = new HuginConfigFile(ConfigPath);
        Assert.That(file.Load().Fylker, Is.Empty);

        File.WriteAllText(ConfigPath, """{ "fylker": ["39"] }""");

        Assert.That(file.Load().Fylker, Is.EqualTo(new[] { "39" }), "no caching — sync reads this per run");
    }

    [Test]
    public void DatabasePath_sits_beside_the_config()
        => Assert.That(new HuginConfigFile(ConfigPath).DatabasePath, Is.EqualTo(Path.Combine(_dir, "hugin.db")));

    [Test]
    public void WriteDiscovery_creates_the_file_when_missing_and_Load_reads_it_back()
    {
        var file = new HuginConfigFile(ConfigPath);

        file.WriteDiscovery(new DiscoveryConfig([new MunicipalityRef("Larvik", "3909")], [], false));

        Assert.That(file.Load().Municipalities.Single(), Is.EqualTo(new MunicipalityRef("Larvik", "3909")));
        Assert.That(file.ReadDiscovery().AllOfNorway, Is.False);
        Assert.That(File.Exists(ConfigPath + ".bak"), Is.False, "nothing to back up on a first write");
    }

    [Test]
    public void WriteDiscovery_replaces_only_the_three_keys_and_keeps_everything_else()
    {
        const string original = """
            {
              "keywords": ["rust", "go"],
              "Municipalities": [{ "name": "Hamar", "number": "3403" }],
              "navToken": "hemmelig",
              "myNotes": { "why": "hand-edited", "n": 3 },
              "linkouts": [{ "label": "FINN", "url": "https://www.finn.no/job" }],
              "naeringskoder": ["62", "63"]
            }
            """;
        File.WriteAllText(ConfigPath, original);

        new HuginConfigFile(ConfigPath).WriteDiscovery(new DiscoveryConfig([], ["39"], false));

        var before = JsonNode.Parse(original)!.AsObject();
        var after = JsonNode.Parse(File.ReadAllText(ConfigPath))!.AsObject();
        string[] untouched = ["keywords", "navToken", "myNotes", "linkouts", "naeringskoder"];
        foreach (var key in untouched)
            Assert.That(JsonNode.DeepEquals(after[key], before[key]), Is.True, key);
        Assert.That(after.Select(p => p.Key).Where(untouched.Contains), Is.EqualTo(untouched),
            "relative order of every other key is kept");
        Assert.That(after.ContainsKey("Municipalities"), Is.False, "the hand-written spelling is gone, not duplicated");
        Assert.That(after["municipalities"]!.AsArray(), Is.Empty);
        Assert.That(after["fylker"]!.AsArray().Select(n => n!.GetValue<string>()), Is.EqualTo(new[] { "39" }));
        Assert.That(after["allOfNorway"]!.GetValue<bool>(), Is.False);
        Assert.That(File.ReadAllText(ConfigPath + ".bak"), Is.EqualTo(original), "backup = previous content, verbatim");
        Assert.That(File.Exists(ConfigPath + ".tmp"), Is.False);
    }

    [Test]
    public void WriteDiscovery_keeps_norwegian_letters_readable()
    {
        new HuginConfigFile(ConfigPath).WriteDiscovery(new DiscoveryConfig([new MunicipalityRef("Gjøvik", "3407")], [], false));

        Assert.That(File.ReadAllText(ConfigPath), Does.Contain("Gjøvik"));
    }

    [Test]
    public void WriteDiscovery_on_invalid_json_throws_and_leaves_the_file_untouched()
    {
        File.WriteAllText(ConfigPath, "{ this is not json");

        Assert.Throws<JsonException>(() =>
            new HuginConfigFile(ConfigPath).WriteDiscovery(new DiscoveryConfig([], [], true)));

        Assert.That(File.ReadAllText(ConfigPath), Is.EqualTo("{ this is not json"));
        Assert.That(File.Exists(ConfigPath + ".bak"), Is.False, "parse happens before any file is touched");
    }
}
