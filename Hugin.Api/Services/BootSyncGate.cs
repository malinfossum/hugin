namespace Hugin.Api.Services;

/// <summary>
/// Holds the boot auto-sync on a fresh install (no hugin.db when the host started) until the
/// first-run dialog resolves — otherwise the default Innlandet scope would race the user's
/// choice and be fetched for nothing (spec v3.4 Part C, the stress-test's 🔴). Saving the
/// discovery config releases it (the dashboard then starts the sync itself); an Esc-dismiss
/// releases it AND starts the sync with the config defaults.
/// </summary>
public sealed class BootSyncGate
{
    private readonly Lock _lock = new();

    public bool Held { get; private set; }

    public void Hold()
    {
        lock (_lock) Held = true;
    }

    /// <summary>Returns true when there was a hold to release — the caller decides what to do next.</summary>
    public bool Release()
    {
        lock (_lock)
        {
            var was = Held;
            Held = false;
            return was;
        }
    }
}
