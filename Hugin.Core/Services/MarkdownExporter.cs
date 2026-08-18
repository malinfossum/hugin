using System.Globalization;
using System.Text;
using Hugin.Core.Models;

namespace Hugin.Core.Services;

/// <summary>
/// Renders the pipeline in the Preparelogg "Jobbsøk" shape, so the weekly requirement becomes
/// copy-paste. Everything here is pure string building — no console, no files.
/// </summary>
public static class MarkdownExporter
{
    public const string MissingWhyMarker = "⚠ mangler begrunnelse";

    private const string Header = "| Dato | Bedrift | Nettside | Grunn | Svar |";
    private const string Divider = "|---|---|---|---|---|";

    public static string Export(IReadOnlyList<(PipelineEntry Entry, Company Company)> rows, DateTimeOffset since)
    {
        var included = rows.Where(r => r.Entry.Updated >= since).ToList();

        var sb = new StringBuilder();
        Section(sb, "## Søkt selv", included.Where(r => r.Entry.Status == PipelineStatus.SoektSelv));
        sb.AppendLine();
        Section(sb, "## Bedt GET om å sjekke",
            included.Where(r => r.Entry.Status is PipelineStatus.BedtGetSjekke or PipelineStatus.Svar));

        return sb.ToString();
    }

    /// <summary>
    /// A company name or ad title is third-party text: an unescaped pipe would silently split
    /// the row into extra columns, and a newline would end the table early.
    /// </summary>
    public static string EscapeCell(string? value)
    {
        if (string.IsNullOrEmpty(value)) return "";

        return value
            .Replace("\r\n", " ", StringComparison.Ordinal)
            .Replace("\r", " ", StringComparison.Ordinal)
            .Replace("\n", " ", StringComparison.Ordinal)
            .Replace("|", "\\|", StringComparison.Ordinal)
            .Trim();
    }

    private static void Section(StringBuilder sb, string title,
        IEnumerable<(PipelineEntry Entry, Company Company)> rows)
    {
        sb.AppendLine(title);
        sb.AppendLine();
        sb.AppendLine(Header);
        sb.AppendLine(Divider);

        foreach (var (entry, company) in rows.OrderBy(r => r.Entry.Updated))
        {
            var why = string.IsNullOrWhiteSpace(entry.Why) ? MissingWhyMarker : EscapeCell(entry.Why);

            sb.AppendLine(string.Join(" | ",
            [
                "| " + entry.Updated.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                EscapeCell(company.Name),
                EscapeCell(company.Website),
                why,
                EscapeCell(entry.SvarText) + " |",
            ]));
        }
    }
}
