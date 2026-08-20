using System.Globalization;
using System.Text;
using System.Text.Json;

namespace Hugin.Core.Services;

/// <summary>
/// Renders an <see cref="ExtractDocument"/> to markdown, plain text, or JSON. Pure string/JSON
/// building — no console, no files. Section shapes mirror the CLI's `hugin new` headers and the
/// old MarkdownExporter's Preparelogg-compatible "## Søkt" table, so both stay familiar.
/// </summary>
internal static class ExtractRenderer
{
    public const string MissingWhyMarker = "⚠ mangler begrunnelse";

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerOptions.Web)
    {
        WriteIndented = true,
    };

    public static string RenderJson(ExtractDocument document) => JsonSerializer.Serialize(document, JsonOptions);

    public static string RenderMarkdown(ExtractDocument document)
    {
        var sb = new StringBuilder();

        switch (document.Scope)
        {
            case "new":
                CompanySection(sb, "## Nye selskaper", document.Companies, md: true);
                sb.AppendLine();
                AdSection(sb, "## Nye annonser", document.Ads, md: true);
                break;

            case "category":
                AdSection(sb, $"## Aktiv — {Plain(document.Category)}", document.Ads, md: true);
                break;

            case "all":
                CompanySection(sb, "## Bedrifter", document.Companies, md: true);
                sb.AppendLine();
                AdSection(sb, "## Aktiv", document.Ads, md: true);
                sb.AppendLine();
                TrackerSection(sb, document.Tracker, md: true);
                break;
        }

        return sb.ToString();
    }

    public static string RenderText(ExtractDocument document)
    {
        var sb = new StringBuilder();

        switch (document.Scope)
        {
            case "new":
                CompanySection(sb, "Nye selskaper", document.Companies, md: false);
                sb.AppendLine();
                AdSection(sb, "Nye annonser", document.Ads, md: false);
                break;

            case "category":
                AdSection(sb, $"Aktiv — {Plain(document.Category)}", document.Ads, md: false);
                break;

            case "all":
                CompanySection(sb, "Bedrifter", document.Companies, md: false);
                sb.AppendLine();
                AdSection(sb, "Aktiv", document.Ads, md: false);
                sb.AppendLine();
                TrackerSection(sb, document.Tracker, md: false);
                break;
        }

        return sb.ToString();
    }

    private static void CompanySection(StringBuilder sb, string title, IReadOnlyList<ExtractCompanyRow> rows, bool md)
    {
        Heading(sb, title, rows.Count);

        if (rows.Count == 0)
        {
            sb.AppendLine("(ingen)");
            return;
        }

        if (md)
        {
            sb.AppendLine("| Orgnr | Navn | Kommune | Nettside |");
            sb.AppendLine("|---|---|---|---|");
        }

        foreach (var c in rows)
        {
            var kommune = KommuneCell(c.Kommune, c.KommuneNavn);
            var name = c.Name + (c.IsBranch ? " [avdeling]" : "");

            sb.AppendLine(md
                ? $"| {c.Orgnr} | {Cell(name)} | {Cell(kommune)} | {Cell(c.Website)} |"
                : $"{c.Orgnr}  {Plain(name)}  {Plain(kommune)}  {Plain(c.Website)}");
        }
    }

    private static void AdSection(StringBuilder sb, string title, IReadOnlyList<ExtractAdRow> rows, bool md)
    {
        Heading(sb, title, rows.Count);

        if (rows.Count == 0)
        {
            sb.AppendLine("(ingen)");
            return;
        }

        if (md)
        {
            sb.AppendLine("| Tittel | Arbeidsgiver | Kommune | Frist | Kilde |");
            sb.AppendLine("|---|---|---|---|---|");
        }

        foreach (var a in rows)
        {
            var frist = a.Expires?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) ?? "";

            sb.AppendLine(md
                ? $"| {Cell(a.Title)} | {Cell(a.Employer)} | {Cell(a.Kommune)} | {frist} | {Cell(a.SourceUrl)} |"
                : $"{Plain(a.Title)}  {Plain(a.Employer)}  {Plain(a.Kommune)}  {frist}  {Plain(a.SourceUrl)}");
        }
    }

    private static void TrackerSection(StringBuilder sb, IReadOnlyList<ExtractTrackerRow> rows, bool md)
    {
        sb.AppendLine(md ? "## Søkt" : "Søkt");
        sb.AppendLine();

        if (rows.Count == 0)
        {
            sb.AppendLine("(ingen)");
            return;
        }

        if (md)
        {
            sb.AppendLine("| Dato | Bedrift | Nettside | Grunn | Svar |");
            sb.AppendLine("|---|---|---|---|---|");
        }

        foreach (var r in rows)
        {
            var dato = r.Updated.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            var grunn = string.IsNullOrWhiteSpace(r.Why) ? MissingWhyMarker : r.Why;

            sb.AppendLine(md
                ? $"| {dato} | {Cell(r.CompanyName)} | {Cell(r.Website)} | {Cell(grunn)} | {Cell(r.Svar)} |"
                : $"{dato}  {Plain(r.CompanyName)}  {Plain(r.Website)}  {Plain(grunn)}  {Plain(r.Svar)}");
        }
    }

    private static void Heading(StringBuilder sb, string title, int count)
    {
        sb.AppendLine($"{title} ({count})");
        sb.AppendLine();
    }

    private static string KommuneCell(string? number, string? name) =>
        name is not null ? $"{name} ({number})" : number ?? "";

    /// <summary>A company name, ad title, or free-text field is third-party/user text: an
    /// unescaped pipe would silently split a markdown row into extra columns, and a newline
    /// would end the table early.</summary>
    private static string Cell(string? value)
    {
        if (string.IsNullOrEmpty(value)) return "";

        return value
            .Replace("\r\n", " ", StringComparison.Ordinal)
            .Replace("\r", " ", StringComparison.Ordinal)
            .Replace("\n", " ", StringComparison.Ordinal)
            .Replace("|", "\\|", StringComparison.Ordinal)
            .Trim();
    }

    /// <summary>Same collapsing as <see cref="Cell"/> but no pipe escaping — .txt has no table
    /// syntax to protect.</summary>
    private static string Plain(string? value)
    {
        if (string.IsNullOrEmpty(value)) return "";

        return value
            .Replace("\r\n", " ", StringComparison.Ordinal)
            .Replace("\r", " ", StringComparison.Ordinal)
            .Replace("\n", " ", StringComparison.Ordinal)
            .Trim();
    }
}
