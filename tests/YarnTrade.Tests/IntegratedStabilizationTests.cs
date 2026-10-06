using System.Collections.Concurrent;
using System.Data.Common;
using System.IO.Compression;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;
using YarnTrade.Api.Services;

namespace YarnTrade.Tests;

public sealed partial class SecurityBaselineTests
{
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task A6R_sql_weighted_average_lineage_reconciles_costs_and_reverses_exact_layers(bool fractional)
    {
        await using var f = await A6Prepare(7, CostingMethod.WeightedAverage);
        var warehouse = f.Sale.WarehouseId; var yarn = f.Sale.Items[0].YarnItemId;
        var rows = new[] { A6Layer(warehouse, yarn, 2, 1, days: -3), A6Layer(warehouse, yarn, 3, 3, days: -2), A6Layer(warehouse, yarn, 4, 7, days: -1) };
        if (fractional)
        {
            rows[0].UnitPurchaseUSD = 1.111111m; rows[0].UnitInternationalFreightUSD = .222222m; rows[0].UnitIranianImportCostUSD = .333333m;
            rows[1].UnitPurchaseUSD = 3.000001m; rows[1].UnitInternationalFreightUSD = .777777m; rows[1].UnitIranianImportCostUSD = .222222m;
            rows[2].UnitPurchaseUSD = 5.999999m; rows[2].UnitInternationalFreightUSD = .111111m; rows[2].UnitIranianImportCostUSD = .444444m;
        }
        var expected = BusinessCalculations.AllocateLayers(7, rows.Select(x => new LayerInput(x.Id, x.ReceivedAtUtc, x.RemainingQuantity,
            x.UnitPurchaseUSD, x.UnitInternationalFreightUSD, x.UnitIranianImportCostUSD)), CostingMethod.WeightedAverage).Single();
        await using (var db = f.Sql.Context())
        {
            db.InventoryLayers.RemoveRange(await db.InventoryLayers.ToListAsync()); db.InventoryLayers.AddRange(rows.Reverse()); await db.SaveChangesAsync();
        }
        var posted = await f.Post(new { }); Assert.Equal(HttpStatusCode.OK, posted.StatusCode);
        var token = Convert.FromBase64String((await posted.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("rowVersion").GetString()!);
        await using (var db = f.Sql.Context())
        {
            var item = await db.SaleItems.SingleAsync(x => x.SaleId == f.Sale.Id);
            Assert.Equal(Math.Round(expected.TotalCostUSD, 6, MidpointRounding.AwayFromZero), item.CostUSD);
            Assert.Equal(Math.Round(expected.TotalCostUSD * 100, 2, MidpointRounding.AwayFromZero), item.CostIRR);
            var allocations = await db.SaleCostAllocations.Where(x => x.SaleItemId == item.Id).ToListAsync(); Assert.Equal(3, allocations.Count);
            Assert.Equal(7m, allocations.Sum(x => x.Quantity)); Assert.Equal(item.CostUSD, allocations.Sum(x => x.TotalCostUSD));
            Assert.Equal(item.CostIRR, allocations.Sum(x => x.TotalCostIRR));
            Assert.Equal(new[] { 2m, 3m, 2m }, rows.Select(row => allocations.Single(x => x.InventoryLayerId == row.Id).Quantity));
            var purchase = Math.Round(rows.Sum(x => x.OriginalQuantity * x.UnitPurchaseUSD) / 9, 6, MidpointRounding.AwayFromZero);
            var freight = Math.Round(rows.Sum(x => x.OriginalQuantity * x.UnitInternationalFreightUSD) / 9, 6, MidpointRounding.AwayFromZero);
            Assert.All(allocations, x =>
            {
                Assert.Equal(purchase, x.UnitPurchaseUSD); Assert.Equal(freight, x.UnitInternationalFreightUSD);
                Assert.Equal(x.UnitTotalCostUSD, x.UnitPurchaseUSD + x.UnitInternationalFreightUSD + x.UnitIranianImportCostUSD);
                Assert.Equal(Math.Round(expected.UnitTotalCostUSD, 6, MidpointRounding.AwayFromZero), x.UnitTotalCostUSD);
            });
            foreach (var row in rows)
                Assert.Equal(row.OriginalQuantity - allocations.Single(x => x.InventoryLayerId == row.Id).Quantity,
                    (await db.InventoryLayers.FindAsync(row.Id))!.RemainingQuantity);
        }
        var reversed = await f.Host.Client.PostAsync(A4Version($"/api/sales/{f.Sale.Id}/reverse", token), null);
        Assert.Equal(HttpStatusCode.OK, reversed.StatusCode);
        var finalToken = Convert.FromBase64String((await reversed.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("rowVersion").GetString()!);
        await using (var db = f.Sql.Context()) foreach (var row in rows)
            Assert.Equal(row.OriginalQuantity, (await db.InventoryLayers.FindAsync(row.Id))!.RemainingQuantity);
        Assert.NotEqual(HttpStatusCode.OK, (await f.Host.Client.PostAsync(A4Version($"/api/sales/{f.Sale.Id}/reverse", finalToken), null)).StatusCode);
        await using var final = f.Sql.Context(); Assert.Equal(1, await final.AuditLogs.CountAsync(x => x.EntityId == f.Sale.Id.ToString() && x.Action == "Reverse"));
        Assert.Equal(finalToken, (await final.Sales.FindAsync(f.Sale.Id))!.RowVersion);
    }

    [Theory]
    [InlineData("missing")]
    [InlineData("quantity")]
    [InlineData("negative")]
    [InlineData("missing-layer")]
    [InlineData("warehouse")]
    [InlineData("yarn")]
    [InlineData("one-item-missing")]
    public async Task A6R_sql_historical_or_malformed_lineage_rejects_without_any_reversal_effect(string scenario)
    {
        await using var f = await A6Prepare(7, CostingMethod.WeightedAverage);
        Assert.Equal(HttpStatusCode.OK, (await f.Post(new { })).StatusCode);
        await using (var db = f.Sql.Context())
        {
            var allocation = await db.SaleCostAllocations.SingleAsync();
            if (scenario == "missing") db.SaleCostAllocations.Remove(allocation);
            if (scenario == "quantity") allocation.Quantity -= 1;
            if (scenario == "negative") allocation.Quantity = -7;
            if (scenario == "missing-layer") db.InventoryLayers.Remove((await db.InventoryLayers.FindAsync(allocation.InventoryLayerId))!);
            if (scenario == "warehouse") (await db.InventoryLayers.FindAsync(allocation.InventoryLayerId))!.WarehouseId = Guid.NewGuid();
            if (scenario == "yarn") (await db.InventoryLayers.FindAsync(allocation.InventoryLayerId))!.YarnItemId = Guid.NewGuid();
            if (scenario == "one-item-missing") db.SaleItems.Add(new SaleItem { SaleId = f.Sale.Id, YarnItemId = f.Sale.Items[0].YarnItemId, Quantity = 1 });
            await db.SaveChangesAsync();
        }
        await using var before = f.Sql.Context(); var sale = (await before.Sales.FindAsync(f.Sale.Id))!;
        var stock = await before.InventoryLayers.ToDictionaryAsync(x => x.Id, x => x.RemainingQuantity);
        var movements = await before.InventoryMovements.CountAsync(); var ledger = await before.PartnerLedgerEntries.CountAsync(); var audit = await before.AuditLogs.CountAsync();
        await A4AssertCode(await f.Host.Client.PostAsync(A4Version($"/api/sales/{sale.Id}/reverse", sale.RowVersion), null),
            HttpStatusCode.Conflict, "REVERSAL_INVENTORY_LINEAGE_MISSING");
        await using var after = f.Sql.Context(); var unchanged = (await after.Sales.FindAsync(sale.Id))!;
        Assert.Equal(DocumentStatus.Posted, unchanged.Status); Assert.Equal(sale.RowVersion, unchanged.RowVersion);
        Assert.Equal(movements, await after.InventoryMovements.CountAsync()); Assert.Equal(ledger, await after.PartnerLedgerEntries.CountAsync()); Assert.Equal(audit, await after.AuditLogs.CountAsync());
        foreach (var (id, quantity) in stock) Assert.Equal(quantity, (await after.InventoryLayers.FindAsync(id))!.RemainingQuantity);
    }

    [Theory]
    [InlineData(60, false, false)]
    [InlineData(50, false, false)]
    [InlineData(60, true, true)]
    [InlineData(60, true, false)]
    [InlineData(60, false, true)]
    public async Task A6R_sql_credit_limit_serializes_unrelated_inventory_and_preserves_explicit_override(int amount, bool grant, bool requestOverride)
    {
        var probe = new A6RAccountProbe();
        await using var f = await A6RCreditFixture(amount, probe, grant);
        var otherYarn = await A6AddYarn(f, 10);
        var second = await A6RCreditSale(f, otherYarn, amount);
        probe.PriorityDocument = f.Sale.Id;
        var responses = await A6RAccountContend(f, probe, () => f.Post(new { }),
            () => f.Host.Client.PostAsJsonAsync(A4Version($"/api/sales/{second.Id}/post", second.RowVersion), new { creditLimitOverrideRequested = requestOverride }));
        Assert.Equal(HttpStatusCode.OK, responses[0].StatusCode);
        var allowed = amount == 50 || grant && requestOverride;
        if (allowed) Assert.Equal(HttpStatusCode.OK, responses[1].StatusCode);
        else
        {
            await A4AssertCode(responses[1], requestOverride ? HttpStatusCode.Forbidden : HttpStatusCode.Conflict,
                requestOverride ? "CREDIT_OVERRIDE_FORBIDDEN" : "CREDIT_LIMIT_EXCEEDED");
            await A6AssertNoEffects(f, second);
        }
        await using var db = f.Sql.Context();
        Assert.Equal(allowed ? 2m * amount : amount, await db.Sales.Where(x => x.Status == DocumentStatus.Posted).SumAsync(x => x.TotalCreditSaleIRR));
        Assert.Equal(allowed ? 9m : 10m, await db.InventoryLayers.Where(x => x.YarnItemId == otherYarn).SumAsync(x => x.RemainingQuantity));
        var decision = await db.AuditLogs.SingleOrDefaultAsync(x => x.EntityId == second.Id.ToString() && x.Action == "SalePostingAuthority");
        if (allowed) Assert.Equal(grant && requestOverride && amount == 60, JsonSerializer.Deserialize<JsonElement>(decision!.NewValueJson!).GetProperty("creditOverrideUsed").GetBoolean());
        A6RAssertAccountSqlAndOrder(probe);
    }

    [Theory]
    [InlineData(MoneyDocumentType.Receipt, false)]
    [InlineData(MoneyDocumentType.Receipt, true)]
    [InlineData(MoneyDocumentType.Payment, false)]
    [InlineData(MoneyDocumentType.Payment, true)]
    public async Task A6R_sql_credit_sale_and_money_document_follow_valid_serial_account_order(MoneyDocumentType type, bool moneyFirst)
    {
        var probe = new A6RAccountProbe();
        await using var f = await A6RCreditFixture(60, probe);
        await SetPermissions(f.Host, A5Email, "sales.post", "finance.post");
        var money = new MoneyDocument { DocumentNumber = "A6R-MONEY", DocumentDate = A5Date, PersonId = f.Sale.CustomerId,
            DocumentType = type, TotalIRR = type == MoneyDocumentType.Receipt ? 50 : 60,
            Lines = [new() { AmountIRR = type == MoneyDocumentType.Receipt ? 50 : 60 }] };
        await using (var db = f.Sql.Context())
        {
            if (type == MoneyDocumentType.Receipt) db.MoneyDocuments.Add(new MoneyDocument { DocumentNumber = "A6R-OPENING", DocumentDate = A5Date,
                PersonId = f.Sale.CustomerId, DocumentType = MoneyDocumentType.Payment, TotalIRR = 80, Status = DocumentStatus.Posted });
            db.MoneyDocuments.Add(money); await db.SaveChangesAsync();
        }
        probe.PriorityDocument = moneyFirst ? money.Id : f.Sale.Id;
        var responses = await A6RAccountContend(f, probe, () => f.Post(new { }),
            () => f.Host.Client.PostAsync(A4Version($"/api/finance/money-documents/{money.Id}/post", money.RowVersion), null));
        Assert.Equal(HttpStatusCode.OK, responses[1].StatusCode);
        var saleAllowed = type == MoneyDocumentType.Receipt ? moneyFirst : !moneyFirst;
        if (saleAllowed) Assert.Equal(HttpStatusCode.OK, responses[0].StatusCode);
        else { await A4AssertCode(responses[0], HttpStatusCode.Conflict, "CREDIT_LIMIT_EXCEEDED"); await A6AssertNoEffects(f, f.Sale); }
        await using var check = f.Sql.Context();
        var summary = await new PersonAccountService(check).GetSummaryAsync(f.Sale.CustomerId);
        Assert.Equal(type == MoneyDocumentType.Receipt ? (saleAllowed ? 90m : 30m) : (saleAllowed ? 120m : 60m), summary.BalanceIRR);
        Assert.Equal(DocumentStatus.Posted, (await check.MoneyDocuments.FindAsync(money.Id))!.Status);
        Assert.Equal(1, await check.AuditLogs.CountAsync(x => x.EntityId == money.Id.ToString()));
        A6RAssertAccountSqlAndOrder(probe);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task A6R_sql_credit_reversal_cooperates_with_sale_account_lock(bool reversalFirst)
    {
        var probe = new A6RAccountProbe(); await using var f = await A6RCreditFixture(60, probe);
        Assert.Equal(HttpStatusCode.OK, (await f.Post(new { })).StatusCode);
        var token = await A6RSaleToken(f, f.Sale.Id);
        var otherYarn = await A6AddYarn(f, 10); var second = await A6RCreditSale(f, otherYarn, 60);
        probe.PriorityDocument = reversalFirst ? f.Sale.Id : second.Id;
        var responses = await A6RAccountContend(f, probe, () => A6Post(f, second),
            () => f.Host.Client.PostAsync(A4Version($"/api/sales/{f.Sale.Id}/reverse", token), null));
        Assert.Equal(HttpStatusCode.OK, responses[1].StatusCode);
        if (reversalFirst) Assert.Equal(HttpStatusCode.OK, responses[0].StatusCode);
        else { await A4AssertCode(responses[0], HttpStatusCode.Conflict, "CREDIT_LIMIT_EXCEEDED"); await A6AssertNoEffects(f, second); }
        await using var db = f.Sql.Context(); Assert.Equal(reversalFirst ? 60m : 0m, (await new PersonAccountService(db).GetSummaryAsync(f.Sale.CustomerId)).BalanceIRR);
        A6RAssertAccountSqlAndOrder(probe);
    }

    [Fact]
    public async Task A6R_sql_different_people_can_hold_account_locks_independently()
    {
        var probe = new A6RAccountProbe { HoldBoth = true }; await using var f = await A6RCreditFixture(60, probe);
        var secondYarn = await A6AddYarn(f, 10);
        var other = new Person { PersonCode = "A6R-OTHER", DisplayName = "Other customer", CreditLimitIRR = 100 };
        await using (var db = f.Sql.Context()) { db.Persons.Add(other); await db.SaveChangesAsync(); }
        var second = await A6RCreditSale(f, secondYarn, 60, other.Id);
        probe.Enabled = true; var a = f.Post(new { }); var b = A6Post(f, second);
        try { await probe.BothRead.Task.WaitAsync(TimeSpan.FromSeconds(20)); }
        finally { probe.Release.TrySetResult(); }
        Assert.All(await Task.WhenAll(a, b).WaitAsync(TimeSpan.FromSeconds(30)), r => Assert.Equal(HttpStatusCode.OK, r.StatusCode));
        Assert.Equal(2, probe.Reads.Select(x => x.SessionId).Distinct().Count()); Assert.Equal(0, probe.Deadlocks);
    }

    [Theory]
    [InlineData(false, false)]
    [InlineData(true, false)]
    [InlineData(false, true)]
    [InlineData(true, true)]
    public async Task A6R_sql_purchase_retry_preserves_original_token_and_posts_once_for_both_callers(bool commerce, bool staleWriter)
    {
        var timeout = new A6RTransientSave();
        await using var f = await A5Create(credit: false, schedules: false, role: "Administrator", interceptor: timeout);
        var invoice = new PurchaseInvoice { InternalNumber = "A6R-PUR", InvoiceDate = A5Date, SupplierId = f.Sale.CustomerId,
            GoodsTotal = 22, InternationalFreight = 5, TotalNetWeight = 5, Currency = Currency.USD,
            Items = [new() { OriginalDescription = "First", YarnItemId = f.Sale.Items[0].YarnItemId, NetWeight = 2, UnitPriceUSD = 2 },
                new() { OriginalDescription = "Second", YarnItemId = f.Sale.Items[0].YarnItemId, NetWeight = 3, UnitPriceUSD = 6 }],
            Costs = [new() { CostType = "Import", CostDate = A5Date, AmountUSD = 5, ResponsiblePartner = PartnerKind.Iranian }] };
        PurchaseOrder? order = null;
        await using (var db = f.Sql.Context())
        {
            if (commerce)
            {
                order = new PurchaseOrder { OrderNumber = "A6R-PO", OrderDate = A5Date, PreferredSupplierId = invoice.SupplierId,
                    RequestedByUserId = f.ActorId, Status = PurchaseOrderStatus.InCommerce,
                    Items = [new() { YarnItemId = f.Sale.Items[0].YarnItemId, DescriptionSnapshot = "Ordered", Quantity = 5, EstimatedUnitPrice = 4.4m }] };
                invoice.PurchaseOrderId = order.Id; db.PurchaseOrders.Add(order);
            }
            db.PurchaseInvoices.Add(invoice); await db.SaveChangesAsync();
        }
        timeout.TargetId = invoice.Id; timeout.ConcurrentWrite = staleWriter ? f.Sql : null;
        var route = commerce ? $"/api/commerce/invoices/{invoice.Id}/send-to-warehouse?warehouseId={f.Sale.WarehouseId}&confirmInvoiceData=true&confirmDiscrepancy=true"
            : $"/api/purchases/{invoice.Id}/post?warehouseId={f.Sale.WarehouseId}";
        var response = await f.Host.Client.PostAsync(A4Version(route, invoice.RowVersion), null);
        Assert.Equal(invoice.RowVersion, timeout.FirstExpectedVersion);
        await using var check = f.Sql.Context();
        var itemIds = invoice.Items.Select(x => x.Id).ToArray();
        if (staleWriter)
        {
            await A4AssertCode(response, HttpStatusCode.Conflict, AggregateConcurrency.ConflictCode); Assert.Equal(1, timeout.SaveAttempts);
            Assert.Equal(DocumentStatus.Draft, (await check.PurchaseInvoices.FindAsync(invoice.Id))!.Status);
            Assert.Equal(0, await check.InventoryLayers.CountAsync(x => itemIds.Contains(x.PurchaseInvoiceItemId)));
            Assert.Equal(0, await check.InventoryMovements.CountAsync(x => x.SourceDocumentId == invoice.Id));
            Assert.Equal(0, await check.PartnerLedgerEntries.CountAsync(x => x.SourceDocumentId == invoice.Id));
            Assert.Equal(0, await check.AuditLogs.CountAsync(x => x.EntityId == invoice.Id.ToString()));
            if (order is not null) Assert.Equal(PurchaseOrderStatus.InCommerce, (await check.PurchaseOrders.FindAsync(order.Id))!.Status);
        }
        else
        {
            Assert.Equal(HttpStatusCode.OK, response.StatusCode); Assert.Equal(2, timeout.SaveAttempts); Assert.True(timeout.FirstDetached);
            Assert.Equal(invoice.RowVersion, timeout.FinalExpectedVersion);
            var token = Convert.FromBase64String((await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("rowVersion").GetString()!);
            var current = (await check.PurchaseInvoices.FindAsync(invoice.Id))!; Assert.Equal(DocumentStatus.Posted, current.Status); Assert.Equal(current.RowVersion, token);
            var layers = await check.InventoryLayers.Where(x => itemIds.Contains(x.PurchaseInvoiceItemId)).ToListAsync(); Assert.Equal(2, layers.Count);
            Assert.Equal(5m, layers.Sum(x => x.RemainingQuantity)); Assert.All(layers, x => { Assert.Equal(1m, x.UnitInternationalFreightUSD); Assert.Equal(1m, x.UnitIranianImportCostUSD); });
            Assert.Equal(2, await check.InventoryMovements.CountAsync(x => x.SourceDocumentId == invoice.Id));
            var ledger = await check.PartnerLedgerEntries.Where(x => x.SourceDocumentId == invoice.Id).ToListAsync(); Assert.Equal(2, ledger.Count); Assert.Equal(32m, ledger.Sum(x => x.CreditUSD));
            Assert.Equal(commerce ? 2 : 1, await check.AuditLogs.CountAsync(x => x.EntityId == invoice.Id.ToString()));
            if (order is not null) { var completed = (await check.PurchaseOrders.FindAsync(order.Id))!; Assert.Equal(PurchaseOrderStatus.Completed, completed.Status); Assert.NotNull(completed.CompletedAtUtc); }
        }
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task A6R_sql_settlement_retry_posts_once_and_rejects_genuine_stale_writer(bool staleWriter)
    {
        var timeout = new A6RTransientSave();
        await using var f = await A5Create(credit: false, schedules: false, role: "Administrator", interceptor: timeout);
        var settlement = new PartnerSettlement { SettlementNumber = "A6R-SET", SettlementDate = A5Date, PartnerId = f.Sale.CustomerId,
            PaidUSD = 10, ExchangeRate = 100, EquivalentIRR = 1000, Allocations = [new() { ConvertedUSD = 10 }] };
        await using (var db = f.Sql.Context()) { db.PartnerSettlements.Add(settlement); await db.SaveChangesAsync(); }
        timeout.TargetId = settlement.Id; timeout.ConcurrentWrite = staleWriter ? f.Sql : null;
        var response = await f.Host.Client.PostAsync(A4Version($"/api/finance/settlements/{settlement.Id}/post", settlement.RowVersion), null);
        Assert.Equal(settlement.RowVersion, timeout.FirstExpectedVersion);
        await using var check = f.Sql.Context(); var current = (await check.PartnerSettlements.FindAsync(settlement.Id))!;
        if (staleWriter)
        {
            await A4AssertCode(response, HttpStatusCode.Conflict, AggregateConcurrency.ConflictCode); Assert.Equal(1, timeout.SaveAttempts);
            Assert.Equal(DocumentStatus.Draft, current.Status); Assert.Equal(0, await check.PartnerLedgerEntries.CountAsync(x => x.SourceDocumentId == settlement.Id));
            Assert.Equal(0, await check.AuditLogs.CountAsync(x => x.EntityId == settlement.Id.ToString()));
        }
        else
        {
            Assert.Equal(HttpStatusCode.OK, response.StatusCode); Assert.Equal(2, timeout.SaveAttempts); Assert.True(timeout.FirstDetached);
            Assert.Equal(settlement.RowVersion, timeout.FinalExpectedVersion); Assert.Equal(DocumentStatus.Posted, current.Status);
            var token = Convert.FromBase64String((await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("rowVersion").GetString()!); Assert.Equal(current.RowVersion, token);
            var ledger = await check.PartnerLedgerEntries.SingleAsync(x => x.SourceDocumentId == settlement.Id); Assert.Equal(10m, ledger.DebitUSD);
            Assert.Equal(1, await check.AuditLogs.CountAsync(x => x.EntityId == settlement.Id.ToString()));
            await A4AssertCode(await f.Host.Client.PostAsync(A4Version($"/api/finance/settlements/{settlement.Id}/post", settlement.RowVersion), null), HttpStatusCode.Conflict, AggregateConcurrency.ConflictCode);
        }
    }

    [Theory]
    [InlineData(MoneyDocumentType.Receipt, false)]
    [InlineData(MoneyDocumentType.Payment, false)]
    [InlineData(MoneyDocumentType.Receipt, true)]
    public async Task A6R_sql_money_document_account_transaction_retry_keeps_token_and_single_audit(MoneyDocumentType type, bool staleWriter)
    {
        var timeout = new A6RTransientSave(); await using var f = await A5Create(role: "Administrator", interceptor: timeout);
        var money = new MoneyDocument { DocumentNumber = "A6R-RETRY", DocumentDate = A5Date, PersonId = f.Sale.CustomerId, DocumentType = type,
            TotalIRR = 25, Lines = [new() { AmountIRR = 25 }] };
        await using (var db = f.Sql.Context()) { db.MoneyDocuments.Add(money); await db.SaveChangesAsync(); }
        timeout.TargetId = money.Id; timeout.ConcurrentWrite = staleWriter ? f.Sql : null;
        var response = await f.Host.Client.PostAsync(A4Version($"/api/finance/money-documents/{money.Id}/post", money.RowVersion), null);
        Assert.Equal(money.RowVersion, timeout.FirstExpectedVersion);
        await using var check = f.Sql.Context(); var current = (await check.MoneyDocuments.FindAsync(money.Id))!;
        if (staleWriter)
        {
            await A4AssertCode(response, HttpStatusCode.Conflict, AggregateConcurrency.ConflictCode); Assert.Equal(DocumentStatus.Draft, current.Status);
            Assert.Equal(0, await check.AuditLogs.CountAsync(x => x.EntityId == money.Id.ToString()));
        }
        else
        {
            Assert.Equal(HttpStatusCode.OK, response.StatusCode); Assert.Equal(2, timeout.SaveAttempts); Assert.True(timeout.FirstDetached);
            Assert.Equal(money.RowVersion, timeout.FinalExpectedVersion); Assert.Equal(DocumentStatus.Posted, current.Status);
            var token = Convert.FromBase64String((await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("rowVersion").GetString()!); Assert.Equal(current.RowVersion, token);
            Assert.Equal(1, await check.AuditLogs.CountAsync(x => x.EntityId == money.Id.ToString()));
            Assert.Equal(type == MoneyDocumentType.Receipt ? -25m : 25m, (await new PersonAccountService(check).GetSummaryAsync(f.Sale.CustomerId)).BalanceIRR);
        }
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task A6R_sql_http_actor_tampering_cannot_change_check_document_or_import_ownership(bool empty)
    {
        await using var f = await A5Create(credit: false, role: "Administrator"); var fake = empty ? Guid.Empty : Guid.NewGuid();
        var createdCheck = await f.Host.Client.PostAsJsonAsync("/api/finance/checks", new Check { CheckNumber = "A6R-CHECK", OwnerName = "Owner", BankName = "Bank", DueDate = A5Date, CustomerId = f.Sale.CustomerId });
        Assert.Equal(HttpStatusCode.OK, createdCheck.StatusCode); var check = (await createdCheck.Content.ReadFromJsonAsync<Check>())!;
        var transitioned = await f.Host.Client.PostAsJsonAsync(A4Version($"/api/finance/checks/{check.Id}/transition", check.RowVersion),
            new { toStatus = CheckStatus.InCashbox, description = "Actor test", userId = fake }); Assert.Equal(HttpStatusCode.OK, transitioned.StatusCode);
        var createdMoney = await f.Host.Client.PostAsJsonAsync("/api/finance/money-documents", new MoneyDocument { DocumentNumber = "A6R-ACTOR", DocumentDate = A5Date,
            PersonId = f.Sale.CustomerId, CreatedBy = fake, Lines = [new() { AmountIRR = 10 }] });
        Assert.Equal(HttpStatusCode.OK, createdMoney.StatusCode); var money = (await createdMoney.Content.ReadFromJsonAsync<MoneyDocument>())!; Assert.Equal(f.ActorId, money.CreatedBy);
        var root = Path.Combine(Path.GetTempPath(), "YarnTrade_A6R_Import_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root); f.Host.App.Environment.ContentRootPath = root;
        try
        {
            using var form = new MultipartFormDataContent(); form.Add(new StringContent(f.Sale.CustomerId.ToString()), "supplierId");
            form.Add(new StringContent(fake.ToString()), "uploadedBy"); form.Add(new ByteArrayContent(A6RWorkbook()), "file", "A6R.xlsx");
            var imported = await f.Host.Client.PostAsync("/api/purchases/import", form); Assert.Equal(HttpStatusCode.OK, imported.StatusCode);
            var invoice = (await imported.Content.ReadFromJsonAsync<ImportedPurchase>())!.Invoice;
            await using var db = f.Sql.Context(); Assert.Equal(f.ActorId, (await db.CheckOperations.SingleAsync(x => x.CheckId == check.Id)).CreatedBy);
            Assert.Equal(f.ActorId, (await db.AuditLogs.SingleAsync(x => x.EntityId == check.Id.ToString())).UserId);
            Assert.Equal(f.ActorId, (await db.MoneyDocuments.FindAsync(money.Id))!.CreatedBy);
            var attachment = await db.Attachments.SingleAsync(x => x.EntityId == invoice.Id); Assert.Equal(f.ActorId, attachment.UploadedBy);
            Assert.Equal(f.Sale.CustomerId, invoice.SupplierId); Assert.Single(invoice.Items); Assert.Equal(5m, invoice.TotalNetWeight);
        }
        finally
        {
            Assert.Equal(Path.GetTempPath().TrimEnd(Path.DirectorySeparatorChar), Path.GetDirectoryName(root));
            Assert.Matches("^YarnTrade_A6R_Import_[0-9a-f]{32}$", Path.GetFileName(root)); Directory.Delete(root, recursive: true);
        }
    }

    private static byte[] A6RWorkbook()
    {
        using var stream = new MemoryStream();
        using (var zip = new ZipArchive(stream, ZipArchiveMode.Create, leaveOpen: true))
        {
            void Part(string path, string text) { using var writer = new StreamWriter(zip.CreateEntry(path).Open()); writer.Write(text); }
            Part("[Content_Types].xml", "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/></Types>");
            Part("_rels/.rels", "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"r0\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>");
            Part("xl/workbook.xml", "<workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><sheets><sheet name=\"invoice\" r:id=\"r1\"/></sheets></workbook>");
            Part("xl/_rels/workbook.xml.rels", "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"r1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/></Relationships>");
            Part("xl/worksheets/sheet1.xml", """
                <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row>
                <c r="H5" t="inlineStr"><is><t>Date: October 6, 2026</t></is></c><c r="H6" t="inlineStr"><is><t>Invoice: A6R</t></is></c>
                <c r="A17"><v>1</v></c><c r="B17" t="inlineStr"><is><t>Yarn</t></is></c><c r="E17"><v>5</v></c><c r="H17"><v>2</v></c><c r="I17"><v>10</v></c>
                <c r="A18" t="inlineStr"><is><t>TOTAL</t></is></c><c r="E18"><v>5</v></c><c r="I18"><v>10</v></c>
                </row></sheetData></worksheet>
                """);
        }
        return stream.ToArray();
    }

    private sealed class A6RTransientSave : SaveChangesInterceptor
    {
        public Guid TargetId { get; set; }
        public A4SqlDatabase? ConcurrentWrite { get; set; }
        public int SaveAttempts { get; private set; }
        public byte[]? FirstExpectedVersion { get; private set; }
        public byte[]? FinalExpectedVersion { get; private set; }
        public bool FirstDetached { get; private set; }
        private AuditedEntity? first;
        public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData e, InterceptionResult<int> r, CancellationToken ct = default)
        {
            var entry = e.Context!.ChangeTracker.Entries<AuditedEntity>().SingleOrDefault(x => x.Entity.Id == TargetId && x.State == EntityState.Modified);
            if (entry is null) return r;
            SaveAttempts++;
            if (SaveAttempts == 1)
            {
                first = entry.Entity; FirstExpectedVersion = entry.Property(x => x.RowVersion).OriginalValue.ToArray();
                if (ConcurrentWrite is not null)
                {
                    await using var other = ConcurrentWrite.Context(); var root = (AuditedEntity)(await other.FindAsync(first.GetType(), [TargetId], ct))!;
                    other.Entry(root).Property(x => x.UpdatedAtUtc).IsModified = true; await other.SaveChangesAsync(ct);
                }
                throw new TimeoutException("One simulated transient A6R save timeout.");
            }
            FinalExpectedVersion = entry.Property(x => x.RowVersion).OriginalValue.ToArray(); FirstDetached = e.Context.Entry(first!).State == EntityState.Detached;
            return r;
        }
    }

    private static async Task<byte[]> A6RSaleToken(A5Fixture f, Guid id)
    { await using var db = f.Sql.Context(); return (await db.Sales.FindAsync(id))!.RowVersion; }

    private static async Task<A5Fixture> A6RCreditFixture(decimal amount, IInterceptor probe, bool grant = false)
    {
        var f = await A5Create(credit: true, schedules: false, limit: 100, grantOverride: grant, interceptor: probe);
        try
        {
            await A6SetSnapshot(f.Sql, true);
            await using var db = f.Sql.Context(); var sale = await db.Sales.Include(x => x.Items).SingleAsync(x => x.Id == f.Sale.Id);
            sale.Items[0].Quantity = 1; sale.Items[0].CashUnitPriceSnapshotIRR = 30; sale.Items[0].CreditUnitPriceIRR = amount;
            sale.Notes = "A6R credit fixture"; await db.SaveChangesAsync(); f.Sale.RowVersion = sale.RowVersion; return f;
        }
        catch { await f.DisposeAsync(); throw; }
    }

    private static async Task<Sale> A6RCreditSale(A5Fixture f, Guid yarn, decimal amount, Guid? customer = null)
    {
        var sale = new Sale { SaleNumber = "A6R-" + Guid.NewGuid().ToString("N"), SaleDate = A5Date, CustomerId = customer ?? f.Sale.CustomerId,
            SellerId = f.Sale.SellerId, WarehouseId = f.Sale.WarehouseId, SaleMode = SaleMode.Credit,
            Items = [new() { YarnItemId = yarn, Quantity = 1, CashUnitPriceSnapshotIRR = 30, CreditUnitPriceIRR = amount }] };
        var response = await f.Host.Client.PostAsJsonAsync("/api/sales", sale); Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<Sale>())!;
    }

    private static async Task<HttpResponseMessage[]> A6RAccountContend(A5Fixture f, A6RAccountProbe probe,
        Func<Task<HttpResponseMessage>> a, Func<Task<HttpResponseMessage>> b)
    {
        probe.Enabled = true; var first = a(); var second = b();
        try
        {
            var holder = await probe.FirstRead.Task.WaitAsync(TimeSpan.FromSeconds(20));
            var waiter = probe.Reads.First(x => x.SessionId != holder.SessionId);
            await A6WaitForBlocking(f.Sql, waiter.SessionId, holder.SessionId);
        }
        finally { probe.Release.TrySetResult(); }
        return await Task.WhenAll(first, second).WaitAsync(TimeSpan.FromSeconds(30));
    }

    private static void A6RAssertAccountSqlAndOrder(A6RAccountProbe probe)
    {
        Assert.Equal(0, probe.Deadlocks); Assert.Equal(2, probe.Reads.Select(x => x.ContextId).Distinct().Count());
        foreach (var read in probe.Reads)
        {
            Assert.Contains("UPDLOCK", read.Sql); Assert.Contains("HOLDLOCK", read.Sql); Assert.Contains("FORCESEEK", read.Sql);
            Assert.DoesNotContain(read.PersonId.ToString(), read.Sql, StringComparison.OrdinalIgnoreCase);
        }
        foreach (var events in probe.Events.GroupBy(x => x.Context)) Assert.Equal("account", events.First().Kind);
    }

    private sealed record A6RAccountRead(Guid ContextId, Guid DocumentId, int SessionId, Guid PersonId, string Sql);
    private sealed class A6RAccountProbe : DbCommandInterceptor
    {
        public bool Enabled { get; set; }
        public bool HoldBoth { get; set; }
        public Guid? PriorityDocument { get; set; }
        public int Deadlocks;
        public ConcurrentQueue<A6RAccountRead> Reads { get; } = new();
        public ConcurrentQueue<(Guid Context, string Kind)> Events { get; } = new();
        public TaskCompletionSource<A6RAccountRead> FirstRead { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource BothRead { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Release { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly TaskCompletionSource bothStarted = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private int readsStarted, readersCompleted, heldSession;
        private static bool IsAccount(DbCommand c) => c.CommandText.Contains("FROM [Persons] WITH", StringComparison.Ordinal);
        public override async ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand c, CommandEventData e, InterceptionResult<DbDataReader> r, CancellationToken ct = default)
        {
            if (!Enabled) return r;
            if (c.CommandText.Contains("FROM [InventoryLayers]", StringComparison.Ordinal)) Events.Enqueue((e.Context!.ContextId.InstanceId, "inventory"));
            if (!IsAccount(c)) return r;
            var context = e.Context!; var document = context.ChangeTracker.Entries<AuditedEntity>().Single(x => x.Entity is Sale or MoneyDocument).Entity;
            var person = (Guid)c.Parameters.Cast<DbParameter>().Single().Value!;
            Events.Enqueue((context.ContextId.InstanceId, "account"));
            Reads.Enqueue(new(context.ContextId.InstanceId, document.Id, ((SqlConnection)c.Connection!).ServerProcessId, person, c.CommandText));
            if (Interlocked.Increment(ref readsStarted) == 2) bothStarted.TrySetResult();
            await bothStarted.Task.WaitAsync(TimeSpan.FromSeconds(20), ct);
            if (PriorityDocument.HasValue && document.Id != PriorityDocument) await FirstRead.Task.WaitAsync(TimeSpan.FromSeconds(20), ct);
            return r;
        }
        public override async ValueTask<DbDataReader> ReaderExecutedAsync(DbCommand c, CommandExecutedEventData e, DbDataReader r, CancellationToken ct = default)
        {
            if (!Enabled || !IsAccount(c)) return r;
            var session = ((SqlConnection)c.Connection!).ServerProcessId;
            var first = Interlocked.CompareExchange(ref heldSession, session, 0) == 0;
            if (first) FirstRead.TrySetResult(Reads.First(x => x.SessionId == session));
            if (Interlocked.Increment(ref readersCompleted) == 2) BothRead.TrySetResult();
            if (first || HoldBoth) await Release.Task.WaitAsync(TimeSpan.FromSeconds(25), ct);
            return r;
        }
        public override Task CommandFailedAsync(DbCommand c, CommandErrorEventData e, CancellationToken ct = default)
        { if (e.Exception is SqlException { Number: 1205 }) Interlocked.Increment(ref Deadlocks); return Task.CompletedTask; }
    }
}
