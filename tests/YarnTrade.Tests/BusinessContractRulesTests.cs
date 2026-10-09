using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Migrations;
using YarnTrade.Api.Controllers;
using YarnTrade.Api.Data;
using YarnTrade.Api.Data.Migrations;
using YarnTrade.Api.Domain;
using YarnTrade.Api.Services;

namespace YarnTrade.Tests;

public sealed class BusinessContractRulesTests
{
    private static readonly Guid OwnerId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid InvestorPartnerId = Guid.Parse("22222222-2222-2222-2222-222222222222");
    [Theory]
    [InlineData(BusinessStructure.SoleOwnership)]
    [InlineData(BusinessStructure.Partnership)]
    public async Task Contract_requires_registered_explicit_investor_identities(BusinessStructure structure)
    {
        await using var db = Database();
        var controller = new BusinessContractsController(db, new BusinessContractService(db));
        var input = Input(structure, null, 50, 50);
        Assert.IsType<BadRequestObjectResult>(await controller.Create(input with { PrimaryInvestorId = null }, default));
        if (structure == BusinessStructure.Partnership)
        {
            Assert.IsType<BadRequestObjectResult>(await controller.Create(input with { PartnerInvestorId = null }, default));
            Assert.IsType<BadRequestObjectResult>(await controller.Create(input with { PartnerInvestorId = OwnerId }, default));
        }
        Assert.IsType<BadRequestObjectResult>(await controller.Create(input with { PrimaryInvestorId = Guid.NewGuid() }, default));
        Assert.IsType<CreatedAtActionResult>(await controller.Create(input, default));
        var version = await db.BusinessContractVersions.SingleAsync();
        Assert.Equal(OwnerId, version.PrimaryInvestorId);
        Assert.Equal(structure == BusinessStructure.Partnership ? InvestorPartnerId : (Guid?)null, version.PartnerInvestorId);
        Assert.Equal("Owner Legal Name", (await db.Investors.FindAsync(version.PrimaryInvestorId))!.LegalName);
    }
    [Fact]
    public void Migration_is_discoverable() => Assert.Equal("20261006215408_AddBusinessContractRules",
        Assert.Single(typeof(AddBusinessContractRules).GetCustomAttributes(typeof(MigrationAttribute), false).Cast<MigrationAttribute>()).Id);

    [Fact]
    public async Task Sole_ownership_accepts_no_partner_and_does_not_write_an_ownership_percentage()
    {
        var input = Input(BusinessStructure.SoleOwnership, null, 12, 17);
        Assert.Empty(BusinessContractRules.Validate(input));
        await using var db = Database();
        var controller = new BusinessContractsController(db, new BusinessContractService(db));
        Assert.IsType<CreatedAtActionResult>(await controller.Create(input, default));
        var saved = await db.BusinessContractVersions.SingleAsync();
        Assert.Equal(0, saved.OwnershipParty1Percent);
        Assert.Equal(0, saved.OwnershipParty2Percent);
        var costs = System.Text.Json.JsonSerializer.Deserialize<CostResponsibilityInput[]>(saved.CostResponsibilitiesJson)!;
        Assert.All(costs, x => { Assert.Equal(100, x.Party1Percent); Assert.Equal(0, x.Party2Percent); });
    }

    [Fact]
    public async Task Cost_rows_keep_the_required_order_and_capital_flags_are_enforced_and_persisted_only_when_configurable()
    {
        Assert.Equal(new[] { "GoodsPurchase", "Insurance", "InternationalFreight", "Customs", "DomesticFreight", "Warehousing", "Commission", "BadDebt", "ReturnedCheck", "ReceivablesFinancing", "RemittanceFee" }, BusinessContractRules.CostTypes);
        var rows = BusinessContractRules.CostTypes.Select(type => new CostResponsibilityInput(type, 100, 0,
            type switch { "Warehousing" => false, "Commission" => true, "RemittanceFee" => false, _ => false })).ToArray();
        await using var db = Database();
        var controller = new BusinessContractsController(db, new BusinessContractService(db));
        Assert.IsType<CreatedAtActionResult>(await controller.Create(Input(BusinessStructure.SoleOwnership, null, 100, 0) with { CostResponsibilities = rows }, default));

        var json = (await db.BusinessContractVersions.SingleAsync()).CostResponsibilitiesJson;
        var saved = System.Text.Json.JsonSerializer.Deserialize<CostResponsibilityInput[]>(json)!;
        Assert.All(saved.Where(x => BusinessContractRules.FixedCapitalCostTypes.Contains(x.CostType)), x => Assert.Null(x.AffectsCapitalContribution));
        Assert.False(saved.Single(x => x.CostType == "Warehousing").AffectsCapitalContribution);
        Assert.True(saved.Single(x => x.CostType == "Commission").AffectsCapitalContribution);
        Assert.False(saved.Single(x => x.CostType == "RemittanceFee").AffectsCapitalContribution);
        Assert.True(BusinessContractRules.ShouldCountCostTowardCapital(json, "Customs"));
        Assert.False(BusinessContractRules.ShouldCountCostTowardCapital(json, "Warehousing"));
        Assert.True(BusinessContractRules.ShouldCountCostTowardCapital(json, "Commission"));
        Assert.False(BusinessContractRules.ShouldCountCostTowardCapital(json, "RemittanceFee"));
        Assert.True(BusinessContractRules.ShouldCountCostTowardCapital(json, "GoodsPurchase"));
        Assert.True(BusinessContractRules.ShouldCountCostTowardCapital(json, "Customs clearance"));
    }

    [Theory]
    [InlineData(60, 30)]
    [InlineData(-1, 101)]
    [InlineData(101, -1)]
    public void Partnership_rejects_invalid_percentage_pairs(decimal party1, decimal party2)
    {
        var input = Input(BusinessStructure.Partnership, Guid.NewGuid(), party1, party2);
        Assert.Contains("Ownership", BusinessContractRules.Validate(input).Keys);
    }

    [Fact]
    public async Task Operational_activity_locks_update_and_amendment_preserves_previous_version()
    {
        await using var db = Database();
        var partner = new Person { PersonCode = "P-1", DisplayName = "Partner", PersonType = PersonType.Company, PartnerKind = PartnerKind.Chinese };
        db.Persons.Add(partner);
        await db.SaveChangesAsync();
        var service = new BusinessContractService(db);
        var controller = new BusinessContractsController(db, service);
        var original = Input(BusinessStructure.Partnership, partner.Id, 60, 40) with { ContractName = "Original", EffectiveFrom = new DateOnly(2026, 1, 1) };
        Assert.IsType<CreatedAtActionResult>(await controller.Create(original, default));
        var v1 = await db.BusinessContractVersions.SingleAsync();

        db.Sales.Add(new Sale { SaleNumber = "S-1", SaleDate = new DateOnly(2026, 2, 1), CustomerId = Guid.NewGuid(), SellerId = Guid.NewGuid(), WarehouseId = Guid.NewGuid(), Status = DocumentStatus.Posted, BusinessContractVersionId = v1.Id });
        await db.SaveChangesAsync();

        var update = await controller.Update(v1.Id, original with { ContractName = "Changed" }, Convert.ToBase64String(v1.RowVersion), default);
        Assert.IsType<ConflictObjectResult>(update);
        var amendment = original with { ContractName = "Amendment", EffectiveFrom = new DateOnly(2026, 3, 1) };
        Assert.IsType<CreatedAtActionResult>(await controller.CreateAmendment(amendment, default));

        var versions = await db.BusinessContractVersions.OrderBy(x => x.VersionNumber).ToListAsync();
        Assert.Equal(2, versions.Count);
        Assert.Equal("Original", versions[0].ContractName);
        Assert.Equal(versions[0].Id, versions[1].PreviousVersionId);
        Assert.Equal(2, versions[1].VersionNumber);
        Assert.Equal(versions[0].Id, (await service.ResolveForDateAsync(new DateOnly(2026, 2, 1))).Id);
        Assert.Equal(versions[1].Id, (await service.ResolveForDateAsync(new DateOnly(2026, 3, 1))).Id);
    }

    [Fact]
    public async Task Amendment_cannot_be_backdated_over_historical_transactions()
    {
        await using var db = Database();
        var v1 = Version(1, new DateOnly(2026, 1, 1));
        db.BusinessContractVersions.Add(v1);
        db.MoneyDocuments.Add(new MoneyDocument { DocumentNumber = "R-1", DocumentDate = new DateOnly(2026, 5, 1), PersonId = Guid.NewGuid(), CreatedBy = Guid.NewGuid(), Status = DocumentStatus.Posted, BusinessContractVersionId = v1.Id });
        await db.SaveChangesAsync();
        var result = await new BusinessContractsController(db, new BusinessContractService(db)).CreateAmendment(
            Input(BusinessStructure.SoleOwnership, null, 100, 0) with { EffectiveFrom = new DateOnly(2026, 4, 1) }, default);
        Assert.IsType<BadRequestObjectResult>(result);
        Assert.Single(db.BusinessContractVersions);
    }

    [Theory]
    [InlineData("Purchase")]
    [InlineData("Sale")]
    [InlineData("Money")]
    [InlineData("Settlement")]
    public async Task Draft_documents_leave_contract_editable_only_posted_activity_locks(string kind)
    {
        await using var db = Database();
        var service = new BusinessContractService(db);
        var controller = new BusinessContractsController(db, service);
        var input = Input(BusinessStructure.SoleOwnership, null, 100, 0);
        Assert.IsType<CreatedAtActionResult>(await controller.Create(input, default));
        var version = await db.BusinessContractVersions.SingleAsync();
        version.RowVersion = new byte[8];
        AuditedEntity document = kind switch
        {
            "Purchase" => new PurchaseInvoice { InternalNumber = "DRAFT-P", ExternalInvoiceNumber = "EXT-P", InvoiceDate = new(2026, 2, 1), SupplierId = Guid.NewGuid(), Status = DocumentStatus.Draft },
            "Sale" => new Sale { SaleNumber = "DRAFT-S", SaleDate = new(2026, 2, 1), CustomerId = Guid.NewGuid(), SellerId = Guid.NewGuid(), WarehouseId = Guid.NewGuid(), Status = DocumentStatus.Draft },
            "Money" => new MoneyDocument { DocumentNumber = "DRAFT-M", DocumentDate = new(2026, 2, 1), PersonId = Guid.NewGuid(), CreatedBy = Guid.NewGuid(), Status = DocumentStatus.Draft },
            _ => new PartnerSettlement { SettlementNumber = "DRAFT-T", SettlementDate = new(2026, 2, 1), PartnerId = Guid.NewGuid(), Status = DocumentStatus.Draft }
        };
        db.Add(document); await db.SaveChangesAsync();
        Assert.False(await service.HasOperationalTransactionsAsync());
        Assert.IsType<OkObjectResult>(await controller.Update(version.Id, input with { ContractName = "Edited with draft" }, Convert.ToBase64String(version.RowVersion), default));
        switch (document)
        {
            case PurchaseInvoice x: x.Status = DocumentStatus.Posted; break;
            case Sale x: x.Status = DocumentStatus.Posted; break;
            case MoneyDocument x: x.Status = DocumentStatus.Posted; break;
            case PartnerSettlement x: x.Status = DocumentStatus.Posted; break;
        }
        await db.SaveChangesAsync();
        Assert.True(await service.HasOperationalTransactionsAsync());
        Assert.IsType<ConflictObjectResult>(await controller.Update(version.Id, input with { ContractName = "Tampered" }, Convert.ToBase64String(version.RowVersion), default));
        Assert.Equal("Edited with draft", version.ContractName);
    }

    internal static BusinessContractInput Input(BusinessStructure structure, Guid? partner, decimal one, decimal two) => new(
        "Contract", new DateOnly(2026, 1, 1), Currency.USD, structure, partner,
        one, two, one, two, one, two,
        BusinessContractRules.CostTypes.Select(x => new CostResponsibilityInput(x, one, two)).ToArray(),
        true, true, CreditCalculationMethod.MonthlyPercentage, 2, 5, "Party1", true, "Shared", "Party2",
        "OnTransactionPosting", "OnCashCollection", "OnCollection", true, true, true, OwnerId, structure == BusinessStructure.Partnership ? InvestorPartnerId : null);

    private static BusinessContractVersion Version(int number, DateOnly effective) => new()
    {
        VersionNumber = number, ContractName = $"v{number}", EffectiveFrom = effective, BaseCurrency = Currency.USD,
        BusinessStructure = BusinessStructure.SoleOwnership, OwnershipParty1Percent = 100, NormalSaleProfitParty1Percent = 100,
        CreditSaleProfitParty1Percent = 100, LossParty1Percent = 100, CostResponsibilitiesJson = "[]", CashSalesAllowed = true,
        PartnerEntitlementCreatedWhen = "OnTransactionPosting", CashSaleClaimPayableWhen = "OnCashCollection",
        CreditSaleClaimPayableWhen = "OnCollection", UseActualTransactionFxRate = true,
        SeparateFxPurchaseAndPartnerRemittance = true, CarryPartnerOverpaymentToCurrentAccount = true
    };

    private static AppDbContext Database()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        var db = new AppDbContext(options);
        db.Investors.AddRange(new Investor { Id = OwnerId, InvestorCode = "INV-0001", LegalName = "Owner Legal Name", PersonType = PersonType.Company },
            new Investor { Id = InvestorPartnerId, InvestorCode = "INV-0002", LegalName = "Partner Legal Name", PersonType = PersonType.Individual });
        db.SaveChanges();
        return db;
    }
}
