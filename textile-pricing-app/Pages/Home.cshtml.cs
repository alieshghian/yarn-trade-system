using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using System.Globalization;
using TextilePricingApp.Models;
using TextilePricingApp.Services;

namespace TextilePricingApp.Pages;

public class HomeModel : PageModel
{
    private readonly MaterialRepository _materials;
    private readonly SettingsRepository _settings;
    private readonly PageAccessService _access;

    public HomeModel(MaterialRepository materials, SettingsRepository settings, PageAccessService access)
    {
        _materials = materials;
        _settings = settings;
        _access = access;
    }

    [BindProperty]
    public decimal DollarRate { get; set; }

    [BindProperty]
    public List<MaterialPriceInput> PriceInputs { get; set; } = [];

    public PricingSettings Settings { get; private set; } = new();
    public IReadOnlyList<MaterialItem> OutdatedGoods { get; private set; } = [];
    public IReadOnlyList<MaterialItem> OutdatedServices { get; private set; } = [];
    public bool IsDollarOutdated { get; private set; }
    public bool CanEditPriceRefresh { get; private set; }
    public string? SuccessMessage { get; private set; }
    public string? ErrorMessage { get; private set; }
    public bool HasOutdatedItems => IsDollarOutdated || OutdatedGoods.Count > 0 || OutdatedServices.Count > 0;

    public void OnGet()
    {
        LoadPage();
    }

    public IActionResult OnPostSaveDollar()
    {
        LoadPage();
        if (!CanEditPriceRefresh)
        {
            return RedirectToPage(new { saved = "readonly" });
        }

        DollarRate = decimal.Round(Math.Max(0, DollarRate), 0, MidpointRounding.AwayFromZero);
        var input = new PricingSettingsInput
        {
            DollarRate = DollarRate,
            DollarIncreasePercent = Settings.DollarIncreasePercent,
            VatPercent = Settings.VatRate * 100m,
            GlobalProfitPercent = Settings.GlobalProfitPercent,
            CashPaymentDiscountPercent = Settings.CashPaymentDiscountPercent,
            ForeignTransportPerContainerUsd = Settings.ForeignTransportPerContainerUsd,
            DomesticTransportPerContainerRial = Settings.DomesticTransportPerContainerRial,
            DollarRefreshDays = Settings.DollarRefreshDays,
            GoodsRefreshDays = Settings.GoodsRefreshDays,
            ServicesRefreshDays = Settings.ServicesRefreshDays,
            EnforceAnalysisSelectionScope = Settings.EnforceAnalysisSelectionScope
        };

        _settings.Update(input, refreshDollarTimestamp: true);
        _materials.RecalculateDollarPrices(input.EffectiveDollarRate);
        return RedirectToPage(new { saved = "dollar" });
    }

    public IActionResult OnPostSavePrices()
    {
        LoadPage();
        if (!CanEditPriceRefresh)
        {
            return RedirectToPage(new { saved = "readonly" });
        }

        var validItems = OutdatedGoods.Concat(OutdatedServices)
            .ToDictionary(item => item.Id);
        var inputs = PriceInputs
            .Where(input => validItems.TryGetValue(input.Id, out var item) &&
                decimal.Round(Math.Max(0, input.Price), 0, MidpointRounding.AwayFromZero) != decimal.Round(item.Price, 0, MidpointRounding.AwayFromZero))
            .ToList();

        var updated = _materials.UpdatePrices(inputs, Settings.EffectiveDollarRate);
        return RedirectToPage(new { saved = updated > 0 ? "prices" : "none" });
    }

    public IActionResult OnPostExtendValidity()
    {
        LoadPage();
        if (!CanEditPriceRefresh)
        {
            return RedirectToPage(new { saved = "readonly" });
        }

        var ids = OutdatedGoods.Concat(OutdatedServices)
            .Select(item => item.Id)
            .ToList();
        var updated = _materials.RefreshPriceValidity(ids);
        return RedirectToPage(new { saved = updated > 0 ? "extended" : "none" });
    }

    private void LoadPage()
    {
        Settings = _settings.Get();
        DollarRate = Settings.DollarRate;
        CanEditPriceRefresh = _access.CanEdit("Materials");
        var today = DateTime.Now.Date;
        var materials = _materials.GetAll(take: 5000);
        OutdatedGoods = materials
            .Where(item => IsGoodsKind(item.Kind) && IsExpired(item.LastEditedAt, Settings.GoodsRefreshDays, today))
            .ToList();
        OutdatedServices = materials
            .Where(item => item.Kind == "خدمت" && IsExpired(item.LastEditedAt, Settings.ServicesRefreshDays, today))
            .ToList();
        IsDollarOutdated = IsExpired(Settings.DollarUpdatedAt, Settings.DollarRefreshDays, today);
        SuccessMessage = Request.Query["saved"].ToString() switch
        {
            "dollar" => "نرخ دلار بروز شد.",
            "prices" => "قیمت‌های واردشده بروز شدند.",
            "extended" => "اعتبار قیمت‌های لیست با همان قیمت قبلی تمدید شد.",
            "none" => "موردی برای ذخیره پیدا نشد.",
            "readonly" => "شما دسترسی ویرایش قیمت کالا و خدمات را ندارید.",
            _ => null
        };
        ErrorMessage = Request.Query.ContainsKey("accessDenied")
            ? "شما دسترسی لازم برای مشاهده یا ویرایش این بخش را ندارید."
            : null;
    }

    private static bool IsExpired(DateTime lastEditedAt, int validDays, DateTime today)
    {
        var normalizedValidDays = Math.Max(1, validDays);
        var normalizedLastEditedAt = lastEditedAt == default ? today : lastEditedAt;
        var lastEditedDate = normalizedLastEditedAt.Kind == DateTimeKind.Utc
            ? normalizedLastEditedAt.ToLocalTime().Date
            : normalizedLastEditedAt.Date;
        return lastEditedDate.AddDays(normalizedValidDays) <= today;
    }

    private static bool IsGoodsKind(string kind)
    {
        return kind is "نخ" or "پارچه" or "کالا";
    }

    public static string Money(decimal value) => string.Format("{0:N0}", value);

    public static string PersianDate(DateTime value)
    {
        var local = value.Kind == DateTimeKind.Utc ? value.ToLocalTime() : value;
        var calendar = new PersianCalendar();
        return $"{calendar.GetYear(local):0000}/{calendar.GetMonth(local):00}/{calendar.GetDayOfMonth(local):00}";
    }
}
