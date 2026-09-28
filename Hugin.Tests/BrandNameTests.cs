using Hugin.Core.Services;

namespace Hugin.Tests;

public class BrandNameTests
{
    [TestCase("AKME PROFESSIONALS AS AVD HEDMARK", "akme")]
    [TestCase("AKME IT SOLUTIONS AS", "akme")]
    [TestCase("FJELLTOPP DATA AS", "fjelltopp")]
    [TestCase("NORSK SKOGSDRIFT AS", "skogsdrift")]
    [TestCase("ØSTLANDSK DIGITAL AS", "østlandsk")]
    [TestCase("Akme-Gruppen AS", "akme")]
    [TestCase("Akme Professionals", "akme")]
    public void Token_is_the_first_distinctive_word(string name, string expected) =>
        Assert.That(BrandName.Token(name), Is.EqualTo(expected));

    [TestCase("1-2-3 AS")]
    [TestCase("IT DATA AS")]
    [TestCase("NORSK DATA SYSTEMS GROUP AS")]
    [TestCase("")]
    public void Token_is_null_when_no_word_is_distinctive(string name) =>
        Assert.That(BrandName.Token(name), Is.Null);
}
