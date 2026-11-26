using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using System.Globalization;
using TextilePricingApp.Models;
using TextilePricingApp.Services;

namespace TextilePricingApp.Pages;

public class TemporaryPriceModel : PageModel
{
    private readonly CustomerPriceRepository _customerPrices;
    private readonly CustomerRepository _customers;
    private readonly FactoryPriceRepository _factoryPrices;
    private readonly PricingService _pricing;

    public TemporaryPriceModel(
        CustomerPriceRepository customerPrices,
        CustomerRepository customers,
        FactoryPriceRepository factoryPrices,
        PricingService pricing)
    {
        _customerPrices = customerPrices;
        _customers = customers;
        _factoryPrices = factoryPrices;
        _pricing = pricing;
    }

    [BindProperty(SupportsGet = true)]
    public int? CustomerId { get; set; }

    [BindProperty(SupportsGet = true)]
    public string? ProductCode { get; set; }

    [BindProperty(SupportsGet = true)]
    public decimal? RowCashDiscountPercent { get; set; }

    [BindProperty(SupportsGet = true)]
    public decimal? RowCreditDiscountPercent { get; set; }

    public ProductCalculation Calculation { get; private set; } = new();
    public IReadOnlyList<Customer> Customers { get; private set; } = [];
    public IReadOnlyList<ProductRecipe> Products { get; private set; } = [];
    public Customer? Customer { get; private set; }
    public string ProductLabel { get; private set; } = "";
    public IReadOnlyList<TemporaryPriceLine> Lines { get; private set; } = [];
    public decimal DollarRate { get; private set; }
    public decimal WastePercent { get; private set; }
    public decimal ProfitPercent { get; private set; }
    public decimal VatPercent { get; private set; }
    public decimal CreditMultiplier { get; private set; }
    public decimal CashDiscountPercent { get; private set; }
    public decimal CreditDiscountPercent { get; private set; }
    public string ReportDateText { get; private set; } = "";

    public IActionResult OnGet()
    {
        Calculation = _pricing.Calculate(ProductCode);
        if (string.IsNullOrWhiteSpace(Calculation.Recipe.Code))
        {
            return NotFound();
        }

        ProductCode = Calculation.Recipe.Code;
        Products = _pricing.Recipes;
        ProductLabel = FormatProductLabel(Calculation.Recipe);
        Customers = _customers.GetAll();
        Customer = CustomerId is > 0 ? _customers.GetById(CustomerId.Value) : null;
        var discounts = Customer is null
            ? new Dictionary<string, CustomerProductDiscount>(StringComparer.CurrentCultureIgnoreCase)
            : _customerPrices.GetByCustomer(Customer.Id);
        if (discounts.TryGetValue(ProductCode, out var discount))
        {
            CreditDiscountPercent = discount.CreditDiscountPercent;
            CashDiscountPercent = discount.CashDiscountPercent;
        }

        if (RowCashDiscountPercent.HasValue)
        {
            CashDiscountPercent = RowCashDiscountPercent.Value;
        }

        if (RowCreditDiscountPercent.HasValue)
        {
            CreditDiscountPercent = RowCreditDiscountPercent.Value;
        }

        var settings = _pricing.Settings;
        DollarRate = settings.EffectiveDollarRate;
        WastePercent = Calculation.AppliedWasteRate * 100m;
        VatPercent = Customer?.IsVatExempt == true ? 0 : settings.VatRate * 100m;

        var cashTotal = RoundPrice(Calculation.Summary.CashTotal);
        var cashCost = RoundPrice(cashTotal + RoundPrice(cashTotal * Calculation.AppliedWasteRate));
        var systemFactoryPrice = RoundPrice(cashCost * (1 + settings.GlobalProfitPercent / 100m));
        var storedFactoryPrices = _factoryPrices.GetAllDetails();
        var roundedFactoryPrice = storedFactoryPrices.TryGetValue(ProductCode, out var storedFactoryPrice)
            ? RoundPrice(storedFactoryPrice.Price)
            : systemFactoryPrice;
        var factoryCashPrice = CalculateCustomerPrice(roundedFactoryPrice, settings.CashPaymentDiscountPercent);
        ProfitPercent = CalculateProfitPercent(factoryCashPrice, cashCost);
        var targetCreditPrice = ApplyVat(CalculateCustomerPrice(roundedFactoryPrice, CreditDiscountPercent), VatPercent / 100m);
        CreditMultiplier = CalculateCreditMultiplier(
            cashTotal,
            Calculation.AppliedWasteRate,
            ProfitPercent,
            CreditDiscountPercent,
            VatPercent / 100m,
            targetCreditPrice,
            roundedFactoryPrice);

        Lines = BuildLines();
        ReportDateText = ToPersianDate(DateTime.Today);
        return Page();
    }

    private IReadOnlyList<TemporaryPriceLine> BuildLines()
    {
        var materials = _pricing.SearchMaterials(null, int.MaxValue)
            .ToDictionary(item => item.Name, StringComparer.CurrentCultureIgnoreCase);

        return Calculation.Lines
            .Select(line =>
            {
                materials.TryGetValue(line.MaterialName, out var material);
                var sourceUnit = material?.Unit ?? "";
                var editableUnitPrice = string.Equals(sourceUnit, "دلار", StringComparison.CurrentCultureIgnoreCase)
                    ? DollarRate > 0 ? line.UnitPrice / DollarRate : line.UnitPrice
                    : line.UnitPrice;

                return new TemporaryPriceLine(
                    line.MaterialName,
                    line.Quantity,
                    sourceUnit,
                    string.Equals(sourceUnit, "دلار", StringComparison.CurrentCultureIgnoreCase),
                    editableUnitPrice);
            })
            .ToList();
    }

    private static decimal CalculateCustomerPrice(decimal factoryPrice, decimal discountPercent)
    {
        return RoundPrice(factoryPrice * (1 - discountPercent / 100m));
    }

    private static decimal CalculateCreditMultiplier(
        decimal cashTotal,
        decimal wasteRate,
        decimal profitPercent,
        decimal discountPercent,
        decimal vatRate,
        decimal targetFinalPrice,
        decimal preferredFactoryPrice)
    {
        if (cashTotal <= 0)
        {
            return 0;
        }

        var profitFactor = 1 + profitPercent / 100m;
        var estimatedCost = profitFactor <= 0 ? preferredFactoryPrice : preferredFactoryPrice / profitFactor;
        var estimatedTotal = wasteRate <= -1 ? estimatedCost : estimatedCost / (1 + wasteRate);
        var startingTotal = RoundPrice(estimatedTotal);
        var bestTotal = startingTotal;
        var bestFinalDifference = decimal.MaxValue;
        var bestFactoryDifference = decimal.MaxValue;

        const int searchSteps = 10000;
        const decimal step = 100m;
        for (var offset = -searchSteps; offset <= searchSteps; offset++)
        {
            var total = startingTotal + offset * step;
            if (total < 0)
            {
                continue;
            }

            var waste = RoundPrice(total * wasteRate);
            var cost = RoundPrice(total + waste);
            var factoryPrice = RoundPrice(cost * profitFactor);
            var discountedPrice = CalculateCustomerPrice(factoryPrice, discountPercent);
            var finalPrice = ApplyVat(discountedPrice, vatRate);
            var finalDifference = Math.Abs(finalPrice - targetFinalPrice);
            var factoryDifference = Math.Abs(factoryPrice - preferredFactoryPrice);

            if (finalDifference < bestFinalDifference ||
                (finalDifference == bestFinalDifference && factoryDifference < bestFactoryDifference))
            {
                bestTotal = total;
                bestFinalDifference = finalDifference;
                bestFactoryDifference = factoryDifference;
            }

            if (finalDifference == 0 && factoryDifference == 0)
            {
                break;
            }
        }

        return bestTotal / cashTotal;
    }

    private static decimal ApplyVat(decimal price, decimal vatRate)
    {
        return RoundPrice(price * (1 + vatRate));
    }

    private static decimal RoundPrice(decimal value)
    {
        return decimal.Round(Math.Max(0, value) / 100m, 0, MidpointRounding.AwayFromZero) * 100m;
    }

    private static decimal CalculateProfitPercent(decimal price, decimal costBase)
    {
        return costBase == 0 ? 0 : (price - costBase) / costBase * 100m;
    }

    private static string ToPersianDate(DateTime date)
    {
        var calendar = new PersianCalendar();
        return string.Create(CultureInfo.InvariantCulture, $"{calendar.GetYear(date):0000}/{calendar.GetMonth(date):00}/{calendar.GetDayOfMonth(date):00}");
    }

    public static string FormatProductLabel(ProductRecipe product)
    {
        return string.IsNullOrWhiteSpace(product.Name)
            ? product.Code
            : $"{product.Code} - {product.Name}";
    }

    public sealed record TemporaryPriceLine(
        string MaterialName,
        decimal Quantity,
        string SourceUnit,
        bool IsDollar,
        decimal EditableUnitPrice);
}
