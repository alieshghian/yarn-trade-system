using System.Globalization;
using System.IO.Compression;
using System.Xml;
using System.Xml.Linq;
using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;

namespace YarnTrade.Api.Services;

public sealed record ImportedPurchase(PurchaseInvoice Invoice, IReadOnlyList<string> Warnings, IReadOnlyList<ImportedFieldMap> Mapping, byte[]? RowVersion = null);
public sealed record ImportedFieldMap(string Sheet, string SourceCell, string TargetField, string Rule);

public sealed class XlsxPurchaseImporter(AppDbContext db, AttachmentSecurityService storage)
{
    public async Task<ImportedPurchase> ImportAsync(IFormFile file, Guid supplierId, Guid uploadedBy, CancellationToken ct, Action<PurchaseInvoice>? beforeSave = null)
    {
        using var validated = await storage.StageAsync(file, ct, xlsxOnly: true);
        try
        {
            await using var input = File.OpenRead(validated.StagedPath);
            var book = XlsxReader.Read(input);
            if (!book.TryGetValue("invoice", out var invoiceSheet)) throw new InvalidDataException("Workbook has no invoice sheet.");
            book.TryGetValue("packing list", out var packingSheet);
            var warnings = new List<string>();
            var mapping = new List<ImportedFieldMap>();

            string Get(string cell) => invoiceSheet.GetValueOrDefault(cell, string.Empty).Trim();
            var invoiceNumber = AfterColon(Get("H6"));
            var invoiceDate = ParseEnglishDate(AfterColon(Get("H5")), file.FileName);
            var count = await db.PurchaseInvoices.CountAsync(x => x.InvoiceDate.Year == invoiceDate.Year, ct) + 1;
            var result = new PurchaseInvoice
            {
                InternalNumber = $"PUR-{invoiceDate.Year}-{count:0000}", ExternalInvoiceNumber = invoiceNumber, InvoiceDate = invoiceDate, SupplierId = supplierId,
                BuyerName = Get("B5"), PaymentTerms = AfterColon(Get("H11")), OriginPort = AfterColon(Get("H12")), DestinationPort = AfterColon(Get("H13")),
                ShipmentMethod = AfterColon(Get("H14")), Currency = Currency.USD, Status = DocumentStatus.Draft,
                Notes = "Imported from Excel. Raw values are preserved in item descriptions/specifications and the original attachment."
            };
            mapping.AddRange([
                new("invoice", "H5", nameof(result.InvoiceDate), "Parse English textual date; persist Gregorian DateOnly"),
                new("invoice", "H6", nameof(result.ExternalInvoiceNumber), "Remove label before colon and trim"),
                new("invoice", "B5", nameof(result.BuyerName), "Preserve original multiline buyer text"),
                new("invoice", "H11:H14", "PaymentTerms/OriginPort/DestinationPort/ShipmentMethod", "Remove source labels; preserve text")]);

            for (var row = 17; row <= 200; row++)
            {
                var lineNoText = Get($"A{row}");
                var description = Get($"B{row}");
                if (lineNoText.StartsWith("TOTAL", StringComparison.OrdinalIgnoreCase))
                {
                    result.TotalNetWeight = Decimal(Get($"E{row}")); result.TotalPackages = (int)Decimal(Get($"F{row}")); result.GrandTotal = Decimal(Get($"I{row}"));
                    mapping.Add(new("invoice", $"E{row}/F{row}/I{row}", "TotalNetWeight/TotalPackages/GrandTotal", "Parse invariant decimals"));
                    break;
                }
                if (!int.TryParse(lineNoText, out var lineNo) || string.IsNullOrWhiteSpace(description)) continue;
                if (description.Contains("FREIGHT", StringComparison.OrdinalIgnoreCase))
                {
                    result.InternationalFreight += Decimal(Get($"I{row}"));
                    mapping.Add(new("invoice", $"B{row}:I{row}", nameof(result.InternationalFreight), "Freight row is a cost, never inventory"));
                    continue;
                }
                var item = new PurchaseInvoiceItem
                {
                    PurchaseInvoiceId = result.Id, LineNumber = lineNo, OriginalDescription = description, OriginalSpecification = Get($"C{row}"), Unit = Get($"D{row}") is { Length: > 0 } unit ? unit : "KG",
                    NetWeight = Decimal(Get($"E{row}")), PackageCount = (int)Decimal(Get($"F{row}")), UnitPriceUSD = Decimal(Get($"H{row}")), GoodsAmountUSD = Decimal(Get($"I{row}")), Notes = string.IsNullOrWhiteSpace(Get($"J{row}")) ? null : $"Container source: {Get($"J{row}")}"
                };
                if (packingSheet is not null)
                {
                    item.GrossWeight = Decimal(packingSheet.GetValueOrDefault($"G{row}", string.Empty));
                    var packingNet = Decimal(packingSheet.GetValueOrDefault($"H{row}", string.Empty));
                    if (packingNet > 0 && Math.Abs(packingNet - item.NetWeight) > 0.01m) warnings.Add($"Line {lineNo}: invoice and packing-list net weights differ.");
                }
                result.Items.Add(item);
                mapping.Add(new("invoice + packing list", $"A{row}:J{row}", $"Items[{lineNo}]", "Keep raw description/spec; quantity is net kg; gross kg comes from packing list"));
            }
            result.GoodsTotal = result.Items.Sum(x => x.GoodsAmountUSD);
            if (result.GrandTotal == 0) result.GrandTotal = result.GoodsTotal + result.InternationalFreight;
            if (packingSheet is not null)
            {
                var totalRow = Enumerable.Range(17, 200).FirstOrDefault(r => packingSheet.GetValueOrDefault($"A{r}", string.Empty).StartsWith("TOTAL", StringComparison.OrdinalIgnoreCase));
                if (totalRow > 0) result.TotalGrossWeight = Decimal(packingSheet.GetValueOrDefault($"G{totalRow}", string.Empty));
                var summary = packingSheet.Values.FirstOrDefault(x => x.Contains("TOTAL WEIGHT", StringComparison.OrdinalIgnoreCase));
                if (!string.IsNullOrWhiteSpace(summary) && summary.Contains($"G.W:{result.TotalNetWeight}", StringComparison.OrdinalIgnoreCase))
                    warnings.Add("Packing-list total-weight sentence appears to swap gross and net values; numeric columns were used.");
            }
            var bl = invoiceSheet.FirstOrDefault(x => x.Value.StartsWith("B/L NO", StringComparison.OrdinalIgnoreCase));
            if (!string.IsNullOrWhiteSpace(bl.Key)) result.BillOfLadingNumber = invoiceSheet.GetValueOrDefault($"B{CellRow(bl.Key)}", string.Empty);
            var delivery = invoiceSheet.FirstOrDefault(x => x.Value.StartsWith("DELIVERY TERMS", StringComparison.OrdinalIgnoreCase));
            result.DeliveryTerms = AfterColon(delivery.Value);
            var containerText = invoiceSheet.Values.FirstOrDefault(x => x.StartsWith("CONTAINER NO", StringComparison.OrdinalIgnoreCase));
            foreach (var number in AfterColon(containerText).Split('/', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries))
                result.Containers.Add(new PurchaseContainer { PurchaseInvoiceId = result.Id, ContainerNumber = number, BillOfLadingNumber = result.BillOfLadingNumber });

            var attachment = validated.CreateMetadata(nameof(PurchaseInvoice), result.Id, "PurchaseInvoice", uploadedBy);
            result.OriginalFileAttachmentId = attachment.Id;
            beforeSave?.Invoke(result);
            await input.DisposeAsync();
            validated.Promote();
            db.PurchaseInvoices.Add(result); db.Attachments.Add(attachment);
            db.AuditLogs.Add(validated.UploadAudit(attachment, uploadedBy));
            await db.SaveChangesAsync(ct);
            validated.Complete();
            return new(result, warnings, mapping);
        }
        catch (Exception e) when (e is InvalidDataException or XmlException or FormatException or ArgumentException or KeyNotFoundException or OverflowException)
        { throw new AttachmentSecurityException("ATTACHMENT_INVALID_CONTENT"); }
    }

    private static string AfterColon(string? value) { if (string.IsNullOrWhiteSpace(value)) return string.Empty; var i = value.IndexOf(':'); return (i >= 0 ? value[(i + 1)..] : value).Trim(); }
    private static decimal Decimal(string value) => decimal.TryParse(value.Replace(",", string.Empty).Replace("$", string.Empty), NumberStyles.Any, CultureInfo.InvariantCulture, out var number) ? number : 0m;
    private static int CellRow(string cell) => int.TryParse(new string(cell.Where(char.IsDigit).ToArray()), out var row) ? row : 0;
    private static DateOnly ParseEnglishDate(string text, string fileName)
    {
        var normalized = text.Replace("st", string.Empty, StringComparison.OrdinalIgnoreCase).Replace("nd", string.Empty, StringComparison.OrdinalIgnoreCase).Replace("rd", string.Empty, StringComparison.OrdinalIgnoreCase).Replace("th", string.Empty, StringComparison.OrdinalIgnoreCase);
        if (DateTime.TryParse(normalized, CultureInfo.GetCultureInfo("en-US"), DateTimeStyles.AllowWhiteSpaces, out var date)) return DateOnly.FromDateTime(date);
        var match = System.Text.RegularExpressions.Regex.Match(fileName, @"(?<y>20\d{2})[.-](?<m>\d{1,2})[.-](?<d>\d{1,2})");
        return match.Success ? new DateOnly(int.Parse(match.Groups["y"].Value), int.Parse(match.Groups["m"].Value), int.Parse(match.Groups["d"].Value)) : throw new InvalidDataException("Invoice date could not be parsed.");
    }
}

public static class XlsxReader
{
    private static readonly XNamespace Main = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    private static readonly XNamespace RelDoc = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    private static readonly XNamespace RelPkg = "http://schemas.openxmlformats.org/package/2006/relationships";

    public static Dictionary<string, Dictionary<string, string>> Read(Stream stream)
    {
        using var zip = new ZipArchive(stream, ZipArchiveMode.Read, true);
        var shared = ReadSharedStrings(zip);
        var rels = Load(zip, "xl/_rels/workbook.xml.rels").Root!.Elements(RelPkg + "Relationship").ToDictionary(x => (string)x.Attribute("Id")!, x => (string)x.Attribute("Target")!);
        var workbook = Load(zip, "xl/workbook.xml");
        var result = new Dictionary<string, Dictionary<string, string>>(StringComparer.OrdinalIgnoreCase);
        foreach (var sheet in workbook.Root!.Descendants(Main + "sheet"))
        {
            var name = (string)sheet.Attribute("name")!;
            var target = rels[(string)sheet.Attribute(RelDoc + "id")!].Replace('\\', '/').TrimStart('/');
            var path = target.StartsWith("xl/") ? target : $"xl/{target}";
            var doc = Load(zip, path);
            var cells = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var cell in doc.Root!.Descendants(Main + "c"))
            {
                var reference = (string)cell.Attribute("r")!;
                var type = (string?)cell.Attribute("t");
                var raw = cell.Element(Main + "v")?.Value ?? string.Concat(cell.Descendants(Main + "t").Select(x => x.Value));
                cells[reference] = type == "s" && int.TryParse(raw, out var index) && index < shared.Count ? shared[index] : raw;
            }
            result[name] = cells;
        }
        return result;
    }

    private static List<string> ReadSharedStrings(ZipArchive zip)
    {
        var entry = zip.GetEntry("xl/sharedStrings.xml");
        if (entry is null) return [];
        using var input = entry.Open();
        using var reader = AttachmentSecurityService.SafeXml(input);
        var doc = XDocument.Load(reader);
        return doc.Root!.Elements(Main + "si").Select(x => string.Concat(x.Descendants(Main + "t").Select(t => t.Value))).ToList();
    }
    private static XDocument Load(ZipArchive zip, string path) { using var input = zip.GetEntry(path)?.Open() ?? throw new InvalidDataException("Missing XLSX part."); using var reader = AttachmentSecurityService.SafeXml(input); return XDocument.Load(reader); }
}
