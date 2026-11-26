using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;
using TextilePricingApp.Models;

namespace TextilePricingApp.Services;

public sealed class LicenseService
{
    private const string EmbeddedPublicKeyPem = """
-----BEGIN RSA PUBLIC KEY-----
MIIBigKCAYEAyU+MKmMnaFRvmNY34cpvdCXRmqjjjGM2XeSNDmZYeNmVii5aIAoM
omp//MCND395G61TounaG4nSS5c4qTPOBB1EN6fDZF+QVNoc0nKx5OmSBrTJVQZ7
d27JoRBTaLLgvClI32osVAMncLjXQ3rqBHTqQAo0WiPSsRz8CRX+vmCrNdnk/YEr
Tm6HzKs852XriemvMMkom/GlvpuAKpB5+ZKO9okA6J958UWPjovSX4VHZKQaiv/i
Ii4UKYxsaFbfLdTY8PyJlsVHU0IWTECCZ0yGImq6tGvDmrom0TCN9Y1NS/r66knd
Ex4cFHWXVAQ/Ja62wj94fzA/Ex2aSHLXs23H7offxD0a9Gsnl1FylEdQXaZsVk+K
XX3zEHzDpIpjOK1lpRzqDgOQ6YgdynIWM/yAi/wuaZGt8+s1fJ1ODhLXYl1uuvld
AhbQAbbHALyGGG/jVilWBpY+qt8NbY3MaecN4s5JVX6WFU1GX++S9mzgkDdNbRMf
mcMXljSKyVr9AgMBAAE=
-----END RSA PUBLIC KEY-----
""";

    private const string PublicKeySource = "Embedded";

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = false
    };

    private readonly IConfiguration _configuration;
    private readonly IWebHostEnvironment _environment;
    private readonly HardwareFingerprintService _hardware;
    private readonly IDataProtector _protector;

    public LicenseService(
        IConfiguration configuration,
        IWebHostEnvironment environment,
        HardwareFingerprintService hardware,
        IDataProtectionProvider dataProtectionProvider)
    {
        _configuration = configuration;
        _environment = environment;
        _hardware = hardware;
        _protector = dataProtectionProvider.CreateProtector("TextilePricingApp.LicenseState.v1");
    }

    public bool EnforcementEnabled
    {
        get
        {
#if LICENSE_FREE_BUILD
            return false;
#elif DEBUG
            return _environment.IsDevelopment()
                ? _configuration.GetValue<bool>("Licensing:Enabled")
                : true;
#else
            return true;
#endif
        }
    }

    public LicenseStatus GetStatus()
    {
        var hardwareId = _hardware.GetHardwareId();
        var requestCode = _hardware.GetLicenseRequestCode();
        var licensePath = ResolveConfiguredPath("Licensing:LicenseFile", "license.lic");

        if (!EnforcementEnabled)
        {
            return Status(true, "قفل نرم‌افزار در محیط توسعه غیرفعال است.");
        }

        if (!File.Exists(licensePath))
        {
            return Status(false, "فایل لایسنس پیدا نشد.");
        }

        try
        {
            var signedLicense = JsonSerializer.Deserialize<SignedLicense>(File.ReadAllText(licensePath), JsonOptions);
            if (signedLicense is null ||
                string.IsNullOrWhiteSpace(signedLicense.Payload) ||
                string.IsNullOrWhiteSpace(signedLicense.Signature))
            {
                return Status(false, "ساختار فایل لایسنس معتبر نیست.");
            }

            var payloadBytes = Base64UrlDecode(signedLicense.Payload);
            var signatureBytes = Base64UrlDecode(signedLicense.Signature);
            using var rsa = RSA.Create();
            rsa.ImportFromPem(EmbeddedPublicKeyPem);
            var validSignature = rsa.VerifyData(payloadBytes, signatureBytes, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
            if (!validSignature)
            {
                return Status(false, "امضای فایل لایسنس معتبر نیست.");
            }

            var payload = JsonSerializer.Deserialize<LicensePayload>(payloadBytes, JsonOptions);
            if (payload is null)
            {
                return Status(false, "محتوای فایل لایسنس قابل خواندن نیست.");
            }

            var matchCount = CountHardwareMatches(payload.HardwareComponents);
            var requiredMatches = GetRequiredHardwareMatches(payload);
            var exactHardwareMatch = string.Equals(payload.HardwareId, hardwareId, StringComparison.OrdinalIgnoreCase);
            var componentMatch = (payload.HardwareComponents?.Count ?? 0) > 0 && matchCount >= requiredMatches;
            if (!exactHardwareMatch && !componentMatch)
            {
                return Status(false, "این لایسنس برای این سیستم صادر نشده است.", payload, matchCount, requiredMatches);
            }

            if (payload.ExpiresAtUtc is not null && payload.ExpiresAtUtc.Value < DateTime.UtcNow)
            {
                return Status(false, "اعتبار لایسنس تمام شده است.", payload, matchCount, requiredMatches);
            }

            var rollbackMessage = ValidateAndUpdateClockState(DateTime.UtcNow);
            if (!string.IsNullOrWhiteSpace(rollbackMessage))
            {
                return Status(false, rollbackMessage, payload, matchCount, requiredMatches);
            }

            return Status(true, "لایسنس معتبر است.", payload, matchCount, requiredMatches);
        }
        catch (Exception ex)
        {
            return Status(false, $"خطا در بررسی لایسنس: {ex.Message}");
        }

        LicenseStatus Status(
            bool isValid,
            string message,
            LicensePayload? payload = null,
            int hardwareMatchCount = 0,
            int requiredHardwareMatches = 0)
        {
            return new LicenseStatus(
                EnforcementEnabled,
                isValid,
                hardwareId,
                requestCode,
                message,
                payload,
                licensePath,
                PublicKeySource,
                hardwareMatchCount,
                requiredHardwareMatches);
        }
    }

    private int CountHardwareMatches(Dictionary<string, string>? licensedComponents)
    {
        if (licensedComponents is null || licensedComponents.Count == 0)
        {
            return 0;
        }

        var currentComponents = _hardware.GetComponentHashes();
        return licensedComponents.Count(item =>
            currentComponents.TryGetValue(item.Key, out var currentValue) &&
            string.Equals(currentValue, item.Value, StringComparison.OrdinalIgnoreCase));
    }

    private static int GetRequiredHardwareMatches(LicensePayload payload)
    {
        var componentCount = payload.HardwareComponents?.Count ?? 0;
        if (componentCount == 0)
        {
            return 0;
        }

        return Math.Clamp(payload.RequiredHardwareMatches, 1, componentCount);
    }

    private string? ValidateAndUpdateClockState(DateTime nowUtc)
    {
        var statePath = ResolveConfiguredPath("Licensing:StateFile", Path.Combine("App_Data", "license-state.dat"));
        Directory.CreateDirectory(Path.GetDirectoryName(statePath)!);

        if (File.Exists(statePath))
        {
            try
            {
                var protectedText = File.ReadAllText(statePath);
                var json = _protector.Unprotect(protectedText);
                var state = JsonSerializer.Deserialize<LicenseClockState>(json, JsonOptions);
                if (state is null)
                {
                    return "وضعیت اجرای قبلی لایسنس قابل خواندن نیست.";
                }

                if (nowUtc.AddMinutes(5) < state.LastSeenUtc)
                {
                    return "تاریخ سیستم عقب برده شده است.";
                }
            }
            catch
            {
                return "وضعیت اجرای قبلی لایسنس دستکاری شده است.";
            }
        }

        var nextState = new LicenseClockState { LastSeenUtc = nowUtc };
        var nextJson = JsonSerializer.Serialize(nextState, JsonOptions);
        File.WriteAllText(statePath, _protector.Protect(nextJson), Encoding.UTF8);
        return null;
    }

    private string ResolveConfiguredPath(string key, string fallback)
    {
        var configured = _configuration[key];
        var path = string.IsNullOrWhiteSpace(configured) ? fallback : configured;
        return Path.IsPathRooted(path)
            ? path
            : Path.Combine(_environment.ContentRootPath, path);
    }

    private static byte[] Base64UrlDecode(string value)
    {
        var padded = value.Replace('-', '+').Replace('_', '/');
        padded = padded.PadRight(padded.Length + (4 - padded.Length % 4) % 4, '=');
        return Convert.FromBase64String(padded);
    }

    private sealed class LicenseClockState
    {
        public DateTime LastSeenUtc { get; set; }
    }
}
