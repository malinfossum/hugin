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
