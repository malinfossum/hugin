using Hugin.Core.Abstractions;
using Hugin.Core.Models;

namespace Hugin.Core.Services;

public sealed class CompanyNotFoundException(string orgnr)
    : Exception($"fant ikke orgnr {orgnr} i Enhetsregisteret (verken enhet eller underenhet)")
{
    public string Orgnr { get; } = orgnr;
}

public sealed record TrackResult(PipelineEntry Entry, bool CompanyFetchedFromBrreg, string? Warning);

/// <summary>
/// Moves a company through the outreach pipeline. Tracking is deliberately unconstrained by
/// the NACE filter: that filter governs <em>discovery</em>, and the companies worth applying to
/// are often outside it (Norsk Tipping is NACE 92, Statens vegvesen 84).
/// </summary>
public sealed class PipelineService(
    IPipelineRepository pipeline,
    ICompanyRepository companies,
    IBrregClient brreg,
    IClock clock)
{
    public async Task<TrackResult> TrackAsync(string orgnr, PipelineStatus status,
        string? why, string? note, string? svar, CancellationToken ct = default)
    {
        var now = clock.UtcNow;
        var fetchedFromBrreg = false;

        if (await companies.GetAsync(orgnr, ct) is null)
        {
            var fetched = await brreg.GetByOrgnrAsync(orgnr, ct)
                ?? throw new CompanyNotFoundException(orgnr);

            await companies.UpsertAsync(fetched, now, ct);
            fetchedFromBrreg = true;
        }

        var existing = await pipeline.GetByOrgnrAsync(orgnr, ct);

        // Options that were not passed leave the stored values alone — re-tracking a company
        // to move its status must never wipe the begrunnelse written last week.
        var entry = new PipelineEntry
        {
            Id = existing?.Id ?? 0,
            Orgnr = orgnr,
            Status = status,
            Why = why ?? existing?.Why ?? "",
            Note = note ?? existing?.Note,
            SvarText = svar ?? existing?.SvarText,
            Created = existing?.Created ?? now,
            Updated = now,
        };

        await pipeline.UpsertAsync(entry, ct);

        var warning = status != PipelineStatus.Funnet && string.IsNullOrWhiteSpace(entry.Why)
            ? $"mangler begrunnelse — GET spør om hvorfor {orgnr} er interessant. Legg den til med --why \"...\""
            : null;

        return new TrackResult(entry, fetchedFromBrreg, warning);
    }
}
