using Hugin.Core.Abstractions;
using Hugin.Core.Models;

namespace Hugin.Core.Services;

public sealed class CompanyNotFoundException(string orgnr)
    : Exception($"fant ikke orgnr {orgnr} i Enhetsregisteret (verken enhet eller underenhet)")
{
    public string Orgnr { get; } = orgnr;
}

public enum RelationKind { Family, Brand }

/// <summary>A tracked entry that looks related to a company tracked for the first time:
/// same registry root (<see cref="RelationKind.Family"/>) or same brand word
/// (<see cref="RelationKind.Brand"/>). Family wins when both hold.</summary>
public sealed record RelatedEntry(PipelineEntry Entry, string Name, RelationKind Kind);

public sealed record TrackResult(PipelineEntry Entry, bool CompanyFetchedFromBrreg, string? Warning,
    IReadOnlyList<RelatedEntry> Related);
public sealed record UntrackResult(PipelineRemoval Removal, string? CompanyName);

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
        string? why, string? note, string? svar, bool? starred = null, CancellationToken ct = default)
    {
        var now = clock.UtcNow;
        var fetchedFromBrreg = false;
        var companyName = (await companies.GetAsync(orgnr, ct))?.Name;

        if (companyName is null)
        {
            var fetched = await brreg.GetByOrgnrAsync(orgnr, ct)
                ?? throw new CompanyNotFoundException(orgnr);

            await companies.UpsertAsync(fetched, now, ct);
            fetchedFromBrreg = true;
            companyName = fetched.Name;
        }

        var existing = await pipeline.GetByOrgnrAsync(orgnr, ct);

        // Options that were not passed leave the stored values alone — re-tracking a company
        // to move its status must never wipe the begrunnelse written last week, or the star.
        var entry = new PipelineEntry
        {
            Id = existing?.Id ?? 0,
            Orgnr = orgnr,
            Status = status,
            Starred = starred ?? existing?.Starred ?? false,
            Why = why ?? existing?.Why ?? "",
            Note = note ?? existing?.Note,
            SvarText = svar ?? existing?.SvarText,
            Created = existing?.Created ?? now,
            Updated = now,
        };

        await pipeline.UpsertAsync(entry, ct);

        var warning = status != PipelineStatus.Active && string.IsNullOrWhiteSpace(entry.Why)
            ? $"mangler begrunnelse — legg til hvorfor {orgnr} er interessant (--why \"...\")"
            : null;

        // Only a new row warns: re-tracking an entry means the relationship was accepted once.
        IReadOnlyList<RelatedEntry> related = existing is null ? await FindRelativesAsync(orgnr, companyName, ct) : [];

        return new TrackResult(entry, fetchedFromBrreg, warning, related);
    }

    /// <summary>One pass over the pipeline (tens of rows, up to <see cref="RegistryRoot.MaxHops"/>
    /// lookups each), once per new track. The new row is already stored, so it skips its own
    /// orgnr; an entry whose company row is missing is skipped. Newest first, like <c>list</c>.</summary>
    private async Task<IReadOnlyList<RelatedEntry>> FindRelativesAsync(string orgnr, string name, CancellationToken ct)
    {
        var newRoot = await RegistryRoot.ResolveAsync(companies, orgnr, ct);
        var newToken = BrandName.Token(name);
        var related = new List<RelatedEntry>();

        foreach (var entry in await pipeline.GetAllAsync(ct: ct))
        {
            if (entry.Orgnr == orgnr) continue;
            if (await companies.GetAsync(entry.Orgnr, ct) is not { } company) continue;

            if (await RegistryRoot.ResolveAsync(companies, entry.Orgnr, ct) == newRoot)
                related.Add(new RelatedEntry(entry, company.Name, RelationKind.Family));
            else if (newToken is not null && BrandName.Token(company.Name) == newToken)
                related.Add(new RelatedEntry(entry, company.Name, RelationKind.Brand));
        }

        return related
            .OrderByDescending(r => r.Entry.Updated)
            .ThenBy(r => r.Entry.Orgnr, StringComparer.Ordinal)
            .ToList();
    }

    /// <summary>Removes one pipeline entry (and the manual ad links to it). The company row
    /// stays. Null when the orgnr is not tracked. Never touches the network.</summary>
    public async Task<UntrackResult?> UntrackAsync(string orgnr, CancellationToken ct = default)
    {
        var removal = await pipeline.DeleteAsync(orgnr, ct);
        if (removal is null) return null;

        var company = await companies.GetAsync(orgnr, ct);
        return new UntrackResult(removal, company?.Name);
    }
}
