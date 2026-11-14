using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Domain;
namespace YarnTrade.Api.Data;

internal static class YarnDefinitionModel
{
    internal static void Configure(ModelBuilder b)
    {
        foreach(var name in new[]{"Luster","UnitOfMeasure","FixStatus","Material","SpinType","SpinningMethod","ContinuityType","CountType","TwistType"})
            b.Entity<YarnItem>().Property<string>(name).HasMaxLength(120);
        var state = b.Entity<YarnDefinitionState>();
        state.ToTable("YarnDefinitionStates"); state.HasKey(x => x.YarnId);
        state.Property(x=>x.ReleaseId).HasMaxLength(36);
        state.Property(x=>x.NormalizedName).HasMaxLength(240).UseCollation("Latin1_General_100_BIN2");
        state.HasIndex(x=>x.NormalizedName).IsUnique();
        state.HasOne<YarnItem>().WithOne().HasForeignKey<YarnDefinitionState>(x=>x.YarnId).OnDelete(DeleteBehavior.Restrict);
        var color=b.Entity<YarnColor>(); color.ToTable("YarnColors"); color.HasKey(x=>x.Id);
        color.Property(x=>x.Value).HasMaxLength(120); color.Property(x=>x.NormalizedValue).HasMaxLength(240).UseCollation("Latin1_General_100_BIN2");
        color.HasIndex(x=>new{x.YarnId,x.NormalizedValue}).IsUnique();
        color.HasIndex(x=>x.YarnId).IsUnique().HasFilter("[IsDefault] = 1");
        color.HasOne<YarnItem>().WithMany().HasForeignKey(x=>x.YarnId).OnDelete(DeleteBehavior.Restrict);
        var reference=b.Entity<YarnDefinitionReference>(); reference.ToTable("YarnDefinitionReferences");
        reference.Property(x=>x.FieldId).HasMaxLength(100); reference.Property(x=>x.Name).HasMaxLength(120);
        reference.Property(x=>x.NormalizedName).HasMaxLength(240).UseCollation("Latin1_General_100_BIN2");
        reference.HasIndex(x=>new{x.FieldId,x.NormalizedName}).IsUnique(); reference.Property(x=>x.RowVersion).IsRowVersion();
        var volume=b.Entity<YarnPackagingCoefficient>(); volume.ToTable("YarnPackagingCoefficients",t=>t.HasCheckConstraint("CK_YarnPackagingCoefficients_Positive","[CbmPerTon] > 0")); volume.HasKey(x=>x.Id);
        volume.HasIndex(x=>new{x.YarnId,x.PackagingId}).IsUnique();
        volume.HasIndex(x=>x.YarnId).IsUnique().HasFilter("[IsDefault] = 1");
        volume.HasOne<YarnItem>().WithMany().HasForeignKey(x=>x.YarnId).OnDelete(DeleteBehavior.Restrict);
        volume.HasOne<YarnDefinitionReference>().WithMany().HasForeignKey(x=>x.PackagingId).OnDelete(DeleteBehavior.Restrict);
    }
}
