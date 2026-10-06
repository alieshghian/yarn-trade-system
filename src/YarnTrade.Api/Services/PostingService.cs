using System.Data.SqlTypes;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;
using YarnTrade.Api.Security;

namespace YarnTrade.Api.Services;

public sealed record PurchasePostingConfirmation(Guid UserId, bool DiscrepancyAccepted, string ComparisonSnapshotJson);
public sealed record SalePostingResult(Guid SaleId, byte[] RowVersion);

public sealed class PostingService(AppDbContext db, PersonAccountService personAccounts, PermissionService permissions)
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

    public async Task<SalePostingResult> PostSaleAsync(Guid saleId, ClaimsPrincipal actor, bool creditLimitOverrideRequested, CancellationToken ct)
    {
        var effectivePermissions = await permissions.GetEffectiveAsync(actor, ct);
        if (actor.Identity?.IsAuthenticated != true || !Guid.TryParse(actor.FindFirstValue(ClaimTypes.NameIdentifier), out var actorId) ||
            !effectivePermissions.Contains("sales.post"))
            throw new SalePostingRejectedException(403, new { code = "SALE_POST_FORBIDDEN", permission = "sales.post",
                error = "شما مجوز قطعی‌کردن فروش را ندارید." });

        // Keep A4's original client token across SQL transient retries; never adopt a newer sale version.
        var tracked = db.ChangeTracker.Entries<Sale>().SingleOrDefault(x => x.Entity.Id == saleId);
        byte[]? expectedVersion = tracked?.Property(x => x.RowVersion).OriginalValue.ToArray();
        var retry = false;
        return await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            if (retry) db.ChangeTracker.Clear();
            retry = true;
            await using var transaction = await db.Database.BeginTransactionAsync(ct);
            var sale = await db.Sales.Include(x => x.Items).Include(x => x.PaymentSchedules).SingleAsync(x => x.Id == saleId, ct);
            expectedVersion ??= sale.RowVersion.ToArray();
            if (!sale.RowVersion.SequenceEqual(expectedVersion)) throw new DbUpdateConcurrencyException("Sale changed before posting.");
            db.Entry(sale).Property(x => x.RowVersion).OriginalValue = expectedVersion;
            await PostSaleCoreAsync(sale, actorId, creditLimitOverrideRequested,
                effectivePermissions.Contains("sales.creditOverride"), ct);
            await transaction.CommitAsync(ct);
            return new SalePostingResult(sale.Id, sale.RowVersion.ToArray());
        });
    }

    private async Task PostSaleCoreAsync(Sale sale, Guid actorId, bool overrideRequested, bool overrideAuthorized, CancellationToken ct)
    {
        if (sale.Status != DocumentStatus.Draft) throw new InvalidOperationException("Only draft sales can be posted.");
        if (sale.Items.Count == 0 || sale.Items.Any(x => x.Quantity <= 0 || x.CashUnitPriceSnapshotIRR <= 0))
            throw new InvalidOperationException("Sale items are incomplete.");

        var overrideUsed = await CheckSaleCreditAsync(sale, overrideRequested, overrideAuthorized, ct);
        var authority = await SalePostingAuthority.ResolveAsync(db, sale.SaleDate, ct);
        var saleDateUsdRate = authority.UsdRate;
        var method = authority.CostingMethod;

        sale.TotalCashEquivalentIRR = sale.Items.Sum(x => x.Quantity * x.CashUnitPriceSnapshotIRR);
        sale.TotalCreditSaleIRR = sale.Items.Sum(x => x.Quantity * (sale.SaleMode == SaleMode.Credit ? x.CreditUnitPriceIRR : x.CashUnitPriceSnapshotIRR));
        sale.TotalCreditIncreaseIRR = sale.TotalCreditSaleIRR - sale.TotalCashEquivalentIRR;
        if (sale.PaymentSchedules.Count > 0)
        {
            foreach (var row in sale.PaymentSchedules)
            {
                row.ExchangeRate = saleDateUsdRate;
                row.DueDaysFromSale = row.DueDate.DayNumber - sale.SaleDate.DayNumber;
            }
            try
            {
                BusinessCalculations.ValidatePaymentTotal(sale.TotalCreditSaleIRR,
                    sale.PaymentSchedules.Select(x => (x.AmountIRR, x.AmountUSD, x.ExchangeRate)), authority.PaymentToleranceIRR);
            }
            catch (InvalidOperationException)
            {
                throw new SalePostingRejectedException(409, new { code = "SALE_PAYMENT_TOTAL_MISMATCH",
                    error = "جمع برنامه پرداخت با مبلغ فروش و تلورانس مجاز تطابق ندارد." });
            }
            sale.WeightedCreditDays = BusinessCalculations.CalculateWeightedDueDays(sale.PaymentSchedules.Select(x =>
                (x.AmountIRR + x.AmountUSD * (x.ExchangeRate ?? 0m), x.DueDaysFromSale)));
            sale.WeightedDueDate = BusinessCalculations.CalculateWeightedDueDate(sale.SaleDate, sale.WeightedCreditDays);
        }
        else { sale.WeightedCreditDays = 0; sale.WeightedDueDate = null; }

        var lockedLayers = await LockInventoryLayersAsync(sale.WarehouseId, sale.Items.Select(x => x.YarnItemId), ct);
        EnsureNonNegativeStock(lockedLayers.Values.SelectMany(x => x));
        foreach (var demand in sale.Items.GroupBy(x => x.YarnItemId))
        {
            var required = demand.Sum(x => x.Quantity);
            var available = lockedLayers[demand.Key].Where(x => x.RemainingQuantity > 0).Sum(x => x.RemainingQuantity);
            if (available < required)
                throw new SalePostingRejectedException(409, new
                {
                    code = "INSUFFICIENT_STOCK", error = "موجودی انبار برای قطعی‌کردن این فروش کافی نیست.",
                    warehouseId = sale.WarehouseId, yarnItemId = demand.Key, requiredQuantity = required, availableQuantity = available
                });
        }

        foreach (var item in sale.Items)
        {
            var layers = lockedLayers[item.YarnItemId];
            var inputs = layers.Select(x => new LayerInput(x.Id, x.ReceivedAtUtc, x.RemainingQuantity, x.UnitPurchaseUSD, x.UnitInternationalFreightUSD, x.UnitIranianImportCostUSD));
            var allocations = BusinessCalculations.AllocateLayers(item.Quantity, inputs, method);
            if (method == CostingMethod.WeightedAverage)
            {
                var remaining = item.Quantity;
                foreach (var layer in layers.OrderBy(x => x.ReceivedAtUtc).ThenBy(x => new SqlGuid(x.Id)))
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

        EnsureNonNegativeStock(lockedLayers.Values.SelectMany(x => x));
        await PostPartnerShares(sale, ct);
        sale.Status = DocumentStatus.Posted;
        sale.PostedAtUtc = DateTime.UtcNow;
        db.AuditLogs.Add(Audit("Post", sale));
        db.AuditLogs.Add(new AuditLog
        {
            UserId = actorId, Action = "SalePostingAuthority", EntityName = nameof(Sale), EntityId = sale.Id.ToString(),
            NewValueJson = JsonSerializer.Serialize(new
            {
                exchangeRateId = authority.RateId, rateDate = authority.RateDate, usdRate = authority.UsdRate,
                costingMethod = authority.CostingMethod.ToString(), paymentToleranceIRR = authority.PaymentToleranceIRR,
                creditOverrideUsed = overrideUsed, creditOverrideApproverUserId = overrideUsed ? (Guid?)actorId : null
            })
        });
        await db.SaveChangesAsync(ct);
    }

    private async Task<bool> CheckSaleCreditAsync(Sale sale, bool overrideRequested, bool overrideAuthorized, CancellationToken ct)
    {
        if (sale.SaleMode != SaleMode.Credit) return false;
        var customer = await db.Persons.AsNoTracking().SingleAsync(x => x.Id == sale.CustomerId, ct);
        var summary = await personAccounts.GetSummaryAsync(customer.Id, ct);
        var saleAmount = sale.Items.Sum(x => x.Quantity * x.CreditUnitPriceIRR);
        var projectedDebt = summary.BalanceIRR + saleAmount;
        if (projectedDebt <= customer.CreditLimitIRR) return false;
        if (!overrideRequested)
            throw new SalePostingRejectedException(409, new
            {
                code = "CREDIT_LIMIT_EXCEEDED",
                error = "بدهی پیش‌بینی‌شده از سقف اعتبار شخص بیشتر است. ادامه عملیات نیاز به تأیید دارد.",
                currentDebtIRR = summary.BalanceIRR, saleAmountIRR = saleAmount, projectedDebtIRR = projectedDebt,
                creditLimitIRR = customer.CreditLimitIRR, requiresConfirmation = true
            });
        if (!overrideAuthorized)
            throw new SalePostingRejectedException(403, new { code = "CREDIT_OVERRIDE_FORBIDDEN", permission = "sales.creditOverride",
                error = "شما مجوز تأیید عبور از سقف اعتبار فروش را ندارید." });
        return true;
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

    private async Task<Dictionary<Guid, List<InventoryLayer>>> LockInventoryLayersAsync(Guid warehouseId, IEnumerable<Guid> yarnItemIds, CancellationToken ct)
    {
        var result = new Dictionary<Guid, List<InventoryLayer>>();
        foreach (var yarnItemId in yarnItemIds.Distinct().OrderBy(x => new SqlGuid(x)))
        {
            // Include depleted rows: a reversal can restore them. The indexed key range also protects an empty stock key.
            var layers = await db.InventoryLayers.FromSqlInterpolated($"""
                SELECT * FROM [InventoryLayers] WITH
                    (UPDLOCK, HOLDLOCK, ROWLOCK, INDEX([IX_InventoryLayers_WarehouseId_YarnItemId_ReceivedAtUtc]), FORCESEEK)
                WHERE [WarehouseId] = {warehouseId} AND [YarnItemId] = {yarnItemId}
                ORDER BY [ReceivedAtUtc] ASC, [Id] ASC
                """).AsNoTracking().ToListAsync(ct);
            // Use the locked database values even when an internal caller had previously tracked this stock.
            foreach (var entry in db.ChangeTracker.Entries<InventoryLayer>().Where(x =>
                x.Entity.WarehouseId == warehouseId && x.Entity.YarnItemId == yarnItemId).ToArray())
                entry.State = EntityState.Detached;
            db.InventoryLayers.AttachRange(layers);
            result.Add(yarnItemId, layers);
        }
        return result;
    }

    private static void EnsureNonNegativeStock(IEnumerable<InventoryLayer> layers)
    {
        if (layers.Any(x => x.RemainingQuantity < 0)) throw new InvalidOperationException("Inventory quantity invariant violated.");
    }

    public async Task<SalePostingResult> ReverseSaleAsync(Guid saleId, CancellationToken ct)
    {
        var tracked = db.ChangeTracker.Entries<Sale>().SingleOrDefault(x => x.Entity.Id == saleId);
        byte[]? expectedVersion = tracked?.Property(x => x.RowVersion).OriginalValue.ToArray();
        var retry = false;
        return await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            if (retry) db.ChangeTracker.Clear();
            retry = true;
            await using var transaction = await db.Database.BeginTransactionAsync(ct);
            var sale = await db.Sales.Include(x => x.Items).SingleAsync(x => x.Id == saleId, ct);
            expectedVersion ??= sale.RowVersion.ToArray();
            if (!sale.RowVersion.SequenceEqual(expectedVersion)) throw new DbUpdateConcurrencyException("Sale changed before reversal.");
            db.Entry(sale).Property(x => x.RowVersion).OriginalValue = expectedVersion;
            await ReverseSaleCoreAsync(sale, ct);
            await transaction.CommitAsync(ct);
            return new SalePostingResult(sale.Id, sale.RowVersion.ToArray());
        });
    }

    private async Task ReverseSaleCoreAsync(Sale sale, CancellationToken ct)
    {
        if (sale.Status != DocumentStatus.Posted) throw new InvalidOperationException("Only posted sales can be reversed.");
        var allocations = await db.SaleCostAllocations.Where(x => sale.Items.Select(i => i.Id).Contains(x.SaleItemId)).ToListAsync(ct);
        var affectedItems = allocations.Select(x => x.SaleItemId).ToHashSet();
        var locked = await LockInventoryLayersAsync(sale.WarehouseId,
            sale.Items.Where(x => affectedItems.Contains(x.Id)).Select(x => x.YarnItemId), ct);
        var layers = locked.Values.SelectMany(x => x).ToDictionary(x => x.Id);
        EnsureNonNegativeStock(layers.Values);
        foreach (var allocation in allocations) layers[allocation.InventoryLayerId].RemainingQuantity += allocation.Quantity;
        EnsureNonNegativeStock(layers.Values);
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
    }

    private static AuditLog Audit(string action, Entity entity) => new() { Action = action, EntityName = entity.GetType().Name, EntityId = entity.Id.ToString() };
}
