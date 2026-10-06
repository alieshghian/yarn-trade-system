using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace YarnTrade.Api.Data.Migrations;

public partial class FixSqlRowVersionConcurrency : Migration
{
    private static readonly string[] Tables =
    [
        "YarnTypes",
        "YarnItems",
        "Warehouses",
        "Sales",
        "PurchaseOrders",
        "PurchaseInvoices",
        "PurchaseCosts",
        "PriceLists",
        "Persons",
        "PartnerShareRules",
        "PartnerSettlements",
        "ParameterValues",
        "MoneyDocuments",
        "ExchangeRates",
        "CreditRateRules",
        "Checks",
    ];

    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // SQL Server cannot ALTER varbinary into rowversion. Replace only the non-semantic token column.
        // Existing business rows/columns, keys, relationships and indexes are preserved.
        foreach (var table in Tables)
        {
            migrationBuilder.DropColumn(name: "RowVersion", table: table);
            migrationBuilder.AddColumn<byte[]>(name: "RowVersion", table: table, type: "rowversion", rowVersion: true, nullable: false);
        }
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Rollback regenerates legacy placeholder tokens, retaining every business row.
        foreach (var table in Tables)
        {
            migrationBuilder.DropColumn(name: "RowVersion", table: table);
            migrationBuilder.AddColumn<byte[]>(name: "RowVersion", table: table, type: "varbinary(max)", nullable: false, defaultValue: System.Array.Empty<byte>());
        }
    }
}
