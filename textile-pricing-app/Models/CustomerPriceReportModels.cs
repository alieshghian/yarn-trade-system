namespace TextilePricingApp.Models;

public sealed record CustomerPriceReport(
    int? CustomerId,
    string CustomerName,
    string? Query,
    string StatusFilter,
    DateTime CreatedAt,
    IReadOnlyList<CustomerPriceRow> Rows);

public sealed record CustomerPriceRow(
    int CustomerId,
    string CustomerName,
    string ProductCode,
    string ProductName,
    string ProductGroupName,
    string ImagePath,
    decimal CostBasePrice,
    decimal FactoryPrice,
    decimal CreditDiscountPercent,
    decimal CashDiscountPercent,
    string CashPriceDescription,
    bool IsVatExempt,
    decimal CustomerPrice,
    decimal CustomerCashPrice,
    decimal CreditProfitPercent,
    decimal CashProfitPercent,
    decimal TargetProfitPercent,
    string TargetProfitCssClass,
    string CreditProfitCssClass,
    string CashProfitCssClass,
    bool HasTargetPrice,
    bool HasDiscount,
    DateTime? LastEditedAt,
    string StatusKey,
    string StatusText,
    string StatusCssClass);

public sealed record CustomerPriceStatus(string Key, string Text, string CssClass);

public sealed class PriceSnapshotArchiveItem
{
    public int Id { get; set; }
    public DateTime CreatedAt { get; set; }
    public int? CustomerId { get; set; }
    public string CustomerName { get; set; } = "";
    public string Query { get; set; } = "";
    public string StatusFilter { get; set; } = "all";
    public int RowCount { get; set; }
    public string FileName { get; set; } = "";
    public string RelativePath { get; set; } = "";
    public string CreatedBy { get; set; } = "";
    public string Notes { get; set; } = "";
}

public sealed class PriceSnapshotArchiveInput
{
    public DateTime CreatedAt { get; set; }
    public int? CustomerId { get; set; }
    public string CustomerName { get; set; } = "";
    public string Query { get; set; } = "";
    public string StatusFilter { get; set; } = "all";
    public int RowCount { get; set; }
    public string FileName { get; set; } = "";
    public string RelativePath { get; set; } = "";
    public string CreatedBy { get; set; } = "";
    public string Notes { get; set; } = "";
}

public sealed class PriceSnapshotLineItem
{
    public int SnapshotId { get; set; }
    public DateTime CreatedAt { get; set; }
    public int? CustomerId { get; set; }
    public string ProductCode { get; set; } = "";
    public string ProductName { get; set; } = "";
    public decimal CashPrice { get; set; }
    public decimal CreditPrice { get; set; }
}
