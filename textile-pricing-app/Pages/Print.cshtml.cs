using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using System.Globalization;
using TextilePricingApp.Models;
using TextilePricingApp.Services;

namespace TextilePricingApp.Pages;

public class PrintModel : PageModel
{
    private readonly PricingService _pricing;

    public PrintModel(PricingService pricing)
    {
        _pricing = pricing;
    }

    [BindProperty(SupportsGet = true)]
    public string? ProductCode { get; set; }

    public ProductCalculation Calculation { get; private set; } = new();
    public DateTime ReportDate { get; private set; }
    public string ReportDateText { get; private set; } = "";

    public IActionResult OnGet()
    {
        Calculation = _pricing.Calculate(ProductCode);
        if (string.IsNullOrWhiteSpace(Calculation.Recipe.Code))
        {
            return NotFound();
        }

        ProductCode = Calculation.Recipe.Code;
        ReportDate = DateTime.Today;
        ReportDateText = ToPersianDate(ReportDate);
        return Page();
    }

    private static string ToPersianDate(DateTime date)
    {
        var calendar = new PersianCalendar();
        return string.Create(CultureInfo.InvariantCulture, $"{calendar.GetYear(date):0000}/{calendar.GetMonth(date):00}/{calendar.GetDayOfMonth(date):00}");
    }
}
