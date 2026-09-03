using Microsoft.AspNetCore.Http;

namespace Hugin.Api;

/// <summary>
/// Localhost is not a boundary against the browser: any web page can fire simple requests at
/// http://localhost:*, and DNS rebinding can read responses. Two cheap rules close both holes
/// for a single-user loopback API — see the phase-2 spec's "API security" section.
///
/// Public mode (the hosted demo) swaps the model: the platform routes by hostname so the Host
/// allowlist is skipped, and instead of gating writes on a header, every write is refused —
/// there is nothing a visitor may change. Three response headers harden the now internet-facing
/// SPA (demo spec A9).
/// </summary>
public static class Security
{
    private static readonly string[] AllowedHosts = ["localhost", "127.0.0.1", "[::1]"];

    public static IApplicationBuilder UseHuginSecurity(this IApplicationBuilder app, PublicModeOptions mode) =>
        app.Use(async (context, next) =>
        {
            if (mode.Enabled)
            {
                context.Response.OnStarting(() =>
                {
                    var headers = context.Response.Headers;
                    headers["X-Content-Type-Options"] = "nosniff";
                    headers["X-Frame-Options"] = "DENY";
                    headers["Referrer-Policy"] = "no-referrer";
                    return Task.CompletedTask;
                });
            }
            else
            {
                var host = context.Request.Host.Host;
                if (!AllowedHosts.Contains(host, StringComparer.OrdinalIgnoreCase))
                {
                    await Results.Problem(statusCode: StatusCodes.Status403Forbidden,
                        title: "Ukjent Host-header — Hugin svarer bare på localhost.")
                        .ExecuteAsync(context);
                    return;
                }
            }

            var method = context.Request.Method;
            var isWrite = method != HttpMethods.Get && method != HttpMethods.Head && method != HttpMethods.Options;
            if (isWrite && context.Request.Path.StartsWithSegments("/api"))
            {
                if (mode.Enabled)
                {
                    await Results.Problem(statusCode: StatusCodes.Status403Forbidden,
                        title: PublicMode.WriteRefusedTitle).ExecuteAsync(context);
                    return;
                }

                if (context.Request.Headers["X-Hugin"] != "1")
                {
                    // A missing custom header means the request never passed a CORS preflight —
                    // i.e. it did not come from the dashboard.
                    await Results.Problem(statusCode: StatusCodes.Status403Forbidden,
                        title: "Mangler X-Hugin-header — skriving er forbeholdt dashbordet.")
                        .ExecuteAsync(context);
                    return;
                }
            }

            await next();
        });
}
