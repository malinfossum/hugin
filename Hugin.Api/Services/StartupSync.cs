namespace Hugin.Api.Services;

public sealed class StartupSync(SyncRunner runner, IConfiguration configuration) : IHostedService
{
    public Task StartAsync(CancellationToken ct)
    {
        if (configuration["hugin:autosync"] != "false") runner.TryStart();
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken ct) => Task.CompletedTask;
}
