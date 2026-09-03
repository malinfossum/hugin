using Hugin.Core.Abstractions;

namespace Hugin.Api.Services;

/// <summary>
/// Boot sync. Normal mode: every start (a held gate means a fresh install waiting for first-run —
/// the dialog, or its Esc, starts the sync). Public mode: F1 sleeps after ~20 min idle and every
/// wake is a cold start, so the boot sync only runs when the last NAV sync is missing or older
/// than <see cref="PublicMinimumInterval"/> — otherwise repeat visitors would spend the daily
/// CPU quota on syncs that fetch nothing (demo spec A6).
/// </summary>
public sealed class StartupSync(SyncRunner runner, BootSyncGate gate, IConfiguration configuration,
    PublicModeOptions mode, IServiceScopeFactory scopes, IClock clock) : IHostedService
{
    public static readonly TimeSpan PublicMinimumInterval = TimeSpan.FromHours(6);

    public async Task StartAsync(CancellationToken ct)
    {
        if (configuration["hugin:autosync"] == "false" || gate.Held) return;
        if (mode.Enabled && !await NavIsStaleAsync(ct)) return;
        runner.TryStart();
    }

    public Task StopAsync(CancellationToken ct) => Task.CompletedTask;

    private async Task<bool> NavIsStaleAsync(CancellationToken ct)
    {
        await using var scope = scopes.CreateAsyncScope();
        var nav = await scope.ServiceProvider.GetRequiredService<ISyncStateRepository>().GetAsync("nav", ct);
        return nav is null || clock.UtcNow - nav.LastSyncUtc >= PublicMinimumInterval;
    }
}
