using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;

namespace YarnTrade.Api.Services;

public sealed record PersonAccountSummary(decimal BalanceIRR, bool HasHistory);

public sealed class PersonAccountService(AppDbContext db)
{
    // Call inside the balance-changing transaction, before any inventory lock.
    public async Task<Person> LockAccountAsync(Guid personId, CancellationToken ct)
    {
        var people = await db.Persons.FromSqlInterpolated($"""
            SELECT * FROM [Persons] WITH (UPDLOCK, HOLDLOCK, ROWLOCK, FORCESEEK)
            WHERE [Id] = {personId}
            """).AsNoTracking().ToListAsync(ct);
        return people.Single();
    }

    public async Task<PersonAccountSummary> GetSummaryAsync(Guid personId, CancellationToken ct = default)
    {
        var creditSales = await db.Sales.AsNoTracking()
            .Where(x => x.CustomerId == personId && x.Status == DocumentStatus.Posted && x.SaleMode == SaleMode.Credit)
            .SumAsync(x => (decimal?)x.TotalCreditSaleIRR, ct) ?? 0m;
        var receipts = await db.MoneyDocuments.AsNoTracking()
            .Where(x => x.PersonId == personId && x.Status == DocumentStatus.Posted && x.DocumentType == MoneyDocumentType.Receipt)
            .SumAsync(x => (decimal?)x.TotalIRR, ct) ?? 0m;
        var payments = await db.MoneyDocuments.AsNoTracking()
            .Where(x => x.PersonId == personId && x.Status == DocumentStatus.Posted && x.DocumentType == MoneyDocumentType.Payment)
            .SumAsync(x => (decimal?)x.TotalIRR, ct) ?? 0m;

        var hasHistory = await db.PurchaseInvoices.AnyAsync(x => x.SupplierId == personId, ct)
            || await db.Sales.AnyAsync(x => x.CustomerId == personId || x.SellerId == personId, ct)
            || await db.MoneyDocuments.AnyAsync(x => x.PersonId == personId, ct)
            || await db.Checks.AnyAsync(x => x.CustomerId == personId, ct)
            || await db.CheckOperations.AnyAsync(x => x.RelatedPersonId == personId, ct)
            || await db.Warehouses.AnyAsync(x => x.OwnerPersonId == personId || x.CustodianPersonId == personId, ct)
            || await db.PriceListItems.AnyAsync(x => x.SellerId == personId, ct)
            || await db.CreditRateRules.AnyAsync(x => x.SellerId == personId, ct)
            || await db.PartnerShareRules.AnyAsync(x => x.SellerId == personId, ct)
            || await db.PartnerLedgerEntries.AnyAsync(x => x.PartnerId == personId, ct)
            || await db.PartnerSettlements.AnyAsync(x => x.PartnerId == personId, ct);

        return new(creditSales + payments - receipts, hasHistory);
    }
}
