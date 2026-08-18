using Hugin.Console;

namespace Hugin.Tests;

public class ConfigLoaderTests
{
    [Test]
    public void Empty_input_keeps_defaults()
    {
        var config = ConfigLoader.Parse("", out var warning);

        Assert.That(warning, Is.Null);
        Assert.That(config.Municipalities.Select(m => m.Number), Does.Contain("3407"));
        Assert.That(config.Naeringskoder, Is.EqualTo(new[] { "62" }));
    }

    [Test]
    public void Invalid_json_falls_back_to_defaults_with_a_warning()
    {
        var config = ConfigLoader.Parse("{ this is not json", out var warning);

        Assert.That(warning, Is.Not.Null);
        Assert.That(config.Municipalities, Is.Not.Empty, "a broken config must not leave Hugin unusable");
    }

    [Test]
    public void Reads_camel_case_fields()
    {
        const string json = """
            {
              "municipalities": [{ "name": "Bergen", "number": "4601" }],
              "naeringskoder": ["62", "63"],
              "keywords": ["utvikler"],
              "navToken": "hemmelig",
              "linkouts": [{ "label": "FINN", "url": "https://www.finn.no/job" }]
            }
            """;

        var config = ConfigLoader.Parse(json, out var warning);

        Assert.That(warning, Is.Null);
        Assert.That(config.Municipalities.Single().Name, Is.EqualTo("Bergen"));
        Assert.That(config.Municipalities.Single().Number, Is.EqualTo("4601"));
        Assert.That(config.Naeringskoder, Is.EqualTo(new[] { "62", "63" }));
        Assert.That(config.Keywords, Is.EqualTo(new[] { "utvikler" }));
        Assert.That(config.NavToken, Is.EqualTo("hemmelig"));
        Assert.That(config.Linkouts.Single().Url, Is.EqualTo("https://www.finn.no/job"));
    }

    [Test]
    public void Property_names_are_case_insensitive()
    {
        var config = ConfigLoader.Parse("""{ "Naeringskoder": ["70"], "NAVTOKEN": "x" }""", out _);

        Assert.That(config.Naeringskoder, Is.EqualTo(new[] { "70" }));
        Assert.That(config.NavToken, Is.EqualTo("x"));
    }

    [Test]
    public void Missing_fields_keep_their_defaults()
    {
        var config = ConfigLoader.Parse("""{ "keywords": ["rust"] }""", out _);

        Assert.That(config.Keywords, Is.EqualTo(new[] { "rust" }));
        Assert.That(config.Municipalities, Is.Not.Empty, "municipalities were not overridden");
        Assert.That(config.Naeringskoder, Is.EqualTo(new[] { "62" }));
        Assert.That(config.NavToken, Is.Null);
    }

    [Test]
    public void Load_without_a_config_file_yields_defaults_and_a_sibling_database_path()
    {
        var missing = Path.Combine(Path.GetTempPath(), "hugin-tests", "finnes-ikke", "hugin.json");
        var loaded = ConfigLoader.Load(missing);

        Assert.That(loaded.Warning, Is.Null, "a missing config is normal on first run, not an error");
        Assert.That(loaded.Config.Municipalities, Is.Not.Empty);
        Assert.That(loaded.DatabasePath, Is.EqualTo(Path.Combine(Path.GetDirectoryName(missing)!, "hugin.db")));
    }
}
