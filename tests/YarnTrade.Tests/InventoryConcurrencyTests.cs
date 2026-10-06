using System.Collections.Concurrent;
using System.Data;
using System.Data.Common;
using System.Data.SqlTypes;
using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Json;
using System.Xml.Linq;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;
using YarnTrade.Api.Services;

namespace YarnTrade.Tests;

public sealed partial class SecurityBaselineTests
{
    public static IEnumerable<object[]> A6CapacityCases()
    {
        foreach (var method in Enum.GetValues<CostingMethod>())
        foreach (var quantity in new[] { 7m, 5m })
        foreach (var snapshot in new[] { false, true })
            yield return [method, quantity, snapshot];
    }

    [Theory]
    [MemberData(nameof(A6CapacityCases))]
    public async Task A6_sql_overlapping_sales_respect_capacity_for_every_method_and_rcsi(CostingMethod method, decimal quantity, bool snapshot)
    {
        var probe = new A6StockProbe();
        await using var f = await A6Prepare(quantity, method, probe);
        await A6SetSnapshot(f.Sql, snapshot);
        var second = await A6CreateSale(f, [(f.Sale.Items[0].YarnItemId, quantity)]);
        var responses = await A6RunContending(f, probe, () => f.Post(new { }), () => A6Post(f, second));
        Assert.Equal(0, probe.Deadlocks);
        Assert.Equal(2, probe.Reads.Select(x => x.ContextId).Distinct().Count());
        Assert.Equal(2, probe.Reads.Select(x => x.SessionId).Distinct().Count());
        Assert.All(probe.Reads, A6AssertLockSql);
        var succeeded = responses.Select((response, index) => (response, sale: index == 0 ? f.Sale : second)).Where(x => x.response.StatusCode == HttpStatusCode.OK).ToArray();
        Assert.Equal(quantity == 7 ? 1 : 2, succeeded.Length);
        foreach (var (response, sale) in succeeded) await A6AssertResponseToken(f, sale.Id, response);
        if (quantity == 7)
        {
            var loser = responses.Single(x => x.StatusCode == HttpStatusCode.Conflict);
            var json = await loser.Content.ReadFromJsonAsync<JsonElement>();
            Assert.Equal("INSUFFICIENT_STOCK", json.GetProperty("code").GetString());
            Assert.Equal(f.Sale.WarehouseId, json.GetProperty("warehouseId").GetGuid());
            Assert.Equal(f.Sale.Items[0].YarnItemId, json.GetProperty("yarnItemId").GetGuid());
            Assert.Equal(7m, json.GetProperty("requiredQuantity").GetDecimal()); Assert.Equal(3m, json.GetProperty("availableQuantity").GetDecimal());
        }
        await using var db = f.Sql.Context();
        var layers = await db.InventoryLayers.ToListAsync();
        Assert.All(layers, x => Assert.True(x.RemainingQuantity >= 0));
        Assert.Equal(quantity == 7 ? 3m : 0m, layers.Sum(x => x.RemainingQuantity));
        Assert.Equal(quantity == 7 ? -7m : -10m, await db.InventoryMovements.SumAsync(x => x.Quantity));
        foreach (var sale in new[] { f.Sale, second })
        {
            var posted = succeeded.Any(x => x.sale.Id == sale.Id);
            Assert.Equal(posted ? DocumentStatus.Posted : DocumentStatus.Draft, (await db.Sales.FindAsync(sale.Id))!.Status);
            Assert.Equal(posted ? 1 : 0, await db.InventoryMovements.CountAsync(x => x.SourceDocumentId == sale.Id));
            Assert.Equal(posted ? 2 : 0, await db.PartnerLedgerEntries.CountAsync(x => x.SourceDocumentId == sale.Id));
            Assert.Equal(posted ? 2 : 0, await db.AuditLogs.CountAsync(x => x.EntityId == sale.Id.ToString()));
            var itemIds = sale.Items.Select(x => x.Id).ToArray();
            var allocations = await db.SaleCostAllocations.Where(x => itemIds.Contains(x.SaleItemId)).ToListAsync();
            if (posted && method != CostingMethod.WeightedAverage) Assert.Equal(quantity, allocations.Sum(x => x.Quantity));
            else Assert.Empty(allocations);
        }
    }

    [Fact]
    public async Task A6_sql_control_reproduces_legacy_unlocked_lost_update()
    {
        await using var f = await A6Prepare(7, CostingMethod.FIFO);
        var bothRead = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously); var readCount = 0;
        async Task<decimal> LegacyAttempt()
        {
            await using var db = f.Sql.Context();
            await using var transaction = await db.Database.BeginTransactionAsync();
            var layer = await db.InventoryLayers.SingleAsync(x => x.Id == f.FirstLayerId);
            if (Interlocked.Increment(ref readCount) == 2) bothRead.SetResult();
            await bothRead.Task.WaitAsync(TimeSpan.FromSeconds(20));
            var before = layer.RemainingQuantity; layer.RemainingQuantity -= 7;
            await db.SaveChangesAsync(); await transaction.CommitAsync(); return before;
        }
        var reads = await Task.WhenAll(LegacyAttempt(), LegacyAttempt()).WaitAsync(TimeSpan.FromSeconds(30));
        Assert.Equal([10m, 10m], reads);
        await using var check = f.Sql.Context();
        // This disposable control intentionally uses the OLD unprotected read/modify/write, not the protected posting service.
        Assert.Equal(3m, (await check.InventoryLayers.FindAsync(f.FirstLayerId))!.RemainingQuantity);
        Assert.Equal(14m, reads.Sum(x => x - 3));
    }

    [Theory]
    [InlineData(CostingMethod.FIFO)]
    [InlineData(CostingMethod.LIFO)]
    [InlineData(CostingMethod.WeightedAverage)]
    public async Task A6_sql_multiple_yarns_lock_in_global_order_despite_opposite_line_order(CostingMethod method)
    {
        var probe = new A6StockProbe();
        await using var f = await A6Prepare(4, method, probe);
        var x = f.Sale.Items[0].YarnItemId; var y = await A6AddYarn(f, 10);
        var saleA = await A6CreateSale(f, [(x, 4), (y, 4)]);
        var saleB = await A6CreateSale(f, [(y, 4), (x, 4)]);
        var responses = await A6RunContending(f, probe, () => A6Post(f, saleA), () => A6Post(f, saleB));
        Assert.All(responses, r => Assert.Equal(HttpStatusCode.OK, r.StatusCode)); Assert.Equal(0, probe.Deadlocks);
        foreach (var reads in probe.Reads.GroupBy(x => x.ContextId))
            Assert.Equal(new[] { x, y }.OrderBy(id => new SqlGuid(id)), reads.Select(r => r.YarnItemId));
        await using var db = f.Sql.Context();
        foreach (var yarn in new[] { x, y })
            Assert.Equal(2m, await db.InventoryLayers.Where(l => l.YarnItemId == yarn).SumAsync(l => l.RemainingQuantity));
        Assert.Equal(4, await db.InventoryMovements.CountAsync());
    }

    [Theory]
    [InlineData(CostingMethod.FIFO, false)]
    [InlineData(CostingMethod.FIFO, true)]
    [InlineData(CostingMethod.LIFO, false)]
    [InlineData(CostingMethod.LIFO, true)]
    public async Task A6_sql_sale_and_reversal_reconcile_in_either_lock_order(CostingMethod method, bool reversalFirst)
    {
        var probe = new A6StockProbe();
        await using var f = await A6Prepare(7, method, probe);
        var postedResponse = await f.Post(new { }); Assert.Equal(HttpStatusCode.OK, postedResponse.StatusCode);
        var postedToken = Convert.FromBase64String((await postedResponse.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("rowVersion").GetString()!);
        var second = await A6CreateSale(f, [(f.Sale.Items[0].YarnItemId, 2)]);
        probe.PrioritySale = reversalFirst ? f.Sale.Id : second.Id;
        var responses = await A6RunContending(f, probe, () => A6Post(f, second),
            () => f.Host.Client.PostAsync(A4Version($"/api/sales/{f.Sale.Id}/reverse", postedToken), null));
        Assert.All(responses, r => Assert.Equal(HttpStatusCode.OK, r.StatusCode)); Assert.Equal(0, probe.Deadlocks);
        await A6AssertResponseToken(f, second.Id, responses[0]); await A6AssertResponseToken(f, f.Sale.Id, responses[1]);
        await using var db = f.Sql.Context();
        Assert.Equal(8m, await db.InventoryLayers.SumAsync(x => x.RemainingQuantity));
        Assert.Equal(-2m, await db.InventoryMovements.SumAsync(x => x.Quantity));
        Assert.Equal(DocumentStatus.Reversed, (await db.Sales.FindAsync(f.Sale.Id))!.Status);
        Assert.Equal(DocumentStatus.Posted, (await db.Sales.FindAsync(second.Id))!.Status);
        Assert.Equal(2, await db.PartnerLedgerEntries.CountAsync(x => x.SourceDocumentType == "SaleReversal"));
    }

    [Fact]
    public async Task A6_sql_unrelated_stock_can_hold_locks_at_the_same_time()
    {
        var probe = new A6StockProbe { HoldBoth = true };
        await using var f = await A6Prepare(5, CostingMethod.FIFO, probe);
        var otherWarehouse = Guid.Parse("00000000-0000-0000-0000-000000000001");
        var boundaryWarehouse = Guid.Parse("00000000-0000-0000-0000-000000000002");
        await using (var db = f.Sql.Context())
        {
            db.Warehouses.Add(new Warehouse { Id = otherWarehouse, Code = "A6-W2", NameFa = "انبار مستقل", NameEn = "Independent warehouse" });
            // A non-target boundary key keeps this proof independent of normal adjacent-gap range contention.
            db.InventoryLayers.AddRange(A6Layer(otherWarehouse, f.Sale.Items[0].YarnItemId, 10), A6Layer(boundaryWarehouse, f.Sale.Items[0].YarnItemId, 1));
            await db.SaveChangesAsync();
        }
        var second = await A6CreateSale(f, [(f.Sale.Items[0].YarnItemId, 5)], otherWarehouse);
        probe.Enabled = true;
        var a = f.Post(new { }); var b = A6Post(f, second);
        try { await probe.BothRead.Task.WaitAsync(TimeSpan.FromSeconds(20)); }
        finally { probe.Release.TrySetResult(); }
        var responses = await Task.WhenAll(a, b).WaitAsync(TimeSpan.FromSeconds(30));
        Assert.All(responses, r => Assert.Equal(HttpStatusCode.OK, r.StatusCode)); Assert.Equal(0, probe.Deadlocks);
        Assert.Equal(2, probe.Reads.Select(x => x.SessionId).Distinct().Count());
        await using var check = f.Sql.Context();
        foreach (var warehouse in new[] { f.Sale.WarehouseId, otherWarehouse })
            Assert.Equal(5m, await check.InventoryLayers.Where(x => x.WarehouseId == warehouse).SumAsync(x => x.RemainingQuantity));
    }

    [Fact]
    public async Task A6_sql_duplicate_yarn_demand_rejects_before_any_other_item_is_posted()
    {
        var capture = new A6SqlCapture();
        await using var f = await A6Prepare(1, CostingMethod.FIFO, capture);
        var other = await A6AddYarn(f, 20);
        var sale = await A6CreateSale(f, [(other, 1), (f.Sale.Items[0].YarnItemId, 6), (f.Sale.Items[0].YarnItemId, 6)]);
        capture.Enabled = true;
        var response = await A6Post(f, sale); Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var json = await response.Content.ReadFromJsonAsync<JsonElement>(); Assert.Equal("INSUFFICIENT_STOCK", json.GetProperty("code").GetString());
        Assert.Equal(12m, json.GetProperty("requiredQuantity").GetDecimal()); Assert.Equal(10m, json.GetProperty("availableQuantity").GetDecimal());
        Assert.Equal(2, capture.Commands.Count);
        await using var db = f.Sql.Context(); Assert.Equal(30m, await db.InventoryLayers.SumAsync(x => x.RemainingQuantity));
        await A6AssertNoEffects(f, sale);
    }

    [Fact]
    public async Task A6_sql_empty_stock_key_returns_safe_shortage_metadata()
    {
        await using var f = await A6Prepare(1, CostingMethod.FIFO);
        await using (var db = f.Sql.Context()) { db.InventoryLayers.RemoveRange(await db.InventoryLayers.ToListAsync()); await db.SaveChangesAsync(); }
        var response = await f.Post(new { }); Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var json = await response.Content.ReadFromJsonAsync<JsonElement>(); Assert.Equal("INSUFFICIENT_STOCK", json.GetProperty("code").GetString());
        Assert.Equal(0m, json.GetProperty("availableQuantity").GetDecimal()); await A6AssertNoEffects(f, f.Sale);
    }

    [Fact]
    public async Task A6_sql_locked_database_values_replace_stale_pretracked_layer_values()
    {
        await using var f = await A6Prepare(7, CostingMethod.FIFO);
        using var scope = f.Host.App.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var stale = await db.InventoryLayers.FindAsync(f.FirstLayerId); Assert.Equal(10m, stale!.RemainingQuantity);
        await using (var other = f.Sql.Context()) { (await other.InventoryLayers.FindAsync(f.FirstLayerId))!.RemainingQuantity = 3; await other.SaveChangesAsync(); }
        var actor = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, f.ActorId.ToString())], "test"));
        var rejected = await Assert.ThrowsAsync<SalePostingRejectedException>(() => scope.ServiceProvider.GetRequiredService<PostingService>().PostSaleAsync(f.Sale.Id, actor, false, default));
        Assert.Equal(409, rejected.StatusCode); Assert.Equal("INSUFFICIENT_STOCK", JsonSerializer.SerializeToElement(rejected.Response).GetProperty("code").GetString());
        Assert.Equal(EntityState.Detached, db.Entry(stale).State); await A6AssertNoEffects(f, f.Sale);
    }

    [Theory]
    [InlineData(CostingMethod.FIFO)]
    [InlineData(CostingMethod.LIFO)]
    [InlineData(CostingMethod.WeightedAverage)]
    public async Task A6_sql_equal_timestamp_layers_have_stable_physical_order_and_unchanged_cost_formula(CostingMethod method)
    {
        await using var f = await A6Prepare(6, method);
        var a = Guid.Parse("00000001-0000-0000-0000-000000000000");
        var b = Guid.Parse("00000000-0000-0000-0000-000000000001");
        Assert.True(a.CompareTo(b) > 0); Assert.True(new SqlGuid(a).CompareTo(new SqlGuid(b)) < 0);
        var older = Guid.NewGuid(); var newer = Guid.NewGuid(); var warehouse = f.Sale.WarehouseId; var yarn = f.Sale.Items[0].YarnItemId;
        await using (var db = f.Sql.Context())
        {
            db.InventoryLayers.RemoveRange(await db.InventoryLayers.ToListAsync());
            var rows = new[] { A6Layer(warehouse, yarn, 2, 1, older, -3), A6Layer(warehouse, yarn, 3, 3, a, -2),
                A6Layer(warehouse, yarn, 3, 5, b, -2), A6Layer(warehouse, yarn, 2, 7, newer, -1) };
            db.InventoryLayers.AddRange(rows.Reverse()); await db.SaveChangesAsync();
        }
        var expected = method == CostingMethod.LIFO ? new[] { newer, b, a } : new[] { older, a, b };
        var expectedCost = method == CostingMethod.FIFO ? 16m : method == CostingMethod.LIFO ? 32m : 24m;
        for (var iteration = 0; iteration < (method == CostingMethod.WeightedAverage ? 1 : 2); iteration++)
        {
            var sale = iteration == 0 ? f.Sale : await A6CreateSale(f, [(yarn, 6)]);
            var response = await A6Post(f, sale); Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var token = Convert.FromBase64String((await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("rowVersion").GetString()!);
            await using var db = f.Sql.Context();
            var item = await db.SaleItems.SingleAsync(x => x.SaleId == sale.Id); Assert.Equal(expectedCost, item.CostUSD);
            var quantities = await db.InventoryLayers.ToDictionaryAsync(x => x.Id, x => x.RemainingQuantity);
            Assert.Equal(0m, quantities[expected[0]]); Assert.Equal(0m, quantities[expected[1]]); Assert.Equal(2m, quantities[expected[2]]);
            var allocations = await db.SaleCostAllocations.Where(x => x.SaleItemId == item.Id).ToListAsync();
            if (method == CostingMethod.WeightedAverage) Assert.Empty(allocations);
            else
            {
                Assert.Equal(new[] { 2m, 3m, 1m }, expected.Select(id => allocations.Single(x => x.InventoryLayerId == id).Quantity));
                Assert.Equal(expectedCost, allocations.Sum(x => x.TotalCostUSD));
                var reverse = await f.Host.Client.PostAsync(A4Version($"/api/sales/{sale.Id}/reverse", token), null);
                Assert.Equal(HttpStatusCode.OK, reverse.StatusCode);
            }
        }
        if (method == CostingMethod.WeightedAverage)
        {
            // Characterize the independent existing missing-lineage issue, explicitly deferred by the A6 request.
            await using var db = f.Sql.Context(); var token = (await db.Sales.FindAsync(f.Sale.Id))!.RowVersion;
            Assert.Equal(HttpStatusCode.OK, (await f.Host.Client.PostAsync(A4Version($"/api/sales/{f.Sale.Id}/reverse", token), null)).StatusCode);
            Assert.Equal(4m, await db.InventoryLayers.SumAsync(x => x.RemainingQuantity));
        }
    }

    [Fact]
    public async Task A6_sql_existing_index_seeks_parameterized_stock_key_without_schema_change()
    {
        var capture = new A6SqlCapture();
        await using var f = await A6Prepare(1, CostingMethod.FIFO, capture);
        await using (var db = f.Sql.Context())
        {
            var unrelatedWarehouse = Guid.NewGuid();
            db.InventoryLayers.AddRange(Enumerable.Range(0, 2000).Select(_ => A6Layer(unrelatedWarehouse, Guid.NewGuid(), 10)));
            await db.SaveChangesAsync();
        }
        capture.Enabled = true;
        Assert.Equal(HttpStatusCode.OK, (await f.Post(new { })).StatusCode);
        var query = Assert.Single(capture.Commands); Assert.Equal(2, query.Parameters.Length);
        Assert.All(query.Parameters, x => Assert.IsType<Guid>(x.Value));
        A6AssertLockSql(new(Guid.Empty, f.Sale.Id, 0, f.Sale.WarehouseId, f.Sale.Items[0].YarnItemId, query.Sql));
        await using var connection = new SqlConnection(f.Sql.Connection); await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT COUNT(*) FROM sys.indexes WHERE object_id = OBJECT_ID(N'InventoryLayers') AND is_primary_key = 1 AND type = 1";
        Assert.Equal(1, (int)(await command.ExecuteScalarAsync())!);
        command.CommandText = "SET STATISTICS XML ON"; await command.ExecuteNonQueryAsync();
        try
        {
            command.CommandText = query.Sql;
            foreach (var parameter in query.Parameters) command.Parameters.Add(new SqlParameter(parameter.Name, parameter.Type) { Value = parameter.Value });
            string? planText = null; var stockRows = 0;
            await using (var reader = await command.ExecuteReaderAsync())
            {
                do
                {
                    while (await reader.ReadAsync())
                    {
                        if (reader.FieldCount == 1 && reader.GetValue(0) is string text && text.Contains("ShowPlanXML", StringComparison.Ordinal)) planText = text;
                        else stockRows++;
                    }
                } while (await reader.NextResultAsync());
            }
            Assert.Equal(2, stockRows); Assert.NotNull(planText);
            var plan = XDocument.Parse(planText);
            XNamespace ns = "http://schemas.microsoft.com/sqlserver/2004/07/showplan";
            Assert.Contains(plan.Descendants(ns + "RelOp"), op => (string?)op.Attribute("PhysicalOp") == "Index Seek" &&
                op.Descendants(ns + "Object").Any(obj => (string?)obj.Attribute("Index") == "[IX_InventoryLayers_WarehouseId_YarnItemId_ReceivedAtUtc]"));
            Assert.DoesNotContain(plan.Descendants(ns + "RelOp"), op => (string?)op.Attribute("PhysicalOp") is "Table Scan" or "Index Scan");
            Assert.Contains(plan.Descendants(ns + "ColumnReference"), column => (string?)column.Attribute("Column") == "Id");
        }
        finally { command.Parameters.Clear(); command.CommandText = "SET STATISTICS XML OFF"; await command.ExecuteNonQueryAsync(); }
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task A6_sql_transient_retry_reacquires_current_stock_and_preserves_document_version(bool reversal)
    {
        var probe = new A6RetryStockProbe { Reversal = reversal };
        await using var f = await A6Prepare(7, CostingMethod.FIFO, probe);
        var expectedVersion = f.Sale.RowVersion;
        if (reversal)
        {
            var posted = await f.Post(new { }); Assert.Equal(HttpStatusCode.OK, posted.StatusCode);
            expectedVersion = Convert.FromBase64String((await posted.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("rowVersion").GetString()!);
        }
        probe.Sql = f.Sql; probe.LayerId = f.FirstLayerId; probe.SaleId = f.Sale.Id;
        var response = reversal ? await f.Host.Client.PostAsync(A4Version($"/api/sales/{f.Sale.Id}/reverse", expectedVersion), null) : await f.Post(new { });
        Assert.True(probe.ChangedBetweenAttempts); Assert.Equal(expectedVersion, probe.FirstExpectedVersion);
        await using var db = f.Sql.Context();
        if (reversal)
        {
            Assert.Equal(HttpStatusCode.OK, response.StatusCode); Assert.Equal(2, probe.SaveAttempts);
            Assert.Equal(expectedVersion, probe.FinalExpectedVersion); Assert.True(probe.FirstInstanceDetached);
            await A6AssertResponseToken(f, f.Sale.Id, response);
            Assert.Equal(8m, (await db.InventoryLayers.FindAsync(f.FirstLayerId))!.RemainingQuantity);
            Assert.Equal(1, await db.AuditLogs.CountAsync(x => x.EntityId == f.Sale.Id.ToString() && x.Action == "Reverse"));
        }
        else
        {
            Assert.Equal(HttpStatusCode.Conflict, response.StatusCode); Assert.Equal(1, probe.SaveAttempts);
            var json = await response.Content.ReadFromJsonAsync<JsonElement>(); Assert.Equal("INSUFFICIENT_STOCK", json.GetProperty("code").GetString());
            Assert.Equal(4m, json.GetProperty("availableQuantity").GetDecimal());
            Assert.Equal(4m, (await db.InventoryLayers.FindAsync(f.FirstLayerId))!.RemainingQuantity);
            Assert.Equal(expectedVersion, (await db.Sales.FindAsync(f.Sale.Id))!.RowVersion); await A6AssertNoEffects(f, f.Sale);
        }
    }

    [Theory]
    [InlineData(CostingMethod.FIFO)]
    [InlineData(CostingMethod.LIFO)]
    [InlineData(CostingMethod.WeightedAverage)]
    public async Task A6_sql_negative_stock_invariant_fails_without_clamping_or_partial_post(CostingMethod method)
    {
        await using var f = await A6Prepare(1, method);
        await using (var db = f.Sql.Context())
        {
            var corrupt = await db.InventoryLayers.FindAsync(f.LastLayerId); corrupt!.RemainingQuantity = -1;
            corrupt.ReceivedAtUtc = A5Date.AddDays(-3).ToDateTime(TimeOnly.MinValue); await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.InternalServerError, (await f.Post(new { })).StatusCode);
        await using var check = f.Sql.Context();
        Assert.Equal(10m, (await check.InventoryLayers.FindAsync(f.FirstLayerId))!.RemainingQuantity);
        Assert.Equal(-1m, (await check.InventoryLayers.FindAsync(f.LastLayerId))!.RemainingQuantity); await A6AssertNoEffects(f, f.Sale);
    }

    // One injected timeout uses EF's real retry strategy; a separate SQL context changes stock before reacquisition.
    private sealed class A6RetryStockProbe : DbCommandInterceptor, ISaveChangesInterceptor
    {
        public A4SqlDatabase? Sql { get; set; }
        public Guid SaleId { get; set; }
        public Guid LayerId { get; set; }
        public bool Reversal { get; set; }
        public int SaveAttempts { get; private set; }
        public bool ChangedBetweenAttempts { get; private set; }
        public bool FirstInstanceDetached { get; private set; }
        public byte[]? FirstExpectedVersion { get; private set; }
        public byte[]? FinalExpectedVersion { get; private set; }
        private Sale? firstSale;

        public ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
        {
            var entry = eventData.Context!.ChangeTracker.Entries<Sale>().SingleOrDefault(x => x.Entity.Id == SaleId &&
                x.Entity.Status == (Reversal ? DocumentStatus.Reversed : DocumentStatus.Posted));
            if (Sql is null || entry is null) return ValueTask.FromResult(result);
            SaveAttempts++;
            if (SaveAttempts == 1)
            {
                firstSale = entry.Entity; FirstExpectedVersion = entry.Property(x => x.RowVersion).OriginalValue.ToArray();
                throw new TimeoutException("One simulated inventory transaction timeout.");
            }
            FinalExpectedVersion = entry.Property(x => x.RowVersion).OriginalValue.ToArray();
            FirstInstanceDetached = eventData.Context.Entry(firstSale!).State == EntityState.Detached;
            return ValueTask.FromResult(result);
        }

        public override async ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result, CancellationToken ct = default)
        {
            if (Sql is not null && SaveAttempts == 1 && !ChangedBetweenAttempts && command.CommandText.Contains("FROM [InventoryLayers]", StringComparison.Ordinal))
            {
                ChangedBetweenAttempts = true;
                await using var other = Sql.Context();
                (await other.InventoryLayers.FindAsync([LayerId], ct))!.RemainingQuantity = Reversal ? 1 : 4;
                await other.SaveChangesAsync(ct);
            }
            return result;
        }
    }

    private static InventoryLayer A6Layer(Guid warehouse, Guid yarn, decimal quantity, decimal unitCost = 4, Guid? id = null, int days = -2) => new()
    {
        Id = id ?? Guid.NewGuid(), WarehouseId = warehouse, YarnItemId = yarn, PurchaseInvoiceItemId = Guid.NewGuid(),
        ReceivedAtUtc = A5Date.AddDays(days).ToDateTime(TimeOnly.MinValue), OriginalQuantity = quantity, RemainingQuantity = quantity, UnitPurchaseUSD = unitCost
    };

    private static async Task<Guid> A6AddYarn(A5Fixture f, decimal stock)
    {
        await using var db = f.Sql.Context(); var source = await db.YarnItems.FindAsync(f.Sale.Items[0].YarnItemId);
        var yarn = new YarnItem { YarnTypeId = source!.YarnTypeId, Code = "A6-" + Guid.NewGuid().ToString("N"), NameFa = "نخ دوم", NameEn = "Second yarn" };
        db.YarnItems.Add(yarn); db.InventoryLayers.Add(A6Layer(f.Sale.WarehouseId, yarn.Id, stock)); await db.SaveChangesAsync(); return yarn.Id;
    }

    private static async Task A6AssertNoEffects(A5Fixture f, Sale sale)
    {
        await using var db = f.Sql.Context(); Assert.Equal(DocumentStatus.Draft, (await db.Sales.FindAsync(sale.Id))!.Status);
        var itemIds = await db.SaleItems.Where(x => x.SaleId == sale.Id).Select(x => x.Id).ToListAsync();
        Assert.Empty(await db.SaleCostAllocations.Where(x => itemIds.Contains(x.SaleItemId)).ToListAsync());
        Assert.Empty(await db.InventoryMovements.Where(x => x.SourceDocumentId == sale.Id).ToListAsync());
        Assert.Empty(await db.PartnerLedgerEntries.Where(x => x.SourceDocumentId == sale.Id).ToListAsync());
        Assert.Empty(await db.AuditLogs.Where(x => x.EntityId == sale.Id.ToString()).ToListAsync());
    }

    private sealed record A6Parameter(string Name, SqlDbType Type, object Value);
    private sealed record A6CapturedQuery(string Sql, A6Parameter[] Parameters);
    private sealed class A6SqlCapture : DbCommandInterceptor
    {
        public bool Enabled { get; set; }
        public List<A6CapturedQuery> Commands { get; } = [];
        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result, CancellationToken cancellationToken = default)
        {
            if (Enabled && command.CommandText.Contains("FROM [InventoryLayers]", StringComparison.Ordinal))
                Commands.Add(new(command.CommandText, command.Parameters.Cast<SqlParameter>().Select(x => new A6Parameter(x.ParameterName, x.SqlDbType, x.Value!)).ToArray()));
            return ValueTask.FromResult(result);
        }
    }

    private static async Task<A5Fixture> A6Prepare(decimal quantity, CostingMethod method, IInterceptor? interceptor = null)
    {
        var f = await A5Create(credit: false, schedules: false, interceptor: interceptor);
        try
        {
            await using var db = f.Sql.Context();
            var first = await db.InventoryLayers.FindAsync(f.FirstLayerId); first!.OriginalQuantity = first.RemainingQuantity = 10;
            var last = await db.InventoryLayers.FindAsync(f.LastLayerId); last!.OriginalQuantity = last.RemainingQuantity = 0;
            (await db.SystemSettings.SingleAsync(x => x.Key == "CostingMethod")).Value = method.ToString();
            var sale = await db.Sales.Include(x => x.Items).SingleAsync(x => x.Id == f.Sale.Id);
            sale.Items[0].Quantity = quantity; sale.Notes = "A6 fixture"; await db.SaveChangesAsync();
            f.Sale.RowVersion = sale.RowVersion; f.Sale.Items[0].Quantity = quantity; return f;
        }
        catch { await f.DisposeAsync(); throw; }
    }

    private static async Task<Sale> A6CreateSale(A5Fixture f, (Guid Yarn, decimal Quantity)[] demand, Guid? warehouse = null)
    {
        var sale = new Sale { SaleNumber = "A6-" + Guid.NewGuid().ToString("N"), SaleDate = A5Date, CustomerId = f.Sale.CustomerId,
            SellerId = f.Sale.SellerId, WarehouseId = warehouse ?? f.Sale.WarehouseId, SaleMode = SaleMode.Cash,
            Items = demand.Select(x => new SaleItem { YarnItemId = x.Yarn, Quantity = x.Quantity, CashUnitPriceSnapshotIRR = 1000 }).ToList() };
        var response = await f.Host.Client.PostAsJsonAsync("/api/sales", sale); Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<Sale>())!;
    }

    private static Task<HttpResponseMessage> A6Post(A5Fixture f, Sale sale) =>
        f.Host.Client.PostAsJsonAsync(A4Version($"/api/sales/{sale.Id}/post", sale.RowVersion), new { });

    private static async Task A6AssertResponseToken(A5Fixture f, Guid id, HttpResponseMessage response)
    {
        var json = await response.Content.ReadFromJsonAsync<JsonElement>(); Assert.Equal(id, json.GetProperty("id").GetGuid());
        var token = Convert.FromBase64String(json.GetProperty("rowVersion").GetString()!);
        await using var db = f.Sql.Context(); Assert.Equal((await db.Sales.AsNoTracking().SingleAsync(x => x.Id == id)).RowVersion, token);
    }

    private static async Task<HttpResponseMessage[]> A6RunContending(A5Fixture f, A6StockProbe probe,
        Func<Task<HttpResponseMessage>> first, Func<Task<HttpResponseMessage>> second)
    {
        probe.Enabled = true;
        var firstTask = first(); var secondTask = second();
        try
        {
            var holder = await probe.FirstRead.Task.WaitAsync(TimeSpan.FromSeconds(20));
            var waiter = probe.Reads.First(x => x.SessionId != holder.SessionId);
            await A6WaitForBlocking(f.Sql, waiter.SessionId, holder.SessionId);
        }
        finally { probe.Release.TrySetResult(); }
        return await Task.WhenAll(firstTask, secondTask).WaitAsync(TimeSpan.FromSeconds(30));
    }

    private static async Task A6WaitForBlocking(A4SqlDatabase sql, int waiter, int holder)
    {
        await using var connection = new SqlConnection(sql.Connection); await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT COUNT(*) FROM sys.dm_exec_requests WHERE session_id = @waiter AND blocking_session_id = @holder AND wait_type LIKE 'LCK_M%'";
        command.Parameters.AddWithValue("@waiter", waiter); command.Parameters.AddWithValue("@holder", holder);
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        while ((int)(await command.ExecuteScalarAsync(timeout.Token))! == 0) await Task.Delay(20, timeout.Token);
    }

    private static async Task A6SetSnapshot(A4SqlDatabase sql, bool enabled)
    {
        var builder = new SqlConnectionStringBuilder(sql.Connection); var name = builder.InitialCatalog;
        Assert.Matches("^YarnTrade_A4_Test_[0-9a-f]{32}$", name); builder.InitialCatalog = "master";
        await using var connection = new SqlConnection(builder.ConnectionString); await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = $"ALTER DATABASE [{name}] SET READ_COMMITTED_SNAPSHOT {(enabled ? "ON" : "OFF")}";
        await command.ExecuteNonQueryAsync();
    }

    private sealed record A6StockRead(Guid ContextId, Guid SaleId, int SessionId, Guid WarehouseId, Guid YarnItemId, string Sql);

    private static void A6AssertLockSql(A6StockRead read)
    {
        Assert.Contains("UPDLOCK", read.Sql); Assert.Contains("HOLDLOCK", read.Sql); Assert.Contains("ROWLOCK", read.Sql);
        Assert.Contains("FORCESEEK", read.Sql); Assert.Contains("IX_InventoryLayers_WarehouseId_YarnItemId_ReceivedAtUtc", read.Sql);
        Assert.DoesNotContain(read.WarehouseId.ToString(), read.Sql, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(read.YarnItemId.ToString(), read.Sql, StringComparison.OrdinalIgnoreCase);
    }

    // These gates only synchronize disposable SQL tests. Production uses database locks, never these process-local gates.
    private sealed class A6StockProbe : DbCommandInterceptor
    {
        public bool Enabled { get; set; }
        public bool HoldBoth { get; set; }
        public Guid? PrioritySale { get; set; }
        public int Deadlocks;
        public ConcurrentQueue<A6StockRead> Reads { get; } = new();
        public TaskCompletionSource<A6StockRead> FirstRead { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource BothRead { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Release { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly ConcurrentDictionary<Guid, bool> started = new();
        private readonly TaskCompletionSource bothStarted = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private int heldSession; private int completedReaders;
        private static bool IsStock(DbCommand command) => command.CommandText.Contains("FROM [InventoryLayers]", StringComparison.Ordinal);

        public override async ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result, CancellationToken ct = default)
        {
            if (!Enabled || !IsStock(command)) return result;
            var context = eventData.Context!; var sale = context.ChangeTracker.Entries<Sale>().Single().Entity;
            var guids = command.Parameters.Cast<DbParameter>().Where(x => x.Value is Guid).Select(x => (Guid)x.Value!).ToArray();
            Reads.Enqueue(new(context.ContextId.InstanceId, sale.Id, ((SqlConnection)command.Connection!).ServerProcessId, guids[0], guids[1], command.CommandText));
            if (started.TryAdd(context.ContextId.InstanceId, true) && started.Count == 2) bothStarted.TrySetResult();
            await bothStarted.Task.WaitAsync(TimeSpan.FromSeconds(20), ct);
            if (PrioritySale.HasValue && sale.Id != PrioritySale) await FirstRead.Task.WaitAsync(TimeSpan.FromSeconds(20), ct);
            return result;
        }

        public override async ValueTask<DbDataReader> ReaderExecutedAsync(DbCommand command, CommandExecutedEventData eventData, DbDataReader result, CancellationToken ct = default)
        {
            if (!Enabled || !IsStock(command)) return result;
            var session = ((SqlConnection)command.Connection!).ServerProcessId;
            var isFirst = Interlocked.CompareExchange(ref heldSession, session, 0) == 0;
            if (isFirst) FirstRead.TrySetResult(Reads.First(x => x.SessionId == session));
            if (Interlocked.Increment(ref completedReaders) == 2) BothRead.TrySetResult();
            if (isFirst || HoldBoth) await Release.Task.WaitAsync(TimeSpan.FromSeconds(25), ct);
            return result;
        }

        public override Task CommandFailedAsync(DbCommand command, CommandErrorEventData eventData, CancellationToken cancellationToken = default)
        {
            if (eventData.Exception is SqlException { Number: 1205 }) Interlocked.Increment(ref Deadlocks);
            return Task.CompletedTask;
        }
    }
}
