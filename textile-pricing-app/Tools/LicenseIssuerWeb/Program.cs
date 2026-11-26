using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

app.MapGet("/", (IWebHostEnvironment environment) =>
{
    var privateKeyPath = LicenseIssuer.ResolveDefaultPrivateKeyPath(environment.ContentRootPath);
    return Results.Content(PageRenderer.RenderForm(privateKeyPath), "text/html; charset=utf-8");
});

app.MapPost("/issue", async (HttpRequest request, IWebHostEnvironment environment) =>
{
    var form = await request.ReadFormAsync();
    var input = new IssueInput(
        form["customer"].ToString(),
        form["requestCode"].ToString(),
        form["privateKeyPath"].ToString(),
        form["expiresAt"].ToString(),
        form["features"].ToString());

    var result = LicenseIssuer.Issue(input, environment.ContentRootPath);
    return Results.File(
        result.Bytes,
        "application/octet-stream",
        result.FileName);
});

app.MapGet("/health", () => Results.Ok(new { ok = true }));

app.Run();

internal static class LicenseIssuer
{
    private static readonly JsonSerializerOptions CompactJsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly JsonSerializerOptions PrettyJsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    public static IssueResult Issue(IssueInput input, string contentRootPath)
    {
        var customer = input.CustomerName.Trim();
        var requestCode = input.RequestCode.Trim();
        var privateKeyPath = string.IsNullOrWhiteSpace(input.PrivateKeyPath)
            ? ResolveDefaultPrivateKeyPath(contentRootPath)
            : Path.GetFullPath(input.PrivateKeyPath.Trim());

        if (string.IsNullOrWhiteSpace(customer))
        {
            throw new InvalidOperationException("نام مشتری الزامی است.");
        }

        if (string.IsNullOrWhiteSpace(requestCode))
        {
            throw new InvalidOperationException("کد درخواست لایسنس الزامی است.");
        }

        if (!File.Exists(privateKeyPath))
        {
            throw new FileNotFoundException("فایل کلید خصوصی پیدا نشد.", privateKeyPath);
        }

        DateTime? expiresAtUtc = null;
        if (!string.IsNullOrWhiteSpace(input.ExpiresAt))
        {
            if (!DateTime.TryParse(input.ExpiresAt, out var expiresAt))
            {
                throw new InvalidOperationException("تاریخ انقضا معتبر نیست.");
            }

            expiresAtUtc = expiresAt.Date.AddDays(1).AddTicks(-1).ToUniversalTime();
        }

        var licenseRequest = ParseLicenseRequest(requestCode);
        if (string.IsNullOrWhiteSpace(licenseRequest.HardwareId))
        {
            throw new InvalidOperationException("کد درخواست لایسنس شناسه سخت‌افزار ندارد.");
        }

        var payload = new LicensePayload
        {
            CustomerName = customer,
            HardwareId = licenseRequest.HardwareId.Trim().ToUpperInvariant(),
            HardwareComponents = licenseRequest.HardwareComponents,
            RequiredHardwareMatches = licenseRequest.HardwareComponents.Count == 0
                ? 0
                : Math.Min(3, licenseRequest.HardwareComponents.Count),
            IssuedAtUtc = DateTime.UtcNow,
            ExpiresAtUtc = expiresAtUtc,
            Features = string.IsNullOrWhiteSpace(input.Features)
                ? ["Full"]
                : input.Features.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
        };

        var payloadBytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(payload, CompactJsonOptions));
        using var rsa = RSA.Create();
        rsa.ImportFromPem(File.ReadAllText(privateKeyPath));
        var signature = rsa.SignData(payloadBytes, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);

        var license = new SignedLicense
        {
            Payload = Base64UrlEncode(payloadBytes),
            Signature = Base64UrlEncode(signature)
        };

        var bytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(license, PrettyJsonOptions));
        var fileName = SafeFileName(customer) + "_license.lic";
        return new IssueResult(bytes, fileName);
    }

    public static string ResolveDefaultPrivateKeyPath(string contentRootPath)
    {
        var current = new DirectoryInfo(contentRootPath);
        while (current is not null)
        {
            var candidate = Path.Combine(current.FullName, "App_Data", "LicenseIssuer", "license-private.pem");
            if (File.Exists(candidate))
            {
                return candidate;
            }

            current = current.Parent;
        }

        return Path.GetFullPath(Path.Combine(contentRootPath, "license-private.pem"));
    }

    private static LicenseRequest ParseLicenseRequest(string input)
    {
        var trimmed = input.Trim();
        try
        {
            var requestBytes = Base64UrlDecode(trimmed);
            var request = JsonSerializer.Deserialize<LicenseRequest>(requestBytes, CompactJsonOptions);
            if (request is not null && !string.IsNullOrWhiteSpace(request.HardwareId))
            {
                request.HardwareId = request.HardwareId.Trim().ToUpperInvariant();
                request.HardwareComponents ??= new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                return request;
            }
        }
        catch
        {
            // Backward compatibility: accept an old raw hardware id.
        }

        return new LicenseRequest
        {
            HardwareId = trimmed.ToUpperInvariant(),
            HardwareComponents = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase),
            CreatedAtUtc = DateTime.UtcNow
        };
    }

    private static string SafeFileName(string value)
    {
        var invalid = Path.GetInvalidFileNameChars();
        var cleaned = new string(value.Select(ch => invalid.Contains(ch) ? '_' : ch).ToArray()).Trim();
        return string.IsNullOrWhiteSpace(cleaned) ? "customer" : cleaned;
    }

    private static string Base64UrlEncode(byte[] bytes)
    {
        return Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    private static byte[] Base64UrlDecode(string value)
    {
        var padded = value.Replace('-', '+').Replace('_', '/');
        padded = padded.PadRight(padded.Length + (4 - padded.Length % 4) % 4, '=');
        return Convert.FromBase64String(padded);
    }
}

internal static class PageRenderer
{
    public static string RenderForm(string privateKeyPath, string? error = null)
    {
        var encodedPrivateKeyPath = WebUtility.HtmlEncode(privateKeyPath);
        var encodedError = WebUtility.HtmlEncode(error ?? "");
        var errorBlock = string.IsNullOrWhiteSpace(error)
            ? ""
            : $"""<div class="alert error">{encodedError}</div>""";

        return $$"""
<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>صدور لایسنس</title>
  <style>
    body { margin: 0; font-family: Tahoma, Arial, sans-serif; background: #f5f7fa; color: #172033; }
    main { max-width: 920px; margin: 32px auto; padding: 0 16px; }
    h1 { margin: 0 0 18px; font-size: 26px; }
    form { background: #fff; border: 1px solid #d8dee8; border-radius: 8px; padding: 20px; display: grid; gap: 16px; box-shadow: 0 8px 24px rgba(25, 35, 55, .08); }
    label { display: grid; gap: 7px; font-weight: 700; }
    input, textarea { width: 100%; box-sizing: border-box; border: 1px solid #bdc7d6; border-radius: 6px; padding: 10px 12px; font: inherit; background: #fff; }
    textarea { min-height: 150px; direction: ltr; text-align: left; resize: vertical; }
    input.ltr { direction: ltr; text-align: left; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .hint { color: #667085; font-size: 13px; font-weight: 400; }
    .actions { display: flex; gap: 10px; justify-content: flex-start; }
    button { border: 0; border-radius: 6px; padding: 11px 18px; background: #111827; color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
    .alert { border-radius: 6px; padding: 12px; margin-bottom: 14px; }
    .error { background: #fff1f2; border: 1px solid #fecdd3; color: #9f1239; }
    code { direction: ltr; display: inline-block; }
    @media (max-width: 760px) { .grid { grid-template-columns: 1fr; } main { margin-top: 18px; } }
  </style>
</head>
<body>
<main>
  <h1>صدور لایسنس</h1>
  {{errorBlock}}
  <form method="post" action="/issue">
    <label>
      نام مشتری
      <input name="customer" required autocomplete="off">
    </label>

    <label>
      کد درخواست لایسنس مشتری
      <textarea name="requestCode" required spellcheck="false"></textarea>
      <span class="hint">این کد را از صفحه <code>/License</code> نرم‌افزار مشتری بگیرید.</span>
    </label>

    <div class="grid">
      <label>
        تاریخ انقضا
        <input name="expiresAt" class="ltr" type="date">
        <span class="hint">اگر خالی بماند، لایسنس بدون انقضا صادر می‌شود.</span>
      </label>

      <label>
        امکانات
        <input name="features" class="ltr" value="Full">
      </label>
    </div>

    <label>
      مسیر کلید خصوصی
      <input name="privateKeyPath" class="ltr" value="{{encodedPrivateKeyPath}}" required>
      <span class="hint">کلید خصوصی نباید روی سیستم مشتری کپی شود.</span>
    </label>

    <div class="actions">
      <button type="submit">دانلود license.lic</button>
    </div>
  </form>
</main>
</body>
</html>
""";
    }
}

internal sealed record IssueInput(
    string CustomerName,
    string RequestCode,
    string PrivateKeyPath,
    string ExpiresAt,
    string Features);

internal sealed record IssueResult(byte[] Bytes, string FileName);

internal sealed class LicensePayload
{
    public string CustomerName { get; set; } = "";
    public string HardwareId { get; set; } = "";
    public Dictionary<string, string> HardwareComponents { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public int RequiredHardwareMatches { get; set; } = 3;
    public DateTime IssuedAtUtc { get; set; }
    public DateTime? ExpiresAtUtc { get; set; }
    public string[] Features { get; set; } = [];
}

internal sealed class SignedLicense
{
    public string Payload { get; set; } = "";
    public string Signature { get; set; } = "";
}

internal sealed class LicenseRequest
{
    public string HardwareId { get; set; } = "";
    public Dictionary<string, string> HardwareComponents { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public DateTime CreatedAtUtc { get; set; }
}
