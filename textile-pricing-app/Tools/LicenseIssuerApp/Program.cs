using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

return LicenseIssuerCli.Run(args);

internal static class LicenseIssuerCli
{
    private static readonly JsonSerializerOptions CompactJsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly JsonSerializerOptions PrettyJsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    public static int Run(string[] args)
    {
        if (args.Length == 0 || IsHelp(args[0]))
        {
            PrintHelp();
            return 0;
        }

        try
        {
            var command = args[0].Trim().ToLowerInvariant();
            var options = ParseOptions(args.Skip(1).ToArray());
            return command switch
            {
                "issue" => Issue(options),
                "keygen" => GenerateKeys(options),
                _ => Fail($"Unknown command: {args[0]}")
            };
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("ERROR: " + ex.Message);
            return 1;
        }
    }

    private static int Issue(Dictionary<string, string> options)
    {
        var customer = Required(options, "customer").Trim();
        var requestCode = Required(options, "request").Trim();
        var privateKeyPath = FullPath(Get(options, "private-key", "license-private.pem"));
        var outputPath = FullPath(Get(options, "out", "license.lic"));
        var features = Get(options, "features", "Full");
        var expiresText = Get(options, "expires", "");

        if (!File.Exists(privateKeyPath))
        {
            throw new FileNotFoundException("Private key file was not found.", privateKeyPath);
        }

        DateTime? expiresAtUtc = null;
        if (!string.IsNullOrWhiteSpace(expiresText))
        {
            if (!DateTime.TryParse(expiresText, out var expiresAt))
            {
                throw new InvalidOperationException("Invalid --expires value. Use yyyy-MM-dd.");
            }

            expiresAtUtc = expiresAt.Date.AddDays(1).AddTicks(-1).ToUniversalTime();
        }

        var request = ParseLicenseRequest(requestCode);
        if (string.IsNullOrWhiteSpace(request.HardwareId))
        {
            throw new InvalidOperationException("The license request code does not contain a hardware id.");
        }

        var payload = new LicensePayload
        {
            CustomerName = customer,
            HardwareId = request.HardwareId.Trim().ToUpperInvariant(),
            HardwareComponents = request.HardwareComponents,
            RequiredHardwareMatches = request.HardwareComponents.Count == 0
                ? 0
                : Math.Min(3, request.HardwareComponents.Count),
            IssuedAtUtc = DateTime.UtcNow,
            ExpiresAtUtc = expiresAtUtc,
            Features = string.IsNullOrWhiteSpace(features)
                ? ["Full"]
                : features.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
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

        Directory.CreateDirectory(Path.GetDirectoryName(outputPath) ?? ".");
        File.WriteAllText(outputPath, JsonSerializer.Serialize(license, PrettyJsonOptions), Encoding.UTF8);

        Console.WriteLine("License issued successfully.");
        Console.WriteLine("Customer: " + payload.CustomerName);
        Console.WriteLine("HardwareId: " + payload.HardwareId);
        Console.WriteLine("Hardware components: " + payload.HardwareComponents.Count);
        Console.WriteLine("Required matches: " + payload.RequiredHardwareMatches);
        Console.WriteLine("Output: " + outputPath);
        return 0;
    }

    private static int GenerateKeys(Dictionary<string, string> options)
    {
        var outDir = FullPath(Get(options, "out-dir", "."));
        var overwrite = options.ContainsKey("overwrite");
        var privateKeyPath = Path.Combine(outDir, "license-private.pem");
        var publicKeyPath = Path.Combine(outDir, "license-public.pem");

        Directory.CreateDirectory(outDir);
        if (!overwrite && (File.Exists(privateKeyPath) || File.Exists(publicKeyPath)))
        {
            throw new InvalidOperationException("Key files already exist. Pass --overwrite to replace them.");
        }

        using var rsa = RSA.Create(3072);
        File.WriteAllText(privateKeyPath, rsa.ExportRSAPrivateKeyPem(), Encoding.ASCII);
        File.WriteAllText(publicKeyPath, rsa.ExportRSAPublicKeyPem(), Encoding.ASCII);

        Console.WriteLine("Keys generated.");
        Console.WriteLine("Private key: " + privateKeyPath);
        Console.WriteLine("Public key: " + publicKeyPath);
        Console.WriteLine("Important: if you generate new keys, embed the new public key in the main application and rebuild it.");
        return 0;
    }

    private static LicenseRequest ParseLicenseRequest(string input)
    {
        var trimmed = input.Trim();
        try
        {
            var bytes = Base64UrlDecode(trimmed);
            var request = JsonSerializer.Deserialize<LicenseRequest>(bytes, CompactJsonOptions);
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

    private static Dictionary<string, string> ParseOptions(string[] args)
    {
        var options = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        for (var i = 0; i < args.Length; i++)
        {
            var key = args[i];
            if (!key.StartsWith("--", StringComparison.Ordinal))
            {
                throw new InvalidOperationException($"Unexpected argument: {key}");
            }

            key = key[2..];
            if (string.Equals(key, "overwrite", StringComparison.OrdinalIgnoreCase))
            {
                options[key] = "true";
                continue;
            }

            if (i + 1 >= args.Length || args[i + 1].StartsWith("--", StringComparison.Ordinal))
            {
                throw new InvalidOperationException($"Missing value for --{key}");
            }

            options[key] = args[++i];
        }

        return options;
    }

    private static string Required(Dictionary<string, string> options, string key)
    {
        if (!options.TryGetValue(key, out var value) || string.IsNullOrWhiteSpace(value))
        {
            throw new InvalidOperationException($"--{key} is required.");
        }

        return value;
    }

    private static string Get(Dictionary<string, string> options, string key, string fallback)
    {
        return options.TryGetValue(key, out var value) && !string.IsNullOrWhiteSpace(value)
            ? value
            : fallback;
    }

    private static bool IsHelp(string value) => value is "-h" or "--help" or "help" or "/?";

    private static string FullPath(string path) => Path.GetFullPath(path);

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

    private static int Fail(string message)
    {
        Console.Error.WriteLine("ERROR: " + message);
        PrintHelp();
        return 1;
    }

    private static void PrintHelp()
    {
        Console.WriteLine("LicenseIssuerApp");
        Console.WriteLine();
        Console.WriteLine("Issue a license:");
        Console.WriteLine("  LicenseIssuerApp issue --customer \"Customer Name\" --request \"REQUEST_CODE\" --private-key license-private.pem --out license.lic [--expires yyyy-MM-dd] [--features Full]");
        Console.WriteLine();
        Console.WriteLine("Generate a key pair:");
        Console.WriteLine("  LicenseIssuerApp keygen --out-dir C:\\Keys [--overwrite]");
        Console.WriteLine();
        Console.WriteLine("Keep license-private.pem only on your own computer. Never send it to customers.");
    }
}

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
