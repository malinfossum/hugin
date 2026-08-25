namespace Hugin.Core.Models;

/// <summary>A dashboard header link the user can add, edit, reorder, or remove — the db-backed
/// replacement for hugin.json's config-only linkouts.</summary>
public sealed class Source
{
    public int Id { get; set; }
    public required string Label { get; set; }
    public required string Url { get; set; }
    public int Position { get; set; }
}
