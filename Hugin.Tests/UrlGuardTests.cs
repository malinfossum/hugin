using Hugin.Core.Services;

namespace Hugin.Tests;

public class UrlGuardTests
{
    [Test]
    public void Accepts_https()
        => Assert.That(UrlGuard.HttpOrHttps("https://finn.no/x"), Is.EqualTo("https://finn.no/x"));

    [Test]
    public void Accepts_http()
        => Assert.That(UrlGuard.HttpOrHttps("http://a.no"), Is.EqualTo("http://a.no"));

    [Test]
    public void Rejects_javascript_scheme()
        => Assert.That(UrlGuard.HttpOrHttps("javascript:alert(1)"), Is.Null);

    [Test]
    public void Rejects_garbage_and_null()
    {
        Assert.That(UrlGuard.HttpOrHttps("not a url"), Is.Null);
        Assert.That(UrlGuard.HttpOrHttps(null), Is.Null);
    }
}

public class UrlGuardWebsiteTests
{
    // Brreg stores bare hostnames: of 200 companies sampled across Innlandet, 39 had a
    // hjemmeside and none of them carried a scheme.
    [Test]
    public void Adds_https_to_a_bare_hostname()
    {
        Assert.That(UrlGuard.Website("www.innit.no"), Is.EqualTo("https://www.innit.no"));
        Assert.That(UrlGuard.Website("1lifeapp.no"), Is.EqualTo("https://1lifeapp.no"));
        Assert.That(UrlGuard.Website("thomassen.xyz"), Is.EqualTo("https://thomassen.xyz"));
        Assert.That(UrlGuard.Website("Zelus.no"), Is.EqualTo("https://Zelus.no"));
    }

    [Test]
    public void Keeps_a_hostname_with_a_path()
        => Assert.That(UrlGuard.Website("www.epla.no/shops/snowflakehandmade/"),
            Is.EqualTo("https://www.epla.no/shops/snowflakehandmade/"));

    [Test]
    public void Leaves_an_explicit_scheme_alone()
    {
        Assert.That(UrlGuard.Website("https://diri.ai"), Is.EqualTo("https://diri.ai"));
        Assert.That(UrlGuard.Website("http://diri.ai"), Is.EqualTo("http://diri.ai"));
    }

    [Test]
    public void Never_prefixes_a_dangerous_scheme()
    {
        Assert.That(UrlGuard.Website("javascript:alert(1)"), Is.Null);
        Assert.That(UrlGuard.Website("file:///c:/passwords.txt"), Is.Null);
        Assert.That(UrlGuard.Website("ftp://example.no"), Is.Null);
    }

    [Test]
    public void Rejects_values_that_are_not_hostnames()
    {
        Assert.That(UrlGuard.Website("ingen"), Is.Null, "a word with no dot is not a host");
        Assert.That(UrlGuard.Website("se facebook"), Is.Null);
        Assert.That(UrlGuard.Website("  "), Is.Null);
        Assert.That(UrlGuard.Website(null), Is.Null);
    }

    [Test]
    public void Trims_surrounding_whitespace()
        => Assert.That(UrlGuard.Website("  www.enx.no  "), Is.EqualTo("https://www.enx.no"));
}
