using System.Globalization;
using System.IO.Compression;
using System.Text;
using System.Xml;

namespace TextilePricingApp.Services;

public static class ExcelExportService
{
    public sealed record Cell(string? Text = null, decimal? Number = null, CellStyle Style = CellStyle.Text);

    public enum CellStyle
    {
        Text,
        Header,
        Money,
        Percent,
        PositiveChangePercent,
        NegativeChangePercent,
        ZeroChangePercent
    }

    public static byte[] CreateWorkbook(string sheetName, IReadOnlyList<IReadOnlyList<Cell>> rows)
    {
        using var output = new MemoryStream();
        using (var archive = new ZipArchive(output, ZipArchiveMode.Create, leaveOpen: true))
        {
            WriteEntry(archive, "[Content_Types].xml", writer =>
            {
                writer.WriteStartElement("Types", "http://schemas.openxmlformats.org/package/2006/content-types");
                writer.WriteStartElement("Default");
                writer.WriteAttributeString("Extension", "rels");
                writer.WriteAttributeString("ContentType", "application/vnd.openxmlformats-package.relationships+xml");
                writer.WriteEndElement();
                writer.WriteStartElement("Default");
                writer.WriteAttributeString("Extension", "xml");
                writer.WriteAttributeString("ContentType", "application/xml");
                writer.WriteEndElement();
                WriteOverride(writer, "/xl/workbook.xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml");
                WriteOverride(writer, "/xl/worksheets/sheet1.xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml");
                WriteOverride(writer, "/xl/styles.xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml");
                writer.WriteEndElement();
            });

            WriteEntry(archive, "_rels/.rels", writer =>
            {
                writer.WriteStartElement("Relationships", "http://schemas.openxmlformats.org/package/2006/relationships");
                WriteRelationship(writer, "rId1", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument", "xl/workbook.xml");
                writer.WriteEndElement();
            });

            WriteEntry(archive, "xl/workbook.xml", writer =>
            {
                writer.WriteStartElement("workbook", "http://schemas.openxmlformats.org/spreadsheetml/2006/main");
                writer.WriteAttributeString("xmlns", "r", null, "http://schemas.openxmlformats.org/officeDocument/2006/relationships");
                writer.WriteStartElement("sheets");
                writer.WriteStartElement("sheet");
                writer.WriteAttributeString("name", SanitizeSheetName(sheetName));
                writer.WriteAttributeString("sheetId", "1");
                writer.WriteAttributeString("r", "id", "http://schemas.openxmlformats.org/officeDocument/2006/relationships", "rId1");
                writer.WriteEndElement();
                writer.WriteEndElement();
                writer.WriteEndElement();
            });

            WriteEntry(archive, "xl/_rels/workbook.xml.rels", writer =>
            {
                writer.WriteStartElement("Relationships", "http://schemas.openxmlformats.org/package/2006/relationships");
                WriteRelationship(writer, "rId1", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet", "worksheets/sheet1.xml");
                WriteRelationship(writer, "rId2", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles", "styles.xml");
                writer.WriteEndElement();
            });

            WriteEntry(archive, "xl/styles.xml", WriteStyles);
            WriteEntry(archive, "xl/worksheets/sheet1.xml", writer => WriteSheet(writer, rows));
        }

        return output.ToArray();
    }

    private static void WriteSheet(XmlWriter writer, IReadOnlyList<IReadOnlyList<Cell>> rows)
    {
        writer.WriteStartElement("worksheet", "http://schemas.openxmlformats.org/spreadsheetml/2006/main");
        writer.WriteStartElement("sheetViews");
        writer.WriteStartElement("sheetView");
        writer.WriteAttributeString("workbookViewId", "0");
        writer.WriteAttributeString("rightToLeft", "1");
        writer.WriteEndElement();
        writer.WriteEndElement();
        writer.WriteStartElement("sheetFormatPr");
        writer.WriteAttributeString("defaultRowHeight", "20");
        writer.WriteEndElement();
        writer.WriteStartElement("cols");
        var widths = new[] { 16m, 34m, 25m, 25m, 29m, 29m, 22m };
        for (var index = 0; index < widths.Length; index++)
        {
            writer.WriteStartElement("col");
            writer.WriteAttributeString("min", (index + 1).ToString(CultureInfo.InvariantCulture));
            writer.WriteAttributeString("max", (index + 1).ToString(CultureInfo.InvariantCulture));
            writer.WriteAttributeString("width", widths[index].ToString(CultureInfo.InvariantCulture));
            writer.WriteAttributeString("customWidth", "1");
            writer.WriteEndElement();
        }
        writer.WriteEndElement();
        writer.WriteStartElement("sheetData");

        for (var rowIndex = 0; rowIndex < rows.Count; rowIndex++)
        {
            writer.WriteStartElement("row");
            writer.WriteAttributeString("r", (rowIndex + 1).ToString(CultureInfo.InvariantCulture));
            var row = rows[rowIndex];
            for (var columnIndex = 0; columnIndex < row.Count; columnIndex++)
            {
                WriteCell(writer, row[columnIndex], CellReference(columnIndex, rowIndex + 1));
            }
            writer.WriteEndElement();
        }

        writer.WriteEndElement();
        writer.WriteStartElement("autoFilter");
        var columnCount = rows.Count == 0 ? 1 : Math.Max(1, rows.Max(row => row.Count));
        writer.WriteAttributeString("ref", $"A1:{CellReference(columnCount - 1, Math.Max(1, rows.Count))}");
        writer.WriteEndElement();
        writer.WriteEndElement();
    }

    private static void WriteCell(XmlWriter writer, Cell cell, string reference)
    {
        writer.WriteStartElement("c");
        writer.WriteAttributeString("r", reference);
        writer.WriteAttributeString("s", ((int)cell.Style).ToString(CultureInfo.InvariantCulture));
        if (cell.Number is not null)
        {
            writer.WriteElementString("v", cell.Number.Value.ToString(CultureInfo.InvariantCulture));
        }
        else
        {
            writer.WriteAttributeString("t", "inlineStr");
            writer.WriteStartElement("is");
            writer.WriteElementString("t", cell.Text ?? "");
            writer.WriteEndElement();
        }
        writer.WriteEndElement();
    }

    private static void WriteStyles(XmlWriter writer)
    {
        writer.WriteStartElement("styleSheet", "http://schemas.openxmlformats.org/spreadsheetml/2006/main");
        writer.WriteStartElement("numFmts");
        writer.WriteAttributeString("count", "1");
        writer.WriteStartElement("numFmt");
        writer.WriteAttributeString("numFmtId", "164");
        writer.WriteAttributeString("formatCode", "+0.00%;-0.00%;0.00%");
        writer.WriteEndElement();
        writer.WriteEndElement();
        writer.WriteStartElement("fonts");
        writer.WriteAttributeString("count", "4");
        WriteFont(writer, bold: false);
        WriteFont(writer, bold: true);
        WriteFont(writer, bold: false, color: "FF008000");
        WriteFont(writer, bold: false, color: "FFC00000");
        writer.WriteEndElement();
        writer.WriteStartElement("fills");
        writer.WriteAttributeString("count", "2");
        writer.WriteStartElement("fill"); writer.WriteStartElement("patternFill"); writer.WriteAttributeString("patternType", "none"); writer.WriteEndElement(); writer.WriteEndElement();
        writer.WriteStartElement("fill"); writer.WriteStartElement("patternFill"); writer.WriteAttributeString("patternType", "solid"); writer.WriteStartElement("fgColor"); writer.WriteAttributeString("rgb", "FFD9EAF7"); writer.WriteEndElement(); writer.WriteStartElement("bgColor"); writer.WriteAttributeString("indexed", "64"); writer.WriteEndElement(); writer.WriteEndElement(); writer.WriteEndElement();
        writer.WriteEndElement();
        writer.WriteStartElement("borders");
        writer.WriteAttributeString("count", "1");
        writer.WriteStartElement("border");
        foreach (var edge in new[] { "left", "right", "top", "bottom", "diagonal" }) writer.WriteElementString(edge, "");
        writer.WriteEndElement();
        writer.WriteEndElement();
        writer.WriteStartElement("cellStyleXfs"); writer.WriteAttributeString("count", "1"); WriteXf(writer, 0, 0, 0, false); writer.WriteEndElement();
        writer.WriteStartElement("cellXfs");
        writer.WriteAttributeString("count", "7");
        WriteXf(writer, 0, 0, 0, false);
        WriteXf(writer, 0, 1, 1, true);
        WriteXf(writer, 3, 0, 0, false);
        WriteXf(writer, 10, 0, 0, false);
        WriteXf(writer, 164, 2, 0, false);
        WriteXf(writer, 164, 3, 0, false);
        WriteXf(writer, 164, 0, 0, false);
        writer.WriteEndElement();
        writer.WriteEndElement();
    }

    private static void WriteFont(XmlWriter writer, bool bold, string? color = null)
    {
        writer.WriteStartElement("font");
        if (bold) writer.WriteElementString("b", "");
        if (color is not null)
        {
            writer.WriteStartElement("color");
            writer.WriteAttributeString("rgb", color);
            writer.WriteEndElement();
        }
        writer.WriteStartElement("sz"); writer.WriteAttributeString("val", "11"); writer.WriteEndElement();
        writer.WriteStartElement("name"); writer.WriteAttributeString("val", "Tahoma"); writer.WriteEndElement();
        writer.WriteEndElement();
    }

    private static void WriteXf(XmlWriter writer, int numberFormatId, int fontId, int fillId, bool centered)
    {
        writer.WriteStartElement("xf");
        writer.WriteAttributeString("numFmtId", numberFormatId.ToString(CultureInfo.InvariantCulture));
        writer.WriteAttributeString("fontId", fontId.ToString(CultureInfo.InvariantCulture));
        writer.WriteAttributeString("fillId", fillId.ToString(CultureInfo.InvariantCulture));
        writer.WriteAttributeString("borderId", "0");
        writer.WriteAttributeString("xfId", "0");
        writer.WriteAttributeString("applyAlignment", "1");
        if (numberFormatId != 0) writer.WriteAttributeString("applyNumberFormat", "1");
        writer.WriteStartElement("alignment");
        writer.WriteAttributeString("horizontal", centered ? "center" : "right");
        writer.WriteAttributeString("vertical", "center");
        writer.WriteAttributeString("readingOrder", "2");
        writer.WriteEndElement();
        writer.WriteEndElement();
    }

    private static void WriteEntry(ZipArchive archive, string path, Action<XmlWriter> write)
    {
        var entry = archive.CreateEntry(path, CompressionLevel.Optimal);
        using var stream = entry.Open();
        using var writer = XmlWriter.Create(stream, new XmlWriterSettings { Encoding = new UTF8Encoding(false), Indent = false });
        write(writer);
    }

    private static void WriteOverride(XmlWriter writer, string partName, string contentType)
    {
        writer.WriteStartElement("Override");
        writer.WriteAttributeString("PartName", partName);
        writer.WriteAttributeString("ContentType", contentType);
        writer.WriteEndElement();
    }

    private static void WriteRelationship(XmlWriter writer, string id, string type, string target)
    {
        writer.WriteStartElement("Relationship");
        writer.WriteAttributeString("Id", id);
        writer.WriteAttributeString("Type", type);
        writer.WriteAttributeString("Target", target);
        writer.WriteEndElement();
    }

    private static string CellReference(int columnIndex, int rowNumber)
    {
        var column = "";
        for (var value = columnIndex + 1; value > 0; value = (value - 1) / 26)
        {
            column = (char)('A' + (value - 1) % 26) + column;
        }
        return column + rowNumber.ToString(CultureInfo.InvariantCulture);
    }

    private static string SanitizeSheetName(string value)
    {
        var invalid = new HashSet<char>(['[', ']', ':', '*', '?', '/', '\\']);
        var sanitized = new string(value.Where(character => !invalid.Contains(character)).ToArray());
        return string.IsNullOrWhiteSpace(sanitized) ? "Sheet1" : sanitized[..Math.Min(31, sanitized.Length)];
    }
}
