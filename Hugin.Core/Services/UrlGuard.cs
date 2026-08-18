namespace Hugin.Core.Services;

/// <summary>
/// A URL from an external feed is rendered as a link only when its scheme is http/https.
/// Anything else (javascript:, data:, file:) is rejected and stored as plain text.
/// </summary>
public static class UrlGuard
{
    public static string? HttpOrHttps(string? url) =>
        Uri.TryCreate(url, UriKind.Absolute, out var u)
        && (u.Scheme == Uri.UriSchemeHttp || u.Scheme == Uri.UriSchemeHttps)
            ? url
            : null;
}
