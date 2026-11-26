using System.Globalization;
using TextilePricingApp.Models;

namespace TextilePricingApp.Services;

public sealed class CustomerPriceReportService
{
    private readonly CustomerRepository _customers;
    private readonly CustomerPriceRepository _customerPrices;
    private readonly FactoryPriceRepository _factoryPrices;
    private readonly PricingService _pricing;

    public CustomerPriceReportService(
        CustomerRepository customers,
        CustomerPriceRepository customerPrices,
        FactoryPriceRepository factoryPrices,
        PricingService pricing)
    {
        _customers = customers;
        _customerPrices = customerPrices;
        _factoryPrices = factoryPrices;
        _pricing = pricing;
    }

    public CustomerPriceReport Build(
        int? customerId,
        string? query,
        string statusFilter,
        string sortBy = "default",
        string sortDirection = "desc",
        bool onlyWithTargetPrice = false)
    {
        var selectedCustomer = customerId is > 0
            ? _customers.GetById(customerId.Value)
            : null;
        var products = GetProductsByQuery(query);
        var filteredRows = (selectedCustomer is null
            ? BuildRows(products, null, new Dictionary<string, CustomerProductDiscount>(StringComparer.CurrentCultureIgnoreCase))
            : BuildRowsForCustomer(products, selectedCustomer))
            .Where(row =>
                (statusFilter == "all" || row.StatusKey == statusFilter) &&
                (!onlyWithTargetPrice || row.HasTargetPrice));
        var rows = ApplySort(filteredRows, sortBy, sortDirection);

        return new CustomerPriceReport(
            selectedCustomer?.Id,
            selectedCustomer?.Name ?? "همه محصولات",
            string.IsNullOrWhiteSpace(query) ? null : query.Trim(),
            string.IsNullOrWhiteSpace(statusFilter) ? "all" : statusFilter,
            DateTime.Now,
            rows);
    }

    private static IReadOnlyList<CustomerPriceRow> ApplySort(
        IEnumerable<CustomerPriceRow> rows,
        string? sortBy,
        string? sortDirection)
    {
        var normalizedSort = sortBy?.Trim() switch
        {
            "base-profit" => "base-profit",
            "target-profit" => "target-profit",
            "credit-profit" => "credit-profit",
            "profit-gap" => "profit-gap",
            _ => "default"
        };
        if (normalizedSort == "default")
        {
            return rows.ToList();
        }

        static decimal Key(CustomerPriceRow row, string sort) => sort switch
        {
            "base-profit" => row.TargetProfitPercent,
            "target-profit" => row.CashProfitPercent,
            "credit-profit" => row.CreditProfitPercent,
            "profit-gap" => Math.Abs(row.CreditProfitPercent - row.TargetProfitPercent),
            _ => 0
        };

        return string.Equals(sortDirection, "asc", StringComparison.OrdinalIgnoreCase)
            ? rows.OrderBy(row => Key(row, normalizedSort)).ThenBy(row => row.ProductCode, StringComparer.CurrentCulture).ToList()
            : rows.OrderByDescending(row => Key(row, normalizedSort)).ThenBy(row => row.ProductCode, StringComparer.CurrentCulture).ToList();
    }

    private IReadOnlyList<CustomerPriceRow> BuildRowsForCustomer(IEnumerable<ProductRecipe> products, Customer customer)
    {
        var discounts = _customerPrices.GetByCustomer(customer.Id);
        var discountedProductCodes = discounts.Keys.ToHashSet(StringComparer.CurrentCultureIgnoreCase);
        return BuildRows(
            products.Where(product => discountedProductCodes.Contains(product.Code)),
            customer,
            discounts);
    }

    public IReadOnlyList<CustomerPriceRow> BuildAssigned(Customer customer, IEnumerable<string> productCodes)
    {
        var codes = productCodes.ToHashSet(StringComparer.OrdinalIgnoreCase);
        return BuildRows(_pricing.Recipes.Where(p => codes.Contains(p.Code)), customer, _customerPrices.GetByCustomer(customer.Id));
    }

    private IReadOnlyList<CustomerPriceRow> BuildRows(
        IEnumerable<ProductRecipe> products,
        Customer? customer,
        IReadOnlyDictionary<string, CustomerProductDiscount> discounts)
    {
        var factoryPrices = _factoryPrices.GetAllDetails();
        var settings = _pricing.Settings;
        var cashPaymentDiscountPercent = settings.CashPaymentDiscountPercent;
        var vatRate = customer?.IsVatExempt == true ? 0 : settings.VatRate;
        var customerId = customer?.Id ?? 0;
        var customerName = customer?.Name ?? "همه محصولات";

        return products
            .Select(product =>
            {
                var calculation = _pricing.Calculate(product.Code);
                var costBase = calculation.Summary.CashCost;
                var systemFactoryPrice = RoundPrice(costBase * (1 + settings.GlobalProfitPercent / 100m));
                var roundedCostBase = RoundPrice(costBase);
                var hasFactoryPrice = factoryPrices.TryGetValue(product.Code, out var storedFactoryPrice);
                var storedFactorySalePrice = hasFactoryPrice ? storedFactoryPrice : null;
                var factoryPrice = hasFactoryPrice
                    ? storedFactorySalePrice!.Price
                    : systemFactoryPrice;
                var hasDiscount = discounts.TryGetValue(product.Code, out var discount);
                var creditDiscountPercent = hasDiscount && discount is not null ? discount.CreditDiscountPercent : 0;
                var cashDiscountPercent = hasDiscount && discount is not null ? discount.CashDiscountPercent : 0;
                var roundedFactoryPrice = RoundPrice(factoryPrice);
                var factoryCashPrice = CalculateCustomerPrice(roundedFactoryPrice, cashPaymentDiscountPercent);
                var customerPrice = CalculateCustomerPrice(roundedFactoryPrice, creditDiscountPercent);
                var customerCashPrice = cashDiscountPercent == 0
                    ? factoryCashPrice
                    : CalculateCustomerPrice(factoryCashPrice, cashDiscountPercent);
                var displayCustomerPrice = ApplyVat(customerPrice, vatRate);
                var displayCustomerCashPrice = ApplyVat(customerCashPrice, vatRate);
                var cashPriceDescription = cashDiscountPercent == 0
                    ? "قیمت نقدی کارخانه، چون تخفیف نقدی اختصاصی صفر است"
                    : $"قیمت نقدی مشتری بعد از تخفیف نقدی اختصاصی {cashDiscountPercent:N2}٪";
                var creditProfitPercent = CalculateProfitPercent(customerPrice, roundedCostBase);
                var cashProfitPercent = CalculateProfitPercent(customerCashPrice, roundedCostBase);
                var cashProfitOrLoss = customerCashPrice - roundedCostBase;
                var status = GetStatus(cashProfitOrLoss);
                var currentFactoryProfitPercent = CalculateProfitPercent(roundedFactoryPrice, roundedCostBase);
                var targetProfitPercent = hasFactoryPrice
                    ? storedFactorySalePrice!.BaseProfitPercent ?? currentFactoryProfitPercent
                    : 0;
                var hasTargetPrice = hasFactoryPrice && storedFactorySalePrice!.BaseProfitPercent is not null;

                return new CustomerPriceRow(
                    customerId,
                    customerName,
                    product.Code,
                    product.Name,
                    product.ProductGroupName,
                    product.ImagePath,
                    roundedCostBase,
                    roundedFactoryPrice,
                    creditDiscountPercent,
                    cashDiscountPercent,
                    cashPriceDescription,
                    customer?.IsVatExempt == true,
                    displayCustomerPrice,
                    displayCustomerCashPrice,
                    creditProfitPercent,
                    cashProfitPercent,
                    targetProfitPercent,
                    GetTargetProfitCssClass(targetProfitPercent),
                    GetProfitCssClass(creditProfitPercent, targetProfitPercent),
                    GetProfitCssClass(cashProfitPercent, targetProfitPercent),
                    hasTargetPrice,
                    hasDiscount,
                    hasDiscount && discount is not null && discount.LastEditedAt != DateTime.MinValue ? discount.LastEditedAt : (DateTime?)null,
                    status.Key,
                    status.Text,
                    status.CssClass);
            })
            .ToList();
    }

    private IReadOnlyList<ProductRecipe> GetProductsByQuery(string? queryText)
    {
        var products = _pricing.Recipes.AsEnumerable();
        if (!string.IsNullOrWhiteSpace(queryText))
        {
            var query = queryText.Trim();
            products = products.Where(product =>
                product.Code.Contains(query, StringComparison.CurrentCultureIgnoreCase) ||
                product.Name.Contains(query, StringComparison.CurrentCultureIgnoreCase) ||
                product.ProductGroupName.Contains(query, StringComparison.CurrentCultureIgnoreCase));
        }

        return products.ToList();
    }

    private static decimal CalculateCustomerPrice(decimal factoryPrice, decimal discountPercent)
    {
        var result = factoryPrice * (1 - discountPercent / 100m);
        return RoundPrice(result);
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

    private static string GetProfitCssClass(decimal profitPercent, decimal globalProfitPercent)
    {
        return profitPercent < globalProfitPercent
            ? "is-down"
            : "is-up";
    }

    private static string GetTargetProfitCssClass(decimal profitPercent)
    {
        return profitPercent < 0 ? "is-down" : "is-even";
    }

    private static CustomerPriceStatus GetStatus(decimal profitOrLoss)
    {
        if (profitOrLoss < 0)
        {
            return new CustomerPriceStatus("loss", "زیان نقدی", "factory-price-row--loss");
        }

        if (profitOrLoss > 0)
        {
            return new CustomerPriceStatus("profit", "سود نقدی", "factory-price-row--profit");
        }

        return new CustomerPriceStatus("equal", "بدون سود و زیان نقدی", "factory-price-row--equal");
    }

    public static string PersianDate(DateTime? value)
    {
        if (value is null)
        {
            return "-";
        }

        var local = value.Value.Kind == DateTimeKind.Utc ? value.Value.ToLocalTime() : value.Value;
        var calendar = new PersianCalendar();
        return $"{calendar.GetYear(local):0000}/{calendar.GetMonth(local):00}/{calendar.GetDayOfMonth(local):00}";
    }

    public static string PersianDateTime(DateTime? value)
    {
        if (value is null)
        {
            return "-";
        }

        var local = value.Value.Kind == DateTimeKind.Utc ? value.Value.ToLocalTime() : value.Value;
        return $"{PersianDate(local)} {local:HH:mm}";
    }
}
