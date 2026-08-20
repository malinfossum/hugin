using Hugin.Core.Abstractions;
using Hugin.Core.Models;

namespace Hugin.Core.Services;

/// <summary>
/// Assembles the Preparelogg export — pipeline entries joined to their companies — and
/// renders them through <see cref="MarkdownExporter"/>. Shared by the CLI's
/// <c>hugin export</c> and the API's <c>GET /api/export</c>, so the two frontends can never drift.
/// </summary>
public sealed class ExportService(IPipelineRepository pipeline, ICompanyRepository companies, IClock clock)
{
    public async Task<string> ExportAsync(DateTimeOffset? since = null, CancellationToken ct = default)
    {
        var effectiveSince = since ?? clock.UtcNow.AddDays(-7);

        var entries = await pipeline.GetUpdatedAfterAsync(effectiveSince, ct);

        var rows = new List<(PipelineEntry Entry, Company Company)>(entries.Count);
        foreach (var entry in entries)
        {
            var company = await companies.GetAsync(entry.Orgnr, ct)
                ?? new Company { Orgnr = entry.Orgnr, Name = entry.Orgnr };
            rows.Add((entry, company));
        }

        return MarkdownExporter.Export(rows, effectiveSince);
    }
}
