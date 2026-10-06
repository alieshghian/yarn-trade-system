using System.IO.Compression;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;
using YarnTrade.Api.Services;

namespace YarnTrade.Tests;

public sealed partial class SecurityBaselineTests
{
    private static byte[] A7Pdf()
    {
        var text = new StringBuilder("%PDF-1.4\n"); var offsets = new List<int>();
        foreach (var body in new[] { "<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 10] /Resources << >> /Contents 4 0 R >>", "<< /Length 0 >>\nstream\n\nendstream" })
        { offsets.Add(text.Length); text.Append($"{offsets.Count} 0 obj\n{body}\nendobj\n"); }
        var xref = text.Length; text.Append("xref\n0 5\n0000000000 65535 f \n");
        foreach (var offset in offsets) text.Append(offset.ToString("D10", System.Globalization.CultureInfo.InvariantCulture)).Append(" 00000 n \n");
        text.Append($"trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n"); return Encoding.ASCII.GetBytes(text.ToString());
    }
    private static byte[] A7Png() => Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=");
    private static byte[] A7Jpeg()
    {
        // Valid baseline 1x1 gray JPEG: zero DC coefficient and AC end-of-block.
        var bytes = new List<byte> { 0xff, 0xd8, 0xff, 0xdb, 0, 67, 0 }; bytes.AddRange(Enumerable.Repeat((byte)1, 64));
        bytes.AddRange(new byte[] { 0xff, 0xc0, 0, 11, 8, 0, 1, 0, 1, 1, 1, 0x11, 0 });
        foreach (var table in new byte[] { 0, 0x10 })
        { bytes.AddRange(new byte[] { 0xff, 0xc4, 0, 20, table, 1 }); bytes.AddRange(new byte[15]); bytes.Add(0); }
        bytes.AddRange(new byte[] { 0xff, 0xda, 0, 8, 1, 1, 0, 0, 63, 0, 0x3f, 0xff, 0xd9 }); return bytes.ToArray();
    }
    private static byte[] A7File(string kind) => kind switch
    {
        "pdf" => A7Pdf(), "png" => A7Png(), "jpg" => A7Jpeg(), "xlsx" => A6RWorkbook(),
        "empty" => [], "exe" => Encoding.ASCII.GetBytes("MZ executable"), "html" => Encoding.ASCII.GetBytes("<html><script>alert(1)</script></html>"),
        "random" => Encoding.ASCII.GetBytes("not an office document"), "badzip" => [80, 75, 3, 4, 0, 0],
        "badpdf" => Encoding.ASCII.GetBytes("%PDF-1.4\nnot a document"), "badpng" => [137, 80, 78, 71, 13, 10, 26, 10],
        "badjpg" => [0xff, 0xd8, 0xff],
        _ => A7Workbook(kind)
    };
    private static byte[] A7Workbook(string attack)
    {
        using var input = new MemoryStream(A6RWorkbook()); using var original = new ZipArchive(input);
        using var output = new MemoryStream();
        using (var zip = new ZipArchive(output, ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (var entry in original.Entries)
            {
                if (attack == "zip" || (attack == "missingpart" && entry.FullName == "[Content_Types].xml")) continue;
                using var source = new StreamReader(entry.Open()); var text = source.ReadToEnd();
                if (attack == "macro" && entry.FullName == "[Content_Types].xml") text = text.Replace("spreadsheetml.sheet.main+xml", "ms-excel.sheet.macroEnabled.main+xml");
                if (attack == "parser" && entry.FullName == "xl/workbook.xml") text = text.Replace("name=\"invoice\"", "name=\"other\"");
                if (attack == "dtd" && entry.FullName == "xl/workbook.xml") text = "<!DOCTYPE workbook [<!ENTITY external SYSTEM 'file:///C:/Windows/win.ini'>]>" + text;
                if (attack == "externalsheet" && entry.FullName.EndsWith(".rels")) text = text.Replace("Target=", "TargetMode=\"External\" Target=");
                if (attack == "reltraversal" && entry.FullName.EndsWith(".rels")) text = text.Replace("worksheets/sheet1.xml", "../outside.xml");
                using var writer = new StreamWriter(zip.CreateEntry(entry.FullName).Open()); writer.Write(text);
            }
            void Add(string name, string value) { using var writer = new StreamWriter(zip.CreateEntry(name).Open()); writer.Write(value); }
            if (attack == "zip") Add("document.txt", "not OOXML");
            if (attack == "traversal") Add("../outside.xml", "<x/>");
            if (attack == "backslash") Add("xl\\evil.xml", "<x/>");
            if (attack == "vba") Add("xl/vbaProject.bin", "macro");
            if (attack == "embeddedexe") Add("xl/embeddings/payload.exe", "MZ payload");
            if (attack == "duplicate") Add("xl/workbook.xml", "<x/>");
            if (attack == "expansion") Add("xl/bomb.xml", "<x>" + new string('a', 1_000_000) + "</x>");
            if (attack == "entries") for (var i = 0; i <= AttachmentSecurityService.MaxZipEntries; i++) Add($"xl/x{i}.xml", "<x/>");
            if (attack == "oversizedpart") Add("xl/large.xml", new string('x', (int)AttachmentSecurityService.MaxXmlBytes + 1));
        }
        return output.ToArray();
    }
    private static async Task<A7Fixture> A7Create(IAttachmentScanner? scanner = null, bool require = false, string role = "Administrator", IInterceptor? interceptor = null, string? sqlConnection = null)
    {
        var host = await CreateApp(new() { ["Attachments:RequireMalwareScan"] = require.ToString(), ["Security:Uploads:PermitLimit"] = "1000" },
            attachmentScanner: scanner, sqlInterceptor: interceptor, sqlConnection: sqlConnection, sqlRetries: sqlConnection is not null);
        var root = Path.Combine(Path.GetTempPath(), "YarnTrade_A7_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root); host.App.Environment.ContentRootPath = root;
        try
        {
            await CreateUser(host.App, "a7@example.test", role); await SignIn(host, "a7@example.test");
            using var scope = host.App.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var actor = await db.Users.SingleAsync(x => x.Email == "a7@example.test");
            var supplier = new Person { PersonCode = "A7", DisplayName = "Supplier" }; db.Persons.Add(supplier);
            var order = new PurchaseOrder { OrderNumber = "A7-ORDER", RequestedByUserId = actor.Id, PreferredSupplierId = supplier.Id, Status = PurchaseOrderStatus.InCommerce, RowVersion = new byte[8] };
            var invoice = new PurchaseInvoice { InternalNumber = "A7-INVOICE", SupplierId = supplier.Id, Status = DocumentStatus.Draft, RowVersion = new byte[8] };
            db.PurchaseOrders.Add(order); db.PurchaseInvoices.Add(invoice); await db.SaveChangesAsync();
            return new(host, root, order, invoice, actor.Id);
        }
        catch { await host.DisposeAsync(); Directory.Delete(root, recursive: true); throw; }
    }
    private sealed record A7Fixture(TestApp Host, string Root, PurchaseOrder Order, PurchaseInvoice Invoice, Guid Actor) : IAsyncDisposable
    {
        public string Storage => Path.Combine(Root, "App_Data", "attachments");
        public List<string> FinalFiles => Directory.Exists(Storage) ? Directory.GetFiles(Storage).ToList() : [];
        public void NoQuarantine() { var path = Path.Combine(Storage, "quarantine"); if (Directory.Exists(path)) Assert.Empty(Directory.GetFiles(path)); }
        public async Task<List<Attachment>> Rows()
        { using var scope = Host.App.Services.CreateScope(); return await scope.ServiceProvider.GetRequiredService<AppDbContext>().Attachments.AsNoTracking().ToListAsync(); }
        public async ValueTask DisposeAsync()
        {
            await Host.DisposeAsync(); NoQuarantine();
            Assert.Equal(Path.GetTempPath().TrimEnd(Path.DirectorySeparatorChar), Path.GetDirectoryName(Root));
            Assert.Matches("^YarnTrade_A7_[0-9a-f]{32}$", Path.GetFileName(Root)); Directory.Delete(Root, recursive: true);
            Assert.False(Directory.Exists(Root));
        }
    }
    private static MultipartFormDataContent A7Form(byte[] bytes, string filename, string mime = "application/octet-stream", string? type = null, Guid? id = null)
    {
        var form = new MultipartFormDataContent(); var content = new ByteArrayContent(bytes); content.Headers.ContentType = new(mime);
        form.Add(content, "file", filename);
        if (type is not null) { form.Add(new StringContent(type), "entityType"); form.Add(new StringContent(id!.Value.ToString()), "entityId"); form.Add(new StringContent("Other"), "documentType"); }
        return form;
    }
    private static async Task<HttpResponseMessage> A7Upload(A7Fixture f, byte[] bytes, string filename = "document.pdf", string mime = "text/html", string type = nameof(PurchaseOrder), Guid? id = null)
    { using var form = A7Form(bytes, filename, mime, type, id ?? f.Order.Id); return await f.Host.Client.PostAsync("/api/attachments", form); }
    private static async Task A7Failure(HttpResponseMessage response, string code, int status)
    {
        Assert.Equal(status, (int)response.StatusCode); var text = await response.Content.ReadAsStringAsync();
        Assert.Equal(code, JsonDocument.Parse(text).RootElement.GetProperty("code").GetString());
        Assert.DoesNotContain("App_Data", text); Assert.DoesNotContain("C:\\", text);
    }

    [Theory]
    [InlineData("pdf", ".pdf", "application/pdf")]
    [InlineData("png", ".png", "image/png")]
    [InlineData("jpg", ".jpg", "image/jpeg")]
    [InlineData("xlsx", ".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")]
    public async Task A7_upload_detects_actual_content_and_ignores_spoofed_extension_and_mime(string kind, string extension, string mime)
    {
        await using var f = await A7Create(); var bytes = A7File(kind);
        var response = await A7Upload(f, bytes, "invoice.pdf.exe", "text/html"); Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var json = await response.Content.ReadAsStringAsync(); Assert.DoesNotContain("storedFileName", json); Assert.DoesNotContain("fileHash", json);
        var row = Assert.Single(await f.Rows()); Assert.Matches("^[0-9a-f]{32}" + RegexEscape(extension) + "$", row.StoredFileName);
        Assert.Equal(mime, row.ContentType); Assert.Equal(bytes.Length, row.FileSize); Assert.Equal(Convert.ToHexString(SHA256.HashData(bytes)), row.FileHash);
        Assert.Equal(f.Actor, row.UploadedBy); Assert.Single(f.FinalFiles); f.NoQuarantine();
        using var scope = f.Host.App.Services.CreateScope(); var audit = await scope.ServiceProvider.GetRequiredService<AppDbContext>().AuditLogs.SingleAsync();
        Assert.Equal("AttachmentUploaded", audit.Action); Assert.Equal(f.Actor, audit.UserId); Assert.Contains("Unavailable", audit.NewValueJson);
        Assert.DoesNotContain("Clean", audit.NewValueJson); Assert.DoesNotContain(f.Root, audit.NewValueJson);
    }
    private static string RegexEscape(string text) => System.Text.RegularExpressions.Regex.Escape(text);

    [Theory]
    [InlineData("empty", "ATTACHMENT_EMPTY", 400)]
    [InlineData("exe", "ATTACHMENT_TYPE_NOT_ALLOWED", 415)]
    [InlineData("html", "ATTACHMENT_TYPE_NOT_ALLOWED", 415)]
    [InlineData("random", "ATTACHMENT_TYPE_NOT_ALLOWED", 415)]
    [InlineData("badzip", "ATTACHMENT_INVALID_CONTENT", 422)]
    [InlineData("badpdf", "ATTACHMENT_INVALID_CONTENT", 422)]
    [InlineData("badpng", "ATTACHMENT_INVALID_CONTENT", 422)]
    [InlineData("badjpg", "ATTACHMENT_INVALID_CONTENT", 422)]
    [InlineData("zip", "ATTACHMENT_INVALID_CONTENT", 422)]
    [InlineData("missingpart", "ATTACHMENT_INVALID_CONTENT", 422)]
    [InlineData("macro", "ATTACHMENT_TYPE_NOT_ALLOWED", 415)]
    [InlineData("vba", "ATTACHMENT_TYPE_NOT_ALLOWED", 415)]
    [InlineData("embeddedexe", "ATTACHMENT_TYPE_NOT_ALLOWED", 415)]
    [InlineData("traversal", "ATTACHMENT_INVALID_CONTENT", 422)]
    [InlineData("backslash", "ATTACHMENT_INVALID_CONTENT", 422)]
    [InlineData("duplicate", "ATTACHMENT_INVALID_CONTENT", 422)]
    [InlineData("expansion", "ATTACHMENT_INVALID_CONTENT", 422)]
    [InlineData("entries", "ATTACHMENT_INVALID_CONTENT", 422)]
    [InlineData("oversizedpart", "ATTACHMENT_INVALID_CONTENT", 422)]
    [InlineData("dtd", "ATTACHMENT_INVALID_CONTENT", 422)]
    [InlineData("reltraversal", "ATTACHMENT_INVALID_CONTENT", 422)]
    [InlineData("externalsheet", "ATTACHMENT_INVALID_CONTENT", 422)]
    public async Task A7_unsafe_generic_upload_is_rejected_and_cleaned(string kind, string code, int status)
    {
        await using var f = await A7Create(); await A7Failure(await A7Upload(f, A7File(kind), "invoice.xlsx", "application/pdf"), code, status);
        Assert.Empty(await f.Rows()); Assert.Empty(f.FinalFiles); f.NoQuarantine();
    }

    [Fact]
    public async Task A7_file_limit_is_enforced_independently_of_request_size_and_declared_length()
    {
        await using var f = await A7Create(); using var scope = f.Host.App.Services.CreateScope(); var service = scope.ServiceProvider.GetRequiredService<AttachmentSecurityService>();
        foreach (var declared in new[] { AttachmentSecurityService.MaxFileBytes + 1, 1L })
        {
            using var stream = new MemoryStream(new byte[AttachmentSecurityService.MaxFileBytes + 1]);
            var file = new FormFile(stream, 0, declared, "file", "too-large.pdf");
            // FormFile bounds its stream to Length; use an adversarial IFormFile for actual > declared.
            IFormFile upload = declared == 1 ? new A7LyingFile(stream) : file;
            var error = await Assert.ThrowsAsync<AttachmentSecurityException>(() => service.StageAsync(upload, default));
            Assert.Equal("ATTACHMENT_TOO_LARGE", error.Code); Assert.Equal(413, error.Status); f.NoQuarantine(); Assert.Empty(f.FinalFiles);
        }
    }
    private sealed class A7LyingFile(Stream source) : IFormFile
    {
        public string ContentType => "application/pdf"; public string ContentDisposition => ""; public IHeaderDictionary Headers => new HeaderDictionary();
        public long Length => 1; public string Name => "file"; public string FileName => "too-large.pdf";
        public Stream OpenReadStream() => source; public void CopyTo(Stream target) => source.CopyTo(target);
        public Task CopyToAsync(Stream target, CancellationToken ct = default) => source.CopyToAsync(target, ct);
    }

    [Theory]
    [InlineData("../../document.pdf")]
    [InlineData("C:\\fakepath\\document.pdf")]
    [InlineData("\\\\server\\share\\document.pdf")]
    [InlineData("\r\n\0file.pdf. ")]
    [InlineData("..")]
    [InlineData("e\u0301.pdf")]
    public async Task A7_display_name_is_safe_and_never_used_for_storage(string name)
    {
        await using var f = await A7Create(); using var scope = f.Host.App.Services.CreateScope();
        var file = new FormFile(new MemoryStream(A7Pdf()), 0, A7Pdf().Length, "file", name);
        using var validated = await scope.ServiceProvider.GetRequiredService<AttachmentSecurityService>().StageAsync(file, default);
        var row = validated.CreateMetadata(nameof(PurchaseOrder), f.Order.Id, "Other", f.Actor);
        Assert.DoesNotContain('/', row.OriginalFileName); Assert.DoesNotContain('\\', row.OriginalFileName); Assert.DoesNotContain(':', row.OriginalFileName);
        Assert.DoesNotContain(row.OriginalFileName, char.IsControl); Assert.False(row.OriginalFileName.EndsWith('.')); Assert.NotEmpty(row.OriginalFileName);
        Assert.True(row.OriginalFileName.IsNormalized()); Assert.Matches("^[0-9a-f]{32}\\.pdf$", row.StoredFileName);
    }

    [Theory]
    [InlineData(AttachmentScanResult.Rejected, false, 422, "ATTACHMENT_SCANNER_REJECTED")]
    [InlineData(AttachmentScanResult.Unavailable, true, 503, "ATTACHMENT_SCANNER_UNAVAILABLE")]
    [InlineData(AttachmentScanResult.Unavailable, false, 200, null)]
    [InlineData(AttachmentScanResult.Clean, true, 200, null)]
    public async Task A7_scanner_seam_is_explicit_and_fail_closed_when_required(AttachmentScanResult scan, bool require, int status, string? code)
    {
        var scanner = new A7Scanner(scan); await using var f = await A7Create(scanner, require);
        var response = await A7Upload(f, A7Pdf()); Assert.Equal(status, (int)response.StatusCode); Assert.True(scanner.SawQuarantine);
        f.NoQuarantine();
        if (code is not null) { await A7Failure(response, code, status); Assert.Empty(await f.Rows()); Assert.Empty(f.FinalFiles); }
        else { Assert.Single(await f.Rows()); Assert.Single(f.FinalFiles); }
    }
    private sealed class A7Scanner(AttachmentScanResult result, bool throws = false) : IAttachmentScanner
    {
        public bool SawQuarantine { get; private set; }
        public Task<AttachmentScanResult> ScanAsync(string path, CancellationToken ct)
        { SawQuarantine = File.Exists(path) && Path.GetFileName(Path.GetDirectoryName(path)) == "quarantine" && Path.GetExtension(path) == "";
            if (throws) throw new IOException("scanner-private-details"); return Task.FromResult(result); }
    }

    [Fact]
    public async Task A7_scanner_exception_is_safe_unavailable_and_no_provider_never_claims_clean()
    {
        Assert.Equal(AttachmentScanResult.Unavailable, await new UnconfiguredAttachmentScanner().ScanAsync("unused", default));
        await using var f = await A7Create(new A7Scanner(AttachmentScanResult.Clean, throws: true), require: true);
        await A7Failure(await A7Upload(f, A7Pdf()), "ATTACHMENT_SCANNER_UNAVAILABLE", 503); Assert.Empty(f.FinalFiles); f.NoQuarantine();
        Assert.DoesNotContain(f.Host.Logs.Messages, x => x.Contains("scanner-private-details"));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task A7_valid_import_preserves_mapping_server_actor_and_canonical_metadata(bool commerce)
    {
        await using var f = await A7Create(); var bytes = A6RWorkbook(); var response = await A7Import(f, bytes, commerce, "invoice.bin");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode); var imported = (await response.Content.ReadFromJsonAsync<ImportedPurchase>())!;
        Assert.Single(imported.Invoice.Items); Assert.Equal(5m, imported.Invoice.TotalNetWeight); Assert.Equal(f.Invoice.SupplierId, imported.Invoice.SupplierId);
        var row = Assert.Single(await f.Rows()); Assert.Equal(imported.Invoice.Id, row.EntityId); Assert.Equal(f.Actor, row.UploadedBy);
        Assert.Equal("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", row.ContentType); Assert.EndsWith(".xlsx", row.StoredFileName);
        Assert.Equal(Convert.ToHexString(SHA256.HashData(bytes)), row.FileHash); f.NoQuarantine();
        using var scope = f.Host.App.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal(f.Actor, (await db.AuditLogs.SingleAsync(x => x.Action == "AttachmentUploaded")).UserId);
        if (commerce) { Assert.Equal(f.Order.Id, imported.Invoice.PurchaseOrderId); Assert.Equal(f.Order.OrderNumber, imported.Invoice.OrderNumber); Assert.NotNull(imported.RowVersion); }
    }
    private static async Task<HttpResponseMessage> A7Import(A7Fixture f, byte[] bytes, bool commerce, string filename = "invoice.xlsx")
    {
        using var form = A7Form(bytes, filename, "text/html"); form.Add(new StringContent(f.Invoice.SupplierId.ToString()), "supplierId");
        form.Add(new StringContent(Guid.NewGuid().ToString()), "uploadedBy");
        var route = commerce ? A4Version($"/api/commerce/orders/{f.Order.Id}/import", f.Order.RowVersion) : "/api/purchases/import";
        return await f.Host.Client.PostAsync(route, form);
    }
    public static IEnumerable<object[]> A7ImportAttacks()
    {
        foreach (var commerce in new[] { false, true })
        foreach (var kind in new[] { "exe", "random", "badzip", "zip", "macro", "vba", "embeddedexe", "traversal", "expansion", "entries", "oversizedpart", "dtd", "parser", "pdf" })
            yield return [commerce, kind];
    }
    [Theory, MemberData(nameof(A7ImportAttacks))]
    public async Task A7_both_import_routes_reject_unsafe_input_before_final_storage(bool commerce, string kind)
    {
        await using var f = await A7Create(); var response = await A7Import(f, A7File(kind), commerce);
        var code = kind is "exe" or "random" or "macro" or "vba" or "embeddedexe" ? "ATTACHMENT_TYPE_NOT_ALLOWED" : kind == "pdf" ? "ATTACHMENT_TYPE_MISMATCH" : "ATTACHMENT_INVALID_CONTENT";
        await A7Failure(response, code, code is "ATTACHMENT_TYPE_NOT_ALLOWED" or "ATTACHMENT_TYPE_MISMATCH" ? 415 : 422);
        Assert.Empty(await f.Rows()); Assert.Empty(f.FinalFiles); f.NoQuarantine();
        using var scope = f.Host.App.Services.CreateScope(); Assert.Single(await scope.ServiceProvider.GetRequiredService<AppDbContext>().PurchaseInvoices.ToListAsync());
    }

    [Theory]
    [InlineData("Unknown", false, "ATTACHMENT_ENTITY_NOT_SUPPORTED", 400)]
    [InlineData("MoneyDocument", false, "ATTACHMENT_ENTITY_NOT_SUPPORTED", 400)]
    [InlineData("PurchaseOrder", false, "ATTACHMENT_ENTITY_NOT_FOUND", 404)]
    [InlineData("PurchaseInvoice", false, "ATTACHMENT_ENTITY_NOT_FOUND", 404)]
    [InlineData("PurchaseOrder", true, null, 200)]
    [InlineData("PurchaseInvoice", true, null, 200)]
    public async Task A7_parent_allowlist_and_existence_apply_to_all_operations(string type, bool exists, string? code, int status)
    {
        await using var f = await A7Create(); var id = exists ? type == "PurchaseOrder" ? f.Order.Id : f.Invoice.Id : Guid.NewGuid();
        var upload = await A7Upload(f, A7Pdf(), type: type, id: id); Assert.Equal(status, (int)upload.StatusCode);
        var list = await f.Host.Client.GetAsync($"/api/attachments?entityType={type}&entityId={id}"); Assert.Equal(status, (int)list.StatusCode);
        if (code is null) return;
        await A7Failure(upload, code, status); await A7Failure(list, code, status); Assert.Empty(f.FinalFiles);
        using (var scope = f.Host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>(); db.Attachments.Add(new Attachment { EntityType = type, EntityId = id, DocumentType = "Other",
                OriginalFileName = "fake.pdf", StoredFileName = "../../appsettings.json", ContentType = "application/pdf", FileHash = "fake", UploadedBy = f.Actor }); await db.SaveChangesAsync();
        }
        var row = Assert.Single(await f.Rows());
        await A7Failure(await f.Host.Client.GetAsync($"/api/attachments/{row.Id}"), code, status);
        await A7Failure(await f.Host.Client.DeleteAsync($"/api/attachments/{row.Id}"), code, status);
        Assert.Single(await f.Rows());
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task A7_anonymous_and_wrong_permission_cannot_operate_on_existing_attachment(bool anonymous)
    {
        await using var f = await A7Create(); Assert.Equal(HttpStatusCode.OK, (await A7Upload(f, A7Pdf())).StatusCode); var row = Assert.Single(await f.Rows());
        if (anonymous) f.Host.Client.DefaultRequestHeaders.Authorization = null;
        else await SetPermissions(f.Host, "a7@example.test");
        var expected = anonymous ? HttpStatusCode.Unauthorized : HttpStatusCode.Forbidden;
        Assert.Equal(expected, (await A7Upload(f, A7Pdf())).StatusCode);
        Assert.Equal(expected, (await f.Host.Client.GetAsync($"/api/attachments?entityType=PurchaseOrder&entityId={f.Order.Id}")).StatusCode);
        Assert.Equal(expected, (await f.Host.Client.GetAsync($"/api/attachments/{row.Id}")).StatusCode);
        Assert.Equal(expected, (await f.Host.Client.DeleteAsync($"/api/attachments/{row.Id}")).StatusCode);
        Assert.Single(await f.Rows()); Assert.Single(f.FinalFiles);
    }

    [Fact]
    public async Task A7_read_permission_does_not_grant_write_and_revocation_blocks_direct_id()
    {
        await using var f = await A7Create(); await A7Upload(f, A7Pdf()); var row = Assert.Single(await f.Rows());
        await SetPermissions(f.Host, "a7@example.test", "commerce.view");
        Assert.Equal(HttpStatusCode.OK, (await f.Host.Client.GetAsync($"/api/attachments/{row.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await A7Upload(f, A7Pdf())).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await f.Host.Client.DeleteAsync($"/api/attachments/{row.Id}")).StatusCode);
        await SetPermissions(f.Host, "a7@example.test", "commerce.upload");
        Assert.Equal(HttpStatusCode.Forbidden, (await f.Host.Client.GetAsync($"/api/attachments/{row.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await f.Host.Client.DeleteAsync($"/api/attachments/{row.Id}")).StatusCode);
    }

    [Theory]
    [InlineData(true, true)]
    [InlineData(true, false)]
    [InlineData(false, true)]
    [InlineData(false, false)]
    public async Task A7_delete_preserves_existing_parent_editability_and_audits_actor(bool invoice, bool editable)
    {
        await using var f = await A7Create(); var type = invoice ? nameof(PurchaseInvoice) : nameof(PurchaseOrder); var id = invoice ? f.Invoice.Id : f.Order.Id;
        await A7Upload(f, A7Pdf(), type: type, id: id); var row = Assert.Single(await f.Rows());
        if (!editable)
        {
            using var scope = f.Host.App.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            if (invoice) (await db.PurchaseInvoices.FindAsync(id))!.Status = DocumentStatus.Posted;
            else (await db.PurchaseOrders.FindAsync(id))!.Status = PurchaseOrderStatus.Completed;
            await db.SaveChangesAsync();
        }
        var response = await f.Host.Client.DeleteAsync($"/api/attachments/{row.Id}"); Assert.Equal(editable ? HttpStatusCode.NoContent : HttpStatusCode.Conflict, response.StatusCode);
        if (editable)
        {
            Assert.Empty(await f.Rows()); Assert.Empty(f.FinalFiles); using var scope = f.Host.App.Services.CreateScope();
            Assert.Equal(f.Actor, (await scope.ServiceProvider.GetRequiredService<AppDbContext>().AuditLogs.SingleAsync(x => x.Action == "AttachmentDeleted")).UserId);
        }
        else { Assert.Single(await f.Rows()); Assert.Single(f.FinalFiles); }
    }

    [Fact]
    public async Task A7_download_has_safe_headers_dto_and_authenticated_audit()
    {
        await using var f = await A7Create(); await A7Upload(f, A7Pdf(), "مدرک.pdf"); var row = Assert.Single(await f.Rows());
        var response = await f.Host.Client.GetAsync($"/api/attachments/{row.Id}"); Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(A7Pdf(), await response.Content.ReadAsByteArrayAsync()); Assert.Equal("application/pdf", response.Content.Headers.ContentType!.MediaType);
        Assert.Equal("attachment", response.Content.Headers.ContentDisposition!.DispositionType); Assert.Equal("مدرک.pdf", response.Content.Headers.ContentDisposition.FileNameStar);
        Assert.True(response.Headers.CacheControl!.Private); Assert.True(response.Headers.CacheControl.NoStore); Assert.Equal(TimeSpan.Zero, response.Headers.CacheControl.MaxAge);
        Assert.Contains("no-cache", response.Headers.Pragma.Select(x => x.Name)); Assert.Equal("nosniff", response.Headers.GetValues("X-Content-Type-Options").Single());
        var list = await f.Host.Client.GetStringAsync($"/api/attachments?entityType=PurchaseOrder&entityId={f.Order.Id}"); Assert.DoesNotContain("storedFileName", list);
        Assert.DoesNotContain(row.StoredFileName, list); using var scope = f.Host.App.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal(f.Actor, (await db.AuditLogs.SingleAsync(x => x.Action == "AttachmentDownloaded")).UserId);
        // Workbench must use the same safe DTO, including imported invoice attachments.
        var workbench = await f.Host.Client.GetStringAsync($"/api/commerce/orders/{f.Order.Id}/workbench"); Assert.DoesNotContain("storedFileName", workbench);
    }

    [Theory]
    [InlineData("../../appsettings.json")]
    [InlineData("..\\..\\appsettings.json")]
    [InlineData("C:\\Windows\\win.ini")]
    [InlineData("\\\\server\\share\\secret.pdf")]
    [InlineData("quarantine/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")]
    public async Task A7_corrupt_database_storage_names_cannot_escape_root(string name)
    {
        await using var f = await A7Create(); await A7Upload(f, A7Pdf()); var row = Assert.Single(await f.Rows());
        await File.WriteAllTextAsync(Path.Combine(f.Root, "appsettings.json"), "outside-marker");
        using (var scope = f.Host.App.Services.CreateScope()) { var db = scope.ServiceProvider.GetRequiredService<AppDbContext>(); (await db.Attachments.FindAsync(row.Id))!.StoredFileName = name; await db.SaveChangesAsync(); }
        var response = await f.Host.Client.GetAsync($"/api/attachments/{row.Id}"); await A7Failure(response, "ATTACHMENT_INVALID_CONTENT", 422);
        Assert.DoesNotContain("outside-marker", await response.Content.ReadAsStringAsync());
        await A7Failure(await f.Host.Client.DeleteAsync($"/api/attachments/{row.Id}"), "ATTACHMENT_INVALID_CONTENT", 422);
        Assert.Equal("outside-marker", await File.ReadAllTextAsync(Path.Combine(f.Root, "appsettings.json")));
    }

    [Theory]
    [InlineData("missing", "ATTACHMENT_FILE_NOT_FOUND", 404)]
    [InlineData("tampered", "ATTACHMENT_INTEGRITY_FAILED", 409)]
    [InlineData("mime", "ATTACHMENT_INTEGRITY_FAILED", 409)]
    public async Task A7_download_refuses_missing_corrupt_or_noncanonical_files(string attack, string code, int status)
    {
        await using var f = await A7Create(); await A7Upload(f, A7Pdf()); var row = Assert.Single(await f.Rows()); var path = Path.Combine(f.Storage, row.StoredFileName);
        if (attack == "missing") File.Delete(path);
        if (attack == "tampered") { var bytes = A7Pdf(); bytes[15] ^= 1; await File.WriteAllBytesAsync(path, bytes); }
        if (attack == "mime") { using var scope = f.Host.App.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<AppDbContext>(); (await db.Attachments.FindAsync(row.Id))!.ContentType = "text/html"; await db.SaveChangesAsync(); }
        await A7Failure(await f.Host.Client.GetAsync($"/api/attachments/{row.Id}"), code, status);
        using var verify = f.Host.App.Services.CreateScope(); Assert.False(await verify.ServiceProvider.GetRequiredService<AppDbContext>().AuditLogs.AnyAsync(x => x.Action == "AttachmentDownloaded"));
        Assert.Equal(row.FileHash, Assert.Single(await f.Rows()).FileHash);
        if (attack != "missing") Assert.Contains(f.Host.Logs.Messages, x => x.Contains("integrity failed"));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task A7_corrupt_display_name_cannot_inject_download_headers(bool longName)
    {
        await using var f = await A7Create(); await A7Upload(f, A7Pdf()); var row = Assert.Single(await f.Rows());
        using (var scope = f.Host.App.Services.CreateScope()) { var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            (await db.Attachments.FindAsync(row.Id))!.OriginalFileName = longName ? new string('a', 500) : "../file\r\nX-Injected: value\0.pdf"; await db.SaveChangesAsync(); }
        var response = await f.Host.Client.GetAsync($"/api/attachments/{row.Id}"); Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.False(response.Headers.Contains("X-Injected")); var filename = response.Content.Headers.ContentDisposition!.FileNameStar!;
        Assert.DoesNotContain(filename, char.IsControl); Assert.DoesNotContain('/', filename); Assert.True(filename.Length <= 185);
    }

    [Theory]
    [InlineData("generic")]
    [InlineData("purchase")]
    [InlineData("commerce")]
    public async Task A7_database_save_failure_cleans_promoted_file_and_quarantine(string route)
    {
        var interceptor = new A7FailSave(); await using var f = await A7Create(interceptor: interceptor); interceptor.Armed = true;
        var response = route == "generic" ? await A7Upload(f, A7Pdf()) : await A7Import(f, A6RWorkbook(), route == "commerce");
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode); Assert.Empty(await f.Rows()); Assert.Empty(f.FinalFiles); f.NoQuarantine();
    }
    private sealed class A7FailSave : SaveChangesInterceptor
    {
        public bool Armed { get; set; }
        public override ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData data, InterceptionResult<int> result, CancellationToken ct = default)
        { if (Armed) throw new InvalidOperationException("test database save failure"); return ValueTask.FromResult(result); }
    }

    [Fact]
    public async Task A7_delete_filesystem_failure_leaves_no_downloadable_reference()
    {
        await using var f = await A7Create(); await A7Upload(f, A7Pdf()); var row = Assert.Single(await f.Rows()); var path = Path.Combine(f.Storage, row.StoredFileName);
        using (var locked = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read))
        {
            Assert.Equal(HttpStatusCode.NoContent, (await f.Host.Client.DeleteAsync($"/api/attachments/{row.Id}")).StatusCode);
            Assert.Empty(await f.Rows()); Assert.Equal(HttpStatusCode.NotFound, (await f.Host.Client.GetAsync($"/api/attachments/{row.Id}")).StatusCode);
            Assert.Contains(f.Host.Logs.Messages, x => x.Contains("physical cleanup failed"));
        }
        File.Delete(path);
    }

    [Theory]
    [InlineData("generic")]
    [InlineData("purchase")]
    [InlineData("commerce")]
    public async Task A7_sql_upload_import_download_delete_and_audit_use_real_metadata(string route)
    {
        await using var sql = await A4SqlDatabase.CreateLatest(); await using var f = await A7Create(sqlConnection: sql.Connection);
        var response = route == "generic" ? await A7Upload(f, A7Pdf()) : await A7Import(f, A6RWorkbook(), route == "commerce");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode); var row = Assert.Single(await f.Rows()); Assert.Equal(f.Actor, row.UploadedBy);
        Assert.Equal(HttpStatusCode.OK, (await f.Host.Client.GetAsync($"/api/attachments/{row.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await f.Host.Client.DeleteAsync($"/api/attachments/{row.Id}")).StatusCode);
        await using var db = sql.Context(); Assert.Empty(await db.Attachments.ToListAsync());
        var audit = await db.AuditLogs.Where(x => x.EntityId == row.Id.ToString()).ToListAsync();
        Assert.Equal(3, audit.Count); Assert.All(audit, x => Assert.Equal(f.Actor, x.UserId)); Assert.Empty(f.FinalFiles); f.NoQuarantine();
    }

    [Fact]
    public async Task A7_sql_commerce_import_late_order_conflict_cleans_file_and_rolls_back_metadata()
    {
        await using var sql = await A4SqlDatabase.CreateLatest(); var writer = new A7OrderWriter(sql);
        await using var f = await A7Create(sqlConnection: sql.Connection, interceptor: writer); writer.OrderId = f.Order.Id;
        var response = await A7Import(f, A6RWorkbook(), commerce: true);
        await A7Failure(response, "CONCURRENCY_CONFLICT", 409); Assert.Empty(await f.Rows()); Assert.Empty(f.FinalFiles); f.NoQuarantine();
        await using var db = sql.Context(); Assert.Single(await db.PurchaseInvoices.ToListAsync()); Assert.Empty(await db.AuditLogs.Where(x => x.Action == "AttachmentUploaded").ToListAsync());
        Assert.Equal("independent writer", (await db.PurchaseOrders.FindAsync(f.Order.Id))!.Notes);
    }
    private sealed class A7OrderWriter(A4SqlDatabase sql) : SaveChangesInterceptor
    {
        public Guid OrderId { get; set; }
        public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData data, InterceptionResult<int> result, CancellationToken ct = default)
        {
            if (OrderId != Guid.Empty && data.Context!.ChangeTracker.Entries<Attachment>().Any(x => x.State == EntityState.Added))
            { var id = OrderId; OrderId = Guid.Empty; await using var db = sql.Context(); (await db.PurchaseOrders.FindAsync([id], ct))!.Notes = "independent writer"; await db.SaveChangesAsync(ct); }
            return result;
        }
    }

    [Fact]
    public async Task A7_legacy_unsafe_bytes_with_matching_hash_are_still_not_downloadable()
    {
        await using var f = await A7Create(); await A7Upload(f, A7Pdf()); var row = Assert.Single(await f.Rows()); var bytes = A7File("exe");
        await File.WriteAllBytesAsync(Path.Combine(f.Storage, row.StoredFileName), bytes);
        using (var scope = f.Host.App.Services.CreateScope()) { var db = scope.ServiceProvider.GetRequiredService<AppDbContext>(); var legacy = (await db.Attachments.FindAsync(row.Id))!;
            legacy.FileSize = bytes.Length; legacy.FileHash = Convert.ToHexString(SHA256.HashData(bytes)); await db.SaveChangesAsync(); }
        await A7Failure(await f.Host.Client.GetAsync($"/api/attachments/{row.Id}"), "ATTACHMENT_TYPE_NOT_ALLOWED", 415);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task A7_upload_does_not_add_new_post_status_restrictions(bool invoice)
    {
        await using var f = await A7Create();
        using (var scope = f.Host.App.Services.CreateScope()) { var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            if (invoice) (await db.PurchaseInvoices.FindAsync(f.Invoice.Id))!.Status = DocumentStatus.Posted;
            else (await db.PurchaseOrders.FindAsync(f.Order.Id))!.Status = PurchaseOrderStatus.Completed; await db.SaveChangesAsync(); }
        Assert.Equal(HttpStatusCode.OK, (await A7Upload(f, A7Pdf(), type: invoice ? "PurchaseInvoice" : "PurchaseOrder", id: invoice ? f.Invoice.Id : f.Order.Id)).StatusCode);
        var row = Assert.Single(await f.Rows()); Assert.Equal(HttpStatusCode.Conflict, (await f.Host.Client.DeleteAsync($"/api/attachments/{row.Id}")).StatusCode);
    }

    [Fact]
    public async Task A7_submitted_order_keeps_existing_delete_rule()
    {
        await using var f = await A7Create();
        using (var scope = f.Host.App.Services.CreateScope()) { var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            (await db.PurchaseOrders.FindAsync(f.Order.Id))!.Status = PurchaseOrderStatus.SubmittedToCommerce; await db.SaveChangesAsync(); }
        await A7Upload(f, A7Pdf()); var row = Assert.Single(await f.Rows());
        Assert.Equal(HttpStatusCode.NoContent, (await f.Host.Client.DeleteAsync($"/api/attachments/{row.Id}")).StatusCode);
    }

    [Theory]
    [InlineData("invoice.bat")]
    [InlineData("invoice.pdf.exe")]
    [InlineData("invoice.cmd")]
    [InlineData("invoice.html")]
    public async Task A7_download_uses_canonical_extension_even_with_dangerous_display_extension(string name)
    {
        await using var f = await A7Create(); Assert.Equal(HttpStatusCode.OK, (await A7Upload(f, A7Pdf(), name)).StatusCode);
        var row = Assert.Single(await f.Rows()); Assert.Equal(name, row.OriginalFileName);
        var response = await f.Host.Client.GetAsync($"/api/attachments/{row.Id}"); Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.EndsWith(".pdf", response.Content.Headers.ContentDisposition!.FileNameStar); Assert.Equal("application/pdf", response.Content.Headers.ContentType!.MediaType);
    }
}
