using YarnTrade.Api.Controllers;
using YarnTrade.Api.Domain;
using YarnTrade.Api.Services;

namespace YarnTrade.Tests;

public sealed class BusinessCalculationsTests
{
    private static CreditRateRule[] Rules =>
    [
        new() { Version = 1, ValidFrom = new DateOnly(2024, 1, 1), FromDay = 1, ToDay = 30, PeriodDays = 30, PeriodRatePercent = 4 },
        new() { Version = 1, ValidFrom = new DateOnly(2024, 1, 1), FromDay = 31, ToDay = 60, PeriodDays = 30, PeriodRatePercent = 3 },
        new() { Version = 1, ValidFrom = new DateOnly(2024, 1, 1), FromDay = 61, ToDay = 90, PeriodDays = 30, PeriodRatePercent = 3 },
        new() { Version = 1, ValidFrom = new DateOnly(2024, 1, 1), FromDay = 91, PeriodDays = 30, PeriodRatePercent = 3 }
    ];

    [Fact]
    public void Credit_45_Days_Is_5_5_Percent()
    {
        var result = BusinessCalculations.CalculateSystemCreditPrice(100m, 45, Rules);
        Assert.Equal(5.5m, result.IncreasePercent);
        Assert.Equal(105.5m, result.CreditUnitPrice);
    }

    [Fact]
    public void Credit_75_Days_Is_8_5_Percent() => Assert.Equal(8.5m, BusinessCalculations.CalculateSystemCreditPrice(100m, 75, Rules).IncreasePercent);

    [Fact]
    public void Negotiated_Credit_Price_Remains_Authoritative()
    {
        var result = BusinessCalculations.AnalyzeNegotiatedCreditPrice(100m, 112m, new DateOnly(2025, 1, 1), new DateOnly(2025, 3, 2));
        Assert.Equal(112m, result.CreditUnitPrice);
        Assert.Equal(12m, result.IncreasePercent);
        Assert.Equal(60, result.CreditDays);
    }

    [Fact]
    public void Weighted_Due_Days_Is_54()
    {
        var result = BusinessCalculations.CalculateWeightedDueDays([(200m, 0), (300m, 30), (500m, 90)]);
        Assert.Equal(54m, result);
    }

    [Fact]
    public void Mixed_Payment_Total_Is_Validated() => BusinessCalculations.ValidatePaymentTotal(10_000m, [(4_000m, 0m, null), (0m, 6m, 1_000m)], 0m);

    [Fact]
    public void Mixed_Payment_Difference_Is_Rejected() => Assert.Throws<InvalidOperationException>(() => BusinessCalculations.ValidatePaymentTotal(10_000m, [(9_000m, 0m, null)], 10m));

    [Fact]
    public void Fifo_Consumes_Oldest_First()
    {
        var (oldLayer, newLayer) = Layers();
        var result = BusinessCalculations.AllocateLayers(12m, [newLayer, oldLayer], CostingMethod.FIFO);
        Assert.Equal(oldLayer.LayerId, result[0].LayerId);
        Assert.Equal(10m, result[0].Quantity);
        Assert.Equal(2m, result[1].Quantity);
    }

    [Fact]
    public void Lifo_Consumes_Newest_First()
    {
        var (oldLayer, newLayer) = Layers();
        var result = BusinessCalculations.AllocateLayers(12m, [oldLayer, newLayer], CostingMethod.LIFO);
        Assert.Equal(newLayer.LayerId, result[0].LayerId);
        Assert.Equal(12m, result[0].Quantity);
    }

    [Fact]
    public void Weighted_Average_Is_Reproducible()
    {
        var (oldLayer, newLayer) = Layers();
        var result = BusinessCalculations.AllocateLayers(10m, [oldLayer, newLayer], CostingMethod.WeightedAverage).Single();
        Assert.Equal(10m / 3m, result.UnitTotalCostUSD);
        Assert.Equal(100m / 3m, result.TotalCostUSD);
    }

    [Fact]
    public void Cost_Is_Allocated_By_Weight()
    {
        var result = BusinessCalculations.AllocateCostByWeight(1_000m, [10m, 30m, 60m]);
        Assert.Equal([100m, 300m, 600m], result);
        Assert.Equal(1_000m, result.Sum());
    }

    [Fact]
    public void Sale_Date_Usd_Cost_Is_Recognized_In_Irr() => Assert.Equal(9_000_000m, BusinessCalculations.ConvertUsdToIrr(100m, 90_000m));

    [Fact]
    public void Partner_Shares_Must_Total_100()
    {
        var result = BusinessCalculations.SplitPartnerResult(1_000m, 60m, 40m);
        Assert.Equal(600m, result.IranianShare);
        Assert.Equal(400m, result.ChineseShare);
        Assert.Throws<InvalidOperationException>(() => BusinessCalculations.SplitPartnerResult(1_000m, 60m, 50m));
    }

    [Fact]
    public void Partner_Ledger_Keeps_Currencies_Separate()
    {
        var entries = new[] { Entry(100, 0, 10, 0), Entry(0, 300, 0, 20) };
        var balance = BusinessCalculations.CalculatePartnerBalance(entries);
        Assert.Equal(200m, balance.BalanceIRR);
        Assert.Equal(10m, balance.BalanceUSD);
    }

    [Fact]
    public void Settlement_Converts_Selected_Irr_Credit()
    {
        var result = BusinessCalculations.CalculateSettlement(9_000_000m, 10m, 100m, 90_000m);
        Assert.Equal(100m, result.ConvertedUSD);
        Assert.Equal(0m, result.ExcessUSD);
    }

    [Fact]
    public void Settlement_Overpayment_Creates_Usd_Debit_Advance()
    {
        var result = BusinessCalculations.CalculateSettlement(0m, 50m, 80m, 90_000m);
        Assert.Equal(30m, result.ExcessUSD);
    }

    [Fact]
    public void Customer_Usd_Receipt_Uses_Document_Rate() => Assert.Equal(4_500_000m, BusinessCalculations.ConvertUsdToIrr(50m, 90_000m));

    [Fact]
    public void Valid_Check_Transition_Is_Accepted() => Assert.True(CheckTransitions.IsAllowed(CheckStatus.Deposited, CheckStatus.Collected));

    [Fact]
    public void Invalid_Check_Transition_Is_Rejected() => Assert.False(CheckTransitions.IsAllowed(CheckStatus.Collected, CheckStatus.Bounced));

    [Fact]
    public void Negative_Stock_Is_Prevented()
    {
        var (oldLayer, _) = Layers();
        Assert.Throws<InvalidOperationException>(() => BusinessCalculations.AllocateLayers(11m, [oldLayer], CostingMethod.FIFO));
    }

    [Fact]
    public void Partial_Open_Ended_Rule_Uses_Exact_Days() => Assert.Equal(11.5m, BusinessCalculations.CalculateSystemCreditPrice(100m, 105, Rules).IncreasePercent);

    private static (LayerInput Old, LayerInput New) Layers() =>
    (
        new(Guid.NewGuid(), new DateTime(2024, 1, 1), 10m, 1m, 0.5m, 0.5m),
        new(Guid.NewGuid(), new DateTime(2024, 2, 1), 20m, 3m, 0.5m, 0.5m)
    );

    private static PartnerLedgerEntry Entry(decimal debitIrr, decimal creditIrr, decimal debitUsd, decimal creditUsd) => new()
    {
        PartnerId = Guid.NewGuid(), EntryDate = new DateOnly(2025, 1, 1), EntryType = "Test", DescriptionFa = "آزمایش", DescriptionEn = "Test",
        DebitIRR = debitIrr, CreditIRR = creditIrr, DebitUSD = debitUsd, CreditUSD = creditUsd, SourceDocumentType = "Test", SourceDocumentId = Guid.NewGuid(), IsPosted = true
    };
}
