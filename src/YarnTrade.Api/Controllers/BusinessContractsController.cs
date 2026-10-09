using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;
using YarnTrade.Api.Security;
using YarnTrade.Api.Services;

namespace YarnTrade.Api.Controllers;

[ApiController, Route("api/business-contract"), Authorize]
public sealed class BusinessContractsController(AppDbContext db, BusinessContractService contracts) : ControllerBase
{
    [RequirePermission("settings.view")]
    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        var current = await db.BusinessContractVersions.AsNoTracking()
            .OrderByDescending(x => x.VersionNumber).FirstOrDefaultAsync(ct);
        var hasOperations = await contracts.HasOperationalTransactionsAsync(ct);
        var partners = await db.Persons.AsNoTracking().Where(x => x.IsActive)
            .OrderBy(x => x.DisplayName).Select(x => new { x.Id, x.DisplayName, locked = hasOperations && db.BusinessContractVersions.Any(version => version.PartnerPersonId == x.Id) }).ToListAsync(ct);
        return Ok(new
        {
            contract = current is null ? null : ToView(current),
            hasOperationalTransactions = hasOperations,
            state = current is null ? "Missing" : hasOperations ? "Locked" : "Editable",
            partners,
            investors = await db.Investors.AsNoTracking().OrderBy(x => x.LegalName)
                .Select(x => new { x.Id, x.InvestorCode, x.LegalName, x.PersonType, x.Phone, x.Address, rowVersion = Convert.ToBase64String(x.RowVersion),
                    locked = hasOperations && db.BusinessContractVersions.Any(v => v.PrimaryInvestorId == x.Id || v.PartnerInvestorId == x.Id) }).ToListAsync(ct)
        });
    }

    [RequirePermission("settings.edit")]
    [HttpPost]
    public async Task<IActionResult> Create(BusinessContractInput input, CancellationToken ct)
    {
        if (await db.BusinessContractVersions.AnyAsync(ct))
            return Conflict(new { code = "CONTRACT_ALREADY_EXISTS", error = "The initial contract already exists." });
        if (await contracts.HasOperationalTransactionsAsync(ct))
            return Conflict(new { code = "CONTRACT_REQUIRED_BEFORE_OPERATIONS", error = "The initial contract cannot be created after operational activity has started." });
        if (await ValidateAsync(input, ct) is { } error) return BadRequest(error);

        var entity = NewVersion(input, 1, null);
        db.BusinessContractVersions.Add(entity);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException) { return Conflict(new { code = "CONTRACT_ALREADY_EXISTS", error = "The initial contract already exists." }); }
        return CreatedAtAction(nameof(Get), ToView(entity));
    }

    [RequirePermission("settings.edit")]
    [HttpPut("{id:guid}")]
    public Task<IActionResult> Update(Guid id, BusinessContractInput input, [FromQuery] string? rowVersion, CancellationToken ct) =>
        db.Database.CreateExecutionStrategy().ExecuteAsync<IActionResult>(async () =>
    {
        await using var transaction = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync(ct) : null;
        var entity = await contracts.LatestForUpdateAsync(ct);
        if (entity is null || entity.Id != id) return NotFound();
        if (await contracts.HasOperationalTransactionsAsync(ct))
            return Conflict(new { code = "CONTRACT_VERSION_LOCKED", error = "A contract version used by operations is immutable. Create an amendment." });
        if (AggregateConcurrency.Apply(db, entity, rowVersion) is { } concurrency) return concurrency;
        if (await ValidateAsync(input, ct) is { } error) return BadRequest(error);

        Apply(entity, input);
        try { await db.SaveChangesAsync(ct); if (transaction is not null) await transaction.CommitAsync(ct); }
        catch (DbUpdateConcurrencyException) { return AggregateConcurrency.Conflict(); }
        return Ok(ToView(entity));
    });

    [RequirePermission("settings.edit")]
    [HttpPost("amendments")]
    public Task<IActionResult> CreateAmendment(BusinessContractInput input, CancellationToken ct) =>
        db.Database.CreateExecutionStrategy().ExecuteAsync<IActionResult>(async () =>
    {
        await using var transaction = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync(ct) : null;
        var current = await contracts.LatestForUpdateAsync(ct);
        if (current is null) return NotFound();
        if (!await contracts.HasOperationalTransactionsAsync(ct))
            return Conflict(new { code = "CONTRACT_STILL_EDITABLE", error = "Edit the current contract before operations begin." });
        if (await ValidateAsync(input, ct) is { } error) return BadRequest(error);
        var lastOperationalDate = await contracts.LastOperationalDateAsync(ct);
        if (input.EffectiveFrom <= current.EffectiveFrom || lastOperationalDate.HasValue && input.EffectiveFrom <= lastOperationalDate.Value)
            return BadRequest(new { code = "AMENDMENT_EFFECTIVE_DATE_INVALID", error = "An amendment must start after the current version and all historical operational transactions." });

        var entity = NewVersion(input, current.VersionNumber + 1, current.Id);
        db.BusinessContractVersions.Add(entity);
        try { await db.SaveChangesAsync(ct); if (transaction is not null) await transaction.CommitAsync(ct); }
        catch (DbUpdateException) { return Conflict(new { code = "CONTRACT_AMENDMENT_CONFLICT", error = "Another amendment was created first. Reload and try again." }); }
        return CreatedAtAction(nameof(Get), ToView(entity));
    });

    private async Task<object?> ValidateAsync(BusinessContractInput input, CancellationToken ct)
    {
        var errors = BusinessContractRules.Validate(input);
        foreach (var id in new[] { input.PrimaryInvestorId, input.BusinessStructure == BusinessStructure.Partnership ? input.PartnerInvestorId : null }.Where(x => x.HasValue))
            if (!await db.Investors.AnyAsync(x => x.Id == id, ct)) errors["Investor"] = ["Select a registered investor."];
        if (input.BusinessStructure == BusinessStructure.Partnership && input.PartnerPersonId.HasValue
            && !await db.Persons.AnyAsync(x => x.Id == input.PartnerPersonId && x.IsActive, ct))
            errors[nameof(input.PartnerPersonId)] = ["The selected partner is not active or valid."];
        return errors.Count == 0 ? null : new { code = "CONTRACT_VALIDATION_FAILED", errors };
    }

    private static BusinessContractVersion NewVersion(BusinessContractInput input, int version, Guid? previous) {
        var entity = new BusinessContractVersion { ContractName = string.Empty, CostResponsibilitiesJson = "[]", PartnerEntitlementCreatedWhen = string.Empty, CashSaleClaimPayableWhen = string.Empty, CreditSaleClaimPayableWhen = string.Empty, VersionNumber = version, PreviousVersionId = previous };
        Apply(entity, input);
        return entity;
    }

    private static void Apply(BusinessContractVersion entity, BusinessContractInput input)
    {
        var sole = input.BusinessStructure == BusinessStructure.SoleOwnership;
        entity.ContractName = input.ContractName.Trim();
        entity.EffectiveFrom = input.EffectiveFrom;
        entity.BaseCurrency = input.BaseCurrency;
        entity.BusinessStructure = input.BusinessStructure;
        entity.PrimaryInvestorId = input.PrimaryInvestorId;
        entity.PartnerInvestorId = sole ? null : input.PartnerInvestorId;
        entity.PartnerPersonId = sole ? null : input.PartnerPersonId;
        entity.NormalSaleProfitParty1Percent = sole ? 100 : input.NormalSaleProfitParty1Percent;
        entity.NormalSaleProfitParty2Percent = sole ? 0 : input.NormalSaleProfitParty2Percent;
        entity.CreditSaleProfitParty1Percent = sole ? 100 : input.CreditSaleProfitParty1Percent;
        entity.CreditSaleProfitParty2Percent = sole ? 0 : input.CreditSaleProfitParty2Percent;
        entity.LossParty1Percent = sole ? 100 : input.LossParty1Percent;
        entity.LossParty2Percent = sole ? 0 : input.LossParty2Percent;
        var costs = input.CostResponsibilities.Select(x => x with
        {
            Party1Percent = sole ? 100 : x.Party1Percent,
            Party2Percent = sole ? 0 : x.Party2Percent,
            AffectsCapitalContribution = BusinessContractRules.ConfigurableCapitalCostTypes.Contains(x.CostType)
                ? x.AffectsCapitalContribution ?? true
                : null
        }).ToArray();
        entity.CostResponsibilitiesJson = JsonSerializer.Serialize(costs);
        entity.CashSalesAllowed = input.CashSalesAllowed;
        entity.CreditSalesAllowed = input.CreditSalesAllowed;
        entity.CreditCalculationMethod = input.CreditSalesAllowed ? input.CreditCalculationMethod : null;
        entity.DefaultCreditRatePercent = input.CreditSalesAllowed ? input.DefaultCreditRatePercent : null;
        entity.CheckCollectionGracePeriodDays = input.CreditSalesAllowed ? input.CheckCollectionGracePeriodDays : null;
        entity.ResponsiblePartyAfterGracePeriod = input.CreditSalesAllowed ? input.ResponsiblePartyAfterGracePeriod : null;
        entity.ReceivablesFinancingAllowed = input.CreditSalesAllowed && input.ReceivablesFinancingAllowed;
        entity.FinancingCostResponsibleParty = entity.ReceivablesFinancingAllowed ? input.FinancingCostResponsibleParty : null;
        entity.FinancedCheckPrincipalRiskParty = entity.ReceivablesFinancingAllowed ? input.FinancedCheckPrincipalRiskParty : null;
        entity.PartnerEntitlementCreatedWhen = input.PartnerEntitlementCreatedWhen;
        entity.CashSaleClaimPayableWhen = input.CashSaleClaimPayableWhen;
        entity.CreditSaleClaimPayableWhen = input.CreditSaleClaimPayableWhen;
        entity.UseActualTransactionFxRate = input.UseActualTransactionFxRate;
        entity.SeparateFxPurchaseAndPartnerRemittance = input.SeparateFxPurchaseAndPartnerRemittance;
        entity.CarryPartnerOverpaymentToCurrentAccount = input.CarryPartnerOverpaymentToCurrentAccount;
    }

    private static object ToView(BusinessContractVersion x) => new
    {
        x.Id, x.VersionNumber, x.PreviousVersionId, x.ContractName, x.EffectiveFrom, x.BaseCurrency, x.BusinessStructure, x.PartnerPersonId, x.PrimaryInvestorId, x.PartnerInvestorId,
        x.NormalSaleProfitParty1Percent, x.NormalSaleProfitParty2Percent,
        x.CreditSaleProfitParty1Percent, x.CreditSaleProfitParty2Percent, x.LossParty1Percent, x.LossParty2Percent,
        costResponsibilities = JsonSerializer.Deserialize<CostResponsibilityInput[]>(x.CostResponsibilitiesJson) ?? [],
        x.CashSalesAllowed, x.CreditSalesAllowed, x.CreditCalculationMethod, x.DefaultCreditRatePercent, x.CheckCollectionGracePeriodDays,
        x.ResponsiblePartyAfterGracePeriod, x.ReceivablesFinancingAllowed, x.FinancingCostResponsibleParty, x.FinancedCheckPrincipalRiskParty,
        x.PartnerEntitlementCreatedWhen, x.CashSaleClaimPayableWhen, x.CreditSaleClaimPayableWhen,
        x.UseActualTransactionFxRate, x.SeparateFxPurchaseAndPartnerRemittance, x.CarryPartnerOverpaymentToCurrentAccount,
        rowVersion = Convert.ToBase64String(x.RowVersion)
    };
}

public sealed record CostResponsibilityInput(string CostType, decimal Party1Percent, decimal Party2Percent,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] bool? AffectsCapitalContribution = null);
public sealed record BusinessContractInput(
    string ContractName, DateOnly EffectiveFrom, Currency BaseCurrency, BusinessStructure BusinessStructure, Guid? PartnerPersonId,
    decimal NormalSaleProfitParty1Percent, decimal NormalSaleProfitParty2Percent,
    decimal CreditSaleProfitParty1Percent, decimal CreditSaleProfitParty2Percent, decimal LossParty1Percent, decimal LossParty2Percent,
    IReadOnlyList<CostResponsibilityInput> CostResponsibilities, bool CashSalesAllowed, bool CreditSalesAllowed,
    CreditCalculationMethod? CreditCalculationMethod, decimal? DefaultCreditRatePercent, int? CheckCollectionGracePeriodDays,
    string? ResponsiblePartyAfterGracePeriod, bool ReceivablesFinancingAllowed, string? FinancingCostResponsibleParty,
    string? FinancedCheckPrincipalRiskParty, string PartnerEntitlementCreatedWhen, string CashSaleClaimPayableWhen,
    string CreditSaleClaimPayableWhen, bool UseActualTransactionFxRate, bool SeparateFxPurchaseAndPartnerRemittance,
    bool CarryPartnerOverpaymentToCurrentAccount, Guid? PrimaryInvestorId = null, Guid? PartnerInvestorId = null);

public static class BusinessContractRules
{
    public static readonly string[] CostTypes = ["GoodsPurchase", "Insurance", "InternationalFreight", "Customs", "DomesticFreight", "Warehousing", "Commission", "BadDebt", "ReturnedCheck", "ReceivablesFinancing", "RemittanceFee"];
    public static readonly HashSet<string> FixedCapitalCostTypes = ["GoodsPurchase", "Insurance", "InternationalFreight", "Customs", "DomesticFreight", "BadDebt", "ReturnedCheck", "ReceivablesFinancing"];
    public static readonly HashSet<string> ConfigurableCapitalCostTypes = ["Warehousing", "Commission", "RemittanceFee"];
    private static readonly HashSet<string> LegacyCustomsCostTypes = new(StringComparer.OrdinalIgnoreCase)
        { "Clearance", "Customs Clearance", "Demurrage", "CustomsWarehousing", "Customs Warehouse", "CustomsStorage", "Customs Storage" };
    private static readonly HashSet<string> Parties = ["Party1", "Party2", "Shared"];
    private static readonly HashSet<string> EntitlementEvents = ["OnTransactionPosting", "OnCashCollection", "OnSettlement"];
    private static readonly HashSet<string> CashPayableEvents = ["OnSalePosting", "OnCashCollection"];
    private static readonly HashSet<string> CreditPayableEvents = ["OnCollection", "OnDueDate", "OnSettlement"];

    public static bool AffectsCapitalContribution(CostResponsibilityInput cost) =>
        FixedCapitalCostTypes.Contains(cost.CostType)
        || ConfigurableCapitalCostTypes.Contains(cost.CostType) && cost.AffectsCapitalContribution != false;

    public static bool ShouldCountCostTowardCapital(string? contractCostsJson, string costType)
    {
        var normalizedType = costType.Trim();
        var canonicalType = LegacyCustomsCostTypes.Contains(normalizedType) ? "Customs"
            : string.Equals(normalizedType, "BadDebtReturnedCheck", StringComparison.OrdinalIgnoreCase) ? "BadDebt"
            : CostTypes.FirstOrDefault(x => string.Equals(x, normalizedType, StringComparison.OrdinalIgnoreCase)) ?? normalizedType;
        if (FixedCapitalCostTypes.Contains(canonicalType)) return true;
        if (!ConfigurableCapitalCostTypes.Contains(canonicalType)) return false;
        var configuredCosts = string.IsNullOrWhiteSpace(contractCostsJson)
            ? Array.Empty<CostResponsibilityInput>()
            : JsonSerializer.Deserialize<CostResponsibilityInput[]>(contractCostsJson) ?? [];
        var configured = configuredCosts.FirstOrDefault(x => string.Equals(x.CostType, canonicalType, StringComparison.OrdinalIgnoreCase));
        return configured is null || AffectsCapitalContribution(configured);
    }

    public static Dictionary<string, string[]> Validate(BusinessContractInput input)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(input.ContractName)) errors[nameof(input.ContractName)] = ["Contract name is required."];
        if (input.EffectiveFrom == default) errors[nameof(input.EffectiveFrom)] = ["Effective start date is required."];
        if (!Enum.IsDefined(input.BusinessStructure)) errors[nameof(input.BusinessStructure)] = ["Business structure is required."];
        if (!input.PrimaryInvestorId.HasValue || input.PrimaryInvestorId == Guid.Empty) errors[nameof(input.PrimaryInvestorId)] = ["Primary investor is required."];
        if (input.BusinessStructure == BusinessStructure.Partnership && (!input.PartnerInvestorId.HasValue || input.PartnerInvestorId == Guid.Empty || input.PartnerInvestorId == input.PrimaryInvestorId))
            errors[nameof(input.PartnerInvestorId)] = ["A distinct registered partner investor is required."];
        var allocations = new[] {
            ("NormalSaleProfit", input.NormalSaleProfitParty1Percent, input.NormalSaleProfitParty2Percent),
            ("CreditSaleProfit", input.CreditSaleProfitParty1Percent, input.CreditSaleProfitParty2Percent),
            ("Loss", input.LossParty1Percent, input.LossParty2Percent) };
        if (input.BusinessStructure == BusinessStructure.Partnership)
            foreach (var (name, one, two) in allocations) ValidateAllocation(errors, name, one, two);
        if (input.CostResponsibilities is null || input.CostResponsibilities.Count != CostTypes.Length
            || !input.CostResponsibilities.Select(x => x.CostType).Order().SequenceEqual(CostTypes.Order()))
            errors[nameof(input.CostResponsibilities)] = ["Every supported cost type must be allocated exactly once."];
        else if (input.BusinessStructure == BusinessStructure.Partnership)
            foreach (var row in input.CostResponsibilities) ValidateAllocation(errors, $"CostResponsibilities.{row.CostType}", row.Party1Percent, row.Party2Percent);
        if (!input.CashSalesAllowed && !input.CreditSalesAllowed) errors["SalesAllowed"] = ["At least one sales mode must be allowed."];
        if (input.CreditSalesAllowed)
        {
            if (!input.CreditCalculationMethod.HasValue) errors[nameof(input.CreditCalculationMethod)] = ["Credit calculation method is required."];
            if (input.DefaultCreditRatePercent is < 0 or > 100) errors[nameof(input.DefaultCreditRatePercent)] = ["Default credit rate must be between 0 and 100."];
            if (input.CheckCollectionGracePeriodDays is null or < 0) errors[nameof(input.CheckCollectionGracePeriodDays)] = ["Grace period must be zero or greater."];
            if (!ValidParty(input.ResponsiblePartyAfterGracePeriod)) errors[nameof(input.ResponsiblePartyAfterGracePeriod)] = ["Responsible party is required."];
            if (input.ReceivablesFinancingAllowed && (!ValidParty(input.FinancingCostResponsibleParty) || !ValidParty(input.FinancedCheckPrincipalRiskParty)))
                errors[nameof(input.ReceivablesFinancingAllowed)] = ["Financing cost and principal risk responsibilities are required."];
        }
        if (!EntitlementEvents.Contains(input.PartnerEntitlementCreatedWhen)) errors[nameof(input.PartnerEntitlementCreatedWhen)] = ["Partner entitlement event is invalid."];
        if (!CashPayableEvents.Contains(input.CashSaleClaimPayableWhen)) errors[nameof(input.CashSaleClaimPayableWhen)] = ["Cash-sale payable event is invalid."];
        if (!CreditPayableEvents.Contains(input.CreditSaleClaimPayableWhen)) errors[nameof(input.CreditSaleClaimPayableWhen)] = ["Credit-sale payable event is invalid."];
        return errors;
    }

    private static bool ValidParty(string? value) => value is not null && Parties.Contains(value);
    private static void ValidateAllocation(Dictionary<string, string[]> errors, string name, decimal one, decimal two)
    {
        if (one is < 0 or > 100 || two is < 0 or > 100 || one + two != 100)
            errors[name] = ["Party 1 and Party 2 percentages must each be between 0 and 100 and total exactly 100."];
    }
}
