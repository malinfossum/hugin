namespace Hugin.Core.Config;

public sealed record MunicipalityRef(string Name, string Number);

public sealed record Linkout(string Label, string Url);

/// <summary>
/// Everything region-specific lives here, so Hugin works anywhere without code changes.
/// Defaults cover Innlandet. Keywords filter <em>ads</em>, not companies — a company is
/// interesting regardless of how its ads are worded.
/// </summary>
public sealed class HuginConfig
{
    public List<MunicipalityRef> Municipalities { get; init; } =
        [new("Gjøvik", "3407"), new("Hamar", "3403"), new("Lillehammer", "3405"), new("Ringsaker", "3411")];

    // SN2025 codes; the prefix "62" matches all sub-codes (the old "62.010" returns zero results).
    public List<string> Naeringskoder { get; init; } = ["62"];

    public List<string> Keywords { get; init; } =
        ["utvikler", "developer", "backend", "frontend", "fullstack", "programvare", "software"];

    // null → fetch NAV's rotating public token automatically.
    public string? NavToken { get; init; }

    public List<Linkout> Linkouts { get; init; } = [];
}
