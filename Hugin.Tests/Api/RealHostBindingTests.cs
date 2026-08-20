using System.Diagnostics;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;

namespace Hugin.Tests.Api;

/// <summary>
/// The spec promises loopback-only binding "asserted by a test" — but WebApplicationFactory
/// (used by every other Api test) swaps Kestrel out for an in-memory TestServer, so it can never
/// exercise the real <c>ConfigureKestrel(o => o.Listen(IPAddress.Loopback, port))</c> call in
/// Program.cs. This test runs the actual Hugin.Api host as a subprocess and reads the OS's TCP
/// listener table directly — deterministic, and independent of LAN reachability or firewall
/// behavior (which a "try to connect from outside" test would be at the mercy of).
/// </summary>
[TestFixture]
public sealed class RealHostBindingTests
{
    [Test]
    [CancelAfter(20_000)]
    public async Task Real_host_binds_loopback_only(CancellationToken cancellationToken)
    {
        var port = GetFreeTcpPort();
        var tempDir = Directory.CreateTempSubdirectory("hugin-realhost-");
        var configPath = Path.Combine(tempDir.FullName, "hugin.json"); // absent on disk: ConfigLoader falls back to defaults

        var dllPath = typeof(Program).Assembly.Location;
        var psi = new ProcessStartInfo("dotnet")
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
        };
        psi.ArgumentList.Add(dllPath);
        psi.ArgumentList.Add("--port");
        psi.ArgumentList.Add(port.ToString());
        psi.ArgumentList.Add("--config");
        psi.ArgumentList.Add(configPath);
        psi.Environment["hugin__autosync"] = "false"; // no real Brreg/NAV calls from a test process

        using var process = Process.Start(psi) ?? throw new InvalidOperationException("failed to start Hugin.Api");
        // Drain redirected streams so the child never blocks on a full pipe buffer.
        process.OutputDataReceived += (_, _) => { };
        process.ErrorDataReceived += (_, _) => { };
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();

        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
            var ready = false;
            while (!ready && !cancellationToken.IsCancellationRequested)
            {
                try
                {
                    var response = await http.GetAsync($"http://127.0.0.1:{port}/api/status", cancellationToken);
                    ready = response.IsSuccessStatusCode;
                }
                catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
                {
                    await Task.Delay(200, cancellationToken);
                }
            }
            Assert.That(ready, Is.True, "real Hugin.Api host never became ready on 127.0.0.1");

            var listeners = IPGlobalProperties.GetIPGlobalProperties().GetActiveTcpListeners()
                .Where(l => l.Port == port)
                .ToList();

            Assert.That(listeners, Is.Not.Empty, "no listener found for the host's port — cannot assert its bind address");
            Assert.That(listeners, Has.All.Matches<IPEndPoint>(l => IPAddress.IsLoopback(l.Address)),
                $"expected loopback-only binding, found: {string.Join(", ", listeners.Select(l => l.Address))}");
        }
        finally
        {
            try { if (!process.HasExited) process.Kill(entireProcessTree: true); } catch (InvalidOperationException) { }
            process.Dispose();
            try { Directory.Delete(tempDir.FullName, recursive: true); } catch (IOException) { }
        }
    }

    private static int GetFreeTcpPort()
    {
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop();
        return port;
    }
}
