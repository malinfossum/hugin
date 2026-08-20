using Hugin.Core.Models;
using Hugin.Core.Services;

namespace Hugin.Tests;

public class MarkdownExporterTests
{
    private static readonly DateTimeOffset Since = new(2026, 8, 11, 0, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset Updated = new(2026, 8, 14, 9, 30, 0, TimeSpan.Zero);

    private static Company Company(string orgnr, string name, string? website = null) =>
        new() { Orgnr = orgnr, Name = name, Website = website, FirstSeen = Since, LastSeenInRegister = Since };

    private static PipelineEntry Entry(string orgnr, PipelineStatus status, string why = "fordi",
        string? svar = null, DateTimeOffset? updated = null) =>
        new()
        {
            Orgnr = orgnr,
            Status = status,
            Why = why,
            SvarText = svar,
            Created = Since,
            Updated = updated ?? Updated,
        };

    [Test]
    public void Escapes_pipes_and_newlines_in_cells()
    {
        Assert.That(MarkdownExporter.EscapeCell("Utvikler | 100% remote"), Is.EqualTo("Utvikler \\| 100% remote"));
        Assert.That(MarkdownExporter.EscapeCell("linje1\nlinje2"), Is.EqualTo("linje1 linje2"));
    }

    [Test]
    public void Applied_and_answered_entries_appear_under_the_soekt_heading()
    {
        var markdown = MarkdownExporter.Export(
        [
            (Entry("1", PipelineStatus.Applied), Company("1", "Søkt AS")),
            (Entry("2", PipelineStatus.Answered, svar: "avslag"), Company("2", "Svart AS")),
        ], Since);

        Assert.That(markdown, Does.Contain("## Søkt"));
        Assert.That(markdown, Does.Contain("Søkt AS"));
        Assert.That(markdown, Does.Contain("Svart AS"));
        Assert.That(markdown, Does.Contain("| Dato | Bedrift | Nettside | Grunn | Svar |"));
    }

    [Test]
    public void Active_entries_never_export()
    {
        var markdown = MarkdownExporter.Export(
            [(Entry("1", PipelineStatus.Active), Company("1", "Bare funnet AS"))],
            Since);

        Assert.That(markdown, Does.Not.Contain("Bare funnet AS"));
    }

    [Test]
    public void Empty_why_gets_warning_marker()
    {
        var markdown = MarkdownExporter.Export(
            [(Entry("1", PipelineStatus.Applied, why: ""), Company("1", "Uten grunn AS"))], Since);

        Assert.That(markdown, Does.Contain("⚠ mangler begrunnelse"));
    }

    [Test]
    public void Rows_updated_before_since_are_excluded()
    {
        var markdown = MarkdownExporter.Export(
        [
            (Entry("1", PipelineStatus.Applied, updated: Since.AddDays(-1)), Company("1", "Gammel AS")),
            (Entry("2", PipelineStatus.Applied, updated: Since.AddDays(1)), Company("2", "Fersk AS")),
        ], Since);

        Assert.That(markdown, Does.Not.Contain("Gammel AS"));
        Assert.That(markdown, Does.Contain("Fersk AS"));
    }

    [Test]
    public void Dates_render_as_yyyy_MM_dd()
    {
        var markdown = MarkdownExporter.Export(
            [(Entry("1", PipelineStatus.Applied), Company("1", "Dato AS"))], Since);

        Assert.That(markdown, Does.Contain("| 2026-08-14 |"));
    }

    [Test]
    public void Website_cell_is_empty_when_the_company_has_none()
    {
        var markdown = MarkdownExporter.Export(
        [
            (Entry("1", PipelineStatus.Applied), Company("1", "Med side AS", "https://eksempel.no")),
            (Entry("2", PipelineStatus.Applied), Company("2", "Uten side AS")),
        ], Since);

        Assert.That(markdown, Does.Contain("https://eksempel.no"));
        Assert.That(markdown, Does.Contain("| Uten side AS |  |"));
    }

    [Test]
    public void Cell_content_from_the_register_cannot_break_the_table()
    {
        var markdown = MarkdownExporter.Export(
            [(Entry("1", PipelineStatus.Applied, why: "Utvikler | 100% remote"), Company("1", "Rør | AS"))], Since);

        var row = markdown.Split('\n').Single(l => l.Contains("Rør", StringComparison.Ordinal));
        var delimiters = row.Where((c, i) => c == '|' && (i == 0 || row[i - 1] != '\\')).Count();

        Assert.That(delimiters, Is.EqualTo(6), "five cells means six unescaped delimiters");
        Assert.That(row, Does.Contain("Rør \\| AS"));
    }
}
