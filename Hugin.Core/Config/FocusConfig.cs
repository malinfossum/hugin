namespace Hugin.Core.Config;

/// <summary>The two focus keys of hugin.json the dashboard writes (v3.5). `categories` stays
/// hand-edited on purpose — the NAV level-1 gate is what keeps Hugin developer-only.</summary>
public sealed record FocusConfig(IReadOnlyList<string> Naeringskoder, IReadOnlyList<string> Keywords)
{
    public static FocusConfig From(HuginConfig config) => new(config.Naeringskoder, config.Keywords);
}
