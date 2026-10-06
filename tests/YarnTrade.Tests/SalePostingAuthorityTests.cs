using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using YarnTrade.Api.Controllers;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;
using YarnTrade.Api.Security;
using YarnTrade.Api.Services;

namespace YarnTrade.Tests;

public sealed partial class SecurityBaselineTests
{
    private static readonly DateOnly A5Date = new(2026, 8, 21);
    private const string A5Email = "a5@example.test";

    [Fact]
    public void A5_post_contract_and_service_have_no_client_financial_authority()
    {
        Assert.Equal([nameof(PostSaleRequest.CreditLimitOverrideRequested)], typeof(PostSaleRequest).GetProperties().Select(x => x.Name));
        var method = Assert.Single(typeof(PostingService).GetMethods(), x => x.Name == nameof(PostingService.PostSaleAsync));
        Assert.DoesNotContain(method.GetParameters(), x => x.ParameterType == typeof(decimal) || x.ParameterType == typeof(CostingMethod));
        Assert.Single(PermissionCatalog.All, x => x.Key == "sales.creditOverride");
    }

    [Theory]
    [InlineData("missing")]
    [InlineData("nonfinal")]
    [InlineData("earlier")]
    [InlineData("later")]
    [InlineData("wrong-from")]
    [InlineData("wrong-to")]
    [InlineData("zero")]
    [InlineData("negative")]
    [InlineData("multiple-final")]
    public async Task A5_sql_requires_one_positive_final_sale_date_usd_irr_rate(string scenario)
    {
        await using var f = await A5Create();
        await using (var db = f.Sql.Context())
        {
            var rate = await db.ExchangeRates.SingleAsync(x => x.Id == f.RateId);
            switch (scenario)
            {
                case "missing": db.Remove(rate); break;
                case "nonfinal": rate.IsFinal = false; break;
                case "earlier": rate.RateDate = A5Date.AddDays(-1); break;
                case "later": rate.RateDate = A5Date.AddDays(1); break;
                case "wrong-from": rate.FromCurrency = Currency.CNY; break;
                case "wrong-to": rate.ToCurrency = Currency.USD; break;
                case "zero": rate.Rate = 0; break;
                case "negative": rate.Rate = -100; break;
                case "multiple-final":
                    // Only this GUID disposable database loses its unique index to exercise the defensive ambiguity check.
                    await db.Database.ExecuteSqlRawAsync("DROP INDEX [IX_ExchangeRates_RateDate_FromCurrency_ToCurrency] ON [ExchangeRates]");
                    db.ExchangeRates.Add(new ExchangeRate { RateDate = A5Date, FromCurrency = Currency.USD, ToCurrency = Currency.IRR, Rate = 200, IsFinal = true });
                    break;
            }
            await db.SaveChangesAsync();
        }
        await A4AssertCode(await f.Post(new { usdRate = 100, costingMethod = 0, paymentToleranceIRR = 999999 }),
            HttpStatusCode.Conflict, "SALE_EXCHANGE_RATE_REQUIRED");
        await A5AssertUnposted(f);
    }

    [Theory]
    [InlineData("CostingMethod", "missing", "POSTING_SETTING_MISSING")]
    [InlineData("RoundingToleranceIRR", "missing", "POSTING_SETTING_MISSING")]
    [InlineData("CostingMethod", "future-only", "POSTING_SETTING_MISSING")]
    [InlineData("RoundingToleranceIRR", "future-only", "POSTING_SETTING_MISSING")]
    [InlineData("CostingMethod", "unknown", "POSTING_SETTING_INVALID")]
    [InlineData("CostingMethod", "99", "POSTING_SETTING_INVALID")]
    [InlineData("CostingMethod", "0", "POSTING_SETTING_INVALID")]
    [InlineData("RoundingToleranceIRR", "not-a-decimal", "POSTING_SETTING_INVALID")]
    [InlineData("RoundingToleranceIRR", "-1", "POSTING_SETTING_INVALID")]
    [InlineData("RoundingToleranceIRR", "1,5", "POSTING_SETTING_INVALID")]
    public async Task A5_sql_missing_or_invalid_effective_settings_fail_closed(string key, string scenario, string code)
    {
        await using var f = await A5Create();
        await using (var db = f.Sql.Context())
        {
            db.SystemSettings.RemoveRange(await db.SystemSettings.Where(x => x.Key == key).ToListAsync());
            if (scenario != "missing") db.SystemSettings.Add(new SystemSetting { Key = key,
                ValidFrom = scenario == "future-only" ? A5Date.AddDays(1) : A5Date, Value = scenario == "future-only" ? (key == "CostingMethod" ? "FIFO" : "10") : scenario });
            await db.SaveChangesAsync();
        }
        var response = await f.Post(new { usdRate = 100, costingMethod = 0, paymentToleranceIRR = 999999 });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(code, json.GetProperty("code").GetString()); Assert.Equal(key, json.GetProperty("setting").GetString());
        await A5AssertUnposted(f);
    }

    [Theory]
    [InlineData(CostingMethod.FIFO, 8)]
    [InlineData(CostingMethod.LIFO, 16)]
    [InlineData(CostingMethod.WeightedAverage, 12)]
    public async Task A5_sql_server_costing_overwrites_tampered_totals_snapshots_and_partner_basis(CostingMethod method, int costUsd)
    {
        await using var f = await A5Create();
        await using (var db = f.Sql.Context())
        {
            db.SystemSettings.Add(new SystemSetting { Key = "CostingMethod", ValidFrom = A5Date, Value = method.ToString() });
            db.SystemSettings.Add(new SystemSetting { Key = "CostingMethod", ValidFrom = A5Date.AddDays(1), Value = "invalid-future" });
            await db.SaveChangesAsync();
        }
        // Extreme legacy financial values and an invalid costing enum must have no binding authority.
        var response = await f.Post(new { usdRate = decimal.MinValue, costingMethod = 9999, paymentToleranceIRR = decimal.MaxValue,
            creditLimitOverrideConfirmed = true, createdBy = Guid.NewGuid(), approvedBy = Guid.NewGuid() });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var token = Convert.FromBase64String((await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("rowVersion").GetString()!);
        Assert.Equal(8, token.Length); Assert.False(token.SequenceEqual(f.Sale.RowVersion));
        await using var check = f.Sql.Context();
        var sale = await check.Sales.Include(x => x.Items).Include(x => x.PaymentSchedules).SingleAsync(x => x.Id == f.Sale.Id);
        Assert.Equal(DocumentStatus.Posted, sale.Status); Assert.Equal(token, sale.RowVersion);
        Assert.Equal(2000m, sale.TotalCashEquivalentIRR); Assert.Equal(2400m, sale.TotalCreditSaleIRR); Assert.Equal(400m, sale.TotalCreditIncreaseIRR);
        var item = Assert.Single(sale.Items);
        Assert.Equal(method, item.CostingMethodSnapshot); Assert.Equal((decimal)costUsd, item.CostUSD); Assert.Equal(100m, item.ExchangeRateSnapshot);
        Assert.Equal(costUsd * 100m, item.CostIRR); Assert.Equal(2000m, item.CashTotalIRR); Assert.Equal(2400m, item.CreditTotalIRR);
        Assert.Equal(400m, item.CreditIncreaseIRR); Assert.Equal(2000m - costUsd * 100m, item.CashProfitOrLossIRR);
        Assert.Equal(20m, sale.WeightedCreditDays); Assert.Equal(A5Date.AddDays(20), sale.WeightedDueDate);
        Assert.All(sale.PaymentSchedules, x => Assert.Equal(100m, x.ExchangeRate));
        var allocations = await check.SaleCostAllocations.Where(x => x.SaleItemId == item.Id).ToListAsync();
        if (method == CostingMethod.WeightedAverage) Assert.Empty(allocations);
        else
        {
            var allocation = Assert.Single(allocations); Assert.Equal(method == CostingMethod.FIFO ? f.FirstLayerId : f.LastLayerId, allocation.InventoryLayerId);
            Assert.Equal((decimal)costUsd, allocation.TotalCostUSD); Assert.Equal(costUsd * 100m, allocation.TotalCostIRR); Assert.Equal(100m, allocation.ExchangeRateAtSale);
        }
        var movement = await check.InventoryMovements.SingleAsync(x => x.SourceDocumentId == sale.Id);
        Assert.Equal(-2m, movement.Quantity); Assert.Equal(costUsd / 2m, movement.UnitCostUSD); Assert.Equal(costUsd * 50m, movement.UnitCostIRR);
        await A5AssertShares(check, sale.Id, "CashProfit", item.CashProfitOrLossIRR, 60);
        await A5AssertShares(check, sale.Id, "CreditIncrease", 400, 75);
        var audit = await check.AuditLogs.SingleAsync(x => x.EntityId == sale.Id.ToString() && x.Action == "SalePostingAuthority");
        Assert.Equal(f.ActorId, audit.UserId);
        var json = JsonSerializer.Deserialize<JsonElement>(audit.NewValueJson!);
        Assert.Equal(f.RateId, json.GetProperty("exchangeRateId").GetGuid()); Assert.Equal(A5Date.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture), json.GetProperty("rateDate").GetString());
        Assert.Equal(100m, json.GetProperty("usdRate").GetDecimal()); Assert.Equal(method.ToString(), json.GetProperty("costingMethod").GetString());
        Assert.Equal(10m, json.GetProperty("paymentToleranceIRR").GetDecimal()); Assert.False(json.GetProperty("creditOverrideUsed").GetBoolean());
        Assert.Equal(JsonValueKind.Null, json.GetProperty("creditOverrideApproverUserId").ValueKind);
        Assert.Equal(7, json.EnumerateObject().Count());
        await A4AssertCode(await f.Post(new { }), HttpStatusCode.Conflict, AggregateConcurrency.ConflictCode);
    }

    [Theory]
    [InlineData(0, 0, true)]
    [InlineData(0, 1, false)]
    [InlineData(0.5, 0.5, true)]
    [InlineData(0.5, 1, false)]
    [InlineData(25, 20, true)]
    [InlineData(25, 26, false)]
    public async Task A5_sql_latest_invariant_tolerance_controls_validation_despite_client_widening(double toleranceInput, double differenceInput, bool succeeds)
    {
        var tolerance = (decimal)toleranceInput; var difference = (decimal)differenceInput;
        await using var f = await A5Create();
        await using (var db = f.Sql.Context())
        {
            db.SystemSettings.Add(new SystemSetting { Key = "RoundingToleranceIRR", Value = tolerance.ToString(System.Globalization.CultureInfo.InvariantCulture), ValidFrom = A5Date });
            db.SystemSettings.Add(new SystemSetting { Key = "RoundingToleranceIRR", Value = "999999999", ValidFrom = A5Date.AddDays(1) });
            (await db.SalePaymentSchedules.SingleAsync(x => x.SaleId == f.Sale.Id && x.Sequence == 1)).AmountIRR -= difference;
            await db.SaveChangesAsync();
        }
        var response = await f.Post(new { paymentToleranceIRR = 999999999, usdRate = 1 });
        if (!succeeds) { await A4AssertCode(response, HttpStatusCode.Conflict, "SALE_PAYMENT_TOTAL_MISMATCH"); await A5AssertUnposted(f); }
        else
        {
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            await using var db = f.Sql.Context();
            var audit = await db.AuditLogs.SingleAsync(x => x.Action == "SalePostingAuthority");
            Assert.Equal(tolerance, JsonSerializer.Deserialize<JsonElement>(audit.NewValueJson!).GetProperty("paymentToleranceIRR").GetDecimal());
        }
    }

    [Fact]
    public async Task A5_sql_nested_fake_fx_cannot_make_a_short_payment_valid()
    {
        await using var f = await A5Create();
        await using (var db = f.Sql.Context())
        {
            var row = await db.SalePaymentSchedules.SingleAsync(x => x.SaleId == f.Sale.Id && x.Sequence == 2);
            row.AmountUSD = 6; row.ExchangeRate = 200; await db.SaveChangesAsync();
        }
        await A4AssertCode(await f.Post(new { usdRate = 200, paymentToleranceIRR = 999999 }), HttpStatusCode.Conflict, "SALE_PAYMENT_TOTAL_MISMATCH");
        await A5AssertUnposted(f);
    }

    [Theory]
    [InlineData("SalesOperator", false, false, 409)]
    [InlineData("SalesOperator", true, false, 403)]
    [InlineData("Seller", true, false, 403)]
    [InlineData("SalesOperator", true, true, 200)]
    [InlineData("Seller", true, true, 200)]
    [InlineData("Administrator", true, false, 200)]
    [InlineData("Manager", true, false, 200)]
    public async Task A5_sql_over_limit_override_requires_request_and_effective_permission(string role, bool requested, bool grant, int expectedStatus)
    {
        await using var f = await A5Create(role: role, grantOverride: grant, limit: 2500);
        // Existing debt must be included; the draft amount alone is below the limit.
        await using (var db = f.Sql.Context())
        {
            db.MoneyDocuments.Add(new MoneyDocument { DocumentNumber = "A5-DEBT", PersonId = f.Sale.CustomerId,
                DocumentDate = A5Date, DocumentType = MoneyDocumentType.Payment, Status = DocumentStatus.Posted, TotalIRR = 200 });
            await db.SaveChangesAsync();
        }
        var fakeApprover = Guid.NewGuid();
        var response = await f.Post(new { creditLimitOverrideRequested = requested, creditLimitOverrideConfirmed = true, approvedBy = fakeApprover, createdBy = fakeApprover });
        Assert.Equal((HttpStatusCode)expectedStatus, response.StatusCode);
        if (expectedStatus != 200)
        {
            var json = await response.Content.ReadFromJsonAsync<JsonElement>();
            Assert.Equal(requested ? "CREDIT_OVERRIDE_FORBIDDEN" : "CREDIT_LIMIT_EXCEEDED", json.GetProperty("code").GetString());
            if (requested) Assert.Equal("sales.creditOverride", json.GetProperty("permission").GetString());
            else
            {
                Assert.Equal(200m, json.GetProperty("currentDebtIRR").GetDecimal()); Assert.Equal(2400m, json.GetProperty("saleAmountIRR").GetDecimal());
                Assert.Equal(2600m, json.GetProperty("projectedDebtIRR").GetDecimal()); Assert.Equal(2500m, json.GetProperty("creditLimitIRR").GetDecimal());
            }
            await A5AssertUnposted(f);
        }
        else
        {
            await using var db = f.Sql.Context();
            var audit = await db.AuditLogs.SingleAsync(x => x.Action == "SalePostingAuthority");
            var json = JsonSerializer.Deserialize<JsonElement>(audit.NewValueJson!);
            Assert.Equal(f.ActorId, audit.UserId); Assert.True(json.GetProperty("creditOverrideUsed").GetBoolean());
            Assert.Equal(f.ActorId, json.GetProperty("creditOverrideApproverUserId").GetGuid());
            Assert.DoesNotContain(fakeApprover.ToString(), audit.NewValueJson!);
        }
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task A5_sql_under_limit_needs_only_sales_post_even_when_override_requested(bool requested)
    {
        await using var f = await A5Create(role: "Customer");
        await SetPermissions(f.Host, A5Email, "sales.post");
        Assert.Equal(HttpStatusCode.OK, (await f.Post(new { creditLimitOverrideRequested = requested })).StatusCode);
        await using var db = f.Sql.Context();
        var json = JsonSerializer.Deserialize<JsonElement>((await db.AuditLogs.SingleAsync(x => x.Action == "SalePostingAuthority")).NewValueJson!);
        Assert.False(json.GetProperty("creditOverrideUsed").GetBoolean());
        Assert.Equal(JsonValueKind.Null, json.GetProperty("creditOverrideApproverUserId").ValueKind);
    }

    [Fact]
    public async Task A5_sql_service_cannot_bypass_credit_authorization_and_persisted_denial_applies()
    {
        await using var f = await A5Create(role: "Manager", limit: 1);
        await SetPermissions(f.Host, A5Email, "sales.post");
        using var scope = f.Host.App.Services.CreateScope();
        var actor = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, f.ActorId.ToString())], "test"));
        var service = scope.ServiceProvider.GetRequiredService<PostingService>();
        var rejected = await Assert.ThrowsAsync<SalePostingRejectedException>(() => service.PostSaleAsync(f.Sale.Id, actor, true, default));
        Assert.Equal(403, rejected.StatusCode); Assert.Equal("CREDIT_OVERRIDE_FORBIDDEN", JsonSerializer.SerializeToElement(rejected.Response).GetProperty("code").GetString());
        await A5AssertUnposted(f);
    }

    [Fact]
    public async Task A5_sql_a4_token_gates_precede_authority_and_atomic_posting_rejects_a_late_race()
    {
        var race = new A5SaleRace();
        await using var f = await A5Create(interceptor: race);
        var path = $"/api/sales/{f.Sale.Id}/post";
        await A4AssertCode(await f.Host.Client.PostAsJsonAsync(path, new { }), HttpStatusCode.BadRequest, "CONCURRENCY_TOKEN_REQUIRED");
        await A4AssertCode(await f.Host.Client.PostAsJsonAsync(path + "?rowVersion=bad", new { }), HttpStatusCode.BadRequest, "INVALID_CONCURRENCY_TOKEN");
        await using (var db = f.Sql.Context())
        {
            var sale = await db.Sales.FindAsync(f.Sale.Id); sale!.Notes = "a newer draft"; await db.SaveChangesAsync();
            // An invalid rate must not mask the stale rowVersion gate.
            var rate = await db.ExchangeRates.FindAsync(f.RateId); rate!.IsFinal = false; await db.SaveChangesAsync();
        }
        await A4AssertCode(await f.Post(new { }), HttpStatusCode.Conflict, AggregateConcurrency.ConflictCode);
        await using (var db = f.Sql.Context())
        {
            var rate = await db.ExchangeRates.FindAsync(f.RateId); rate!.IsFinal = true; await db.SaveChangesAsync();
            f.Sale.RowVersion = (await db.Sales.FindAsync(f.Sale.Id))!.RowVersion;
        }
        race.Sql = f.Sql; race.SaleId = f.Sale.Id;
        await A4AssertCode(await f.Post(new { }), HttpStatusCode.Conflict, AggregateConcurrency.ConflictCode);
        Assert.True(race.Fired); await A5AssertUnposted(f);
    }

    [Fact]
    public async Task A5_sql_cash_loss_no_schedule_and_historical_decision_remain_snapshotted()
    {
        await using var f = await A5Create(credit: false, schedules: false);
        await using (var db = f.Sql.Context())
        {
            var rate = await db.ExchangeRates.FindAsync(f.RateId); rate!.Rate = 300; await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.OK, (await f.Post(new { creditLimitOverrideRequested = true, usdRate = 1 })).StatusCode);
        await using var check = f.Sql.Context();
        var sale = await check.Sales.AsNoTracking().Include(x => x.Items).SingleAsync(x => x.Id == f.Sale.Id);
        Assert.Equal(0m, sale.WeightedCreditDays); Assert.Null(sale.WeightedDueDate);
        Assert.Equal(2000m, sale.TotalCreditSaleIRR); Assert.Equal(0m, sale.TotalCreditIncreaseIRR);
        Assert.Equal(-400m, Assert.Single(sale.Items).CashProfitOrLossIRR);
        await A5AssertShares(check, sale.Id, "CashLoss", -400, 40);
        var auditBefore = (await check.AuditLogs.AsNoTracking().SingleAsync(x => x.Action == "SalePostingAuthority")).NewValueJson;
        var entriesBefore = await check.PartnerLedgerEntries.AsNoTracking().Where(x => x.SourceDocumentId == sale.Id).OrderBy(x => x.Id).Select(x => new { x.Id, x.DebitIRR, x.CreditIRR }).ToListAsync();
        var allocationsBefore = await check.SaleCostAllocations.AsNoTracking().Where(x => x.SaleItemId == sale.Items[0].Id).Select(x => new { x.TotalCostUSD, x.TotalCostIRR, x.ExchangeRateAtSale }).ToListAsync();
        (await check.ExchangeRates.FindAsync(f.RateId))!.Rate = 900;
        (await check.SystemSettings.SingleAsync(x => x.Key == "CostingMethod")).Value = "LIFO";
        (await check.SystemSettings.SingleAsync(x => x.Key == "RoundingToleranceIRR")).Value = "999";
        var rule = await check.PartnerShareRules.SingleAsync(x => x.ResultType == PartnerResultType.CashLoss && x.IsActive && x.YarnItemId == null);
        rule.IranianPartnerPercent = 10; rule.ChinesePartnerPercent = 90; await check.SaveChangesAsync();
        check.ChangeTracker.Clear();
        var later = await check.Sales.AsNoTracking().Include(x => x.Items).SingleAsync(x => x.Id == sale.Id);
        Assert.Equal(sale.RowVersion, later.RowVersion); Assert.Equal(300m, later.Items[0].ExchangeRateSnapshot);
        Assert.Equal(CostingMethod.FIFO, later.Items[0].CostingMethodSnapshot); Assert.Equal(8m, later.Items[0].CostUSD); Assert.Equal(2400m, later.Items[0].CostIRR);
        Assert.Equal(auditBefore, (await check.AuditLogs.SingleAsync(x => x.Action == "SalePostingAuthority")).NewValueJson);
        Assert.Equal(entriesBefore, await check.PartnerLedgerEntries.AsNoTracking().Where(x => x.SourceDocumentId == sale.Id).OrderBy(x => x.Id).Select(x => new { x.Id, x.DebitIRR, x.CreditIRR }).ToListAsync());
        Assert.Equal(allocationsBefore, await check.SaleCostAllocations.AsNoTracking().Where(x => x.SaleItemId == sale.Items[0].Id).Select(x => new { x.TotalCostUSD, x.TotalCostIRR, x.ExchangeRateAtSale }).ToListAsync());
    }

    private static async Task<A5Fixture> A5Create(bool credit = true, bool schedules = true, string role = "SalesOperator",
        bool grantOverride = false, decimal limit = 10000, IInterceptor? interceptor = null)
    {
        var sql = await A4SqlDatabase.CreateLatest();
        TestApp? host = null;
        try
        {
            host = await CreateApp(sqlConnection: sql.Connection, sqlInterceptor: interceptor, sqlRetries: true);
            await CreateUser(host.App, A5Email, role); await SignIn(host, A5Email);
            var actor = await UserId(host, A5Email);
            var customer = new Person { PersonCode = "A5-CUSTOMER", DisplayName = "A5 Customer", CreditLimitIRR = limit };
            var warehouse = new Warehouse { Code = "A5-W", NameFa = "انبار آزمون", NameEn = "A5 Warehouse" };
            var type = new YarnType { Code = "A5-T", NameFa = "نوع آزمون", NameEn = "A5 Type" };
            var yarn = new YarnItem { YarnTypeId = type.Id, Code = "A5-Y", NameFa = "نخ آزمون", NameEn = "A5 Yarn" };
            var rate = new ExchangeRate { RateDate = A5Date, FromCurrency = Currency.USD, ToCurrency = Currency.IRR, Rate = 100, IsFinal = true };
            var first = new InventoryLayer { WarehouseId = warehouse.Id, YarnItemId = yarn.Id, PurchaseInvoiceItemId = Guid.NewGuid(), ReceivedAtUtc = A5Date.AddDays(-2).ToDateTime(TimeOnly.MinValue),
                OriginalQuantity = 3, RemainingQuantity = 3, UnitPurchaseUSD = 2, UnitInternationalFreightUSD = 1, UnitIranianImportCostUSD = 1 };
            var last = new InventoryLayer { WarehouseId = warehouse.Id, YarnItemId = yarn.Id, PurchaseInvoiceItemId = Guid.NewGuid(), ReceivedAtUtc = A5Date.AddDays(-1).ToDateTime(TimeOnly.MinValue),
                OriginalQuantity = 3, RemainingQuantity = 3, UnitPurchaseUSD = 6, UnitInternationalFreightUSD = 1, UnitIranianImportCostUSD = 1 };
            await using (var db = sql.Context())
            {
                db.AddRange(customer, warehouse, type, yarn, rate, first, last);
                foreach (var result in new[] { PartnerResultType.CashProfit, PartnerResultType.CashLoss, PartnerResultType.CreditIncrease })
                {
                    var pct = result == PartnerResultType.CashProfit ? 60m : result == PartnerResultType.CashLoss ? 40m : 75m;
                    db.PartnerShareRules.Add(new PartnerShareRule { ResultType = result, ValidFrom = A5Date.AddDays(-1), IranianPartnerPercent = pct, ChinesePartnerPercent = 100 - pct });
                    db.PartnerShareRules.Add(new PartnerShareRule { ResultType = result, ValidFrom = A5Date.AddDays(1), YarnItemId = yarn.Id, IranianPartnerPercent = 0, ChinesePartnerPercent = 100 });
                    db.PartnerShareRules.Add(new PartnerShareRule { ResultType = result, ValidFrom = A5Date.AddDays(-1), IsActive = false, YarnItemId = yarn.Id, IranianPartnerPercent = 0, ChinesePartnerPercent = 100 });
                }
                if (grantOverride) db.UserPermissions.Add(new UserPermission { UserId = actor, PermissionKey = "sales.creditOverride", IsGranted = true });
                await db.SaveChangesAsync();
            }
            var sale = new Sale { SaleNumber = "A5-SALE", SaleDate = A5Date, CustomerId = customer.Id, SellerId = Guid.NewGuid(), WarehouseId = warehouse.Id,
                SaleMode = credit ? SaleMode.Credit : SaleMode.Cash, TotalCashEquivalentIRR = -999999, TotalCreditSaleIRR = -999999, TotalCreditIncreaseIRR = -999999,
                WeightedCreditDays = 999, WeightedDueDate = A5Date.AddDays(999), Items = [new SaleItem { YarnItemId = yarn.Id, Quantity = 2,
                    CashUnitPriceSnapshotIRR = 1000, CreditUnitPriceIRR = 1200, CostingMethodSnapshot = CostingMethod.LIFO, CostUSD = -999999, ExchangeRateSnapshot = 1,
                    CostIRR = -999999, CashTotalIRR = -999999, CreditTotalIRR = -999999, CreditIncreaseIRR = -999999, CashProfitOrLossIRR = 999999 }] };
            if (schedules)
            {
                var half = credit ? 1200 : 1000;
                sale.PaymentSchedules = [new SalePaymentSchedule { Sequence = 1, AmountIRR = half, ExchangeRate = 1, DueDate = A5Date.AddDays(10), DueDaysFromSale = 999 },
                    new SalePaymentSchedule { Sequence = 2, AmountUSD = half / 100m, ExchangeRate = 999999, DueDate = A5Date.AddDays(30), DueDaysFromSale = 999 }];
            }
            // Customer normally cannot create sales; temporarily grant creation, then remove before the post assertions.
            if (role == "Customer") await SetPermissions(host, A5Email, "sales.create");
            var response = await host.Client.PostAsJsonAsync("/api/sales", sale);
            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
            sale = (await response.Content.ReadFromJsonAsync<Sale>())!;
            // The derived day count is also re-established at the posting boundary, not trusted from stored child input.
            await using (var db = sql.Context())
            {
                foreach (var row in await db.SalePaymentSchedules.Where(x => x.SaleId == sale.Id).ToListAsync()) row.DueDaysFromSale = 999;
                await db.SaveChangesAsync();
            }
            return new A5Fixture(sql, host, sale, actor, rate.Id, first.Id, last.Id);
        }
        catch { if (host is not null) await host.DisposeAsync(); await sql.DisposeAsync(); throw; }
    }

    private static async Task A5AssertUnposted(A5Fixture f)
    {
        await using var db = f.Sql.Context();
        Assert.Equal(DocumentStatus.Draft, (await db.Sales.FindAsync(f.Sale.Id))!.Status);
        Assert.All(await db.InventoryLayers.ToListAsync(), x => Assert.Equal(3m, x.RemainingQuantity));
        Assert.Empty(await db.SaleCostAllocations.ToListAsync()); Assert.Empty(await db.InventoryMovements.ToListAsync());
        Assert.Empty(await db.PartnerLedgerEntries.ToListAsync()); Assert.Empty(await db.AuditLogs.Where(x => x.EntityId == f.Sale.Id.ToString()).ToListAsync());
    }

    private static async Task A5AssertShares(AppDbContext db, Guid saleId, string type, decimal amount, decimal iranianPercent)
    {
        var entries = await db.PartnerLedgerEntries.Where(x => x.SourceDocumentId == saleId && x.EntryType == type).ToListAsync(); Assert.Equal(2, entries.Count);
        var iranian = entries.Single(x => x.PartnerId == Guid.Parse("11111111-1111-1111-1111-111111111111"));
        var chinese = entries.Single(x => x.PartnerId == Guid.Parse("22222222-2222-2222-2222-222222222222"));
        Assert.Equal(amount * iranianPercent / 100, iranian.CreditIRR - iranian.DebitIRR);
        Assert.Equal(amount * (100 - iranianPercent) / 100, chinese.CreditIRR - chinese.DebitIRR);
    }

    private sealed record A5Fixture(A4SqlDatabase Sql, TestApp Host, Sale Sale, Guid ActorId, Guid RateId, Guid FirstLayerId, Guid LastLayerId) : IAsyncDisposable
    {
        public Task<HttpResponseMessage> Post(object body) => Host.Client.PostAsJsonAsync(A4Version($"/api/sales/{Sale.Id}/post", Sale.RowVersion), body);
        public async ValueTask DisposeAsync() { await Host.DisposeAsync(); await Sql.DisposeAsync(); }
    }

    private sealed class A5SaleRace : SaveChangesInterceptor
    {
        public A4SqlDatabase? Sql { get; set; }
        public Guid SaleId { get; set; }
        public bool Fired { get; private set; }
        public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData eventData, InterceptionResult<int> result, CancellationToken ct = default)
        {
            if (!Fired && Sql is not null && eventData.Context!.ChangeTracker.Entries<Sale>().Any(x => x.Entity.Id == SaleId && x.Entity.Status == DocumentStatus.Posted))
            {
                Fired = true;
                await using var db = Sql.Context();
                var sale = await db.Sales.FindAsync([SaleId], ct); sale!.Notes = "raced draft"; await db.SaveChangesAsync(ct);
            }
            return result;
        }
    }
}
