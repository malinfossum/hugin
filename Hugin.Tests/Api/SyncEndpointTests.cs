using System.Net;
using System.Net.Http.Json;
using Hugin.Api.Services;

namespace Hugin.Tests.Api;

public sealed record ProblemDetailsProbe(string? Title);

[TestFixture]
public sealed class SyncEndpointTests
{
    private static readonly TimeSpan PollTimeout = TimeSpan.FromSeconds(5);

    [Test]
    public async Task Post_sync_runs_to_completion_with_source_results()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateApiClient();

        var post = await client.PostAsync("/api/sync", null);
        Assert.That(post.StatusCode, Is.EqualTo(HttpStatusCode.Accepted));

        var status = await PollUntilFinished(client);

        Assert.That(status.Running, Is.False);
        Assert.That(status.Brreg, Is.Not.Null);
        Assert.That(status.Nav, Is.Not.Null);
        Assert.That(status.Brreg!.Succeeded, Is.True);
        Assert.That(status.Nav!.Succeeded, Is.True);
    }

    [Test]
    public async Task Post_sync_while_running_returns_409_then_completes_after_release()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateApiClient();

        var gate = new TaskCompletionSource();
        factory.Nav.OnCall = () => gate.Task;

        try
        {
            var first = await client.PostAsync("/api/sync", null);
            Assert.That(first.StatusCode, Is.EqualTo(HttpStatusCode.Accepted));

            var second = await client.PostAsync("/api/sync", null);
            Assert.That(second.StatusCode, Is.EqualTo(HttpStatusCode.Conflict));

            var problem = await second.Content.ReadFromJsonAsync<ProblemDetailsProbe>();
            Assert.That(problem!.Title, Is.EqualTo("En synk kjører allerede."));
        }
        finally
        {
            gate.SetResult();
        }

        var status = await PollUntilFinished(client);
        Assert.That(status.Running, Is.False);
    }

    [Test]
    public async Task Fresh_factory_never_syncs_on_boot()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateApiClient();

        var status = await client.GetFromJsonAsync<SyncRunStatus>("/api/sync/status");

        Assert.That(status!.Running, Is.False);
        Assert.That(status.FinishedUtc, Is.Null);
    }

    private static async Task<SyncRunStatus> PollUntilFinished(HttpClient client)
    {
        var deadline = DateTime.UtcNow + PollTimeout;
        while (DateTime.UtcNow < deadline)
        {
            var status = await client.GetFromJsonAsync<SyncRunStatus>("/api/sync/status");
            if (status is { Running: false, FinishedUtc: not null }) return status;
            await Task.Delay(25);
        }

        throw new TimeoutException("Sync did not finish within the poll timeout.");
    }
}
