using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace YarnTrade.Api.Data.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261108000000_AddProductGroups")]
public sealed class AddProductGroups : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable("ProductGroupCounters", columns: table => new {
            Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
            LastValue = table.Column<long>(type: "bigint", nullable: false)
        }, constraints: table => table.PrimaryKey("PK_ProductGroupCounters", x => x.Id));
        migrationBuilder.CreateTable("ProductGroupPolicies", columns: table => new {
            Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
            MaxSubgroups = table.Column<int>(type: "int", nullable: false),
            CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
            UpdatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
            RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
        }, constraints: table => { table.PrimaryKey("PK_ProductGroupPolicies", x => x.Id); table.CheckConstraint("CK_ProductGroupPolicies_Depth", "[MaxSubgroups] >= 0 AND [MaxSubgroups] <= 4"); });
        migrationBuilder.CreateTable("ProductGroups", columns: table => new {
            Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
            ParentId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
            Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
            NormalizedName = table.Column<string>(type: "nvarchar(240)", maxLength: 240, collation: "Latin1_General_100_BIN2", nullable: false),
            RootCode = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
            HierarchyCode = table.Column<string>(type: "nvarchar(104)", maxLength: 104, nullable: false),
            Depth = table.Column<int>(type: "int", nullable: false),
            RequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
            IsDeleted = table.Column<bool>(type: "bit", nullable: false),
            CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
            UpdatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
            RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
        }, constraints: table => {
            table.PrimaryKey("PK_ProductGroups", x => x.Id);
            table.ForeignKey("FK_ProductGroups_ProductGroups_ParentId", x => x.ParentId, "ProductGroups", "Id", onDelete: ReferentialAction.Restrict);
            table.CheckConstraint("CK_ProductGroups_Depth", "[Depth] >= 0 AND [Depth] <= 4 AND (([ParentId] IS NULL AND [Depth] = 0) OR ([ParentId] IS NOT NULL AND [Depth] > 0))");
        });
        migrationBuilder.CreateIndex("IX_ProductGroups_ParentId_NormalizedName", "ProductGroups", new[] { "ParentId", "NormalizedName" }, unique: true, filter: "[ParentId] IS NOT NULL AND [IsDeleted] = 0");
        migrationBuilder.CreateIndex("UX_ProductGroups_RootName", "ProductGroups", "NormalizedName", unique: true, filter: "[ParentId] IS NULL AND [IsDeleted] = 0");
        migrationBuilder.CreateIndex("IX_ProductGroups_RootCode", "ProductGroups", "RootCode", unique: true, filter: "[ParentId] IS NULL");
        migrationBuilder.CreateIndex("IX_ProductGroups_HierarchyCode", "ProductGroups", "HierarchyCode", unique: true);
        migrationBuilder.CreateIndex("IX_ProductGroups_RequestId", "ProductGroups", "RequestId", unique: true);
        // Configuration only. No group, example or selection is seeded.
        migrationBuilder.Sql("INSERT INTO [ProductGroupPolicies] ([Id],[MaxSubgroups],[CreatedAtUtc]) VALUES ('831b871c-f08d-4cb9-bfdd-4cf538172208',4,SYSUTCDATETIME());");
    }
    protected override void Down(MigrationBuilder migrationBuilder) => throw new NotSupportedException("Product Group rollback must retain operational data. Restore a verified backup; automatic table deletion is disabled.");
}
