using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using TextilePricingApp.Models;
using TextilePricingApp.Services;

namespace TextilePricingApp.Pages;

public class RolesModel : PageModel
{
    private readonly AuthRepository _auth;

    public RolesModel(AuthRepository auth)
    {
        _auth = auth;
    }

    [BindProperty(SupportsGet = true)]
    public int? EditId { get; set; }

    [BindProperty]
    public RoleEditInput Input { get; set; } = new();

    [BindProperty]
    public List<PermissionEditInput> Permissions { get; set; } = [];

    public IReadOnlyList<AppRole> Roles { get; private set; } = [];
    public IReadOnlyList<AppFormDefinition> Forms { get; private set; } = AuthRepository.Forms;
    public IReadOnlyDictionary<string, AppFormPermission> CurrentPermissions { get; private set; } = new Dictionary<string, AppFormPermission>();
    public bool Saved { get; private set; }

    public void OnGet()
    {
        LoadPage();
    }

    public IActionResult OnPostSave()
    {
        if (string.IsNullOrWhiteSpace(Input.Name))
        {
            ModelState.AddModelError("Input.Name", "نام نقش الزامی است.");
        }

        if (!ModelState.IsValid)
        {
            LoadPage();
            return Page();
        }

        var id = _auth.SaveRole(Input);
        _auth.SaveRolePermissions(id, Permissions);
        return RedirectToPage(new { EditId = id, saved = true });
    }

    public IActionResult OnPostDelete(int id)
    {
        _auth.DeleteRole(id);
        return RedirectToPage();
    }

    private void LoadPage()
    {
        Roles = _auth.GetRoles();
        Saved = Request.Query.ContainsKey("saved");
        if (EditId is > 0)
        {
            var role = Roles.FirstOrDefault(item => item.Id == EditId.Value);
            if (role is not null)
            {
                Input = new RoleEditInput { Id = role.Id, Name = role.Name };
                CurrentPermissions = _auth.GetRolePermissions(role.Id);
                return;
            }
        }

        Input = new RoleEditInput();
        CurrentPermissions = new Dictionary<string, AppFormPermission>();
    }
}
