using YarnTrade.Api.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using YarnTrade.Api.Domain;

namespace YarnTrade.Api.Controllers;

[ApiController, Route("api/user-settings"), Authorize]
public sealed class UserSettingsController(UserManager<AppUser> users, IDataScope dataScope) : ControllerBase
{
    [AuthenticatedOnly("Own account/session; record identity comes from the authenticated user.")]
    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var user = await users.GetUserAsync(User);
        if (user is null) return Unauthorized();
        return dataScope.Allows(User, new(DataScopeKind.OwnUser, user.Id)) ? Ok(ToView(user)) : Forbid();
    }

    [AuthenticatedOnly("Own account/session; record identity comes from the authenticated user.")]
    [HttpPut]
    public async Task<IActionResult> Update(UserSettingsInput input)
    {
        var error = UserSettingsRules.Validate(input);
        if (error is not null) return BadRequest(new { error });
        var user = await users.GetUserAsync(User);
        if (user is null) return Unauthorized();
        if (!dataScope.Allows(User, new(DataScopeKind.OwnUser, user.Id))) return Forbid();
        user.PreferredLanguage = input.PreferredLanguage;
        user.SessionTimeoutMinutes = input.SessionTimeoutMinutes;
        user.Theme = input.Theme;
        user.CompactMode = input.CompactMode;
        user.FontFamily = input.FontFamily;
        user.FontSize = input.FontSize;
        var result = await users.UpdateAsync(user);
        return result.Succeeded ? Ok(ToView(user)) : BadRequest(new { error = string.Join(" ", result.Errors.Select(x => x.Description)) });
    }

    [AuthenticatedOnly("Own account/session; record identity comes from the authenticated user.")]
    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword(ChangeOwnPasswordInput input)
    {
        if (string.IsNullOrWhiteSpace(input.CurrentPassword)) return BadRequest(new { error = "رمز عبور فعلی الزامی است." });
        if (string.IsNullOrWhiteSpace(input.NewPassword) || input.NewPassword.Length < 12) return BadRequest(new { error = "رمز عبور جدید باید حداقل ۱۲ نویسه باشد." });
        if (input.NewPassword != input.ConfirmPassword) return BadRequest(new { error = "تکرار رمز عبور جدید یکسان نیست." });
        if (input.CurrentPassword == input.NewPassword) return BadRequest(new { error = "رمز عبور جدید باید با رمز فعلی متفاوت باشد." });
        var user = await users.GetUserAsync(User);
        if (user is null) return Unauthorized();
        if (!dataScope.Allows(User, new(DataScopeKind.OwnUser, user.Id))) return Forbid();
        var result = await users.ChangePasswordAsync(user, input.CurrentPassword, input.NewPassword);
        return result.Succeeded ? NoContent() : BadRequest(new { error = result.Errors.Any(x => x.Code == "PasswordMismatch") ? "رمز عبور فعلی صحیح نیست." : string.Join(" ", result.Errors.Select(x => x.Description)) });
    }

    private static object ToView(AppUser user) => new
    {
        user.PreferredLanguage, user.SessionTimeoutMinutes, user.Theme, user.CompactMode, user.FontFamily, user.FontSize
    };
}

public sealed record UserSettingsInput(string PreferredLanguage, int SessionTimeoutMinutes, string Theme, bool CompactMode, string FontFamily, string FontSize);
public sealed record ChangeOwnPasswordInput(string CurrentPassword, string NewPassword, string ConfirmPassword);

public static class UserSettingsRules
{
    public static string? Validate(UserSettingsInput input)
    {
        if (input.PreferredLanguage is not ("fa" or "en" or "zh")) return "زبان انتخاب‌شده معتبر نیست.";
        if (input.SessionTimeoutMinutes is < 1 or > 480) return "زمان نشست باید بین ۱ تا ۴۸۰ دقیقه باشد.";
        if (input.Theme is not ("system" or "light" or "dark" or "ocean")) return "تم انتخاب‌شده معتبر نیست.";
        if (input.FontFamily is not ("vazirmatn" or "tahoma" or "segoe" or "arial" or "naskh")) return "فونت انتخاب‌شده معتبر نیست.";
        if (input.FontSize is not ("small" or "normal" or "large")) return "اندازه فونت انتخاب‌شده معتبر نیست.";
        return null;
    }
}
