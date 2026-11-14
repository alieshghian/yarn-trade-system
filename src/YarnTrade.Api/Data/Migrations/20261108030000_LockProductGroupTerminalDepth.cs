using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace YarnTrade.Api.Data.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261108030000_LockProductGroupTerminalDepth")]
public sealed class LockProductGroupTerminalDepth : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<int>("LockedDepth", "ProductGroups", type: "int", nullable: true);
        migrationBuilder.AddCheckConstraint("CK_ProductGroups_LockedDepth", "ProductGroups", "[LockedDepth] IS NULL OR ([ParentId] IS NULL AND [LockedDepth] BETWEEN 0 AND 4)");
        // Refuse ambiguous legacy assignments; never move products or remove branches.
        migrationBuilder.Sql("""
            IF EXISTS (SELECT 1 FROM YarnItems y JOIN ProductGroups g ON g.Id=y.ProductGroupId
              WHERE g.IsDeleted=1 OR g.Depth<>(SELECT MAX(c.Depth) FROM ProductGroups c WHERE c.RootCode=g.RootCode AND c.IsDeleted=0)
                OR EXISTS(SELECT 1 FROM ProductGroups c WHERE c.ParentId=g.Id AND c.IsDeleted=0))
              THROW 51001, 'Existing product group assignments require an explicit audit before depth locking.', 1;
            UPDATE r SET LockedDepth=(SELECT MAX(c.Depth) FROM ProductGroups c WHERE c.RootCode=r.RootCode AND c.IsDeleted=0)
            FROM ProductGroups r WHERE r.ParentId IS NULL AND r.IsDeleted=0 AND EXISTS
              (SELECT 1 FROM YarnItems y JOIN ProductGroups g ON g.Id=y.ProductGroupId WHERE g.RootCode=r.RootCode);
            """);
    }
    protected override void Down(MigrationBuilder migrationBuilder) => throw new NotSupportedException("Terminal depth locks must be preserved.");
}
