namespace Hugin.Core.Config;

/// <summary>The three discovery keys of hugin.json — the only part of the config the dashboard
/// writes (v3.4). Everything else stays hand-edited.</summary>
public sealed record DiscoveryConfig(IReadOnlyList<MunicipalityRef> Municipalities, IReadOnlyList<string> Fylker, bool AllOfNorway)
{
    public static DiscoveryConfig From(HuginConfig config) => new(config.Municipalities, config.Fylker, config.AllOfNorway);
}
