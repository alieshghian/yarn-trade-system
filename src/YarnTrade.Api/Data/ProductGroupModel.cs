using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Domain;

namespace YarnTrade.Api.Data;

public static class ProductGroupModel
{
    public static void Configure(ModelBuilder builder)
    {
        builder.Entity<YarnItem>().HasOne<ProductGroup>().WithMany().HasForeignKey(x => x.ProductGroupId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<InventoryMovement>().HasIndex(x => x.YarnItemId);
        var node = builder.Entity<ProductGroup>();
        node.ToTable("ProductGroups", t => t.HasCheckConstraint("CK_ProductGroups_Depth", "[Depth] >= 0 AND [Depth] <= 4 AND (([ParentId] IS NULL AND [Depth] = 0) OR ([ParentId] IS NOT NULL AND [Depth] > 0))"));
        node.Property(x => x.Name).HasMaxLength(120).IsRequired();
        node.Property(x => x.NormalizedName).HasMaxLength(240).UseCollation("Latin1_General_100_BIN2").IsRequired();
        node.Property(x => x.RootCode).HasMaxLength(20).IsRequired();
        node.Property(x => x.HierarchyCode).HasMaxLength(104).IsRequired();
        node.Property(x => x.RowVersion).IsRowVersion();
        node.ToTable(t => t.HasCheckConstraint("CK_ProductGroups_LockedDepth", "[LockedDepth] IS NULL OR ([ParentId] IS NULL AND [LockedDepth] BETWEEN 0 AND 4)"));
        node.HasOne(x => x.Parent).WithMany().HasForeignKey(x => x.ParentId).OnDelete(DeleteBehavior.Restrict);
        node.HasIndex(x => new { x.ParentId, x.NormalizedName }).IsUnique().HasFilter("[ParentId] IS NOT NULL AND [IsDeleted] = 0");
        node.HasIndex(x => x.NormalizedName).IsUnique().HasDatabaseName("UX_ProductGroups_RootName").HasFilter("[ParentId] IS NULL AND [IsDeleted] = 0");
        node.HasIndex(x => x.RootCode).IsUnique().HasFilter("[ParentId] IS NULL");
        node.HasIndex(x => x.HierarchyCode).IsUnique();
        node.HasIndex(x => x.RequestId).IsUnique();
        builder.Entity<ProductGroupCounter>().ToTable("ProductGroupCounters");
        builder.Entity<ProductGroupCounter>().Property(x => x.Id).ValueGeneratedNever();
        var policy = builder.Entity<ProductGroupPolicy>();
        policy.ToTable("ProductGroupPolicies", t => t.HasCheckConstraint("CK_ProductGroupPolicies_Depth", "[MaxSubgroups] >= 0 AND [MaxSubgroups] <= 4"));
        policy.Property(x => x.Id).ValueGeneratedNever();
        policy.Property(x => x.RowVersion).IsRowVersion();
    }
}
