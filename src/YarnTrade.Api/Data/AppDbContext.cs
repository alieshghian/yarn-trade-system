using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using YarnTrade.Api.Domain;

namespace YarnTrade.Api.Data;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options)
    : IdentityDbContext<AppUser, IdentityRole<Guid>, Guid>(options)
{
    public DbSet<Person> Persons => Set<Person>();
    public DbSet<UserPermission> UserPermissions => Set<UserPermission>();
    public DbSet<UserTaskState> UserTaskStates => Set<UserTaskState>();
    public DbSet<RoleTaskSetting> RoleTaskSettings => Set<RoleTaskSetting>();
    public DbSet<UserSession> UserSessions => Set<UserSession>();
    public DbSet<MaintenanceNotice> MaintenanceNotices => Set<MaintenanceNotice>();
    public DbSet<PersonRole> PersonRoles => Set<PersonRole>();
    public DbSet<ParameterValue> ParameterValues => Set<ParameterValue>();
    public DbSet<YarnType> YarnTypes => Set<YarnType>();
    public DbSet<YarnItem> YarnItems => Set<YarnItem>();
    public DbSet<Warehouse> Warehouses => Set<Warehouse>();
    public DbSet<ExchangeRate> ExchangeRates => Set<ExchangeRate>();
    public DbSet<PurchaseOrder> PurchaseOrders => Set<PurchaseOrder>();
    public DbSet<PurchaseOrderItem> PurchaseOrderItems => Set<PurchaseOrderItem>();
    public DbSet<PurchaseInvoice> PurchaseInvoices => Set<PurchaseInvoice>();
    public DbSet<PurchaseInvoiceItem> PurchaseInvoiceItems => Set<PurchaseInvoiceItem>();
    public DbSet<PurchaseContainer> PurchaseContainers => Set<PurchaseContainer>();
    public DbSet<PurchaseItemContainer> PurchaseItemContainers => Set<PurchaseItemContainer>();
    public DbSet<PurchaseCost> PurchaseCosts => Set<PurchaseCost>();
    public DbSet<PurchaseCostAllocation> PurchaseCostAllocations => Set<PurchaseCostAllocation>();
    public DbSet<InventoryMovement> InventoryMovements => Set<InventoryMovement>();
    public DbSet<InventoryLayer> InventoryLayers => Set<InventoryLayer>();
    public DbSet<PriceList> PriceLists => Set<PriceList>();
    public DbSet<PriceListItem> PriceListItems => Set<PriceListItem>();
    public DbSet<CreditRateRule> CreditRateRules => Set<CreditRateRule>();
    public DbSet<Sale> Sales => Set<Sale>();
    public DbSet<SaleItem> SaleItems => Set<SaleItem>();
    public DbSet<SalePaymentSchedule> SalePaymentSchedules => Set<SalePaymentSchedule>();
    public DbSet<SaleCostAllocation> SaleCostAllocations => Set<SaleCostAllocation>();
    public DbSet<MoneyDocument> MoneyDocuments => Set<MoneyDocument>();
    public DbSet<MoneyDocumentLine> MoneyDocumentLines => Set<MoneyDocumentLine>();
    public DbSet<Check> Checks => Set<Check>();
    public DbSet<CheckOperation> CheckOperations => Set<CheckOperation>();
    public DbSet<PartnerShareRule> PartnerShareRules => Set<PartnerShareRule>();
    public DbSet<PartnerLedgerEntry> PartnerLedgerEntries => Set<PartnerLedgerEntry>();
    public DbSet<PartnerSettlement> PartnerSettlements => Set<PartnerSettlement>();
    public DbSet<PartnerSettlementAllocation> PartnerSettlementAllocations => Set<PartnerSettlementAllocation>();
    public DbSet<PartnerAdvanceAllocation> PartnerAdvanceAllocations => Set<PartnerAdvanceAllocation>();
    public DbSet<Attachment> Attachments => Set<Attachment>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<SystemSetting> SystemSettings => Set<SystemSetting>();
    public DbSet<BusinessContractVersion> BusinessContractVersions => Set<BusinessContractVersion>();
    public DbSet<Investor> Investors => Set<Investor>();
    public DbSet<InvestorBalance> InvestorBalances => Set<InvestorBalance>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        foreach (var property in builder.Model.GetEntityTypes().SelectMany(x => x.GetProperties()))
        {
            if (property.ClrType == typeof(decimal) || property.ClrType == typeof(decimal?))
            {
                var name = property.Name.ToLowerInvariant();
                property.SetPrecision(name.Contains("percent") ? 12 : name.Contains("weight") || name.Contains("quantity") ? 20 : 20);
                property.SetScale(name.Contains("percent") ? 8 : name.Contains("irr") ? 2 : 6);
            }
        }

        foreach (var fk in builder.Model.GetEntityTypes().SelectMany(x => x.GetForeignKeys()))
            fk.DeleteBehavior = DeleteBehavior.Restrict;

        foreach (var type in builder.Model.GetEntityTypes().Where(x => typeof(AuditedEntity).IsAssignableFrom(x.ClrType)))
        {
            builder.Entity(type.ClrType).Property(nameof(AuditedEntity.RowVersion)).IsRowVersion();
        }

        builder.Entity<Person>().HasIndex(x => x.PersonCode).IsUnique();
        builder.Entity<Person>().Property(x => x.DirectorName).HasMaxLength(200);
        builder.Entity<AppUser>().HasIndex(x => x.PersonId).IsUnique().HasFilter("[PersonId] IS NOT NULL");
        builder.Entity<AppUser>().Property(x => x.PreferredLanguage).HasMaxLength(2);
        builder.Entity<AppUser>().Property(x => x.Theme).HasMaxLength(20);
        builder.Entity<AppUser>().Property(x => x.FontFamily).HasMaxLength(20);
        builder.Entity<AppUser>().Property(x => x.FontSize).HasMaxLength(10);
        builder.Entity<AppUser>().HasOne(x => x.Person).WithOne().HasForeignKey<AppUser>(x => x.PersonId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<AppUser>().HasMany(x => x.Permissions).WithOne(x => x.User).HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        builder.Entity<UserPermission>().HasIndex(x => new { x.UserId, x.PermissionKey }).IsUnique();
        builder.Entity<UserPermission>().Property(x => x.PermissionKey).HasMaxLength(80);
        builder.Entity<UserTaskState>().HasIndex(x => new { x.UserId, x.WorkItemKey }).IsUnique();
        builder.Entity<UserTaskState>().Property(x => x.WorkItemKey).HasMaxLength(150);
        builder.Entity<UserTaskState>().HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        builder.Entity<RoleTaskSetting>().HasIndex(x => new { x.RoleName, x.TaskCategory }).IsUnique();
        builder.Entity<RoleTaskSetting>().Property(x => x.RoleName).HasMaxLength(80);
        builder.Entity<RoleTaskSetting>().Property(x => x.TaskCategory).HasMaxLength(80);
        builder.Entity<UserSession>().HasIndex(x => x.UserId).IsUnique();
        builder.Entity<UserSession>().HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        builder.Entity<MaintenanceNotice>().Property(x => x.RequesterName).HasMaxLength(250);
        builder.Entity<MaintenanceNotice>().Property(x => x.RequesterRoles).HasMaxLength(500);
        builder.Entity<MaintenanceNotice>().Property(x => x.Operation).HasMaxLength(20);
        builder.Entity<MaintenanceNotice>().Property(x => x.Reason).HasMaxLength(500);
        builder.Entity<MaintenanceNotice>().HasIndex(x => x.ExpiresAtUtc);
        builder.Entity<Person>().Property(x => x.PersonCode).HasMaxLength(30);
        builder.Entity<Person>().Property(x => x.PreferredLanguage).HasMaxLength(2);
        builder.Entity<Person>().Property(x => x.FirstName).HasMaxLength(100);
        builder.Entity<Person>().Property(x => x.LastName).HasMaxLength(100);
        builder.Entity<Person>().Property(x => x.CompanyName).HasMaxLength(200);
        builder.Entity<Person>().Property(x => x.DisplayName).HasMaxLength(250);
        builder.Entity<Person>().HasIndex(x => x.AccountingCode).IsUnique().HasFilter("[AccountingCode] IS NOT NULL");
        builder.Entity<Person>().HasIndex(x => x.DisplayName);
        builder.Entity<PersonRole>().HasIndex(x => new { x.PersonId, x.Role }).IsUnique();
        builder.Entity<ParameterValue>().HasIndex(x => new { x.ParameterType, x.Code }).IsUnique();
        builder.Entity<ParameterValue>().HasIndex(x => new { x.ParameterType, x.SortOrder });
        builder.Entity<ParameterValue>().Property(x => x.Code).HasMaxLength(30);
        builder.Entity<ParameterValue>().Property(x => x.NameFa).HasMaxLength(100);
        builder.Entity<ParameterValue>().Property(x => x.NameEn).HasMaxLength(100);
        builder.Entity<YarnType>().HasIndex(x => x.Code).IsUnique();
        builder.Entity<YarnItem>().HasIndex(x => x.Code).IsUnique();
        builder.Entity<YarnItem>().HasIndex(x => x.SearchText);
        builder.Entity<YarnItem>().HasIndex(x => x.ComprehensiveName);
        builder.Entity<YarnItem>().Property(x => x.Code).HasMaxLength(50);
        builder.Entity<YarnItem>().Property(x => x.NameFa).HasMaxLength(200);
        builder.Entity<YarnItem>().Property(x => x.NameEn).HasMaxLength(200);
        builder.Entity<YarnItem>().Property(x => x.ComprehensiveName).HasMaxLength(600);
        builder.Entity<YarnItem>().Property(x => x.UnitOfMeasure).HasMaxLength(20);
        builder.Entity<YarnItem>().Property(x => x.YarnGroup).HasMaxLength(30);
        builder.Entity<YarnItem>().Property(x => x.Luster).HasMaxLength(30);
        builder.Entity<YarnItem>().Property(x => x.FixStatus).HasMaxLength(30);
        builder.Entity<YarnItem>().Property(x => x.Material).HasMaxLength(30);
        builder.Entity<YarnItem>().Property(x => x.SpinType).HasMaxLength(30);
        builder.Entity<YarnItem>().Property(x => x.SpinningMethod).HasMaxLength(30);
        builder.Entity<YarnItem>().Property(x => x.ContinuityType).HasMaxLength(30);
        builder.Entity<YarnItem>().Property(x => x.CountType).HasMaxLength(20);
        builder.Entity<YarnItem>().Property(x => x.TwistType).HasMaxLength(10);
        builder.Entity<Warehouse>().HasIndex(x => x.Code).IsUnique();
        builder.Entity<ExchangeRate>().HasIndex(x => new { x.RateDate, x.FromCurrency, x.ToCurrency }).IsUnique();
        builder.Entity<PurchaseOrder>().HasIndex(x => x.OrderNumber).IsUnique();
        builder.Entity<PurchaseOrder>().HasIndex(x => new { x.Status, x.OrderDate });
        builder.Entity<PurchaseOrder>().Property(x => x.OrderNumber).HasMaxLength(30);
        builder.Entity<PurchaseOrder>().Property(x => x.Notes).HasMaxLength(1000);
        builder.Entity<PurchaseOrderItem>().Property(x => x.DescriptionSnapshot).HasMaxLength(600);
        builder.Entity<PurchaseOrderItem>().Property(x => x.Unit).HasMaxLength(20);
        builder.Entity<PurchaseOrderItem>().Property(x => x.RequiredSpecifications).HasMaxLength(1000);
        builder.Entity<PurchaseOrderItem>().Property(x => x.Notes).HasMaxLength(1000);
        builder.Entity<PurchaseInvoice>().HasIndex(x => x.InternalNumber).IsUnique();
        builder.Entity<PurchaseInvoice>().HasIndex(x => x.ExternalInvoiceNumber);
        builder.Entity<PurchaseInvoice>().HasIndex(x => x.InvoiceDate);
        builder.Entity<PurchaseContainer>().HasIndex(x => x.ContainerNumber);
        builder.Entity<InventoryMovement>().HasIndex(x => new { x.WarehouseId, x.YarnItemId, x.MovementDateUtc });
        builder.Entity<InventoryLayer>().HasIndex(x => new { x.WarehouseId, x.YarnItemId, x.ReceivedAtUtc });
        builder.Entity<Sale>().HasIndex(x => x.SaleNumber).IsUnique();
        builder.Entity<Sale>().HasIndex(x => new { x.SaleDate, x.CustomerId, x.SellerId });
        builder.Entity<Check>().HasIndex(x => new { x.DueDate, x.CurrentStatus });
        builder.Entity<Check>().HasIndex(x => x.SayadNumber);
        builder.Entity<PartnerLedgerEntry>().HasIndex(x => new { x.PartnerId, x.EntryDate });
        builder.Entity<MoneyDocument>().HasIndex(x => x.DocumentNumber).IsUnique();
        builder.Entity<SystemSetting>().HasIndex(x => new { x.Key, x.ValidFrom }).IsUnique();
        builder.Entity<BusinessContractVersion>().HasIndex(x => x.VersionNumber).IsUnique();
        builder.Entity<Investor>().Property(x => x.InvestorCode).HasMaxLength(30);
        builder.Entity<Investor>().Property(x => x.LegalName).HasMaxLength(200);
        builder.Entity<Investor>().Property(x => x.Phone).HasMaxLength(50);
        builder.Entity<Investor>().Property(x => x.Address).HasMaxLength(500);
        builder.Entity<Investor>().HasIndex(x => x.InvestorCode).IsUnique();
        builder.Entity<InvestorBalance>().HasOne(x => x.Investor).WithMany().HasForeignKey(x => x.InvestorId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<InvestorBalance>().HasIndex(x => new { x.InvestorId, x.Currency, x.Kind }).IsUnique();
        builder.Entity<InvestorBalance>().Property(x => x.Amount).HasPrecision(20, 6);
        builder.Entity<InvestorBalance>().ToTable(t => t.HasCheckConstraint("CK_InvestorBalances_Currency", "[Currency] IN (0, 1)"));
        builder.Entity<Person>().HasOne(x => x.CapitalInvestor).WithMany().HasForeignKey(x => x.CapitalInvestorId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<BusinessContractVersion>().HasOne(x => x.PrimaryInvestor).WithMany().HasForeignKey(x => x.PrimaryInvestorId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<BusinessContractVersion>().HasOne(x => x.PartnerInvestor).WithMany().HasForeignKey(x => x.PartnerInvestorId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<BusinessContractVersion>().HasIndex(x => x.EffectiveFrom);
        builder.Entity<BusinessContractVersion>().Property(x => x.ContractName).HasMaxLength(200);
        builder.Entity<BusinessContractVersion>().Property(x => x.CostResponsibilitiesJson).HasColumnType("nvarchar(max)");
        builder.Entity<BusinessContractVersion>().Property(x => x.ResponsiblePartyAfterGracePeriod).HasMaxLength(30);
        builder.Entity<BusinessContractVersion>().Property(x => x.FinancingCostResponsibleParty).HasMaxLength(30);
        builder.Entity<BusinessContractVersion>().Property(x => x.FinancedCheckPrincipalRiskParty).HasMaxLength(30);
        builder.Entity<BusinessContractVersion>().Property(x => x.PartnerEntitlementCreatedWhen).HasMaxLength(50);
        builder.Entity<BusinessContractVersion>().Property(x => x.CashSaleClaimPayableWhen).HasMaxLength(50);
        builder.Entity<BusinessContractVersion>().Property(x => x.CreditSaleClaimPayableWhen).HasMaxLength(50);
        builder.Entity<BusinessContractVersion>().HasOne(x => x.PreviousVersion).WithMany().HasForeignKey(x => x.PreviousVersionId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<BusinessContractVersion>().HasOne(x => x.PartnerPerson).WithMany().HasForeignKey(x => x.PartnerPersonId).OnDelete(DeleteBehavior.Restrict);

        builder.Entity<PurchaseInvoice>().HasOne<BusinessContractVersion>().WithMany().HasForeignKey(x => x.BusinessContractVersionId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<Sale>().HasOne<BusinessContractVersion>().WithMany().HasForeignKey(x => x.BusinessContractVersionId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<MoneyDocument>().HasOne<BusinessContractVersion>().WithMany().HasForeignKey(x => x.BusinessContractVersionId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<PartnerSettlement>().HasOne<BusinessContractVersion>().WithMany().HasForeignKey(x => x.BusinessContractVersionId).OnDelete(DeleteBehavior.Restrict);

        builder.Entity<PurchaseOrder>().HasMany(x => x.Items).WithOne().HasForeignKey(x => x.PurchaseOrderId).OnDelete(DeleteBehavior.Cascade);
        builder.Entity<PurchaseOrder>().HasOne<Person>().WithMany().HasForeignKey(x => x.PreferredSupplierId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<PurchaseOrder>().HasOne<AppUser>().WithMany().HasForeignKey(x => x.RequestedByUserId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<PurchaseOrderItem>().HasOne<YarnItem>().WithMany().HasForeignKey(x => x.YarnItemId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<PurchaseInvoice>().HasOne<PurchaseOrder>().WithMany().HasForeignKey(x => x.PurchaseOrderId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<PurchaseInvoice>().HasMany(x => x.Items).WithOne().HasForeignKey(x => x.PurchaseInvoiceId).OnDelete(DeleteBehavior.Cascade);
        builder.Entity<PurchaseInvoice>().HasMany(x => x.Containers).WithOne().HasForeignKey(x => x.PurchaseInvoiceId).OnDelete(DeleteBehavior.Cascade);
        builder.Entity<PurchaseInvoice>().HasMany(x => x.Costs).WithOne().HasForeignKey(x => x.PurchaseInvoiceId).OnDelete(DeleteBehavior.Cascade);
        builder.Entity<PriceList>().HasMany(x => x.Items).WithOne().HasForeignKey(x => x.PriceListId).OnDelete(DeleteBehavior.Cascade);
        builder.Entity<Sale>().HasMany(x => x.Items).WithOne().HasForeignKey(x => x.SaleId).OnDelete(DeleteBehavior.Cascade);
        builder.Entity<Sale>().HasMany(x => x.PaymentSchedules).WithOne().HasForeignKey(x => x.SaleId).OnDelete(DeleteBehavior.Cascade);
        builder.Entity<MoneyDocument>().HasMany(x => x.Lines).WithOne().HasForeignKey(x => x.MoneyDocumentId).OnDelete(DeleteBehavior.Cascade);
        builder.Entity<PartnerSettlement>().HasMany(x => x.Allocations).WithOne().HasForeignKey(x => x.PartnerSettlementId).OnDelete(DeleteBehavior.Cascade);

        SeedData(builder);
    }

    private static void SeedData(ModelBuilder builder)
    {
        var iranianPartnerId = Guid.Parse("11111111-1111-1111-1111-111111111111");
        var chinesePartnerId = Guid.Parse("22222222-2222-2222-2222-222222222222");
        builder.Entity<Person>().HasData(
            new { CreatedAtUtc = SeedCreatedAt(3396), CreditLimitIRR = 0m, IsActive = true, PreferredLanguage = "fa", Id = iranianPartnerId, PersonCode = "PARTNER-IR", DisplayName = "شریک ایرانی", CompanyName = "Iranian Partner", PersonType = PersonType.Company, PartnerKind = PartnerKind.Iranian, AccountingCode = "PARTNER-IR" },
            new { CreatedAtUtc = SeedCreatedAt(3448), CreditLimitIRR = 0m, IsActive = true, PreferredLanguage = "fa", Id = chinesePartnerId, PersonCode = "PARTNER-CN", DisplayName = "شریک چینی", CompanyName = "Chinese Partner", PersonType = PersonType.Company, PartnerKind = PartnerKind.Chinese, AccountingCode = "PARTNER-CN" });

        builder.Entity<ParameterValue>().HasData(
            Parameter("51000000-0000-0000-0000-000000000001", ParameterType.Job, "CUSTOMER", "مشتری", "Customer", 10, 3766),
            Parameter("51000000-0000-0000-0000-000000000002", ParameterType.Job, "SELLER", "فروشنده", "Seller", 20, 3774),
            Parameter("51000000-0000-0000-0000-000000000003", ParameterType.Job, "SUPPLIER", "تأمین‌کننده", "Supplier", 30, 3777),
            Parameter("51000000-0000-0000-0000-000000000004", ParameterType.Job, "PARTNER", "شریک", "Partner", 40, 3793),
            Parameter("51000000-0000-0000-0000-000000000005", ParameterType.Job, "MANAGEMENT", "مدیریت", "Management", 50, -1),
            Parameter("51000000-0000-0000-0000-000000000006", ParameterType.Job, "ORDERS", "سفارشات", "Orders", 60, -1),
            Parameter("51000000-0000-0000-0000-000000000007", ParameterType.Job, "COMMERCE", "بازرگانی", "Commerce", 70, -1),
            Parameter("51000000-0000-0000-0000-000000000008", ParameterType.Job, "WAREHOUSE", "انباردار", "Warehouse keeper", 80, -1),
            Parameter("51000000-0000-0000-0000-000000000009", ParameterType.Job, "FINANCE", "مالی", "Finance", 90, -1),
            Parameter("51000000-0000-0000-0000-000000000010", ParameterType.Job, "OTHER", "سایر", "Other", 100, -1),
            Parameter("52000000-0000-0000-0000-000000000001", ParameterType.Title, "MR", "آقای", "Mr.", 10, 3796),
            Parameter("52000000-0000-0000-0000-000000000002", ParameterType.Title, "MRS", "خانم", "Ms.", 20, 3799),
            Parameter("52000000-0000-0000-0000-000000000003", ParameterType.Title, "OFFICE", "اداره", "Office", 50, 3802),
            Parameter("52000000-0000-0000-0000-000000000004", ParameterType.Title, "COMPANY", "شرکت", "Company", 30, 3804),
            Parameter("52000000-0000-0000-0000-000000000005", ParameterType.Title, "INSTITUTE", "مؤسسه", "Institute", 40, -1),
            Parameter("52000000-0000-0000-0000-000000000006", ParameterType.Title, "ORGANIZATION", "سازمان", "Organization", 60, -1),
            Parameter("53000000-0000-0000-0000-000000000001", ParameterType.Nationality, "IR", "ایرانی", "Iranian", 10, 3807),
            Parameter("53000000-0000-0000-0000-000000000002", ParameterType.Nationality, "CN", "چینی", "Chinese", 20, 3810),
            Parameter("53000000-0000-0000-0000-000000000003", ParameterType.Nationality, "TR", "ترک", "Turkish", 30, 3812),
            Parameter("53000000-0000-0000-0000-000000000004", ParameterType.Nationality, "OTHER", "سایر", "Other", 99, 3819));

        var roles = new[] { "Administrator", "Manager", "PurchaseOperator", "SalesOperator", "FinanceOperator", "WarehouseOperator", "ReportViewer" };
        builder.Entity<IdentityRole<Guid>>().HasData(roles.Select((name, i) => new IdentityRole<Guid>
        {
            Id = Guid.Parse($"00000000-0000-0000-0000-{i + 1:000000000000}"),
            Name = name,
            NormalizedName = name.ToUpperInvariant(),
            ConcurrencyStamp = $"seed-role-{i + 1}"
        }));

        var validFrom = new DateOnly(2024, 1, 1);
        builder.Entity<CreditRateRule>().HasData(
            new { CreatedAtUtc = SeedCreatedAt(4425), IsActive = true, Id = Guid.Parse("30000000-0000-0000-0000-000000000001"), Version = 1, ValidFrom = validFrom, FromDay = 1, ToDay = 30, PeriodDays = 30, PeriodRatePercent = 4m },
            new { CreatedAtUtc = SeedCreatedAt(4438), IsActive = true, Id = Guid.Parse("30000000-0000-0000-0000-000000000002"), Version = 1, ValidFrom = validFrom, FromDay = 31, ToDay = 60, PeriodDays = 30, PeriodRatePercent = 3m },
            new { CreatedAtUtc = SeedCreatedAt(4443), IsActive = true, Id = Guid.Parse("30000000-0000-0000-0000-000000000003"), Version = 1, ValidFrom = validFrom, FromDay = 61, ToDay = 90, PeriodDays = 30, PeriodRatePercent = 3m },
            new { CreatedAtUtc = SeedCreatedAt(4447), IsActive = true, Id = Guid.Parse("30000000-0000-0000-0000-000000000004"), Version = 1, ValidFrom = validFrom, FromDay = 91, ToDay = (int?)null, PeriodDays = 30, PeriodRatePercent = 3m });

        builder.Entity<SystemSetting>().HasData(
            new SystemSetting { Id = Guid.Parse("40000000-0000-0000-0000-000000000001"), Key = "DefaultCurrency", Value = "IRR", ValidFrom = validFrom },
            new SystemSetting { Id = Guid.Parse("40000000-0000-0000-0000-000000000002"), Key = "CostingMethod", Value = "FIFO", ValidFrom = validFrom },
            new SystemSetting { Id = Guid.Parse("40000000-0000-0000-0000-000000000003"), Key = "RoundingToleranceIRR", Value = "10", ValidFrom = validFrom });
    }

    private static object Parameter(string id, ParameterType type, string code, string fa, string en, int order, long ticks) => new
    {
        Id = Guid.Parse(id), ParameterType = type, Code = code, NameFa = fa, NameEn = en, SortOrder = order,
        TitlePersonType = type == ParameterType.Title ? (PersonType?)(code is "MR" or "MRS" ? PersonType.Individual : PersonType.Company) : null,
        IsActive = true, CreatedAtUtc = SeedCreatedAt(ticks)
    };

    // Preserve applied seed timestamps/business values; anonymous seeds omit the SQL-generated column.
    private static DateTime SeedCreatedAt(long ticks) => ticks < 0 ? new DateTime(2026, 7, 27, 0, 0, 0, DateTimeKind.Utc)
        : new DateTime(2026, 7, 22, 6, 47, 29, 271, DateTimeKind.Utc).AddTicks(ticks);

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        foreach (EntityEntry entry in ChangeTracker.Entries().Where(x => x.Entity is AuditedEntity))
        {
            if (entry.Entity is not AuditedEntity audited) continue;
            if (entry.State == EntityState.Modified) audited.UpdatedAtUtc = DateTime.UtcNow;
        }
        return base.SaveChangesAsync(cancellationToken);
    }
}
