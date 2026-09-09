namespace Hugin.Core.Config;

public sealed record MunicipalityRef(string Name, string Number);

public sealed record Linkout(string Label, string Url);

/// <summary>
/// Everything region-specific lives here, so Hugin works anywhere without code changes.
/// No default geography — an empty scope is a fresh install, not a fallback to some region.
/// Keywords filter <em>ads</em>, not companies — a company is interesting regardless of how
/// its ads are worded.
/// </summary>
public sealed class HuginConfig
{
    // No default geography: which kommuner matter is only knowable by asking (spec v3.5 Part A).
    // The first-run dialog writes this list; the CLI prints how to fill it by hand.
    public List<MunicipalityRef> Municipalities { get; init; } = [];

    // 2-digit fylke prefixes (e.g. "39" = Vestfold og Telemark) — expands discovery to every
    // kommune in the fylke, resolved against the kommune register at sync time.
    public List<string> Fylker { get; init; } = [];

    // Expands discovery to every kommune in the register — the widest scope, for national reach.
    public bool AllOfNorway { get; init; }

    // SN2025 codes; a prefix matches all sub-codes ("62" covers 62.010). Measured against Brreg
    // 2026-09-09 for four Innlandet kommuner: these eight add ~258 units on top of 62's 1 012.
    // 64 is deliberately absent — it is 467 units of holding companies; 64.19 is the 35 banks.
    public List<string> Naeringskoder { get; init; } =
        ["62",     // IT-tjenester — consultancies and software houses
         "72",     // Forskning og utviklingsarbeid — research institutes
         "63",     // Databehandling, hosting, portaler
         "58.2",   // Programvareutgivelse — product companies
         "64.19",  // Bankvirksomhet — in-house dev teams
         "92",     // Lotteri og gambling — Norsk Tipping
         "61",     // Telekommunikasjon
         "26.2"];  // Produksjon av datamaskiner

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
