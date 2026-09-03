using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Hugin.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddAdLinkedOrgnr : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "LinkedOrgnr",
                table: "Ads",
                type: "TEXT",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "LinkedOrgnr",
                table: "Ads");
        }
    }
}
