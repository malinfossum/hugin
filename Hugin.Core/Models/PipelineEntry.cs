namespace Hugin.Core.Models;

public enum PipelineStatus
{
    Funnet,
    SoektSelv,
    BedtGetSjekke,
    Svar
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
    public string Why { get; set; } = "";
    public string? Note { get; set; }
    public string? SvarText { get; set; }
    public DateTimeOffset Created { get; set; }
    public DateTimeOffset Updated { get; set; }
}
