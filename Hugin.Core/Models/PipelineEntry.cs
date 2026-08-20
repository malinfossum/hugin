namespace Hugin.Core.Models;

public enum PipelineStatus
{
    Active,
    Applied,
    Answered
}

/// <summary>
/// One outreach entry per company. <see cref="Why"/> is the "Grunn til at de er
/// interessante" column — export flags entries where it is empty. <see cref="Starred"/> is an
/// independent "want to apply" flag, orthogonal to <see cref="Status"/>.
/// </summary>
public sealed class PipelineEntry
{
    public int Id { get; set; }
    public required string Orgnr { get; init; }
    public PipelineStatus Status { get; set; }
    public bool Starred { get; set; }
    public string Why { get; set; } = "";
    public string? Note { get; set; }
    public string? SvarText { get; set; }
    public DateTimeOffset Created { get; set; }
    public DateTimeOffset Updated { get; set; }
}
