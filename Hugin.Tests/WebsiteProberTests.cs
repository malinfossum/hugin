using System.Net;
using Hugin.Infrastructure.Http;

namespace Hugin.Tests;

public class WebsiteProberTests
{
    [Test]
    public async Task Https_variant_answering_is_ok_and_resolves_to_itself()
    {
        var prober = new WebsiteProber(HttpFixtures.Client(request =>
            request.RequestUri!.Scheme == "https"
                ? new HttpResponseMessage(HttpStatusCode.OK)
                : throw new HttpRequestException("http skal ikke kalles")));

        var result = await prober.ProbeAsync("https://norkart.no", CancellationToken.None);

        Assert.That(result.Ok, Is.True);
        Assert.That(result.ResolvedUrl, Is.EqualTo("https://norkart.no"));
    }

    [Test]
    public async Task Https_failing_falls_back_to_http_and_resolves_to_the_http_variant()
    {
        var prober = new WebsiteProber(HttpFixtures.Client(request =>
            request.RequestUri!.Scheme == "https"
                ? new HttpResponseMessage(HttpStatusCode.ServiceUnavailable)
                : new HttpResponseMessage(HttpStatusCode.OK)));

        var result = await prober.ProbeAsync("https://httponly.no", CancellationToken.None);

        Assert.That(result.Ok, Is.True);
        Assert.That(result.ResolvedUrl, Is.EqualTo("http://httponly.no"));
    }

    [Test]
    public async Task Both_variants_failing_is_not_ok()
    {
        var prober = new WebsiteProber(HttpFixtures.Client(_ => new HttpResponseMessage(HttpStatusCode.NotFound)));

        var result = await prober.ProbeAsync("https://dodt.no", CancellationToken.None);

        Assert.That(result.Ok, Is.False);
        Assert.That(result.ResolvedUrl, Is.Null);
    }

    [Test]
    public async Task An_exception_on_both_variants_is_not_ok_and_never_throws()
    {
        var prober = new WebsiteProber(HttpFixtures.Client(_ => throw new HttpRequestException("nettverksfeil")));

        var result = await prober.ProbeAsync("https://tidsavbrutt.no", CancellationToken.None);

        Assert.That(result.Ok, Is.False);
    }

    [Test]
    public async Task Scheme_less_input_is_treated_as_https_first()
    {
        var prober = new WebsiteProber(HttpFixtures.Client(request =>
            request.RequestUri!.Scheme == "https" && request.RequestUri.Host == "utenskjema.no"
                ? new HttpResponseMessage(HttpStatusCode.OK)
                : new HttpResponseMessage(HttpStatusCode.NotFound)));

        var result = await prober.ProbeAsync("utenskjema.no", CancellationToken.None);

        Assert.That(result.Ok, Is.True);
        Assert.That(result.ResolvedUrl, Is.EqualTo("https://utenskjema.no"));
    }
}
