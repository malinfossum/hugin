using Hugin.Api;
using Hugin.Api.Services;
using Hugin.Core.Abstractions;
using Hugin.Core.Models;
using Hugin.Infrastructure.Data;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;

namespace Hugin.Tests.Api;

[TestFixture]
public sealed class DemoSeederTests
{
    private DirectoryInfo _root = null!;
    private PublicModeOptions _mode = null!;
    private HuginDbContext _db = null!;

    [SetUp]
    public async Task Up()
    {
        _root = Directory.CreateTempSubdirectory("hugin-seed-");
        _mode = new PublicModeOptions(true, _root.FullName, Path.Combine(_root.FullName, "hugin.db"));
        var options = new DbContextOptionsBuilder<HuginDbContext>()
            .UseSqlite(HuginDbInitializer.ConnectionString(_mode.WorkingDbPath)).Options;
        _db = new HuginDbContext(options);
        await HuginDbInitializer.InitAsync(_db);
        _db.Companies.Add(new Company { Orgnr = "444444444", Name = "BERGLI DESIGN AS", FirstSeen = DateTimeOffset.UtcNow, LastSeenInRegister = DateTimeOffset.UtcNow });
        await _db.SaveChangesAsync();
    }

    [TearDown]
    public async Task Down()
    {
        await _db.DisposeAsync();
        SqliteConnection.ClearAllPools();
        try { _root.Delete(recursive: true); } catch (IOException) { }
    }

    private DemoSeeder Seeder(PublicModeOptions? mode = null) => new(mode ?? _mode,
        new EfPipelineRepository(_db), new EfCompanyRepository(_db), new SystemClock(), NullLogger<DemoSeeder>.Instance);

    private void WriteSeed(string json) => File.WriteAllText(_mode.SeedPath, json);

    [Test]
    public void Parse_accepts_valid_entries_and_names_each_invalid_one()
    {
        var entries = DemoSeeder.Parse("""
            [
              { "orgnr": "444444444", "status": "active", "why": "Demo." },
              { "orgnr": "12345", "status": "active", "why": "kort orgnr" },
              { "orgnr": "555555555", "status": "hired", "why": "ukjent status" },
              { "orgnr": "666666666", "status": "active", "why": "" }
            ]
            """, out var problems);
        Assert.That(entries.Select(e => e.Orgnr), Is.EqualTo(new[] { "444444444" }));
        Assert.That(problems, Has.Count.EqualTo(3));
        Assert.That(problems[0], Does.Contain("12345"));
    }

    [Test]
    public void Parse_of_broken_json_yields_nothing_and_one_problem()
    {
        var entries = DemoSeeder.Parse("{ not an array", out var problems);
        Assert.That(entries, Is.Empty);
        Assert.That(problems, Has.Count.EqualTo(1));
    }

    [Test]
    public void Parse_reads_svar_company_and_ad_blocks()
    {
        var entries = DemoSeeder.Parse("""
            [{ "orgnr": "100000003", "status": "answered", "why": "Demo.",
               "svar": "Takk for søknaden.",
               "company": { "name": "Lysbekk Data AS", "kommune": "3407", "nace": "62.100" },
               "ad": { "title": "Juniorutvikler", "publishedDaysAgo": 30, "expiresInDays": -5 } }]
            """, out var problems);
        Assert.That(problems, Is.Empty);
        var e = entries.Single();
        Assert.That(e.Svar, Is.EqualTo("Takk for søknaden."));
        Assert.That(e.Company, Is.EqualTo(new DemoSeedCompany("Lysbekk Data AS", "3407", "62.100")));
        Assert.That(e.Ad, Is.EqualTo(new DemoSeedAd("Juniorutvikler", 30, -5)));
    }

    [Test]
    public void Parse_reads_a_utf8_name_from_disk()
    {
        WriteSeed("""
            [{ "orgnr": "100000001", "status": "active", "why": "Demo.",
               "company": { "name": "Mjøskode AS", "kommune": "3403", "nace": "62.100" } }]
            """);
        var entries = DemoSeeder.Parse(File.ReadAllText(_mode.SeedPath), out _);
        Assert.That(entries.Single().Company!.Name, Is.EqualTo("Mjøskode AS"));
    }

    [Test]
    public void Parse_rejects_a_company_block_on_a_real_orgnr()
    {
        var entries = DemoSeeder.Parse("""
            [{ "orgnr": "912345678", "status": "active", "why": "Demo.",
               "company": { "name": "Ekte AS", "kommune": "3403", "nace": "62.100" } },
             { "orgnr": "812345678", "status": "active", "why": "Demo.",
               "company": { "name": "Ekte AS", "kommune": "3403", "nace": "62.100" } },
             { "orgnr": "912345679", "status": "active", "why": "Demo." }]
            """, out var problems);
        Assert.That(entries.Select(e => e.Orgnr), Is.EqualTo(new[] { "912345679" }),
            "a real orgnr is fine on its own, just never with a company block");
        Assert.That(problems, Has.Count.EqualTo(2));
        Assert.That(problems[0], Does.Contain("912345678"));
    }

    [TestCase("""{ "name": "", "kommune": "3403", "nace": "62.100" }""", null, "name")]
    [TestCase("""{ "name": "X AS", "kommune": "343", "nace": "62.100" }""", null, "kommune")]
    [TestCase("""{ "name": "X AS", "kommune": "3403", "nace": "62" }""", null, "nace")]
    [TestCase(null, """{ "title": "Utvikler", "publishedDaysAgo": 1, "expiresInDays": 1 }""", "company")]
    [TestCase("""{ "name": "X AS", "kommune": "3403", "nace": "62.100" }""",
        """{ "title": " ", "publishedDaysAgo": 1, "expiresInDays": 1 }""", "title")]
    [TestCase("""{ "name": "X AS", "kommune": "3403", "nace": "62.100" }""",
        """{ "title": "Utvikler", "publishedDaysAgo": -1, "expiresInDays": 1 }""", "publishedDaysAgo")]
    [TestCase("""{ "name": "X AS", "kommune": "3403", "nace": "62.100" }""",
        """{ "title": "Utvikler", "publishedDaysAgo": "10", "expiresInDays": 1 }""", "publishedDaysAgo")]
    [TestCase("""{ "name": "X AS", "kommune": "3403", "nace": "62.100" }""",
        """{ "title": "Utvikler", "publishedDaysAgo": 1, "expiresInDays": 2.5 }""", "expiresInDays")]
    [TestCase("""{ "name": "X AS", "kommune": "3403", "nace": "62.100" }""",
        """{ "title": "Utvikler", "publishedDaysAgo": 1 }""", "expiresInDays")]
    public void Parse_skips_one_bad_block_and_keeps_the_rest(string? company, string? ad, string named)
    {
        var bad = "{ \"orgnr\": \"100000001\", \"status\": \"active\", \"why\": \"Demo.\""
            + (company is null ? "" : $", \"company\": {company}")
            + (ad is null ? "" : $", \"ad\": {ad}") + " }";
        var entries = DemoSeeder.Parse(
            $$"""[{{bad}}, { "orgnr": "100000002", "status": "applied", "why": "Demo." }]""", out var problems);
        Assert.That(entries.Select(e => e.Orgnr), Is.EqualTo(new[] { "100000002" }));
        Assert.That(problems, Has.Count.EqualTo(1));
        Assert.That(problems[0], Does.Contain("100000001").And.Contain(named));
    }

    [Test]
    public async Task Apply_inserts_an_absent_entry_for_a_known_company()
    {
        WriteSeed("""[{ "orgnr": "444444444", "status": "active", "why": "Demo: sporet for å vise badges." }]""");
        Assert.That(await Seeder().ApplyAsync(), Is.EqualTo(1));
        var entry = await _db.Pipeline.SingleAsync();
        Assert.That(entry.Status, Is.EqualTo(PipelineStatus.Active));
        Assert.That(entry.Why, Is.EqualTo("Demo: sporet for å vise badges."));
        Assert.That(entry.Starred, Is.False);
    }

    [Test]
    public async Task Apply_never_updates_an_existing_entry()
    {
        _db.Pipeline.Add(new PipelineEntry { Orgnr = "444444444", Status = PipelineStatus.Applied, Why = "handwritten", Created = DateTimeOffset.UtcNow, Updated = DateTimeOffset.UtcNow });
        await _db.SaveChangesAsync();
        WriteSeed("""[{ "orgnr": "444444444", "status": "active", "why": "Demo." }]""");
        Assert.That(await Seeder().ApplyAsync(), Is.EqualTo(0));
        var entry = await _db.Pipeline.SingleAsync();
        Assert.That(entry.Why, Is.EqualTo("handwritten"));
        Assert.That(entry.Status, Is.EqualTo(PipelineStatus.Applied));
    }

    [Test]
    public async Task Apply_skips_an_unknown_company_so_the_next_sync_can_retry()
    {
        WriteSeed("""[{ "orgnr": "555555555", "status": "active", "why": "Demo." }]""");
        Assert.That(await Seeder().ApplyAsync(), Is.EqualTo(0));
        Assert.That(await _db.Pipeline.AnyAsync(), Is.False);

        _db.Companies.Add(new Company { Orgnr = "555555555", Name = "ASKELI CLOUD AS", FirstSeen = DateTimeOffset.UtcNow, LastSeenInRegister = DateTimeOffset.UtcNow });
        await _db.SaveChangesAsync();
        Assert.That(await Seeder().ApplyAsync(), Is.EqualTo(1));
    }

    [Test]
    public async Task Apply_is_a_no_op_without_a_file_or_outside_public_mode()
    {
        Assert.That(await Seeder().ApplyAsync(), Is.EqualTo(0), "no seed file");
        WriteSeed("""[{ "orgnr": "444444444", "status": "active", "why": "Demo." }]""");
        Assert.That(await Seeder(PublicModeOptions.Off).ApplyAsync(), Is.EqualTo(0), "normal mode ignores the file");
    }

    [Test]
    public async Task Apply_logs_and_seeds_nothing_when_the_file_cannot_be_read()
    {
        WriteSeed("""[{ "orgnr": "444444444", "status": "active", "why": "Demo." }]""");
        using var locked = new FileStream(_mode.SeedPath, FileMode.Open, FileAccess.Read, FileShare.None);
        Assert.That(await Seeder().ApplyAsync(), Is.EqualTo(0));
        Assert.That(await _db.Pipeline.AnyAsync(), Is.False);
    }
}
