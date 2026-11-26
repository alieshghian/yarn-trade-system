using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using TextilePricingApp.Models;
using TextilePricingApp.Services;

namespace TextilePricingApp.Pages;

public class ProductGroupsModel : PageModel
{
    private readonly ProductGroupRepository _productGroups;

    public ProductGroupsModel(ProductGroupRepository productGroups)
    {
        _productGroups = productGroups;
    }

    [BindProperty(SupportsGet = true)]
    public int? EditId { get; set; }

    [BindProperty]
    public ProductGroupInput Input { get; set; } = new();

    public IReadOnlyList<ProductGroup> Items { get; private set; } = [];
    public string FormTitle { get; private set; } = "افزودن گروه محصول";

    public void OnGet()
    {
        LoadPage();
    }

    public IActionResult OnPostSave()
    {
        ValidateInput();
        ValidateDuplicateName();
        if (!ModelState.IsValid)
        {
            LoadPage();
            return Page();
        }

        if (Input.Id > 0)
        {
            _productGroups.Update(Input);
        }
        else
        {
            _productGroups.Add(Input);
        }

        return RedirectToPage();
    }

    public IActionResult OnPostDelete(int id)
    {
        var group = _productGroups.GetById(id);
        if (group is not null && _productGroups.IsInUse(group.Name))
        {
            ModelState.AddModelError(string.Empty, "این گروه در محصولات استفاده شده و قابل حذف نیست.");
            LoadPage();
            return Page();
        }

        _productGroups.Delete(id);
        return RedirectToPage();
    }

    private void LoadPage()
    {
        if (EditId is > 0)
        {
            var group = _productGroups.GetById(EditId.Value);
            if (group is not null)
            {
                Input = new ProductGroupInput
                {
                    Id = group.Id,
                    Name = group.Name
                };
                FormTitle = "ویرایش گروه محصول";
            }
        }

        Items = _productGroups.GetAll();
    }

    private void ValidateInput()
    {
        if (string.IsNullOrWhiteSpace(Input.Name))
        {
            ModelState.AddModelError("Input.Name", "نام گروه محصول الزامی است.");
        }
    }

    private void ValidateDuplicateName()
    {
        if (string.IsNullOrWhiteSpace(Input.Name))
        {
            return;
        }

        var duplicateName = _productGroups.GetAll()
            .Any(item => item.Id != Input.Id &&
                string.Equals(item.Name.Trim(), Input.Name.Trim(), StringComparison.CurrentCultureIgnoreCase));
        if (duplicateName)
        {
            ModelState.AddModelError("Input.Name", "گروه محصول دیگری با این نام قبلا ثبت شده است.");
        }
    }
}
