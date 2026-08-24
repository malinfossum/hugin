using System.Text.Json;
using Hugin.Core.Config;
using Hugin.Core.Models;
using Hugin.Core.Services;

namespace Hugin.Tests;

public class ExtractServiceTests
{
    private static readonly DateTimeOffset Now = new(2026, 8, 20, 8, 0, 0, TimeSpan.Zero);

    private static Company Company(string orgnr, string name, string? kommune = null,
        string? website = null, DateTimeOffset? firstSeen = null) => new()
    {
        Orgnr = orgnr,
        Name = name,
        MunicipalityNumber = kommune,
        Website = website,
        FirstSeen = firstSeen ?? Now,
        LastSeenInRegister = firstSeen ?? Now,
    };

    private static Ad Ad(string feedId, string title, string? category = null, bool isActive = true,
        DateTimeOffset? firstSeen = null, DateTimeOffset? expires = null, string? employerOrgnr = null) => new()
    {
        FeedId = feedId,
        Title = title,
        EmployerName = "Arbeidsgiver",
        EmployerOrgnr = employerOrgnr,
        Category = category,
        IsActive = isActive,
        FirstSeen = firstSeen ?? Now,
        Expires = expires,
    };

    private static PipelineEntry Entry(string orgnr, PipelineStatus status, string why = "fordi",
        string? svar = null, DateTimeOffset? updated = null) => new()
    {
        Orgnr = orgnr,
        Status = status,
        Why = why,
        SvarText = svar,
        Created = Now,
        Updated = updated ?? Now,
    };

    private static ExtractService BuildService(
        FakeCompanyRepository? companies = null,
        FakeAdRepository? ads = null,
        FakePipelineRepository? pipeline = null,
        FakeReviewMarkRepository? reviewMark = null,
        FakeKommuneRepository? kommuner = null,
        HuginConfig? config = null) =>
        new(companies ?? new FakeCompanyRepository(), ads ?? new FakeAdRepository(),
            pipeline ?? new FakePipelineRepository(), reviewMark ?? new FakeReviewMarkRepository(),
            kommuner ?? new FakeKommuneRepository(), config ?? new HuginConfig(), new FakeClock(Now));

    // --- New scope --------------------------------------------------------

    [Test]
    public async Task New_scope_is_empty_but_valid_when_no_review_mark_exists()
    {
        var service = BuildService();

        var result = await service.ExtractAsync(ExtractScope.New, ExtractFormat.Md);

        Assert.That(result.Content, Does.Contain("## Nye selskaper (0)"));
        Assert.That(result.Content, Does.Contain("## Nye annonser (0)"));
        Assert.That(result.Content, Does.Contain("(ingen)"));
    }

    [Test]
    public async Task New_scope_includes_companies_and_ads_first_seen_after_the_mark()
    {
        var mark = Now.AddDays(-1);
        var companies = new FakeCompanyRepository();
        companies.Store["1"] = Company("1", "Ny AS", firstSeen: mark.AddHours(1));
        companies.Store["2"] = Company("2", "Gammel AS", firstSeen: mark.AddHours(-1));

        var ads = new FakeAdRepository();
        ads.Store["a1"] = Ad("a1", "Ny annonse", firstSeen: mark.AddHours(1));
        ads.Store["a2"] = Ad("a2", "Gammel annonse", firstSeen: mark.AddHours(-1));

        var reviewMark = new FakeReviewMarkRepository { Mark = mark };
        var service = BuildService(companies: companies, ads: ads, reviewMark: reviewMark);

        var result = await service.ExtractAsync(ExtractScope.New, ExtractFormat.Md);

        Assert.That(result.Content, Does.Contain("Ny AS"));
        Assert.That(result.Content, Does.Not.Contain("Gammel AS"));
        Assert.That(result.Content, Does.Contain("Ny annonse"));
        Assert.That(result.Content, Does.Not.Contain("Gammel annonse"));
    }

    // --- Category scope -----------------------------------------------------

    [Test]
    public async Task Category_scope_matches_case_insensitively_and_excludes_inactive_ads()
    {
        var ads = new FakeAdRepository();
        ads.Store["a1"] = Ad("a1", "Treff", category: "IT / Utvikling");
        ads.Store["a2"] = Ad("a2", "Feil kategori", category: "Bygg");
        ads.Store["a3"] = Ad("a3", "Utgått treff", category: "IT / Utvikling", isActive: false);

        var service = BuildService(ads: ads);

        var result = await service.ExtractAsync(ExtractScope.Category, ExtractFormat.Md, category: "it");

        Assert.That(result.Content, Does.Contain("Treff"));
        Assert.That(result.Content, Does.Not.Contain("Feil kategori"));
        Assert.That(result.Content, Does.Not.Contain("Utgått treff"));
    }

    [Test]
    public void Category_scope_without_category_throws()
    {
        var service = BuildService();

        Assert.ThrowsAsync<MissingCategoryException>(async () =>
            await service.ExtractAsync(ExtractScope.Category, ExtractFormat.Md));
    }

    [Test]
    public void Category_scope_with_blank_category_throws()
    {
        var service = BuildService();

        Assert.ThrowsAsync<MissingCategoryException>(async () =>
            await service.ExtractAsync(ExtractScope.Category, ExtractFormat.Md, category: "   "));
    }

    [Test]
    public async Task Category_scope_flattens_newlines_in_the_category_heading()
    {
        var ads = new FakeAdRepository();
        ads.Store["a1"] = Ad("a1", "Treff", category: "x\ny");

        var service = BuildService(ads: ads);

        var md = await service.ExtractAsync(ExtractScope.Category, ExtractFormat.Md, category: "x\ny");
        var txt = await service.ExtractAsync(ExtractScope.Category, ExtractFormat.Txt, category: "x\ny");

        var mdHeadingLine = md.Content.Split('\n')[0].TrimEnd('\r');
        Assert.That(mdHeadingLine, Is.EqualTo("## Aktiv — x y (1)"));

        var txtHeadingLine = txt.Content.Split('\n')[0].TrimEnd('\r');
        Assert.That(txtHeadingLine, Is.EqualTo("Aktiv — x y (1)"));
        Assert.That(txtHeadingLine, Does.Not.Contain("\r"));
    }

    // --- All scope ------------------------------------------------------

    [Test]
    public async Task All_scope_includes_companies_active_ads_and_the_soekt_tracker()
    {
        var companies = new FakeCompanyRepository();
        companies.Store["1"] = Company("1", "Alt AS", kommune: "3407", website: "https://alt.no");

        var ads = new FakeAdRepository();
        ads.Store["a1"] = Ad("a1", "Aktiv annonse");
        ads.Store["a2"] = Ad("a2", "Utgått annonse", isActive: false);

        var pipeline = new FakePipelineRepository();
        pipeline.Store.Add(Entry("1", PipelineStatus.Applied));

        var kommuner = new FakeKommuneRepository();
        kommuner.Store["3407"] = "Gjøvik";

        var service = BuildService(companies: companies, ads: ads, pipeline: pipeline, kommuner: kommuner);

        var result = await service.ExtractAsync(ExtractScope.All, ExtractFormat.Md);

        Assert.That(result.Content, Does.Contain("## Bedrifter"));
        Assert.That(result.Content, Does.Contain("Alt AS"));
        Assert.That(result.Content, Does.Contain("Gjøvik (3407)"));
        Assert.That(result.Content, Does.Contain("https://alt.no"));
        Assert.That(result.Content, Does.Contain("## Aktiv"));
        Assert.That(result.Content, Does.Contain("Aktiv annonse"));
        Assert.That(result.Content, Does.Not.Contain("Utgått annonse"));
        Assert.That(result.Content, Does.Contain("## Søkt"));
        Assert.That(result.Content, Does.Contain("| Dato | Bedrift | Nettside | Grunn | Svar |"));
    }

    [Test]
    public async Task All_scope_excludes_active_entries_from_the_soekt_tracker()
    {
        var companies = new FakeCompanyRepository();
        companies.Store["1"] = Company("1", "Bare aktiv AS");

        var pipeline = new FakePipelineRepository();
        pipeline.Store.Add(Entry("1", PipelineStatus.Active));

        var service = BuildService(companies: companies, pipeline: pipeline);

        var result = await service.ExtractAsync(ExtractScope.All, ExtractFormat.Md);

        var soektSection = result.Content[result.Content.IndexOf("## Søkt", StringComparison.Ordinal)..];
        Assert.That(soektSection, Does.Not.Contain("Bare aktiv AS"));
    }

    [Test]
    public async Task All_scope_includes_active_entries_when_includeActive_is_true()
    {
        var companies = new FakeCompanyRepository();
        companies.Store["1"] = Company("1", "Aktiv AS");
        companies.Store["2"] = Company("2", "Sokt AS");

        var pipeline = new FakePipelineRepository();
        pipeline.Store.Add(Entry("1", PipelineStatus.Active));
        pipeline.Store.Add(Entry("2", PipelineStatus.Applied));

        var service = BuildService(companies: companies, pipeline: pipeline);

        var result = await service.ExtractAsync(ExtractScope.All, ExtractFormat.Json, includeActive: true);

        using var doc = JsonDocument.Parse(result.Content);
        var tracker = doc.RootElement.GetProperty("tracker");
        var names = tracker.EnumerateArray().Select(r => r.GetProperty("companyName").GetString()).ToList();
        Assert.That(names, Does.Contain("Aktiv AS"));
        Assert.That(names, Does.Contain("Sokt AS"));
    }

    [Test]
    public async Task Empty_why_gets_the_warning_marker_in_the_tracker()
    {
        var companies = new FakeCompanyRepository();
        companies.Store["1"] = Company("1", "Uten grunn AS");

        var pipeline = new FakePipelineRepository();
        pipeline.Store.Add(Entry("1", PipelineStatus.Applied, why: ""));

        var service = BuildService(companies: companies, pipeline: pipeline);

        var result = await service.ExtractAsync(ExtractScope.All, ExtractFormat.Md);

        Assert.That(result.Content, Does.Contain("⚠ mangler begrunnelse"));
    }

    // --- Escaping ---------------------------------------------------------

    [Test]
    public async Task Md_escapes_pipes_and_newlines_so_the_table_cannot_break()
    {
        var companies = new FakeCompanyRepository();
        companies.Store["1"] = Company("1", "Rør | AS\nmed linjeskift");

        var service = BuildService(companies: companies);

        var result = await service.ExtractAsync(ExtractScope.All, ExtractFormat.Md);

        var row = result.Content.Split('\n').Single(l => l.Contains("Rør", StringComparison.Ordinal));
        Assert.That(row, Does.Contain("Rør \\| AS med linjeskift"));
        Assert.That(row, Does.Not.Contain("\nmed"));
    }

    [Test]
    public async Task Txt_has_no_table_pipes()
    {
        var companies = new FakeCompanyRepository();
        companies.Store["1"] = Company("1", "Tekst AS", kommune: "3407", website: "https://tekst.no");

        var service = BuildService(companies: companies);

        var result = await service.ExtractAsync(ExtractScope.All, ExtractFormat.Txt);

        Assert.That(result.Content, Does.Contain("Tekst AS"));
        Assert.That(result.Content, Does.Not.Contain("|"));
    }

    // --- JSON ---------------------------------------------------------------

    [Test]
    public async Task Json_is_parseable_with_the_expected_keys()
    {
        var companies = new FakeCompanyRepository();
        companies.Store["1"] = Company("1", "Json AS");

        var service = BuildService(companies: companies);

        var result = await service.ExtractAsync(ExtractScope.All, ExtractFormat.Json);

        using var doc = JsonDocument.Parse(result.Content);
        var root = doc.RootElement;
        Assert.That(root.TryGetProperty("generatedUtc", out _), Is.True);
        Assert.That(root.TryGetProperty("scope", out var scope), Is.True);
        Assert.That(scope.GetString(), Is.EqualTo("all"));
        Assert.That(root.TryGetProperty("companies", out var companiesEl), Is.True);
        Assert.That(companiesEl.ValueKind, Is.EqualTo(JsonValueKind.Array));
        Assert.That(root.TryGetProperty("ads", out _), Is.True);
        Assert.That(root.TryGetProperty("tracker", out _), Is.True);
        Assert.That(companiesEl[0].GetProperty("name").GetString(), Is.EqualTo("Json AS"));
    }

    [Test]
    public async Task Json_new_scope_is_empty_but_valid_when_no_review_mark_exists()
    {
        var service = BuildService();

        var result = await service.ExtractAsync(ExtractScope.New, ExtractFormat.Json);

        using var doc = JsonDocument.Parse(result.Content); // must not throw
        Assert.That(doc.RootElement.GetProperty("companies").GetArrayLength(), Is.EqualTo(0));
    }

    // --- Filename / content type -------------------------------------------

    [Test]
    public async Task Filename_and_content_type_match_scope_format_and_date()
    {
        var service = BuildService();

        var md = await service.ExtractAsync(ExtractScope.All, ExtractFormat.Md);
        Assert.That(md.FileName, Is.EqualTo("hugin-all-20260820.md"));
        Assert.That(md.ContentType, Is.EqualTo("text/markdown"));

        var txt = await service.ExtractAsync(ExtractScope.New, ExtractFormat.Txt);
        Assert.That(txt.FileName, Is.EqualTo("hugin-new-20260820.txt"));
        Assert.That(txt.ContentType, Is.EqualTo("text/plain"));

        var json = await service.ExtractAsync(ExtractScope.Category, ExtractFormat.Json, category: "IT");
        Assert.That(json.FileName, Is.EqualTo("hugin-category-20260820.json"));
        Assert.That(json.ContentType, Is.EqualTo("application/json"));
    }
}
