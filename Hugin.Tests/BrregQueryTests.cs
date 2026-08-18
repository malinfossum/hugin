using Hugin.Core.Services;

namespace Hugin.Tests;

public class BrregQueryTests
{
    [Test]
    public void Builds_enheter_query()
        => Assert.That(
            BrregQuery.Build("enheter", ["62"], ["3407", "3403"], 0),
            Is.EqualTo("enheter?naeringskode=62&kommunenummer=3407,3403&size=200&page=0"));

    [Test]
    public void Builds_underenheter_query_page_2()
        => Assert.That(
            BrregQuery.Build("underenheter", ["62", "63"], ["3405"], 2),
            Is.EqualTo("underenheter?naeringskode=62,63&kommunenummer=3405&size=200&page=2"));
}
