namespace Hugin.Core.Models;

public enum PipelineStatus
{
    Funnet,
    SoektSelv,
    BedtGetSjekke,
    Svar
}

/// <summary>
/// How the company was approached. Status is linear and ends at <see cref="PipelineStatus.Svar"/>,
/// which on its own loses the distinction the Preparelogg needs: an answer to an application
/// Malin sent herself must not be filed under what she asked GET to check.
/// </summary>
public enum OutreachRoute
{
    Ingen,
    SoektSelv,
    BedtGetSjekke
}

/// <summary>
/// One outreach entry per company. <see cref="Why"/> is the "Grunn til at de er
/// interessante" column GET Prepared requires — export flags entries where it is empty.
/// </summary>
public sealed class PipelineEntry
{
    public int Id { get; set; }
    public required string Orgnr { get; init; }
    public PipelineStatus Status { get; set; }
    public OutreachRoute Route { get; set; }
    public string Why { get; set; } = "";
    public string? Note { get; set; }
    public string? SvarText { get; set; }
    public DateTimeOffset Created { get; set; }
    public DateTimeOffset Updated { get; set; }
}
