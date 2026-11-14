using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using YarnTrade.Api.Services;

namespace YarnTrade.Api.Security;

public sealed class WarehouseZoneEditorAttribute() : TypeFilterAttribute(typeof(WarehouseZoneEditorFilter));
public sealed class WarehouseZoneEditorFilter(WarehouseZoneEditSessions sessions) : IAsyncActionFilter
{
    public const string Header = "X-Warehouse-Zone-Session";
    public static string Actor(HttpContext context) => context.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "";
    public static ConflictObjectResult Denied() => new(new { code = "ZONE_EDITOR_SESSION_REQUIRED", error = "ویرایش زون‌های این انبار در نشست دیگری فعال است یا مهلت نشست شما پایان یافته است. دوباره وارد تعریف زون‌ها شوید؛ متن‌های ثبت‌نشده محفوظ‌اند." });
    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var id = context.ActionArguments.TryGetValue("id", out var value) && value is Guid guid ? guid : Guid.Empty;
        var allowed = await sessions.Use(id, Actor(context.HttpContext), context.HttpContext.Request.Headers[Header].ToString(), async () => { await next(); return true; }, () => false, context.HttpContext.RequestAborted);
        if (!allowed) context.Result = Denied();
    }
}
