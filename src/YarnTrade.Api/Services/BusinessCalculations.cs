using System.Data.SqlTypes;
using YarnTrade.Api.Domain;

namespace YarnTrade.Api.Services;

public sealed record CreditPriceResult(int CreditDays, decimal IncreasePercent, decimal CreditUnitPrice, decimal IncreaseAmount);
public sealed record LayerInput(Guid LayerId, DateTime ReceivedAtUtc, decimal AvailableQuantity, decimal UnitPurchaseUSD, decimal UnitFreightUSD, decimal UnitIranianCostUSD);
public sealed record LayerAllocation(Guid LayerId, decimal Quantity, decimal UnitTotalCostUSD, decimal TotalCostUSD);
public sealed record PartnerBalance(decimal DebitIRR, decimal CreditIRR, decimal DebitUSD, decimal CreditUSD)
{
    public decimal BalanceIRR => CreditIRR - DebitIRR;
    public decimal BalanceUSD => CreditUSD - DebitUSD;
}

public static class BusinessCalculations
{
    public static CreditPriceResult CalculateSystemCreditPrice(decimal cashUnitPrice, int creditDays, IReadOnlyCollection<CreditRateRule> rules)
    {
        if (cashUnitPrice <= 0) throw new ArgumentOutOfRangeException(nameof(cashUnitPrice));
        if (creditDays < 0) throw new ArgumentOutOfRangeException(nameof(creditDays));
        var percent = 0m;
        foreach (var rule in rules.OrderBy(x => x.FromDay))
        {
            if (creditDays < rule.FromDay) continue;
            var cappedEnd = rule.ToDay.HasValue ? Math.Min(creditDays, rule.ToDay.Value) : creditDays;
            var usedDays = Math.Max(0, cappedEnd - rule.FromDay + 1);
            percent += rule.PeriodRatePercent * usedDays / rule.PeriodDays;
        }
        var creditPrice = cashUnitPrice * (1m + percent / 100m);
        return new(creditDays, percent, creditPrice, creditPrice - cashUnitPrice);
    }

    public static CreditPriceResult AnalyzeNegotiatedCreditPrice(decimal cashUnitPrice, decimal agreedCreditPrice, DateOnly saleDate, DateOnly dueDate)
    {
        if (cashUnitPrice <= 0) throw new ArgumentOutOfRangeException(nameof(cashUnitPrice));
        var days = dueDate.DayNumber - saleDate.DayNumber;
        if (days <= 0) throw new ArgumentOutOfRangeException(nameof(dueDate));
        var increase = agreedCreditPrice - cashUnitPrice;
        var percent = increase / cashUnitPrice * 100m;
        return new(days, percent, agreedCreditPrice, increase);
    }

    public static decimal CalculateWeightedDueDays(IEnumerable<(decimal AmountIRR, int DaysFromSale)> payments)
    {
        var rows = payments.ToArray();
        var total = rows.Sum(x => x.AmountIRR);
        if (total <= 0) throw new ArgumentException("Payment total must be positive.", nameof(payments));
        return rows.Sum(x => x.AmountIRR * x.DaysFromSale) / total;
    }

    public static DateOnly CalculateWeightedDueDate(DateOnly saleDate, decimal weightedDays) =>
        saleDate.AddDays((int)Math.Round(weightedDays, MidpointRounding.AwayFromZero));

    public static IReadOnlyList<decimal> AllocateCostByWeight(decimal totalCost, IReadOnlyList<decimal> weights)
    {
        if (totalCost < 0) throw new ArgumentOutOfRangeException(nameof(totalCost));
        if (weights.Any(x => x < 0)) throw new ArgumentOutOfRangeException(nameof(weights));
        var totalWeight = weights.Sum();
        if (totalWeight <= 0) throw new ArgumentException("Total weight must be positive.", nameof(weights));
        var results = weights.Select(x => totalCost * x / totalWeight).ToArray();
        if (results.Length > 0) results[^1] += totalCost - results.Sum();
        return results;
    }

    public static IReadOnlyList<LayerAllocation> AllocateLayers(decimal quantity, IEnumerable<LayerInput> layers, CostingMethod method)
    {
        if (quantity <= 0) throw new ArgumentOutOfRangeException(nameof(quantity));
        var available = layers.Where(x => x.AvailableQuantity > 0).ToArray();
        if (available.Sum(x => x.AvailableQuantity) < quantity) throw new InvalidOperationException("Insufficient stock.");

        if (method == CostingMethod.WeightedAverage)
        {
            var totalAvailable = available.Sum(x => x.AvailableQuantity);
            var average = available.Sum(x => x.AvailableQuantity * (x.UnitPurchaseUSD + x.UnitFreightUSD + x.UnitIranianCostUSD)) / totalAvailable;
            return [new LayerAllocation(Guid.Empty, quantity, average, quantity * average)];
        }

        var ordered = method == CostingMethod.FIFO
            ? available.OrderBy(x => x.ReceivedAtUtc).ThenBy(x => new SqlGuid(x.LayerId))
            : available.OrderByDescending(x => x.ReceivedAtUtc).ThenByDescending(x => new SqlGuid(x.LayerId));
        var remaining = quantity;
        var result = new List<LayerAllocation>();
        foreach (var layer in ordered)
        {
            var used = Math.Min(remaining, layer.AvailableQuantity);
            if (used <= 0) continue;
            var unitCost = layer.UnitPurchaseUSD + layer.UnitFreightUSD + layer.UnitIranianCostUSD;
            result.Add(new(layer.LayerId, used, unitCost, used * unitCost));
            remaining -= used;
            if (remaining == 0) break;
        }
        return result;
    }

    public static void ValidatePaymentTotal(decimal receivableIRR, IEnumerable<(decimal AmountIRR, decimal AmountUSD, decimal? ExchangeRate)> rows, decimal toleranceIRR)
    {
        var total = rows.Sum(x => x.AmountIRR + x.AmountUSD * (x.ExchangeRate ?? 0m));
        if (Math.Abs(receivableIRR - total) > toleranceIRR)
            throw new InvalidOperationException($"Payment schedule difference is {receivableIRR - total:0.##} IRR.");
    }

    public static decimal ConvertUsdToIrr(decimal amountUSD, decimal exchangeRate, int decimals = 0)
    {
        if (exchangeRate <= 0) throw new ArgumentOutOfRangeException(nameof(exchangeRate));
        return Math.Round(amountUSD * exchangeRate, decimals, MidpointRounding.AwayFromZero);
    }

    public static (decimal IranianShare, decimal ChineseShare) SplitPartnerResult(decimal amount, decimal iranianPercent, decimal chinesePercent)
    {
        if (iranianPercent + chinesePercent != 100m) throw new InvalidOperationException("Partner percentages must total 100%.");
        var iranian = amount * iranianPercent / 100m;
        return (iranian, amount - iranian);
    }

    public static PartnerBalance CalculatePartnerBalance(IEnumerable<PartnerLedgerEntry> entries) => new(
        entries.Sum(x => x.DebitIRR), entries.Sum(x => x.CreditIRR), entries.Sum(x => x.DebitUSD), entries.Sum(x => x.CreditUSD));

    public static (decimal ConvertedUSD, decimal ExcessUSD) CalculateSettlement(decimal availableIRRCredit, decimal existingUSDCredit, decimal paidUSD, decimal rate)
    {
        if (rate <= 0 || paidUSD < 0) throw new ArgumentOutOfRangeException();
        var converted = availableIRRCredit / rate;
        var entitlement = converted + existingUSDCredit;
        return (converted, Math.Max(0m, paidUSD - entitlement));
    }
}
