using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;

namespace YarnTrade.Api.Security;

public sealed record PermissionDefinition(string Key, string Menu, string Action, string NameFa, string NameEn);

public static class PermissionCatalog
{
    public static readonly IReadOnlyList<PermissionDefinition> All =
    [
        P("dashboard.view", "dashboard", "view", "مشاهده داشبورد", "View dashboard"),
        P("persons.view", "persons", "view", "مشاهده اشخاص", "View persons"), P("persons.create", "persons", "create", "تعریف شخص", "Create person"), P("persons.edit", "persons", "edit", "ویرایش شخص", "Edit person"), P("persons.delete", "persons", "delete", "حذف شخص", "Delete person"),
        P("yarns.view", "yarns", "view", "مشاهده نخ‌ها", "View yarns"), P("yarns.create", "yarns", "create", "تعریف نخ", "Create yarn"), P("yarns.edit", "yarns", "edit", "ویرایش نخ", "Edit yarn"), P("yarns.delete", "yarns", "delete", "حذف نخ", "Delete yarn"),
        P("purchaseOrders.view", "purchaseOrders", "view", "مشاهده سفارش خرید", "View purchase orders"), P("purchaseOrders.create", "purchaseOrders", "create", "ثبت سفارش خرید", "Create purchase order"), P("purchaseOrders.edit", "purchaseOrders", "edit", "ویرایش سفارش خرید", "Edit purchase order"), P("purchaseOrders.delete", "purchaseOrders", "delete", "حذف سفارش خرید", "Delete purchase order"), P("purchaseOrders.submit", "purchaseOrders", "submit", "ارسال سفارش به بازرگانی", "Submit to commerce"),
        P("commerce.view", "commerce", "view", "مشاهده کارتابل بازرگانی", "View commerce inbox"), P("commerce.accept", "commerce", "accept", "پذیرش سفارش", "Accept order"), P("commerce.edit", "commerce", "edit", "تکمیل اطلاعات خرید", "Edit purchase details"), P("commerce.upload", "commerce", "upload", "بارگذاری مدارک خرید", "Upload documents"), P("commerce.sendToWarehouse", "commerce", "send", "ارسال خرید به انبار", "Send to warehouse"),
        P("purchases.view", "purchases", "view", "مشاهده خریدها", "View purchases"), P("purchases.create", "purchases", "create", "ثبت خرید", "Create purchase"), P("purchases.edit", "purchases", "edit", "ویرایش خرید", "Edit purchase"), P("purchases.post", "purchases", "post", "قطعی‌کردن خرید", "Post purchase"),
        P("inventory.view", "inventory", "view", "مشاهده انبار", "View inventory"), P("inventory.edit", "inventory", "edit", "عملیات انبار", "Inventory operations"),
        P("sales.view", "sales", "view", "مشاهده فروش", "View sales"), P("sales.create", "sales", "create", "ثبت فروش", "Create sale"), P("sales.edit", "sales", "edit", "ویرایش فروش", "Edit sale"), P("sales.post", "sales", "post", "قطعی‌کردن فروش", "Post sale"),
        P("finance.view", "finance", "view", "مشاهده دریافت و پرداخت", "View finance"), P("finance.create", "finance", "create", "ثبت دریافت و پرداخت", "Create finance document"), P("finance.edit", "finance", "edit", "ویرایش دریافت و پرداخت", "Edit finance document"), P("finance.post", "finance", "post", "قطعی‌کردن سند مالی", "Post finance document"),
        P("checks.view", "checks", "view", "مشاهده چک‌ها", "View checks"), P("checks.create", "checks", "create", "ثبت چک", "Create check"), P("checks.edit", "checks", "edit", "عملیات چک", "Check operations"),
        P("partners.view", "partners", "view", "مشاهده شرکا", "View partners"), P("partners.edit", "partners", "edit", "عملیات شرکا", "Partner operations"),
        P("reports.view", "reports", "view", "مشاهده گزارش‌ها", "View reports"),
        P("dataBackup.view", "dataBackup", "view", "مشاهده تهیه و بازخوانی اطلاعات", "View backup & restore"), P("dataBackup.create", "dataBackup", "create", "تهیه نسخه پشتیبان", "Create backup"), P("dataBackup.restore", "dataBackup", "restore", "بازخوانی نسخه پشتیبان", "Restore backup"),
        P("settings.view", "settings", "view", "مشاهده تنظیمات", "View settings"), P("settings.edit", "settings", "edit", "ویرایش تنظیمات", "Edit settings"),
        P("users.view", "users", "view", "مشاهده کاربران", "View users"), P("users.create", "users", "create", "تعریف کاربر", "Create user"), P("users.edit", "users", "edit", "ویرایش کاربر", "Edit user"), P("users.resetPassword", "users", "resetPassword", "تغییر رمز عبور", "Reset password"), P("users.permissions", "users", "permissions", "تغییر نقش و اختیارات", "Change roles and permissions")
    ];

    public static HashSet<string> Defaults(IEnumerable<string> roles)
    {
        var result = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "dashboard.view" };
        foreach (var role in roles)
        {
            if (role is "Administrator" or "Manager") return All.Select(x => x.Key).ToHashSet(StringComparer.OrdinalIgnoreCase);
            AddRole(result, role);
        }
        return result;
    }

    private static void AddRole(HashSet<string> set, string role)
    {
        string[] prefixes = role switch
        {
            "Orders" => ["persons.view", "yarns.view", "purchaseOrders."],
            "Commerce" => ["persons.view", "yarns.view", "purchaseOrders.view", "commerce.", "purchases.view", "inventory.view"],
            "WarehouseOperator" => ["persons.view", "yarns.view", "inventory."],
            "FinanceOperator" => ["persons.", "finance.", "checks.", "partners.view", "reports.view"],
            "SalesOperator" => ["persons.view", "yarns.view", "inventory.view", "sales."],
            "Seller" => ["persons.view", "yarns.view", "inventory.view", "sales."],
            "Partner" => ["partners.view", "reports.view"],
            "PurchaseOperator" => ["persons.view", "yarns.view", "purchases.", "inventory.view"],
            "ReportViewer" => ["reports.view", "inventory.view", "purchases.view", "sales.view", "finance.view", "checks.view", "partners.view"],
            _ => []
        };
        foreach (var permission in All.Where(x => prefixes.Any(prefix => prefix.EndsWith('.') ? x.Key.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) : x.Key.Equals(prefix, StringComparison.OrdinalIgnoreCase))))
            set.Add(permission.Key);
    }

    private static PermissionDefinition P(string key, string menu, string action, string fa, string en) => new(key, menu, action, fa, en);
}

public sealed class PermissionService(AppDbContext db, UserManager<AppUser> userManager)
{
    public async Task<HashSet<string>> GetEffectiveAsync(ClaimsPrincipal principal, CancellationToken ct = default)
    {
        var rawId = principal.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!Guid.TryParse(rawId, out var userId)) return [];
        var user = await userManager.FindByIdAsync(rawId);
        if (user is null || !user.IsActive) return [];
        var roles = await userManager.GetRolesAsync(user);
        var effective = PermissionCatalog.Defaults(roles);
        var overrides = await db.UserPermissions.AsNoTracking().Where(x => x.UserId == userId).ToListAsync(ct);
        foreach (var item in overrides)
            if (item.IsGranted) effective.Add(item.PermissionKey); else effective.Remove(item.PermissionKey);
        return effective;
    }
}

public sealed class PermissionGuardMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, PermissionService permissions)
    {
        if (context.User.Identity?.IsAuthenticated == true)
        {
            var required = Resolve(context.Request);
            if (required is not null)
            {
                var effective = await permissions.GetEffectiveAsync(context.User, context.RequestAborted);
                if (!effective.Contains(required))
                {
                    context.Response.StatusCode = StatusCodes.Status403Forbidden;
                    await context.Response.WriteAsJsonAsync(new { error = "شما مجوز انجام این عملیات را ندارید.", permission = required }, context.RequestAborted);
                    return;
                }
            }
        }
        await next(context);
    }

    private static string? Resolve(HttpRequest request)
    {
        var path = request.Path.Value?.ToLowerInvariant() ?? "";
        if (!path.StartsWith("/api/") || path.StartsWith("/api/auth") || path == "/api/user-access" || path.StartsWith("/api/user-settings") || path.StartsWith("/api/presence")) return null;
        var menu = path switch
        {
            var x when x.StartsWith("/api/work-items") => "dashboard",
            var x when x.StartsWith("/api/users") => "users",
            var x when x.StartsWith("/api/master-data/persons") || x.StartsWith("/api/sequence-suggestions/person") => "persons",
            var x when x.StartsWith("/api/master-data/parameters") => "persons",
            var x when x.StartsWith("/api/master-data/yarn") || x.StartsWith("/api/yarns") || x.StartsWith("/api/sequence-suggestions/yarn") => "yarns",
            var x when x.StartsWith("/api/purchase-orders") || x.StartsWith("/api/sequence-suggestions/purchase-order") => "purchaseOrders",
            var x when x.StartsWith("/api/commerce") || x.StartsWith("/api/attachments") => "commerce",
            var x when x.StartsWith("/api/purchases") => "purchases",
            var x when x.StartsWith("/api/inventory") || x.StartsWith("/api/master-data/warehouses") => "inventory",
            var x when x.StartsWith("/api/master-data/exchange-rates") => "finance",
            var x when x.StartsWith("/api/sales") => "sales",
            var x when x.StartsWith("/api/finance/check") => "checks",
            var x when x.StartsWith("/api/finance/partner") => "partners",
            var x when x.StartsWith("/api/finance") => "finance",
            var x when x.StartsWith("/api/reports") => "reports",
            var x when x.StartsWith("/api/system-backup") => "dataBackup",
            _ => null
        };
        if (menu is null) return null;
        var method = request.Method;
        if (menu == "dashboard") return "dashboard.view";
        if (menu == "dataBackup" && path.EndsWith("/restore")) return "dataBackup.restore";
        if (method == HttpMethods.Get) return $"{menu}.view";
        if (path.StartsWith("/api/attachments") && method == HttpMethods.Delete) return "commerce.upload";
        if (method == HttpMethods.Delete) return $"{menu}.delete";
        if (path.StartsWith("/api/attachments")) return $"{menu}.upload";
        if (path.Contains("/send-to-warehouse")) return "commerce.sendToWarehouse";
        if (path.EndsWith("/accept")) return "commerce.accept";
        if (menu == "commerce" && path.EndsWith("/import")) return "commerce.upload";
        if (menu == "commerce" && method == HttpMethods.Post) return "commerce.edit";
        if (path.EndsWith("/submit")) return "purchaseOrders.submit";
        if (path.Contains("/transition") && menu == "checks") return "checks.edit";
        if (path.EndsWith("/post") || path.EndsWith("/reverse")) return $"{menu}.post";
        if (menu == "inventory" && method == HttpMethods.Post) return "inventory.edit";
        return method == HttpMethods.Put || method == HttpMethods.Patch ? $"{menu}.edit" : $"{menu}.create";
    }
}
