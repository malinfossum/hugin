using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Hugin.Infrastructure.Data.Migrations;

/// <inheritdoc />
public partial class Initial : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "Ads",
            columns: table => new
            {
                FeedId = table.Column<string>(type: "TEXT", nullable: false),
                Title = table.Column<string>(type: "TEXT", nullable: false),
                EmployerName = table.Column<string>(type: "TEXT", nullable: true),
                EmployerOrgnr = table.Column<string>(type: "TEXT", nullable: true),
                MunicipalityNumber = table.Column<string>(type: "TEXT", nullable: true),
                Published = table.Column<long>(type: "INTEGER", nullable: true),
                Expires = table.Column<long>(type: "INTEGER", nullable: true),
                SourceUrl = table.Column<string>(type: "TEXT", nullable: true),
                FirstSeen = table.Column<long>(type: "INTEGER", nullable: false),
                IsActive = table.Column<bool>(type: "INTEGER", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_Ads", x => x.FeedId);
            });

        migrationBuilder.CreateTable(
            name: "Companies",
            columns: table => new
            {
                Orgnr = table.Column<string>(type: "TEXT", nullable: false),
                Name = table.Column<string>(type: "TEXT", nullable: false),
                MunicipalityNumber = table.Column<string>(type: "TEXT", nullable: true),
                NaceCode = table.Column<string>(type: "TEXT", nullable: true),
                ParentOrgnr = table.Column<string>(type: "TEXT", nullable: true),
                IsBranch = table.Column<bool>(type: "INTEGER", nullable: false),
                Website = table.Column<string>(type: "TEXT", nullable: true),
                FirstSeen = table.Column<long>(type: "INTEGER", nullable: false),
                LastSeenInRegister = table.Column<long>(type: "INTEGER", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_Companies", x => x.Orgnr);
            });

        migrationBuilder.CreateTable(
            name: "Pipeline",
            columns: table => new
            {
                Id = table.Column<int>(type: "INTEGER", nullable: false)
                    .Annotation("Sqlite:Autoincrement", true),
                Orgnr = table.Column<string>(type: "TEXT", nullable: false),
                Status = table.Column<int>(type: "INTEGER", nullable: false),
                Why = table.Column<string>(type: "TEXT", nullable: false),
                Note = table.Column<string>(type: "TEXT", nullable: true),
                SvarText = table.Column<string>(type: "TEXT", nullable: true),
                Created = table.Column<long>(type: "INTEGER", nullable: false),
                Updated = table.Column<long>(type: "INTEGER", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_Pipeline", x => x.Id);
            });

        migrationBuilder.CreateTable(
            name: "ReviewMarks",
            columns: table => new
            {
                Id = table.Column<int>(type: "INTEGER", nullable: false)
                    .Annotation("Sqlite:Autoincrement", true),
                LastReviewedUtc = table.Column<long>(type: "INTEGER", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_ReviewMarks", x => x.Id);
            });

        migrationBuilder.CreateTable(
            name: "SyncStates",
            columns: table => new
            {
                Source = table.Column<string>(type: "TEXT", nullable: false),
                LastSyncUtc = table.Column<long>(type: "INTEGER", nullable: true),
                Cursor = table.Column<string>(type: "TEXT", nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_SyncStates", x => x.Source);
            });

        migrationBuilder.CreateIndex(
            name: "IX_Pipeline_Orgnr",
            table: "Pipeline",
            column: "Orgnr",
            unique: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "Ads");

        migrationBuilder.DropTable(
            name: "Companies");

        migrationBuilder.DropTable(
            name: "Pipeline");

        migrationBuilder.DropTable(
            name: "ReviewMarks");

        migrationBuilder.DropTable(
            name: "SyncStates");
    }
}
