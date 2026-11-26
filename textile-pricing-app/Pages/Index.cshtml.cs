using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using TextilePricingApp.Models;
using TextilePricingApp.Services;

namespace TextilePricingApp.Pages;

public class IndexModel : PageModel
{
    private readonly PricingService _pricing;

    public IndexModel(PricingService pricing)
    {
        _pricing = pricing;
    }

    [BindProperty(SupportsGet = true)]
    public string? ProductCode { get; set; }

    [BindProperty(SupportsGet = true)]
    public string? Query { get; set; }

    public PricingSettings Settings { get; private set; } = new();
    public IReadOnlyList<ProductRecipe> Products { get; private set; } = [];
    public IReadOnlyList<ProductPriceListRow> ProductRows { get; private set; } = [];
    public ProductCalculation Calculation { get; private set; } = new();

    public IActionResult OnGet()
    {
        Settings = _pricing.Settings;
        Products = _pricing.Recipes;
        var visibleProducts = Products
            .Where(product => string.IsNullOrWhiteSpace(Query) || product.Code.Contains(Query.Trim(), StringComparison.CurrentCultureIgnoreCase))
            .ToList();

        if (string.IsNullOrWhiteSpace(ProductCode) && visibleProducts.Count > 0)
        {
            ProductCode = visibleProducts[0].Code;
        }

        Calculation = _pricing.Calculate(ProductCode);
        if (!string.IsNullOrWhiteSpace(ProductCode) && string.IsNullOrWhiteSpace(Calculation.Recipe.Code))
        {
            return NotFound();
        }

        ProductCode = Calculation.Recipe.Code;
        ProductRows = visibleProducts
            .Select(product => new ProductPriceListRow(product.Code, _pricing.Calculate(product.Code).Summary.CashFinal))
            .ToList();
        return Page();
    }

    public sealed record ProductPriceListRow(string Code, decimal FinalPrice);
}
