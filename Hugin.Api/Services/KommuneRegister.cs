using Hugin.Core.Abstractions;
using Hugin.Core.Models;

namespace Hugin.Api.Services;

public sealed class RegisterUnavailableException(Exception? inner)
    : Exception("Kommuneregisteret er ikke tilgjengelig ennå — synk først, eller prøv igjen senere.", inner);

/// <summary>
/// Brreg's kommune register as the API sees it: the synced table first; on a fresh install
/// (empty table — the boot sync is held for first-run) a live Brreg fetch, stored best-effort so
/// the next call is local. Throws <see cref="RegisterUnavailableException"/> only when both are empty.
/// </summary>
public sealed class KommuneRegister(IKommuneRepository kommuner, IBrregClient brreg)
{
    public async Task<IReadOnlyDictionary<string, string>> GetAsync(CancellationToken ct = default)
    {
        var stored = await kommuner.GetAllAsync(ct);
        if (stored.Count > 0) return stored;

        IReadOnlyList<Kommune> fetched;
        try
        {
            fetched = await brreg.GetKommunerAsync(ct);
        }
        catch (Exception ex)
        {
            throw new RegisterUnavailableException(ex);
        }
        if (fetched.Count == 0) throw new RegisterUnavailableException(null);

        try { await kommuner.UpsertManyAsync(fetched, ct); }
        catch (Exception) { /* cache only — the caller still gets the live answer */ }

        return fetched.ToDictionary(k => k.Number, k => k.Name);
    }
}
