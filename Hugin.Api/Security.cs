using Microsoft.AspNetCore.Http;

namespace Hugin.Api;

/// <summary>
/// Localhost is not a boundary against the browser: any web page can fire simple requests at
/// http://localhost:*, and DNS rebinding can read responses. Two cheap rules close both holes
/// for a single-user loopback API — see the spec's "API security" section.
/// </summary>
public static class Security
{
    private static readonly string[] AllowedHosts = ["localhost", "127.0.0.1", "[::1]"];

    public static IApplicationBuilder UseHuginSecurity(this IApplicationBuilder app) =>
        app.Use(async (context, next) =>
        {
            var host = context.Request.Host.Host;
            if (!AllowedHosts.Contains(host, StringComparer.OrdinalIgnoreCase))
            {
                await Results.Problem(statusCode: StatusCodes.Status403Forbidden,
                    title: "Ukjent Host-header — Hugin svarer bare på localhost.")
                    .ExecuteAsync(context);
                return;
            }

            var method = context.Request.Method;
            var isWrite = method != HttpMethods.Get && method != HttpMethods.Head && method != HttpMethods.Options;
            if (isWrite && context.Request.Path.StartsWithSegments("/api")
                && context.Request.Headers["X-Hugin"] != "1")
            {
                // A missing custom header means the request never passed a CORS preflight —
                // i.e. it did not come from the dashboard.
                await Results.Problem(statusCode: StatusCodes.Status403Forbidden,
                    title: "Mangler X-Hugin-header — skriving er forbeholdt dashbordet.")
                    .ExecuteAsync(context);
                return;
            }

            await next();
        });
}
