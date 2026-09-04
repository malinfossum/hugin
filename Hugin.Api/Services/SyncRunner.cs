using Hugin.Core.Abstractions;
using Hugin.Core.Services;
using Hugin.Infrastructure.Data;

namespace Hugin.Api.Services;

public sealed record SyncRunStatus(bool Running, DateTimeOffset? StartedUtc,
    DateTimeOffset? FinishedUtc, SourceResult? Brreg, SourceResult? Nav);

/// <summary>
/// One sync in flight per process. SyncService and its repositories are scoped, so each run
/// gets a fresh scope; cross-process overlap with the CLI stays an accepted risk (spec).
/// </summary>
public sealed class SyncRunner(IServiceScopeFactory scopes, IClock clock)
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
        try
        {
            await using var scope = scopes.CreateAsyncScope();
            var summary = await scope.ServiceProvider.GetRequiredService<SyncService>().SyncAsync();
            (brreg, nav) = (summary.Brreg, summary.Nav);

            // Demo spec B3: seeder → checkpoint → copy-back, in that order, so the persisted
            // snapshot carries the seeded pipeline. Both are no-ops outside public mode.
            await scope.ServiceProvider.GetRequiredService<DemoSeeder>().ApplyAsync();
            await scope.ServiceProvider.GetRequiredService<DemoSnapshot>()
                .CopyBackAsync(scope.ServiceProvider.GetRequiredService<HuginDbContext>());
        }
        catch (Exception ex)
        {
            brreg = nav = new SourceResult(false, 0, ex.Message);
        }

        lock (_lock)
            _status = new SyncRunStatus(false, _status.StartedUtc, clock.UtcNow, brreg, nav);
    }
}
