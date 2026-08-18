using Hugin.Core.Cli;
using Hugin.Core.Models;

namespace Hugin.Tests;

public class CommandParserTests
{
    [Test]
    public void No_args_is_help() => Assert.That(CommandParser.Parse([]), Is.TypeOf<HelpCommand>());

    [Test]
    public void Sync() => Assert.That(CommandParser.Parse(["sync"]), Is.EqualTo(new SyncCommand(false)));

    [Test]
    public void Sync_full() => Assert.That(CommandParser.Parse(["sync", "--full"]), Is.EqualTo(new SyncCommand(true)));

    [Test]
    public void List_ads_with_kommune()
        => Assert.That(CommandParser.Parse(["list", "--ads", "--kommune", "3403"]),
            Is.EqualTo(new ListCommand(null, false, "3403", true)));

    [Test]
    public void New_with_seen() => Assert.That(CommandParser.Parse(["new", "--seen"]), Is.EqualTo(new NewCommand(true)));

    [Test]
    public void Track_full()
        => Assert.That(CommandParser.Parse(["track", "915787630", "soekt-selv", "--why", "fordi", "--note", "n", "--svar", "s"]),
            Is.EqualTo(new TrackCommand("915787630", PipelineStatus.SoektSelv, "fordi", "n", "s")));

    [Test]
    public void Track_status_aliases()
    {
        Assert.That(((TrackCommand)CommandParser.Parse(["track", "1", "funnet"])).Status, Is.EqualTo(PipelineStatus.Funnet));
        Assert.That(((TrackCommand)CommandParser.Parse(["track", "1", "bedt-get"])).Status, Is.EqualTo(PipelineStatus.BedtGetSjekke));
        Assert.That(((TrackCommand)CommandParser.Parse(["track", "1", "svar"])).Status, Is.EqualTo(PipelineStatus.Svar));
    }

    [Test]
    public void Track_bad_status_is_invalid()
        => Assert.That(CommandParser.Parse(["track", "1", "banana"]), Is.TypeOf<InvalidCommand>());

    [Test]
    public void List_companies_with_kommune()
        => Assert.That(CommandParser.Parse(["list", "--companies", "--kommune", "3405"]),
            Is.EqualTo(new ListCommand(null, true, "3405", false)));

    [Test]
    public void Export_with_since()
        => Assert.That(CommandParser.Parse(["export", "--since", "2026-08-11"]),
            Is.EqualTo(new ExportCommand(new DateTimeOffset(2026, 8, 11, 0, 0, 0, TimeSpan.Zero))));

    [Test]
    public void Unknown_verb_is_invalid()
        => Assert.That(CommandParser.Parse(["dance"]), Is.TypeOf<InvalidCommand>());
}
