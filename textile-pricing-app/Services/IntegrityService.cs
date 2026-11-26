using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace TextilePricingApp.Services;

public sealed class IntegrityService
{
    private const string EmbeddedPublicKeyPem = """
-----BEGIN RSA PUBLIC KEY-----
MIIBigKCAYEAwjVdZDKTZleuf3FTvJr0uBt2QoJLyzHdOnLOnX1808p5xJpYYsIv
2K6ZlolWcMznQR5aeCIIKylrShvvKLqMO7N6BL696MFZOS+TbX0H/7Y/TZtS2SbU
GwYbaSotLwhzjYMqegvIgnLrkncxuC2IioExOlVofkIXHTVESNeGph8rGptVieSy
k/xMhuHKWEohAX3s058swgDu37G1XGqoWQvG/Iii12MwLIQBKi+j4Z2As9o7NY+v
OXpp3GkZNO4aBjR4CEftaCkDrpiYJksBy5Epz/zjqXXPv2NsmaeXaY9isEa0Dfqo
JM9hvR5T11t60VeJmCHmL77UhTERlMXesSCzinUaqiFTjyrupnod/V66hMx87hcQ
oCkI+5wPB8xIDk1rdbHxd7pC5LooHo+liy9p3zwQ9pXXHGjwMRjvolnaKj5xp5Ud
k07tSo4z5vUHtw52nWZZvLoeMqYWVPCj/GlcaKDeBSgQnQK+mD22QiR7sqbUv8q2
ZgySReGG+gwdAgMBAAE=
-----END RSA PUBLIC KEY-----
""";

    private static readonly HashSet<string> RequiredFiles = new(StringComparer.OrdinalIgnoreCase)
    {
        "TextilePricingApp.dll",
        "TextilePricingApp.exe"
    };

    private readonly IWebHostEnvironment _environment;
    private readonly IConfiguration _configuration;
    private readonly ILogger<IntegrityService> _logger;

    public IntegrityService(
        IWebHostEnvironment environment,
        IConfiguration configuration,
        ILogger<IntegrityService> logger)
    {
        _environment = environment;
        _configuration = configuration;
        _logger = logger;
    }

    public bool EnforcementEnabled
    {
        get
        {
#if DEBUG
            return _configuration.GetValue<bool>("Integrity:Enabled");
#else
            return true;
#endif
        }
    }

    public IntegrityStatus GetStatus()
    {
        if (!EnforcementEnabled)
        {
            return new IntegrityStatus(true, "Integrity enforcement is disabled for this development build.");
        }

        try
        {
            var manifestPath = Path.Combine(_environment.ContentRootPath, "integrity.manifest.json");
            if (!File.Exists(manifestPath))
            {
                return Invalid("The signed integrity manifest is missing.");
            }

            var manifest = JsonSerializer.Deserialize<SignedIntegrityManifest>(File.ReadAllText(manifestPath));
            if (manifest is null || string.IsNullOrWhiteSpace(manifest.Payload) || string.IsNullOrWhiteSpace(manifest.Signature))
            {
                return Invalid("The integrity manifest is malformed.");
            }

            var payloadBytes = Base64UrlDecode(manifest.Payload);
            var signatureBytes = Base64UrlDecode(manifest.Signature);
            using var rsa = RSA.Create();
            rsa.ImportFromPem(EmbeddedPublicKeyPem);
            if (!rsa.VerifyData(payloadBytes, signatureBytes, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1))
            {
                return Invalid("The integrity manifest signature is invalid.");
            }

            var payload = JsonSerializer.Deserialize<IntegrityPayload>(payloadBytes);
            if (payload is null || payload.Version != 1 || payload.Files.Count == 0)
            {
                return Invalid("The integrity manifest payload is invalid.");
            }

            var entries = payload.Files.ToDictionary(item => NormalizeRelativePath(item.Path), StringComparer.OrdinalIgnoreCase);
            if (RequiredFiles.Any(required => !entries.ContainsKey(required)))
            {
                return Invalid("The integrity manifest does not cover every required application file.");
            }

            var root = Path.GetFullPath(_environment.ContentRootPath);
            foreach (var entry in entries.Values)
            {
                var relativePath = NormalizeRelativePath(entry.Path);
                var fullPath = Path.GetFullPath(Path.Combine(root, relativePath));
                if (!fullPath.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) || !File.Exists(fullPath))
                {
                    return Invalid($"A protected application file is missing: {relativePath}");
                }

                using var stream = File.OpenRead(fullPath);
                var actualHash = Convert.ToHexString(SHA256.HashData(stream));
                if (!CryptographicOperations.FixedTimeEquals(
                        Convert.FromHexString(actualHash),
                        Convert.FromHexString(entry.Sha256)))
                {
                    return Invalid($"A protected application file was modified: {relativePath}");
                }
            }

            return new IntegrityStatus(true, "Application integrity verified.");
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or CryptographicException or JsonException or FormatException or ArgumentException)
        {
            _logger.LogError(exception, "Application integrity verification failed.");
            return new IntegrityStatus(false, "Application integrity verification failed.");
        }
    }

    private IntegrityStatus Invalid(string message)
    {
        _logger.LogError("Application integrity verification failed: {Message}", message);
        return new IntegrityStatus(false, message);
    }

    private static string NormalizeRelativePath(string value) =>
        value.Replace('/', Path.DirectorySeparatorChar).Replace('\\', Path.DirectorySeparatorChar).TrimStart(Path.DirectorySeparatorChar);

    private static byte[] Base64UrlDecode(string value)
    {
        var normalized = value.Replace('-', '+').Replace('_', '/');
        normalized += (normalized.Length % 4) switch
        {
            2 => "==",
            3 => "=",
            _ => ""
        };
        return Convert.FromBase64String(normalized);
    }

    private sealed class SignedIntegrityManifest
    {
        [JsonPropertyName("Payload")]
        public string Payload { get; set; } = "";

        [JsonPropertyName("Signature")]
        public string Signature { get; set; } = "";
    }

    private sealed class IntegrityPayload
    {
        [JsonPropertyName("Version")]
        public int Version { get; set; }

        [JsonPropertyName("GeneratedAtUtc")]
        public DateTime GeneratedAtUtc { get; set; }

        [JsonPropertyName("Files")]
        public List<IntegrityFile> Files { get; set; } = [];
    }

    private sealed class IntegrityFile
    {
        [JsonPropertyName("Path")]
        public string Path { get; set; } = "";

        [JsonPropertyName("Sha256")]
        public string Sha256 { get; set; } = "";
    }
}

public sealed record IntegrityStatus(bool IsValid, string Message);
