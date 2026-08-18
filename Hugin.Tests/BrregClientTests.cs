using Hugin.Console.Http;

namespace Hugin.Tests;

public class BrregClientTests
{
    [Test]
    public async Task Maps_enheter_and_underenheter_and_merges()
    {
        var client = new BrregClient(HttpFixtures.ClientServing(
            ("enheter?naeringskode=62", "brreg-enheter.json"),
            ("underenheter?naeringskode=62", "brreg-underenheter.json")));

        var result = await client.GetCompaniesAsync(["62"], ["3405", "3403"]);

        Assert.That(result, Is.Not.Empty);
        Assert.That(result.Any(c => c.IsBranch && c.ParentOrgnr != null), Is.True,
            "underenheter must arrive as branches with parent orgnr");
        Assert.That(result.All(c => c.Orgnr.Length == 9), Is.True);
        Assert.That(result.All(c => c.MunicipalityNumber is "3405" or "3403"), Is.True,
            "municipality is read from forretningsadresse (enheter) and beliggenhetsadresse (underenheter)");
        Assert.That(result.Any(c => !c.IsBranch), Is.True, "hovedenheter must survive the merge too");
    }

    [Test]
    public async Task GetByOrgnr_falls_back_to_underenheter_on_404()
    {
        const string branch = """
            {"organisasjonsnummer":"931895923","navn":"AGREED AS",
             "naeringskode1":{"kode":"62.200"},"overordnetEnhet":"931759515",
             "beliggenhetsadresse":{"kommunenummer":"3403"}}
            """;

        var client = new BrregClient(HttpFixtures.Client(request =>
            request.RequestUri!.ToString().Contains("underenheter/931895923", StringComparison.Ordinal)
                ? HttpFixtures.Json(branch)
                : HttpFixtures.NotFound()));

        var result = await client.GetByOrgnrAsync("931895923");

        Assert.That(result, Is.Not.Null);
        Assert.That(result!.IsBranch, Is.True);
        Assert.That(result.ParentOrgnr, Is.EqualTo("931759515"));
        Assert.That(result.MunicipalityNumber, Is.EqualTo("3403"));
    }

    [Test]
    public async Task GetByOrgnr_returns_null_when_neither_register_has_it()
    {
        var client = new BrregClient(HttpFixtures.Client(_ => HttpFixtures.NotFound()));
        Assert.That(await client.GetByOrgnrAsync("000000000"), Is.Null);
    }
}
