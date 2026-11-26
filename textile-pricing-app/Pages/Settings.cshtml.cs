using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using System.Globalization;
using TextilePricingApp.Models;
using TextilePricingApp.Services;

namespace TextilePricingApp.Pages;

public class SettingsModel : PageModel
{
    private readonly SettingsRepository _settings;
    private readonly MaterialRepository _materials;
    private readonly SemiFinishedMaterialService _semiFinishedMaterials;
    private readonly RubikaBotService _rubika;
    private readonly RubikaDispatchRepository _dispatches;
    public RubikaBotState RubikaState { get; private set; } = new();
    public string? RubikaMessage { get; private set; }

    public SettingsModel(
        SettingsRepository settings,
        MaterialRepository materials,
        SemiFinishedMaterialService semiFinishedMaterials,
        RubikaBotService rubika, RubikaDispatchRepository dispatches)
    {
        _settings = settings;
        _materials = materials;
        _semiFinishedMaterials = semiFinishedMaterials;
        _rubika = rubika;
        _dispatches = dispatches;
    }

    [BindProperty]
    public PricingSettingsInput Input { get; set; } = new();

    public string SourceFile { get; private set; } = "";
    public bool Saved { get; private set; }
    public DateTime DollarUpdatedAt { get; private set; }

    public void OnGet()
    {
        LoadPage();
    }

    public async Task<IActionResult> OnPostRubikaBotAsync(string botToken)
        => await RubikaOperation(() => _rubika.ConnectAsync(botToken, HttpContext.RequestAborted), "ربات روبیکا متصل شد. اکنون لینک اتصال مشتریان را در صفحهٔ مشتریان بسازید.");
    public IActionResult OnPostRubikaCode() => StatusCode(410);
    public IActionResult OnPostRubikaVerify() => StatusCode(410);
    public async Task<IActionResult> OnPostRubikaDisconnectAsync()
        => await RubikaOperation(() => { _rubika.Disconnect(); return Task.CompletedTask; }, "اتصال ربات از برنامه قطع شد.");

    private async Task<IActionResult> RubikaOperation(Func<Task> action, string success)
    {
        if (!User.HasClaim("IsAdmin", "true")) return Forbid();
        await _rubika.ControlGate.WaitAsync(HttpContext.RequestAborted);
        try
        {
            if (_dispatches.Active()) throw new InvalidOperationException("تا پایان ارسال، حساب ارسال‌کننده قابل تغییر نیست.");
            await action();
            RubikaMessage = success;
        }
        catch (InvalidOperationException e) { RubikaMessage = e.Message; }
        finally { _rubika.ControlGate.Release(); }
        LoadPage();
        // Never redisplay OTP or second-factor password after posting.
        ModelState.Clear();
        return Page();
    }

    public IActionResult OnPostSave()
    {
        Input.DollarRate = decimal.Round(Input.DollarRate, 0, MidpointRounding.AwayFromZero);
        Input.DollarIncreasePercent = decimal.Round(Input.DollarIncreasePercent, 2, MidpointRounding.AwayFromZero);
        Input.ForeignTransportPerContainerUsd = decimal.Round(Input.ForeignTransportPerContainerUsd, 2, MidpointRounding.AwayFromZero);
        Input.DomesticTransportPerContainerRial = decimal.Round(Input.DomesticTransportPerContainerRial, 0, MidpointRounding.AwayFromZero);
        Input.DollarRefreshDays = Math.Max(1, Input.DollarRefreshDays);
        Input.GoodsRefreshDays = Math.Max(1, Input.GoodsRefreshDays);
        Input.ServicesRefreshDays = Math.Max(1, Input.ServicesRefreshDays);
        Input.PriceChangeConfirmationThresholdPercent = decimal.Round(Math.Max(0, Input.PriceChangeConfirmationThresholdPercent), 2, MidpointRounding.AwayFromZero);
        ValidateInput();
        if (!ModelState.IsValid)
        {
            LoadPage();
            return Page();
        }

        _settings.Update(Input);
        _materials.RecalculateDollarPrices(Input.EffectiveDollarRate);
        _semiFinishedMaterials.SynchronizeAll();
        return RedirectToPage(new { saved = true });
    }

    private void LoadPage()
    {
        RubikaState = _rubika.State();
        var current = _settings.Get();
        Input = new PricingSettingsInput
        {
            CompanyName = current.CompanyName,
            DollarRate = current.DollarRate,
            DollarIncreasePercent = current.DollarIncreasePercent,
            VatPercent = current.VatRate * 100m,
            GlobalProfitPercent = current.GlobalProfitPercent,
            CashPaymentDiscountPercent = current.CashPaymentDiscountPercent,
            ForeignTransportPerContainerUsd = current.ForeignTransportPerContainerUsd,
            DomesticTransportPerContainerRial = current.DomesticTransportPerContainerRial,
            DollarRefreshDays = current.DollarRefreshDays,
            GoodsRefreshDays = current.GoodsRefreshDays,
            ServicesRefreshDays = current.ServicesRefreshDays,
            PriceChangeConfirmationThresholdPercent = current.PriceChangeConfirmationThresholdPercent,
            EnforceAnalysisSelectionScope = current.EnforceAnalysisSelectionScope
        };
        DollarUpdatedAt = current.DollarUpdatedAt;
        SourceFile = current.SourceFile;
        Saved = Request.Query.ContainsKey("saved");
    }

    private void ValidateInput()
    {
        if ((Input.CompanyName ?? "").Trim().Length > 60)
            ModelState.AddModelError("Input.CompanyName", "نام شرکت حداکثر ۶۰ کاراکتر باشد.");
        if (Input.GlobalProfitPercent < 0)
        {
            ModelState.AddModelError("Input.GlobalProfitPercent", "سود محصولات نمی‌تواند منفی باشد.");
        }

        if (Input.DollarRate < 0)
        {
            ModelState.AddModelError("Input.DollarRate", "نرخ دلار نمی‌تواند منفی باشد.");
        }

        if (Input.DollarIncreasePercent < 0)
        {
            ModelState.AddModelError("Input.DollarIncreasePercent", "درصد افزایش دلار نمی‌تواند منفی باشد.");
        }

        if (Input.VatPercent < 0)
        {
            ModelState.AddModelError("Input.VatPercent", "مالیات بر ارزش افزوده نمی‌تواند منفی باشد.");
        }

        if (Input.CashPaymentDiscountPercent < 0 || Input.CashPaymentDiscountPercent > 100)
        {
            ModelState.AddModelError("Input.CashPaymentDiscountPercent", "درصد تخفیف پرداخت نقدی باید بین صفر تا صد باشد.");
        }

        if (Input.ForeignTransportPerContainerUsd < 0)
        {
            ModelState.AddModelError("Input.ForeignTransportPerContainerUsd", "هزینه حمل خارجی نمی‌تواند منفی باشد.");
        }

        if (Input.DomesticTransportPerContainerRial < 0)
        {
            ModelState.AddModelError("Input.DomesticTransportPerContainerRial", "هزینه حمل داخلی نمی‌تواند منفی باشد.");
        }

        if (Input.DollarRefreshDays <= 0)
        {
            ModelState.AddModelError("Input.DollarRefreshDays", "بازه بروزرسانی قیمت دلار باید بیشتر از صفر باشد.");
        }

        if (Input.GoodsRefreshDays <= 0)
        {
            ModelState.AddModelError("Input.GoodsRefreshDays", "بازه بروزرسانی قیمت کالا باید بیشتر از صفر باشد.");
        }

        if (Input.ServicesRefreshDays <= 0)
        {
            ModelState.AddModelError("Input.ServicesRefreshDays", "بازه بروزرسانی قیمت خدمات باید بیشتر از صفر باشد.");
        }

        if (Input.PriceChangeConfirmationThresholdPercent < 0)
        {
            ModelState.AddModelError("Input.PriceChangeConfirmationThresholdPercent", "آستانه تأیید تغییر قیمت نمی‌تواند منفی باشد.");
        }
    }

    public static string PersianDate(DateTime value)
    {
        var local = value.Kind == DateTimeKind.Utc ? value.ToLocalTime() : value;
        var calendar = new PersianCalendar();
        return $"{calendar.GetYear(local):0000}/{calendar.GetMonth(local):00}/{calendar.GetDayOfMonth(local):00}";
    }
}
