using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace YarnTrade.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddBusinessContractRules : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "BusinessContractVersionId",
                table: "Sales",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "BusinessContractVersionId",
                table: "PurchaseInvoices",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "BusinessContractVersionId",
                table: "PartnerSettlements",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "BusinessContractVersionId",
                table: "MoneyDocuments",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "BusinessContractVersions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    VersionNumber = table.Column<int>(type: "int", nullable: false),
                    PreviousVersionId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ContractName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    EffectiveFrom = table.Column<DateOnly>(type: "date", nullable: false),
                    BaseCurrency = table.Column<int>(type: "int", nullable: false),
                    BusinessStructure = table.Column<int>(type: "int", nullable: false),
                    PartnerPersonId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    OwnershipParty1Percent = table.Column<decimal>(type: "decimal(12,8)", precision: 12, scale: 8, nullable: false),
                    OwnershipParty2Percent = table.Column<decimal>(type: "decimal(12,8)", precision: 12, scale: 8, nullable: false),
                    NormalSaleProfitParty1Percent = table.Column<decimal>(type: "decimal(12,8)", precision: 12, scale: 8, nullable: false),
                    NormalSaleProfitParty2Percent = table.Column<decimal>(type: "decimal(12,8)", precision: 12, scale: 8, nullable: false),
                    CreditSaleProfitParty1Percent = table.Column<decimal>(type: "decimal(12,8)", precision: 12, scale: 8, nullable: false),
                    CreditSaleProfitParty2Percent = table.Column<decimal>(type: "decimal(12,8)", precision: 12, scale: 8, nullable: false),
                    LossParty1Percent = table.Column<decimal>(type: "decimal(12,8)", precision: 12, scale: 8, nullable: false),
                    LossParty2Percent = table.Column<decimal>(type: "decimal(12,8)", precision: 12, scale: 8, nullable: false),
                    CostResponsibilitiesJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CashSalesAllowed = table.Column<bool>(type: "bit", nullable: false),
                    CreditSalesAllowed = table.Column<bool>(type: "bit", nullable: false),
                    CreditCalculationMethod = table.Column<int>(type: "int", nullable: true),
                    DefaultCreditRatePercent = table.Column<decimal>(type: "decimal(12,8)", precision: 12, scale: 8, nullable: true),
                    CheckCollectionGracePeriodDays = table.Column<int>(type: "int", nullable: true),
                    ResponsiblePartyAfterGracePeriod = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: true),
                    ReceivablesFinancingAllowed = table.Column<bool>(type: "bit", nullable: false),
                    FinancingCostResponsibleParty = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: true),
                    FinancedCheckPrincipalRiskParty = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: true),
                    PartnerEntitlementCreatedWhen = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    CashSaleClaimPayableWhen = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    CreditSaleClaimPayableWhen = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    UseActualTransactionFxRate = table.Column<bool>(type: "bit", nullable: false),
                    SeparateFxPurchaseAndPartnerRemittance = table.Column<bool>(type: "bit", nullable: false),
                    CarryPartnerOverpaymentToCurrentAccount = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BusinessContractVersions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BusinessContractVersions_BusinessContractVersions_PreviousVersionId",
                        column: x => x.PreviousVersionId,
                        principalTable: "BusinessContractVersions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_BusinessContractVersions_Persons_PartnerPersonId",
                        column: x => x.PartnerPersonId,
                        principalTable: "Persons",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Sales_BusinessContractVersionId",
                table: "Sales",
                column: "BusinessContractVersionId");

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseInvoices_BusinessContractVersionId",
                table: "PurchaseInvoices",
                column: "BusinessContractVersionId");

            migrationBuilder.CreateIndex(
                name: "IX_PartnerSettlements_BusinessContractVersionId",
                table: "PartnerSettlements",
                column: "BusinessContractVersionId");

            migrationBuilder.CreateIndex(
                name: "IX_MoneyDocuments_BusinessContractVersionId",
                table: "MoneyDocuments",
                column: "BusinessContractVersionId");

            migrationBuilder.CreateIndex(
                name: "IX_BusinessContractVersions_EffectiveFrom",
                table: "BusinessContractVersions",
                column: "EffectiveFrom");

            migrationBuilder.CreateIndex(
                name: "IX_BusinessContractVersions_PartnerPersonId",
                table: "BusinessContractVersions",
                column: "PartnerPersonId");

            migrationBuilder.CreateIndex(
                name: "IX_BusinessContractVersions_PreviousVersionId",
                table: "BusinessContractVersions",
                column: "PreviousVersionId");

            migrationBuilder.CreateIndex(
                name: "IX_BusinessContractVersions_VersionNumber",
                table: "BusinessContractVersions",
                column: "VersionNumber",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_MoneyDocuments_BusinessContractVersions_BusinessContractVersionId",
                table: "MoneyDocuments",
                column: "BusinessContractVersionId",
                principalTable: "BusinessContractVersions",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_PartnerSettlements_BusinessContractVersions_BusinessContractVersionId",
                table: "PartnerSettlements",
                column: "BusinessContractVersionId",
                principalTable: "BusinessContractVersions",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_PurchaseInvoices_BusinessContractVersions_BusinessContractVersionId",
                table: "PurchaseInvoices",
                column: "BusinessContractVersionId",
                principalTable: "BusinessContractVersions",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Sales_BusinessContractVersions_BusinessContractVersionId",
                table: "Sales",
                column: "BusinessContractVersionId",
                principalTable: "BusinessContractVersions",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_MoneyDocuments_BusinessContractVersions_BusinessContractVersionId",
                table: "MoneyDocuments");

            migrationBuilder.DropForeignKey(
                name: "FK_PartnerSettlements_BusinessContractVersions_BusinessContractVersionId",
                table: "PartnerSettlements");

            migrationBuilder.DropForeignKey(
                name: "FK_PurchaseInvoices_BusinessContractVersions_BusinessContractVersionId",
                table: "PurchaseInvoices");

            migrationBuilder.DropForeignKey(
                name: "FK_Sales_BusinessContractVersions_BusinessContractVersionId",
                table: "Sales");

            migrationBuilder.DropTable(
                name: "BusinessContractVersions");

            migrationBuilder.DropIndex(
                name: "IX_Sales_BusinessContractVersionId",
                table: "Sales");

            migrationBuilder.DropIndex(
                name: "IX_PurchaseInvoices_BusinessContractVersionId",
                table: "PurchaseInvoices");

            migrationBuilder.DropIndex(
                name: "IX_PartnerSettlements_BusinessContractVersionId",
                table: "PartnerSettlements");

            migrationBuilder.DropIndex(
                name: "IX_MoneyDocuments_BusinessContractVersionId",
                table: "MoneyDocuments");

            migrationBuilder.DropColumn(
                name: "BusinessContractVersionId",
                table: "Sales");

            migrationBuilder.DropColumn(
                name: "BusinessContractVersionId",
                table: "PurchaseInvoices");

            migrationBuilder.DropColumn(
                name: "BusinessContractVersionId",
                table: "PartnerSettlements");

            migrationBuilder.DropColumn(
                name: "BusinessContractVersionId",
                table: "MoneyDocuments");
        }
    }
}
