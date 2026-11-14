using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using YarnTrade.Api.Security;
using YarnTrade.Api.Services;

namespace YarnTrade.Api.Controllers;

[ApiController, Route("api/laboratory/label-translations"), Authorize(Roles = "Administrator")]
public sealed class LabelTranslationsController(LabelTranslationService translations) : ControllerBase
{
    public sealed record Request(string Text, string SourceLanguage);
    [HttpPost, RequirePermission("formLaboratory.view"), RequestSizeLimit(4096), EnableRateLimiting("label-translations")]
    public async Task<IActionResult> Translate(Request input, CancellationToken ct)
    {
        try { return Ok(new { translations = await translations.Translate(input.Text, input.SourceLanguage, ct) }); }
        catch (LabelTranslationException error)
        {
            var status = error.Message == "INVALID_TRANSLATION_INPUT" ? 400 : error.Message == "TRANSLATION_NOT_CONFIGURED" ? 503 : 502;
            return StatusCode(status, new { code = error.Message, error = error.Message == "TRANSLATION_NOT_CONFIGURED" ? "سرویس ترجمهٔ آنلاین هنوز تنظیم نشده است؛ متن‌های فعلی حفظ شدند." : "ترجمه انجام نشد؛ متن‌های فعلی حفظ شدند." });
        }
        catch (Exception error) when (error is HttpRequestException || error is OperationCanceledException && !ct.IsCancellationRequested)
        { return StatusCode(504, new { code = "TRANSLATION_TIMEOUT", error = "سرویس ترجمه پاسخ نداد؛ دوباره تلاش کنید." }); }
    }
}
