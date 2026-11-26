using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using TextilePricingApp.Models;
using TextilePricingApp.Services;

namespace TextilePricingApp.Pages;

public class MaterialsModel : PageModel
{
    private const string YarnKind = "نخ";
    private const string FabricKind = "پارچه";
    private const string ServiceKind = "خدمت";
    private const string RialUnit = "ریال";
    private const string DollarUnit = "دلار";
    private const string KilogramUnit = "کیلوگرم";
    private const string MeterUnit = "متر";
    private readonly MaterialRepository _materials;
    private readonly AnalysisRepository _analysis;
    private readonly SettingsRepository _settings;
    private readonly SemiFinishedMaterialService _semiFinishedMaterials;
    private readonly MaterialsPdfService _pdf;

    public MaterialsModel(
        MaterialRepository materials,
        AnalysisRepository analysis,
        SettingsRepository settings,
        SemiFinishedMaterialService semiFinishedMaterials,
        MaterialsPdfService pdf)
    {
        _materials = materials;
        _analysis = analysis;
        _settings = settings;
        _semiFinishedMaterials = semiFinishedMaterials;
        _pdf = pdf;
    }

    [BindProperty(SupportsGet = true)]
    public string? Query { get; set; }

    [BindProperty(SupportsGet = true)]
    public int? EditId { get; set; }

    [BindProperty(SupportsGet = true)]
    public string? KindFilter { get; set; }

    [BindProperty]
    public MaterialInput Input { get; set; } = new();

    [BindProperty]
    public List<MaterialPriceInput> PriceInputs { get; set; } = [];

    [BindProperty]
    public bool PriceChangeConfirmed { get; set; }

    public IReadOnlyList<MaterialItem> Items { get; private set; } = [];
    public decimal DollarRate { get; private set; }
    public decimal PriceChangeConfirmationThresholdPercent { get; private set; }
    public string ActiveKind { get; private set; } = YarnKind;
    public int YarnCount { get; private set; }
    public int FabricCount { get; private set; }
    public int ServiceCount { get; private set; }
    public string FormTitle { get; private set; } = "افزودن کالا/خدمت";
    public string? SuccessMessage { get; private set; }
    public string? ErrorMessage { get; private set; }
    public IReadOnlySet<int> SystemProductMaterialIds { get; private set; } = new HashSet<int>();
    public IReadOnlyDictionary<int, int> SystemProductIdsByMaterialId { get; private set; } = new Dictionary<int, int>();
    private PricingSettings CurrentSettings { get; set; } = new();

    public void OnGet()
    {
        LoadPage();
    }

    public async Task<IActionResult> OnGetPrintAsync(CancellationToken cancellationToken)
    {
        LoadPage();
        var calendar = new System.Globalization.PersianCalendar();
        var now = DateTime.Now;
        var document = new
        {
            companyName = CurrentSettings.CompanyName,
            title = $"لیست {ActiveKind}",
            date = $"{calendar.GetYear(now):0000}/{calendar.GetMonth(now):00}/{calendar.GetDayOfMonth(now):00}",
            query = Query ?? "",
            rows = Items.Select(item => new
            {
                name = item.Name,
                measurementUnit = item.MeasurementUnit,
                price = PriceForDisplay(item),
                currency = item.Unit,
                rialPrice = item.RialPrice,
                lastEdited = PersianDate(item.LastEditedAt)
            })
        };
        var bytes = await _pdf.RenderAsync(document, cancellationToken);
        return File(bytes, "application/pdf");
    }

    private static string PersianDate(DateTime value)
    {
        var local = value.Kind == DateTimeKind.Utc ? value.ToLocalTime() : value;
        var calendar = new System.Globalization.PersianCalendar();
        return $"{calendar.GetYear(local):0000}/{calendar.GetMonth(local):00}/{calendar.GetDayOfMonth(local):00}";
    }

    public IActionResult OnPostSave()
    {
        CurrentSettings = _settings.Get();
        PriceChangeConfirmationThresholdPercent = CurrentSettings.PriceChangeConfirmationThresholdPercent;
        if (Input.Id > 0 && _semiFinishedMaterials.IsSystemMaterial(Input.Id))
        {
            ModelState.AddModelError(string.Empty, "این پارچه از محصول نیمه‌آماده ساخته شده و فقط از قیمت فروش نقدی کارخانه به‌روزرسانی می‌شود.");
            EditId = Input.Id;
            LoadPage();
            return Page();
        }

        var oldMaterial = Input.Id > 0 ? _materials.GetById(Input.Id) : null;
        NormalizeInput();
        if (oldMaterial is not null && PriceChangeConfirmationRequired(oldMaterial.RialPrice, Input.RialPrice) && !PriceChangeConfirmed)
        {
            ModelState.AddModelError(string.Empty, $"تغییر قیمت این کالا/خدمت بیش از آستانه {PriceChangeConfirmationThresholdPercent:N2}٪ است. برای ثبت، تأیید تغییر را انجام دهید.");
        }
        ValidateInput();
        ValidateDuplicateName();
        if (!ModelState.IsValid)
        {
            LoadPage();
            return Page();
        }

        var savedAction = Input.Id > 0 ? "updated" : "created";
        if (Input.Id > 0)
        {
            _materials.Update(Input);
        }
        else
        {
            _materials.Add(Input);
        }
        _semiFinishedMaterials.SynchronizeAll();

        return RedirectToPage(new { Query, KindFilter = Input.Kind, saved = savedAction });
    }

    public IActionResult OnPostSavePrices()
    {
        ActiveKind = NormalizeKind(KindFilter);
        CurrentSettings = _settings.Get();
        DollarRate = CurrentSettings.EffectiveDollarRate;
        PriceChangeConfirmationThresholdPercent = CurrentSettings.PriceChangeConfirmationThresholdPercent;
        var lockedIds = _semiFinishedMaterials.GetSystemMaterialIds();
        var hasLargeChange = PriceInputs
            .Where(input => !lockedIds.Contains(input.Id))
            .Select(input => _materials.GetById(input.Id))
            .Where(item => item is not null)
            .Zip(PriceInputs.Where(input => !lockedIds.Contains(input.Id)), (item, input) =>
                PriceChangeConfirmationRequired(item!.RialPrice, CalculateRialPrice(item, input.Price)))
            .Any(required => required);
        if (hasLargeChange && !PriceChangeConfirmed)
        {
            ModelState.AddModelError(string.Empty, $"حداقل یکی از تغییرات قیمت بیش از آستانه {PriceChangeConfirmationThresholdPercent:N2}٪ است. برای ثبت، تأیید تغییر را انجام دهید.");
            LoadPage();
            return Page();
        }
        _materials.UpdatePrices(PriceInputs.Where(input => !lockedIds.Contains(input.Id)), DollarRate);
        _semiFinishedMaterials.SynchronizeAll();
        return RedirectToPage(new { Query, KindFilter = ActiveKind, saved = "prices" });
    }

    public IActionResult OnPostDelete(int id)
    {
        ActiveKind = NormalizeKind(KindFilter);
        var material = _materials.GetById(id);
        if (_semiFinishedMaterials.IsSystemMaterial(id))
        {
            return RedirectToPage(new
            {
                Query,
                KindFilter = ActiveKind,
                systemLocked = true
            });
        }

        var usageCount = _analysis.GetMaterialUsages(id).Count;
        if (usageCount > 0)
        {
            return RedirectToPage(new
            {
                Query,
                KindFilter = ActiveKind,
                deleteBlocked = true,
                blockedName = material?.Name ?? "این کالا/خدمت",
                usageCount
            });
        }

        _materials.Delete(id);
        return RedirectToPage(new { Query, KindFilter = ActiveKind, saved = "deleted" });
    }

    private void LoadPage()
    {
        CurrentSettings = _settings.Get();
        DollarRate = CurrentSettings.EffectiveDollarRate;
        PriceChangeConfirmationThresholdPercent = CurrentSettings.PriceChangeConfirmationThresholdPercent;
        ActiveKind = NormalizeKind(KindFilter);
        SystemProductMaterialIds = ActiveKind == FabricKind
            ? _semiFinishedMaterials.GetSystemMaterialIds()
            : new HashSet<int>();

        if (EditId is > 0)
        {
            var material = _materials.GetById(EditId.Value);
            if (material is not null)
            {
                ActiveKind = NormalizeKind(material.Kind);
                Input = new MaterialInput
                {
                    Id = material.Id,
                    Name = material.Name,
                    Kind = ActiveKind,
                    Price = material.Price,
                    Unit = NormalizeUnit(material.Unit),
                    MeasurementUnit = NormalizeMeasurementUnit(material.MeasurementUnit),
                    RialPrice = material.RialPrice
                };
                FormTitle = $"ویرایش {ActiveKind}";
            }
        }
        else
        {
            Input.Kind = ActiveKind;

            if (string.IsNullOrWhiteSpace(Input.Unit))
            {
                Input.Unit = RialUnit;
            }

            if (string.IsNullOrWhiteSpace(Input.MeasurementUnit))
            {
                Input.MeasurementUnit = KilogramUnit;
            }

            FormTitle = $"افزودن {ActiveKind}";
        }

        var countsByKind = _materials.CountByKind(Query);
        YarnCount = GetKindCount(countsByKind, YarnKind);
        FabricCount = GetKindCount(countsByKind, FabricKind);
        ServiceCount = GetKindCount(countsByKind, ServiceKind);
        Items = _materials.GetByKind(ActiveKind, Query, 200);
        SystemProductIdsByMaterialId = ActiveKind == FabricKind
            ? BuildSystemProductIdsByMaterialId(Items)
            : new Dictionary<int, int>();
        var saved = Request.Query["saved"].ToString();
        SuccessMessage = saved switch
        {
            "created" => "کالا/خدمت جدید با موفقیت ثبت شد.",
            "updated" => "اطلاعات کالا/خدمت با موفقیت ویرایش شد.",
            "deleted" => "کالا/خدمت با موفقیت حذف شد.",
            "prices" => "همه قیمت‌های ویرایش‌شده با موفقیت ذخیره شدند.",
            _ => null
        };

        if (string.Equals(Request.Query["deleteBlocked"], "true", StringComparison.OrdinalIgnoreCase))
        {
            var blockedName = Request.Query["blockedName"].ToString();
            var usageCountText = Request.Query["usageCount"].ToString();
            ErrorMessage = $"«{(string.IsNullOrWhiteSpace(blockedName) ? "این کالا/خدمت" : blockedName)}» در {usageCountText} آنالیز استفاده شده است. ابتدا آن را از آنالیزها حذف کنید، سپس از اینجا حذف کنید.";
        }
        else if (string.Equals(Request.Query["systemLocked"], "true", StringComparison.OrdinalIgnoreCase))
        {
            ErrorMessage = "پارچه محصول نیمه‌آماده سیستمی است و حذف یا ویرایش دستی آن مجاز نیست.";
        }
    }

    public bool IsSystemProductMaterial(int materialId) => SystemProductMaterialIds.Contains(materialId);

    public int? GetSystemProductId(int materialId) =>
        SystemProductIdsByMaterialId.TryGetValue(materialId, out var productId) ? productId : null;

    private static int GetKindCount(IReadOnlyDictionary<string, int> countsByKind, string kind) =>
        countsByKind.TryGetValue(kind, out var count) ? count : 0;

    public bool IsPriceOutdated(MaterialItem item)
    {
        var validityDays = NormalizeKind(item.Kind) == ServiceKind
            ? CurrentSettings.ServicesRefreshDays
            : CurrentSettings.GoodsRefreshDays;
        var today = DateTime.Now.Date;
        var lastEdited = item.LastEditedAt == default ? today : item.LastEditedAt;
        var localDate = lastEdited.Kind == DateTimeKind.Utc
            ? lastEdited.ToLocalTime().Date
            : lastEdited.Date;
        return (today - localDate).TotalDays >= Math.Max(1, validityDays);
    }

    public decimal PriceForDisplay(MaterialItem item)
    {
        var posted = PriceInputs.FirstOrDefault(input => input.Id == item.Id);
        return posted is null ? item.Price : posted.Price;
    }

    private IReadOnlyDictionary<int, int> BuildSystemProductIdsByMaterialId(IEnumerable<MaterialItem> materials)
    {
        var materialByName = materials
            .Where(material => NormalizeKind(material.Kind) == FabricKind)
            .ToDictionary(material => material.Name.Trim(), material => material, StringComparer.CurrentCultureIgnoreCase);
        var result = new Dictionary<int, int>();
        foreach (var product in _analysis.GetAll(take: 5000).Where(product => product.ProductStatus == ProductStatus.SemiFinished))
        {
            var keys = new[] { product.Name.Trim(), product.Code.Trim() }
                .Where(value => !string.IsNullOrWhiteSpace(value));
            foreach (var key in keys)
            {
                if (materialByName.TryGetValue(key, out var material))
                {
                    result[material.Id] = product.Id;
                }
            }
        }

        return result;
    }

    private void NormalizeInput()
    {
        DollarRate = _settings.Get().EffectiveDollarRate;
        Input.Kind = NormalizeKind(Input.Kind);
        Input.Unit = NormalizeUnit(Input.Unit);
        Input.MeasurementUnit = NormalizeMeasurementUnit(Input.MeasurementUnit);
        Input.Price = RoundPriceByUnit(Input.Price, Input.Unit);
        Input.RialPrice = decimal.Round(Input.Unit == DollarUnit ? Input.Price * DollarRate : Input.Price, 0, MidpointRounding.AwayFromZero);
    }

    private decimal CalculateRialPrice(MaterialItem item, decimal price)
    {
        var roundedPrice = RoundPriceByUnit(price, item.Unit);
        return item.Unit == DollarUnit
            ? decimal.Round(roundedPrice * DollarRate, 0, MidpointRounding.AwayFromZero)
            : roundedPrice;
    }

    private bool PriceChangeConfirmationRequired(decimal oldPrice, decimal newPrice)
    {
        var threshold = Math.Max(0, PriceChangeConfirmationThresholdPercent);
        if (oldPrice == newPrice)
        {
            return false;
        }

        if (oldPrice <= 0)
        {
            return newPrice > 0;
        }

        return Math.Abs(newPrice - oldPrice) / oldPrice * 100m > threshold;
    }

    private static string NormalizeKind(string? kind)
    {
        var value = kind?.Trim();
        if (string.Equals(value, FabricKind, StringComparison.CurrentCultureIgnoreCase))
        {
            return FabricKind;
        }

        if (string.Equals(value, ServiceKind, StringComparison.CurrentCultureIgnoreCase))
        {
            return ServiceKind;
        }

        return YarnKind;
    }

    private static string NormalizeUnit(string? unit)
    {
        return string.Equals(unit?.Trim(), DollarUnit, StringComparison.CurrentCultureIgnoreCase)
            ? DollarUnit
            : RialUnit;
    }

    private static string NormalizeMeasurementUnit(string? unit)
    {
        return string.Equals(unit?.Trim(), MeterUnit, StringComparison.CurrentCultureIgnoreCase)
            ? MeterUnit
            : KilogramUnit;
    }

    public static decimal RoundPriceByUnit(decimal price, string? unit)
    {
        var decimals = string.Equals(unit?.Trim(), DollarUnit, StringComparison.CurrentCultureIgnoreCase) ? 2 : 0;
        return decimal.Round(price, decimals, MidpointRounding.AwayFromZero);
    }

    public static bool IsDollarUnit(string? unit)
    {
        return string.Equals(unit?.Trim(), DollarUnit, StringComparison.CurrentCultureIgnoreCase);
    }

    private void ValidateInput()
    {
        if (string.IsNullOrWhiteSpace(Input.Name))
        {
            ModelState.AddModelError("Input.Name", "نام کالا/خدمت الزامی است.");
        }

        if (Input.Kind is not YarnKind and not FabricKind and not ServiceKind)
        {
            ModelState.AddModelError("Input.Kind", "نوع باید نخ، پارچه یا خدمت باشد.");
        }

        if (Input.Unit is not RialUnit and not DollarUnit)
        {
            ModelState.AddModelError("Input.Unit", "واحد باید ریال یا دلار باشد.");
        }

        if (Input.MeasurementUnit is not KilogramUnit and not MeterUnit)
        {
            ModelState.AddModelError("Input.MeasurementUnit", "واحد باید کیلوگرم یا متر باشد.");
        }

        if (Input.Price < 0)
        {
            ModelState.AddModelError("Input.Price", "قیمت نمی‌تواند منفی باشد.");
        }

    }

    private void ValidateDuplicateName()
    {
        if (string.IsNullOrWhiteSpace(Input.Name))
        {
            return;
        }

        var duplicateName = _materials.GetAll(take: 5000)
            .Any(item => item.Id != Input.Id &&
                string.Equals(item.Name.Trim(), Input.Name.Trim(), StringComparison.CurrentCultureIgnoreCase));
        if (duplicateName)
        {
            ModelState.AddModelError("Input.Name", "کالا یا خدمت دیگری با این نام قبلا ثبت شده است.");
        }
    }
}
