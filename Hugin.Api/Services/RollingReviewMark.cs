using Hugin.Core.Abstractions;

namespace Hugin.Api.Services;

/// <summary>
/// Public-mode review mark: nobody can press «Merk som sett» on the demo, so a stored mark would
/// freeze at the snapshot date and «Nytt siden sist» would grow without bound. Reads answer
/// "now minus a week" instead; writes still go to the real row (the sync's initial-baseline write
/// never fires because a read is never null). Demo spec A8.
/// </summary>
public sealed class RollingReviewMark(IReviewMarkRepository inner, IClock clock) : IReviewMarkRepository
{
    public static readonly TimeSpan Window = TimeSpan.FromDays(7);

    public Task<DateTimeOffset?> GetAsync(CancellationToken ct = default) =>
        Task.FromResult<DateTimeOffset?>(clock.UtcNow - Window);

    public Task SetAsync(DateTimeOffset mark, CancellationToken ct = default) => inner.SetAsync(mark, ct);
}
