using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Hugin.Infrastructure.Data.Migrations;

/// <inheritdoc />
public partial class AddOutreachRoute : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<int>(
            name: "Route",
            table: "Pipeline",
            type: "INTEGER",
            nullable: false,
            defaultValue: 0);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "Route",
            table: "Pipeline");
    }
}
