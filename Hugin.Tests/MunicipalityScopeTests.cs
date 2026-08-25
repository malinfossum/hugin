using Hugin.Core.Config;
using Hugin.Core.Services;

namespace Hugin.Tests;

public class MunicipalityScopeTests
{
    private static readonly IReadOnlyDictionary<string, string> Register = new Dictionary<string, string>
    {
        ["3403"] = "HAMAR",
        ["3407"] = "GJØVIK",
        ["3405"] = "LILLEHAMMER",
        ["3411"] = "RINGSAKER",
        ["3909"] = "LARVIK",
    };

    [Test]
    public void Plain_config_allows_only_the_configured_numbers()
    {
        var config = new HuginConfig(); // defaults: Gjøvik/Hamar/Lillehammer/Ringsaker
        var scope = MunicipalityScope.Build(config, Register);

        Assert.That(scope.AllowedNumbers, Is.EquivalentTo(new[] { "3407", "3403", "3405", "3411" }));
        Assert.That(scope.AllOfNorway, Is.False);
    }

    [Test]
    public void ResolveName_resolves_any_known_name_regardless_of_the_gate()
    {
        var config = new HuginConfig(); // defaults: Gjøvik/Hamar/Lillehammer/Ringsaker
        var scope = MunicipalityScope.Build(config, Register);

        // Config name, case-insensitive.
        Assert.That(scope.ResolveName("HAMAR"), Is.EqualTo("3403"));
        Assert.That(scope.ResolveName("hamar"), Is.EqualTo("3403"));

        // Register-only name (config-absent) still resolves — resolution and gating are separate.
        Assert.That(scope.ResolveName("LARVIK"), Is.EqualTo("3909"));
        Assert.That(scope.ResolveName("larvik"), Is.EqualTo("3909"));

        // Unknown name resolves to null.
        Assert.That(scope.ResolveName("Nonexistent"), Is.Null);
        Assert.That(scope.ResolveName(null), Is.Null);
    }

    [Test]
    public void Gate_is_separate_from_resolution_only_allowed_numbers_pass()
    {
        var config = new HuginConfig();
        var scope = MunicipalityScope.Build(config, Register);

        var larvikNumber = scope.ResolveName("LARVIK");
        Assert.That(larvikNumber, Is.EqualTo("3909"), "resolves even though Larvik is not in scope");
        Assert.That(scope.AllOfNorway || scope.AllowedNumbers.Contains(larvikNumber!), Is.False,
            "the gate excludes it — resolution and gating are separate concerns");

        var hamarNumber = scope.ResolveName("HAMAR");
        Assert.That(scope.AllOfNorway || scope.AllowedNumbers.Contains(hamarNumber!), Is.True);
    }

    [Test]
    public void Fylke_selection_expands_allowed_numbers_to_the_whole_fylke()
    {
        var register = new Dictionary<string, string>
        {
            ["3903"] = "HORTEN",
            ["3905"] = "TØNSBERG",
            ["3909"] = "LARVIK",
            ["0301"] = "OSLO",
        };
        var config = new HuginConfig { Municipalities = [], Fylker = ["39"] };
        var scope = MunicipalityScope.Build(config, register);

        Assert.That(scope.AllowedNumbers, Is.EquivalentTo(new[] { "3903", "3905", "3909" }));
        Assert.That(scope.AllowedNumbers, Does.Not.Contain("0301"));
    }

    [Test]
    public void All_of_norway_allows_every_register_number()
    {
        var config = new HuginConfig { Municipalities = [], AllOfNorway = true };
        var scope = MunicipalityScope.Build(config, Register);

        Assert.That(scope.AllowedNumbers, Is.EquivalentTo(Register.Keys));
        Assert.That(scope.AllOfNorway, Is.True);
    }
}
