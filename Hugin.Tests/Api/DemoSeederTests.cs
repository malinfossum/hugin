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
        _db.Companies.Add(new Company { Orgnr = "922425620", Name = "TRETOEN AS", FirstSeen = DateTimeOffset.UtcNow, LastSeenInRegister = DateTimeOffset.UtcNow });
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
              { "orgnr": "922425620", "status": "active", "why": "Demo." },
              { "orgnr": "12345", "status": "active", "why": "kort orgnr" },
              { "orgnr": "983398308", "status": "hired", "why": "ukjent status" },
              { "orgnr": "935567343", "status": "active", "why": "" }
            ]
            """, out var problems);
        Assert.That(entries.Select(e => e.Orgnr), Is.EqualTo(new[] { "922425620" }));
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
    public async Task Apply_inserts_an_absent_entry_for_a_known_company()
    {
        WriteSeed("""[{ "orgnr": "922425620", "status": "active", "why": "Demo: sporet for å vise badges." }]""");
        Assert.That(await Seeder().ApplyAsync(), Is.EqualTo(1));
        var entry = await _db.Pipeline.SingleAsync();
        Assert.That(entry.Status, Is.EqualTo(PipelineStatus.Active));
        Assert.That(entry.Why, Is.EqualTo("Demo: sporet for å vise badges."));
        Assert.That(entry.Starred, Is.False);
    }

    [Test]
    public async Task Apply_never_updates_an_existing_entry()
    {
        _db.Pipeline.Add(new PipelineEntry { Orgnr = "922425620", Status = PipelineStatus.Applied, Why = "handwritten", Created = DateTimeOffset.UtcNow, Updated = DateTimeOffset.UtcNow });
        await _db.SaveChangesAsync();
        WriteSeed("""[{ "orgnr": "922425620", "status": "active", "why": "Demo." }]""");
        Assert.That(await Seeder().ApplyAsync(), Is.EqualTo(0));
        var entry = await _db.Pipeline.SingleAsync();
        Assert.That(entry.Why, Is.EqualTo("handwritten"));
        Assert.That(entry.Status, Is.EqualTo(PipelineStatus.Applied));
    }

    [Test]
    public async Task Apply_skips_an_unknown_company_so_the_next_sync_can_retry()
    {
        WriteSeed("""[{ "orgnr": "983398308", "status": "active", "why": "Demo." }]""");
        Assert.That(await Seeder().ApplyAsync(), Is.EqualTo(0));
        Assert.That(await _db.Pipeline.AnyAsync(), Is.False);

        _db.Companies.Add(new Company { Orgnr = "983398308", Name = "ARRIBATEC CLOUD AS", FirstSeen = DateTimeOffset.UtcNow, LastSeenInRegister = DateTimeOffset.UtcNow });
        await _db.SaveChangesAsync();
        Assert.That(await Seeder().ApplyAsync(), Is.EqualTo(1));
    }

    [Test]
    public async Task Apply_is_a_no_op_without_a_file_or_outside_public_mode()
    {
        Assert.That(await Seeder().ApplyAsync(), Is.EqualTo(0), "no seed file");
        WriteSeed("""[{ "orgnr": "922425620", "status": "active", "why": "Demo." }]""");
        Assert.That(await Seeder(PublicModeOptions.Off).ApplyAsync(), Is.EqualTo(0), "normal mode ignores the file");
    }
}
