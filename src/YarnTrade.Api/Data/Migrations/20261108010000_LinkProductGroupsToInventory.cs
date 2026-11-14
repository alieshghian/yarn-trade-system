using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace YarnTrade.Api.Data.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261108010000_LinkProductGroupsToInventory")]
public sealed class LinkProductGroupsToInventory : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<Guid>("ProductGroupId", "YarnItems", type: "uniqueidentifier", nullable: true);
        migrationBuilder.CreateIndex("IX_YarnItems_ProductGroupId", "YarnItems", "ProductGroupId");
        migrationBuilder.AddForeignKey("FK_YarnItems_ProductGroups_ProductGroupId", "YarnItems", "ProductGroupId", "ProductGroups", principalColumn: "Id", onDelete: ReferentialAction.Restrict);
        migrationBuilder.CreateIndex("IX_InventoryMovements_YarnItemId", "InventoryMovements", "YarnItemId");
        // Owner explicitly retired the legacy textual grouping. Refuse to discard
        // assignments if another user populated it after the preflight/backup.
        migrationBuilder.Sql("IF EXISTS (SELECT 1 FROM [YarnItems] WHERE NULLIF(LTRIM(RTRIM([YarnGroup])),N'') IS NOT NULL) THROW 51001, N'Legacy group assignments require explicit migration before removal.', 1;");
        migrationBuilder.DropColumn("YarnGroup", "YarnItems");
    }
    protected override void Down(MigrationBuilder migrationBuilder) => throw new NotSupportedException("Product group assignments must be retained; destructive rollback is disabled.");
}
