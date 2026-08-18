using System.Net;
using System.Text;

namespace Hugin.Tests;

/// <summary>
/// Builds an <see cref="HttpClient"/> over a lambda handler so client tests never touch
/// the network. Unmatched URLs come back 404, which is what the fallback paths expect.
/// </summary>
internal static class HttpFixtures
{
    public const string BrregBase = "https://data.brreg.no/enhetsregisteret/api/";

    public static HttpClient Client(Func<HttpRequestMessage, HttpResponseMessage> respond, string baseAddress = BrregBase)
        => new(new LambdaHandler(respond)) { BaseAddress = new Uri(baseAddress) };

    /// <summary>
    /// Serves a fixture file when the request URL contains the route fragment and asks for
    /// page 0; later pages come back empty so paging loops terminate. Routes are matched
    /// longest-fragment-first, so "underenheter?..." wins over the "enheter?..." substring.
    /// </summary>
    public static HttpClient ClientServing(params (string UrlFragment, string FixtureFile)[] routes)
    {
        var ordered = routes.OrderByDescending(r => r.UrlFragment.Length).ToArray();

        return Client(request =>
        {
            var url = request.RequestUri!.ToString();
            var match = ordered.FirstOrDefault(r => url.Contains(r.UrlFragment, StringComparison.Ordinal));
            if (match.FixtureFile is null) return NotFound();

            return url.Contains("page=0", StringComparison.Ordinal)
                ? Json(ReadFixture(match.FixtureFile))
                : Json("""{"_embedded":{},"page":{"size":200,"totalElements":0,"totalPages":1,"number":1}}""");
        });
    }

    public static string ReadFixture(string name)
        => File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", name), Encoding.UTF8);

    public static HttpResponseMessage Json(string body) =>
        new(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

    public static HttpResponseMessage NotFound() => new(HttpStatusCode.NotFound);

    private sealed class LambdaHandler(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
            => Task.FromResult(respond(request));
    }
}
