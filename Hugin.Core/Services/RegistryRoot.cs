using Hugin.Core.Abstractions;

namespace Hugin.Core.Services;

/// <summary>
/// The top of a company's chain in Enhetsregisteret. <c>ParentOrgnr</c> is Brreg's
/// <c>overordnetEnhet</c> — a branch's hovedenhet or a public body's parent — not group
/// (konsern) membership, which the register API does not expose.
/// </summary>
public static class RegistryRoot
{
    public const int MaxHops = 4;

    /// <summary>
    /// Follows ParentOrgnr upward from <paramref name="orgnr"/>, at most <see cref="MaxHops"/>
    /// hops, stopping at a missing company row, a missing parent, or a self-reference. A missing
    /// company row for an orgnr means the orgnr is its own root.
    /// </summary>
    public static async Task<string> ResolveAsync(ICompanyRepository companies, string orgnr,
        CancellationToken ct = default)
    {
        var current = orgnr;
        for (var hop = 0; hop < MaxHops; hop++)
        {
            var company = await companies.GetAsync(current, ct);
            if (company?.ParentOrgnr is not { } parent || parent == current) break;
            current = parent;
        }

        return current;
    }
}
