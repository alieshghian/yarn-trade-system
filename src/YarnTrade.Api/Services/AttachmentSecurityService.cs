using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Xml;
using System.Xml.Linq;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using YarnTrade.Api.Domain;

namespace YarnTrade.Api.Services;

public enum AttachmentScanResult { Clean, Rejected, Unavailable }
public interface IAttachmentScanner
{
    Task<AttachmentScanResult> ScanAsync(string quarantinePath, CancellationToken ct);
}
public sealed class UnconfiguredAttachmentScanner : IAttachmentScanner
{
    public Task<AttachmentScanResult> ScanAsync(string quarantinePath, CancellationToken ct) => Task.FromResult(AttachmentScanResult.Unavailable);
}
public sealed class AttachmentSecurityException(string code, int status = 422) : Exception("فایل یا درخواست پیوست معتبر نیست.")
{
    public string Code { get; } = code;
    public int Status { get; } = status;
}
public sealed class AttachmentSecurityExceptionFilter : IExceptionFilter
{
    public void OnException(ExceptionContext context)
    {
        if (context.Exception is not AttachmentSecurityException error) return;
        context.Result = new ObjectResult(new { code = error.Code, error = error.Message }) { StatusCode = error.Status };
        context.ExceptionHandled = true;
    }
}
public static class AttachmentSecurityRegistration
{
    public static IServiceCollection AddAttachmentSecurity(this IServiceCollection services)
    {
        services.AddScoped<AttachmentSecurityService>();
        services.AddSingleton<IAttachmentScanner, UnconfiguredAttachmentScanner>();
        services.Configure<MvcOptions>(options => options.Filters.Add<AttachmentSecurityExceptionFilter>());
        return services;
    }
}

public sealed record AttachmentMetadata(Guid Id, string EntityType, Guid EntityId, string DocumentType,
    string? DocumentNumber, DateOnly? DocumentDate, string OriginalFileName, string ContentType, long FileSize,
    string? Description, DateTime UploadedAtUtc, Guid UploadedBy)
{
    public static AttachmentMetadata From(Attachment a) => new(a.Id, a.EntityType, a.EntityId, a.DocumentType,
        a.DocumentNumber, a.DocumentDate, a.OriginalFileName, a.ContentType, a.FileSize, a.Description, a.UploadedAtUtc, a.UploadedBy);
}

// Validation is not antivirus. An unavailable external scanner is never reported as Clean.
public sealed class AttachmentSecurityService(IWebHostEnvironment environment, IConfiguration configuration,
    IAttachmentScanner scanner, ILogger<AttachmentSecurityService> logger)
{
    public const long MaxFileBytes = 25_000_000;
    public const int MaxZipEntries = 2048;
    public const long MaxExpandedBytes = MaxFileBytes * 4;
    public const long MaxXmlBytes = MaxFileBytes;
    private string Root
    {
        get
        {
            var root = Path.GetFullPath(Path.Combine(environment.ContentRootPath, "App_Data", "attachments"));
            foreach (var directory in new[] { Path.GetDirectoryName(root)!, root, Path.Combine(root, "quarantine") })
                if (Directory.Exists(directory) && (File.GetAttributes(directory) & FileAttributes.ReparsePoint) != 0)
                    throw new AttachmentSecurityException("ATTACHMENT_INVALID_CONTENT");
            return root;
        }
    }
    private static readonly Dictionary<string, string> Types = new(StringComparer.Ordinal)
    {
        [".pdf"] = "application/pdf", [".png"] = "image/png", [".jpg"] = "image/jpeg",
        [".xlsx"] = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    };

    public static string SafeOriginalName(string name)
    {
        name = Path.GetFileName(name.Replace('\\', '/')).Normalize(NormalizationForm.FormC);
        name = new string(name.Where(c => !char.IsControl(c) && char.GetUnicodeCategory(c) != System.Globalization.UnicodeCategory.Format
            && c is not '/' and not '\\' and not ':' and not '"').ToArray()).Trim().TrimEnd('.', ' ');
        if (name.Length > 180) name = name[..180].TrimEnd('.', ' ');
        return string.IsNullOrWhiteSpace(name) ? "document" : name;
    }

    public string FinalPath(string storedName)
    {
        if (!Regex.IsMatch(storedName, @"\A[0-9a-f]{32}\.(pdf|xlsx|png|jpg)\z", RegexOptions.CultureInvariant))
            throw new AttachmentSecurityException("ATTACHMENT_INVALID_CONTENT");
        var root = Root;
        var path = Path.GetFullPath(Path.Combine(root, storedName));
        if (!path.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            throw new AttachmentSecurityException("ATTACHMENT_INVALID_CONTENT");
        if (File.Exists(path) && (File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0)
            throw new AttachmentSecurityException("ATTACHMENT_INVALID_CONTENT");
        return path;
    }

    public async Task<ValidatedAttachment> StageAsync(IFormFile file, CancellationToken ct, bool xlsxOnly = false)
    {
        if (file.Length == 0) throw new AttachmentSecurityException("ATTACHMENT_EMPTY", 400);
        if (file.Length > MaxFileBytes) throw new AttachmentSecurityException("ATTACHMENT_TOO_LARGE", 413);
        var quarantine = Path.Combine(Root, "quarantine");
        Directory.CreateDirectory(quarantine);
        var staged = Path.Combine(quarantine, Guid.NewGuid().ToString("N"));
        try
        {
            long length = 0;
            await using (var source = file.OpenReadStream())
            await using (var target = new FileStream(staged, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                var buffer = new byte[81920]; int read;
                while ((read = await source.ReadAsync(buffer, ct)) != 0)
                {
                    length += read;
                    if (length > MaxFileBytes) throw new AttachmentSecurityException("ATTACHMENT_TOO_LARGE", 413);
                    await target.WriteAsync(buffer.AsMemory(0, read), ct);
                }
            }
            if (length == 0) throw new AttachmentSecurityException("ATTACHMENT_EMPTY", 400);
            string extension, hash;
            await using (var input = File.OpenRead(staged))
            {
                hash = Convert.ToHexString(await SHA256.HashDataAsync(input, ct)); input.Position = 0;
                extension = Detect(input);
            }
            if (xlsxOnly && extension != ".xlsx") throw new AttachmentSecurityException("ATTACHMENT_TYPE_MISMATCH", 415);
            AttachmentScanResult scan;
            try { scan = await scanner.ScanAsync(staged, ct); }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
            catch { scan = AttachmentScanResult.Unavailable; }
            if (scan != AttachmentScanResult.Clean)
                logger.LogWarning("Attachment scan category {ScanCategory}", scan);
            if (scan == AttachmentScanResult.Rejected) throw new AttachmentSecurityException("ATTACHMENT_SCANNER_REJECTED");
            if (scan != AttachmentScanResult.Clean && configuration.GetValue<bool>("Attachments:RequireMalwareScan"))
                throw new AttachmentSecurityException("ATTACHMENT_SCANNER_UNAVAILABLE", 503);
            return new ValidatedAttachment(this, staged, Guid.NewGuid().ToString("N") + extension,
                SafeOriginalName(file.FileName), Types[extension], length, hash, scan);
        }
        catch (Exception e) when (e is InvalidDataException or EndOfStreamException or ArgumentException)
        {
            Cleanup(staged);
            throw new AttachmentSecurityException("ATTACHMENT_INVALID_CONTENT");
        }
        catch
        {
            Cleanup(staged);
            throw;
        }
    }

    private static string Detect(Stream stream)
    {
        try { return DetectCore(stream); }
        catch (Exception e) when (e is InvalidDataException or EndOfStreamException or ArgumentException or NotSupportedException)
        { throw new AttachmentSecurityException("ATTACHMENT_INVALID_CONTENT"); }
    }
    private static string DetectCore(Stream stream)
    {
        var header = new byte[8]; var count = stream.Read(header); stream.Position = 0;
        if (count >= 5 && Encoding.ASCII.GetString(header, 0, 5) == "%PDF-")
        {
            using var reader = new StreamReader(stream, Encoding.Latin1, leaveOpen: true);
            var text = reader.ReadToEnd();
            if (!Regex.IsMatch(text, @"\A%PDF-[12]\.\d[\r\n]") || !text.TrimEnd().EndsWith("%%EOF", StringComparison.Ordinal)
                || !Regex.IsMatch(text, @"\b\d+\s+\d+\s+obj\b") || !text.Contains("endobj", StringComparison.Ordinal)
                || !text.Contains("startxref", StringComparison.Ordinal)) Invalid();
            return ".pdf";
        }
        if (header.AsSpan().SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }))
        {
            ValidatePng(stream); return ".png";
        }
        if (count >= 3 && header[0] == 0xff && header[1] == 0xd8 && header[2] == 0xff)
        {
            ValidateJpeg(stream); return ".jpg";
        }
        if (count >= 4 && header[0] == 'P' && header[1] == 'K' && header[2] == 3 && header[3] == 4)
        {
            ValidateXlsx(stream); return ".xlsx";
        }
        throw new AttachmentSecurityException("ATTACHMENT_TYPE_NOT_ALLOWED", 415);
    }
    private static void Invalid() => throw new AttachmentSecurityException("ATTACHMENT_INVALID_CONTENT");
    private static void ValidatePng(Stream stream)
    {
        using var reader = new BinaryReader(stream, Encoding.UTF8, leaveOpen: true); reader.ReadBytes(8);
        var first = true; var data = false;
        while (stream.Position < stream.Length)
        {
            if (stream.Length - stream.Position < 12) Invalid();
            var bytes = reader.ReadBytes(4); var size = System.Buffers.Binary.BinaryPrimitives.ReadUInt32BigEndian(bytes);
            var kind = Encoding.ASCII.GetString(reader.ReadBytes(4));
            if (size > stream.Length - stream.Position - 4 || (first && (kind != "IHDR" || size != 13))) Invalid();
            first = false; if (kind == "IDAT") data = true;
            stream.Position += size; reader.ReadBytes(4);
            if (kind == "IEND") { if (size != 0 || !data || stream.Position != stream.Length) Invalid(); return; }
        }
        Invalid();
    }
    private static void ValidateJpeg(Stream stream)
    {
        using var reader = new BinaryReader(stream, Encoding.UTF8, leaveOpen: true); reader.ReadBytes(2);
        var frame = false;
        while (stream.Position < stream.Length - 2)
        {
            if (reader.ReadByte() != 0xff) Invalid();
            var marker = reader.ReadByte(); while (marker == 0xff) marker = reader.ReadByte();
            if (marker == 0 || marker == 0xd8 || marker == 0xd9) Invalid();
            var length = (reader.ReadByte() << 8) | reader.ReadByte();
            if (length < 2 || length - 2 > stream.Length - stream.Position) Invalid();
            if (marker is >= 0xc0 and <= 0xc3) frame = length >= 8;
            if (marker == 0xda)
            {
                stream.Position = stream.Length - 2;
                if (!frame || reader.ReadByte() != 0xff || reader.ReadByte() != 0xd9) Invalid(); return;
            }
            stream.Position += length - 2;
        }
        Invalid();
    }

    public static XmlReader SafeXml(Stream input) => XmlReader.Create(input, new XmlReaderSettings
    { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null, MaxCharactersInDocument = MaxXmlBytes });

    private static void ValidateXlsx(Stream input)
    {
        try
        {
            using var zip = new ZipArchive(input, ZipArchiveMode.Read, leaveOpen: true);
            if (zip.Entries.Count == 0 || zip.Entries.Count > MaxZipEntries) Invalid();
            foreach (var required in new[] { "[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels" })
                if (zip.GetEntry(required) is null) Invalid();
            long expanded = 0; var parts = new Dictionary<string, XDocument>(StringComparer.Ordinal);
            var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var entry in zip.Entries)
            {
                var name = entry.FullName;
                if (name.Contains('\\') || name.Contains(':') || name.StartsWith('/') || name.Split('/').Any(x => x is ".." or ".")
                    || name.Any(char.IsControl) || !names.Add(name)) Invalid();
                if (name.Contains("vba", StringComparison.OrdinalIgnoreCase) || name.EndsWith(".bin", StringComparison.OrdinalIgnoreCase))
                    throw new AttachmentSecurityException("ATTACHMENT_TYPE_NOT_ALLOWED", 415);
                expanded += entry.Length;
                if (entry.Length > MaxXmlBytes || expanded > MaxExpandedBytes
                    || entry.Length > Math.Max(1, entry.CompressedLength) * 100) Invalid();
                // Read every entry: declared lengths alone cannot establish bounded decompression.
                using var source = entry.Open(); using var bounded = new MemoryStream();
                var buffer = new byte[81920]; int read; long actual = 0;
                while ((read = source.Read(buffer)) != 0)
                { actual += read; if (actual > entry.Length || actual > MaxXmlBytes) Invalid(); bounded.Write(buffer, 0, read); }
                if (actual != entry.Length) Invalid();
                if (name.EndsWith(".xml", StringComparison.OrdinalIgnoreCase) || name.EndsWith(".rels", StringComparison.OrdinalIgnoreCase))
                {
                    bounded.Position = 0; using var xml = SafeXml(bounded); var doc = XDocument.Load(xml);
                    if (doc.Descendants().Attributes().Any(a => a.Value.Contains("macroEnabled", StringComparison.OrdinalIgnoreCase)
                        || a.Value.Contains("vbaProject", StringComparison.OrdinalIgnoreCase)))
                        throw new AttachmentSecurityException("ATTACHMENT_TYPE_NOT_ALLOWED", 415);
                    parts.Add(name, doc);
                }
                else if (name.EndsWith('/'))
                { if (entry.Length != 0) Invalid(); }
                else
                {
                    // Current workbooks need XML parts and optionally raster media, never embedded programs/archives.
                    bounded.Position = 0;
                    if (!name.StartsWith("xl/media/", StringComparison.Ordinal) || !(name.EndsWith(".png", StringComparison.OrdinalIgnoreCase)
                        || name.EndsWith(".jpg", StringComparison.OrdinalIgnoreCase) || name.EndsWith(".jpeg", StringComparison.OrdinalIgnoreCase)))
                        throw new AttachmentSecurityException("ATTACHMENT_TYPE_NOT_ALLOWED", 415);
                    var detected = Detect(bounded);
                    if (detected is not (".png" or ".jpg")) Invalid();
                }
            }
            XNamespace main = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
            XNamespace rel = "http://schemas.openxmlformats.org/package/2006/relationships";
            XNamespace relDoc = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
            XNamespace types = "http://schemas.openxmlformats.org/package/2006/content-types";
            if (!parts.TryGetValue("[Content_Types].xml", out var content) || content.Root?.Name != types + "Types"
                || !content.Descendants(types + "Override").Any(x => (string?)x.Attribute("PartName") == "/xl/workbook.xml"
                    && (string?)x.Attribute("ContentType") == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml")
                || !parts.TryGetValue("xl/workbook.xml", out var workbook) || workbook.Root?.Name != main + "workbook"
                || !parts.TryGetValue("_rels/.rels", out var rootRelationships) || rootRelationships.Root?.Name != rel + "Relationships"
                || !rootRelationships.Descendants(rel + "Relationship").Any(x => (string?)x.Attribute("Type") == "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
                    && ((string?)x.Attribute("Target") is "xl/workbook.xml" or "/xl/workbook.xml") && (string?)x.Attribute("TargetMode") != "External")
                || !parts.TryGetValue("xl/_rels/workbook.xml.rels", out var relationships) || relationships.Root?.Name != rel + "Relationships") Invalid();
            var sheets = parts["xl/workbook.xml"].Descendants(main + "sheet").ToList();
            if (sheets.Count == 0) Invalid();
            foreach (var sheet in sheets)
            {
                var id = (string?)sheet.Attribute(relDoc + "id");
                var links = parts["xl/_rels/workbook.xml.rels"].Descendants(rel + "Relationship").Where(x => (string?)x.Attribute("Id") == id).ToList();
                if (id is null || links.Count != 1 || (string?)links[0].Attribute("TargetMode") == "External"
                    || (string?)links[0].Attribute("Type") != "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet") Invalid();
                var target = (string?)links[0].Attribute("Target") ?? "";
                if (target.Contains('\\') || target.Contains(':') || target.Split('/').Any(x => x is ".." or ".")) Invalid();
                var path = target.TrimStart('/'); if (!path.StartsWith("xl/", StringComparison.Ordinal)) path = "xl/" + path;
                if (!parts.TryGetValue(path, out var worksheet) || worksheet.Root?.Name != main + "worksheet") Invalid();
            }
        }
        catch (AttachmentSecurityException) { throw; }
        catch (Exception e) when (e is InvalidDataException or XmlException or ArgumentException or IOException or NotSupportedException) { Invalid(); }
    }

    public async Task<FileStream> OpenVerifiedAsync(Attachment item, CancellationToken ct)
    {
        var path = FinalPath(item.StoredFileName);
        if (!File.Exists(path)) throw new AttachmentSecurityException("ATTACHMENT_FILE_NOT_FOUND", 404);
        FileStream stream;
        try { stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read); }
        catch (FileNotFoundException) { throw new AttachmentSecurityException("ATTACHMENT_FILE_NOT_FOUND", 404); }
        try
        {
            if (!Types.TryGetValue(Path.GetExtension(item.StoredFileName), out var mime) || mime != item.ContentType
                || stream.Length == 0 || stream.Length > MaxFileBytes || stream.Length != item.FileSize
                || !string.Equals(Convert.ToHexString(await SHA256.HashDataAsync(stream, ct)), item.FileHash, StringComparison.OrdinalIgnoreCase))
            {
                logger.LogWarning("Attachment integrity failed for {AttachmentId}", item.Id);
                throw new AttachmentSecurityException("ATTACHMENT_INTEGRITY_FAILED", 409);
            }
            // Revalidate legacy bytes as well: a matching legacy hash is not proof of an allowed type.
            stream.Position = 0;
            if (Detect(stream) != Path.GetExtension(item.StoredFileName)) throw new AttachmentSecurityException("ATTACHMENT_TYPE_MISMATCH", 415);
            stream.Position = 0; return stream;
        }
        catch { await stream.DisposeAsync(); throw; }
    }
    internal void Cleanup(string path)
    {
        try { File.Delete(path); }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException) { logger.LogWarning("Attachment physical cleanup failed"); }
    }
    public void DeleteFinal(string name) => Cleanup(FinalPath(name));
    public static AuditLog Audit(string action, Attachment item, Guid actor, AttachmentScanResult? scan = null) => new()
    {
        Action = action, EntityName = nameof(Attachment), EntityId = item.Id.ToString(), UserId = actor,
        NewValueJson = JsonSerializer.Serialize(new { attachmentId = item.Id, item.EntityType, item.EntityId, item.ContentType,
            item.FileSize, item.FileHash, scanCategory = scan?.ToString() })
    };
}

// Owns files until the request's single database save succeeds, including commerce imports.
public sealed class ValidatedAttachment(AttachmentSecurityService storage, string stagedPath, string storedName,
    string originalName, string mime, long size, string hash, AttachmentScanResult scan) : IDisposable
{
    private bool promoted, complete;
    public string StagedPath { get; } = stagedPath;
    public Attachment CreateMetadata(string entityType, Guid entityId, string documentType, Guid actor, string? description = null) => new()
    { EntityType = entityType, EntityId = entityId, DocumentType = documentType, UploadedBy = actor, Description = description,
        StoredFileName = storedName, OriginalFileName = originalName, ContentType = mime, FileSize = size, FileHash = hash };
    public AuditLog UploadAudit(Attachment item, Guid actor) => AttachmentSecurityService.Audit("AttachmentUploaded", item, actor, scan);
    public void Promote() { File.Move(StagedPath, storage.FinalPath(storedName)); promoted = true; }
    public void Complete() => complete = true;
    public void Dispose() { storage.Cleanup(StagedPath); if (promoted && !complete) storage.DeleteFinal(storedName); }
}
