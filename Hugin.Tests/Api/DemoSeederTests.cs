using Hugin.Api;
using Hugin.Api.Services;
using Hugin.Core.Abstractions;
using Hugin.Core.Models;
using Hugin.Core.Services;
using Hugin.Infrastructure.Data;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
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

    private DemoSeeder Seeder(PublicModeOptions? mode = null, IClock? clock = null, IAdRepository? ads = null,
        ILogger<DemoSeeder>? logger = null) => new(mode ?? _mode,
        new EfPipelineRepository(_db), new EfCompanyRepository(_db), ads ?? new EfAdRepository(_db),
        clock ?? new SystemClock(), logger ?? NullLogger<DemoSeeder>.Instance);

    private const string ThreeFirms = """
        [
          { "orgnr": "100000001", "status": "active", "why": "Demo: fiktivt firma, sporet for å vise pipelinen.",
            "company": { "name": "Mjøskode AS", "kommune": "3403", "nace": "62.100" },
            "ad": { "title": "Fullstackutvikler (.NET/React)", "publishedDaysAgo": 10, "expiresInDays": 3 } },
          { "orgnr": "100000002", "status": "applied", "why": "Demo: fiktivt firma, sporet for å vise pipelinen.",
            "company": { "name": "Tindebit AS", "kommune": "3405", "nace": "62.100" },
            "ad": { "title": "Backendutvikler (C#)", "publishedDaysAgo": 2, "expiresInDays": 21 } },
          { "orgnr": "100000003", "status": "answered", "why": "Demo: fiktivt firma, sporet for å vise pipelinen.",
            "svar": "Takk for søknaden. Vi gikk videre med andre kandidater.",
            "company": { "name": "Lysbekk Data AS", "kommune": "3407", "nace": "62.100" },
            "ad": { "title": "Juniorutvikler", "publishedDaysAgo": 30, "expiresInDays": -5 } }
        ]
        """;

    private static readonly DateTimeOffset Noon = new(2026, 10, 8, 12, 0, 0, TimeSpan.Zero);

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

    // \d matches any Unicode digit and $ allows a trailing newline; an orgnr is nine ASCII digits.
    [TestCase("\\u0661\\u0662\\u0663\\u0664\\u0665\\u0666\\u0667\\u0668\\u0669")]
    [TestCase("123456789\\n")]
    public void Parse_rejects_an_orgnr_that_is_not_exactly_nine_ascii_digits(string orgnr)
    {
        var entries = DemoSeeder.Parse(
            $$"""[{ "orgnr": "{{orgnr}}", "status": "active", "why": "Demo." }]""", out var problems);
        Assert.That(entries, Is.Empty);
        Assert.That(problems, Has.Count.EqualTo(1));
    }

    [TestCase("\"company\": \"X AS\"")]
    [TestCase("\"svar\": 5")]
    [TestCase("\"why\": [\"Demo.\"]")]
    [TestCase("\"company\": { \"name\": \"X AS\", \"kommune\": \"3403\", \"nace\": \"62.100\" }, \"ad\": { \"title\": 5 }")]
    public void Parse_of_a_wrongly_shaped_value_costs_that_entry_only(string field)
    {
        var entries = DemoSeeder.Parse($$"""
            [
              { "orgnr": "100000001", "status": "active", "why": "Demo.", {{field}} },
              { "orgnr": "100000002", "status": "applied", "why": "Demo." }
            ]
            """, out var problems);
        Assert.That(entries.Select(e => e.Orgnr), Is.EqualTo(new[] { "100000002" }));
        Assert.That(problems, Has.Count.EqualTo(1));
        Assert.That(problems[0], Does.Contain("100000001"));
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
    [TestCase("""{ "name": "X AS", "kommune": "3403\n", "nace": "62.100" }""", null, "kommune")]
    [TestCase("""{ "name": "X AS", "kommune": "3403", "nace": "62.100\n" }""", null, "nace")]
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

    [Test]
    public async Task First_run_creates_company_ad_and_pipeline_row()
    {
        WriteSeed(ThreeFirms);
        Assert.That(await Seeder(clock: new FakeClock(Noon)).ApplyAsync(), Is.EqualTo(3));

        var company = await _db.Companies.SingleAsync(c => c.Orgnr == "100000001");
        Assert.That(company.Name, Is.EqualTo("Mjøskode AS"));
        Assert.That(company.MunicipalityNumber, Is.EqualTo("3403"));
        Assert.That(company.NaceCode, Is.EqualTo("62.100"));
        Assert.That(company.IsBranch, Is.False);
        Assert.That(company.ParentOrgnr, Is.Null);
        Assert.That(company.FirstSeen, Is.EqualTo(Noon.AddDays(-60)));

        var ad = await _db.Ads.SingleAsync(a => a.FeedId == "demo-100000001");
        Assert.That(ad.Published, Is.EqualTo(Noon.AddDays(-10)));
        Assert.That(ad.FirstSeen, Is.EqualTo(Noon.AddDays(-10)));
        Assert.That(ad.Expires, Is.EqualTo(new DateTimeOffset(2026, 10, 11, 23, 59, 59, TimeSpan.Zero)));
        Assert.That(ad.IsActive, Is.True);
        Assert.That(ad.EmployerName, Is.EqualTo("Mjøskode AS"));
        Assert.That(ad.EmployerOrgnr, Is.EqualTo("100000001"));
        Assert.That(ad.MunicipalityNumber, Is.EqualTo("3403"));
        Assert.That(ad.Category, Is.EqualTo("IT / Utvikling"));
        Assert.That(ad.SourceUrl, Is.Null);

        Assert.That((await _db.Ads.SingleAsync(a => a.FeedId == "demo-100000003")).IsActive, Is.False);

        var answered = await _db.Pipeline.SingleAsync(p => p.Orgnr == "100000003");
        Assert.That(answered.Status, Is.EqualTo(PipelineStatus.Answered));
        Assert.That(answered.SvarText, Is.EqualTo("Takk for søknaden. Vi gikk videre med andre kandidater."));
    }

    // 23:30 Oslo is 21:30 UTC; 01:30 Oslo the next day is still 23:30 UTC on the same UTC date.
    [TestCase(2026, 10, 8, 23, 30)]
    [TestCase(2026, 10, 9, 1, 30)]
    public async Task DaysLeft_is_exactly_expiresInDays_at_any_Oslo_hour(int y, int mo, int d, int h, int mi)
    {
        var clock = new FakeClock(new DateTimeOffset(y, mo, d, h, mi, 0, TimeSpan.FromHours(2)));
        WriteSeed(ThreeFirms);
        await Seeder(clock: clock).ApplyAsync();

        var overview = new AdOverviewService(new EfAdRepository(_db), new EfPipelineRepository(_db), clock,
            new EfCompanyRepository(_db));
        var ads = await overview.GetAsync();
        Assert.That(ads.Single(a => a.FeedId == "demo-100000001").DaysLeft, Is.EqualTo(3));
        Assert.That(ads.Single(a => a.FeedId == "demo-100000001").PipelineStatus, Is.EqualTo(PipelineStatus.Active));
        Assert.That(ads.Single(a => a.FeedId == "demo-100000002").DaysLeft, Is.EqualTo(21));
        Assert.That(ads.Any(a => a.FeedId == "demo-100000003"), Is.False, "the expired ad is not open");
    }

    [Test]
    public async Task An_ad_expiring_today_is_still_open_with_zero_days_left()
    {
        WriteSeed("""
            [{ "orgnr": "100000001", "status": "active", "why": "Demo.",
               "company": { "name": "Mjøskode AS", "kommune": "3403", "nace": "62.100" },
               "ad": { "title": "Utvikler", "publishedDaysAgo": 1, "expiresInDays": 0 } }]
            """);
        var clock = new FakeClock(new DateTimeOffset(2026, 10, 8, 23, 0, 0, TimeSpan.Zero));
        await Seeder(clock: clock).ApplyAsync();
        var overview = new AdOverviewService(new EfAdRepository(_db), new EfPipelineRepository(_db), clock,
            new EfCompanyRepository(_db));
        Assert.That((await overview.GetAsync()).Single().DaysLeft, Is.EqualTo(0));
    }

    [Test]
    public async Task Second_run_two_days_on_rolls_the_ad_and_leaves_the_rest()
    {
        WriteSeed(ThreeFirms);
        var clock = new FakeClock(Noon);
        await Seeder(clock: clock).ApplyAsync();
        var row = await _db.Pipeline.AsNoTracking().SingleAsync(p => p.Orgnr == "100000002");

        clock.UtcNow = Noon.AddDays(2);
        Assert.That(await Seeder(clock: clock).ApplyAsync(), Is.EqualTo(0), "no new pipeline rows");

        _db.ChangeTracker.Clear();
        var ad = await _db.Ads.SingleAsync(a => a.FeedId == "demo-100000002");
        Assert.That(ad.Published, Is.EqualTo(Noon), "now (Noon + 2 days) minus publishedDaysAgo 2");
        Assert.That(ad.Expires, Is.EqualTo(new DateTimeOffset(2026, 10, 31, 23, 59, 59, TimeSpan.Zero)));
        Assert.That((await _db.Companies.SingleAsync(c => c.Orgnr == "100000002")).FirstSeen,
            Is.EqualTo(Noon.AddDays(-60)), "company FirstSeen is kept");
        var after = await _db.Pipeline.SingleAsync(p => p.Orgnr == "100000002");
        Assert.That(after.Updated, Is.EqualTo(row.Updated));
        Assert.That(after.Status, Is.EqualTo(row.Status));
    }

    [Test]
    public async Task A_changed_company_block_lands_on_the_next_run()
    {
        WriteSeed(ThreeFirms);
        await Seeder(clock: new FakeClock(Noon)).ApplyAsync();
        WriteSeed(ThreeFirms.Replace("Tindebit AS", "Tindebit Data AS").Replace("\"3405\"", "\"3411\""));
        await Seeder(clock: new FakeClock(Noon)).ApplyAsync();

        _db.ChangeTracker.Clear();
        var c = await _db.Companies.SingleAsync(x => x.Orgnr == "100000002");
        Assert.That(c.Name, Is.EqualTo("Tindebit Data AS"));
        Assert.That(c.MunicipalityNumber, Is.EqualTo("3411"));
        Assert.That((await _db.Ads.SingleAsync(a => a.FeedId == "demo-100000002")).EmployerName,
            Is.EqualTo("Tindebit Data AS"));
        var row = await _db.Pipeline.SingleAsync(p => p.Orgnr == "100000002");
        Assert.That(row.Status, Is.EqualTo(PipelineStatus.Applied));
    }

    [Test]
    public async Task A_failing_entry_is_logged_and_the_others_still_seed()
    {
        WriteSeed(ThreeFirms);
        var ads = new FakeAdRepository { ThrowOnPutSeededFor = "100000001" };
        var logger = new ListLogger<DemoSeeder>();
        Assert.That(await Seeder(clock: new FakeClock(Noon), ads: ads, logger: logger).ApplyAsync(), Is.EqualTo(2));
        Assert.That(await _db.Pipeline.Select(p => p.Orgnr).OrderBy(o => o).ToListAsync(),
            Is.EqualTo(new[] { "100000002", "100000003" }));
        Assert.That(logger.Warnings, Has.One.Contains("100000001"));
    }

    [Test]
    public async Task An_absurd_day_count_costs_one_entry_not_the_boot()
    {
        WriteSeed(ThreeFirms.Replace("\"expiresInDays\": 21", "\"expiresInDays\": 2000000000"));
        var logger = new ListLogger<DemoSeeder>();
        Assert.That(await Seeder(clock: new FakeClock(Noon), logger: logger).ApplyAsync(), Is.EqualTo(2));
        Assert.That(logger.Warnings, Has.One.Contains("100000002"));
    }

    [Test]
    public async Task Hidden_survives_a_rerun()
    {
        WriteSeed(ThreeFirms);
        await Seeder(clock: new FakeClock(Noon)).ApplyAsync();
        await new EfAdRepository(_db).SetHiddenAsync("demo-100000001", true);
        await Seeder(clock: new FakeClock(Noon.AddDays(1))).ApplyAsync();

        _db.ChangeTracker.Clear();
        Assert.That((await _db.Ads.SingleAsync(a => a.FeedId == "demo-100000001")).Hidden, Is.True);
    }

    [Test]
    public void The_shipped_demo_seed_parses_cleanly_and_holds_only_fictional_firms()
    {
        var entries = DemoSeeder.Parse(HttpFixtures.ReadFixture("demo-pipeline.json"), out var problems);
        Assert.That(problems, Is.Empty);
        Assert.That(entries.Select(e => e.Orgnr), Is.EqualTo(new[] { "100000001", "100000002", "100000003" }));
        Assert.That(entries.All(e => e.Company is not null && e.Ad is not null), Is.True);
    }
}
