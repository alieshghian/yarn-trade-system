using TextilePricingApp.Models;

namespace TextilePricingApp.Services;

public sealed class ProductAnalysisRuleEngine
{
    private const int MaxPreviewWeftRows = 100;
    private readonly MaterialRepository _materials;
    private readonly AnalysisRepository _analysis;
    private readonly MaterialSuggestionService _suggestions;
    private readonly SettingsRepository _settings;

    public ProductAnalysisRuleEngine(
        MaterialRepository materials,
        AnalysisRepository analysis,
        MaterialSuggestionService suggestions,
        SettingsRepository settings)
    {
        _materials = materials;
        _analysis = analysis;
        _suggestions = suggestions;
        _settings = settings;
    }

    public AnalysisRuleResult Evaluate(
        AnalysisRuleContext context,
        IReadOnlyList<ProductComponent> existingComponents)
    {
        var warnings = new List<string>();
        var group = ResolveGroup(context);
        if (context.ProductType == ProductType.LegacyProduction)
        {
            warnings.Add("نوع این محصول قدیمی و تعیین‌نشده است؛ برای فعال‌شدن قواعد، یکی از چهار گروه اصلی کالا را انتخاب کنید.");
        }
        var definitions = BuildDefinitions(context, group, warnings);
        var enforceSelectionScope = _settings.Get().EnforceAnalysisSelectionScope;
        var materials = _materials.GetAll(take: 5000);
        var products = _analysis.GetAll(take: 5000);
        var semiFinishedNames = products
            .Where(product =>
                product.Id != context.ProductId &&
                product.ProductStatus == ProductStatus.SemiFinished)
            .SelectMany(product => new[] { product.Name.Trim(), product.Code.Trim() })
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .ToHashSet(StringComparer.CurrentCultureIgnoreCase);
        var excludedProductNames = products
            .Where(product =>
                product.Id == context.ProductId ||
                product.ProductStatus == ProductStatus.ReadyForSale)
            .SelectMany(product => new[] { product.Name.Trim(), product.Code.Trim() })
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .ToHashSet(StringComparer.CurrentCultureIgnoreCase);
        var eligibleMaterials = materials
            .Where(material => !excludedProductNames.Contains(material.Name.Trim()))
            .ToList();
        var semiFinishedMaterialIds = materials
            .Where(material => semiFinishedNames.Contains(material.Name.Trim()))
            .Select(material => material.Id)
            .ToHashSet();
        var ruleMappings = _analysis.GetRuleComponentMappings(context.ProductId);
        var materialsById = eligibleMaterials.ToDictionary(material => material.Id);
        var materialsByName = eligibleMaterials.ToDictionary(
            material => material.Name.Trim(),
            StringComparer.CurrentCultureIgnoreCase);
        var remaining = existingComponents.ToList();
        var rows = new List<AnalysisRuleRowEvaluation>();

        foreach (var definition in definitions)
        {
            // Keep a component already mapped to another row available for that row.
            // A row's own mapping takes precedence when old mappings conflict.
            var reservedForOtherRows = ruleMappings
                .Where(mapping => mapping.Key != definition.Key)
                .Select(mapping => mapping.Value)
                .ToHashSet();
            if (ruleMappings.TryGetValue(definition.Key, out var ownMappedId))
            {
                reservedForOtherRows.Remove(ownMappedId);
            }
            var match = FindBestMatch(
                definition,
                remaining.Where(component => !reservedForOtherRows.Contains(component.Id)).ToList(),
                materialsById,
                materialsByName,
                semiFinishedMaterialIds,
                ruleMappings,
                enforceSelectionScope);
            if (match is not null)
            {
                remaining.Remove(match);
            }

            var status = GetStatus(definition, match, materialsById, materialsByName, semiFinishedMaterialIds, enforceSelectionScope);
            var allowedMaterials = GetAllowedMaterials(definition, eligibleMaterials, semiFinishedMaterialIds, enforceSelectionScope);
            rows.Add(new AnalysisRuleRowEvaluation(
                definition,
                status,
                match,
                GetSuggestions(definition, eligibleMaterials, semiFinishedMaterialIds, enforceSelectionScope),
                allowedMaterials));

            if (definition.IsRequired && status != ExpectedAnalysisRowStatus.Completed)
            {
                warnings.Add($"ردیف اجباری «{definition.Title}» {AnalysisRuleLabels.Status(status)} است.");
            }
        }

        AddMatrixWarnings(context, group, rows, existingComponents, warnings);
        return new AnalysisRuleResult(context, group, rows, remaining, warnings.Distinct().ToList());
    }

    private IReadOnlyList<AnalysisRuleRowDefinition> BuildDefinitions(
        AnalysisRuleContext context,
        ProductRuleGroup group,
        List<string> warnings)
    {
        return group switch
        {
            ProductRuleGroup.Commercial => BuildCommercialRows(),
            ProductRuleGroup.WeavingAndFinishing => BuildWeavingRows(context, warnings),
            ProductRuleGroup.Lining => BuildLiningRows(context),
            ProductRuleGroup.Laminated => BuildLaminatedRows(),
            _ => []
        };
    }

    private static IReadOnlyList<AnalysisRuleRowDefinition> BuildCommercialRows() =>
    [
        Row("services", "خدمات", false, AnalysisRowType.Service, AnalysisSelectionScope.ServicesOnly, "خدمت", "کارمزد"),
        Row("packaging", "بسته‌بندی", false, AnalysisRowType.Packaging, AnalysisSelectionScope.PackagingOnly, "بسته", "کارتن", "لفاف")
    ];

    private static IReadOnlyList<AnalysisRuleRowDefinition> BuildWeavingRows(
        AnalysisRuleContext context,
        List<string> warnings)
    {
        var rows = new List<AnalysisRuleRowDefinition>();
        var normalizedWeftCount = Math.Max(0, decimal.Truncate(context.WeftCount));
        if (context.WeftCount != normalizedWeftCount)
        {
            warnings.Add("تعداد پود باید عدد صحیح باشد؛ پیش‌نمایش از بخش صحیح مقدار استفاده کرده است.");
        }

        if (normalizedWeftCount > MaxPreviewWeftRows)
        {
            warnings.Add($"برای ایمنی نمایش، حداکثر {MaxPreviewWeftRows} ردیف پود پیش‌نمایش داده شد.");
            normalizedWeftCount = MaxPreviewWeftRows;
        }

        for (var index = 1; index <= (int)normalizedWeftCount; index++)
        {
            rows.Add(Row($"weft-{index}", $"پود {index}", true, AnalysisRowType.Material, AnalysisSelectionScope.MaterialsOrSemiFinished, "پود", "نخ پود"));
        }

        if (string.Equals(context.ChainType.Trim(), "دوچله", StringComparison.CurrentCultureIgnoreCase))
        {
            rows.Add(Row("warp-1", "چله 1", true, AnalysisRowType.Material, AnalysisSelectionScope.YarnOrSemiFinished, "چله", "تار", "نخ"));
            rows.Add(Row("warp-2", "چله 2", true, AnalysisRowType.Material, AnalysisSelectionScope.YarnOrSemiFinished, "چله", "تار", "نخ"));
            rows.Add(Row("warping-service-1", "اجرت چله‌کشی 1", true, AnalysisRowType.Service, AnalysisSelectionScope.ServicesOnly, "چله کشی", "چله‌کشی"));
            rows.Add(Row("warping-service-2", "اجرت چله‌کشی 2", true, AnalysisRowType.Service, AnalysisSelectionScope.ServicesOnly, "چله کشی", "چله‌کشی"));
        }
        else
        {
            rows.Add(Row("warp", "چله", true, AnalysisRowType.Material, AnalysisSelectionScope.YarnOrSemiFinished, "چله", "تار", "نخ"));
            rows.Add(Row("warping-service", "اجرت چله‌کشی", true, AnalysisRowType.Service, AnalysisSelectionScope.ServicesOnly, "چله کشی", "چله‌کشی"));
        }

        rows.Add(Row("weaving-fee", "اجرت بافت", true, AnalysisRowType.Service, AnalysisSelectionScope.ServicesOnly, "اجرت بافت", "بافت"));

        if (string.Equals(context.LayerType.Trim(), "دولایه", StringComparison.CurrentCultureIgnoreCase))
        {
            rows.Add(Row("lining", "آستری", true, AnalysisRowType.Material, AnalysisSelectionScope.SemiFinishedOnly, "آستری", "آستر"));
            rows.Add(Row("lamination-service", "اجرت لمینت", true, AnalysisRowType.Service, AnalysisSelectionScope.ServicesOnly, "اجرت لمینت", "لمینت", "لمینتی"));
        }

        var isDyeing = string.Equals(context.DyeType.Trim(), "رنگشو", StringComparison.CurrentCultureIgnoreCase) ||
            context.DyeType.Contains("رنگرزی", StringComparison.CurrentCultureIgnoreCase);
        rows.Add(isDyeing
            ? Row("dyeing", "اجرت رنگرزی", true, AnalysisRowType.Service, AnalysisSelectionScope.ServicesOnly, "اجرت رنگرزی", "رنگرزی", "رنگ")
            : Row("finishing", "تکمیل", true, AnalysisRowType.Service, AnalysisSelectionScope.ServicesOnly, "تکمیل", "فینیش"));
        rows.Add(Row("airo", "آیرو", false, AnalysisRowType.Service, AnalysisSelectionScope.ServicesOnly, "آیرو", "اتو", "پرس"));
        rows.Add(Row("packaging", "بسته‌بندی", false, AnalysisRowType.Packaging, AnalysisSelectionScope.PackagingOnly, "بسته", "کارتن", "لفاف"));
        return rows;
    }

    private static IReadOnlyList<AnalysisRuleRowDefinition> BuildLiningRows(AnalysisRuleContext context)
    {
        var rows = new List<AnalysisRuleRowDefinition>
        {
            Row("lining-yarn-1", "نخ آستری 1", true, AnalysisRowType.Material, AnalysisSelectionScope.YarnOrSemiFinished, "نخ آستری", "آستری", "نخ"),
            Row("lining-yarn-2", "نخ آستری 2", true, AnalysisRowType.Material, AnalysisSelectionScope.YarnOrSemiFinished, "نخ آستری", "آستری", "نخ"),
            Row("lining-weaving-fee", "اجرت بافت", true, AnalysisRowType.Service, AnalysisSelectionScope.ServicesOnly, "اجرت بافت", "بافت"),
            Row("finishing", "تکمیل", true, AnalysisRowType.Service, AnalysisSelectionScope.ServicesOnly, "تکمیل", "فینیش")
        };

        if (!string.Equals(context.BrushingMode.Trim(), "بدون خار", StringComparison.CurrentCultureIgnoreCase))
        {
            rows.Add(Row("brushing", "خارزنی", true, AnalysisRowType.Service, AnalysisSelectionScope.ServicesOnly, "خارزنی", "خار"));
        }

        rows.Add(Row("packaging", "بسته‌بندی", true, AnalysisRowType.Packaging, AnalysisSelectionScope.PackagingOnly, "بسته", "کارتن", "لفاف"));
        return rows;
    }

    private static IReadOnlyList<AnalysisRuleRowDefinition> BuildLaminatedRows() =>
    [
        Row("face", "رویه", true, AnalysisRowType.Material, AnalysisSelectionScope.SemiFinishedOnly, "رویه", "پارچه"),
        Row("lining", "آستر", true, AnalysisRowType.Material, AnalysisSelectionScope.SemiFinishedOnly, "آستر", "آستری"),
        Row("lamination-service", "اجرت لمینت", true, AnalysisRowType.Service, AnalysisSelectionScope.ServicesOnly, "لمینت", "لمینتی"),
        Row("packaging", "بسته‌بندی", true, AnalysisRowType.Packaging, AnalysisSelectionScope.PackagingOnly, "بسته", "کارتن", "لفاف")
    ];

    private ProductComponent? FindBestMatch(
        AnalysisRuleRowDefinition definition,
        IReadOnlyList<ProductComponent> components,
        IReadOnlyDictionary<int, MaterialItem> materialsById,
        IReadOnlyDictionary<string, MaterialItem> materialsByName,
        IReadOnlySet<int> semiFinishedMaterialIds,
        IReadOnlyDictionary<string, int> ruleMappings,
        bool enforceSelectionScope)
    {
        if (ruleMappings.TryGetValue(definition.Key, out var mappedComponentId))
        {
            var mapped = components.FirstOrDefault(component => component.Id == mappedComponentId);
            var mappedMaterial = mapped is null ? null : ResolveMaterial(mapped, materialsById, materialsByName);
            if (mapped is not null &&
                mappedMaterial is not null &&
                IsAllowed(definition, mappedMaterial, semiFinishedMaterialIds, enforceSelectionScope))
            {
                return mapped;
            }
        }

        return components
            .Select(component => new
            {
                Component = component,
                Material = ResolveMaterial(component, materialsById, materialsByName),
                Score = _suggestions.Score(definition.SuggestedKeywords, component.MaterialName)
            })
            .Where(item => item.Score > 0)
            .OrderByDescending(item => item.Material is not null && IsAllowed(definition, item.Material, semiFinishedMaterialIds, enforceSelectionScope))
            .ThenByDescending(item => item.Score)
            .ThenBy(item => item.Component.Id)
            .Select(item => item.Component)
            .FirstOrDefault();
    }

    private ExpectedAnalysisRowStatus GetStatus(
        AnalysisRuleRowDefinition definition,
        ProductComponent? component,
        IReadOnlyDictionary<int, MaterialItem> materialsById,
        IReadOnlyDictionary<string, MaterialItem> materialsByName,
        IReadOnlySet<int> semiFinishedMaterialIds,
        bool enforceSelectionScope)
    {
        if (component is null)
        {
            return ExpectedAnalysisRowStatus.Missing;
        }

        var material = ResolveMaterial(component, materialsById, materialsByName);
        return material is not null &&
            IsAllowed(definition, material, semiFinishedMaterialIds, enforceSelectionScope) &&
            component.Quantity > 0
            ? ExpectedAnalysisRowStatus.Completed
            : ExpectedAnalysisRowStatus.Incomplete;
    }

    private IReadOnlyList<MaterialItem> GetAllowedMaterials(
        AnalysisRuleRowDefinition definition,
        IReadOnlyList<MaterialItem> materials,
        IReadOnlySet<int> semiFinishedMaterialIds,
        bool enforceSelectionScope)
    {
        if (enforceSelectionScope)
        {
            return _suggestions.GetAllowed(definition, materials, semiFinishedMaterialIds);
        }

        return materials
            .OrderBy(material => material.Name, StringComparer.CurrentCulture)
            .ToList();
    }

    private IReadOnlyList<MaterialSuggestion> GetSuggestions(
        AnalysisRuleRowDefinition definition,
        IReadOnlyList<MaterialItem> materials,
        IReadOnlySet<int> semiFinishedMaterialIds,
        bool enforceSelectionScope)
    {
        if (enforceSelectionScope)
        {
            return _suggestions.Rank(definition, materials, semiFinishedMaterialIds, 3);
        }

        return materials
            .Select(material => new MaterialSuggestion(material, _suggestions.Score(definition.SuggestedKeywords, material.Name)))
            .Where(suggestion => suggestion.Rank > 0)
            .OrderByDescending(suggestion => suggestion.Rank)
            .ThenBy(suggestion => suggestion.Material.Name, StringComparer.CurrentCulture)
            .Take(3)
            .ToList();
    }

    private bool IsAllowed(
        AnalysisRuleRowDefinition definition,
        MaterialItem material,
        IReadOnlySet<int> semiFinishedMaterialIds,
        bool enforceSelectionScope) =>
        !enforceSelectionScope || _suggestions.IsAllowed(definition, material, semiFinishedMaterialIds);

    private static MaterialItem? ResolveMaterial(
        ProductComponent component,
        IReadOnlyDictionary<int, MaterialItem> materialsById,
        IReadOnlyDictionary<string, MaterialItem> materialsByName)
    {
        if (component.MaterialId is > 0 && materialsById.TryGetValue(component.MaterialId.Value, out var byId))
        {
            return byId;
        }

        materialsByName.TryGetValue(component.MaterialName.Trim(), out var byName);
        return byName;
    }

    private static void AddMatrixWarnings(
        AnalysisRuleContext context,
        ProductRuleGroup group,
        IReadOnlyList<AnalysisRuleRowEvaluation> rows,
        IReadOnlyList<ProductComponent> components,
        List<string> warnings)
    {
        if (group != ProductRuleGroup.WeavingAndFinishing)
        {
            return;
        }

        var expectedWeft = rows.Count(row => row.Definition.Key.StartsWith("weft-", StringComparison.Ordinal));
        var completedWeft = rows.Count(row =>
            row.Definition.Key.StartsWith("weft-", StringComparison.Ordinal) &&
            row.Status == ExpectedAnalysisRowStatus.Completed);
        if (expectedWeft != completedWeft)
        {
            warnings.Add($"از {expectedWeft} ردیف پود مورد انتظار، {completedWeft} ردیف تکمیل‌شده است.");
        }

        var hasFinishing = components.Any(component =>
            component.MaterialName.Contains("تکمیل", StringComparison.CurrentCultureIgnoreCase) &&
            !component.MaterialName.Contains("رنگرزی", StringComparison.CurrentCultureIgnoreCase));
        var hasDyeing = components.Any(component =>
            component.MaterialName.Contains("رنگرزی", StringComparison.CurrentCultureIgnoreCase) &&
            !component.MaterialName.Contains("تکمیل", StringComparison.CurrentCultureIgnoreCase));
        if (hasFinishing && hasDyeing)
        {
            warnings.Add("ردیف‌های تکمیل و رنگرزی به‌صورت پیش‌فرض متقابلاً انحصاری هستند.");
        }

        var expectsDyeing = rows.Any(row => row.Definition.Key == "dyeing");
        if (expectsDyeing && !hasDyeing)
        {
            warnings.Add("برای محصول رنگرزی، ردیف رنگرزی مورد انتظار است.");
        }

        var expectsFinishing = rows.Any(row => row.Definition.Key == "finishing");
        if (expectsFinishing && !hasFinishing)
        {
            warnings.Add("برای محصول رنگی، ردیف تکمیل مورد انتظار است.");
        }
    }

    private static ProductRuleGroup ResolveGroup(AnalysisRuleContext context)
    {
        return context.ProductType switch
        {
            ProductType.Commercial => ProductRuleGroup.Commercial,
            ProductType.WeavingAndFinishing => ProductRuleGroup.WeavingAndFinishing,
            ProductType.Lining => ProductRuleGroup.Lining,
            ProductType.Laminated => ProductRuleGroup.Laminated,
            _ => ProductRuleGroup.Unknown
        };
    }

    private static AnalysisRuleRowDefinition Row(
        string key,
        string title,
        bool required,
        AnalysisRowType type,
        AnalysisSelectionScope scope,
        params string[] keywords)
    {
        return new AnalysisRuleRowDefinition(key, title, required, type, scope, 1, keywords);
    }
}
