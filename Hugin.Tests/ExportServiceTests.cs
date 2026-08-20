using Hugin.Core.Models;
using Hugin.Core.Services;

namespace Hugin.Tests;

public class ExportServiceTests
{
    private static readonly DateTimeOffset Now = new(2026, 8, 19, 8, 0, 0, TimeSpan.Zero);

    private static Company Company(string orgnr, string name) =>
        new() { Orgnr = orgnr, Name = name, FirstSeen = Now, LastSeenInRegister = Now };

    private static PipelineEntry Entry(string orgnr, DateTimeOffset updated) => new()
    {
        Orgnr = orgnr,
        Status = PipelineStatus.Applied,
        Why = "fordi",
        Created = updated,
        Updated = updated,
    };

    [Test]
    public async Task Assembles_rows_from_pipeline_and_company_repositories()
    {
        var pipeline = new FakePipelineRepository();
        pipeline.Store.Add(Entry("1", Now));

        var companies = new FakeCompanyRepository();
        companies.Store["1"] = Company("1", "Ferskvare AS");

        var service = new ExportService(pipeline, companies, new FakeClock(Now));

        var markdown = await service.ExportAsync();

        Assert.That(markdown, Does.Contain("## Søkt"));
        Assert.That(markdown, Does.Contain("Ferskvare AS"));
    }

    [Test]
    public async Task Default_window_excludes_entries_older_than_seven_days()
    {
        var pipeline = new FakePipelineRepository();
        pipeline.Store.Add(Entry("1", Now.AddDays(-10)));

        var companies = new FakeCompanyRepository();
        companies.Store["1"] = Company("1", "Gammel AS");

        var service = new ExportService(pipeline, companies, new FakeClock(Now));

        var markdown = await service.ExportAsync();

        Assert.That(markdown, Does.Not.Contain("Gammel AS"));
    }
}
