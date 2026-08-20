using Hugin.Core.Services;

namespace Hugin.Tests;

public class KommuneNameNormalizerTests
{
    [TestCase("VÅGÅ", "Vågå")]
    [TestCase("NORD-AURDAL", "Nord-Aurdal")]
    [TestCase("NORDRE LAND", "Nordre Land")]
    [TestCase("OSLO", "Oslo")]
    [TestCase("SØR-ODAL", "Sør-Odal")]
    public void Normalizes_uppercase_register_names(string raw, string expected)
    {
        Assert.That(KommuneNameNormalizer.Normalize(raw), Is.EqualTo(expected));
    }

    [Test]
    public void Null_and_empty_pass_through_safely()
    {
        Assert.That(KommuneNameNormalizer.Normalize(null), Is.EqualTo(""));
        Assert.That(KommuneNameNormalizer.Normalize(""), Is.EqualTo(""));
    }
}
