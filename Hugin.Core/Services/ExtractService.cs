using Hugin.Core.Abstractions;
using Hugin.Core.Config;
using Hugin.Core.Models;

namespace Hugin.Core.Services;

public enum ExtractScope { New, Category, All }

public enum ExtractFormat { Md, Txt, Json }

/// <summary>Thrown when <see cref="ExtractScope.Category"/> is requested without a category —
/// the one combination that cannot produce a meaningful (even if empty) document.</summary>
public sealed class MissingCategoryException() : Exception("kategori er påkrevd for scope=category");

public sealed record ExtractResult(string Content, string FileName, string ContentType);

/// <summary>One row of <see cref="ExtractDocument.Companies"/> — a DTO shape, never the EF entity,
/// so JSON serialization can never leak internal fields.</summary>
public sealed record ExtractCompanyRow(string Orgnr, string Name, string? Kommune, string? KommuneNavn,
    string? Website, bool IsBranch);

public sealed record ExtractAdRow(string FeedId, string Title, string? Employer, string? EmployerOrgnr,
    string? Kommune, DateTimeOffset? Expires, string? Category, string? SourceUrl);

/// <summary>One outreach row — the Preparelogg-compatible shape (Dato · Bedrift · Nettside · Grunn · Svar).</summary>
public sealed record ExtractTrackerRow(DateTimeOffset Updated, string CompanyName, string? Website,
    string Why, string? Svar);

public sealed record ExtractDocument(DateTimeOffset GeneratedUtc, string Scope, string? Category,
    IReadOnlyList<ExtractCompanyRow> Companies, IReadOnlyList<ExtractAdRow> Ads,
    IReadOnlyList<ExtractTrackerRow> Tracker);

/// <summary>
/// Assembles a downloadable snapshot of Hugin's data in one of three scopes and renders it in
/// one of three formats. Replaces the Preparelogg-specific <c>ExportService</c>: the weekly
/// routine is now served by the "Søkt" table inside the <see cref="ExtractScope.All"/> scope.
/// Shared by the CLI's <c>hugin export</c> and the API's <c>GET /api/extract</c>.
/// </summary>
public sealed class ExtractService(
    ICompanyRepository companies,
    IAdRepository ads,
    IPipelineRepository pipeline,
    IReviewMarkRepository reviewMark,
    IKommuneRepository kommuneRepo,
    HuginConfig config,
    IClock clock)
{
    public async Task<ExtractResult> ExtractAsync(ExtractScope scope, ExtractFormat format,
        string? category = null, bool includeActive = false, CancellationToken ct = default)
    {
        if (scope == ExtractScope.Category && string.IsNullOrWhiteSpace(category))
            throw new MissingCategoryException();

        var kommuner = await kommuneRepo.GetAllAsync(ct);

        IReadOnlyList<ExtractCompanyRow> companyRows = [];
        IReadOnlyList<ExtractAdRow> adRows = [];
        IReadOnlyList<ExtractTrackerRow> trackerRows = [];

        switch (scope)
        {
            case ExtractScope.New:
                // No review mark yet (no sync has ever completed) — empty-but-valid document,
                // same "starts empty" rule as `hugin new`.
                if (await reviewMark.GetAsync(ct) is { } mark)
                {
                    companyRows = (await companies.GetFirstSeenAfterAsync(mark, ct))
                        .Select(c => ToCompanyRow(c, kommuner)).ToList();
                    adRows = (await ads.GetFirstSeenAfterAsync(mark, ct)).Select(ToAdRow).ToList();
                }
                break;

            case ExtractScope.Category:
                adRows = (await ads.GetActiveAsync(ct: ct))
                    .Where(a => a.Category is not null
                        && a.Category.Contains(category!, StringComparison.OrdinalIgnoreCase))
                    .Select(ToAdRow)
                    .ToList();
                break;

            case ExtractScope.All:
                companyRows = (await companies.GetAllAsync(ct: ct)).Select(c => ToCompanyRow(c, kommuner)).ToList();
                adRows = (await ads.GetActiveAsync(ct: ct)).Select(ToAdRow).ToList();
                trackerRows = await BuildTrackerAsync(includeActive, ct);
                break;
        }

        var now = clock.UtcNow;
        var document = new ExtractDocument(now, ScopeSlug(scope), category, companyRows, adRows, trackerRows);

        var content = format switch
        {
            ExtractFormat.Md => ExtractRenderer.RenderMarkdown(document),
            ExtractFormat.Txt => ExtractRenderer.RenderText(document),
            ExtractFormat.Json => ExtractRenderer.RenderJson(document),
            _ => throw new ArgumentOutOfRangeException(nameof(format), format, null),
        };

        return new ExtractResult(content, $"hugin-{ScopeSlug(scope)}-{now:yyyyMMdd}.{Extension(format)}",
            ContentType(format));
    }

    private async Task<IReadOnlyList<ExtractTrackerRow>> BuildTrackerAsync(bool includeActive, CancellationToken ct)
    {
        var entries = await pipeline.GetAllAsync(ct: ct);
        var rows = new List<ExtractTrackerRow>();

        // Active is pre-outreach and excluded by default (same rule the old MarkdownExporter
        // enforced) — v3.1 makes inclusion an option via includeActive.
        foreach (var entry in entries
            .Where(e => e.Status >= PipelineStatus.Applied || (includeActive && e.Status == PipelineStatus.Active))
            .OrderBy(e => e.Updated))
        {
            var company = await companies.GetAsync(entry.Orgnr, ct);
            rows.Add(new ExtractTrackerRow(entry.Updated, company?.Name ?? entry.Orgnr, company?.Website,
                entry.Why, entry.SvarText));
        }

        return rows;
    }

    // Resolution order matches CompanyDto.From in the API: configured municipality name first,
    // then the full Brreg kommune register, then the raw number as a last resort. Website
    // resolution matches too — a confirmed-dead site (WebsiteOk == false) never appears.
    private ExtractCompanyRow ToCompanyRow(Company c, IReadOnlyDictionary<string, string> kommuner)
    {
        var kommuneNavn = config.Municipalities.FirstOrDefault(m => m.Number == c.MunicipalityNumber)?.Name
            ?? (c.MunicipalityNumber is { } number ? kommuner.GetValueOrDefault(number, number) : null);
        var website = c.WebsiteOk == false ? null : c.WebsiteResolved ?? c.Website;

        return new ExtractCompanyRow(c.Orgnr, c.Name, c.MunicipalityNumber, kommuneNavn, website, c.IsBranch);
    }

    private static ExtractAdRow ToAdRow(Ad a) =>
        new(a.FeedId, a.Title, a.EmployerName, a.EmployerOrgnr, a.MunicipalityNumber, a.Expires, a.Category, a.SourceUrl);

    public static string ScopeSlug(ExtractScope scope) => scope switch
    {
        ExtractScope.New => "new",
        ExtractScope.Category => "category",
        ExtractScope.All => "all",
        _ => scope.ToString().ToLowerInvariant(),
    };

    private static string Extension(ExtractFormat format) => format switch
    {
        ExtractFormat.Md => "md",
        ExtractFormat.Txt => "txt",
        ExtractFormat.Json => "json",
        _ => "txt",
    };

    public static string ContentType(ExtractFormat format) => format switch
    {
        ExtractFormat.Md => "text/markdown",
        ExtractFormat.Txt => "text/plain",
        ExtractFormat.Json => "application/json",
        _ => "text/plain",
    };
}
