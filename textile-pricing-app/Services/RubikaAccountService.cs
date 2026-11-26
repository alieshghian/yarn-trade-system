using System.Diagnostics;
using System.Text;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.DataProtection;

namespace TextilePricingApp.Services;

public sealed record RubikaAccountState(string Phone = "", string? Session = null, string? Challenge = null);
public sealed class RubikaAccountService(IWebHostEnvironment environment, IConfiguration configuration, IDataProtectionProvider protection, ILogger<RubikaAccountService> logger)
{
    private readonly SemaphoreSlim _gate = new(1);
    public SemaphoreSlim ControlGate { get; } = new(1);
    private readonly IDataProtector _protector = protection.CreateProtector("RubikaPersonalAccount.v1");
    private string StatePath => Path.Combine(environment.ContentRootPath, "App_Data", "rubika-account.protected");
    public string PythonPath => configuration["Rubika:PythonPath"] ?? Path.Combine(environment.ContentRootPath, "App_Data", "rubika-venv", OperatingSystem.IsWindows() ? "Scripts/python.exe" : "bin/python");
    public bool Installed => File.Exists(PythonPath) && File.Exists(Path.Combine(environment.ContentRootPath, "RubikaBridge", "bridge.py"));
    public RubikaAccountState State()
    {
        if (!File.Exists(StatePath)) return new();
        try { return System.Text.Json.JsonSerializer.Deserialize<RubikaAccountState>(_protector.Unprotect(File.ReadAllText(StatePath))) ?? new(); }
        catch (System.Security.Cryptography.CryptographicException) { throw new InvalidOperationException("اطلاعات ورود روبیکا قابل رمزگشایی نیست؛ کلیدهای App_Data/Keys را بازیابی کنید."); }
    }
    private void Save(RubikaAccountState state)
    {
        var path = StatePath + ".tmp";
        File.WriteAllText(path, _protector.Protect(System.Text.Json.JsonSerializer.Serialize(state)));
        File.Move(path, StatePath, true);
    }
    public async Task LoginAsync(string operation, string? phone, string? code, string? passKey, CancellationToken token)
    {
        await _gate.WaitAsync(token);
        try
        {
            var state = State();
            phone = operation == "verify" ? state.Phone : MobileNumber.Normalize(phone);
            if (!MobileNumber.IsValid(phone)) throw new InvalidOperationException("شماره حساب ارسال‌کننده معتبر نیست.");
            if (operation == "verify" && (state.Challenge is null || string.IsNullOrWhiteSpace(code)))
                throw new InvalidOperationException("ابتدا کد ورود را درخواست کنید.");
            if (state.Session is not null) throw new InvalidOperationException("ابتدا اتصال حساب فعلی را قطع کنید.");
            var reply = await InvokeAsync(new JsonObject {
                ["operation"] = operation, ["phone"] = phone, ["code"] = MobileNumber.Normalize(code), ["passKey"] = passKey,
                ["session"] = null, ["challenge"] = state.Challenge is null ? null : JsonNode.Parse(state.Challenge)
            }, token);
            Save(new(phone!, reply["session"]?.ToJsonString(), reply["challenge"]?.ToJsonString()));
        }
        finally { _gate.Release(); }
    }
    public async Task DisconnectAsync(CancellationToken token)
    {
        await _gate.WaitAsync(token);
        try { Save(new()); }
        finally { _gate.Release(); }
    }
    public async Task<byte[]> RenderPdfAsync(RubikaPriceDocument document, CancellationToken token)
    {
        var node = System.Text.Json.JsonSerializer.SerializeToNode(document, new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web));
        var reply = await InvokeAsync(new JsonObject { ["operation"] = "pdf", ["document"] = node }, token);
        return Convert.FromBase64String(reply["pdf"]!.GetValue<string>());
    }
    public async Task<string> SendAsync(string phone, string name, string text, CancellationToken token, byte[]? pdf = null)
    {
        await _gate.WaitAsync(token);
        try
        {
            var state = State();
            if (state.Session is null) throw new RubikaSendException("authentication", "حساب روبیکا وارد نشده است.");
            var reply = await InvokeAsync(new JsonObject {
                ["operation"] = "send", ["phone"] = phone, ["name"] = name, ["text"] = text,
                ["pdf"] = pdf is null ? null : Convert.ToBase64String(pdf),
                ["session"] = JsonNode.Parse(state.Session)
            }, token);
            return reply["messageId"]!.GetValue<string>();
        }
        finally { _gate.Release(); }
    }
    private async Task<JsonObject> InvokeAsync(JsonObject input, CancellationToken token)
    {
        var operation = input["operation"]!.GetValue<string>();
        if (operation != "pdf") throw new RubikaSendException("authentication", "اتصال حساب شخصی غیرفعال شده است؛ از ربات روبیکا استفاده کنید.");
        if (!Installed) throw Failure(operation, "dependencies");
        var start = new ProcessStartInfo(PythonPath) {
            UseShellExecute = false, CreateNoWindow = true, RedirectStandardInput = true,
            RedirectStandardOutput = true, RedirectStandardError = true,
            StandardInputEncoding = new UTF8Encoding(false), StandardOutputEncoding = Encoding.UTF8,
            WorkingDirectory = environment.ContentRootPath
        };
        start.ArgumentList.Add(Path.Combine(environment.ContentRootPath, "RubikaBridge", "bridge.py"));
        start.Environment["PYTHONUTF8"] = "1";
        using var process = new Process { StartInfo = start };
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token);
        timeout.CancelAfter(TimeSpan.FromSeconds(100));
        var started = false;
        try
        {
            process.Start();
            started = true;
            var output = process.StandardOutput.ReadToEndAsync(timeout.Token);
            var errors = process.StandardError.ReadToEndAsync(timeout.Token);
            await process.StandardInput.WriteAsync(input.ToJsonString());
            process.StandardInput.Close();
            await process.WaitForExitAsync(timeout.Token);
            var result = JsonNode.Parse(await output) as JsonObject;
            await errors; // Drain stderr but do not log potentially sensitive content.
            if (process.ExitCode != 0 || result is null) throw Failure(operation, "protocol_error");
            if (result["ok"]?.GetValue<bool>() != true)
            {
                var kind = result["kind"]?.GetValue<string>() ?? "unknown";
                throw Failure(operation, kind, result["diagnostic"] as JsonObject);
            }
            return result;
        }
        catch (OperationCanceledException)
        {
            if (started && !process.HasExited) process.Kill(true);
            throw Failure(operation, "timeout");
        }
        catch (System.ComponentModel.Win32Exception) { throw Failure(operation, "dependencies"); }
        catch (System.Text.Json.JsonException) { throw Failure(operation, "protocol_error"); }
        catch (InvalidOperationException e) when (e is not RubikaSendException) { throw Failure(operation, "protocol_error"); }
        finally { if (started && !process.HasExited) process.Kill(true); }
    }

    private RubikaSendException Failure(string operation, string kind, JsonObject? diagnostic = null)
    {
        // Defense in depth: the Python process never gets to place arbitrary strings in logs/UI.
        string Allowed(string? value, string choices) => value is not null && choices.Split('|').Contains(value) ? value : "unknown";
        string? Read(string key) => diagnostic?[key] is JsonValue value && value.TryGetValue<string>(out var text) ? text : null;
        kind = Allowed(kind, "authentication|rate_limited|permission_denied|blocked|account_restricted|invalid_request|not_found|conflict|temporary|server|network|dns_error|tls_error|connection_error|timeout|protocol_error|encryption_error|decryption_error|dependencies|unknown");
        operation = Allowed(operation, "code|verify|send|pdf");
        var exceptionTypes = "TypeError|AttributeError|ValueError|ValidationError|ImportError|ModuleNotFoundError|OSError|RubikaError|RubikaAuthError|RubikaProtocolError|RubikaApiError|ConnectError|ConnectTimeout|ReadTimeout|WriteTimeout|PoolTimeout|RemoteProtocolError|SSLError|gaierror|JSONDecodeError|InvalidSignature|InvalidTag";
        var record = new {
            Timestamp = DateTime.UtcNow.ToString("O"), Reference = Guid.NewGuid().ToString("N")[..12], Operation = operation, Kind = kind,
            Layer = Allowed(Read("layer"), "client|request|network|http|json|encryption|application|upload"),
            Code = Allowed(Read("code"), "local_auth_required|network_timeout|request_encryption_failed|not_contact_flood|invalid_auth|code_is_invalid|code_expired|sendpasskey|send_pass_key"),
            ExceptionType = Allowed(Read("exceptionType"), exceptionTypes), CauseType = Allowed(Read("causeType"), exceptionTypes),
            HttpStatus = diagnostic?["httpStatus"] is JsonValue status && status.TryGetValue<int>(out var number) && number is >= 100 and <= 599 ? (int?)number : null
        };
        var safeLine = System.Text.Json.JsonSerializer.Serialize(record);
        logger.LogWarning("Rubika diagnostic: {Diagnostic}", safeLine);
        try
        {
            var path = Path.Combine(environment.ContentRootPath, "App_Data", "rubika-diagnostics.jsonl");
            if (File.Exists(path) && new FileInfo(path).Length > 1_000_000) File.Move(path, path + ".previous", true);
            File.AppendAllText(path, safeLine + Environment.NewLine, new UTF8Encoding(false));
        }
        catch (IOException) { /* Logging failure must not hide the original operation failure. */ }
        catch (UnauthorizedAccessException) { }
        var reason = kind switch {
            "authentication" => "نشست روبیکا نامعتبر یا منقضی شده است.",
            "invalid_request" => "درخواست یا کد ورود پذیرفته نشد؛ رمز دومرحله‌ای را نیز بررسی کنید.",
            "rate_limited" => "روبیکا تعداد درخواست‌ها را محدود کرده است؛ کمی بعد تلاش کنید.",
            "not_found" => "حساب روبیکای شمارهٔ مقصد پیدا نشد.",
            "blocked" or "permission_denied" => "روبیکا اجازهٔ انجام درخواست را نداد.",
            "account_restricted" => "حساب ارسال‌کننده محدود شده است.",
            "dependencies" => "اجرای پایتون یا وابستگی‌های روبیکا در دسترس نیست.",
            "dns_error" => "نام سرور روبیکا در شبکه پیدا نشد (DNS).",
            "tls_error" => "برقراری ارتباط امن با سرور روبیکا ناموفق بود (TLS).",
            "connection_error" or "network" => "اتصال شبکه به سرور روبیکا برقرار نشد.",
            "timeout" => "زمان پاسخ سرور روبیکا تمام شد یا درخواست قطع شد.",
            "server" or "temporary" => "سرور روبیکا خطای موقت برگرداند.",
            "encryption_error" => "ساخت درخواست رمزگذاری‌شدهٔ روبیکا ناموفق بود.",
            "decryption_error" => "رمزگشایی پاسخ روبیکا ناموفق بود.",
            "protocol_error" => "قالب پاسخ یا پروتکل روبیکا با اتصال برنامه سازگار نبود.",
            _ => "درخواست روبیکا ناموفق بود؛ جزئیات امن با کد پیگیری ثبت شد."
        };
        var stage = operation switch { "code" => "دریافت کد ورود", "verify" => "تأیید ورود", "pdf" => "ساخت PDF", _ => "ارسال پیام" };
        var warning = operation == "send" ? " نتیجهٔ ارسال ممکن است نامشخص باشد؛ پیش از ارسال مجدد بررسی کنید." : " هیچ پیام قیمتی در این مرحله ارسال نمی‌شود.";
        return new RubikaSendException(kind, $"{reason}{warning} مرحله: {stage}؛ نوع خطا: {kind}؛ کد پیگیری: {record.Reference}");
    }
}
public sealed class RubikaSendException(string kind, string message, bool deliveryUncertain = true) : InvalidOperationException(message)
{
    public string Kind { get; } = kind;
    public bool DeliveryUncertain { get; } = deliveryUncertain;
}
