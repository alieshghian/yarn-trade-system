using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using System.Security.Cryptography;
using System.Security.Claims;
using TextilePricingApp.Services;

namespace TextilePricingApp.Pages;

public class LoginModel : PageModel
{
    private readonly AuthRepository _auth;

    public LoginModel(AuthRepository auth)
    {
        _auth = auth;
    }

    [BindProperty]
    public string UserName { get; set; } = "";

    [BindProperty]
    public string Password { get; set; } = "";

    [BindProperty]
    public string CaptchaCode { get; set; } = "";

    [BindProperty(SupportsGet = true)]
    public string? ReturnUrl { get; set; }

    public string CaptchaQuestion { get; private set; } = "";

    public void OnGet()
    {
        if (User.Identity?.IsAuthenticated == true)
        {
            Response.Redirect(string.IsNullOrWhiteSpace(ReturnUrl) ? "/Home" : ReturnUrl);
            return;
        }

        GenerateCaptcha();
    }

    public async Task<IActionResult> OnPostAsync()
    {
        var expected = HttpContext.Session.GetString("LoginCaptcha") ?? "";
        if (!string.Equals(CaptchaCode.Trim(), expected, StringComparison.OrdinalIgnoreCase))
        {
            ModelState.AddModelError("CaptchaCode", "کد امنیتی درست نیست.");
            GenerateCaptcha();
            return Page();
        }

        var user = _auth.ValidateUser(UserName, Password);
        if (user is null)
        {
            ModelState.AddModelError("", "نام کاربری یا رمز عبور درست نیست.");
            GenerateCaptcha();
            return Page();
        }

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Name, user.UserName),
            new("DisplayName", string.IsNullOrWhiteSpace(user.DisplayName) ? user.UserName : user.DisplayName),
            new("IsAdmin", user.IsAdmin ? "true" : "false")
        };
        var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
        await HttpContext.SignInAsync(
            CookieAuthenticationDefaults.AuthenticationScheme,
            new ClaimsPrincipal(identity),
            new AuthenticationProperties { IsPersistent = true });

        return LocalRedirect(IsLocalReturnUrl(ReturnUrl) ? ReturnUrl! : "/Home");
    }

    private void GenerateCaptcha()
    {
        const string alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
        var characters = new char[6];
        for (var index = 0; index < characters.Length; index++)
        {
            characters[index] = alphabet[RandomNumberGenerator.GetInt32(alphabet.Length)];
        }
        var code = new string(characters);
        HttpContext.Session.SetString("LoginCaptcha", code);
        CaptchaQuestion = code;
    }

    private static bool IsLocalReturnUrl(string? returnUrl)
    {
        return !string.IsNullOrWhiteSpace(returnUrl) &&
            Uri.TryCreate(returnUrl, UriKind.Relative, out _);
    }
}
