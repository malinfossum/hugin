using Hugin.Core.Models;
using Microsoft.EntityFrameworkCore;

namespace Hugin.Infrastructure.Data;

public sealed class HuginDbContext(DbContextOptions<HuginDbContext> options) : DbContext(options)
{
    public DbSet<Company> Companies => Set<Company>();
    public DbSet<Ad> Ads => Set<Ad>();
    public DbSet<PipelineEntry> Pipeline => Set<PipelineEntry>();
    public DbSet<SyncState> SyncStates => Set<SyncState>();
    public DbSet<ReviewMarkRow> ReviewMarks => Set<ReviewMarkRow>();
    public DbSet<Kommune> Kommuner => Set<Kommune>();

    // SQLite has no DateTimeOffset type; without a converter to a comparable column, EF
    // cannot translate comparisons or ordering at all ("could not be translated"). The
    // stock DateTimeOffsetToBinaryConverter is NOT the answer: it encodes local wall-clock
    // ticks first, so SQL ordering across different offsets follows the local clock — an ad
    // expiring 23:59+02:00 sorted after a UTC "now" of 22:30Z despite being 31 minutes past.
    // Storing UtcTicks makes every SQL comparison an instant comparison. The original offset
    // is not kept; values read back as UTC, which is how Hugin treats time everywhere.
    protected override void ConfigureConventions(ModelConfigurationBuilder builder)
        => builder.Properties<DateTimeOffset>().HaveConversion<UtcTicksConverter>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Company>().HasKey(c => c.Orgnr);
        b.Entity<Ad>().HasKey(a => a.FeedId);
        b.Entity<PipelineEntry>().HasIndex(p => p.Orgnr).IsUnique();
        b.Entity<SyncState>().HasKey(s => s.Source);
        b.Entity<ReviewMarkRow>().HasKey(r => r.Id);
        b.Entity<Kommune>().HasKey(k => k.Number);
    }
}

internal sealed class UtcTicksConverter()
    : Microsoft.EntityFrameworkCore.Storage.ValueConversion.ValueConverter<DateTimeOffset, long>(
        v => v.UtcTicks,
        v => new DateTimeOffset(v, TimeSpan.Zero));

// Single-row table backing IReviewMarkRepository (Id is always 1).
public sealed class ReviewMarkRow
{
    public int Id { get; set; } = 1;
    public DateTimeOffset LastReviewedUtc { get; set; }
}
