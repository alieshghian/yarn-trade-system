using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace YarnTrade.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class WarehouseZonesAndCustodians : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AddressesJson",
                table: "Warehouses",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Description",
                table: "Warehouses",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "WarehouseCustodianPeriods",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    WarehouseId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PersonId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StartedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    EndedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ChangedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Reason = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WarehouseCustodianPeriods", x => x.Id);
                    table.CheckConstraint("CK_WarehouseCustodianPeriod_Dates", "[EndedAtUtc] IS NULL OR [EndedAtUtc] >= [StartedAtUtc]");
                    table.ForeignKey(
                        name: "FK_WarehouseCustodianPeriods_Persons_PersonId",
                        column: x => x.PersonId,
                        principalTable: "Persons",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_WarehouseCustodianPeriods_Warehouses_WarehouseId",
                        column: x => x.WarehouseId,
                        principalTable: "Warehouses",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "WarehouseZones",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    WarehouseId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    NormalizedCode = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: false, collation: "Latin1_General_100_BIN2"),
                    NormalizedName = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: false, collation: "Latin1_General_100_BIN2"),
                    Description = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    IsDefaultReceiving = table.Column<bool>(type: "bit", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WarehouseZones", x => x.Id);
                    table.CheckConstraint("CK_WarehouseZones_ReceivingActive", "[IsDefaultReceiving] = 0 OR [IsActive] = 1");
                    table.ForeignKey(
                        name: "FK_WarehouseZones_Warehouses_WarehouseId",
                        column: x => x.WarehouseId,
                        principalTable: "Warehouses",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_WarehouseCustodianPeriods_PersonId",
                table: "WarehouseCustodianPeriods",
                column: "PersonId");

            migrationBuilder.CreateIndex(
                name: "IX_WarehouseCustodianPeriods_WarehouseId",
                table: "WarehouseCustodianPeriods",
                column: "WarehouseId",
                unique: true,
                filter: "[EndedAtUtc] IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_WarehouseZones_WarehouseId_NormalizedCode",
                table: "WarehouseZones",
                columns: new[] { "WarehouseId", "NormalizedCode" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WarehouseZones_WarehouseId_NormalizedName",
                table: "WarehouseZones",
                columns: new[] { "WarehouseId", "NormalizedName" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "UX_WarehouseZones_Receiving",
                table: "WarehouseZones",
                column: "WarehouseId",
                unique: true,
                filter: "[IsDefaultReceiving] = 1");
            // Add receiving areas to existing warehouses without changing their records or balances.
            migrationBuilder.Sql(@"INSERT INTO WarehouseZones (Id,WarehouseId,Code,Name,NormalizedCode,NormalizedName,IsDefaultReceiving,IsActive,CreatedAtUtc)
 SELECT NEWID(),Id,N'DOCK',N'بارانداز',N'DOCK',N'بارانداز',1,1,SYSUTCDATETIME() FROM Warehouses;
 IF EXISTS(SELECT 1 FROM Warehouses w WHERE w.CustodianPersonId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM Persons p WHERE p.Id=w.CustodianPersonId))
 THROW 51001,'Existing warehouse custodian must reference a person; review before migration.',1;
 INSERT INTO WarehouseCustodianPeriods (Id,WarehouseId,PersonId,StartedAtUtc,Reason)
 SELECT NEWID(),Id,CustodianPersonId,SYSUTCDATETIME(),N'اولین ثبت سابقه در زمان ارتقای سیستم؛ تاریخ آغاز واقعی پیشین مشخص نیست.' FROM Warehouses WHERE CustodianPersonId IS NOT NULL;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "WarehouseCustodianPeriods");

            migrationBuilder.DropTable(
                name: "WarehouseZones");

            migrationBuilder.DropColumn(
                name: "AddressesJson",
                table: "Warehouses");

            migrationBuilder.DropColumn(
                name: "Description",
                table: "Warehouses");
        }
    }
}
