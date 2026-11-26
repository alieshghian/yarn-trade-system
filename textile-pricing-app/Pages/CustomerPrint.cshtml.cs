using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using System.Globalization;
using TextilePricingApp.Models;
using TextilePricingApp.Services;

namespace TextilePricingApp.Pages;

public class CustomerPrintModel : PageModel
{
    private readonly CustomerPriceRepository _customerPrices;
    private readonly CustomerRepository _customers;
    private readonly FactoryPriceRepository _factoryPrices;
    private readonly PricingService _pricing;

    public CustomerPrintModel(
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
    public Customer? Customer { get; private set; }
    public decimal CostBasePrice { get; private set; }
    public decimal FactoryPrice { get; private set; }
    public decimal CreditDiscountPercent { get; private set; }
    public decimal CashDiscountPercent { get; private set; }
    public decimal AppliedCashDiscountPercent { get; private set; }
    public decimal GlobalProfitPercent { get; private set; }
    public decimal VatPercent { get; private set; }
    public decimal CashTotal { get; private set; }
    public decimal CreditTotal { get; private set; }
    public decimal CashWaste { get; private set; }
    public decimal CreditWaste { get; private set; }
    public decimal CashCost { get; private set; }
    public decimal CreditCost { get; private set; }
    public decimal CashFactorySale { get; private set; }
    public decimal CreditFactorySale { get; private set; }
    public decimal CashDiscountAmount { get; private set; }
    public decimal CreditDiscountAmount { get; private set; }
    public decimal CashDiscountedPrice { get; private set; }
    public decimal CreditDiscountedPrice { get; private set; }
    public decimal CreditPrice { get; private set; }
    public decimal CashPrice { get; private set; }
    public decimal CreditMultiplier { get; private set; }
    public string ReportDateText { get; private set; } = "";

    public IActionResult OnGet()
    {
        Calculation = _pricing.Calculate(ProductCode);
        if (string.IsNullOrWhiteSpace(Calculation.Recipe.Code))
        {
            return NotFound();
        }

        ProductCode = Calculation.Recipe.Code;
        Customer = CustomerId is > 0 ? _customers.GetById(CustomerId.Value) : null;
        var discounts = Customer is null
            ? new Dictionary<string, CustomerProductDiscount>(StringComparer.CurrentCultureIgnoreCase)
            : _customerPrices.GetByCustomer(Customer.Id);

        var settings = _pricing.Settings;
        var vatRate = Customer?.IsVatExempt == true ? 0 : settings.VatRate;
        VatPercent = vatRate * 100m;
        CashTotal = RoundPrice(Calculation.Summary.CashTotal);
        CashWaste = RoundPrice(CashTotal * Calculation.AppliedWasteRate);
        CashCost = RoundPrice(CashTotal + CashWaste);
        CostBasePrice = CashCost;

        var systemFactoryPrice = RoundPrice(CashCost * (1 + settings.GlobalProfitPercent / 100m));
        var storedFactoryPrices = _factoryPrices.GetAllDetails();
        var roundedFactoryPrice = storedFactoryPrices.TryGetValue(ProductCode, out var storedFactoryPrice)
            ? RoundPrice(storedFactoryPrice.Price)
            : systemFactoryPrice;
        var factoryCashPrice = CalculateCustomerPrice(roundedFactoryPrice, settings.CashPaymentDiscountPercent);

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

        CashFactorySale = factoryCashPrice;
        FactoryPrice = roundedFactoryPrice;
        GlobalProfitPercent = CalculateProfitPercent(CashFactorySale, CashCost);
        AppliedCashDiscountPercent = RowCashDiscountPercent ?? CashDiscountPercent;
        CashDiscountedPrice = CalculateCustomerPrice(CashFactorySale, AppliedCashDiscountPercent);
        CashDiscountAmount = CashFactorySale - CashDiscountedPrice;

        var targetCreditPrice = ApplyVat(CalculateCustomerPrice(roundedFactoryPrice, CreditDiscountPercent), vatRate);
        CreditMultiplier = CalculateCreditMultiplier(
            CashTotal,
            Calculation.AppliedWasteRate,
            GlobalProfitPercent,
            CreditDiscountPercent,
            vatRate,
            targetCreditPrice,
            roundedFactoryPrice);
        CreditTotal = RoundPrice(CashTotal * CreditMultiplier);
        CreditWaste = RoundPrice(CreditTotal * Calculation.AppliedWasteRate);
        CreditCost = RoundPrice(CreditTotal + CreditWaste);
        CreditFactorySale = RoundPrice(CreditCost * (1 + GlobalProfitPercent / 100m));
        CreditDiscountedPrice = CalculateCustomerPrice(CreditFactorySale, CreditDiscountPercent);
        CreditDiscountAmount = CreditFactorySale - CreditDiscountedPrice;
        CashPrice = ApplyVat(CashDiscountedPrice, vatRate);
        CreditPrice = ApplyVat(CreditDiscountedPrice, vatRate);
        ReportDateText = ToPersianDate(DateTime.Today);
        return Page();
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
}
