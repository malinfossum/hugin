namespace Hugin.Core.Models;

/// <summary>
/// One row of Brreg's kommune register (number → display name). Covers every kommune number,
/// unlike <see cref="Hugin.Core.Config.MunicipalityRef"/> which only lists the ones Hugin
/// actively tracks — this fills in names for companies seen outside that list (parents,
/// enriched ad employers).
/// </summary>
public sealed class Kommune
{
    public required string Number { get; init; }
    public required string Name { get; set; }
}
