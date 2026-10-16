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

    /// <summary>True when no begrunnelse is written yet.</summary>
    public bool MissingWhy => string.IsNullOrWhiteSpace(Why);

    /// <summary>Applied and answered entries should say why the company is interesting; an
    /// active entry may wait.</summary>
    public bool NeedsWhy => Status != PipelineStatus.Active && MissingWhy;

    /// <summary>First sighting of a company in the pipeline.</summary>
    public static PipelineEntry Track(string orgnr, PipelineStatus status, string? why,
        string? note, string? svar, bool? starred, DateTimeOffset now) => new()
    {
        Orgnr = orgnr,
        Status = status,
        Starred = starred ?? false,
        Why = why ?? "",
        Note = note,
        SvarText = svar,
        Created = now,
        Updated = now,
    };

    /// <summary>Moves an existing entry. Options that were not passed leave the stored values
    /// alone: moving the status must never wipe the begrunnelse written last week, or the star.
    /// <see cref="Created"/> belongs to the first sighting.</summary>
    public void Retrack(PipelineStatus status, string? why, string? note, string? svar,
        bool? starred, DateTimeOffset now)
    {
        Status = status;
        Starred = starred ?? Starred;
        Why = why ?? Why;
        Note = note ?? Note;
        SvarText = svar ?? SvarText;
        Updated = now;
    }
}
