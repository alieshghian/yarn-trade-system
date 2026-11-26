using System.Diagnostics;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.Data.Sqlite;

namespace TextilePricingApp.Pages;

[ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
[IgnoreAntiforgeryToken]
public class ErrorModel : PageModel
{
    public string? RequestId { get; set; }

    public bool ShowRequestId => !string.IsNullOrEmpty(RequestId);
    public int HttpStatusCode { get; private set; }
    public string Title { get; private set; } = "خطای سیستم";
    public string Message { get; private set; } = "در انجام عملیات مشکلی پیش آمد. لطفا دوباره تلاش کنید.";
    public string? Hint { get; private set; }
    public bool CanGoBack { get; private set; }

    private readonly ILogger<ErrorModel> _logger;

    public ErrorModel(ILogger<ErrorModel> logger)
    {
        _logger = logger;
    }

    public void OnGet()
    {
        RequestId = Activity.Current?.Id ?? HttpContext.TraceIdentifier;
        HttpStatusCode = ResolveStatusCode();
        CanGoBack = !string.IsNullOrWhiteSpace(Request.Headers.Referer);

        var exceptionFeature = HttpContext.Features.Get<IExceptionHandlerPathFeature>();
        if (exceptionFeature?.Error is not null)
        {
            ApplyExceptionMessage(exceptionFeature.Error);
            _logger.LogError(exceptionFeature.Error, "Unhandled error on {Path}. RequestId: {RequestId}", exceptionFeature.Path, RequestId);
            return;
        }

        ApplyStatusCodeMessage(HttpStatusCode);
    }

    private int ResolveStatusCode()
    {
        var statusCodeFeature = HttpContext.Features.Get<IStatusCodeReExecuteFeature>();
        if (int.TryParse(Request.Query["statusCode"], out var queryStatusCode))
        {
            return queryStatusCode;
        }

        return statusCodeFeature is not null && Response.StatusCode >= 400
            ? Response.StatusCode
            : StatusCodes.Status500InternalServerError;
    }

    private void ApplyExceptionMessage(Exception exception)
    {
        HttpStatusCode = StatusCodes.Status500InternalServerError;
        switch (exception)
        {
            case SqliteException sqlite when sqlite.SqliteErrorCode == 19:
                Title = "اطلاعات تکراری یا ناسازگار است";
                Message = "این عملیات با داده‌های موجود سازگار نیست. احتمال دارد رکورد مشابهی قبلا ثبت شده باشد یا حذف این مورد به اطلاعات دیگری وابسته باشد.";
                Hint = "اطلاعات واردشده را بررسی کنید و در صورت نیاز ابتدا رکوردهای وابسته را اصلاح کنید.";
                break;
            case SqliteException sqlite when sqlite.SqliteErrorCode is 5 or 6:
                Title = "پایگاه داده در حال استفاده است";
                Message = "در حال حاضر پایگاه داده مشغول است و عملیات کامل نشد.";
                Hint = "چند لحظه بعد دوباره تلاش کنید.";
                break;
            case SqliteException:
                Title = "خطای پایگاه داده";
                Message = "در خواندن یا ذخیره اطلاعات مشکلی پیش آمد.";
                Hint = "اگر این پیام تکرار شد، کد پیگیری را برای بررسی فنی نگه دارید.";
                break;
            case UnauthorizedAccessException:
                Title = "دسترسی کافی نیست";
                Message = "شما اجازه انجام این عملیات را ندارید.";
                Hint = "در صورت نیاز، سطح دسترسی کاربر را از بخش مدیریت کاربران بررسی کنید.";
                break;
            case InvalidOperationException:
                Title = "عملیات قابل انجام نیست";
                Message = "این عملیات در وضعیت فعلی سیستم قابل انجام نیست.";
                Hint = "اطلاعات صفحه را بازبینی کنید و دوباره تلاش کنید.";
                break;
            default:
                Title = "خطای پیش‌بینی‌نشده";
                Message = "در انجام عملیات مشکلی پیش آمد و درخواست کامل نشد.";
                Hint = "لطفا دوباره تلاش کنید. اگر مشکل تکرار شد، کد پیگیری را برای بررسی نگه دارید.";
                break;
        }
    }

    private void ApplyStatusCodeMessage(int statusCode)
    {
        HttpStatusCode = statusCode;
        switch (statusCode)
        {
            case StatusCodes.Status400BadRequest:
                Title = "درخواست نامعتبر است";
                Message = "اطلاعات ارسال‌شده کامل یا معتبر نیست.";
                Hint = "لطفا اطلاعات فرم را بررسی کنید و دوباره ارسال کنید.";
                break;
            case StatusCodes.Status401Unauthorized:
                Title = "ورود به سیستم لازم است";
                Message = "برای مشاهده این بخش باید وارد سیستم شوید.";
                Hint = "از صفحه ورود، نام کاربری و رمز عبور خود را وارد کنید.";
                break;
            case StatusCodes.Status403Forbidden:
                Title = "دسترسی مجاز نیست";
                Message = "شما اجازه مشاهده یا ویرایش این بخش را ندارید.";
                Hint = "در صورت نیاز، دسترسی کاربر را از بخش مدیریت کاربران بررسی کنید.";
                break;
            case StatusCodes.Status404NotFound:
                Title = "صفحه پیدا نشد";
                Message = "صفحه یا رکوردی که درخواست کرده‌اید وجود ندارد یا منتقل شده است.";
                Hint = "از منوی اصلی مسیر مورد نظر را دوباره انتخاب کنید.";
                break;
            case StatusCodes.Status405MethodNotAllowed:
                Title = "روش درخواست مجاز نیست";
                Message = "این عملیات از مسیر فعلی قابل انجام نیست.";
                Hint = "صفحه را دوباره باز کنید و عملیات را از دکمه‌های داخل سیستم انجام دهید.";
                break;
            default:
                Title = "خطای سیستم";
                Message = "در پردازش درخواست مشکلی پیش آمد.";
                Hint = "اگر مشکل تکرار شد، کد پیگیری را برای بررسی نگه دارید.";
                break;
        }
    }
}

