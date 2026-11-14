using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace YarnTrade.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class WarehouseFloors : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_WarehouseZones_WarehouseId_NormalizedName",
                table: "WarehouseZones");

            migrationBuilder.DropIndex(
                name: "UX_WarehouseZones_Receiving",
                table: "WarehouseZones");

            migrationBuilder.DropIndex(name: "IX_WarehouseZones_WarehouseId_NormalizedCode", table: "WarehouseZones");

            migrationBuilder.AlterColumn<string>(
                name: "NormalizedCode",
                table: "WarehouseZones",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: false,
                collation: "Latin1_General_100_BIN2",
                oldClrType: typeof(string),
                oldType: "nvarchar(60)",
                oldMaxLength: 60,
                oldCollation: "Latin1_General_100_BIN2");

            migrationBuilder.AlterColumn<string>(
                name: "Code",
                table: "WarehouseZones",
                type: "nvarchar(60)",
                maxLength: 60,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(30)",
                oldMaxLength: 30);

            migrationBuilder.AddColumn<int>(
                name: "FloorNumber",
                table: "WarehouseZones",
                type: "int",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.AddColumn<int>(
                name: "FloorCount",
                table: "Warehouses",
                type: "int",
                nullable: false,
                defaultValue: 1);

            // Preserve technical IDs/history; assign every pre-existing zone to ground floor.
            migrationBuilder.Sql("UPDATE WarehouseZones SET Code=N'1-'+Code, NormalizedCode=N'1-'+NormalizedCode, Name=CASE WHEN IsDefaultReceiving=1 THEN N'بارانداز' ELSE Name END, NormalizedName=CASE WHEN IsDefaultReceiving=1 THEN N'بارانداز' ELSE NormalizedName END;");
            migrationBuilder.CreateIndex(name: "IX_WarehouseZones_WarehouseId_NormalizedCode", table: "WarehouseZones", columns: new[]{"WarehouseId","NormalizedCode"}, unique:true);

            migrationBuilder.CreateIndex(
                name: "IX_WarehouseZones_WarehouseId_FloorNumber_NormalizedName",
                table: "WarehouseZones",
                columns: new[] { "WarehouseId", "FloorNumber", "NormalizedName" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "UX_WarehouseZones_Receiving",
                table: "WarehouseZones",
                columns: new[] { "WarehouseId", "FloorNumber" },
                unique: true,
                filter: "[IsDefaultReceiving] = 1");

            migrationBuilder.AddCheckConstraint(
                name: "CK_WarehouseZone_Floor",
                table: "WarehouseZones",
                sql: "[FloorNumber] BETWEEN 1 AND 100");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Warehouse_Floors",
                table: "Warehouses",
                sql: "[FloorCount] BETWEEN 1 AND 100");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            throw new System.NotSupportedException("Warehouse floors contain owner data. Restore a verified backup rather than dropping floor information.");
        }
    }
}
