namespace Hugin.Core.Services;

/// <summary>
/// A URL from an external feed is rendered as a link only when its scheme is http/https.
/// Anything else (javascript:, data:, file:) is rejected and stored as plain text.
/// </summary>
public static partial class UrlGuard
{
    public static string? HttpOrHttps(string? url) =>
        Uri.TryCreate(url, UriKind.Absolute, out var u)
        && (u.Scheme == Uri.UriSchemeHttp || u.Scheme == Uri.UriSchemeHttps)
            ? url
            : null;

    /// <summary>
    /// Register homepages are stored as bare hostnames ("www.innit.no"), which
    /// <see cref="HttpOrHttps"/> rejects outright. Assume https for those, but never invent a
    /// scheme for a value that already declares one — prefixing "javascript:alert(1)" would
    /// smuggle exactly what the guard exists to stop.
    /// </summary>
    public static string? Website(string? raw)
    {
        var value = raw?.Trim();
        if (string.IsNullOrEmpty(value)) return null;

        if (SchemePattern().IsMatch(value)) return HttpOrHttps(value);

        // A hostname needs a dot; a bare word is a note someone typed, not an address.
        var host = value.Split('/', 2)[0];
        if (!host.Contains('.', StringComparison.Ordinal)) return null;

        return HttpOrHttps("https://" + value);
    }

    [System.Text.RegularExpressions.GeneratedRegex(@"^[a-zA-Z][a-zA-Z0-9+.\-]*:")]
    private static partial System.Text.RegularExpressions.Regex SchemePattern();
}
