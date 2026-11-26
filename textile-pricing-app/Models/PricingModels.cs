using System.Text.Json.Serialization;

namespace TextilePricingApp.Models;

public sealed class PricingData
{
    public PricingSettings Settings { get; set; } = new();
    public List<MaterialItem> Materials { get; set; } = [];
    public List<RateTier> ProfitTiers { get; set; } = [];
    public List<RateTier> WasteTiers { get; set; } = [];
    public List<ProductRecipe> Recipes { get; set; } = [];
}

public sealed class PricingSettings
{
    public string CompanyName { get; set; } = "";
    public decimal DollarRate { get; set; }
    public decimal DollarIncreasePercent { get; set; }
    public decimal VatRate { get; set; }
    public decimal GlobalProfitPercent { get; set; }
    public decimal CashPaymentDiscountPercent { get; set; }
    public decimal ForeignTransportPerContainerUsd { get; set; }
    public decimal DomesticTransportPerContainerRial { get; set; }
    public string SourceFile { get; set; } = "";
    public DateTime DollarUpdatedAt { get; set; }
    public int DollarRefreshDays { get; set; } = 1;
    public int GoodsRefreshDays { get; set; } = 30;
    public int ServicesRefreshDays { get; set; } = 30;
    public decimal PriceChangeConfirmationThresholdPercent { get; set; } = 20;
    public bool EnforceAnalysisSelectionScope { get; set; } = true;
    public decimal EffectiveDollarRate => DollarRate * (1 + DollarIncreasePercent / 100m);
}

public sealed class PricingSettingsInput
{
    [System.ComponentModel.DataAnnotations.DisplayFormat(ConvertEmptyStringToNull = false)]
    public string CompanyName { get; set; } = "";
    public decimal DollarRate { get; set; }
    public decimal DollarIncreasePercent { get; set; }
    public decimal VatPercent { get; set; }
    public decimal GlobalProfitPercent { get; set; }
    public decimal CashPaymentDiscountPercent { get; set; }
    public decimal ForeignTransportPerContainerUsd { get; set; }
    public decimal DomesticTransportPerContainerRial { get; set; }
    public int DollarRefreshDays { get; set; } = 1;
    public int GoodsRefreshDays { get; set; } = 30;
    public int ServicesRefreshDays { get; set; } = 30;
    public decimal PriceChangeConfirmationThresholdPercent { get; set; } = 20;
    public bool EnforceAnalysisSelectionScope { get; set; } = true;
    public decimal EffectiveDollarRate => DollarRate * (1 + DollarIncreasePercent / 100m);
}

public sealed class MaterialItem
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Kind { get; set; } = "";
    public decimal Price { get; set; }
    public string Unit { get; set; } = "";
    public string MeasurementUnit { get; set; } = "کیلوگرم";
    public decimal RialPrice { get; set; }
    public DateTime LastEditedAt { get; set; }
}

public sealed class MaterialInput
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Kind { get; set; } = "";
    public decimal Price { get; set; }
    public string Unit { get; set; } = "";
    public string MeasurementUnit { get; set; } = "کیلوگرم";
    public decimal RialPrice { get; set; }
}

public sealed class MaterialPriceInput
{
    public int Id { get; set; }
    public decimal Price { get; set; }
}

public sealed class RateTier
{
    public int Id { get; set; }
    public string CategoryName { get; set; } = "";

    [JsonPropertyName("breakpoint")]
    public decimal? SeedCategoryNumber { get; set; }

    public decimal Percent { get; set; }
}

public sealed class RateTierInput
{
    public int Id { get; set; }
    public string CategoryName { get; set; } = "";
    public decimal Percent { get; set; }
}

public sealed class ProductGroup
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
}

public sealed class ProductGroupInput
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
}

public sealed class ProductRecipe
{
    public int Id { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public string ProductGroupName { get; set; } = "";
    public string ImagePath { get; set; } = "";
    public decimal ProfitRate { get; set; }
    public decimal WasteRate { get; set; }
    public string ProfitCategoryName { get; set; } = "";
    public string WasteCategoryName { get; set; } = "";
    public ProductType ProductType { get; set; } = ProductType.Commercial;
    public ProductStatus ProductStatus { get; set; } = ProductStatus.ReadyForSale;
    public string MeasurementUnit { get; set; } = MeasurementUnitCatalog.Meter;
    public string LaminationOrigin { get; set; } = LaminationOriginCatalog.Domestic;
    public decimal WarpDensity { get; set; }
    public decimal WeftDensity { get; set; }
    public decimal WeftCount { get; set; }
    public string DyeType { get; set; } = "رنگی";
    public string LayerType { get; set; } = "تک لایه";
    public string ChainType { get; set; } = "تک چله";
    public decimal GramPerMeter { get; set; }
    public decimal FaceGramPerMeter { get; set; }
    public decimal LiningGramPerMeter { get; set; }
    public string BrushingMode { get; set; } = "دو مرحله‌ای";
    public string FinishingType { get; set; } = "";
    public decimal ContainerMeters { get; set; }
    public decimal ProductPurchasePrice { get; set; }
    public List<ProductComponent> Components { get; set; } = [];
}

public sealed class ProductComponent
{
    public int Id { get; set; }
    public int ProductRecipeId { get; set; }
    public int? MaterialId { get; set; }
    public string MaterialName { get; set; } = "";
    public string MeasurementUnit { get; set; } = "کیلوگرم";
    public decimal Quantity { get; set; }
}

public sealed class ProductRecipeInput
{
    public int Id { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public string? ProductGroupName { get; set; }
    public string ImagePath { get; set; } = "";
    public string ProfitCategoryName { get; set; } = "";
    public string WasteCategoryName { get; set; } = "";
    public ProductType ProductType { get; set; } = ProductType.Commercial;
    public ProductStatus ProductStatus { get; set; } = ProductStatus.ReadyForSale;
    public string MeasurementUnit { get; set; } = MeasurementUnitCatalog.Meter;
    public string LaminationOrigin { get; set; } = LaminationOriginCatalog.Domestic;
    public decimal WarpDensity { get; set; }
    public decimal WeftDensity { get; set; }
    public decimal WeftCount { get; set; }
    public string DyeType { get; set; } = "رنگی";
    public string? DyeingNotes { get; set; }
    public string? FinishingNotes { get; set; }
    public string LayerType { get; set; } = "تک لایه";
    public string ChainType { get; set; } = "تک چله";
    public decimal GramPerMeter { get; set; }
    public decimal FaceGramPerMeter { get; set; }
    public decimal LiningGramPerMeter { get; set; }
    public string BrushingMode { get; set; } = "دو مرحله‌ای";
    public string? FinishingType { get; set; }
    public decimal ContainerMeters { get; set; }
    public decimal ProductPurchasePrice { get; set; }
}

public static class MeasurementUnitCatalog
{
    public const string Meter = "متر";
    public const string Kilogram = "کیلوگرم";

    public static IReadOnlyList<string> Options { get; } = [Meter, Kilogram];

    public static bool IsValid(string? value) => value?.Trim() is Meter or Kilogram;

    public static string Normalize(string? value) =>
        string.Equals(value?.Trim(), Kilogram, StringComparison.CurrentCultureIgnoreCase)
            ? Kilogram
            : Meter;
}

public static class LaminationOriginCatalog
{
    public const string Domestic = "داخلی";
    public const string Foreign = "خارجی";

    public static IReadOnlyList<string> Options { get; } = [Domestic, Foreign];

    public static bool IsValid(string? value) => value?.Trim() is Domestic or Foreign;

    public static string Normalize(string? value) =>
        string.Equals(value?.Trim(), Foreign, StringComparison.CurrentCultureIgnoreCase)
            ? Foreign
            : Domestic;
}

public sealed class ProductComponentInput
{
    public int ProductRecipeId { get; set; }
    public string MaterialName { get; set; } = "";
    public decimal Quantity { get; set; }
}

public sealed class ProductComponentQuantityInput
{
    public int Id { get; set; }
    public string MaterialName { get; set; } = "";
    public decimal Quantity { get; set; }
}

public sealed record MaterialUsageSummary(
    int MaterialId,
    string MaterialName,
    string Kind,
    int UsageCount);

public sealed record MaterialUsageRow(
    int MaterialId,
    string MaterialName,
    string Kind,
    int ProductRecipeId,
    string ProductCode,
    ProductType ProductType,
    string WasteCategoryName,
    decimal Quantity);

public sealed record ComponentLine(
    string MaterialName,
    string Kind,
    decimal Quantity,
    decimal UnitPrice,
    decimal CashAmount,
    decimal CreditAmount);

public sealed record PriceSummary(
    decimal CashTotal,
    decimal CreditTotal,
    decimal CashWaste,
    decimal CreditWaste,
    decimal CashCost,
    decimal CreditCost,
    decimal CashSale,
    decimal CreditSale,
    decimal CashVat,
    decimal CreditVat,
    decimal CashFinal,
    decimal CreditFinal);

public sealed class ProductCalculation
{
    public ProductRecipe Recipe { get; init; } = new();
    public decimal AppliedProfitRate { get; init; }
    public decimal AppliedWasteRate { get; init; }
    public IReadOnlyList<ComponentLine> Lines { get; init; } = [];
    public PriceSummary Summary { get; init; } = new(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    public IReadOnlyList<string> MissingMaterials { get; init; } = [];
}

public sealed record ProductReportRow(
    string ProductCode,
    PriceSummary Summary,
    decimal AppliedProfitRate,
    decimal AppliedWasteRate,
    int ComponentCount);

public sealed class Customer
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string MobileNumber { get; set; } = "";
    public bool IsVatExempt { get; set; }
    public DateTime LastEditedAt { get; set; }
}

public sealed class CustomerInput
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    [System.ComponentModel.DataAnnotations.DisplayFormat(ConvertEmptyStringToNull = false)]
    public string MobileNumber { get; set; } = "";
    public bool IsVatExempt { get; set; }
}

public sealed record CustomerProductDiscount(
    int CustomerId,
    string ProductCode,
    decimal CreditDiscountPercent,
    decimal CashDiscountPercent,
    DateTime LastEditedAt);

public sealed record CustomerProductDiscountInput(
    int CustomerId,
    string ProductCode,
    decimal CreditDiscountPercent,
    decimal CashDiscountPercent);
