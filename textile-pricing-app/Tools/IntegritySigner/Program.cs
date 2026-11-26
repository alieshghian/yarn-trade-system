using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

return args.FirstOrDefault()?.ToLowerInvariant() switch
{
    "keygen" => GenerateKeys(args.Skip(1).ToArray()),
    "sign" => SignManifest(args.Skip(1).ToArray()),
    _ => ShowUsage()
};

static int GenerateKeys(string[] args)
{
    var privatePath = GetRequiredOption(args, "--private");
    var publicPath = GetRequiredOption(args, "--public");
    if (File.Exists(privatePath) || File.Exists(publicPath))
    {
        throw new InvalidOperationException("Refusing to overwrite an existing integrity key.");
    }

    Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(privatePath))!);
    Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(publicPath))!);
    using var rsa = RSA.Create(3072);
    File.WriteAllText(privatePath, rsa.ExportPkcs8PrivateKeyPem(), Encoding.ASCII);
    File.WriteAllText(publicPath, rsa.ExportRSAPublicKeyPem(), Encoding.ASCII);
    Console.WriteLine(publicPath);
    return 0;
}

static int SignManifest(string[] args)
{
    var privatePath = GetRequiredOption(args, "--private");
    var root = Path.GetFullPath(GetRequiredOption(args, "--root"));
    var output = Path.GetFullPath(GetRequiredOption(args, "--output"));
    var files = GetRequiredOption(args, "--files")
        .Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .OrderBy(path => path, StringComparer.Ordinal)
        .ToArray();

    var entries = files.Select(relativePath =>
    {
        var fullPath = Path.GetFullPath(Path.Combine(root, relativePath));
        if (!fullPath.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) || !File.Exists(fullPath))
        {
            throw new FileNotFoundException($"Protected release file was not found: {relativePath}", fullPath);
        }

        return new IntegrityFile(relativePath.Replace('\\', '/'), Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(fullPath))));
    }).ToArray();

    var payload = JsonSerializer.SerializeToUtf8Bytes(new IntegrityPayload(1, DateTime.UtcNow, entries));
    using var rsa = RSA.Create();
    rsa.ImportFromPem(File.ReadAllText(privatePath));
    var signature = rsa.SignData(payload, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
    var manifest = new SignedIntegrityManifest(Base64UrlEncode(payload), Base64UrlEncode(signature));

    Directory.CreateDirectory(Path.GetDirectoryName(output)!);
    File.WriteAllText(output, JsonSerializer.Serialize(manifest, new JsonSerializerOptions { WriteIndented = true }), Encoding.UTF8);
    Console.WriteLine(output);
    return 0;
}

static string GetRequiredOption(string[] args, string name)
{
    var index = Array.FindIndex(args, value => string.Equals(value, name, StringComparison.OrdinalIgnoreCase));
    if (index < 0 || index + 1 >= args.Length || string.IsNullOrWhiteSpace(args[index + 1]))
    {
        throw new ArgumentException($"Missing required option {name}.");
    }

    return args[index + 1];
}

static string Base64UrlEncode(byte[] value) =>
    Convert.ToBase64String(value).TrimEnd('=').Replace('+', '-').Replace('/', '_');

static int ShowUsage()
{
    Console.Error.WriteLine("IntegritySigner keygen --private <path> --public <path>");
    Console.Error.WriteLine("IntegritySigner sign --private <path> --root <release-dir> --output <manifest> --files <a;b>");
    return 1;
}

internal sealed record IntegrityFile(string Path, string Sha256);
internal sealed record IntegrityPayload(int Version, DateTime GeneratedAtUtc, IReadOnlyList<IntegrityFile> Files);
internal sealed record SignedIntegrityManifest(string Payload, string Signature);
