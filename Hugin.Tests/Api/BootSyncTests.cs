using System.Net;
using System.Net.Http.Json;
using Hugin.Api.Services;

namespace Hugin.Tests.Api;

[TestFixture]
public sealed class BootSyncTests
{
    [Test]
    public async Task Fresh_install_holds_the_boot_sync_until_first_run_is_dismissed()
    {
        using var factory = new ApiFactory(autosync: true);
        using var client = factory.CreateApiClient();

        await Task.Delay(300);
        var held = await client.GetFromJsonAsync<SyncRunStatus>("/api/sync/status");
        Assert.That(held!.Running, Is.False);
        Assert.That(held.FinishedUtc, Is.Null, "no sync may run before the first-run dialog resolves");

        var dismiss = await client.PostAsync("/api/first-run-dismissed", null);
        Assert.That(dismiss.StatusCode, Is.EqualTo(HttpStatusCode.NoContent));

        var status = await SyncEndpointTests.PollUntilFinished(client);
        Assert.That(status.Brreg!.Succeeded, Is.True, "dismiss releases the hold with config defaults");
    }

    [Test]
    public async Task Existing_install_syncs_on_boot_immediately()
    {
        using var factory = new ApiFactory(autosync: true, existingDb: true);
        using var client = factory.CreateApiClient();

        var status = await SyncEndpointTests.PollUntilFinished(client);

        Assert.That(status.FinishedUtc, Is.Not.Null);
    }

    [Test]
    public async Task Dismiss_on_an_existing_install_does_not_start_a_second_sync()
    {
        using var factory = new ApiFactory(autosync: true, existingDb: true);
        using var client = factory.CreateApiClient();
        var first = await SyncEndpointTests.PollUntilFinished(client);

        var dismiss = await client.PostAsync("/api/first-run-dismissed", null);
        await Task.Delay(300);
        var after = await client.GetFromJsonAsync<SyncRunStatus>("/api/sync/status");

        Assert.That(dismiss.StatusCode, Is.EqualTo(HttpStatusCode.NoContent));
        Assert.That(after!.StartedUtc, Is.EqualTo(first.StartedUtc), "nothing was held, so nothing is released");
    }

    [Test]
    public async Task Dismiss_needs_the_write_header()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient(); // no X-Hugin

        var response = await client.PostAsync("/api/first-run-dismissed", null);

        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.Forbidden));
    }
}
