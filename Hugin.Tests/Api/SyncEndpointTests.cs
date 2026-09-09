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
        // No default geography any more (spec v3.5 Part A) — this test is about the sync
        // endpoint's own mechanics, not scope resolution, so give it an explicit one.
        File.WriteAllText(factory.ConfigPath, """{ "municipalities": [{ "name": "Hamar", "number": "3403" }] }""");
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
    public async Task Sync_can_be_started_as_a_full_backfill()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateApiClient();

        var response = await client.PostAsync("/api/sync?full=1", null);
        Assert.That(response.IsSuccessStatusCode, Is.True);

        var status = await PollUntilFinished(client);
        Assert.That(status.Running, Is.False);
        Assert.That(factory.Nav.FirstPageRequested, Is.True, "a backfill enters at the feed's oldest page");
    }

    [Test]
    public async Task Sync_full_backfill_accepts_true_spelling()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateApiClient();

        var response = await client.PostAsync("/api/sync?full=true", null);
        Assert.That(response.IsSuccessStatusCode, Is.True);

        var status = await PollUntilFinished(client);
        Assert.That(status.Running, Is.False);
        Assert.That(factory.Nav.FirstPageRequested, Is.True, "full=true also reaches the backfill path");
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

    internal static async Task<SyncRunStatus> PollUntilFinished(HttpClient client)
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
