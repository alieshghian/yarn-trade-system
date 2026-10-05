using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace YarnTrade.Api.Data.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260727120000_AddPurchaseOrders")]
public sealed class AddPurchaseOrders : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "PurchaseOrders",
            columns: table => new
            {
                Id = table.Column<Guid>("uniqueidentifier", nullable: false),
                OrderNumber = table.Column<string>("nvarchar(30)", maxLength: 30, nullable: false),
                OrderDate = table.Column<DateOnly>("date", nullable: false),
                RequiredByDate = table.Column<DateOnly>("date", nullable: true),
                Priority = table.Column<int>("int", nullable: false),
                Currency = table.Column<int>("int", nullable: false),
                PreferredSupplierId = table.Column<Guid>("uniqueidentifier", nullable: true),
                RequestedByUserId = table.Column<Guid>("uniqueidentifier", nullable: false),
                Status = table.Column<int>("int", nullable: false),
                Notes = table.Column<string>("nvarchar(1000)", maxLength: 1000, nullable: true),
                SubmittedAtUtc = table.Column<DateTime>("datetime2", nullable: true),
                CommerceStartedAtUtc = table.Column<DateTime>("datetime2", nullable: true),
                CompletedAtUtc = table.Column<DateTime>("datetime2", nullable: true),
                CreatedAtUtc = table.Column<DateTime>("datetime2", nullable: false),
                UpdatedAtUtc = table.Column<DateTime>("datetime2", nullable: true),
                RowVersion = table.Column<byte[]>("varbinary(max)", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_PurchaseOrders", x => x.Id);
                table.ForeignKey("FK_PurchaseOrders_AspNetUsers_RequestedByUserId", x => x.RequestedByUserId, "AspNetUsers", "Id", onDelete: ReferentialAction.Restrict);
                table.ForeignKey("FK_PurchaseOrders_Persons_PreferredSupplierId", x => x.PreferredSupplierId, "Persons", "Id", onDelete: ReferentialAction.Restrict);
            });

        migrationBuilder.CreateTable(
            name: "PurchaseOrderItems",
            columns: table => new
            {
                Id = table.Column<Guid>("uniqueidentifier", nullable: false),
                PurchaseOrderId = table.Column<Guid>("uniqueidentifier", nullable: false),
                LineNumber = table.Column<int>("int", nullable: false),
                YarnItemId = table.Column<Guid>("uniqueidentifier", nullable: false),
                DescriptionSnapshot = table.Column<string>("nvarchar(600)", maxLength: 600, nullable: false),
                Quantity = table.Column<decimal>("decimal(20,6)", precision: 20, scale: 6, nullable: false),
                Unit = table.Column<string>("nvarchar(20)", maxLength: 20, nullable: false),
                EstimatedUnitPrice = table.Column<decimal>("decimal(20,6)", precision: 20, scale: 6, nullable: true),
                EstimatedAmount = table.Column<decimal>("decimal(20,6)", precision: 20, scale: 6, nullable: true),
                RequiredSpecifications = table.Column<string>("nvarchar(1000)", maxLength: 1000, nullable: true),
                Notes = table.Column<string>("nvarchar(1000)", maxLength: 1000, nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_PurchaseOrderItems", x => x.Id);
                table.ForeignKey("FK_PurchaseOrderItems_PurchaseOrders_PurchaseOrderId", x => x.PurchaseOrderId, "PurchaseOrders", "Id", onDelete: ReferentialAction.Cascade);
                table.ForeignKey("FK_PurchaseOrderItems_YarnItems_YarnItemId", x => x.YarnItemId, "YarnItems", "Id", onDelete: ReferentialAction.Restrict);
            });

        migrationBuilder.AddColumn<Guid>("PurchaseOrderId", "PurchaseInvoices", "uniqueidentifier", nullable: true);
        migrationBuilder.CreateIndex("IX_PurchaseOrders_OrderNumber", "PurchaseOrders", "OrderNumber", unique: true);
        migrationBuilder.CreateIndex("IX_PurchaseOrders_Status_OrderDate", "PurchaseOrders", new[] { "Status", "OrderDate" });
        migrationBuilder.CreateIndex("IX_PurchaseOrders_PreferredSupplierId", "PurchaseOrders", "PreferredSupplierId");
        migrationBuilder.CreateIndex("IX_PurchaseOrders_RequestedByUserId", "PurchaseOrders", "RequestedByUserId");
        migrationBuilder.CreateIndex("IX_PurchaseOrderItems_PurchaseOrderId", "PurchaseOrderItems", "PurchaseOrderId");
        migrationBuilder.CreateIndex("IX_PurchaseOrderItems_YarnItemId", "PurchaseOrderItems", "YarnItemId");
        migrationBuilder.CreateIndex("IX_PurchaseInvoices_PurchaseOrderId", "PurchaseInvoices", "PurchaseOrderId");
        migrationBuilder.AddForeignKey("FK_PurchaseInvoices_PurchaseOrders_PurchaseOrderId", "PurchaseInvoices", "PurchaseOrderId", "PurchaseOrders", principalColumn: "Id", onDelete: ReferentialAction.Restrict);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropForeignKey("FK_PurchaseInvoices_PurchaseOrders_PurchaseOrderId", "PurchaseInvoices");
        migrationBuilder.DropIndex("IX_PurchaseInvoices_PurchaseOrderId", "PurchaseInvoices");
        migrationBuilder.DropColumn("PurchaseOrderId", "PurchaseInvoices");
        migrationBuilder.DropTable("PurchaseOrderItems");
        migrationBuilder.DropTable("PurchaseOrders");
    }
}
