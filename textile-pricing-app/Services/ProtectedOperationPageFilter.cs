using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace TextilePricingApp.Services;

public sealed class ProtectedOperationPageFilter : IAsyncPageFilter
{
    private static readonly HashSet<string> UnprotectedPages = new(StringComparer.OrdinalIgnoreCase)
    {
        "/Error",
        "/License",
        "/Login"
    };

    private static readonly HashSet<string> ProtectedReadPages = new(StringComparer.OrdinalIgnoreCase)
    {
        "/Print",
        "/CustomerPrint"
    };

    private readonly LicenseService _license;
    private readonly IntegrityService _integrity;

    public ProtectedOperationPageFilter(LicenseService license, IntegrityService integrity)
    {
        _license = license;
        _integrity = integrity;
    }

    public Task OnPageHandlerSelectionAsync(PageHandlerSelectedContext context) => Task.CompletedTask;

    public Task OnPageHandlerExecutionAsync(PageHandlerExecutingContext context, PageHandlerExecutionDelegate next)
    {
        var page = context.ActionDescriptor.ViewEnginePath;
        if (UnprotectedPages.Contains(page) || !IsProtectedOperation(context, page))
        {
            return next();
        }

        var integrityStatus = _integrity.GetStatus();
        if (!integrityStatus.IsValid)
        {
            context.Result = FailureResult(context, "Application integrity verification failed.", redirectToLicense: false);
            return Task.CompletedTask;
        }

        var licenseStatus = _license.GetStatus();
        if (!licenseStatus.IsValid)
        {
            context.Result = FailureResult(context, "A valid license is required for this operation.", redirectToLicense: true);
            return Task.CompletedTask;
        }

        return next();
    }

    private static bool IsProtectedOperation(PageHandlerExecutingContext context, string page)
    {
        var method = context.HttpContext.Request.Method;
        if (!HttpMethods.IsGet(method) && !HttpMethods.IsHead(method) && !HttpMethods.IsOptions(method))
        {
            return true;
        }

        var handlerName = context.HandlerMethod?.MethodInfo.Name ?? "";
        return ProtectedReadPages.Contains(page) ||
            handlerName.Contains("Print", StringComparison.OrdinalIgnoreCase) ||
            handlerName.Contains("Download", StringComparison.OrdinalIgnoreCase) ||
            handlerName.Contains("Export", StringComparison.OrdinalIgnoreCase) ||
            handlerName.Contains("Pdf", StringComparison.OrdinalIgnoreCase);
    }

    private static IActionResult FailureResult(PageHandlerExecutingContext context, string message, bool redirectToLicense)
    {
        if (string.Equals(context.HttpContext.Request.Headers.XRequestedWith, "XMLHttpRequest", StringComparison.OrdinalIgnoreCase))
        {
            return new ObjectResult(new { error = message }) { StatusCode = StatusCodes.Status423Locked };
        }

        return redirectToLicense
            ? new RedirectToPageResult("/License")
            : new RedirectToPageResult("/Error", new { statusCode = StatusCodes.Status503ServiceUnavailable });
    }
}
