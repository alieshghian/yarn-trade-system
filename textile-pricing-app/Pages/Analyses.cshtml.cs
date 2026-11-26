using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using TextilePricingApp.Models;
using TextilePricingApp.Services;

namespace TextilePricingApp.Pages;

public class AnalysesModel : PageModel
{
    private static readonly HashSet<string> AllowedImageExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".jpg",
        ".jpeg",
        ".png",
        ".webp"
    };

    private const long MaxProductImageBytes = 5 * 1024 * 1024;
    private const string ColoredDyeType = "رنگی";
    private const string DyeableDyeType = "رنگشو";
    private const string SingleLayer = "تک لایه";
    private const string DoubleLayer = "دولایه";
    private const string SingleChain = "تک چله";
    private const string DoubleChain = "دوچله";
    private const string NoBrushing = "بدون خار";
    private const string SingleStageBrushing = "تک مرحله‌ای";
    private const string TwoStageBrushing = "دو مرحله‌ای";
    private const string FourStageBrushing = "چهار مرحله‌ای";
    private const string KilogramUnit = "کیلوگرم";
    private const string GramUnit = "گرم";
    private readonly AnalysisRepository _analysis;
    private readonly IWebHostEnvironment _environment;
    private readonly MaterialRepository _materials;
    private readonly ProductGroupRepository _productGroups;
    private readonly WasteTierRepository _wasteTiers;
    private readonly ProductAnalysisRuleEngine _ruleEngine;
    private readonly SemiFinishedMaterialService _semiFinishedMaterials;

    public AnalysesModel(
        AnalysisRepository analysis,
        IWebHostEnvironment environment,
        MaterialRepository materials,
        ProductGroupRepository productGroups,
        WasteTierRepository wasteTiers,
        ProductAnalysisRuleEngine ruleEngine,
        SemiFinishedMaterialService semiFinishedMaterials)
    {
        _analysis = analysis;
        _environment = environment;
        _materials = materials;
        _productGroups = productGroups;
        _wasteTiers = wasteTiers;
        _ruleEngine = ruleEngine;
        _semiFinishedMaterials = semiFinishedMaterials;
    }

    [BindProperty(SupportsGet = true)]
    public string? Query { get; set; }

    [BindProperty(SupportsGet = true)]
    public int? EditId { get; set; }

    [BindProperty(SupportsGet = true)]
    public bool NewProduct { get; set; }

    [BindProperty(SupportsGet = true)]
    public bool EditMode { get; set; }

    [BindProperty]
    public ProductRecipeInput Input { get; set; } = new();

    [BindProperty]
    public IFormFile? ProductImage { get; set; }

    [BindProperty]
    public ProductComponentInput ComponentInput { get; set; } = new();

    [BindProperty]
    public CopyComponentsInput CopyInput { get; set; } = new();

    [BindProperty]
    public List<ProductComponentQuantityInput> ComponentQuantities { get; set; } = [];

    [BindProperty]
    public List<AnalysisRuleComponentInput> RuleComponents { get; set; } = [];

    public IReadOnlyList<ProductRecipe> Products { get; private set; } = [];
    public IReadOnlyList<ProductRecipe> CopySourceProducts { get; private set; } = [];
    public IReadOnlyList<string> ProductGroups { get; private set; } = [];
    public IReadOnlyList<MaterialItem> Materials { get; private set; } = [];
    public IReadOnlyList<MaterialItem> SelectableMaterials { get; private set; } = [];
    public IReadOnlyList<RateTier> WasteTiers { get; private set; } = [];
    public IReadOnlyList<ProductStatusOption> ProductStatusOptions => ProductStatusCatalog.Options;
    public IReadOnlyList<string> MeasurementUnitOptions => MeasurementUnitCatalog.Options;
    public IReadOnlyList<string> LaminationOriginOptions => LaminationOriginCatalog.Options;
    public IReadOnlyList<ProductTypeOption> ProductTypeOptions => ProductTypeCatalog.SaveOptions;
    public ProductRecipe? SelectedProduct { get; private set; }
    public AnalysisRuleResult? RulePreview { get; private set; }
    public bool ComponentsCopied { get; private set; }
    public bool ComponentsSaved { get; private set; }
    public bool RuleComponentsSaved { get; private set; }
    public bool AnalysisItemsSaved { get; private set; }
    public bool AnalysisNeedsEntry { get; private set; }
    public bool AnalysisValidationFailed { get; private set; }
    public bool IsProductFormEditable => NewProduct || SelectedProduct is null || EditMode;
    public bool ShowAnalysisEditor => SelectedProduct is not null && (EditMode || AnalysisNeedsEntry);
    [TempData]
    public string? RuleSaveWarning { get; set; }
    public string FormTitle { get; private set; } = "افزودن محصول";

    public void OnGet()
    {
        LoadPage();
    }

    public IActionResult OnGetRefreshMaterials(int productId, string? rowKey)
    {
        var product = _analysis.GetById(productId);
        if (product is null)
        {
            return NotFound(new { message = "محصول انتخاب‌شده یافت نشد." });
        }

        IReadOnlyList<MaterialItem> materials;
        var useMaterialId = !string.IsNullOrWhiteSpace(rowKey);
        if (useMaterialId)
        {
            var preview = _ruleEngine.Evaluate(BuildRuleContext(product), product.Components);
            var row = preview.Rows.FirstOrDefault(item =>
                string.Equals(item.Definition.Key, rowKey, StringComparison.Ordinal));
            if (row is null)
            {
                return BadRequest(new { message = "ردیف آنالیز معتبر نیست." });
            }

            var keywordIds = row.AllowedMaterials
                .Where(material => row.Definition.SuggestedKeywords.Any(keyword =>
                    material.Name.Contains(keyword, StringComparison.CurrentCultureIgnoreCase)))
                .Select(material => material.Id)
                .ToHashSet();
            materials = row.AllowedMaterials
                .Where(material => keywordIds.Contains(material.Id))
                .Concat(row.AllowedMaterials.Where(material => !keywordIds.Contains(material.Id)))
                .ToList();
        }
        else
        {
            var excludedNames = _analysis.GetAll(take: 5000)
                .Where(item => item.Id == productId || item.ProductStatus == ProductStatus.ReadyForSale)
                .SelectMany(item => new[] { item.Name.Trim(), item.Code.Trim() })
                .Where(value => !string.IsNullOrWhiteSpace(value))
                .ToHashSet(StringComparer.CurrentCultureIgnoreCase);
            materials = _materials.GetAll(take: 5000)
                .Where(material => !excludedNames.Contains(material.Name.Trim()))
                .OrderBy(material => material.Name, StringComparer.CurrentCulture)
                .ToList();
        }

        return new JsonResult(materials.Select(material => new
        {
            value = useMaterialId ? material.Id.ToString() : material.Name,
            label = $"{material.Name} - {material.Kind}",
            price = material.RialPrice > 0 ? material.RialPrice : material.Price,
            unit = AnalysisDisplayUnit(material)
        }));
    }

    public IActionResult OnPostSave()
    {
        var postedProductTypeIsValid = Enum.TryParse<ProductType>(
            Request.Form["Input.ProductType"].ToString(),
            out var postedProductType) && Enum.IsDefined(postedProductType);
        NormalizeProductInput();
        ModelState.Clear();
        if (!postedProductTypeIsValid)
        {
            ModelState.AddModelError("Input.ProductType", "نوع محصول ارسال‌شده معتبر نیست.");
        }
        ValidateProductInput();
        ValidateDuplicateProductCode();
        ValidateProductImage();
        ValidateSemiFinishedStatusTransition();
        if (!ModelState.IsValid)
        {
            EditMode = true;
            EditId = Input.Id > 0 ? Input.Id : null;
            NewProduct = Input.Id <= 0;
            LoadPage(preserveProductInput: true);
            return Page();
        }

        var previousProduct = Input.Id > 0 ? _analysis.GetById(Input.Id) : null;
        Input.ImagePath = SaveProductImage(Input.ImagePath);
        var id = _analysis.Save(Input);
        if (Input.ProductType == ProductType.WeavingAndFinishing && Input.DyeType == DyeableDyeType)
        {
            _analysis.SaveRuleComponentNote(id, "dyeing", Input.DyeingNotes);
        }
        if (Input.ProductType is ProductType.WeavingAndFinishing or ProductType.Lining)
        {
            _analysis.SaveRuleComponentNote(id, "finishing", Input.FinishingNotes);
        }
        if (Input.ProductType == ProductType.Lining && Input.BrushingMode == NoBrushing)
        {
            _analysis.DeleteMappedRuleComponent(id, "brushing");
        }
        _semiFinishedMaterials.Synchronize(id, previousProduct);
        return RedirectToPage(new { Query, EditId = id, EditMode = true });
    }

    public IActionResult OnPostDeleteProduct(int id)
    {
        _analysis.DeleteRecipe(id);
        return RedirectToPage(new { Query });
    }

    public IActionResult OnPostAddComponent()
    {
        var isAjax = string.Equals(Request.Headers.XRequestedWith, "XMLHttpRequest", StringComparison.OrdinalIgnoreCase);
        ValidateComponentInput();
        ValidateDuplicateComponent();
        if (!ModelState.IsValid)
        {
            if (isAjax)
            {
                var errors = ModelState.Values
                    .SelectMany(state => state.Errors)
                    .Select(error => error.ErrorMessage)
                    .Where(message => !string.IsNullOrWhiteSpace(message))
                    .Distinct(StringComparer.CurrentCulture)
                    .ToList();
                return BadRequest(new { errors });
            }

            EditMode = true;
            AnalysisValidationFailed = true;
            EditId = ComponentInput.ProductRecipeId;
            LoadPage();
            return Page();
        }

        var displayQuantity = ComponentInput.Quantity;
        var material = _materials.GetAll(take: 5000).FirstOrDefault(item =>
            string.Equals(item.Name.Trim(), ComponentInput.MaterialName.Trim(), StringComparison.CurrentCultureIgnoreCase));
        ComponentInput.Quantity = ToStoredComponentQuantity(ComponentInput.MaterialName, displayQuantity);
        var componentId = _analysis.AddComponent(ComponentInput);
        _semiFinishedMaterials.Synchronize(ComponentInput.ProductRecipeId);
        if (isAjax)
        {
            var unitPrice = material is null ? 0 : material.RialPrice > 0 ? material.RialPrice : material.Price;
            var componentCount = _analysis.GetById(ComponentInput.ProductRecipeId)?.Components.Count ?? 0;
            return new JsonResult(new
            {
                component = new
                {
                    id = componentId,
                    productId = ComponentInput.ProductRecipeId,
                    materialName = material?.Name ?? ComponentInput.MaterialName.Trim(),
                    materialLabel = material is null ? ComponentInput.MaterialName.Trim() : $"{material.Name} - {material.Kind}",
                    quantity = displayQuantity,
                    unit = AnalysisDisplayUnit(material),
                    unitPrice,
                    amount = ComponentInput.Quantity * unitPrice
                },
                componentCount,
                deleteUrl = Url.Page("/Analyses", "DeleteComponent", new
                {
                    id = componentId,
                    productId = ComponentInput.ProductRecipeId,
                    Query
                })
            });
        }

        return RedirectToPage(
            pageName: null,
            pageHandler: null,
            routeValues: new { Query, EditId = ComponentInput.ProductRecipeId, EditMode = true },
            fragment: "analysis-items-panel");
    }

    public IActionResult OnPostDeleteComponent(int id, int productId)
    {
        _analysis.DeleteComponent(id);
        _semiFinishedMaterials.Synchronize(productId);
        if (string.Equals(Request.Headers.XRequestedWith, "XMLHttpRequest", StringComparison.OrdinalIgnoreCase))
        {
            var componentCount = _analysis.GetById(productId)?.Components.Count ?? 0;
            return new JsonResult(new { componentCount });
        }
        return RedirectToPage(
            pageName: null,
            pageHandler: null,
            routeValues: new { Query, EditId = productId, EditMode = true },
            fragment: "analysis-items-panel");
    }

    public IActionResult OnPostSaveComponentQuantities(int productId)
    {
        ValidateComponentQuantityMaterials(productId);
        if (!ModelState.IsValid)
        {
            EditMode = true;
            AnalysisValidationFailed = true;
            EditId = productId;
            LoadPage();
            return Page();
        }

        ConvertComponentQuantitiesToStoredUnits(productId);
        _analysis.UpdateComponentQuantities(productId, ComponentQuantities);
        _semiFinishedMaterials.Synchronize(productId);
        return RedirectToPage(new { Query, EditId = productId, saved = "components" });
    }

    public IActionResult OnPostSaveRuleComponents(int productId)
    {
        var product = _analysis.GetById(productId);
        if (product is null)
        {
            ModelState.AddModelError(string.Empty, "محصول انتخاب‌شده معتبر نیست.");
            EditId = productId;
            EditMode = true;
            AnalysisValidationFailed = true;
            LoadPage();
            return Page();
        }

        var preview = _ruleEngine.Evaluate(BuildRuleContext(product), product.Components);
        var saveItems = ValidateRuleComponentInputs(product, preview, out var warnings);
        if (!ModelState.IsValid)
        {
            EditMode = true;
            AnalysisValidationFailed = true;
            EditId = productId;
            LoadPage();
            return Page();
        }

        _analysis.SaveRuleComponents(productId, saveItems);
        if (saveItems.All(item => item.RowKey != "airo"))
        {
            _analysis.DeleteMappedRuleComponent(productId, "airo");
        }
        if (product.ProductType == ProductType.Lining && product.BrushingMode == NoBrushing)
        {
            _analysis.DeleteMappedRuleComponent(productId, "brushing");
        }
        _semiFinishedMaterials.Synchronize(productId);
        RuleSaveWarning = warnings.Count == 0 ? null : string.Join(" ", warnings);
        return RedirectToPage(new { Query, EditId = productId, saved = "rules" });
    }

    public IActionResult OnPostSaveAnalysisItems(int productId)
    {
        var product = _analysis.GetById(productId);
        if (product is null)
        {
            ModelState.AddModelError(string.Empty, "محصول انتخاب‌شده معتبر نیست.");
            EditId = productId;
            EditMode = true;
            AnalysisValidationFailed = true;
            LoadPage();
            return Page();
        }

        var preview = _ruleEngine.Evaluate(BuildRuleContext(product), product.Components);
        var saveItems = ValidateRuleComponentInputs(product, preview, out var warnings);
        ValidateComponentQuantityMaterials(productId);
        if (!ModelState.IsValid)
        {
            EditMode = true;
            AnalysisValidationFailed = true;
            EditId = productId;
            LoadPage();
            return Page();
        }

        ConvertComponentQuantitiesToStoredUnits(productId);
        _analysis.SaveRuleComponents(productId, saveItems);
        if (saveItems.All(item => item.RowKey != "airo"))
        {
            _analysis.DeleteMappedRuleComponent(productId, "airo");
        }
        if (product.ProductType == ProductType.Lining && product.BrushingMode == NoBrushing)
        {
            _analysis.DeleteMappedRuleComponent(productId, "brushing");
        }
        _analysis.UpdateComponentQuantities(productId, ComponentQuantities);
        _semiFinishedMaterials.Synchronize(productId);
        RuleSaveWarning = warnings.Count == 0 ? null : string.Join(" ", warnings);
        return RedirectToPage(new { Query, EditId = productId, saved = "all" });
    }

    public IActionResult OnPostCopyComponents()
    {
        ValidateCopyInput();
        if (!ModelState.IsValid)
        {
            EditMode = true;
            AnalysisValidationFailed = true;
            EditId = CopyInput.TargetProductId;
            LoadPage();
            return Page();
        }

        _analysis.ReplaceComponentsFromProduct(CopyInput.TargetProductId, CopyInput.SourceProductId);
        _semiFinishedMaterials.Synchronize(CopyInput.TargetProductId);
        return RedirectToPage(new { Query, EditId = CopyInput.TargetProductId, copied = true });
    }

    private void LoadPage(bool preserveProductInput = false)
    {
        Products = _analysis.GetAll(Query, 300);
        ProductGroups = _productGroups.GetAll().Select(group => group.Name).ToList();
        ComponentsCopied = string.Equals(Request.Query["copied"], "true", StringComparison.OrdinalIgnoreCase);
        ComponentsSaved = string.Equals(Request.Query["saved"], "components", StringComparison.OrdinalIgnoreCase);
        RuleComponentsSaved = string.Equals(Request.Query["saved"], "rules", StringComparison.OrdinalIgnoreCase);
        AnalysisItemsSaved = string.Equals(Request.Query["saved"], "all", StringComparison.OrdinalIgnoreCase);
        WasteTiers = _wasteTiers.GetAll();

        SelectedProduct = NewProduct
            ? null
            : EditId is > 0
            ? _analysis.GetById(EditId.Value)
            : Products.FirstOrDefault();

        if (SelectedProduct is not null && EditId is null && !NewProduct)
        {
            EditId = SelectedProduct.Id;
        }

        if (SelectedProduct is not null)
        {
            if (!preserveProductInput)
            {
                var ruleNotes = _analysis.GetRuleComponentNotes(SelectedProduct.Id);
                Input = new ProductRecipeInput
                {
                    Id = SelectedProduct.Id,
                    Code = SelectedProduct.Code,
                    Name = SelectedProduct.Name,
                    ProductGroupName = SelectedProduct.ProductGroupName,
                    ImagePath = SelectedProduct.ImagePath,
                    ProfitCategoryName = SelectedProduct.ProfitCategoryName,
                    WasteCategoryName = SelectedProduct.WasteCategoryName,
                    ProductType = SelectedProduct.ProductType,
                    ProductStatus = SelectedProduct.ProductStatus,
                    MeasurementUnit = SelectedProduct.MeasurementUnit,
                    LaminationOrigin = SelectedProduct.LaminationOrigin,
                    WarpDensity = SelectedProduct.WarpDensity,
                    WeftDensity = SelectedProduct.WeftDensity,
                    WeftCount = SelectedProduct.WeftCount,
                    DyeType = NormalizeDyeType(SelectedProduct.DyeType),
                    DyeingNotes = ruleNotes.GetValueOrDefault("dyeing", ""),
                    FinishingNotes = ruleNotes.GetValueOrDefault("finishing", ""),
                    LayerType = NormalizeLayerType(SelectedProduct.LayerType),
                    ChainType = NormalizeChainType(SelectedProduct.ChainType),
                    GramPerMeter = SelectedProduct.GramPerMeter,
                    FaceGramPerMeter = SelectedProduct.FaceGramPerMeter,
                    LiningGramPerMeter = SelectedProduct.LiningGramPerMeter,
                    BrushingMode = SelectedProduct.BrushingMode,
                    FinishingType = SelectedProduct.FinishingType,
                    ContainerMeters = SelectedProduct.ContainerMeters,
                    ProductPurchasePrice = SelectedProduct.ProductPurchasePrice
                };
            }
            ComponentInput.ProductRecipeId = SelectedProduct.Id;
            CopyInput.TargetProductId = SelectedProduct.Id;
            FormTitle = "ویرایش محصول";
        }
        else
        {
            if (!preserveProductInput)
            {
                Input = new ProductRecipeInput
                {
                    WasteCategoryName = WasteTiers.FirstOrDefault(item => item.Percent == 2m)?.CategoryName
                        ?? WasteTiers.FirstOrDefault()?.CategoryName
                        ?? "",
                    ProductType = ProductType.Commercial,
                    ProductStatus = ProductStatus.ReadyForSale,
                    MeasurementUnit = MeasurementUnitCatalog.Meter,
                    LaminationOrigin = LaminationOriginCatalog.Domestic,
                    DyeType = ColoredDyeType,
                    LayerType = SingleLayer,
                    ChainType = SingleChain,
                    BrushingMode = TwoStageBrushing
                };
            }
            FormTitle = "افزودن محصول";
        }

        AnalysisNeedsEntry = SelectedProduct is not null && SelectedProduct.Components.Count == 0;
        if (SelectedProduct is not null)
        {
            Materials = _materials.GetAll(take: 5000);
        }

        var needsAnalysisData = SelectedProduct is not null && (EditMode || AnalysisNeedsEntry);
        if (!needsAnalysisData)
        {
            return;
        }

        var selectedProduct = SelectedProduct!;
        CopySourceProducts = _analysis
            .GetAll(take: 5000)
            .Where(product => product.Id != selectedProduct.Id)
            .ToList();

        var excludedProductMaterialNames = _analysis.GetAll(take: 5000)
            .Where(product =>
                product.Id == selectedProduct.Id ||
                product.ProductStatus == ProductStatus.ReadyForSale)
            .SelectMany(product => new[] { product.Name.Trim(), product.Code.Trim() })
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .ToHashSet(StringComparer.CurrentCultureIgnoreCase);
        SelectableMaterials = Materials
            .Where(material => !excludedProductMaterialNames.Contains(material.Name.Trim()))
            .ToList();

        RulePreview = _ruleEngine.Evaluate(
            new AnalysisRuleContext(
                Input.Id,
                Input.ProductType,
                Input.ProductStatus,
                Input.LayerType,
                Input.DyeType,
                Input.ChainType,
                Input.WeftCount,
                Input.GramPerMeter,
                Input.FaceGramPerMeter,
                Input.LiningGramPerMeter,
                Input.BrushingMode),
            selectedProduct.Components);

        if (RuleComponents.Count == 0 && RulePreview is not null)
        {
            var ruleNotes = _analysis.GetRuleComponentNotes(Input.Id);
            RuleComponents = RulePreview.Rows.Select(row =>
            {
                var material = ResolveRuleMaterial(row.MatchedComponent, row.AllowedMaterials);
                return new AnalysisRuleComponentInput
                {
                    RowKey = row.Definition.Key,
                    ExistingComponentId = material is null ? null : row.MatchedComponent?.Id,
                    MaterialId = material?.Id,
                    Quantity = row.Definition.Key == "weaving-fee"
                        ? Input.WeftDensity
                        : row.Definition.Key == "dyeing"
                            ? DyeingBaseWeightInGrams(Input.LayerType, Input.GramPerMeter, Input.FaceGramPerMeter)
                        : row.MatchedComponent is null
                        ? 0
                        : IsKilogramMaterial(material?.MeasurementUnit ?? row.MatchedComponent.MeasurementUnit)
                            ? row.MatchedComponent.Quantity * 1000m
                            : row.MatchedComponent.Quantity,
                    Notes = ruleNotes.GetValueOrDefault(row.Definition.Key, "")
                };
            }).ToList();

            for (var index = 0; index < RulePreview.Rows.Count; index++)
            {
                var sourceKey = WarpingSourceRowKey(RulePreview.Rows[index].Definition.Key);
                if (sourceKey is null)
                {
                    continue;
                }

                var sourceIndex = RulePreview.Rows
                    .Select((sourceRow, sourceRowIndex) => (sourceRow, sourceRowIndex))
                    .FirstOrDefault(item => item.sourceRow.Definition.Key == sourceKey)
                    .sourceRowIndex;
                RuleComponents[index].Quantity = sourceIndex >= 0 && sourceIndex < RuleComponents.Count
                    ? RuleComponents[sourceIndex].Quantity
                    : 0;
            }
        }
    }

    private IReadOnlyList<AnalysisRuleComponentSaveItem> ValidateRuleComponentInputs(
        ProductRecipe product,
        AnalysisRuleResult preview,
        out List<string> warnings)
    {
        warnings = [];
        var result = new List<AnalysisRuleComponentSaveItem>();
        var postedByKey = new Dictionary<string, (AnalysisRuleComponentInput Input, int Index)>(StringComparer.Ordinal);
        for (var index = 0; index < RuleComponents.Count; index++)
        {
            var input = RuleComponents[index];
            if (string.IsNullOrWhiteSpace(input.RowKey) || !postedByKey.TryAdd(input.RowKey, (input, index)))
            {
                ModelState.AddModelError(string.Empty, "ساختار ردیف‌های آنالیز معتبر نیست؛ صفحه را تازه‌سازی کنید.");
            }
        }

        var expectedKeys = preview.Rows.Select(row => row.Definition.Key).ToHashSet(StringComparer.Ordinal);
        if (postedByKey.Keys.Any(key => !expectedKeys.Contains(key)))
        {
            ModelState.AddModelError(string.Empty, "یک ردیف خارج از قواعد محصول ارسال شده است.");
        }

        foreach (var row in preview.Rows)
        {
            if (!postedByKey.TryGetValue(row.Definition.Key, out var posted))
            {
                if (row.Definition.IsRequired)
                {
                    ModelState.AddModelError(string.Empty, $"ردیف اجباری «{row.Definition.Title}» ارسال نشده است.");
                }
                continue;
            }

            var input = posted.Input;
            if (row.Definition.Key == "weaving-fee")
            {
                input.Quantity = product.WeftDensity;
            }
            else if (row.Definition.Key == "dyeing")
            {
                input.Quantity = DyeingBaseWeightInGrams(product.LayerType, product.GramPerMeter, product.FaceGramPerMeter);
            }
            else if (WarpingSourceRowKey(row.Definition.Key) is { } warpingSourceKey)
            {
                input.Quantity = WarpingCalculationQuantity(
                    warpingSourceKey,
                    postedByKey,
                    preview);
            }
            var materialMissing = input.MaterialId is null or <= 0;
            var quantityMissing = input.Quantity <= 0;
            if (row.Definition.Key == "airo" && (materialMissing || quantityMissing))
            {
                continue;
            }
            if (materialMissing && quantityMissing && !row.Definition.IsRequired)
            {
                continue;
            }

            if (materialMissing)
            {
                ModelState.AddModelError($"RuleComponents[{posted.Index}].MaterialId", $"انتخاب آیتم برای ردیف «{row.Definition.Title}» الزامی است.");
            }
            if (quantityMissing)
            {
                ModelState.AddModelError($"RuleComponents[{posted.Index}].Quantity", $"مقدار مصرف ردیف «{row.Definition.Title}» باید بیشتر از صفر باشد.");
            }
            if (materialMissing || quantityMissing)
            {
                continue;
            }

            var materialId = input.MaterialId.GetValueOrDefault();
            var material = row.AllowedMaterials.FirstOrDefault(item => item.Id == materialId);
            if (material is null)
            {
                ModelState.AddModelError($"RuleComponents[{posted.Index}].MaterialId", $"آیتم انتخاب‌شده برای ردیف «{row.Definition.Title}» مجاز نیست.");
                continue;
            }

            var expectedComponentId = row.MatchedComponent?.Id;
            var effectiveExistingComponentId = input.ExistingComponentId;
            var postedComponentWasDeleted = effectiveExistingComponentId is > 0 &&
                product.Components.All(component => component.Id != effectiveExistingComponentId.Value);
            if (postedComponentWasDeleted)
            {
                effectiveExistingComponentId = null;
            }

            if (effectiveExistingComponentId is null &&
                expectedComponentId is > 0)
            {
                effectiveExistingComponentId = expectedComponentId;
            }

            var storedQuantity = row.Definition.Key == "weaving-fee"
                ? decimal.Round(product.WeftDensity, 3, MidpointRounding.AwayFromZero)
                : WarpingSourceRowKey(row.Definition.Key) is not null
                    ? decimal.Round(input.Quantity, 3, MidpointRounding.AwayFromZero)
                : row.Definition.Key == "dyeing"
                    ? decimal.Round(DyeingBaseWeightInGrams(product.LayerType, product.GramPerMeter, product.FaceGramPerMeter) / 1000m, 6, MidpointRounding.AwayFromZero)
                : IsKilogramMaterial(material.MeasurementUnit)
                ? decimal.Round(input.Quantity / 1000m, 6, MidpointRounding.AwayFromZero)
                : decimal.Round(input.Quantity, 3, MidpointRounding.AwayFromZero);
            result.Add(new AnalysisRuleComponentSaveItem(
                row.Definition.Key,
                effectiveExistingComponentId,
                material.Id,
                material.Name,
                storedQuantity,
                input.Notes ?? ""));
        }

        ValidateFinishingExclusivity(product, result);
        ValidateRuleWeights(product, preview, postedByKey, warnings);
        return result;
    }

    public static string? WarpingSourceRowKey(string rowKey) => rowKey switch
    {
        "warping-service" => "warp",
        "warping-service-1" => "warp-1",
        "warping-service-2" => "warp-2",
        _ => null
    };

    private static decimal WarpingCalculationQuantity(
        string sourceKey,
        IReadOnlyDictionary<string, (AnalysisRuleComponentInput Input, int Index)> postedByKey,
        AnalysisRuleResult preview)
    {
        if (!postedByKey.TryGetValue(sourceKey, out var source))
        {
            return 0;
        }

        var sourceDefinition = preview.Rows.FirstOrDefault(row => row.Definition.Key == sourceKey);
        var sourceMaterial = sourceDefinition?.AllowedMaterials
            .FirstOrDefault(material => material.Id == source.Input.MaterialId);
        return IsKilogramMaterial(sourceMaterial?.MeasurementUnit)
            ? source.Input.Quantity / 1000m
            : source.Input.Quantity;
    }

    private void ValidateFinishingExclusivity(
        ProductRecipe product,
        IReadOnlyList<AnalysisRuleComponentSaveItem> saveItems)
    {
        var replacedIds = saveItems
            .Where(item => item.ExistingComponentId is > 0)
            .Select(item => item.ExistingComponentId!.Value)
            .ToHashSet();
        var effectiveNames = product.Components
            .Where(component => !replacedIds.Contains(component.Id))
            .Select(component => component.MaterialName)
            .Concat(saveItems.Select(item => item.MaterialName))
            .ToList();
        var hasFinishing = effectiveNames.Any(name =>
            name.Contains("تکمیل", StringComparison.CurrentCultureIgnoreCase) &&
            !name.Contains("رنگرزی", StringComparison.CurrentCultureIgnoreCase));
        var hasDyeing = effectiveNames.Any(name =>
            name.Contains("رنگرزی", StringComparison.CurrentCultureIgnoreCase) &&
            !name.Contains("تکمیل", StringComparison.CurrentCultureIgnoreCase));
        if (hasFinishing && hasDyeing)
        {
            ModelState.AddModelError(string.Empty, "ردیف‌های تکمیل و رنگرزی به‌صورت پیش‌فرض نمی‌توانند همزمان ثبت شوند.");
        }
    }

    private void ValidateRuleWeights(
        ProductRecipe product,
        AnalysisRuleResult preview,
        IReadOnlyDictionary<string, (AnalysisRuleComponentInput Input, int Index)> postedByKey,
        List<string> warnings)
    {
        if (product.ProductType == ProductType.Lining)
        {
            return;
        }

        decimal DisplayWeight(string key)
        {
            if (!postedByKey.TryGetValue(key, out var posted) || posted.Input.MaterialId is null or <= 0)
            {
                return 0;
            }
            var row = preview.Rows.FirstOrDefault(item => item.Definition.Key == key);
            var materialId = posted.Input.MaterialId.GetValueOrDefault();
            var material = row?.AllowedMaterials.FirstOrDefault(item => item.Id == materialId);
            if (material is null || !IsKilogramMaterial(material.MeasurementUnit))
            {
                return 0;
            }

            return Math.Max(0, posted.Input.Quantity);
        }

        var materialRows = preview.Rows
            .Where(row => row.Definition.RowType == AnalysisRowType.Material)
            .Select(row => row.Definition.Key)
            .ToList();
        if (string.Equals(product.LayerType.Trim(), SingleLayer, StringComparison.CurrentCultureIgnoreCase))
        {
            ValidateWeightDifference("وزن تک‌لایه", materialRows.Sum(DisplayWeight), product.GramPerMeter, warnings);
            return;
        }

        if (preview.Rows.Any(row => row.Definition.Key == "face") &&
            preview.Rows.Any(row => row.Definition.Key == "lining"))
        {
            ValidateWeightDifference("وزن رویه", DisplayWeight("face"), product.FaceGramPerMeter, warnings);
            ValidateWeightDifference("وزن آستر", DisplayWeight("lining"), product.LiningGramPerMeter, warnings);
            return;
        }

        ValidateWeightDifference(
            "مجموع وزن دولایه",
            materialRows.Sum(DisplayWeight),
            product.FaceGramPerMeter + product.LiningGramPerMeter,
            warnings);
    }

    private void ValidateWeightDifference(string label, decimal actual, decimal target, List<string> warnings)
    {
        if (target <= 0 || actual <= 0)
        {
            return;
        }

        var differencePercent = Math.Abs(actual - target) / target * 100m;
        if (differencePercent > 10m)
        {
            ModelState.AddModelError(string.Empty, $"اختلاف {label} با مقدار تعریف‌شده {differencePercent:0.##}٪ است و بیش از حد مجاز ۱۰٪ است.");
        }
        else if (differencePercent >= 5m)
        {
            warnings.Add($"اختلاف {label} با مقدار تعریف‌شده {differencePercent:0.##}٪ است.");
        }
    }

    private static AnalysisRuleContext BuildRuleContext(ProductRecipe product) => new(
        product.Id,
        product.ProductType,
        product.ProductStatus,
        product.LayerType,
        product.DyeType,
        product.ChainType,
        product.WeftCount,
        product.GramPerMeter,
        product.FaceGramPerMeter,
        product.LiningGramPerMeter,
        product.BrushingMode);

    private static MaterialItem? ResolveRuleMaterial(
        ProductComponent? component,
        IReadOnlyList<MaterialItem> allowedMaterials)
    {
        if (component is null)
        {
            return null;
        }

        return component.MaterialId is > 0
            ? allowedMaterials.FirstOrDefault(material => material.Id == component.MaterialId.Value)
            : allowedMaterials.FirstOrDefault(material =>
                string.Equals(material.Name.Trim(), component.MaterialName.Trim(), StringComparison.CurrentCultureIgnoreCase));
    }

    private void ValidateProductInput()
    {
        if (string.IsNullOrWhiteSpace(Input.Code))
        {
            ModelState.AddModelError("Input.Code", "کد محصول الزامی است.");
        }

        if (string.IsNullOrWhiteSpace(Input.Name))
        {
            ModelState.AddModelError("Input.Name", "نام محصول الزامی است.");
        }

        if (!string.IsNullOrWhiteSpace(Input.ProductGroupName))
        {
            var groupExists = _productGroups.GetAll()
                .Any(group => string.Equals(group.Name.Trim(), Input.ProductGroupName.Trim(), StringComparison.CurrentCultureIgnoreCase));
            if (!groupExists)
            {
                ModelState.AddModelError("Input.ProductGroupName", "گروه محصول انتخاب‌شده معتبر نیست.");
            }
        }

        if (string.IsNullOrWhiteSpace(Input.WasteCategoryName))
        {
            ModelState.AddModelError("Input.WasteCategoryName", "دسته کسری و ضایعات الزامی است.");
        }

        if (!ProductTypeCatalog.CanSave(Input.ProductType))
        {
            ModelState.AddModelError("Input.ProductType", "نوع قدیمی تعیین‌نشده است؛ یکی از چهار گروه اصلی کالا را انتخاب کنید.");
        }

        if (!Enum.IsDefined(Input.ProductStatus))
        {
            ModelState.AddModelError("Input.ProductStatus", "وضعیت کالا معتبر نیست.");
        }

        if (!MeasurementUnitCatalog.IsValid(Input.MeasurementUnit))
        {
            ModelState.AddModelError("Input.MeasurementUnit", "واحد محصول باید متر یا کیلوگرم باشد.");
        }

        if (Input.ProductType == ProductType.WeavingAndFinishing)
        {
            if (Input.DyeType is not ColoredDyeType and not DyeableDyeType)
            {
                ModelState.AddModelError("Input.DyeType", "رنگ باید رنگی یا رنگرزی باشد.");
            }

            if (Input.ChainType is not SingleChain and not DoubleChain)
            {
                ModelState.AddModelError("Input.ChainType", "چله باید تک چله یا دوچله باشد.");
            }

            if (Input.LayerType is not SingleLayer and not DoubleLayer)
            {
                ModelState.AddModelError("Input.LayerType", "نوع لایه معتبر نیست.");
            }

            if (Input.WeftDensity <= 0)
            {
                ModelState.AddModelError("Input.WeftDensity", "تراکم پود باید بیشتر از صفر باشد.");
            }

            if (Input.WeftCount <= 0 || Input.WeftCount != decimal.Truncate(Input.WeftCount))
            {
                ModelState.AddModelError("Input.WeftCount", "تعداد پود باید یک عدد صحیح بیشتر از صفر باشد.");
            }

            if (Input.ChainType == SingleChain && Input.WarpDensity <= 0)
            {
                ModelState.AddModelError("Input.WarpDensity", "تراکم تار در حالت تک‌چله الزامی است.");
            }

        }

        if (Input.ProductType == ProductType.Lining)
        {
            if (Input.BrushingMode is not NoBrushing and not SingleStageBrushing and not TwoStageBrushing and not FourStageBrushing)
            {
                ModelState.AddModelError("Input.BrushingMode", "حالت خارزنی معتبر نیست.");
            }

        }

        if (Input.ProductType is ProductType.Commercial or ProductType.Laminated &&
            !LaminationOriginCatalog.IsValid(Input.LaminationOrigin))
        {
            ModelState.AddModelError("Input.LaminationOrigin", "مبدأ محصول باید داخلی یا خارجی باشد.");
        }

        var requiresContainerMeters = Input.ProductType is ProductType.Commercial or ProductType.Laminated &&
            Input.LaminationOrigin == LaminationOriginCatalog.Foreign;
        if (requiresContainerMeters && Input.ContainerMeters <= 0)
        {
            ModelState.AddModelError("Input.ContainerMeters", "متراژ در کانتینر برای محصول بازرگانی یا لمینتی خارجی باید بیشتر از صفر باشد.");
        }

        if (Input.ProductType == ProductType.Commercial)
        {
            if (Input.ProductPurchasePrice <= 0)
            {
                ModelState.AddModelError("Input.ProductPurchasePrice", "قیمت خرید برای محصول بازرگانی باید بیشتر از صفر باشد.");
            }
            else if (Input.LaminationOrigin == LaminationOriginCatalog.Domestic &&
                     Input.ProductPurchasePrice != decimal.Truncate(Input.ProductPurchasePrice))
            {
                ModelState.AddModelError("Input.ProductPurchasePrice", "قیمت خرید داخلی باید به ریال و عدد صحیح باشد.");
            }
        }

        if (ProductTypeCatalog.CanSave(Input.ProductType))
        {
            if ((Input.ProductType == ProductType.WeavingAndFinishing && Input.LayerType == DoubleLayer) ||
                Input.ProductType == ProductType.Laminated)
            {
                if (Input.FaceGramPerMeter <= 0)
                {
                    ModelState.AddModelError("Input.FaceGramPerMeter", "وزن رویه باید بیشتر از صفر باشد.");
                }
                if (Input.LiningGramPerMeter <= 0)
                {
                    ModelState.AddModelError("Input.LiningGramPerMeter", "وزن آستر باید بیشتر از صفر باشد.");
                }
            }
            else if (Input.ProductType != ProductType.Lining && Input.GramPerMeter <= 0)
            {
                ModelState.AddModelError("Input.GramPerMeter", "گرماژ باید بیشتر از صفر باشد.");
            }
        }
    }

    private void NormalizeProductInput()
    {
        Input.Name = Input.Name?.Trim() ?? "";
        Input.ProductGroupName = Input.ProductGroupName?.Trim() ?? "";
        Input.ImagePath = Input.ImagePath?.Trim() ?? "";
        Input.ProfitCategoryName = Input.ProfitCategoryName?.Trim() ?? "";
        Input.WasteCategoryName = Input.WasteCategoryName?.Trim() ?? "";
        Input.FinishingType = "";
        Input.LaminationOrigin = Input.LaminationOrigin?.Trim() ?? "";
        Input.DyeingNotes = Input.DyeingNotes?.Trim() ?? "";
        Input.FinishingNotes = Input.FinishingNotes?.Trim() ?? "";
        Input.WarpDensity = decimal.Round(Math.Max(0, Input.WarpDensity), 3, MidpointRounding.AwayFromZero);
        Input.WeftDensity = decimal.Round(Math.Max(0, Input.WeftDensity), 3, MidpointRounding.AwayFromZero);
        Input.WeftCount = decimal.Round(Math.Max(0, Input.WeftCount), 3, MidpointRounding.AwayFromZero);
        Input.GramPerMeter = decimal.Round(Math.Max(0, Input.GramPerMeter), 3, MidpointRounding.AwayFromZero);
        Input.FaceGramPerMeter = decimal.Round(Math.Max(0, Input.FaceGramPerMeter), 3, MidpointRounding.AwayFromZero);
        Input.LiningGramPerMeter = decimal.Round(Math.Max(0, Input.LiningGramPerMeter), 3, MidpointRounding.AwayFromZero);
        Input.ContainerMeters = decimal.Round(Math.Max(0, Input.ContainerMeters), 3, MidpointRounding.AwayFromZero);
        Input.ProductPurchasePrice = Math.Max(0, Input.ProductPurchasePrice);

        if (Input.ProductType == ProductType.LegacyProduction)
        {
            return;
        }

        if (Input.ProductType == ProductType.WeavingAndFinishing)
        {
            Input.DyeType = NormalizeDyeType(Input.DyeType);
            Input.LayerType = NormalizeLayerType(Input.LayerType);
            Input.ChainType = NormalizeChainType(Input.ChainType);
            if (Input.ChainType != SingleChain)
            {
                Input.WarpDensity = 0;
            }

            if (Input.LayerType == SingleLayer)
            {
                Input.FaceGramPerMeter = 0;
                Input.LiningGramPerMeter = 0;
            }
            else
            {
                Input.GramPerMeter = 0;
            }
        }
        else if (Input.ProductType == ProductType.Laminated)
        {
            Input.WarpDensity = 0;
            Input.WeftDensity = 0;
            Input.WeftCount = 0;
            Input.DyeType = ColoredDyeType;
            Input.LayerType = DoubleLayer;
            Input.ChainType = SingleChain;
            Input.GramPerMeter = 0;
        }
        else
        {
            Input.WarpDensity = 0;
            Input.WeftDensity = 0;
            Input.WeftCount = 0;
            Input.DyeType = ColoredDyeType;
            Input.LayerType = SingleLayer;
            Input.ChainType = SingleChain;
            Input.FaceGramPerMeter = 0;
            Input.LiningGramPerMeter = 0;
        }

        if (Input.ProductType == ProductType.Lining)
        {
            Input.BrushingMode = NormalizeBrushingMode(Input.BrushingMode);
        }
        else
        {
            Input.BrushingMode = TwoStageBrushing;
        }

        if (Input.ProductType is not ProductType.Commercial and not ProductType.Laminated)
        {
            Input.LaminationOrigin = LaminationOriginCatalog.Domestic;
        }

        if (Input.ProductType is not ProductType.Commercial and not ProductType.Laminated ||
            Input.LaminationOrigin != LaminationOriginCatalog.Foreign)
        {
            Input.ContainerMeters = 0;
        }

        if (Input.ProductType == ProductType.Commercial)
        {
            Input.ProductPurchasePrice = Input.LaminationOrigin == LaminationOriginCatalog.Foreign
                ? decimal.Round(Input.ProductPurchasePrice, 3, MidpointRounding.AwayFromZero)
                : decimal.Round(Input.ProductPurchasePrice, 0, MidpointRounding.AwayFromZero);
        }
        else
        {
            Input.ProductPurchasePrice = 0;
        }
    }

    private static string NormalizeDyeType(string? value)
    {
        return string.Equals(value?.Trim(), DyeableDyeType, StringComparison.CurrentCultureIgnoreCase)
            ? DyeableDyeType
            : ColoredDyeType;
    }

    private static decimal DyeingBaseWeightInGrams(
        string? layerType,
        decimal gramPerMeter,
        decimal faceGramPerMeter) =>
        string.Equals(layerType?.Trim(), DoubleLayer, StringComparison.CurrentCultureIgnoreCase)
            ? Math.Max(0, faceGramPerMeter)
            : Math.Max(0, gramPerMeter);

    private static string NormalizeLayerType(string? value)
    {
        return string.Equals(value?.Trim(), DoubleLayer, StringComparison.CurrentCultureIgnoreCase)
            ? DoubleLayer
            : SingleLayer;
    }

    private static string NormalizeChainType(string? value)
    {
        return string.Equals(value?.Trim(), DoubleChain, StringComparison.CurrentCultureIgnoreCase)
            ? DoubleChain
            : SingleChain;
    }

    private static string NormalizeBrushingMode(string? value)
    {
        var normalized = value?.Trim();
        return normalized is NoBrushing or SingleStageBrushing or TwoStageBrushing or FourStageBrushing
            ? normalized
            : TwoStageBrushing;
    }

    private void ValidateComponentInput()
    {
        if (ComponentInput.ProductRecipeId <= 0)
        {
            ModelState.AddModelError("ComponentInput.ProductRecipeId", "ابتدا محصول را ذخیره کنید.");
        }

        if (string.IsNullOrWhiteSpace(ComponentInput.MaterialName))
        {
            ModelState.AddModelError("ComponentInput.MaterialName", "کالا/خدمت الزامی است.");
        }
        else if (IsOwnProductMaterial(ComponentInput.ProductRecipeId, ComponentInput.MaterialName))
        {
            ModelState.AddModelError("ComponentInput.MaterialName", "هر محصول نمی‌تواند به‌عنوان ماده اولیه آنالیز خودش انتخاب شود.");
        }

        if (ComponentInput.Quantity <= 0)
        {
            ModelState.AddModelError("ComponentInput.Quantity", "مقدار باید بیشتر از صفر باشد.");
        }
    }

    private void ValidateDuplicateProductCode()
    {
        if (string.IsNullOrWhiteSpace(Input.Code))
        {
            return;
        }

        var duplicateProduct = _analysis.GetAll(take: 5000)
            .Any(product => product.Id != Input.Id &&
                string.Equals(product.Code.Trim(), Input.Code.Trim(), StringComparison.CurrentCultureIgnoreCase));
        if (duplicateProduct)
        {
            ModelState.AddModelError("Input.Code", "محصول دیگری با این کد قبلا ثبت شده است.");
        }
    }

    private void ValidateSemiFinishedStatusTransition()
    {
        if (Input.Id <= 0 || Input.ProductStatus != ProductStatus.ReadyForSale)
        {
            return;
        }

        var storedProduct = _analysis.GetById(Input.Id);
        if (storedProduct is null || storedProduct.ProductStatus != ProductStatus.SemiFinished)
        {
            return;
        }

        var productKeys = new[] { storedProduct.Name.Trim(), storedProduct.Code.Trim() }
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .ToHashSet(StringComparer.CurrentCultureIgnoreCase);
        var productMaterial = _materials.GetAll(take: 5000)
            .FirstOrDefault(material => productKeys.Contains(material.Name.Trim()));
        if (productMaterial is null)
        {
            return;
        }

        var usages = _analysis.GetMaterialUsages(productMaterial.Id)
            .Where(usage => usage.ProductRecipeId != storedProduct.Id)
            .ToList();
        if (usages.Count == 0)
        {
            return;
        }

        var productCodes = string.Join("، ", usages
            .Select(usage => usage.ProductCode)
            .Distinct(StringComparer.CurrentCultureIgnoreCase)
            .Take(5));
        var remainingCount = usages
            .Select(usage => usage.ProductRecipeId)
            .Distinct()
            .Count() - Math.Min(5, usages.Select(usage => usage.ProductRecipeId).Distinct().Count());
        var remainingText = remainingCount > 0 ? $" و {remainingCount} محصول دیگر" : "";
        var message = $"این محصول در آنالیز محصول‌های «{productCodes}»{remainingText} استفاده شده است. ابتدا آن را از آنالیز این محصولات حذف کنید، سپس وضعیت را از نیمه‌آماده خارج کنید.";
        ModelState.AddModelError("Input.ProductStatus", message);
    }

    private void ValidateProductImage()
    {
        if (ProductImage is null || ProductImage.Length == 0)
        {
            return;
        }

        var extension = Path.GetExtension(ProductImage.FileName);
        if (!AllowedImageExtensions.Contains(extension))
        {
            ModelState.AddModelError("ProductImage", "فرمت تصویر باید jpg، png یا webp باشد.");
        }

        if (ProductImage.Length > MaxProductImageBytes)
        {
            ModelState.AddModelError("ProductImage", "حجم تصویر محصول نباید بیشتر از ۵ مگابایت باشد.");
        }
    }

    private string SaveProductImage(string currentPath)
    {
        if (ProductImage is null || ProductImage.Length == 0)
        {
            return currentPath;
        }

        var extension = Path.GetExtension(ProductImage.FileName).ToLowerInvariant();
        var uploadDirectory = Path.Combine(_environment.WebRootPath, "uploads", "products");
        Directory.CreateDirectory(uploadDirectory);

        var fileName = $"{Guid.NewGuid():N}{extension}";
        var filePath = Path.Combine(uploadDirectory, fileName);
        using var stream = System.IO.File.Create(filePath);
        ProductImage.CopyTo(stream);

        return $"/uploads/products/{fileName}";
    }

    private void ValidateDuplicateComponent()
    {
        if (ComponentInput.ProductRecipeId <= 0 || string.IsNullOrWhiteSpace(ComponentInput.MaterialName))
        {
            return;
        }

        var selectedName = ComponentInput.MaterialName.Trim();
        var selectedMaterial = _materials.GetAll(take: 5000)
            .FirstOrDefault(material =>
                string.Equals(material.Name.Trim(), selectedName, StringComparison.CurrentCultureIgnoreCase));
        var selectedMaterialId = selectedMaterial?.Id;

        var product = _analysis.GetById(ComponentInput.ProductRecipeId);
        var duplicateComponent = product?.Components.Any(component =>
            (selectedMaterialId is > 0 && component.MaterialId == selectedMaterialId) ||
            string.Equals(component.MaterialName.Trim(), selectedName, StringComparison.CurrentCultureIgnoreCase)) == true;
        if (duplicateComponent)
        {
            const string message = "این کالا یا خدمت قبلا در اقلام مصرفی همین محصول ثبت شده است.";
            ModelState.AddModelError("ComponentInput.MaterialName", message);
            ModelState.AddModelError(string.Empty, message);
        }
    }

    private void ValidateComponentQuantityMaterials(int productId)
    {
        var product = _analysis.GetById(productId);
        if (product is null)
        {
            ModelState.AddModelError(string.Empty, "محصول انتخاب‌شده معتبر نیست.");
            return;
        }

        var componentsById = product.Components.ToDictionary(component => component.Id);
        var materials = _materials.GetAll(take: 5000);
        var seen = new Dictionary<string, int>(StringComparer.CurrentCultureIgnoreCase);

        for (var index = 0; index < ComponentQuantities.Count; index++)
        {
            var input = ComponentQuantities[index];
            if (!componentsById.TryGetValue(input.Id, out var component))
            {
                continue;
            }

            var materialName = string.IsNullOrWhiteSpace(input.MaterialName)
                ? component.MaterialName
                : input.MaterialName.Trim();
            var material = materials.FirstOrDefault(item =>
                string.Equals(item.Name.Trim(), materialName, StringComparison.CurrentCultureIgnoreCase));
            if (IsOwnProductMaterial(productId, materialName))
            {
                ModelState.AddModelError($"ComponentQuantities[{index}].MaterialName", "هر محصول نمی‌تواند به‌عنوان ماده اولیه آنالیز خودش انتخاب شود.");
                ModelState.AddModelError(string.Empty, "محصول در آنالیز خودش قابل انتخاب نیست.");
                continue;
            }
            var key = material is not null
                ? $"id:{material.Id}"
                : $"name:{materialName.Trim()}";

            if (seen.TryGetValue(key, out var previousIndex))
            {
                const string message = "این کالا یا خدمت در جدول اقلام مصرفی تکراری است.";
                ModelState.AddModelError($"ComponentQuantities[{index}].MaterialName", message);
                ModelState.AddModelError($"ComponentQuantities[{previousIndex}].MaterialName", message);
                ModelState.AddModelError(string.Empty, message);
                continue;
            }

            seen[key] = index;
        }
    }

    private bool IsOwnProductMaterial(int productId, string materialName)
    {
        if (productId <= 0 || string.IsNullOrWhiteSpace(materialName))
        {
            return false;
        }

        var product = _analysis.GetById(productId);
        return product is not null &&
            (string.Equals(product.Name.Trim(), materialName.Trim(), StringComparison.CurrentCultureIgnoreCase) ||
             string.Equals(product.Code.Trim(), materialName.Trim(), StringComparison.CurrentCultureIgnoreCase));
    }

    private decimal ToStoredComponentQuantity(string materialName, decimal displayQuantity)
    {
        var material = Materials.FirstOrDefault(item =>
            string.Equals(item.Name.Trim(), materialName.Trim(), StringComparison.CurrentCultureIgnoreCase));
        material ??= _materials.GetAll(take: 5000).FirstOrDefault(item =>
            string.Equals(item.Name.Trim(), materialName.Trim(), StringComparison.CurrentCultureIgnoreCase));

        return IsKilogramMaterial(material?.MeasurementUnit)
            ? decimal.Round(displayQuantity / 1000m, 6, MidpointRounding.AwayFromZero)
            : decimal.Round(displayQuantity, 3, MidpointRounding.AwayFromZero);
    }

    private void ConvertComponentQuantitiesToStoredUnits(int productId)
    {
        var product = _analysis.GetById(productId);
        if (product is null)
        {
            return;
        }

        var componentsById = product.Components.ToDictionary(component => component.Id);
        foreach (var input in ComponentQuantities)
        {
            if (!componentsById.TryGetValue(input.Id, out var component))
            {
                continue;
            }

            var materialName = string.IsNullOrWhiteSpace(input.MaterialName)
                ? component.MaterialName
                : input.MaterialName;
            var material = Materials.FirstOrDefault(item =>
                string.Equals(item.Name.Trim(), materialName.Trim(), StringComparison.CurrentCultureIgnoreCase));
            material ??= _materials.GetAll(take: 5000).FirstOrDefault(item =>
                string.Equals(item.Name.Trim(), materialName.Trim(), StringComparison.CurrentCultureIgnoreCase));
            input.MaterialName = material?.Name ?? materialName.Trim();

            input.Quantity = IsKilogramMaterial(material?.MeasurementUnit ?? component.MeasurementUnit)
                ? decimal.Round(input.Quantity / 1000m, 6, MidpointRounding.AwayFromZero)
                : decimal.Round(input.Quantity, 3, MidpointRounding.AwayFromZero);
        }
    }

    public static bool IsKilogramMaterial(string? measurementUnit)
    {
        return string.Equals(measurementUnit?.Trim(), KilogramUnit, StringComparison.CurrentCultureIgnoreCase);
    }

    public static string ComponentDisplayUnit(string? measurementUnit)
    {
        return IsKilogramMaterial(measurementUnit) ? GramUnit : "متر";
    }

    public static string AnalysisDisplayUnit(MaterialItem? material) =>
        ComponentDisplayUnit(material?.MeasurementUnit);

    public static decimal AnalysisDisplayQuantity(ProductComponent component, MaterialItem? material) =>
        IsKilogramMaterial(material?.MeasurementUnit ?? component.MeasurementUnit)
            ? component.Quantity * 1000m
            : component.Quantity;

    public static decimal ComponentDisplayQuantity(ProductComponent component)
    {
        return IsKilogramMaterial(component.MeasurementUnit)
            ? component.Quantity * 1000m
            : component.Quantity;
    }

    public static string RuleGroupLabel(ProductRuleGroup value) => AnalysisRuleLabels.Group(value);

    public static string RuleRowTypeLabel(AnalysisRowType value) => AnalysisRuleLabels.RowType(value);

    public static string RuleSelectionLabel(AnalysisSelectionScope value) => AnalysisRuleLabels.SelectionScope(value);

    public static string RuleStatusLabel(ExpectedAnalysisRowStatus value) => AnalysisRuleLabels.Status(value);

    public static string RuleStatusCss(ExpectedAnalysisRowStatus value) => value switch
    {
        ExpectedAnalysisRowStatus.Completed => "text-bg-success",
        ExpectedAnalysisRowStatus.Incomplete => "text-bg-warning",
        _ => "text-bg-danger"
    };

    private void ValidateCopyInput()
    {
        if (CopyInput.TargetProductId <= 0)
        {
            ModelState.AddModelError("CopyInput.TargetProductId", "ابتدا محصول مقصد را انتخاب کنید.");
        }

        if (CopyInput.SourceProductId <= 0)
        {
            ModelState.AddModelError("CopyInput.SourceProductId", "محصول مبدا برای کپی اقلام مصرفی الزامی است.");
        }

        if (CopyInput.TargetProductId == CopyInput.SourceProductId)
        {
            ModelState.AddModelError("CopyInput.SourceProductId", "محصول مبدا و مقصد نمی‌توانند یکسان باشند.");
        }
    }

    public sealed class CopyComponentsInput
    {
        public int TargetProductId { get; set; }
        public int SourceProductId { get; set; }
    }
}
