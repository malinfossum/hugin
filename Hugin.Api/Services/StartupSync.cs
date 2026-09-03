namespace Hugin.Api.Services;

public sealed class StartupSync(SyncRunner runner, BootSyncGate gate, IConfiguration configuration) : IHostedService
{
    public Task StartAsync(CancellationToken ct)
    {
        // A held gate means a fresh install waiting for first-run — the dialog (or its Esc) starts the sync.
        if (configuration["hugin:autosync"] != "false" && !gate.Held) runner.TryStart();
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken ct) => Task.CompletedTask;
}
