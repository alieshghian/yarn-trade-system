using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;
using YarnTrade.Api.Controllers;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;

namespace YarnTrade.Tests;

public sealed partial class SecurityBaselineTests
{
    [Theory]
    [InlineData(null, "CONCURRENCY_TOKEN_REQUIRED")]
    [InlineData("", "CONCURRENCY_TOKEN_REQUIRED")]
    [InlineData("not-base64", "INVALID_CONCURRENCY_TOKEN")]
    [InlineData("AQ==", "INVALID_CONCURRENCY_TOKEN")]
    [InlineData(" AAAAAAAAAAA=", "INVALID_CONCURRENCY_TOKEN")]
    public void A4_token_validation_is_strict(string? value, string code)
    {
        var result = Assert.IsType<Microsoft.AspNetCore.Mvc.BadRequestObjectResult>(AggregateConcurrency.Parse(value, out _));
        Assert.Equal(code, JsonSerializer.SerializeToElement(result.Value).GetProperty("code").GetString());
    }

    [Fact]
    public void A4_mapping_is_generated_and_ledgers_are_excluded()
    {
        using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlServer().Options);
        var audited = db.Model.GetEntityTypes().Where(x => typeof(AuditedEntity).IsAssignableFrom(x.ClrType)).ToArray();
        Assert.Equal(18, audited.Length);
        foreach (var type in audited) {
            var token = type.FindProperty(nameof(AuditedEntity.RowVersion))!;
            Assert.True(token.IsConcurrencyToken);
            Assert.Equal(ValueGenerated.OnAddOrUpdate, token.ValueGenerated);
            Assert.Equal("rowversion", token.GetColumnType());
            Assert.Equal(PropertySaveBehavior.Ignore, token.GetBeforeSaveBehavior());
            Assert.Equal(PropertySaveBehavior.Ignore, token.GetAfterSaveBehavior());
        }
        foreach (var type in new[] { typeof(InventoryMovement), typeof(PartnerLedgerEntry), typeof(CheckOperation), typeof(AuditLog), typeof(InventoryLayer) })
            Assert.Null(db.Model.FindEntityType(type)!.FindProperty(nameof(AuditedEntity.RowVersion)));
        Assert.False(db.Database.HasPendingModelChanges());
    }

    [Fact]
    public async Task A4_sql_migration_preserves_rows_schema_insert_update_stale_context_and_down_up()
    {
        await using var sql = await A4SqlDatabase.Create();
        var id = Guid.NewGuid();
        await using (var db = sql.Context()) {
            await db.GetService<IMigrator>().MigrateAsync(A4SqlDatabase.BeforeA4);
            await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO Persons (Id, PersonCode, PersonType, LastName, DisplayName, PreferredLanguage, CreditLimitIRR, IsActive, PartnerKind, CreatedAtUtc, RowVersion) VALUES ({id}, {"A4-MIGRATION"}, 0, {"Before A4"}, {"Before A4"}, {"fa"}, {12345.67m}, 1, 0, {new DateTime(2026, 1, 1)}, 0x)");
            await db.Database.MigrateAsync();
            var tables = db.Model.GetEntityTypes().Where(x => typeof(AuditedEntity).IsAssignableFrom(x.ClrType)).Select(x => x.GetTableName()!).Order().ToArray();
            await using var connection = new SqlConnection(sql.Connection);
            await connection.OpenAsync();
            await using var command = connection.CreateCommand();
            command.CommandText = "SELECT t.name, c.system_type_id, c.max_length FROM sys.tables t JOIN sys.columns c ON c.object_id = t.object_id WHERE c.name = 'RowVersion' ORDER BY t.name";
            await using var reader = await command.ExecuteReaderAsync();
            var found = new List<string>();
            while (await reader.ReadAsync()) { found.Add(reader.GetString(0)); Assert.Equal((byte)189, reader.GetByte(1)); Assert.Equal((short)8, reader.GetInt16(2)); }
            Assert.Equal(tables, found.Order());
            var preserved = await db.Persons.SingleAsync(x => x.Id == id);
            Assert.Equal("Before A4", preserved.DisplayName); Assert.Equal(12345.67m, preserved.CreditLimitIRR);
            Assert.Equal(new DateTime(2026, 1, 1), preserved.CreatedAtUtc); Assert.Null(preserved.UpdatedAtUtc); Assert.Equal(8, preserved.RowVersion.Length);
            Assert.All(await db.ParameterValues.ToListAsync(), x => Assert.Equal(8, x.RowVersion.Length));
            Assert.All(await db.CreditRateRules.ToListAsync(), x => Assert.Equal(8, x.RowVersion.Length));
            var inserted = new Person { PersonCode = "A4-INSERT", DisplayName = "Inserted" };
            Assert.Empty(inserted.RowVersion); db.Persons.Add(inserted); await db.SaveChangesAsync(); Assert.Equal(8, inserted.RowVersion.Length);
        }
        byte[] first;
        await using (var a = sql.Context()) await using (var b = sql.Context()) {
            var current = await a.Persons.SingleAsync(x => x.Id == id); var stale = await b.Persons.SingleAsync(x => x.Id == id);
            first = current.RowVersion.ToArray(); current.DisplayName = "First writer"; await a.SaveChangesAsync();
            Assert.False(first.SequenceEqual(current.RowVersion)); Assert.NotNull(current.UpdatedAtUtc);
            stale.DisplayName = "Stale writer"; await Assert.ThrowsAsync<DbUpdateConcurrencyException>(() => b.SaveChangesAsync());
        }
        await using (var db = sql.Context()) {
            Assert.Equal("First writer", (await db.Persons.SingleAsync(x => x.Id == id)).DisplayName);
            db.ChangeTracker.Clear();
            await db.GetService<IMigrator>().MigrateAsync(A4SqlDatabase.BeforeA4);
            Assert.Equal(4, await db.Persons.CountAsync());
            await db.Database.MigrateAsync();
            var preserved = await db.Persons.SingleAsync(x => x.Id == id);
            Assert.Equal("First writer", preserved.DisplayName); Assert.Equal(12345.67m, preserved.CreditLimitIRR); Assert.Equal(8, preserved.RowVersion.Length);
            preserved.Notes = "After rollback/reapply"; first = preserved.RowVersion.ToArray(); await db.SaveChangesAsync();
            Assert.False(first.SequenceEqual(preserved.RowVersion));
        }
    }

    [Fact]
    public async Task A4_sql_api_person_rejects_old_token_preserves_newer_values_refetch_retry_and_stale_delete()
    {
        await using var sql = await A4SqlDatabase.CreateLatest();
        await using var host = await CreateApp(sqlConnection: sql.Connection);
        await CreateUser(host.App, "a4@example.test", "Administrator"); await SignIn(host, "a4@example.test");
        var input = new PersonInput { PersonCode = "A4-API", LastName = "Original", CreditLimitIRR = 100 };
        var createdResponse = await host.Client.PostAsJsonAsync("/api/master-data/persons", input);
        Assert.Equal(HttpStatusCode.Created, createdResponse.StatusCode);
        var created = (await createdResponse.Content.ReadFromJsonAsync<PersonView>())!; Assert.Equal(8, created.RowVersion.Length);
        var path = $"/api/master-data/persons/{created.Id}";
        await A4AssertCode(await host.Client.PutAsJsonAsync(path, input), HttpStatusCode.BadRequest, "CONCURRENCY_TOKEN_REQUIRED");
        await A4AssertCode(await host.Client.PutAsJsonAsync(path + "?rowVersion=bad", input), HttpStatusCode.BadRequest, "INVALID_CONCURRENCY_TOKEN");
        input.LastName = "First writer";
        var success = await host.Client.PutAsJsonAsync(A4Version(path, created.RowVersion), input);
        Assert.Equal(HttpStatusCode.OK, success.StatusCode);
        var updated = (await success.Content.ReadFromJsonAsync<PersonView>())!; Assert.False(created.RowVersion.SequenceEqual(updated.RowVersion));
        input.LastName = "Stale writer"; input.CreditLimitIRR = 999;
        await A4AssertCode(await host.Client.PutAsJsonAsync(A4Version(path, created.RowVersion), input), HttpStatusCode.Conflict, AggregateConcurrency.ConflictCode);
        var latest = (await host.Client.GetFromJsonAsync<PersonView>(path))!; Assert.Equal("First writer", latest.LastName); Assert.Equal(100m, latest.CreditLimitIRR);
        await A4AssertCode(await host.Client.DeleteAsync(A4Version(path, created.RowVersion)), HttpStatusCode.Conflict, AggregateConcurrency.ConflictCode);
        await A4AssertCode(await host.Client.DeleteAsync(path), HttpStatusCode.BadRequest, "CONCURRENCY_TOKEN_REQUIRED");
        input.LastName = "Reviewed retry"; input.CreditLimitIRR = 100;
        Assert.Equal(HttpStatusCode.OK, (await host.Client.PutAsJsonAsync(A4Version(path, latest.RowVersion), input)).StatusCode);
        latest = (await host.Client.GetFromJsonAsync<PersonView>(path))!; Assert.Equal("Reviewed retry", latest.LastName);
        Assert.Equal(HttpStatusCode.NoContent, (await host.Client.DeleteAsync(A4Version(path, latest.RowVersion))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await host.Client.GetAsync(path)).StatusCode);
    }

    [Fact]
    public async Task A4_sql_child_only_order_edit_advances_root_and_stale_actions_cannot_replace_children()
    {
        await using var sql = await A4SqlDatabase.CreateLatest();
        await using var host = await CreateApp(sqlConnection: sql.Connection);
        await CreateUser(host.App, "a4-order@example.test", "Administrator"); await SignIn(host, "a4-order@example.test");
        Guid yarnId;
        await using (var db = sql.Context()) {
            var type = new YarnType { Code = "A4", NameFa = "آزمایش", NameEn = "Test" };
            var yarn = new YarnItem { YarnTypeId = type.Id, Code = "A4", NameFa = "نخ آزمایشی", NameEn = "Test yarn" };
            db.YarnTypes.Add(type); db.YarnItems.Add(yarn); await db.SaveChangesAsync(); yarnId = yarn.Id;
        }
        var input = new PurchaseOrderInput { OrderNumber = "A4-ORDER", OrderDate = new DateOnly(2026, 10, 6), Items = [new() { YarnItemId = yarnId, DescriptionSnapshot = "Same header", Quantity = 10 }] };
        var createdResponse = await host.Client.PostAsJsonAsync("/api/purchase-orders", input); Assert.Equal(HttpStatusCode.Created, createdResponse.StatusCode);
        var created = (await createdResponse.Content.ReadFromJsonAsync<PurchaseOrderView>())!;
        var path = $"/api/purchase-orders/{created.Id}";
        input.Items[0].Quantity = 20;
        var updatedResponse = await host.Client.PutAsJsonAsync(A4Version(path, created.RowVersion), input);
        Assert.True(updatedResponse.StatusCode == HttpStatusCode.OK, await updatedResponse.Content.ReadAsStringAsync());
        var updated = (await updatedResponse.Content.ReadFromJsonAsync<PurchaseOrderView>())!; Assert.False(created.RowVersion.SequenceEqual(updated.RowVersion));
        input.Items[0].Quantity = 99;
        await A4AssertCode(await host.Client.PutAsJsonAsync(A4Version(path, created.RowVersion), input), HttpStatusCode.Conflict, AggregateConcurrency.ConflictCode);
        await A4AssertCode(await host.Client.PostAsync(A4Version(path + "/submit", created.RowVersion), null), HttpStatusCode.Conflict, AggregateConcurrency.ConflictCode);
        await A4AssertCode(await host.Client.DeleteAsync(A4Version(path, created.RowVersion)), HttpStatusCode.Conflict, AggregateConcurrency.ConflictCode);
        var latest = (await host.Client.GetFromJsonAsync<PurchaseOrderView>(path))!; Assert.Equal(20, latest.Items.Single().Quantity); Assert.Equal(PurchaseOrderStatus.Draft, latest.Status);
        var submittedResponse = await host.Client.PostAsync(A4Version(path + "/submit", latest.RowVersion), null); Assert.Equal(HttpStatusCode.OK, submittedResponse.StatusCode);
        var submitted = (await submittedResponse.Content.ReadFromJsonAsync<PurchaseOrderView>())!;
        await A4AssertCode(await host.Client.PostAsync(A4Version(path + "/accept", latest.RowVersion), null), HttpStatusCode.Conflict, AggregateConcurrency.ConflictCode);
        Assert.Equal(HttpStatusCode.OK, (await host.Client.PostAsync(A4Version(path + "/accept", submitted.RowVersion), null)).StatusCode);
    }

    [Fact]
    public async Task A4_sql_api_race_after_read_returns_concurrency_conflict_instead_of_duplicate_error()
    {
        await using var sql = await A4SqlDatabase.CreateLatest();
        var person = new Person { PersonCode = "A4-RACE", DisplayName = "Original", LastName = "Original" };
        await using (var db = sql.Context()) { db.Persons.Add(person); await db.SaveChangesAsync(); }
        var race = new A4RaceAtSave(sql.Connection, person.Id);
        await using var host = await CreateApp(sqlConnection: sql.Connection, sqlInterceptor: race);
        await CreateUser(host.App, "a4-race@example.test", "Administrator"); await SignIn(host, "a4-race@example.test");
        race.Armed = true;
        await A4AssertCode(await host.Client.PutAsJsonAsync(A4Version($"/api/master-data/persons/{person.Id}", person.RowVersion),
            new PersonInput { PersonCode = person.PersonCode, LastName = "Losing writer" }), HttpStatusCode.Conflict, AggregateConcurrency.ConflictCode);
        Assert.False(race.Armed);
        await using var check = sql.Context(); Assert.Equal("Racing writer", (await check.Persons.FindAsync(person.Id))!.LastName);
    }

    [Fact]
    public async Task A4_sql_remaining_mutation_routes_require_tokens_and_reject_stale_intent()
    {
        await using var sql = await A4SqlDatabase.CreateLatest();
        await using var host = await CreateApp(sqlConnection: sql.Connection);
        await CreateUser(host.App, "a4-coverage@example.test", "Administrator"); await SignIn(host, "a4-coverage@example.test");
        var personId = Guid.Parse("11111111-1111-1111-1111-111111111111");
        var type = new YarnType { Code = "COV", NameFa = "آزمایش", NameEn = "Coverage" };
        var yarn = new YarnItem { Code = "COV", YarnTypeId = type.Id, NameFa = "نخ", NameEn = "Yarn" };
        var warehouse = new Warehouse { Code = "COV", NameFa = "انبار", NameEn = "Warehouse" };
        var order = new PurchaseOrder { OrderNumber = "COV", OrderDate = new DateOnly(2026, 10, 6), RequestedByUserId = await UserId(host, "a4-coverage@example.test"), Status = PurchaseOrderStatus.SubmittedToCommerce, PreferredSupplierId = personId };
        var invoice = new PurchaseInvoice { InternalNumber = "COV", InvoiceDate = order.OrderDate, SupplierId = personId,
            Items = [new() { OriginalDescription = "Original child", YarnItemId = yarn.Id, NetWeight = 10, UnitPriceUSD = 2 }] };
        var sale = new Sale { SaleNumber = "COV", SaleDate = order.OrderDate, CustomerId = personId, WarehouseId = warehouse.Id };
        var document = new MoneyDocument { DocumentNumber = "COV", DocumentDate = order.OrderDate, PersonId = personId, Lines = [new() { AmountIRR = 10 }] };
        var check = new Check { CheckNumber = "COV", OwnerName = "Test", BankName = "Test bank", DueDate = order.OrderDate };
        var settlement = new PartnerSettlement { SettlementNumber = "COV", PartnerId = personId, SettlementDate = order.OrderDate };
        var roots = new AuditedEntity[] { yarn, order, invoice, sale, document, check, settlement };
        await using (var db = sql.Context()) {
            db.AddRange(type, yarn, warehouse, order, invoice, sale, document, check, settlement); await db.SaveChangesAsync();
            // Keep client copies unchanged, then change each row in a separate writer.
            foreach (var entity in roots) {
                var table = db.Model.FindEntityType(entity.GetType())!.GetTableName()!;
                // Identifier comes only from this model's audited tables; values remain parameterized.
                Assert.Matches("^[A-Za-z]+$", table);
                var update = $"UPDATE [{table}] SET UpdatedAtUtc = SYSUTCDATETIME() WHERE Id = @id";
                await db.Database.ExecuteSqlRawAsync(update, new SqlParameter("@id", entity.Id));
            }
        }
        var commands = new (HttpMethod Method, string Path, object? Body, AuditedEntity Root)[] {
            (HttpMethod.Put, $"/api/yarns/{yarn.Id}", new { code = "COV", name = "Yarn", plyCount = 1 }, yarn),
            (HttpMethod.Delete, $"/api/yarns/{yarn.Id}", null, yarn),
            (HttpMethod.Put, $"/api/purchases/{invoice.Id}", invoice, invoice),
            (HttpMethod.Post, $"/api/purchases/{invoice.Id}/post?warehouseId={warehouse.Id}", null, invoice),
            (HttpMethod.Post, $"/api/commerce/orders/{order.Id}/invoice", null, order),
            (HttpMethod.Post, $"/api/commerce/invoices/{invoice.Id}/send-to-warehouse?warehouseId={warehouse.Id}&confirmInvoiceData=true", null, invoice),
            (HttpMethod.Post, $"/api/sales/{sale.Id}/post", new { usdRate = 60000 }, sale),
            (HttpMethod.Post, $"/api/sales/{sale.Id}/reverse", null, sale),
            (HttpMethod.Post, $"/api/finance/money-documents/{document.Id}/post", null, document),
            (HttpMethod.Post, $"/api/finance/checks/{check.Id}/transition", new { toStatus = 1, userId = Guid.Empty }, check),
            (HttpMethod.Post, $"/api/finance/settlements/{settlement.Id}/post", null, settlement),
        };
        foreach (var command in commands) foreach (var token in new[] { "missing", "invalid", "stale" }) {
            var path = token == "missing" ? command.Path : token == "invalid" ? command.Path + (command.Path.Contains('?') ? "&" : "?") + "rowVersion=bad" : A4Version(command.Path, command.Root.RowVersion);
            using var request = new HttpRequestMessage(command.Method, path) { Content = command.Body is null ? null : JsonContent.Create(command.Body) };
            await A4AssertCode(await host.Client.SendAsync(request), token == "stale" ? HttpStatusCode.Conflict : HttpStatusCode.BadRequest,
                token == "missing" ? "CONCURRENCY_TOKEN_REQUIRED" : token == "invalid" ? "INVALID_CONCURRENCY_TOKEN" : AggregateConcurrency.ConflictCode);
        }
        using (var upload = new MultipartFormDataContent()) {
            upload.Add(new ByteArrayContent([1]), "file", "a4.xlsx");
            await A4AssertCode(await host.Client.PostAsync(A4Version($"/api/commerce/orders/{order.Id}/import", order.RowVersion), upload), HttpStatusCode.Conflict, AggregateConcurrency.ConflictCode);
        }
        await CreateUser(host.App, "a4-work@example.test", "Commerce"); await SignIn(host, "a4-work@example.test");
        await SetPermissions(host, "a4-work@example.test", "dashboard.view", "commerce.view", "commerce.accept");
        await A4AssertCode(await host.Client.PostAsync(A4Version($"/api/work-items/commerce-order:{order.Id}/action", order.RowVersion), null), HttpStatusCode.Conflict, AggregateConcurrency.ConflictCode);
        await using (var db = sql.Context()) {
            Assert.False(await db.UserTaskStates.AnyAsync());
            Assert.Equal(PurchaseOrderStatus.SubmittedToCommerce, (await db.PurchaseOrders.FindAsync(order.Id))!.Status);
            Assert.Equal(DocumentStatus.Draft, (await db.Sales.FindAsync(sale.Id))!.Status);
            Assert.Equal(CheckStatus.Received, (await db.Checks.FindAsync(check.Id))!.CurrentStatus);
            Assert.False(await db.InventoryMovements.AnyAsync()); Assert.False(await db.CheckOperations.AnyAsync()); Assert.False(await db.PartnerLedgerEntries.AnyAsync());
        }
        await SignIn(host, "a4-coverage@example.test");
        byte[] orderToken;
        await using (var db = sql.Context()) { orderToken = (await db.PurchaseOrders.FindAsync(order.Id))!.RowVersion; }
        var invoiceCreation = await host.Client.PostAsync(A4Version($"/api/commerce/orders/{order.Id}/invoice", orderToken), null);
        Assert.Equal(HttpStatusCode.OK, invoiceCreation.StatusCode);
        var commerceResult = (await invoiceCreation.Content.ReadFromJsonAsync<CommerceInvoiceResult>())!;
        Assert.False(orderToken.SequenceEqual(commerceResult.RowVersion)); Assert.Equal(8, commerceResult.Invoice.RowVersion.Length);
        var latestInvoice = (await host.Client.GetFromJsonAsync<PurchaseInvoice>($"/api/purchases/{invoice.Id}"))!;
        var originalCreatedAt = latestInvoice.CreatedAtUtc;
        var tokenBefore = latestInvoice.RowVersion.ToArray();
        latestInvoice.Id = Guid.Empty; latestInvoice.CreatedAtUtc = DateTime.MinValue; latestInvoice.RowVersion = new byte[8]; latestInvoice.Items[0].NetWeight = 20;
        var savedResponse = await host.Client.PutAsJsonAsync(A4Version($"/api/purchases/{invoice.Id}", tokenBefore), latestInvoice);
        Assert.True(savedResponse.StatusCode == HttpStatusCode.OK, await savedResponse.Content.ReadAsStringAsync());
        var saved = (await savedResponse.Content.ReadFromJsonAsync<PurchaseInvoice>())!;
        Assert.Equal(invoice.Id, saved.Id); Assert.Equal(originalCreatedAt, saved.CreatedAtUtc); Assert.False(tokenBefore.SequenceEqual(saved.RowVersion)); Assert.Equal(20, saved.Items.Single().NetWeight);
        await A4AssertCode(await host.Client.PutAsJsonAsync(A4Version($"/api/purchases/{invoice.Id}", tokenBefore), latestInvoice), HttpStatusCode.Conflict, AggregateConcurrency.ConflictCode);
    }

    private sealed class A4RaceAtSave(string connection, Guid id) : SaveChangesInterceptor
    {
        public bool Armed { get; set; }
        public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
        {
            if (Armed && eventData.Context!.ChangeTracker.Entries<Person>().Any(x => x.Entity.Id == id && x.State == EntityState.Modified)) {
                Armed = false;
                await using var writer = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlServer(connection).Options);
                await writer.Database.ExecuteSqlInterpolatedAsync($"UPDATE Persons SET LastName = {"Racing writer"}, DisplayName = {"Racing writer"} WHERE Id = {id}", cancellationToken);
            }
            return result;
        }
    }

    private static string A4Version(string path, byte[] token) => path + (path.Contains('?') ? "&" : "?") + "rowVersion=" + Uri.EscapeDataString(Convert.ToBase64String(token));
    private static async Task A4AssertCode(HttpResponseMessage response, HttpStatusCode status, string code)
    {
        Assert.Equal(status, response.StatusCode);
        Assert.Equal(code, (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());
    }

    private sealed class A4SqlDatabase : IAsyncDisposable
    {
        public const string BeforeA4 = "20260810160000_AddUserPresenceAndMaintenanceNotices";
        private readonly string master;
        private readonly string name;
        public string Connection { get; }
        private A4SqlDatabase(string masterConnection)
        {
            var builder = new SqlConnectionStringBuilder(masterConnection);
            if (!builder.InitialCatalog.Equals("master", StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("A4 SQL tests require an explicit master connection to create an isolated disposable database.");
            builder.Pooling = false; master = builder.ConnectionString;
            name = "YarnTrade_A4_Test_" + Guid.NewGuid().ToString("N");
            builder.InitialCatalog = name; Connection = builder.ConnectionString;
        }
        public static async Task<A4SqlDatabase> Create()
        {
            var connection = Environment.GetEnvironmentVariable("YARN_TRADE_SQL_TEST_CONNECTION");
            if (string.IsNullOrWhiteSpace(connection)) throw new InvalidOperationException("Set protected YARN_TRADE_SQL_TEST_CONNECTION to run the required real SQL Server tests. No tests are skipped.");
            var sql = new A4SqlDatabase(connection);
            await sql.ExecuteMaster($"CREATE DATABASE [{sql.name}]"); return sql;
        }
        public static async Task<A4SqlDatabase> CreateLatest(bool operationalContract = true)
        {
            var sql = await Create();
            try {
                await using var db = sql.Context(); await db.Database.MigrateAsync();
                if (operationalContract)
                {
                    // Legacy operational tests now need the explicit contract required before posting.
                    var investor = new Investor { InvestorCode = "INV-0001", LegalName = "Operational fixture owner", PersonType = PersonType.Company };
                    db.Investors.Add(investor);
                    db.BusinessContractVersions.Add(new BusinessContractVersion {
                        VersionNumber = 1, ContractName = "Operational fixture contract", EffectiveFrom = new(2000, 1, 1), PrimaryInvestorId = investor.Id,
                        BaseCurrency = Currency.USD, BusinessStructure = BusinessStructure.SoleOwnership, CashSalesAllowed = true,
                        OwnershipParty1Percent = 100, NormalSaleProfitParty1Percent = 100, CreditSaleProfitParty1Percent = 100, LossParty1Percent = 100,
                        CostResponsibilitiesJson = "[]", PartnerEntitlementCreatedWhen = "OnTransactionPosting", CashSaleClaimPayableWhen = "OnCashCollection", CreditSaleClaimPayableWhen = "OnCollection"
                    });
                    await db.SaveChangesAsync();
                }
                return sql;
            }
            catch { await sql.DisposeAsync(); throw; }
        }
        public AppDbContext Context() => new(new DbContextOptionsBuilder<AppDbContext>().UseSqlServer(Connection).Options);
        private async Task ExecuteMaster(string query)
        {
            await using var connection = new SqlConnection(master); await connection.OpenAsync();
            await using var command = connection.CreateCommand(); command.CommandText = query; command.CommandTimeout = 60;
            await command.ExecuteNonQueryAsync();
        }
        public async ValueTask DisposeAsync()
        {
            if (!Regex.IsMatch(name, "^YarnTrade_A4_Test_[0-9a-f]{32}$")) throw new InvalidOperationException("Unsafe A4 database cleanup target.");
            await ExecuteMaster($"IF DB_ID(N'{name}') IS NOT NULL BEGIN ALTER DATABASE [{name}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [{name}]; END");
        }
    }
}
