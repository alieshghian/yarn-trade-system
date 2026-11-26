using Microsoft.Win32;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using TextilePricingApp.Models;

namespace TextilePricingApp.Services;

public sealed class HardwareFingerprintService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly Lazy<LicenseRequest> _request;

    public HardwareFingerprintService()
    {
        _request = new Lazy<LicenseRequest>(BuildLicenseRequest);
    }

    public string GetHardwareId() => _request.Value.HardwareId;
    public IReadOnlyDictionary<string, string> GetComponentHashes() => _request.Value.HardwareComponents;
    public string GetLicenseRequestCode() => Base64UrlEncode(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(_request.Value, JsonOptions)));

    private static LicenseRequest BuildLicenseRequest()
    {
        var parts = new SortedDictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["MachineGuid"] = ReadMachineGuid(),
            ["BiosSerial"] = ReadCimValue("Win32_BIOS", "SerialNumber"),
            ["BaseBoardSerial"] = ReadCimValue("Win32_BaseBoard", "SerialNumber"),
            ["SystemUuid"] = ReadCimValue("Win32_ComputerSystemProduct", "UUID"),
            ["ProcessorId"] = ReadCimValue("Win32_Processor", "ProcessorId"),
            ["ProcessorIdentifier"] = Environment.GetEnvironmentVariable("PROCESSOR_IDENTIFIER") ?? "",
            ["MachineName"] = Environment.MachineName
        };

        var usableParts = parts
            .Select(item => new KeyValuePair<string, string>(item.Key, NormalizeValue(item.Value)))
            .Where(item => IsUsableValue(item.Value))
            .ToList();

        if (usableParts.Count == 0)
        {
            usableParts.Add(new KeyValuePair<string, string>("MachineName", NormalizeValue(Environment.MachineName)));
        }

        var normalized = string.Join("|", usableParts.Select(item => $"{item.Key}={item.Value}"));
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(normalized));
        var components = usableParts.ToDictionary(
            item => item.Key,
            item => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(item.Value))),
            StringComparer.OrdinalIgnoreCase);

        return new LicenseRequest
        {
            HardwareId = Convert.ToHexString(hash),
            HardwareComponents = components,
            CreatedAtUtc = DateTime.UtcNow
        };
    }

    private static string ReadMachineGuid()
    {
        if (!OperatingSystem.IsWindows())
        {
            return "";
        }

        try
        {
            return Registry.LocalMachine
                .OpenSubKey(@"SOFTWARE\Microsoft\Cryptography")
                ?.GetValue("MachineGuid")
                ?.ToString() ?? "";
        }
        catch
        {
            return "";
        }
    }

    private static string ReadCimValue(string className, string propertyName)
    {
        try
        {
            using var process = new Process();
            process.StartInfo = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = $"-NoProfile -ExecutionPolicy Bypass -Command \"(Get-CimInstance {className} | Select-Object -First 1 -ExpandProperty {propertyName})\"",
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false
            };

            process.Start();
            if (!process.WaitForExit(2500))
            {
                try { process.Kill(entireProcessTree: true); } catch { }
                return "";
            }

            return process.StandardOutput.ReadToEnd().Trim();
        }
        catch
        {
            return "";
        }
    }

    private static string NormalizeValue(string value)
    {
        return value.Trim().ToUpperInvariant().Replace(" ", "");
    }

    private static bool IsUsableValue(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        var invalidValues = new[]
        {
            "TOBEFILLEDBYO.E.M.",
            "TOBEFILLEDBYOEM",
            "DEFAULTSTRING",
            "SYSTEMSERIALNUMBER",
            "NONE",
            "UNKNOWN",
            "0",
            "00000000-0000-0000-0000-000000000000"
        };

        return !invalidValues.Contains(value, StringComparer.OrdinalIgnoreCase);
    }

    private static string Base64UrlEncode(byte[] bytes)
    {
        return Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }
}
