using Hugin.Core.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace Hugin.Console.Data;

public sealed class HuginDbContext(DbContextOptions<HuginDbContext> options) : DbContext(options)
{
    public DbSet<Company> Companies => Set<Company>();
    public DbSet<Ad> Ads => Set<Ad>();
    public DbSet<PipelineEntry> Pipeline => Set<PipelineEntry>();
    public DbSet<SyncState> SyncStates => Set<SyncState>();
    public DbSet<ReviewMarkRow> ReviewMarks => Set<ReviewMarkRow>();

    // SQLite has no DateTimeOffset type. Without this, EF stores it as TEXT and cannot
    // translate comparisons or ordering at all ("could not be translated"). The binary
    // converter keeps both the instant and the offset, and sorts correctly in SQL.
    protected override void ConfigureConventions(ModelConfigurationBuilder builder)
        => builder.Properties<DateTimeOffset>().HaveConversion<DateTimeOffsetToBinaryConverter>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Company>().HasKey(c => c.Orgnr);
        b.Entity<Ad>().HasKey(a => a.FeedId);
        b.Entity<PipelineEntry>().HasIndex(p => p.Orgnr).IsUnique();
        b.Entity<SyncState>().HasKey(s => s.Source);
        b.Entity<ReviewMarkRow>().HasKey(r => r.Id);
    }
}

// Single-row table backing IReviewMarkRepository (Id is always 1).
public sealed class ReviewMarkRow
{
    public int Id { get; set; } = 1;
    public DateTimeOffset LastReviewedUtc { get; set; }
}
