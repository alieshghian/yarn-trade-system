using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using TextilePricingApp.Models;
using TextilePricingApp.Services;

namespace TextilePricingApp.Pages;

public class ProfitTiersModel : PageModel
{
    private readonly ProfitTierRepository _profitTiers;

    public ProfitTiersModel(ProfitTierRepository profitTiers)
    {
        _profitTiers = profitTiers;
    }

    [BindProperty(SupportsGet = true)]
    public int? EditId { get; set; }

    [BindProperty]
    public RateTierInput Input { get; set; } = new();

    public IReadOnlyList<RateTier> Items { get; private set; } = [];
    public string FormTitle { get; private set; } = "افزودن دسته سود";

    public void OnGet()
    {
        LoadPage();
    }

    public IActionResult OnPostSave()
    {
        ValidateInput();
        if (!ModelState.IsValid)
        {
            LoadPage();
            return Page();
        }

        if (Input.Id > 0)
        {
            _profitTiers.Update(Input);
        }
        else
        {
            _profitTiers.Add(Input);
        }

        return RedirectToPage();
    }

    public IActionResult OnPostDelete(int id)
    {
        _profitTiers.Delete(id);
        return RedirectToPage();
    }

    private void LoadPage()
    {
        if (EditId is > 0)
        {
            var tier = _profitTiers.GetById(EditId.Value);
            if (tier is not null)
            {
                Input = new RateTierInput
                {
                    Id = tier.Id,
                    CategoryName = tier.CategoryName,
                    Percent = tier.Percent
                };
                FormTitle = "ویرایش دسته سود";
            }
        }

        Items = _profitTiers.GetAll();
    }

    private void ValidateInput()
    {
        if (string.IsNullOrWhiteSpace(Input.CategoryName))
        {
            ModelState.AddModelError("Input.CategoryName", "نام دسته الزامی است.");
        }

        if (Input.Percent < 0)
        {
            ModelState.AddModelError("Input.Percent", "درصد سود نمی‌تواند منفی باشد.");
        }
    }
}
