using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;

namespace YarnTrade.Api.Services;

public sealed class BusinessContractService(AppDbContext db)
{
    public async Task<bool> HasOperationalTransactionsAsync(CancellationToken ct = default) =>
        await db.PurchaseInvoices.AnyAsync(x => x.Status != DocumentStatus.Draft, ct)
        || await db.Sales.AnyAsync(x => x.Status != DocumentStatus.Draft, ct)
        || await db.MoneyDocuments.AnyAsync(x => x.Status != DocumentStatus.Draft, ct)
        || await db.PartnerSettlements.AnyAsync(x => x.Status != DocumentStatus.Draft, ct)
        || await db.InventoryMovements.AnyAsync(ct);

    public async Task<DateOnly?> LastOperationalDateAsync(CancellationToken ct = default)
    {
        var purchase = await db.PurchaseInvoices.Where(x => x.Status != DocumentStatus.Draft).Select(x => (DateOnly?)x.InvoiceDate).MaxAsync(ct);
        var sale = await db.Sales.Where(x => x.Status != DocumentStatus.Draft).Select(x => (DateOnly?)x.SaleDate).MaxAsync(ct);
        var money = await db.MoneyDocuments.Where(x => x.Status != DocumentStatus.Draft).Select(x => (DateOnly?)x.DocumentDate).MaxAsync(ct);
        var settlement = await db.PartnerSettlements.Where(x => x.Status != DocumentStatus.Draft).Select(x => (DateOnly?)x.SettlementDate).MaxAsync(ct);
        return new[] { purchase, sale, money, settlement }.Where(x => x.HasValue).Max();
    }

    public async Task<BusinessContractVersion> ResolveForDateAsync(DateOnly date, CancellationToken ct = default) =>
        await ForUpdate(db.BusinessContractVersions, date)
            .Where(x => x.EffectiveFrom <= date)
            .OrderByDescending(x => x.EffectiveFrom).ThenByDescending(x => x.VersionNumber)
            .FirstOrDefaultAsync(ct)
        ?? throw new InvalidOperationException("Business Contract & Rules must be configured before posting operational transactions.");

    public Task<BusinessContractVersion?> LatestForUpdateAsync(CancellationToken ct = default) =>
        ForLatestUpdate(db.BusinessContractVersions).OrderByDescending(x => x.VersionNumber).FirstOrDefaultAsync(ct);

    private IQueryable<BusinessContractVersion> ForUpdate(DbSet<BusinessContractVersion> versions, DateOnly date) =>
        db.Database.IsSqlServer()
            // Posting reads can coexist; the held shared lock prevents concurrent identity/rule edits.
            ? versions.FromSqlInterpolated($"SELECT * FROM [BusinessContractVersions] WITH (HOLDLOCK) WHERE [EffectiveFrom] <= {date}")
            : versions;

    private IQueryable<BusinessContractVersion> ForLatestUpdate(DbSet<BusinessContractVersion> versions) =>
        db.Database.IsSqlServer()
            ? versions.FromSqlRaw("SELECT * FROM [BusinessContractVersions] WITH (XLOCK, HOLDLOCK)")
            : versions;
}
