namespace TextilePricingApp.Models;

public sealed class LicensePayload
{
    public string CustomerName { get; set; } = "";
    public string HardwareId { get; set; } = "";
    public Dictionary<string, string> HardwareComponents { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public int RequiredHardwareMatches { get; set; } = 3;
    public DateTime IssuedAtUtc { get; set; }
    public DateTime? ExpiresAtUtc { get; set; }
    public string[] Features { get; set; } = [];
}

public sealed class SignedLicense
{
    public string Payload { get; set; } = "";
    public string Signature { get; set; } = "";
}

public sealed class LicenseRequest
{
    public string HardwareId { get; set; } = "";
    public Dictionary<string, string> HardwareComponents { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public DateTime CreatedAtUtc { get; set; }
}

public sealed record LicenseStatus(
    bool EnforcementEnabled,
    bool IsValid,
    string HardwareId,
    string LicenseRequestCode,
    string Message,
    LicensePayload? Payload,
    string LicensePath,
    string PublicKeySource,
    int HardwareMatchCount,
    int RequiredHardwareMatches);
