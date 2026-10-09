using Microsoft.AspNetCore.Mvc;
using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using YarnTrade.Api.Controllers;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;
using YarnTrade.Api.Services;

namespace YarnTrade.Tests;

public sealed partial class SecurityBaselineTests
{
    [Fact]
    public async Task Sql_investor_contract_amendment_preserves_historical_identity_and_amounts_with_retries_enabled()
    {
        await using var sql = await A4SqlDatabase.CreateLatest(operationalContract: false);
        await using var host = await CreateApp(sqlConnection: sql.Connection, sqlRetries: true);
        await CreateUser(host.App, "investor-version@example.test", "Administrator"); await SignIn(host, "investor-version@example.test");
        var ownerResponse = await host.Client.PostAsJsonAsync("/api/investors", new InvestorInput("Owner", PersonType.Company));
        var owner = (await ownerResponse.Content.ReadFromJsonAsync<Investor>())!;
        var input = BusinessContractRulesTests.Input(BusinessStructure.SoleOwnership, null, 100, 0) with { PrimaryInvestorId = owner.Id };
        Assert.Equal(HttpStatusCode.Created, (await host.Client.PostAsJsonAsync("/api/business-contract", input)).StatusCode);
        BusinessContractVersion v1;
        await using (var db = sql.Context()) v1 = await db.BusinessContractVersions.SingleAsync();
        Assert.Equal(HttpStatusCode.OK, (await host.Client.PutAsJsonAsync(A4Version($"/api/business-contract/{v1.Id}", v1.RowVersion), input with { ContractName = "Before operations" })).StatusCode);
        Guid historicalId;
        await using (var db = sql.Context())
        {
            var document = new MoneyDocument { DocumentNumber = "HISTORICAL", DocumentDate = new(2026, 2, 1), PersonId = Guid.NewGuid(), CreatedBy = Guid.NewGuid(), Status = DocumentStatus.Posted, BusinessContractVersionId = v1.Id, TotalIRR = 12345 };
            db.MoneyDocuments.Add(document); await db.SaveChangesAsync(); historicalId = document.Id;
        }
        var partner = (await (await host.Client.PostAsJsonAsync("/api/investors", new InvestorInput("New Partner", PersonType.Company))).Content.ReadFromJsonAsync<Investor>())!;
        var amendment = BusinessContractRulesTests.Input(BusinessStructure.Partnership, null, 60, 40) with { PrimaryInvestorId = owner.Id, PartnerInvestorId = partner.Id, EffectiveFrom = new(2026, 3, 1) };
        Assert.Equal(HttpStatusCode.Created, (await host.Client.PostAsJsonAsync("/api/business-contract/amendments", amendment)).StatusCode);
        await using var verify = sql.Context();
        var versions = await verify.BusinessContractVersions.OrderBy(x => x.VersionNumber).ToArrayAsync();
        Assert.Equal(2, versions.Length); Assert.Null(versions[0].PartnerInvestorId); Assert.Equal(owner.Id, versions[0].PrimaryInvestorId);
        Assert.Equal(partner.Id, versions[1].PartnerInvestorId); Assert.Equal(v1.Id, versions[1].PreviousVersionId);
        var historical = (await verify.MoneyDocuments.FindAsync(historicalId))!;
        Assert.Equal(12345, historical.TotalIRR); Assert.Equal(v1.Id, historical.BusinessContractVersionId);
    }

    [Fact]
    public async Task Sql_investor_migration_rolls_back_reapplies_and_preserves_legacy_contract()
    {
        await using var sql = await A4SqlDatabase.CreateLatest(operationalContract: false);
        await using var db = sql.Context();
        var legacy = InvestorContract(Guid.NewGuid()); legacy.PrimaryInvestorId = null;
        db.BusinessContractVersions.Add(legacy); await db.SaveChangesAsync(); db.ChangeTracker.Clear();
        await db.GetService<IMigrator>().MigrateAsync("20261006215408_AddBusinessContractRules");
        Assert.Equal("Original", await db.Database.SqlQueryRaw<string>("SELECT [ContractName] AS [Value] FROM [BusinessContractVersions]").SingleAsync());
        await db.Database.MigrateAsync();
        var restored = await db.BusinessContractVersions.SingleAsync();
        Assert.Equal(legacy.Id, restored.Id); Assert.Null(restored.PrimaryInvestorId); Assert.Null(restored.PartnerInvestorId);
        Assert.Equal(legacy.EffectiveFrom, restored.EffectiveFrom); Assert.Empty(db.Investors);
        var investor = new Investor { InvestorCode = "INV-0001", LegalName = "Owner" }; db.Investors.Add(investor); await db.SaveChangesAsync();
        db.InvestorBalances.Add(new InvestorBalance { InvestorId = investor.Id, Currency = Currency.CNY, Kind = InvestorBalanceKind.Capital, Amount = 2 });
        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
    }
    [Fact]
    public async Task Sql_investor_identity_edit_and_delete_are_blocked_after_operations_even_via_HTTP()
    {
        await using var sql = await A4SqlDatabase.Create();
        await using (var setup = sql.Context()) await setup.Database.EnsureCreatedAsync();
        await using var host = await CreateApp(sqlConnection: sql.Connection);
        await CreateUser(host.App, "investor-lock@example.test", "Administrator");
        await SignIn(host, "investor-lock@example.test");
        var created = await host.Client.PostAsJsonAsync("/api/investors", new InvestorInput("Owner", PersonType.Company));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var investor = (await created.Content.ReadFromJsonAsync<Investor>())!;
        await using (var setup = sql.Context())
        {
            setup.BusinessContractVersions.Add(InvestorContract(investor.Id));
            await setup.SaveChangesAsync();
        }
        var edit = new InvestorEditInput("INV-0001", "Updated Legal Name", PersonType.Company);
        var updated = await host.Client.PutAsJsonAsync(A4Version($"/api/investors/{investor.Id}", investor.RowVersion), edit);
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);
        investor = (await updated.Content.ReadFromJsonAsync<Investor>())!;
        await using (var setup = sql.Context())
        {
            var version = await setup.BusinessContractVersions.SingleAsync();
            setup.MoneyDocuments.Add(new MoneyDocument { DocumentNumber = "POST-1", DocumentDate = new(2026, 2, 1), PersonId = Guid.NewGuid(), CreatedBy = Guid.NewGuid(), Status = DocumentStatus.Posted, BusinessContractVersionId = version.Id });
            await setup.SaveChangesAsync();
        }
        await A4AssertCode(await host.Client.PutAsJsonAsync(A4Version($"/api/investors/{investor.Id}", investor.RowVersion), edit with { InvestorCode = "CHANGED", LegalName = "Tampered" }), HttpStatusCode.Conflict, "INVESTOR_IDENTITY_LOCKED");
        await A4AssertCode(await host.Client.DeleteAsync(A4Version($"/api/investors/{investor.Id}", investor.RowVersion)), HttpStatusCode.Conflict, "INVESTOR_IDENTITY_LOCKED");
        await using var verify = sql.Context();
        Assert.Equal("Updated Legal Name", (await verify.Investors.SingleAsync()).LegalName);
        Assert.Equal("INV-0001", (await verify.Investors.SingleAsync()).InvestorCode);
        verify.Investors.Remove(await verify.Investors.SingleAsync());
        await Assert.ThrowsAsync<DbUpdateException>(() => verify.SaveChangesAsync());
    }

    private static BusinessContractVersion InvestorContract(Guid owner) => new()
    {
        PrimaryInvestorId = owner, VersionNumber = 1, ContractName = "Original", EffectiveFrom = new(2026, 1, 1),
        CostResponsibilitiesJson = "[]", PartnerEntitlementCreatedWhen = "OnTransactionPosting", CashSaleClaimPayableWhen = "OnCashCollection", CreditSaleClaimPayableWhen = "OnCollection"
    };
    [Fact]
    public async Task Sql_codes_are_serialized_and_duplicate_code_is_rejected()
    {
        await using var sql = await A4SqlDatabase.Create();
        await using (var setup = sql.Context()) await setup.Database.EnsureCreatedAsync();
        await using var first = sql.Context();
        await using var second = sql.Context();
        var results = await Task.WhenAll(new InvestorsController(first).Create(new("Owner", PersonType.Company), default),
            new InvestorsController(second).Create(new("Partner", PersonType.Individual), default));
        Assert.All(results, x => Assert.Equal(201, Assert.IsType<ObjectResult>(x).StatusCode));
        await using var verify = sql.Context();
        var investors = await verify.Investors.OrderBy(x => x.InvestorCode).ToListAsync();
        Assert.Equal(new[] { "INV-0001", "INV-0002" }, investors.Select(x => x.InvestorCode));
        verify.Investors.Add(new Investor { InvestorCode = investors[0].InvestorCode, LegalName = "Duplicate", PersonType = PersonType.Company });
        await Assert.ThrowsAsync<DbUpdateException>(() => verify.SaveChangesAsync());
    }
    [Fact]
    public async Task Codes_are_registered_distinct_and_database_unique()
    {
        await using var db = InvestorDatabase();
        var controller = new InvestorsController(db);
        var owner = Assert.IsType<Investor>(Assert.IsType<ObjectResult>(await controller.Create(new("Owner Legal", PersonType.Company), default)).Value);
        var partner = Assert.IsType<Investor>(Assert.IsType<ObjectResult>(await controller.Create(new("Partner Legal", PersonType.Individual), default)).Value);
        Assert.Equal("INV-0001", owner.InvestorCode);
        Assert.Equal("INV-0002", partner.InvestorCode);
        Assert.Equal(2, await db.Investors.CountAsync());
        Assert.Contains(db.Model.FindEntityType(typeof(Investor))!.GetIndexes(), x => x.IsUnique && x.Properties.Single().Name == nameof(Investor.InvestorCode));
        Assert.Equal(2, await db.Persons.CountAsync());
        Assert.All(await db.Persons.ToListAsync(), x => { Assert.False(x.IsActive); Assert.Empty(x.Roles); Assert.NotNull(x.CapitalInvestorId); });
    }

    private static AppDbContext InvestorDatabase() => new(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
    [Fact]
    public async Task Investor_registration_does_not_create_commercial_account_but_child_can_link()
    {
        await using var db = InvestorDatabase();
        var created = Assert.IsType<ObjectResult>(await new InvestorsController(db).Create(new("Capital Owner", PersonType.Company), default));
        var investor = Assert.IsType<Investor>(created.Value);
        var reservation = await db.Persons.SingleAsync();
        Assert.False(reservation.IsActive); Assert.Empty(reservation.Roles); Assert.Equal(investor.Id, reservation.CapitalInvestorId);
        Assert.Empty(db.Sales); Assert.Empty(db.PurchaseInvoices); Assert.Empty(db.MoneyDocuments);
        var child = new Person { PersonCode = "PER-0001", DisplayName = investor.LegalName, PersonType = investor.PersonType, CapitalInvestorId = investor.Id };
        db.Persons.Add(child); await db.SaveChangesAsync();
        Assert.NotEqual(investor.InvestorCode, child.PersonCode);
        Assert.Equal(investor.Id, child.CapitalInvestorId);
        Assert.Single(db.Investors); Assert.Equal(2, await db.Persons.CountAsync());
        var fk = Assert.Single(db.Model.FindEntityType(typeof(Person))!.GetForeignKeys(), x => x.PrincipalEntityType.ClrType == typeof(Investor));
        Assert.Equal(DeleteBehavior.Restrict, fk.DeleteBehavior);
    }
    [Fact]
    public async Task Capital_IRR_USD_and_investment_kinds_never_net_against_commercial_balance()
    {
        await using var db = InvestorDatabase();
        var investor = new Investor { InvestorCode = "INV-0001", LegalName = "Owner", PersonType = PersonType.Company };
        var child = new Person { PersonCode = "PER-0001", DisplayName = "Trading child", CapitalInvestorId = investor.Id };
        db.Investors.Add(investor); db.Persons.Add(child);
        db.InvestorBalances.AddRange(new InvestorBalance { InvestorId = investor.Id, Currency = Currency.IRR, Kind = InvestorBalanceKind.Capital, Amount = 500 },
            new InvestorBalance { InvestorId = investor.Id, Currency = Currency.USD, Kind = InvestorBalanceKind.Capital, Amount = 20 },
            new InvestorBalance { InvestorId = investor.Id, Currency = Currency.IRR, Kind = InvestorBalanceKind.ProfitEntitlement, Amount = 30 });
        db.Sales.Add(new Sale { SaleNumber = "TRADE-1", SaleDate = new(2026, 1, 1), CustomerId = child.Id, SellerId = child.Id, WarehouseId = Guid.NewGuid(), Status = DocumentStatus.Posted, SaleMode = SaleMode.Credit, TotalCreditSaleIRR = 100 });
        await db.SaveChangesAsync();
        Assert.Equal(100, (await new PersonAccountService(db).GetSummaryAsync(child.Id)).BalanceIRR);
        Assert.Equal(0, (await new PersonAccountService(db).GetSummaryAsync(investor.Id)).BalanceIRR);
        Assert.Equal(500, await db.InvestorBalances.Where(x => x.Currency == Currency.IRR && x.Kind == InvestorBalanceKind.Capital).SumAsync(x => x.Amount));
        Assert.Equal(20, await db.InvestorBalances.Where(x => x.Currency == Currency.USD).SumAsync(x => x.Amount));
        Assert.Equal(30, await db.InvestorBalances.Where(x => x.Kind == InvestorBalanceKind.ProfitEntitlement).SumAsync(x => x.Amount));
        Assert.Empty(db.MoneyDocuments);
    }
}
