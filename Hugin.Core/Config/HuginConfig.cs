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

    // 2-digit fylke prefixes (e.g. "39" = Vestfold og Telemark) — expands discovery to every
    // kommune in the fylke, resolved against the kommune register at sync time.
    public List<string> Fylker { get; init; } = [];

    // Expands discovery to every kommune in the register — the widest scope, for national reach.
    public bool AllOfNorway { get; init; }

    // SN2025 codes; the prefix "62" matches all sub-codes (the old "62.010" returns zero results).
    public List<string> Naeringskoder { get; init; } = ["62"];

    // Deliberately broad — this is the recall net. "AI Engineer", "KI-utvikler" and
    // "Machine Learning Engineer" all contain one of these; the category gate below
    // handles the precision. Short fragments like "KI"/"AI" are excluded on purpose:
    // substring matching would light up on "sKIkkelig" and "domAIn".
    public List<string> Keywords { get; init; } =
        ["utvikler", "developer", "engineer", "programmerer", "fullstack", "backend", "frontend",
         "devops", "programvare", "software", "arkitekt", "IT-konsulent",
         "kunstig intelligens", "maskinlæring", "machine learning"];

    // NAV's occupationCategories level1. "utvikler" alone also matches prosjektutvikler
    // massivtre (Bygg) and fag- og kvalitetsutvikler (Helse); this keeps the developer roles.
    // Ads NAV has not categorized always pass. Empty list = gate off.
    public List<string> Categories { get; init; } = ["IT"];

    // null → fetch NAV's rotating public token automatically.
    public string? NavToken { get; init; }

    public List<Linkout> Linkouts { get; init; } = [];
}
