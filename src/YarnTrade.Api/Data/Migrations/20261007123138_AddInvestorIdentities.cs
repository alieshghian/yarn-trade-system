using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace YarnTrade.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddInvestorIdentities : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "CapitalInvestorId",
                table: "Persons",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "PartnerInvestorId",
                table: "BusinessContractVersions",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "PrimaryInvestorId",
                table: "BusinessContractVersions",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "Investors",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    InvestorCode = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    PersonType = table.Column<int>(type: "int", nullable: false),
                    LegalName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Phone = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    Address = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Investors", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "InvestorBalances",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    InvestorId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Currency = table.Column<int>(type: "int", nullable: false),
                    Kind = table.Column<int>(type: "int", nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(20,6)", precision: 20, scale: 6, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InvestorBalances", x => x.Id);
                    table.CheckConstraint("CK_InvestorBalances_Currency", "[Currency] IN (0, 1)");
                    table.ForeignKey(
                        name: "FK_InvestorBalances_Investors_InvestorId",
                        column: x => x.InvestorId,
                        principalTable: "Investors",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.UpdateData(
                table: "Persons",
                keyColumn: "Id",
                keyValue: new Guid("11111111-1111-1111-1111-111111111111"),
                column: "CapitalInvestorId",
                value: null);

            migrationBuilder.UpdateData(
                table: "Persons",
                keyColumn: "Id",
                keyValue: new Guid("22222222-2222-2222-2222-222222222222"),
                column: "CapitalInvestorId",
                value: null);

            migrationBuilder.CreateIndex(
                name: "IX_Persons_CapitalInvestorId",
                table: "Persons",
                column: "CapitalInvestorId");

            migrationBuilder.CreateIndex(
                name: "IX_BusinessContractVersions_PartnerInvestorId",
                table: "BusinessContractVersions",
                column: "PartnerInvestorId");

            migrationBuilder.CreateIndex(
                name: "IX_BusinessContractVersions_PrimaryInvestorId",
                table: "BusinessContractVersions",
                column: "PrimaryInvestorId");

            migrationBuilder.CreateIndex(
                name: "IX_InvestorBalances_InvestorId_Currency_Kind",
                table: "InvestorBalances",
                columns: new[] { "InvestorId", "Currency", "Kind" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Investors_InvestorCode",
                table: "Investors",
                column: "InvestorCode",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_BusinessContractVersions_Investors_PartnerInvestorId",
                table: "BusinessContractVersions",
                column: "PartnerInvestorId",
                principalTable: "Investors",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_BusinessContractVersions_Investors_PrimaryInvestorId",
                table: "BusinessContractVersions",
                column: "PrimaryInvestorId",
                principalTable: "Investors",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Persons_Investors_CapitalInvestorId",
                table: "Persons",
                column: "CapitalInvestorId",
                principalTable: "Investors",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_BusinessContractVersions_Investors_PartnerInvestorId",
                table: "BusinessContractVersions");

            migrationBuilder.DropForeignKey(
                name: "FK_BusinessContractVersions_Investors_PrimaryInvestorId",
                table: "BusinessContractVersions");

            migrationBuilder.DropForeignKey(
                name: "FK_Persons_Investors_CapitalInvestorId",
                table: "Persons");

            migrationBuilder.DropTable(
                name: "InvestorBalances");

            migrationBuilder.DropTable(
                name: "Investors");

            migrationBuilder.DropIndex(
                name: "IX_Persons_CapitalInvestorId",
                table: "Persons");

            migrationBuilder.DropIndex(
                name: "IX_BusinessContractVersions_PartnerInvestorId",
                table: "BusinessContractVersions");

            migrationBuilder.DropIndex(
                name: "IX_BusinessContractVersions_PrimaryInvestorId",
                table: "BusinessContractVersions");

            migrationBuilder.DropColumn(
                name: "CapitalInvestorId",
                table: "Persons");

            migrationBuilder.DropColumn(
                name: "PartnerInvestorId",
                table: "BusinessContractVersions");

            migrationBuilder.DropColumn(
                name: "PrimaryInvestorId",
                table: "BusinessContractVersions");
        }
    }
}
