namespace TextilePricingApp.Models;

public enum ProductStatus
{
    ReadyForSale,
    SemiFinished
}

public enum ProductType
{
    Commercial,
    WeavingAndFinishing,
    Lining,
    Laminated,
    LegacyProduction
}

public sealed record ProductTypeOption(ProductType Value, string Label);

public static class ProductTypeCatalog
{
    public static IReadOnlyList<ProductTypeOption> SaveOptions { get; } =
    [
        new(ProductType.Commercial, "بازرگانی"),
        new(ProductType.WeavingAndFinishing, "بافت و تکمیل"),
        new(ProductType.Lining, "آستری"),
        new(ProductType.Laminated, "لمینتی")
    ];

    public static string Label(ProductType value) => value switch
    {
        ProductType.Commercial => "بازرگانی",
        ProductType.WeavingAndFinishing => "بافت و تکمیل",
        ProductType.Lining => "آستری",
        ProductType.Laminated => "لمینتی",
        ProductType.LegacyProduction => "نوع قدیمی تعیین‌نشده",
        _ => "نوع نامعتبر"
    };

    public static ProductType FromStorage(string? value) => value?.Trim() switch
    {
        "بازرگانی" => ProductType.Commercial,
        "بافت و تکمیل" => ProductType.WeavingAndFinishing,
        "آستری" => ProductType.Lining,
        "لمینتی" => ProductType.Laminated,
        "تولیدی" => ProductType.LegacyProduction,
        _ => ProductType.LegacyProduction
    };

    public static string ToStorage(ProductType value) => value switch
    {
        ProductType.Commercial => "بازرگانی",
        ProductType.WeavingAndFinishing => "بافت و تکمیل",
        ProductType.Lining => "آستری",
        ProductType.Laminated => "لمینتی",
        _ => throw new InvalidOperationException("نوع قدیمی یا نامعتبر محصول قابل ذخیره نیست.")
    };

    public static bool CanSave(ProductType value) => value is
        ProductType.Commercial or
        ProductType.WeavingAndFinishing or
        ProductType.Lining or
        ProductType.Laminated;
}

public sealed record ProductStatusOption(ProductStatus Value, string Label);

public static class ProductStatusCatalog
{
    public static IReadOnlyList<ProductStatusOption> Options { get; } =
    [
        new(ProductStatus.ReadyForSale, "آماده فروش"),
        new(ProductStatus.SemiFinished, "نیمه‌آماده")
    ];
}

public enum ProductRuleGroup
{
    Unknown,
    Commercial,
    WeavingAndFinishing,
    Lining,
    Laminated
}

public enum AnalysisRowType
{
    Material,
    Service,
    Packaging,
    Transport
}

public enum AnalysisSelectionScope
{
    MaterialsOrSemiFinished,
    YarnOrSemiFinished,
    SemiFinishedOnly,
    ServicesOnly,
    PackagingOnly
}

public enum ExpectedAnalysisRowStatus
{
    Completed,
    Incomplete,
    Missing
}

public sealed record AnalysisRuleContext(
    int ProductId,
    ProductType ProductType,
    ProductStatus ProductStatus,
    string LayerType,
    string DyeType,
    string ChainType,
    decimal WeftCount,
    decimal GramPerMeter,
    decimal FaceGramPerMeter,
    decimal LiningGramPerMeter,
    string BrushingMode);

public sealed record AnalysisRuleRowDefinition(
    string Key,
    string Title,
    bool IsRequired,
    AnalysisRowType RowType,
    AnalysisSelectionScope SelectionScope,
    int AllowedCount,
    IReadOnlyList<string> SuggestedKeywords);

public sealed record MaterialSuggestion(
    MaterialItem Material,
    int Rank);

public sealed record AnalysisRuleRowEvaluation(
    AnalysisRuleRowDefinition Definition,
    ExpectedAnalysisRowStatus Status,
    ProductComponent? MatchedComponent,
    IReadOnlyList<MaterialSuggestion> Suggestions,
    IReadOnlyList<MaterialItem> AllowedMaterials);

public sealed class AnalysisRuleComponentInput
{
    public string RowKey { get; set; } = "";
    public int? ExistingComponentId { get; set; }
    public int? MaterialId { get; set; }
    public decimal Quantity { get; set; }
    public string Notes { get; set; } = "";
}

public sealed record AnalysisRuleComponentSaveItem(
    string RowKey,
    int? ExistingComponentId,
    int MaterialId,
    string MaterialName,
    decimal StoredQuantity,
    string Notes);

public sealed record AnalysisRuleResult(
    AnalysisRuleContext Context,
    ProductRuleGroup Group,
    IReadOnlyList<AnalysisRuleRowEvaluation> Rows,
    IReadOnlyList<ProductComponent> UnmatchedComponents,
    IReadOnlyList<string> Warnings);

public static class AnalysisRuleLabels
{
    public static string Group(ProductRuleGroup value) => value switch
    {
        ProductRuleGroup.Commercial => "بازرگانی",
        ProductRuleGroup.WeavingAndFinishing => "بافت و تکمیل",
        ProductRuleGroup.Lining => "آستری",
        ProductRuleGroup.Laminated => "لمینتی",
        _ => "بدون قاعده"
    };

    public static string RowType(AnalysisRowType value) => value switch
    {
        AnalysisRowType.Material => "ماده / کالا",
        AnalysisRowType.Service => "خدمت",
        AnalysisRowType.Packaging => "بسته‌بندی",
        AnalysisRowType.Transport => "حمل",
        _ => value.ToString()
    };

    public static string SelectionScope(AnalysisSelectionScope value) => value switch
    {
        AnalysisSelectionScope.MaterialsOrSemiFinished => "مواد اولیه / کالای نیمه‌آماده",
        AnalysisSelectionScope.YarnOrSemiFinished => "نخ / مواد اولیه مجاز / کالای نیمه‌آماده",
        AnalysisSelectionScope.SemiFinishedOnly => "فقط کالای نیمه‌آماده",
        AnalysisSelectionScope.ServicesOnly => "فقط خدمات",
        AnalysisSelectionScope.PackagingOnly => "فقط اقلام مرتبط با بسته‌بندی",
        _ => value.ToString()
    };

    public static string Status(ExpectedAnalysisRowStatus value) => value switch
    {
        ExpectedAnalysisRowStatus.Completed => "تکمیل‌شده",
        ExpectedAnalysisRowStatus.Incomplete => "ناقص",
        ExpectedAnalysisRowStatus.Missing => "مفقود",
        _ => value.ToString()
    };
}
