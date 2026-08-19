using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Hugin.Infrastructure.Data;

/// <summary>Design-time only — `dotnet ef migrations` needs a context it can build without the host.</summary>
public sealed class HuginDbContextFactory : IDesignTimeDbContextFactory<HuginDbContext>
{
    public HuginDbContext CreateDbContext(string[] args) =>
        new(new DbContextOptionsBuilder<HuginDbContext>()
            .UseSqlite("Data Source=hugin.db")
            .Options);
}
