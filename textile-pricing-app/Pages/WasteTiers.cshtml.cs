using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using TextilePricingApp.Models;
using TextilePricingApp.Services;

namespace TextilePricingApp.Pages;

public class WasteTiersModel : PageModel
{
    private readonly WasteTierRepository _wasteTiers;

    public WasteTiersModel(WasteTierRepository wasteTiers)
    {
        _wasteTiers = wasteTiers;
    }

    [BindProperty(SupportsGet = true)]
    public int? EditId { get; set; }

    [BindProperty]
    public RateTierInput Input { get; set; } = new();

    public IReadOnlyList<RateTier> Items { get; private set; } = [];
    public string FormTitle { get; private set; } = "افزودن دسته کسری و ضایعات";

    public void OnGet()
    {
        LoadPage();
    }

    public IActionResult OnPostSave()
    {
        ValidateInput();
        ValidateDuplicateCategoryName();
        if (!ModelState.IsValid)
        {
            LoadPage();
            return Page();
        }

        if (Input.Id > 0)
        {
            _wasteTiers.Update(Input);
        }
        else
        {
            _wasteTiers.Add(Input);
        }

        return RedirectToPage();
    }

    public IActionResult OnPostDelete(int id)
    {
        _wasteTiers.Delete(id);
        return RedirectToPage();
    }

    private void LoadPage()
    {
        if (EditId is > 0)
        {
            var tier = _wasteTiers.GetById(EditId.Value);
            if (tier is not null)
            {
                Input = new RateTierInput
                {
                    Id = tier.Id,
                    CategoryName = tier.CategoryName,
                    Percent = tier.Percent
                };
                FormTitle = "ویرایش دسته کسری و ضایعات";
            }
        }

        Items = _wasteTiers.GetAll();
    }

    private void ValidateInput()
    {
        if (string.IsNullOrWhiteSpace(Input.CategoryName))
        {
            ModelState.AddModelError("Input.CategoryName", "نام دسته الزامی است.");
        }

        if (Input.Percent < 0)
        {
            ModelState.AddModelError("Input.Percent", "درصد کسری و ضایعات نمی‌تواند منفی باشد.");
        }
    }

    private void ValidateDuplicateCategoryName()
    {
        if (string.IsNullOrWhiteSpace(Input.CategoryName))
        {
            return;
        }

        var duplicateName = _wasteTiers.GetAll()
            .Any(item => item.Id != Input.Id &&
                string.Equals(item.CategoryName.Trim(), Input.CategoryName.Trim(), StringComparison.CurrentCultureIgnoreCase));
        if (duplicateName)
        {
            ModelState.AddModelError("Input.CategoryName", "دسته کسری و ضایعات دیگری با این نام قبلا ثبت شده است.");
        }
    }
}
