using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Hugin.Console.Data.Migrations;

/// <inheritdoc />
public partial class AddAdCategory : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "Category",
            table: "Ads",
            type: "TEXT",
            nullable: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "Category",
            table: "Ads");
    }
}
