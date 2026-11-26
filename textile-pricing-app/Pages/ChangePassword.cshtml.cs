using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using System.Security.Claims;
using TextilePricingApp.Services;

namespace TextilePricingApp.Pages;

public class ChangePasswordModel : PageModel
{
    private readonly AuthRepository _auth;

    public ChangePasswordModel(AuthRepository auth)
    {
        _auth = auth;
    }

    [BindProperty]
    public string CurrentPassword { get; set; } = "";

    [BindProperty]
    public string NewPassword { get; set; } = "";

    [BindProperty]
    public string ConfirmPassword { get; set; } = "";

    public bool Saved { get; private set; }

    public void OnGet()
    {
        Saved = Request.Query.ContainsKey("saved");
    }

    public IActionResult OnPost()
    {
        var userName = User.Identity?.Name ?? "";
        var userIdValue = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!int.TryParse(userIdValue, out var userId))
        {
            return RedirectToPage("/Login");
        }

        if (_auth.ValidateUser(userName, CurrentPassword) is null)
        {
            ModelState.AddModelError("CurrentPassword", "رمز فعلی درست نیست.");
        }

        if (string.IsNullOrWhiteSpace(NewPassword) || NewPassword.Length < 4)
        {
            ModelState.AddModelError("NewPassword", "رمز جدید باید حداقل ۴ کاراکتر باشد.");
        }

        if (!string.Equals(NewPassword, ConfirmPassword, StringComparison.Ordinal))
        {
            ModelState.AddModelError("ConfirmPassword", "تکرار رمز با رمز جدید برابر نیست.");
        }

        if (!ModelState.IsValid)
        {
            return Page();
        }

        _auth.ChangePassword(userId, NewPassword);
        return RedirectToPage(new { saved = true });
    }
}
