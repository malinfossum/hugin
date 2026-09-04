using Hugin.Core.Abstractions;
using Hugin.Core.Services;
using Hugin.Infrastructure.Data;
using Microsoft.Extensions.Logging;

namespace Hugin.Api.Services;

public sealed record SyncRunStatus(bool Running, DateTimeOffset? StartedUtc,
    DateTimeOffset? FinishedUtc, SourceResult? Brreg, SourceResult? Nav);

/// <summary>
/// One sync in flight per process. SyncService and its repositories are scoped, so each run
/// gets a fresh scope; cross-process overlap with the CLI stays an accepted risk (spec).
/// </summary>
public sealed class SyncRunner(IServiceScopeFactory scopes, IClock clock, ILogger<SyncRunner> logger)
{
    private readonly Lock _lock = new();
    private SyncRunStatus _status = new(false, null, null, null, null);

    public SyncRunStatus Status { get { lock (_lock) return _status; } }

    public bool TryStart()
    {
        lock (_lock)
        {
            if (_status.Running) return false;
            _status = new SyncRunStatus(true, clock.UtcNow, null, null, null);
        }

        _ = Task.Run(RunAsync);
        return true;
    }

    private async Task RunAsync()
    {
        SourceResult brreg, nav;
        await using var scope = scopes.CreateAsyncScope();

        try
        {
            var summary = await scope.ServiceProvider.GetRequiredService<SyncService>().SyncAsync();
            (brreg, nav) = (summary.Brreg, summary.Nav);
        }
        catch (Exception ex)
        {
            brreg = nav = new SourceResult(false, 0, ex.Message);
        }

        // Demo spec B3: seeder → checkpoint → copy-back, in that order, so the persisted snapshot
        // carries the seeded pipeline — run in its own try so a throw above (or in here) never
        // costs the demo its persisted snapshot, and a seed/copy failure is never mislabelled as
        // a Brreg/Nav result. Both are no-ops outside public mode.
        try
        {
            await scope.ServiceProvider.GetRequiredService<DemoSeeder>().ApplyAsync();
            await scope.ServiceProvider.GetRequiredService<DemoSnapshot>()
                .CopyBackAsync(scope.ServiceProvider.GetRequiredService<HuginDbContext>());
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Demo: seed eller kopiering tilbake feilet.");
        }

        lock (_lock)
            _status = new SyncRunStatus(false, _status.StartedUtc, clock.UtcNow, brreg, nav);
    }
}
