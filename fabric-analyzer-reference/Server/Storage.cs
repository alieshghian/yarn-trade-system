using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;

namespace FabricAnalyzer;

public class Fabric { public int Id { get; set; } public string Code { get; set; } = ""; }
public class Yarn
{
    public string? CatalogCode { get; set; }
    public int Id { get; set; }
    public string Data { get; set; } = "";
    public string CreatedBy { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
    public YarnInput Input() => Payload.Read<YarnInput>(Data);
}

public class Analysis
{
    public int Id { get; set; }
    public int FabricId { get; set; }
    public Fabric Fabric { get; set; } = null!;
    public int Version { get; set; }
    public string Data { get; set; } = "";
    public AnalysisStatus Status { get; set; }
    public byte[] RowVersion { get; set; } = [];
    public string UpdatedBy { get; set; } = "";
    public DateTimeOffset UpdatedAt { get; set; }
    public List<WarpRow> Warp { get; set; } = [];
    public List<WeftRow> Weft { get; set; } = [];
    public AnalysisInput Input() => Payload.Read<AnalysisInput>(Data) with {
        Warp = Warp.OrderBy(x => x.Position).Select(x => new WarpInput(x.YarnId, x.Ends, x.Extra)).ToArray(),
        Weft = Weft.OrderBy(x => x.Position).Select(x => new WeftInput(x.YarnId, x.Picks, x.MeasuredPickCm)).ToArray()
    };
    public void SetInput(AnalysisInput input)
    {
        Data = Payload.Write(input with { Warp = [], Weft = [], Reason = null, RowVersion = null });
        Warp = input.Warp.Select((w, i) => new WarpRow { Position = i + 1, YarnId = w.YarnId, Ends = w.Ends, Extra = w.Extra }).ToList();
        Weft = input.Weft.Select((w, i) => new WeftRow { Position = i + 1, YarnId = w.YarnId, Picks = w.Picks, MeasuredPickCm = w.MeasuredPickCm }).ToList();
    }
    public void Touch(string user)
    {
        UpdatedBy = user;
        UpdatedAt = DateTimeOffset.UtcNow;
    }
    public void Match(string? version)
    {
        if (version != Convert.ToBase64String(RowVersion)) throw new Conflict("رکورد هم‌زمان تغییر کرده است. دوباره آن را باز کنید.");
    }
}

public class WarpRow
{
    public int Id { get; set; }
    public int AnalysisId { get; set; }
    public int Position { get; set; }
    public int YarnId { get; set; }
    public int? Ends { get; set; }
    public decimal Extra { get; set; }
}
public class WeftRow
{
    public int Id { get; set; }
    public int AnalysisId { get; set; }
    public int Position { get; set; }
    public int YarnId { get; set; }
    public int Picks { get; set; }
    public decimal? MeasuredPickCm { get; set; }
}

public class Trial
{
    public int Id { get; set; }
    public int AnalysisId { get; set; }
    public string Number { get; set; } = "";
    public bool Preparation { get; set; }
    public int? ReplacesId { get; set; }
    public int? PreparationId { get; set; }
    public string Data { get; set; } = "";
    public string User { get; set; } = "";
    public DateTimeOffset At { get; set; }
    public List<Weighing> Weighings { get; set; } = [];
    public SavedValidation? Validation { get; set; }
    public TrialInput Input() => Payload.Read<TrialInput>(Data) with {
        Weighings = Weighings.OrderBy(w => w.Id).Select(w => new WeighInput(w.Axis, w.YarnId, w.Package, w.InitialG,
            w.RemainingG, w.Gross, w.InitialTareG, w.RemainingTareG, w.Waste?.Grams, w.Notes, w.Beam)).ToArray()
    };
}

public class Weighing
{
    public int Id { get; set; }
    public int TrialId { get; set; }
    public Axis Axis { get; set; }
    public Beam? Beam { get; set; }
    public int YarnId { get; set; }
    public string Package { get; set; } = "";
    public decimal InitialG { get; set; }
    public decimal? RemainingG { get; set; }
    public bool Gross { get; set; }
    public decimal InitialTareG { get; set; }
    public decimal RemainingTareG { get; set; }
    public string? Notes { get; set; }
    public Waste? Waste { get; set; }
    public static Weighing From(WeighInput w) => new() {
        Axis = w.Axis, YarnId = w.YarnId, Beam = w.Beam, Package = w.Package.Trim(), InitialG = w.InitialG, RemainingG = w.RemainingG,
        Gross = w.Gross, InitialTareG = w.InitialTareG, RemainingTareG = w.RemainingTareG,
        Notes = w.Notes, Waste = w.WasteG.HasValue ? new Waste { Grams = w.WasteG.Value } : null
    };
}

public class Waste { public int WeighingId { get; set; } public decimal Grams { get; set; } }
public class SavedValidation { public int TrialId { get; set; } public string Data { get; set; } = ""; }
public class History
{
    public int Id { get; set; }
    public int AnalysisId { get; set; }
    public string Action { get; set; } = "";
    public string User { get; set; } = "";
    public DateTimeOffset At { get; set; }
    public string? Reason { get; set; }
    public string? Data { get; set; }
}
public class Account
{
    public int Id { get; set; }
    public string User { get; set; } = "";
    public string Name { get; set; } = "";
    public string Hash { get; set; } = "";
    public Role Role { get; set; }
    public bool Enabled { get; set; } = true;
    public string Stamp { get; set; } = Guid.NewGuid().ToString();
}
public class Settings
{
    public int Id { get; set; }
    public decimal Tolerance { get; set; } = 5;
    public int MaxWeftCycleSlots { get; set; } = TextileRules.DefaultSlots;
}
public class SettingRevision
{
    public int Id { get; set; }
    public decimal Tolerance { get; set; }
    public int MaxWeftCycleSlots { get; set; }
    public string User { get; set; } = "";
    public DateTimeOffset At { get; set; }
    public string Reason { get; set; } = "";
}
public static class Payload
{
    private static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web) {
        Converters = { new JsonStringEnumConverter(allowIntegerValues: false) }
    };
    public static string Write<T>(T value) => JsonSerializer.Serialize(value, Options);
    public static T Read<T>(string value) => JsonSerializer.Deserialize<T>(value, Options)!;
}

public class Store(DbContextOptions<Store> options) : DbContext(options)
{
    public DbSet<Fabric> Fabrics => Set<Fabric>();
    public DbSet<Yarn> Yarns => Set<Yarn>();
    public DbSet<Analysis> FabricAnalysisVersions => Set<Analysis>();
    public DbSet<Trial> ProductionTests => Set<Trial>();
    public DbSet<History> ApprovalHistory => Set<History>();
    public DbSet<Account> Users => Set<Account>();
    public DbSet<Settings> Settings => Set<Settings>();
    public DbSet<SettingRevision> SettingRevisions => Set<SettingRevision>();
    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Fabric>().Property(x => x.Code).HasMaxLength(80);
        b.Entity<Fabric>().HasIndex(x => x.Code).IsUnique();
        b.Entity<Yarn>().Property(x => x.CatalogCode).HasMaxLength(80);
        b.Entity<Yarn>().HasIndex(x => x.CatalogCode).IsUnique().HasFilter("[CatalogCode] IS NOT NULL");
        var analysis = b.Entity<Analysis>();
        analysis.Property(x => x.RowVersion).IsRowVersion();
        analysis.HasIndex(x => new { x.FabricId, x.Version }).IsUnique();
        analysis.HasIndex(x => x.FabricId).IsUnique().HasFilter("[Status] = 3");
        analysis.ToTable("FabricAnalysisVersions", t => t.HasCheckConstraint("CK_Analysis_Version", "[Version] > 0 AND [Status] BETWEEN 0 AND 4"));
        analysis.HasMany(x => x.Warp).WithOne().HasForeignKey(x => x.AnalysisId);
        analysis.HasMany(x => x.Weft).WithOne().HasForeignKey(x => x.AnalysisId);
        b.Entity<WarpRow>().ToTable("WarpYarns", t => t.HasCheckConstraint("CK_Warp_Ends", "[Ends] IS NULL OR [Ends] > 0"));
        b.Entity<WeftRow>().ToTable("WeftCycleSteps", t => t.HasCheckConstraint("CK_Weft_Picks", "[Picks] BETWEEN 1 AND 500"));
        b.Entity<WarpRow>().HasOne<Yarn>().WithMany().HasForeignKey(x => x.YarnId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<WeftRow>().HasOne<Yarn>().WithMany().HasForeignKey(x => x.YarnId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<Trial>().HasOne<Analysis>().WithMany().HasForeignKey(x => x.AnalysisId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<Trial>().HasOne<Trial>().WithMany().HasForeignKey(x => x.ReplacesId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<Trial>().HasOne<Trial>().WithMany().HasForeignKey(x => x.PreparationId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<Trial>().HasIndex(x => x.ReplacesId).IsUnique().HasFilter("[ReplacesId] IS NOT NULL");
        b.Entity<Trial>().Property(x => x.Number).HasMaxLength(80);
        b.Entity<Trial>().HasIndex(x => new { x.AnalysisId, x.Number }).IsUnique()
            .HasFilter("[ReplacesId] IS NULL AND [PreparationId] IS NULL");
        b.Entity<Trial>().HasIndex(x => x.PreparationId).IsUnique().HasFilter("[PreparationId] IS NOT NULL AND [ReplacesId] IS NULL");
        b.Entity<Trial>().HasOne(x => x.Validation).WithOne().HasForeignKey<SavedValidation>(x => x.TrialId);
        b.Entity<Trial>().HasMany(x => x.Weighings).WithOne().HasForeignKey(x => x.TrialId);
        b.Entity<Weighing>().HasOne<Yarn>().WithMany().HasForeignKey(x => x.YarnId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<Weighing>().HasOne(x => x.Waste).WithOne().HasForeignKey<Waste>(x => x.WeighingId);
        b.Entity<Weighing>().Property(x => x.Package).HasMaxLength(100);
        b.Entity<Weighing>().HasIndex(x => new { x.TrialId, x.Axis, x.YarnId, x.Package }).IsUnique();
        b.Entity<Weighing>().ToTable("YarnWeighings", t => t.HasCheckConstraint("CK_Weigh_Net",
            "[Axis] IN (0,1) AND [InitialTareG] >= 0 AND [RemainingTareG] >= 0 AND [InitialG] > [InitialTareG] AND " +
            "([Gross] = 1 OR ([InitialTareG] = 0 AND [RemainingTareG] = 0)) AND " +
            "(([RemainingG] IS NULL AND [RemainingTareG] = 0) OR ([RemainingG] >= [RemainingTareG] AND [RemainingG] - [RemainingTareG] <= [InitialG] - [InitialTareG]))"));
        b.Entity<Waste>().HasKey(x => x.WeighingId);
        b.Entity<Waste>().ToTable("WasteMeasurements", t => t.HasCheckConstraint("CK_Waste_Grams", "[Grams] >= 0"));
        b.Entity<SavedValidation>().HasKey(x => x.TrialId);
        b.Entity<SavedValidation>().ToTable("AnalysisValidations");
        b.Entity<History>().HasOne<Analysis>().WithMany().HasForeignKey(x => x.AnalysisId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<Account>().Property(x => x.User).HasMaxLength(80);
        b.Entity<Account>().HasIndex(x => x.User).IsUnique();
        b.Entity<Settings>().Property(x => x.MaxWeftCycleSlots).HasDefaultValue(TextileRules.DefaultSlots);
        b.Entity<Settings>().HasData(new Settings { Id = 1 });
        b.Entity<Settings>().ToTable("Settings", t => t.HasCheckConstraint("CK_Settings_Tolerance", "[Tolerance] BETWEEN 0 AND 100"));
        foreach (var property in b.Model.GetEntityTypes().SelectMany(e => e.GetProperties())
            .Where(p => p.ClrType == typeof(decimal) || p.ClrType == typeof(decimal?)))
        {
            property.SetPrecision(24);
            property.SetScale(10);
        }
    }
    public Task<bool> Upgrade() => Write(async () => {
        using var stream = typeof(Store).Assembly.GetManifestResourceStream("FabricAnalyzer.SchemaV2.sql")
            ?? throw new InvalidOperationException("Schema migration is missing.");
        using var reader = new StreamReader(stream);
        await Database.ExecuteSqlRawAsync(await reader.ReadToEndAsync());
        return true;
    });

    public IQueryable<Analysis> Versions() => FabricAnalysisVersions.Include(x => x.Fabric)
        .Include(x => x.Warp).Include(x => x.Weft).AsSplitQuery();
    public IQueryable<Trial> Tests(int id) => ProductionTests.Where(t => t.AnalysisId == id)
        .Include(t => t.Weighings).ThenInclude(w => w.Waste).Include(t => t.Validation).AsSplitQuery();
    public async Task<Dictionary<int, decimal>> TexFor(AnalysisInput a)
    {
        Calc.Require(a.Warp is not null && a.Weft is not null && a.Warp.All(w => w is not null) && a.Weft.All(w => w is not null), "جدول تار و پود را وارد کنید.");
        var warp = a.Beams is null ? a.Warp! : TextileRules.Allocate(a.Beams);
        var ids = warp.Select(w => w.YarnId).Concat(a.Weft!.Select(w => w.YarnId)).Distinct().ToArray();
        return await Yarns.Where(y => ids.Contains(y.Id)).ToDictionaryAsync(y => y.Id, y => Calc.Tex(y.Input()));
    }
    public async Task<T> Write<T>(Func<Task<T>> action)
    {
        await using var tx = await Database.BeginTransactionAsync();
        await Database.ExecuteSqlRawAsync("""
            DECLARE @result int;
            EXEC @result = sys.sp_getapplock @Resource='FabricAnalyzer.Write', @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=8000;
            IF @result < 0 THROW 51000, 'Fabric Analyzer write lock unavailable.', 1;
            """);
        var result = await action();
        await SaveChangesAsync();
        await tx.CommitAsync();
        return result;
    }
}
