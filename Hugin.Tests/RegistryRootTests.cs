using Hugin.Core.Abstractions;
using Hugin.Core.Services;

namespace Hugin.Tests;

public class RegistryRootTests
{
    private static readonly DateTimeOffset T1 = new(2026, 9, 28, 8, 0, 0, TimeSpan.Zero);

    private static async Task<FakeCompanyRepository> With(params (string Orgnr, string? Parent)[] rows)
    {
        var companies = new FakeCompanyRepository();
        foreach (var (orgnr, parent) in rows)
            await companies.UpsertAsync(new RegisterCompany(orgnr, orgnr, "3403", "62.100", parent, parent is not null, null), T1);
        return companies;
    }

    [Test]
    public async Task A_missing_row_is_its_own_root() =>
        Assert.That(await RegistryRoot.ResolveAsync(await With(), "111111111"), Is.EqualTo("111111111"));

    [Test]
    public async Task A_branch_resolves_to_its_parent_even_when_the_parent_row_is_missing() =>
        Assert.That(await RegistryRoot.ResolveAsync(await With(("111111111", "333333333")), "111111111"),
            Is.EqualTo("333333333"));

    [Test]
    public async Task A_self_reference_stops_the_walk() =>
        Assert.That(await RegistryRoot.ResolveAsync(await With(("111111111", "111111111")), "111111111"),
            Is.EqualTo("111111111"));

    [Test]
    public async Task The_walk_stops_after_MaxHops()
    {
        var companies = await With(("100000001", "100000002"), ("100000002", "100000003"),
            ("100000003", "100000004"), ("100000004", "100000005"), ("100000005", "100000006"));

        Assert.That(RegistryRoot.MaxHops, Is.EqualTo(4));
        Assert.That(await RegistryRoot.ResolveAsync(companies, "100000001"), Is.EqualTo("100000005"));
    }
}
