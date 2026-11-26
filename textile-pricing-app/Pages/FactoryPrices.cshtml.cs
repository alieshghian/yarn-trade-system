using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using System.Globalization;
using TextilePricingApp.Services;

namespace TextilePricingApp.Pages;

public class FactoryPricesModel : PageModel
{
    private const decimal BaseProfitPriceTolerance = 2m;
    private readonly PricingService _pricing;
    private readonly FactoryPriceRepository _factoryPrices;
    private readonly SemiFinishedMaterialService _semiFinishedMaterials;

    public FactoryPricesModel(
        PricingService pricing,
        FactoryPriceRepository factoryPrices,
        SemiFinishedMaterialService semiFinishedMaterials)
    {
        _pricing = pricing;
        _factoryPrices = factoryPrices;
        _semiFinishedMaterials = semiFinishedMaterials;
    }

    [BindProperty(SupportsGet = true)]
    public string? Query { get; set; }

    [BindProperty(SupportsGet = true)]
    public string SearchMode { get; set; } = "contains";

    [BindProperty(SupportsGet = true)]
    public string StatusFilter { get; set; } = "all";

    [BindProperty(SupportsGet = true)]
    public string SortBy { get; set; } = "default";

    [BindProperty(SupportsGet = true)]
    public string SortDirection { get; set; } = "desc";

    [BindProperty(SupportsGet = true)]
    public bool OnlyWithTargetProfit { get; set; }

    [BindProperty(SupportsGet = true)]
    public bool SuppressBaseProfitGroupPreview { get; set; }

    [BindProperty]
    public FactoryBulkInput Input { get; set; } = new();

    [BindProperty]
    public FactorySingleInput SingleInput { get; set; } = new();

    [BindProperty]
    public List<FactoryPriceBulkSaveInput> PriceInputs { get; set; } = [];

    public IReadOnlyList<FactoryPriceRow> Rows { get; private set; } = [];
    public bool Saved { get; private set; }
    public decimal GlobalProfitPercent => _pricing.Settings.GlobalProfitPercent;
    public decimal VatPercent => _pricing.Settings.VatRate * 100m;
    public bool HasPendingBulkConfirmation { get; private set; }
    public bool HasPendingSingleConfirmation { get; private set; }
    public bool HasPendingGridConfirmation { get; private set; }
    public bool HasPendingBaseProfitGroupConfirmation { get; private set; }

    public void OnGet()
    {
        Saved = Request.Query.ContainsKey("saved");
        LoadRows();

        if (!SuppressBaseProfitGroupPreview && Rows.Count > 0 && Rows.All(row => row.HasBaseProfitDrift))
        {
            HasPendingBaseProfitGroupConfirmation = true;
            var updates = Rows.Select(CreateBaseProfitUpdate).ToList();
            Rows = ApplyFiltersAndSort(BuildRows(GetProductsByQuery(), updates), includePendingChanges: true);
        }
    }

    public IActionResult OnPostApply()
    {
        var targetProducts = GetTargetProducts(Input.Scope);
        if (targetProducts.Count == 0)
        {
            ModelState.AddModelError("Input.Value", "هیچ محصولی برای اعمال تغییر پیدا نشد.");
        }

        if (Input.Value < 0)
        {
            ModelState.AddModelError("Input.Value", "عدد وارد شده نمی‌تواند منفی باشد.");
        }

        if (!ModelState.IsValid)
        {
            LoadRows();
            return Page();
        }

        var storedPrices = _factoryPrices.GetAll();
        var updates = targetProducts.Select(product =>
        {
            var currentFactoryPrice = storedPrices.TryGetValue(product.Code, out var stored)
                ? stored
                : 0;
            return BuildFactoryPriceInput(product.Code, CalculateNewPrice(product.Code, currentFactoryPrice, Input));
        }).ToList();

        if (!Input.ConfirmWarnings)
        {
            HasPendingBulkConfirmation = true;
            Rows = ApplyFiltersAndSort(BuildRows(targetProducts, updates), includePendingChanges: true);
            return Page();
        }

        _factoryPrices.UpsertMany(updates);
        _semiFinishedMaterials.SynchronizeAll();
        return RedirectToPage(new { Query, SearchMode, StatusFilter, SortBy, SortDirection, OnlyWithTargetProfit, saved = true });
    }

    public IActionResult OnPostSaveOne()
    {
        if (!string.IsNullOrWhiteSpace(SingleInput.ProductCode) && SingleInput.Price >= 0)
        {
            var productCode = _pricing.Calculate(SingleInput.ProductCode).Recipe.Code;
            if (string.IsNullOrWhiteSpace(productCode))
            {
                return NotFound();
            }

            var updates = new List<FactoryPriceInput>
            {
                BuildFactoryPriceInputFromVatInclusivePrice(productCode, SingleInput.Price)
            };
            if (!SingleInput.ConfirmWarnings)
            {
                HasPendingSingleConfirmation = true;
                Rows = ApplySort(BuildRows(GetProductsByQuery(), updates)
                    .Where(row => row.ProductCode.Equals(SingleInput.ProductCode, StringComparison.CurrentCultureIgnoreCase)));
                return Page();
            }

            _factoryPrices.UpsertMany(updates);
            _semiFinishedMaterials.SynchronizeAll();
        }

        return RedirectToPage(new { Query, SearchMode, StatusFilter, SortBy, SortDirection, OnlyWithTargetProfit, saved = true });
    }

    public IActionResult OnPostSavePrices()
    {
        var currentRows = BuildRows(GetProductsByQuery())
            .Where(row =>
                (StatusFilter == "all" || row.StatusKey == StatusFilter) &&
                (!OnlyWithTargetProfit || row.HasBaseProfitDrift))
            .ToDictionary(row => row.ProductCode, StringComparer.CurrentCultureIgnoreCase);
        var updates = PriceInputs
            .Where(input => !string.IsNullOrWhiteSpace(input.ProductCode) && input.Price >= 0)
            .Where(input =>
                currentRows.TryGetValue(input.ProductCode, out var row) &&
                RemoveVat(input.Price, _pricing.Settings.VatRate) != row.FactoryPrice)
            .Select(input => BuildFactoryPriceInputFromVatInclusivePrice(input.ProductCode, input.Price))
            .ToList();

        if (updates.Count == 0)
        {
            return RedirectToPage(new { Query, SearchMode, StatusFilter, SortBy, SortDirection, OnlyWithTargetProfit, saved = true });
        }

        if (!Input.ConfirmWarnings)
        {
            HasPendingGridConfirmation = true;
            Rows = ApplyFiltersAndSort(BuildRows(GetProductsByQuery(), updates), includePendingChanges: true);
            return Page();
        }

        _factoryPrices.UpsertMany(updates);
        _semiFinishedMaterials.SynchronizeAll();
        return RedirectToPage(new { Query, SearchMode, StatusFilter, SortBy, SortDirection, OnlyWithTargetProfit, saved = true });
    }

    public IActionResult OnPostApplyBaseProfit(string productCode)
    {
        if (string.IsNullOrWhiteSpace(productCode))
        {
            return RedirectToPage(new { Query, SearchMode, StatusFilter, SortBy, SortDirection, OnlyWithTargetProfit });
        }

        var storedPrices = _factoryPrices.GetAllDetails();
        if (!storedPrices.TryGetValue(productCode, out var stored) || stored.BaseProfitPercent is null)
        {
            return RedirectToPage(new { Query, SearchMode, StatusFilter, SortBy, SortDirection, OnlyWithTargetProfit });
        }

        var calculation = _pricing.Calculate(productCode);
        if (string.IsNullOrWhiteSpace(calculation.Recipe.Code))
        {
            return NotFound();
        }

        var roundedCostBase = RoundPrice(calculation.Summary.CashCost);
        var targetPrice = CalculatePriceFromProfitPercent(roundedCostBase, stored.BaseProfitPercent.Value);
        _factoryPrices.UpsertMany([new(productCode, targetPrice, stored.BaseProfitPercent.Value)]);
        _semiFinishedMaterials.SynchronizeAll();
        return RedirectToPage(new { Query, SearchMode, StatusFilter, SortBy, SortDirection, OnlyWithTargetProfit, saved = true });
    }

    public IActionResult OnPostApplyBaseProfitGroup()
    {
        var updates = LoadVisibleBaseProfitUpdates();
        if (updates.Count == 0)
        {
            return RedirectToPage(new { Query, SearchMode, StatusFilter, SortBy, SortDirection, OnlyWithTargetProfit });
        }

        _factoryPrices.UpsertMany(updates);
        _semiFinishedMaterials.SynchronizeAll();
        return RedirectToPage(new { Query, SearchMode, StatusFilter, SortBy, SortDirection, OnlyWithTargetProfit, saved = true });
    }

    public IActionResult OnPostExportPreview(string previewMode)
    {
        var previewRows = BuildPreviewRows(previewMode)
            .Where(row => row.HasPendingChange && row.PendingFactoryPriceWithVat is not null)
            .ToList();
        if (previewRows.Count == 0)
        {
            return BadRequest("No pending factory-price changes were found.");
        }

        var excelRows = new List<IReadOnlyList<ExcelExportService.Cell>>
        {
            new List<ExcelExportService.Cell>
            {
                new("کد کالا", Style: ExcelExportService.CellStyle.Header),
                new("نام کالا", Style: ExcelExportService.CellStyle.Header),
                new("مبلغ فروش اعتباری با مالیات", Style: ExcelExportService.CellStyle.Header),
                new("درصد سود فروش اعتباری با مالیات", Style: ExcelExportService.CellStyle.Header),
                new("مبلغ فروش اعتباری با مالیات جدید", Style: ExcelExportService.CellStyle.Header),
                new("درصد سود فروش اعتباری با مالیات جدید", Style: ExcelExportService.CellStyle.Header),
                new("درصد تغییر قیمت ریالی", Style: ExcelExportService.CellStyle.Header)
            }
        };

        excelRows.AddRange(previewRows.Select(row => (IReadOnlyList<ExcelExportService.Cell>)new List<ExcelExportService.Cell>
        {
            new(row.ProductCode),
            new(row.ProductName),
            new(Number: row.FactoryPriceWithVat, Style: ExcelExportService.CellStyle.Money),
            new(Number: row.CurrentProfitPercent / 100m, Style: ExcelExportService.CellStyle.Percent),
            new(Number: row.PendingFactoryPriceWithVat!.Value, Style: ExcelExportService.CellStyle.Money),
            new(Number: (row.PendingProfitPercent ?? 0m) / 100m, Style: ExcelExportService.CellStyle.Percent),
            CreatePriceChangeCell(row.FactoryPriceWithVat, row.PendingFactoryPriceWithVat.Value)
        }));

        var file = ExcelExportService.CreateWorkbook("پیش نمایش قیمت کارخانه", excelRows);
        var fileName = $"factory-price-preview-{DateTime.Now:yyyyMMdd-HHmm}.xlsx";
        return File(file, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileName);
    }

    private static ExcelExportService.Cell CreatePriceChangeCell(decimal currentPrice, decimal pendingPrice)
    {
        if (currentPrice == 0)
        {
            return new(Text: "—");
        }

        var changePercent = (pendingPrice - currentPrice) / currentPrice;
        var style = changePercent > 0
            ? ExcelExportService.CellStyle.PositiveChangePercent
            : changePercent < 0
                ? ExcelExportService.CellStyle.NegativeChangePercent
                : ExcelExportService.CellStyle.ZeroChangePercent;
        return new(Number: changePercent, Style: style);
    }

    private IReadOnlyList<FactoryPriceRow> BuildPreviewRows(string previewMode)
    {
        if (string.Equals(previewMode, "base-profit-group", StringComparison.OrdinalIgnoreCase))
        {
            var updates = LoadVisibleBaseProfitUpdates();
            return updates.Count == 0
                ? []
                : ApplyFiltersAndSort(BuildRows(GetProductsByQuery(), updates), includePendingChanges: true);
        }

        if (string.Equals(previewMode, "bulk", StringComparison.OrdinalIgnoreCase))
        {
            var targetProducts = GetTargetProducts(Input.Scope);
            var storedPrices = _factoryPrices.GetAll();
            var updates = targetProducts.Select(product =>
            {
                var currentPrice = storedPrices.TryGetValue(product.Code, out var stored) ? stored : 0;
                return BuildFactoryPriceInput(product.Code, CalculateNewPrice(product.Code, currentPrice, Input));
            }).ToList();
            return ApplyFiltersAndSort(BuildRows(targetProducts, updates), includePendingChanges: true);
        }

        if (string.Equals(previewMode, "single", StringComparison.OrdinalIgnoreCase) &&
            !string.IsNullOrWhiteSpace(SingleInput.ProductCode) && SingleInput.Price >= 0)
        {
            var updates = new List<FactoryPriceInput>
            {
                BuildFactoryPriceInputFromVatInclusivePrice(SingleInput.ProductCode, SingleInput.Price)
            };
            return ApplySort(BuildRows(GetProductsByQuery(), updates)
                .Where(row => row.ProductCode.Equals(SingleInput.ProductCode, StringComparison.CurrentCultureIgnoreCase)));
        }

        if (string.Equals(previewMode, "grid", StringComparison.OrdinalIgnoreCase))
        {
            var currentRows = BuildRows(GetProductsByQuery())
                .Where(row =>
                    (StatusFilter == "all" || row.StatusKey == StatusFilter) &&
                    (!OnlyWithTargetProfit || row.HasBaseProfitDrift))
                .ToDictionary(row => row.ProductCode, StringComparer.CurrentCultureIgnoreCase);
            var updates = PriceInputs
                .Where(input => !string.IsNullOrWhiteSpace(input.ProductCode) && input.Price >= 0)
                .Where(input => currentRows.TryGetValue(input.ProductCode, out var row) &&
                    RemoveVat(input.Price, _pricing.Settings.VatRate) != row.FactoryPrice)
                .Select(input => BuildFactoryPriceInputFromVatInclusivePrice(input.ProductCode, input.Price))
                .ToList();
            return ApplyFiltersAndSort(BuildRows(GetProductsByQuery(), updates), includePendingChanges: true);
        }

        return [];
    }

    private void LoadRows()
    {
        Rows = ApplyFiltersAndSort(BuildRows(GetProductsByQuery()));
    }

    private List<FactoryPriceInput> LoadVisibleBaseProfitUpdates()
    {
        LoadRows();
        return Rows
            .Where(row => row.HasBaseProfitDrift)
            .Select(CreateBaseProfitUpdate)
            .ToList();
    }

    private static FactoryPriceInput CreateBaseProfitUpdate(FactoryPriceRow row)
    {
        return new FactoryPriceInput(row.ProductCode, row.BaseProfitPrice, row.BaseProfitPercent);
    }

    private IReadOnlyList<FactoryPriceRow> ApplyFiltersAndSort(
        IEnumerable<FactoryPriceRow> rows,
        bool includePendingChanges = false)
    {
        var filtered = rows.Where(row =>
            (StatusFilter == "all" ||
             row.StatusKey == StatusFilter ||
             (includePendingChanges && row.HasPendingChange)) &&
            (!OnlyWithTargetProfit || row.HasBaseProfitDrift || (includePendingChanges && row.HasPendingChange)));
        var sorted = ApplySort(filtered);
        return includePendingChanges
            ? sorted.OrderByDescending(row => row.HasPendingChange).ToList()
            : sorted;
    }

    private IReadOnlyList<FactoryPriceRow> ApplySort(IEnumerable<FactoryPriceRow> rows)
    {
        var normalizedDirection = string.Equals(SortDirection, "asc", StringComparison.OrdinalIgnoreCase)
            ? "asc"
            : "desc";
        SortDirection = normalizedDirection;
        SortBy = SortBy?.Trim() switch
        {
            "base-profit" => "base-profit",
            "target-profit" => "target-profit",
            "credit-profit" => "credit-profit",
            "profit-gap" => "profit-gap",
            _ => "default"
        };

        if (SortBy == "default")
        {
            return rows.ToList();
        }

        static decimal Key(FactoryPriceRow row, string sortBy) => sortBy switch
        {
            "base-profit" => row.BaseProfitPercent,
            "target-profit" => row.CashBaseProfitPercent,
            "credit-profit" => row.CurrentProfitPercent,
            "profit-gap" => Math.Abs(row.CurrentProfitPercent - row.BaseProfitPercent),
            _ => 0
        };

        return normalizedDirection == "asc"
            ? rows.OrderBy(row => Key(row, SortBy)).ThenBy(row => row.ProductCode, StringComparer.CurrentCulture).ToList()
            : rows.OrderByDescending(row => Key(row, SortBy)).ThenBy(row => row.ProductCode, StringComparer.CurrentCulture).ToList();
    }

    private IReadOnlyList<FactoryPriceRow> BuildRows(IEnumerable<Models.ProductRecipe> products, IReadOnlyList<FactoryPriceInput>? pendingUpdates = null)
    {
        var storedPrices = _factoryPrices.GetAllDetails();
        var cashPaymentDiscountPercent = _pricing.Settings.CashPaymentDiscountPercent;
        var vatRate = _pricing.Settings.VatRate;
        var pendingByCode = (pendingUpdates ?? [])
            .GroupBy(update => update.ProductCode, StringComparer.CurrentCultureIgnoreCase)
            .ToDictionary(group => group.Key, group => group.Last(), StringComparer.CurrentCultureIgnoreCase);

        return products
            .Select(product =>
            {
                var calculation = _pricing.Calculate(product.Code);
                var costBase = calculation.Summary.CashCost;
                var systemFactoryPrice = CalculatePriceFromProfitPercent(costBase, _pricing.Settings.GlobalProfitPercent);
                var hasFactoryPrice = storedPrices.TryGetValue(product.Code, out var factoryPrice);
                var hasTargetProfit = hasFactoryPrice && factoryPrice?.BaseProfitPercent is not null;
                var storedFactoryPrice = factoryPrice?.Price;
                var lastEditedAt = factoryPrice?.LastEditedAt;
                var roundedCostBase = RoundPrice(costBase);
                var roundedFactoryPrice = RoundPrice(hasFactoryPrice && storedFactoryPrice is not null
                    ? storedFactoryPrice.Value
                    : systemFactoryPrice);
                var currentProfitAmount = roundedFactoryPrice - roundedCostBase;
                var currentProfitPercent = CalculateProfitPercent(roundedFactoryPrice, roundedCostBase);
                var baseProfitPercent = hasFactoryPrice
                    ? factoryPrice?.BaseProfitPercent ?? currentProfitPercent
                    : _pricing.Settings.GlobalProfitPercent;
                var baseProfitPrice = CalculatePriceFromProfitPercent(roundedCostBase, baseProfitPercent);
                var hasBaseProfitDrift = hasFactoryPrice && Math.Abs(baseProfitPrice - roundedFactoryPrice) > BaseProfitPriceTolerance;
                var cashBaseProfitPrice = CalculateDiscountedPrice(baseProfitPrice, cashPaymentDiscountPercent);
                var cashBaseProfitPercent = CalculateProfitPercent(cashBaseProfitPrice, roundedCostBase);
                var cashFactoryPrice = CalculateDiscountedPrice(roundedFactoryPrice, cashPaymentDiscountPercent);
                var cashFactoryPriceWithVat = ApplyVat(cashFactoryPrice, vatRate);
                var factoryPriceWithVat = ApplyVat(roundedFactoryPrice, vatRate);
                var cashProfitAmount = cashFactoryPrice - roundedCostBase;
                var cashProfitPercent = roundedCostBase == 0
                    ? 0
                    : cashProfitAmount / roundedCostBase * 100m;
                var status = GetStatus(currentProfitAmount);
                var hasPendingChange = pendingByCode.TryGetValue(product.Code, out var pending);
                var pendingFactoryPrice = hasPendingChange ? RoundPrice(pending!.Price) : (decimal?)null;
                var pendingProfitPercent = hasPendingChange ? pending!.BaseProfitPercent : (decimal?)null;
                var pendingCashFactoryPrice = hasPendingChange
                    ? CalculateDiscountedPrice(pending!.Price, cashPaymentDiscountPercent)
                    : (decimal?)null;
                var pendingFactoryPriceWithVat = pendingFactoryPrice is null
                    ? (decimal?)null
                    : ApplyVat(pendingFactoryPrice.Value, vatRate);
                var pendingCashFactoryPriceWithVat = pendingCashFactoryPrice is null
                    ? (decimal?)null
                    : ApplyVat(pendingCashFactoryPrice.Value, vatRate);
                var pendingCashProfitPercent = pendingCashFactoryPrice is null
                    ? (decimal?)null
                    : CalculateProfitPercent(pendingCashFactoryPrice.Value, roundedCostBase);
                var pendingProfitCssClass = pendingProfitPercent is null
                    ? ""
                    : GetPendingProfitCssClass(pendingProfitPercent.Value, baseProfitPercent);
                var pendingCashProfitCssClass = pendingCashProfitPercent is null
                    ? ""
                    : GetPendingProfitCssClass(pendingCashProfitPercent.Value, cashBaseProfitPercent);

                return new FactoryPriceRow(
                    product.Code,
                    product.Name,
                    product.ProductGroupName,
                    product.ImagePath,
                    roundedCostBase,
                    roundedFactoryPrice,
                    factoryPriceWithVat,
                    currentProfitPercent,
                    GetProfitCssClass(currentProfitPercent),
                    baseProfitPercent,
                    GetProfitCssClass(baseProfitPercent),
                    baseProfitPrice,
                    cashBaseProfitPrice,
                    cashBaseProfitPercent,
                    GetProfitCssClass(cashBaseProfitPercent),
                    hasBaseProfitDrift,
                    cashPaymentDiscountPercent,
                    cashFactoryPrice,
                    cashFactoryPriceWithVat,
                    cashProfitPercent,
                    GetProfitCssClass(cashProfitPercent),
                    hasFactoryPrice,
                    hasTargetProfit,
                    hasFactoryPrice ? lastEditedAt : null,
                    hasPendingChange,
                    pendingFactoryPrice,
                    pendingFactoryPriceWithVat,
                    pendingProfitPercent,
                    pendingCashFactoryPrice,
                    pendingCashFactoryPriceWithVat,
                    pendingCashProfitPercent,
                    pendingProfitCssClass,
                    pendingCashProfitCssClass,
                    status.Key,
                    status.Text,
                    status.CssClass);
            })
            .ToList();
    }

    private IReadOnlyList<Models.ProductRecipe> GetProductsByQuery()
    {
        var products = _pricing.Recipes.AsEnumerable();
        if (!string.IsNullOrWhiteSpace(Query))
        {
            var query = Query.Trim();
            var exact = string.Equals(SearchMode, "exact", StringComparison.OrdinalIgnoreCase);
            SearchMode = exact ? "exact" : "contains";
            products = exact
                ? products.Where(product =>
                    product.Code.Equals(query, StringComparison.CurrentCultureIgnoreCase) ||
                    product.Name.Equals(query, StringComparison.CurrentCultureIgnoreCase) ||
                    product.ProductGroupName.Equals(query, StringComparison.CurrentCultureIgnoreCase))
                : products.Where(product =>
                    product.Code.Contains(query, StringComparison.CurrentCultureIgnoreCase) ||
                    product.Name.Contains(query, StringComparison.CurrentCultureIgnoreCase) ||
                    product.ProductGroupName.Contains(query, StringComparison.CurrentCultureIgnoreCase));
        }

        return products.ToList();
    }

    private IReadOnlyList<Models.ProductRecipe> GetTargetProducts(string scope)
    {
        if (!string.Equals(scope, "filtered", StringComparison.OrdinalIgnoreCase))
        {
            return _pricing.Recipes.ToList();
        }

        var visibleProductCodes = BuildRows(GetProductsByQuery())
            .Where(row =>
                (StatusFilter == "all" || row.StatusKey == StatusFilter) &&
                (!OnlyWithTargetProfit || row.HasBaseProfitDrift))
            .Select(row => row.ProductCode)
            .ToHashSet(StringComparer.CurrentCultureIgnoreCase);

        return _pricing.Recipes
            .Where(product => visibleProductCodes.Contains(product.Code))
            .ToList();
    }

    private decimal CalculateNewPrice(string productCode, decimal currentPrice, FactoryBulkInput input)
    {
        var result = input.Mode switch
        {
            "increase" => currentPrice * (1 + input.Value / 100m),
            "decrease" => currentPrice * (1 - input.Value / 100m),
            "set" => CalculatePriceFromProfitPercent(_pricing.Calculate(productCode).Summary.CashCost, input.Value),
            _ => currentPrice
        };

        return RoundPrice(result);
    }

    private FactoryPriceInput BuildFactoryPriceInput(string productCode, decimal price)
    {
        var costBase = RoundPrice(_pricing.Calculate(productCode).Summary.CashCost);
        var roundedPrice = RoundPrice(price);
        return new FactoryPriceInput(productCode, roundedPrice, CalculateProfitPercent(roundedPrice, costBase));
    }

    private FactoryPriceInput BuildFactoryPriceInputFromVatInclusivePrice(string productCode, decimal priceWithVat)
    {
        return BuildFactoryPriceInput(productCode, RemoveVat(priceWithVat, _pricing.Settings.VatRate));
    }

    private static decimal CalculateProfitPercent(decimal price, decimal costBase)
    {
        return costBase == 0
            ? 0
            : (price - costBase) / costBase * 100m;
    }

    private static decimal CalculatePriceFromProfitPercent(decimal costBase, decimal profitPercent)
    {
        var price = costBase * (1 + profitPercent / 100m);
        return RoundPrice(price);
    }

    private static decimal CalculateDiscountedPrice(decimal factoryPrice, decimal discountPercent)
    {
        var result = factoryPrice * (1 - discountPercent / 100m);
        return RoundPrice(result);
    }

    private static decimal ApplyVat(decimal price, decimal vatRate)
    {
        return RoundPrice(price * (1 + vatRate));
    }

    private static decimal RemoveVat(decimal priceWithVat, decimal vatRate)
    {
        return vatRate <= -1
            ? RoundPrice(priceWithVat)
            : RoundPrice(priceWithVat / (1 + vatRate));
    }

    private static decimal RoundPrice(decimal value)
    {
        return decimal.Round(Math.Max(0, value) / 100m, 0, MidpointRounding.AwayFromZero) * 100m;
    }

    private static string GetPendingProfitCssClass(decimal pendingProfitPercent, decimal referenceProfitPercent)
    {
        var difference = pendingProfitPercent - referenceProfitPercent;
        if (Math.Abs(difference) < 0.0001m)
        {
            return "factory-pending-value--even";
        }

        return difference > 0
            ? "factory-pending-value--up"
            : "factory-pending-value--down";
    }

    private static string GetProfitCssClass(decimal profitPercent)
    {
        return profitPercent < 0 ? "is-down" : "is-even";
    }

    private static FactoryPriceStatus GetStatus(decimal profitAmount)
    {
        if (profitAmount < 0)
        {
            return new FactoryPriceStatus("loss", "زیر قیمت تمام‌شده", "factory-price-row--loss");
        }

        if (profitAmount > 0)
        {
            return new FactoryPriceStatus("profit", "سود", "factory-price-row--profit");
        }

        return new FactoryPriceStatus("equal", "بدون سود", "factory-price-row--equal");
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

    public sealed class FactoryBulkInput
    {
        public string Scope { get; set; } = "filtered";
        public string Mode { get; set; } = "increase";
        public decimal Value { get; set; }
        public bool ConfirmWarnings { get; set; }
    }

    public sealed class FactorySingleInput
    {
        public string ProductCode { get; set; } = "";
        public decimal Price { get; set; }
        public bool ConfirmWarnings { get; set; }
    }

    public sealed class FactoryPriceBulkSaveInput
    {
        public string ProductCode { get; set; } = "";
        public decimal Price { get; set; }
    }

    public sealed record FactoryPriceRow(
        string ProductCode,
        string ProductName,
        string ProductGroupName,
        string ImagePath,
        decimal CostBasePrice,
        decimal FactoryPrice,
        decimal FactoryPriceWithVat,
        decimal CurrentProfitPercent,
        string CurrentProfitCssClass,
        decimal BaseProfitPercent,
        string BaseProfitCssClass,
        decimal BaseProfitPrice,
        decimal CashBaseProfitPrice,
        decimal CashBaseProfitPercent,
        string CashBaseProfitCssClass,
        bool HasBaseProfitDrift,
        decimal CashPaymentDiscountPercent,
        decimal CashFactoryPrice,
        decimal CashFactoryPriceWithVat,
        decimal CashProfitPercent,
        string CashProfitCssClass,
        bool HasFactoryPrice,
        bool HasTargetProfit,
        DateTime? LastEditedAt,
        bool HasPendingChange,
        decimal? PendingFactoryPrice,
        decimal? PendingFactoryPriceWithVat,
        decimal? PendingProfitPercent,
        decimal? PendingCashFactoryPrice,
        decimal? PendingCashFactoryPriceWithVat,
        decimal? PendingCashProfitPercent,
        string PendingProfitCssClass,
        string PendingCashProfitCssClass,
        string StatusKey,
        string StatusText,
        string StatusCssClass);

    private sealed record FactoryPriceStatus(string Key, string Text, string CssClass);
}
