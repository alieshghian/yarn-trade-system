using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace TextilePricingApp.Services;

public sealed class PermissionPageFilter : IAsyncPageFilter
{
    private static readonly Dictionary<string, string> PageToForm = new(StringComparer.OrdinalIgnoreCase)
    {
        ["/Materials"] = "Materials",
        ["/MaterialUsage"] = "MaterialUsage",
        ["/Customers"] = "Customers",
        ["/CustomerProductAssignments"] = "CustomerProductAssignments",
        ["/ProfitTiers"] = "ProfitTiers",
        ["/WasteTiers"] = "WasteTiers",
        ["/ProductGroups"] = "ProductGroups",
        ["/Settings"] = "Settings",
        ["/Analyses"] = "Analyses",
        ["/Index"] = "PriceAnalysis",
        ["/TemporaryPrice"] = "TemporaryPrice",
        ["/FactoryPrices"] = "FactoryPrices",
        ["/CustomerPrices"] = "CustomerPrices",
        ["/PriceSnapshots"] = "PriceSnapshots",
        ["/AuditLogs"] = "AuditLogs",
        ["/Users"] = "Security",
        ["/Roles"] = "Security"
    };

    private static readonly HashSet<string> AnonymousPages = new(StringComparer.OrdinalIgnoreCase)
    {
        "/Login",
        "/License",
        "/Error"
    };

    private static readonly HashSet<string> PermissionFreePages = new(StringComparer.OrdinalIgnoreCase)
    {
        "/Home",
        "/Print",
        "/CustomerPrint",
        "/ChangePassword",
        "/Privacy"
    };

    private readonly AuthRepository _auth;

    public PermissionPageFilter(AuthRepository auth)
    {
        _auth = auth;
    }

    public Task OnPageHandlerSelectionAsync(PageHandlerSelectedContext context)
    {
        return Task.CompletedTask;
    }

    public Task OnPageHandlerExecutionAsync(PageHandlerExecutingContext context, PageHandlerExecutionDelegate next)
    {
        var page = context.ActionDescriptor.ViewEnginePath;
        if (AnonymousPages.Contains(page))
        {
            return next();
        }

        if (context.HttpContext.User.Identity?.IsAuthenticated != true)
        {
            context.Result = new RedirectToPageResult("/Login", new { ReturnUrl = context.HttpContext.Request.Path + context.HttpContext.Request.QueryString });
            return Task.CompletedTask;
        }

        if (PermissionFreePages.Contains(page))
        {
            return next();
        }

        if (context.HttpContext.User.HasClaim("IsAdmin", "true"))
        {
            return next();
        }

        if (!PageToForm.TryGetValue(page, out var formKey))
        {
            return next();
        }

        var userIdValue = context.HttpContext.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (!int.TryParse(userIdValue, out var userId))
        {
            context.Result = new ForbidResult();
            return Task.CompletedTask;
        }

        var access = _auth.GetAccess(userId, formKey);
        var needsEdit = !HttpMethods.IsGet(context.HttpContext.Request.Method) &&
            !HttpMethods.IsHead(context.HttpContext.Request.Method);
        if ((needsEdit && !access.CanEdit) || (!needsEdit && !access.CanView))
        {
            context.Result = new RedirectToPageResult("/Home", new { accessDenied = true });
            return Task.CompletedTask;
        }

        return next();
    }
}
