using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Hugin.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddWebsiteCheck : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "WebsiteCheckedUtc",
                table: "Companies",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "WebsiteOk",
                table: "Companies",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "WebsiteResolved",
                table: "Companies",
                type: "TEXT",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "WebsiteCheckedUtc",
                table: "Companies");

            migrationBuilder.DropColumn(
                name: "WebsiteOk",
                table: "Companies");

            migrationBuilder.DropColumn(
                name: "WebsiteResolved",
                table: "Companies");
        }
    }
}
