using System.Net;
using Hugin.Api;

namespace Hugin.Tests.Api;

[TestFixture]
public sealed class PublicModeTests
{
    [Test]
    public void Normal_mode_is_loopback_and_ignores_PORT()
    {
        var (address, port) = PublicMode.ListenAddress(isPublic: false, portArg: null, portEnv: "8080");
        Assert.That(address, Is.EqualTo(IPAddress.Loopback));
        Assert.That(port, Is.EqualTo(5111));
    }

    [Test]
    public void Port_arg_wins_in_both_modes()
    {
        Assert.That(PublicMode.ListenAddress(false, "6000", "8080").Port, Is.EqualTo(6000));
        Assert.That(PublicMode.ListenAddress(true, "6000", "8080").Port, Is.EqualTo(6000));
    }

    [Test]
    public void Public_mode_binds_any_and_reads_PORT()
    {
        var (address, port) = PublicMode.ListenAddress(true, null, "8080");
        Assert.That(address, Is.EqualTo(IPAddress.Any));
        Assert.That(port, Is.EqualTo(8080));
    }

    [Test]
    public void Public_mode_without_PORT_falls_back_to_5111()
    {
        Assert.That(PublicMode.ListenAddress(true, null, null).Port, Is.EqualTo(5111));
        Assert.That(PublicMode.ListenAddress(true, null, "not-a-port").Port, Is.EqualTo(5111));
    }

    [Test]
    public void Validate_passes_normal_mode_through()
    {
        Assert.That(PublicMode.Validate(false, null, null), Is.Null);
        Assert.That(PublicMode.Validate(false, null, @"C:\somewhere\hugin.json"), Is.Null);
    }

    [Test]
    public void Public_needs_state_and_refuses_config()
    {
        Assert.That(PublicMode.Validate(true, null, null), Does.Contain("--state"));
        var dir = Directory.CreateTempSubdirectory("hugin-public-");
        try
        {
            File.WriteAllText(Path.Combine(dir.FullName, "hugin.json"), "{}");
            Assert.That(PublicMode.Validate(true, dir.FullName, "x.json"), Does.Contain("--config"));
            Assert.That(PublicMode.Validate(true, dir.FullName, null), Is.Null);
        }
        finally { dir.Delete(recursive: true); }
    }

    [Test]
    public void Public_needs_the_state_config_to_exist()
    {
        var dir = Directory.CreateTempSubdirectory("hugin-public-");
        try
        {
            var error = PublicMode.Validate(true, dir.FullName, null);
            Assert.That(error, Does.Contain("hugin.json"));
        }
        finally { dir.Delete(recursive: true); }
    }

    [Test]
    public void Options_derive_the_three_state_paths()
    {
        var o = new PublicModeOptions(true, @"C:\state", @"C:\tmp\hugin.db");
        Assert.That(o.ConfigPath, Is.EqualTo(Path.Combine(@"C:\state", "hugin.json")));
        Assert.That(o.SnapshotPath, Is.EqualTo(Path.Combine(@"C:\state", "hugin.db")));
        Assert.That(o.SeedPath, Is.EqualTo(Path.Combine(@"C:\state", "demo-pipeline.json")));
        Assert.That(PublicModeOptions.Off.Enabled, Is.False);
    }
}
