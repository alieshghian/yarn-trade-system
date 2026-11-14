using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace YarnTrade.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class WarehouseLocation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_WarehouseZone_Floor",
                table: "WarehouseZones");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Warehouse_Floors",
                table: "Warehouses");

            migrationBuilder.AddColumn<string>(
                name: "Location",
                table: "Warehouses",
                type: "nvarchar(7)",
                maxLength: 7,
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_WarehouseZone_Floor",
                table: "WarehouseZones",
                sql: "[FloorNumber] BETWEEN 1 AND 5");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Warehouse_Floors",
                table: "Warehouses",
                sql: "[FloorCount] BETWEEN 1 AND 5");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Warehouse_Location",
                table: "Warehouses",
                sql: "[Location] IS NULL OR [Location] IN (N'inside',N'outside')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            throw new System.NotSupportedException("Warehouse location is owner data; restore a verified backup instead of deleting it.");
        }
    }
}
