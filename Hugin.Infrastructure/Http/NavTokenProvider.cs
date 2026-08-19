using System.Text.RegularExpressions;

namespace Hugin.Infrastructure.Http;

/// <summary>
/// Supplies the bearer token for the NAV feed. A token configured in hugin.json wins and is
/// never sent anywhere; otherwise the rotating public token is fetched and cached in memory.
///
/// /api/publicToken does not return a bare token — the body is a human-readable line followed
/// by the JWT (verified against the live endpoint 2026-08-18), so the JWT is extracted, not
/// used verbatim. Sending the whole body as a header value yields 400, not 401.
/// </summary>
public sealed partial class NavTokenProvider(HttpClient http, string? configuredToken)
{
    public const string TokenPath = "api/publicToken";

    private string? _cached;

    public async Task<string> GetTokenAsync(bool forceRefresh = false, CancellationToken ct = default)
    {
        if (!string.IsNullOrWhiteSpace(configuredToken)) return configuredToken;

        if (_cached is not null && !forceRefresh) return _cached;

        var response = await http.GetAsync(TokenPath, ct);
        response.EnsureSuccessStatusCode();

        var body = await response.Content.ReadAsStringAsync(ct);
        var match = JwtPattern().Match(body);

        return _cached = match.Success ? match.Value : body.Trim();
    }

    [GeneratedRegex(@"ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+")]
    private static partial Regex JwtPattern();
}

public sealed class NavAuthException(string message) : Exception(message);
