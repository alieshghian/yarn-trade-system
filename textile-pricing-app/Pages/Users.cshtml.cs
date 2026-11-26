using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using TextilePricingApp.Models;
using TextilePricingApp.Services;

namespace TextilePricingApp.Pages;

public class UsersModel : PageModel
{
    private readonly AuthRepository _auth;

    public UsersModel(AuthRepository auth)
    {
        _auth = auth;
    }

    [BindProperty(SupportsGet = true)]
    public int? EditId { get; set; }

    [BindProperty]
    public UserEditInput Input { get; set; } = new();

    public IReadOnlyList<AppUser> Users { get; private set; } = [];
    public IReadOnlyList<AppRole> Roles { get; private set; } = [];
    public IReadOnlyList<int> SelectedRoleIds { get; private set; } = [];
    public bool Saved { get; private set; }

    public void OnGet()
    {
        LoadPage();
    }

    public IActionResult OnPostSave()
    {
        if (string.IsNullOrWhiteSpace(Input.UserName))
        {
            ModelState.AddModelError("Input.UserName", "نام کاربری الزامی است.");
        }

        if (Input.Id == 0 && string.IsNullOrWhiteSpace(Input.Password))
        {
            ModelState.AddModelError("Input.Password", "رمز عبور برای کاربر جدید الزامی است.");
        }

        ValidateDuplicateUserName();

        if (!ModelState.IsValid)
        {
            LoadPage();
            return Page();
        }

        var id = _auth.SaveUser(Input);
        return RedirectToPage(new { EditId = id, saved = true });
    }

    public IActionResult OnPostDelete(int id)
    {
        _auth.DeleteUser(id);
        return RedirectToPage();
    }

    private void LoadPage()
    {
        Users = _auth.GetUsers();
        Roles = _auth.GetRoles();
        Saved = Request.Query.ContainsKey("saved");
        if (EditId is > 0)
        {
            var user = _auth.GetById(EditId.Value);
            if (user is not null)
            {
                SelectedRoleIds = _auth.GetUserRoleIds(user.Id);
                Input = new UserEditInput
                {
                    Id = user.Id,
                    UserName = user.UserName,
                    DisplayName = user.DisplayName,
                    IsActive = user.IsActive,
                    IsAdmin = user.IsAdmin,
                    RoleIds = SelectedRoleIds.ToList()
                };
                return;
            }
        }

        Input = new UserEditInput { IsActive = true };
        SelectedRoleIds = [];
    }

    private void ValidateDuplicateUserName()
    {
        if (string.IsNullOrWhiteSpace(Input.UserName))
        {
            return;
        }

        var duplicateUser = _auth.GetByUserName(Input.UserName);
        if (duplicateUser is not null && duplicateUser.Id != Input.Id)
        {
            ModelState.AddModelError("Input.UserName", "کاربر دیگری با این نام کاربری قبلا ثبت شده است.");
        }
    }
}
