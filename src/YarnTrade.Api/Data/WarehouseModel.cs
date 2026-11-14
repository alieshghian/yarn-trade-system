using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Domain;

namespace YarnTrade.Api.Data;

public static class WarehouseModel
{
    public static void Configure(ModelBuilder b)
    {
        var zone = b.Entity<WarehouseZone>();
        zone.Property(x => x.Code).HasMaxLength(60);
        zone.Property(x => x.Name).HasMaxLength(200);
        zone.Property(x => x.NormalizedCode).HasMaxLength(100).UseCollation("Latin1_General_100_BIN2");
        zone.Property(x => x.NormalizedName).HasMaxLength(240).UseCollation("Latin1_General_100_BIN2");
        zone.HasOne<Warehouse>().WithMany().HasForeignKey(x => x.WarehouseId).OnDelete(DeleteBehavior.Restrict);
        zone.HasIndex(x => new { x.WarehouseId, x.NormalizedCode }).IsUnique();
        zone.HasIndex(x => new { x.WarehouseId, x.FloorNumber, x.NormalizedName }).IsUnique();
        zone.HasIndex(x => new { x.WarehouseId, x.FloorNumber }).IsUnique().HasDatabaseName("UX_WarehouseZones_Receiving").HasFilter("[IsDefaultReceiving] = 1");
        b.Entity<Warehouse>().Property(x=>x.FloorCount).HasDefaultValue(1);
        b.Entity<Warehouse>().Property(x=>x.Location).HasMaxLength(7);
        b.Entity<Warehouse>().ToTable("Warehouses",t=>t.HasCheckConstraint("CK_Warehouse_Location","[Location] IS NULL OR [Location] IN (N'inside',N'outside')"));
        zone.Property(x=>x.FloorNumber).HasDefaultValue(1);
        b.Entity<Warehouse>().ToTable("Warehouses",t=>t.HasCheckConstraint("CK_Warehouse_Floors","[FloorCount] BETWEEN 1 AND 5"));
        zone.ToTable("WarehouseZones",t=>t.HasCheckConstraint("CK_WarehouseZone_Floor","[FloorNumber] BETWEEN 1 AND 5"));
        zone.ToTable("WarehouseZones", t => t.HasCheckConstraint("CK_WarehouseZones_ReceivingActive", "[IsDefaultReceiving] = 0 OR [IsActive] = 1"));
        var period = b.Entity<WarehouseCustodianPeriod>();
        period.HasOne<Warehouse>().WithMany().HasForeignKey(x => x.WarehouseId).OnDelete(DeleteBehavior.Restrict);
        period.HasOne<Person>().WithMany().HasForeignKey(x => x.PersonId).OnDelete(DeleteBehavior.Restrict);
        period.HasIndex(x => x.WarehouseId).IsUnique().HasFilter("[EndedAtUtc] IS NULL");
        period.ToTable("WarehouseCustodianPeriods", t => t.HasCheckConstraint("CK_WarehouseCustodianPeriod_Dates", "[EndedAtUtc] IS NULL OR [EndedAtUtc] >= [StartedAtUtc]"));
    }
}
