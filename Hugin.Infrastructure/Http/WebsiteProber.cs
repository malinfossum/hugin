using System.Text.RegularExpressions;
using Hugin.Core.Abstractions;

namespace Hugin.Infrastructure.Http;

/// <summary>
/// Probes a company website over HTTP. Registered as a DI singleton over one shared
/// <see cref="HttpClient"/> (built by <see cref="CreateHttpClient"/>) so a full sync's worth of
/// checks reuses connections instead of exhausting sockets; tests pass their own client.
///
/// Norway's register carries `hjemmeside` values that were https-prefixed at ingest whether or
/// not the site actually answers there (see <see cref="Services.UrlGuard.Website"/>) — so both
/// variants are always tried, https first, regardless of what scheme the input happens to carry.
/// </summary>
public sealed partial class WebsiteProber(HttpClient http) : IWebsiteProber
{
    public async Task<WebsiteProbeResult> ProbeAsync(string url, CancellationToken ct = default)
    {
        var (https, httpVariant) = Variants(url);

        if (await AnswersAsync(https, ct)) return new WebsiteProbeResult(true, https);
        if (await AnswersAsync(httpVariant, ct)) return new WebsiteProbeResult(true, httpVariant);
        return new WebsiteProbeResult(false, null);
    }

    private async Task<bool> AnswersAsync(string url, CancellationToken ct)
    {
        try
        {
            using var response = await http.GetAsync(url, ct);
            return (int)response.StatusCode < 400;
        }
        catch (Exception)
        {
            // Timeout, DNS failure, TLS failure, connection refused — all read as "not ok".
            return false;
        }
    }

    /// <summary>Both variants are built from the bare host+path, not from swapping whatever
    /// scheme (if any) the input already carried — a scheme-less "innit.no" and an explicit
    /// "https://innit.no" probe identically.</summary>
    private static (string Https, string Http) Variants(string url)
    {
        var withoutScheme = SchemePrefix().Replace(url.Trim(), "");
        return ($"https://{withoutScheme}", $"http://{withoutScheme}");
    }

    /// <summary>6s timeout — a best-effort background check must never let one slow host stall
    /// the whole sync; a browser-ish user agent, since some sites block anything else; redirects
    /// followed so a real www→apex (or https-upgrade) hop still counts as reachable.</summary>
    public static HttpClient CreateHttpClient()
    {
        var client = new HttpClient(new HttpClientHandler { AllowAutoRedirect = true })
        {
            Timeout = TimeSpan.FromSeconds(6),
        };
        client.DefaultRequestHeaders.UserAgent.ParseAdd(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) HuginWebsiteChecker/1.0");
        return client;
    }

    [GeneratedRegex(@"^https?://", RegexOptions.IgnoreCase)]
    private static partial Regex SchemePrefix();
}
