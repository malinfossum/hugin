using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Hugin.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class V3StatusModel : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "Starred",
                table: "Pipeline",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            // Old: Funnet=0, SoektSelv=1, BedtGetSjekke=2, Svar=3.
            // New: Active=0, Applied=1, Answered=2. Both outreach routes collapse into Applied —
            // Route is dropped right after, so the distinction has nowhere left to live.
            migrationBuilder.Sql(
                "UPDATE Pipeline SET Status = CASE Status " +
                "WHEN 0 THEN 0 " +
                "WHEN 1 THEN 1 " +
                "WHEN 2 THEN 1 " +
                "WHEN 3 THEN 2 " +
                "END;");

            migrationBuilder.DropColumn(
                name: "Route",
                table: "Pipeline");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "Route",
                table: "Pipeline",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            // Best-effort inverse: Applied(1) cannot be told apart from the two routes it came
            // from, so it maps back to SoektSelv. The original Route data is gone — that is the
            // whole point of the pre-migration .bak HuginDbInitializer writes before this runs.
            migrationBuilder.Sql(
                "UPDATE Pipeline SET Status = CASE Status " +
                "WHEN 0 THEN 0 " +
                "WHEN 1 THEN 1 " +
                "WHEN 2 THEN 3 " +
                "END;");

            migrationBuilder.DropColumn(
                name: "Starred",
                table: "Pipeline");
        }
    }
}
