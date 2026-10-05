using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;

namespace YarnTrade.Api.Services;

public sealed record PurchasePostingConfirmation(Guid UserId, bool DiscrepancyAccepted, string ComparisonSnapshotJson);

public sealed class PostingService(AppDbContext db)
{
    private static readonly Guid IranianPartnerId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid ChinesePartnerId = Guid.Parse("22222222-2222-2222-2222-222222222222");

    public async Task PostPurchaseAsync(Guid invoiceId, Guid warehouseId, CancellationToken ct)
        => await PostPurchaseAsync(invoiceId, warehouseId, null, ct);

    public async Task PostPurchaseAsync(Guid invoiceId, Guid warehouseId, PurchasePostingConfirmation? confirmation, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var invoice = await db.PurchaseInvoices.Include(x => x.Items).Include(x => x.Costs).SingleAsync(x => x.Id == invoiceId, ct);
        if (invoice.Status != DocumentStatus.Draft) throw new InvalidOperationException("Only draft purchases can be posted.");
        if (invoice.Items.Count == 0 || invoice.Items.Any(x => x.YarnItemId is null || x.NetWeight <= 0))
            throw new InvalidOperationException("All purchase lines must be mapped and have positive net weight.");
        if (Math.Abs(invoice.Items.Sum(x => x.NetWeight) - invoice.TotalNetWeight) > 0.01m)
            throw new InvalidOperationException("Item net weights do not reconcile with invoice total.");
        if (invoice.PurchaseOrderId.HasValue && confirmation is null)
            throw new InvalidOperationException("Commerce confirmation is required for an invoice created from a purchase order.");

        var freightPerKg = invoice.TotalNetWeight == 0 ? 0 : invoice.InternationalFreight / invoice.TotalNetWeight;
        foreach (var item in invoice.Items)
        {
            var applicableCosts = invoice.Costs.Where(x => x.IsReasonableImportCost && (x.PurchaseInvoiceItemId is null || x.PurchaseInvoiceItemId == item.Id)).ToArray();
            var iranianCostUsd = applicableCosts.Where(x => x.ResponsiblePartner == PartnerKind.Iranian).Sum(x =>
                x.PurchaseInvoiceItemId == item.Id ? x.AmountUSD : x.AmountUSD * item.NetWeight / invoice.TotalNetWeight);
            var unitIranianCost = iranianCostUsd / item.NetWeight;
            db.InventoryLayers.Add(new InventoryLayer
            {
                WarehouseId = warehouseId,
                YarnItemId = item.YarnItemId!.Value,
                PurchaseInvoiceItemId = item.Id,
                ReceivedAtUtc = DateTime.UtcNow,
                OriginalQuantity = item.NetWeight,
                RemainingQuantity = item.NetWeight,
                UnitPurchaseUSD = item.UnitPriceUSD,
                UnitInternationalFreightUSD = freightPerKg,
                UnitIranianImportCostUSD = unitIranianCost
            });
            db.InventoryMovements.Add(new InventoryMovement
            {
                MovementDateUtc = DateTime.UtcNow,
                MovementType = MovementType.PurchaseReceipt,
                WarehouseId = warehouseId,
                YarnItemId = item.YarnItemId.Value,
                Quantity = item.NetWeight,
                SourceDocumentType = nameof(PurchaseInvoice),
                SourceDocumentId = invoice.Id,
                PurchaseInvoiceItemId = item.Id,
                UnitCostUSD = item.UnitPriceUSD + freightPerKg + unitIranianCost,
                PostedAtUtc = DateTime.UtcNow
            });
        }

        db.PartnerLedgerEntries.Add(new PartnerLedgerEntry
        {
            PartnerId = ChinesePartnerId,
            EntryDate = invoice.InvoiceDate,
            EntryType = "PurchaseAndFreightContribution",
            DescriptionFa = $"خرید و حمل فاکتور {invoice.ExternalInvoiceNumber}",
            DescriptionEn = $"Purchase and freight for invoice {invoice.ExternalInvoiceNumber}",
            CreditUSD = invoice.GoodsTotal + invoice.InternationalFreight,
            SourceDocumentType = nameof(PurchaseInvoice),
            SourceDocumentId = invoice.Id,
            IsPosted = true
        });
        var iranianCostTotal = invoice.Costs.Where(x => x.ResponsiblePartner == PartnerKind.Iranian && x.IsReasonableImportCost).Sum(x => x.AmountUSD);
        if (iranianCostTotal > 0)
            db.PartnerLedgerEntries.Add(new PartnerLedgerEntry
            {
                PartnerId = IranianPartnerId,
                EntryDate = invoice.InvoiceDate,
                EntryType = "IranianImportCostContribution",
                DescriptionFa = $"هزینه‌های واردات فاکتور {invoice.ExternalInvoiceNumber}",
                DescriptionEn = $"Iran-side import costs for invoice {invoice.ExternalInvoiceNumber}",
                CreditUSD = iranianCostTotal,
                SourceDocumentType = nameof(PurchaseInvoice),
                SourceDocumentId = invoice.Id,
                IsPosted = true
            });

        invoice.Status = DocumentStatus.Posted;
        invoice.PostedAtUtc = DateTime.UtcNow;
        if (invoice.PurchaseOrderId.HasValue)
        {
            var order = await db.PurchaseOrders.SingleAsync(x => x.Id == invoice.PurchaseOrderId.Value, ct);
            order.Status = PurchaseOrderStatus.Completed;
            order.CompletedAtUtc = DateTime.UtcNow;
        }
        if (confirmation is not null)
            db.AuditLogs.Add(new AuditLog
            {
                UserId = confirmation.UserId, Action = confirmation.DiscrepancyAccepted ? "ConfirmPurchaseWithDiscrepancy" : "ConfirmPurchase",
                EntityName = nameof(PurchaseInvoice), EntityId = invoice.Id.ToString(), NewValueJson = confirmation.ComparisonSnapshotJson
            });
        db.AuditLogs.Add(Audit("Post", invoice));
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
    }

    public async Task PostSaleAsync(Guid saleId, decimal saleDateUsdRate, CostingMethod method, decimal paymentTolerance, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var sale = await db.Sales.Include(x => x.Items).Include(x => x.PaymentSchedules).SingleAsync(x => x.Id == saleId, ct);
        if (sale.Status != DocumentStatus.Draft) throw new InvalidOperationException("Only draft sales can be posted.");
        if (sale.Items.Count == 0 || sale.Items.Any(x => x.Quantity <= 0 || x.CashUnitPriceSnapshotIRR <= 0))
            throw new InvalidOperationException("Sale items are incomplete.");

        sale.TotalCashEquivalentIRR = sale.Items.Sum(x => x.Quantity * x.CashUnitPriceSnapshotIRR);
        sale.TotalCreditSaleIRR = sale.Items.Sum(x => x.Quantity * (sale.SaleMode == SaleMode.Credit ? x.CreditUnitPriceIRR : x.CashUnitPriceSnapshotIRR));
        sale.TotalCreditIncreaseIRR = sale.TotalCreditSaleIRR - sale.TotalCashEquivalentIRR;
        if (sale.PaymentSchedules.Count > 0)
        {
            BusinessCalculations.ValidatePaymentTotal(sale.TotalCreditSaleIRR,
                sale.PaymentSchedules.Select(x => (x.AmountIRR, x.AmountUSD, x.ExchangeRate)), paymentTolerance);
            sale.WeightedCreditDays = BusinessCalculations.CalculateWeightedDueDays(sale.PaymentSchedules.Select(x =>
                (x.AmountIRR + x.AmountUSD * (x.ExchangeRate ?? 0m), x.DueDaysFromSale)));
            sale.WeightedDueDate = BusinessCalculations.CalculateWeightedDueDate(sale.SaleDate, sale.WeightedCreditDays);
        }

        foreach (var item in sale.Items)
        {
            var layers = await db.InventoryLayers.Where(x => x.WarehouseId == sale.WarehouseId && x.YarnItemId == item.YarnItemId && x.RemainingQuantity > 0).ToListAsync(ct);
            var inputs = layers.Select(x => new LayerInput(x.Id, x.ReceivedAtUtc, x.RemainingQuantity, x.UnitPurchaseUSD, x.UnitInternationalFreightUSD, x.UnitIranianImportCostUSD));
            var allocations = BusinessCalculations.AllocateLayers(item.Quantity, inputs, method);
            if (method == CostingMethod.WeightedAverage)
            {
                var remaining = item.Quantity;
                foreach (var layer in layers.OrderBy(x => x.ReceivedAtUtc))
                {
                    var used = Math.Min(remaining, layer.RemainingQuantity);
                    layer.RemainingQuantity -= used;
                    remaining -= used;
                    if (remaining == 0) break;
                }
            }
            else
            {
                foreach (var allocation in allocations)
                    layers.Single(x => x.Id == allocation.LayerId).RemainingQuantity -= allocation.Quantity;
            }

            item.CostingMethodSnapshot = method;
            item.ExchangeRateSnapshot = saleDateUsdRate;
            item.CostUSD = allocations.Sum(x => x.TotalCostUSD);
            item.CostIRR = item.CostUSD * saleDateUsdRate;
            item.CashTotalIRR = item.Quantity * item.CashUnitPriceSnapshotIRR;
            item.CreditTotalIRR = item.Quantity * (sale.SaleMode == SaleMode.Credit ? item.CreditUnitPriceIRR : item.CashUnitPriceSnapshotIRR);
            item.CreditIncreaseIRR = item.CreditTotalIRR - item.CashTotalIRR;
            item.CashProfitOrLossIRR = item.CashTotalIRR - item.CostIRR;
            foreach (var allocation in allocations.Where(x => x.LayerId != Guid.Empty))
            {
                var layer = layers.Single(x => x.Id == allocation.LayerId);
                db.SaleCostAllocations.Add(new SaleCostAllocation
                {
                    SaleItemId = item.Id,
                    InventoryLayerId = layer.Id,
                    Quantity = allocation.Quantity,
                    UnitPurchaseUSD = layer.UnitPurchaseUSD,
                    UnitInternationalFreightUSD = layer.UnitInternationalFreightUSD,
                    UnitIranianImportCostUSD = layer.UnitIranianImportCostUSD,
                    UnitTotalCostUSD = allocation.UnitTotalCostUSD,
                    ExchangeRateAtSale = saleDateUsdRate,
                    UnitTotalCostIRR = allocation.UnitTotalCostUSD * saleDateUsdRate,
                    TotalCostUSD = allocation.TotalCostUSD,
                    TotalCostIRR = allocation.TotalCostUSD * saleDateUsdRate
                });
            }
            db.InventoryMovements.Add(new InventoryMovement
            {
                MovementDateUtc = sale.SaleDate.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc),
                MovementType = MovementType.SaleIssue,
                WarehouseId = sale.WarehouseId,
                YarnItemId = item.YarnItemId,
                Quantity = -item.Quantity,
                SourceDocumentType = nameof(Sale),
                SourceDocumentId = sale.Id,
                SaleItemId = item.Id,
                UnitCostUSD = item.CostUSD / item.Quantity,
                UnitCostIRR = item.CostIRR / item.Quantity,
                PostedAtUtc = DateTime.UtcNow
            });
        }

        await PostPartnerShares(sale, ct);
        sale.Status = DocumentStatus.Posted;
        sale.PostedAtUtc = DateTime.UtcNow;
        db.AuditLogs.Add(Audit("Post", sale));
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
    }

    private async Task PostPartnerShares(Sale sale, CancellationToken ct)
    {
        foreach (var item in sale.Items)
        {
            var cashType = item.CashProfitOrLossIRR >= 0 ? PartnerResultType.CashProfit : PartnerResultType.CashLoss;
            var cashRule = await FindShareRule(cashType, sale, item, ct);
            AddShareEntries(sale, item.CashProfitOrLossIRR, cashType.ToString(), cashRule);
            if (item.CreditIncreaseIRR != 0)
            {
                var creditRule = await FindShareRule(PartnerResultType.CreditIncrease, sale, item, ct);
                AddShareEntries(sale, item.CreditIncreaseIRR, "CreditIncrease", creditRule);
            }
        }
    }

    private Task<PartnerShareRule> FindShareRule(PartnerResultType type, Sale sale, SaleItem item, CancellationToken ct) =>
        db.PartnerShareRules.Where(x => x.IsActive && x.ResultType == type && x.ValidFrom <= sale.SaleDate && (x.ValidTo == null || x.ValidTo >= sale.SaleDate) && (x.YarnItemId == null || x.YarnItemId == item.YarnItemId) && (x.SellerId == null || x.SellerId == sale.SellerId))
            .OrderByDescending(x => x.YarnItemId != null).ThenByDescending(x => x.SellerId != null).FirstAsync(ct);

    private void AddShareEntries(Sale sale, decimal amount, string type, PartnerShareRule rule)
    {
        var (iranian, chinese) = BusinessCalculations.SplitPartnerResult(amount, rule.IranianPartnerPercent, rule.ChinesePartnerPercent);
        AddPartnerEntry(IranianPartnerId, iranian);
        AddPartnerEntry(ChinesePartnerId, chinese);
        void AddPartnerEntry(Guid partnerId, decimal share) => db.PartnerLedgerEntries.Add(new PartnerLedgerEntry
        {
            PartnerId = partnerId,
            EntryDate = sale.SaleDate,
            EntryType = type,
            DescriptionFa = $"سهم از فروش {sale.SaleNumber}",
            DescriptionEn = $"Share from sale {sale.SaleNumber}",
            DebitIRR = share < 0 ? -share : 0,
            CreditIRR = share > 0 ? share : 0,
            SourceDocumentType = nameof(Sale),
            SourceDocumentId = sale.Id,
            IsPosted = true
        });
    }

    public async Task ReverseSaleAsync(Guid saleId, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var sale = await db.Sales.Include(x => x.Items).SingleAsync(x => x.Id == saleId, ct);
        if (sale.Status != DocumentStatus.Posted) throw new InvalidOperationException("Only posted sales can be reversed.");
        var allocations = await db.SaleCostAllocations.Where(x => sale.Items.Select(i => i.Id).Contains(x.SaleItemId)).ToListAsync(ct);
        var layers = await db.InventoryLayers.Where(x => allocations.Select(a => a.InventoryLayerId).Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
        foreach (var allocation in allocations) layers[allocation.InventoryLayerId].RemainingQuantity += allocation.Quantity;
        foreach (var item in sale.Items)
            db.InventoryMovements.Add(new InventoryMovement
            {
                MovementDateUtc = DateTime.UtcNow, MovementType = MovementType.ReturnIn, WarehouseId = sale.WarehouseId, YarnItemId = item.YarnItemId,
                Quantity = item.Quantity, SourceDocumentType = "SaleReversal", SourceDocumentId = sale.Id, SaleItemId = item.Id, UnitCostUSD = item.CostUSD / item.Quantity,
                UnitCostIRR = item.CostIRR / item.Quantity, PostedAtUtc = DateTime.UtcNow
            });
        var entries = await db.PartnerLedgerEntries.Where(x => x.SourceDocumentType == nameof(Sale) && x.SourceDocumentId == sale.Id && x.IsPosted).ToListAsync(ct);
        foreach (var entry in entries)
            db.PartnerLedgerEntries.Add(new PartnerLedgerEntry
            {
                PartnerId = entry.PartnerId, EntryDate = DateOnly.FromDateTime(DateTime.UtcNow), EntryType = "Reversal", DescriptionFa = $"برگشت {entry.DescriptionFa}", DescriptionEn = $"Reversal of {entry.DescriptionEn}",
                DebitIRR = entry.CreditIRR, CreditIRR = entry.DebitIRR, DebitUSD = entry.CreditUSD, CreditUSD = entry.DebitUSD, SourceDocumentType = "SaleReversal", SourceDocumentId = sale.Id,
                IsPosted = true, ReversalOfEntryId = entry.Id
            });
        sale.Status = DocumentStatus.Reversed;
        db.AuditLogs.Add(Audit("Reverse", sale));
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
    }

    private static AuditLog Audit(string action, Entity entity) => new() { Action = action, EntityName = entity.GetType().Name, EntityId = entity.Id.ToString() };
}
