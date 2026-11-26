using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.DataProtection;

namespace TextilePricingApp.Services;

public sealed record RubikaBotState(string Token = "", string BotId = "", string Title = "", string ShareUrl = "")
{
    public bool Connected => Token.Length > 0 && BotId.Length > 0;
    public string Sender => Connected ? "bot:" + BotId + ":" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(Token))) : "";
}

public sealed class RubikaBotService : IDisposable
{
    private readonly string _path;
    private readonly IDataProtector _protector;
    // Do not use logging handlers: the Bot API embeds credentials in the URL.
    private readonly HttpClient _http;
    public SemaphoreSlim ControlGate { get; } = new(1);
    public RubikaBotService(IWebHostEnvironment environment, IDataProtectionProvider protection)
        : this(environment, protection, new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(60) }) { }
    public RubikaBotService(IWebHostEnvironment environment, IDataProtectionProvider protection, HttpClient http)
    {
        _path = Path.Combine(environment.ContentRootPath, "App_Data", "rubika-bot.protected");
        _protector = protection.CreateProtector("RubikaBot.v1");
        _http = http;
    }
    public RubikaBotState State()
    {
        if (!File.Exists(_path)) return new();
        try { return JsonSerializer.Deserialize<RubikaBotState>(_protector.Unprotect(File.ReadAllText(_path))) ?? new(); }
        catch (CryptographicException) { throw new InvalidOperationException("توکن ربات قابل رمزگشایی نیست؛ کلیدهای App_Data/Keys را بازیابی کنید."); }
    }
    private void Save(RubikaBotState state)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
        File.WriteAllText(_path + ".tmp", _protector.Protect(JsonSerializer.Serialize(state)));
        File.Move(_path + ".tmp", _path, true);
    }
    public async Task ConnectAsync(string token, CancellationToken cancellation)
    {
        token = (token ?? "").Trim();
        if (!Regex.IsMatch(token, "^[A-Za-z0-9_:-]{16,256}$")) throw new InvalidOperationException("توکن ربات معتبر وارد کنید.");
        var data = await CallAsync(token, "getMe", new(), cancellation);
        var bot = data["bot"] ?? throw Protocol("getMe");
        var id = bot["bot_id"]?.GetValue<string>() ?? "";
        var share = bot["share_url"]?.GetValue<string>() ?? "";
        if (!SafeRubikaUrl(share))
        {
            var username = (bot["username"]?.GetValue<string>() ?? "").TrimStart('@');
            if (!Regex.IsMatch(username, "^[A-Za-z0-9_]+$")) throw Protocol("getMe");
            share = "https://rubika.ir/" + username;
        }
        if (id.Length == 0) throw Protocol("getMe");
        Save(new(token, id, bot["bot_title"]?.GetValue<string>() ?? "ربات روبیکا", share));
    }
    public void Disconnect() => Save(new());
    public static bool SafeRubikaUrl(string url) => Uri.TryCreate(url, UriKind.Absolute, out var uri) && uri.Scheme == "https" &&
        (uri.Host == "rubika.ir" || uri.Host.EndsWith(".rubika.ir", StringComparison.OrdinalIgnoreCase)) && uri.UserInfo.Length == 0 && uri.Port == 443;
    public static string Link(RubikaBotState state, string code) => state.ShareUrl.Split('?')[0] + "?st=" + Uri.EscapeDataString(code);
    public async Task<JsonObject> CallAsync(string token, string method, JsonObject input, CancellationToken cancellation)
    {
        try
        {
            using var response = await _http.PostAsJsonAsync("https://botapi.rubika.ir/v3/" + Uri.EscapeDataString(token) + "/" + method, input, cancellation);
            return await ReadAsync(response, cancellation, method);
        }
        catch (HttpRequestException) { throw new RubikaSendException("network", Stage(method) + "ارتباط با API ربات ناموفق بود؛ پیش از ارسال مجدد نتیجه را بررسی کنید."); }
        catch (OperationCanceledException) when (!cancellation.IsCancellationRequested) { throw new RubikaSendException("timeout", Stage(method) + "پاسخ ربات در زمان مقرر نرسید؛ نتیجهٔ ارسال ممکن است نامشخص باشد."); }
        catch (JsonException) { throw Protocol(method); }
    }
    private static string Stage(string method) => method switch
    {
        "requestSendFile" => "مرحلهٔ آماده‌سازی بارگذاری (requestSendFile): ",
        "upload" => "مرحلهٔ بارگذاری PDF: ",
        "sendFile" => "مرحلهٔ ارسال فایل (sendFile): ",
        "getMe" => "مرحلهٔ بررسی ربات: ",
        "getUpdates" => "مرحلهٔ دریافت درخواست اتصال: ",
        "getChat" => "مرحلهٔ بررسی چت: ",
        _ => "درخواست API ربات: "
    };
    private static async Task<JsonObject> ReadAsync(HttpResponseMessage response, CancellationToken cancellation, string method)
    {
        if (!response.IsSuccessStatusCode)
        {
            var kind = (int)response.StatusCode switch { 401 => "authentication", 403 => "permission_denied", 429 => "rate_limited", 400 => "invalid_request", _ => "temporary" };
            throw new RubikaSendException(kind, Stage(method) + $"درخواست ربات پذیرفته نشد (HTTP {(int)response.StatusCode}).");
        }
        var root = JsonNode.Parse(await response.Content.ReadAsStringAsync(cancellation)) as JsonObject ?? throw Protocol(method);
        var status = root["status"]?.GetValue<string>();
        if (status is not null && status != "OK")
        {
            var kind = status switch { "INVALID_TOKEN" => "authentication", "INVALID_INPUT" => "invalid_request", "INVALID_ACCESS" => "invalid_access", "TOO_MANY_REQUESTS" => "rate_limited", _ => "unknown" };
            // Never show arbitrary server text or URLs, which may contain credentials.
            var safeStatus = status.Length <= 64 && status.All(c => char.IsAsciiLetterOrDigit(c) || c == '_') ? status : "UNRECOGNIZED_STATUS";
            var explanation = status == "INVALID_ACCESS"
                ? "روبیکا دسترسی این درخواست را رد کرد (INVALID_ACCESS). این خطا به‌تنهایی به معنی قطع اتصال مشتری نیست؛ در ارسال فایل، دسترسی ربات و فایل در API روبیکا باید بررسی شود. این پاسخ تأیید ارسال نیست."
                : $"API ربات درخواست را نپذیرفت ({safeStatus})؛ تنظیمات یا نتیجهٔ ارسال را بررسی کنید.";
            throw new RubikaSendException(kind, Stage(method) + explanation, kind == "unknown");
        }
        return (root["data"] as JsonObject) ?? root;
    }
    private static RubikaSendException Protocol(string method = "sendFile") => new("protocol_error", Stage(method) + "پاسخ API ربات قابل پردازش نیست؛ پیش از تلاش دوباره نتیجه را بررسی کنید.");
    public async Task<string> SendAsync(string sender, string chatId, string caption, byte[]? pdf, CancellationToken cancellation)
    {
        var state = State();
        if (!state.Connected || state.Sender != sender) throw new RubikaSendException("authentication", "ربات ارسال‌کننده تغییر کرده یا متصل نیست؛ دوباره پیش‌نمایش بگیرید.");
        if (chatId.Length == 0 || pdf is null || pdf.Length == 0 || pdf.Length > 50 * 1024 * 1024) throw new RubikaSendException("invalid_request", "شناسهٔ چت یا فایل PDF معتبر نیست.");
        JsonObject upload;
        try { upload = await CallAsync(state.Token, "requestSendFile", new() { ["type"] = "File" }, cancellation); }
        catch (RubikaSendException e) { throw new RubikaSendException(e.Kind, e.Message, false); }
        var url = upload["upload_url"]?.GetValue<string>() ?? "";
        if (!SafeRubikaUrl(url)) throw new RubikaSendException("protocol_error", Stage("requestSendFile") + "آدرس بارگذاری معتبر نیست؛ فایل به مشتری ارسال نشد.", false);
        using var multipart = new MultipartFormDataContent();
        using var file = new ByteArrayContent(pdf);
        file.Headers.ContentType = new("application/pdf");
        multipart.Add(file, "file", "price-list.pdf");
        JsonObject uploaded;
        try
        {
            using var response = await _http.PostAsync(url, multipart, cancellation);
            uploaded = await ReadAsync(response, cancellation, "upload");
        }
        catch (RubikaSendException e) { throw new RubikaSendException(e.Kind, e.Message, false); }
        catch (HttpRequestException) { throw new RubikaSendException("network", Stage("upload") + "بارگذاری PDF ناموفق بود؛ فایل به مشتری ارسال نشد.", false); }
        catch (OperationCanceledException) when (!cancellation.IsCancellationRequested) { throw new RubikaSendException("timeout", Stage("upload") + "زمان بارگذاری تمام شد؛ فایل به مشتری ارسال نشد.", false); }
        catch (JsonException) { throw new RubikaSendException("protocol_error", Stage("upload") + "پاسخ بارگذاری قابل پردازش نیست؛ فایل به مشتری ارسال نشد.", false); }
        var fileId = uploaded["file_id"]?.GetValue<string>();
        if (string.IsNullOrWhiteSpace(fileId)) throw new RubikaSendException("protocol_error", Stage("upload") + "شناسهٔ فایل دریافت نشد؛ فایل به مشتری ارسال نشد.", false);
        var sent = await CallAsync(state.Token, "sendFile", new() { ["chat_id"] = chatId, ["file_id"] = fileId, ["text"] = caption }, cancellation);
        var messageId = sent["message_id"]?.GetValue<string>();
        return string.IsNullOrWhiteSpace(messageId) ? throw Protocol() : messageId;
    }
    public void Dispose() { _http.Dispose(); ControlGate.Dispose(); }
}
