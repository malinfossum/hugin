namespace Hugin.Core.Abstractions;

/// <summary>Time as a dependency, so "what counts as new" is testable without waiting.</summary>
public interface IClock
{
    public DateTimeOffset UtcNow { get; }
}
