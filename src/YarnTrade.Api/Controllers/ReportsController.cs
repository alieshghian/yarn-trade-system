using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using YarnTrade.Api.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;

namespace YarnTrade.Api.Controllers;

[ApiController, Route("api/reports"), Authorize, EnableRateLimiting(InternetSecurity.Reports)]
public sealed class ReportsController(AppDbContext db) : ControllerBase
{
    [RequirePermission("reports.view")]
    [HttpGet("yarn-transactions")]
    public async Task<object> YarnTransactions([FromQuery] Guid? warehouseId, [FromQuery] Guid? yarnItemId,
        [FromQuery] Guid? personId, [FromQuery] DateOnly? from, [FromQuery] DateOnly? to, CancellationToken ct,
        [FromQuery] string? reportLanguage = null)
    {
        if (reportLanguage is not null && reportLanguage is not ("fa" or "en" or "zh"))
            return BadRequest("Unsupported report language.");
        var query = db.InventoryMovements.AsNoTracking().AsQueryable();
        if (warehouseId.HasValue) query = query.Where(x => x.WarehouseId == warehouseId);
        if (yarnItemId.HasValue) query = query.Where(x => x.YarnItemId == yarnItemId);
        if (from.HasValue) query = query.Where(x => x.MovementDateUtc >= from.Value.ToDateTime(TimeOnly.MinValue));
        if (to.HasValue) query = query.Where(x => x.MovementDateUtc < to.Value.AddDays(1).ToDateTime(TimeOnly.MinValue));
        var movements = await query.OrderBy(x => x.MovementDateUtc).ThenBy(x => x.Id).Take(10_000).ToListAsync(ct);
        var purchaseIds = movements.Where(x => x.SourceDocumentType == nameof(PurchaseInvoice)).Select(x => x.SourceDocumentId).Distinct().ToArray();
        var saleIds = movements.Where(x => x.SourceDocumentType == nameof(Sale)).Select(x => x.SourceDocumentId).Distinct().ToArray();
        var purchases = await db.PurchaseInvoices.AsNoTracking().Where(x => purchaseIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
        var sales = await db.Sales.AsNoTracking().Where(x => saleIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
        var purchaseItemIds = movements.Where(x => x.PurchaseInvoiceItemId.HasValue).Select(x => x.PurchaseInvoiceItemId!.Value).Distinct().ToArray();
        var purchaseItems = await db.PurchaseInvoiceItems.AsNoTracking().Where(x => purchaseItemIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
        var saleItemIds = movements.Where(x => x.SaleItemId.HasValue).Select(x => x.SaleItemId!.Value).Distinct().ToArray();
        var saleItems = await db.SaleItems.AsNoTracking().Where(x => saleItemIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
        var containers = await db.PurchaseContainers.AsNoTracking().Where(x => purchaseIds.Contains(x.PurchaseInvoiceId)).ToListAsync(ct);
        var yarns = await db.YarnItems.AsNoTracking().Where(x => movements.Select(m => m.YarnItemId).Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
        var warehouses = await db.Warehouses.AsNoTracking().Where(x => movements.Select(m => m.WarehouseId).Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);

        var rows = movements.Select(m =>
        {
            purchases.TryGetValue(m.SourceDocumentId, out var purchase);
            sales.TryGetValue(m.SourceDocumentId, out var sale);
            var counterpartyId = purchase?.SupplierId ?? sale?.CustomerId;
            purchaseItems.TryGetValue(m.PurchaseInvoiceItemId ?? Guid.Empty, out var purchaseItem);
            saleItems.TryGetValue(m.SaleItemId ?? Guid.Empty, out var saleItem);
            yarns.TryGetValue(m.YarnItemId, out var yarn);
            warehouses.TryGetValue(m.WarehouseId, out var warehouse);
            return new
            {
                m.Id, m.MovementDateUtc, m.MovementType, m.WarehouseId, WarehouseCode = warehouse?.Code,
                m.YarnItemId, YarnCode = yarn?.Code, YarnName = yarn?.ComprehensiveName,
                PersonId = counterpartyId, DocumentType = m.SourceDocumentType, m.SourceDocumentId,
                DocumentNumber = purchase?.InternalNumber ?? sale?.SaleNumber,
                ExternalInvoiceNumber = purchase?.ExternalInvoiceNumber,
                DocumentDate = purchase?.InvoiceDate ?? sale?.SaleDate,
                BillOfLadingNumber = purchase?.BillOfLadingNumber,
                ContainerNumbers = purchase is null ? null : string.Join("، ", containers.Where(x => x.PurchaseInvoiceId == purchase.Id).Select(x => x.ContainerNumber)),
                QuantityIn = m.Quantity > 0 ? m.Quantity : 0, QuantityOut = m.Quantity < 0 ? -m.Quantity : 0,
                Unit = purchaseItem?.Unit ?? "KG", PurchaseUnitPriceUSD = purchaseItem?.UnitPriceUSD,
                PurchaseAmountUSD = purchaseItem?.GoodsAmountUSD, SaleUnitPriceIRR = saleItem?.CreditUnitPriceIRR,
                SaleAmountIRR = saleItem?.CreditTotalIRR, m.UnitCostUSD, m.UnitCostIRR, m.PostedAtUtc, m.Notes
            };
        }).Where(x => !personId.HasValue || x.PersonId == personId).ToList();
        return new { rows, total = rows.Count, quantityIn = rows.Sum(x => x.QuantityIn), quantityOut = rows.Sum(x => x.QuantityOut),
            reportLanguage = await RecipientLanguage(personId, reportLanguage, ct) };
    }

    [RequirePermission("reports.view")]
    [HttpGet("stock")]
    public async Task<object> Stock([FromQuery] Guid? warehouseId, [FromQuery] Guid? yarnItemId, CancellationToken ct)
    {
        var q = db.InventoryMovements.AsNoTracking().AsQueryable();
        if (warehouseId.HasValue) q = q.Where(x => x.WarehouseId == warehouseId);
        if (yarnItemId.HasValue) q = q.Where(x => x.YarnItemId == yarnItemId);
        return await q.GroupBy(x => new { x.WarehouseId, x.YarnItemId }).Select(x => new
        {
            x.Key.WarehouseId, x.Key.YarnItemId, Quantity = x.Sum(m => m.Quantity),
            Purchased = x.Where(m => m.MovementType == MovementType.PurchaseReceipt).Sum(m => m.Quantity),
            Sold = -x.Where(m => m.MovementType == MovementType.SaleIssue).Sum(m => m.Quantity)
        }).OrderBy(x => x.WarehouseId).ThenBy(x => x.YarnItemId).ToListAsync(ct);
    }

    [RequirePermission("reports.view")]
    [HttpGet("partner-ledger/{partnerId:guid}")]
    public async Task<object> PartnerLedger(Guid partnerId, [FromQuery] DateOnly? from, [FromQuery] DateOnly? to, CancellationToken ct,
        [FromQuery] string? reportLanguage = null)
    {
        if (reportLanguage is not null && reportLanguage is not ("fa" or "en" or "zh"))
            return BadRequest("Unsupported report language.");
        var q = db.PartnerLedgerEntries.AsNoTracking().Where(x => x.PartnerId == partnerId && x.IsPosted);
        if (from.HasValue) q = q.Where(x => x.EntryDate >= from);
        if (to.HasValue) q = q.Where(x => x.EntryDate <= to);
        var rows = await q.OrderBy(x => x.EntryDate).ThenBy(x => x.CreatedAtUtc).ToListAsync(ct);
        return new { rows, totals = new { debitIRR = rows.Sum(x => x.DebitIRR), creditIRR = rows.Sum(x => x.CreditIRR), debitUSD = rows.Sum(x => x.DebitUSD), creditUSD = rows.Sum(x => x.CreditUSD) },
            reportLanguage = await RecipientLanguage(partnerId, reportLanguage, ct) };
    }

    private async Task<string?> RecipientLanguage(Guid? personId, string? selectedLanguage, CancellationToken ct)
    {
        if (selectedLanguage is not null || personId is null) return selectedLanguage;
        var recipient = await db.Persons.AsNoTracking().Include(x => x.Nationality).SingleOrDefaultAsync(x => x.Id == personId, ct);
        return recipient?.Nationality?.Code.Trim().ToUpperInvariant() switch {
            "IR" => "fa", "CN" => "zh", _ => recipient?.PreferredLanguage
        };
    }

    [RequirePermission("reports.view")]
    [HttpGet("checks-due")]
    public Task<List<Check>> ChecksDue([FromQuery] DateOnly through, CancellationToken ct) =>
        db.Checks.AsNoTracking().Where(x => x.DueDate <= through && x.CurrentStatus != CheckStatus.Collected && x.CurrentStatus != CheckStatus.Cancelled && x.CurrentStatus != CheckStatus.Returned).OrderBy(x => x.DueDate).ToListAsync(ct);

    [RequirePermission("reports.view")]
    [HttpGet("partnership")]
    public async Task<object> Partnership([FromQuery] DateOnly? from, [FromQuery] DateOnly? to, CancellationToken ct)
    {
        var q = db.SaleItems.AsNoTracking().Join(db.Sales.AsNoTracking(), i => i.SaleId, s => s.Id, (i, s) => new { i, s }).Where(x => x.s.Status == DocumentStatus.Posted);
        if (from.HasValue) q = q.Where(x => x.s.SaleDate >= from);
        if (to.HasValue) q = q.Where(x => x.s.SaleDate <= to);
        return await q.Select(x => new
        {
            x.s.SaleDate, x.s.SaleNumber, x.s.CustomerId, x.s.SellerId, x.s.WarehouseId, x.i.YarnItemId, x.i.Quantity,
            x.i.CashUnitPriceSnapshotIRR, x.s.ContractCreditDays, x.s.WeightedCreditDays, x.i.CreditUnitPriceIRR,
            CashEquivalentIRR = x.i.CashTotalIRR, CreditSaleIRR = x.i.CreditTotalIRR, x.i.CreditIncreaseIRR,
            CostUSD = x.i.CostUSD, x.i.ExchangeRateSnapshot, CostIRR = x.i.CostIRR, x.i.CashProfitOrLossIRR
        }).OrderBy(x => x.SaleDate).ThenBy(x => x.SaleNumber).ToListAsync(ct);
    }
}
