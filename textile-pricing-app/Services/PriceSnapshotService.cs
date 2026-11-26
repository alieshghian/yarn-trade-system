using System.Diagnostics;
using System.Globalization;
using System.Net;
using System.Text;
using TextilePricingApp.Models;

namespace TextilePricingApp.Services;

public sealed class PriceSnapshotService
{
    private readonly IWebHostEnvironment _environment;
    private readonly CustomerPriceReportService _reports;
    private readonly PriceSnapshotRepository _repository;

    public PriceSnapshotService(
        IWebHostEnvironment environment,
        CustomerPriceReportService reports,
        PriceSnapshotRepository repository)
    {
        _environment = environment;
        _reports = reports;
        _repository = repository;
    }

    public PriceSnapshotArchiveItem CreateCustomerPricesSnapshot(
        int? customerId,
        string? query,
        string statusFilter,
        string createdBy,
        string sortBy = "default",
        string sortDirection = "desc",
        bool onlyWithTargetPrice = false)
    {
        var report = _reports.Build(
            customerId,
            query,
            string.IsNullOrWhiteSpace(statusFilter) ? "all" : statusFilter,
            sortBy,
            sortDirection,
            onlyWithTargetPrice);
        var now = DateTime.Now;
        var safeCustomer = MakeSafeFilePart(report.CustomerName);
        var timestamp = now.ToString("yyyyMMdd_HHmmss", CultureInfo.InvariantCulture);
        var archiveRoot = GetArchiveRoot();
        var dayFolder = now.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        var outputFolder = Path.Combine(archiveRoot, dayFolder);
        Directory.CreateDirectory(outputFolder);

        var fileBase = $"customer-prices_{timestamp}_{safeCustomer}";
        var htmlFileName = fileBase + ".html";
        var pdfFileName = fileBase + ".pdf";
        var htmlPath = Path.Combine(outputFolder, htmlFileName);
        var pdfPath = Path.Combine(outputFolder, pdfFileName);
        File.WriteAllText(htmlPath, BuildHtml(report, now), Encoding.UTF8);
        CreatePdfWithEdge(htmlPath, pdfPath);

        var relativePath = Path.Combine(dayFolder, pdfFileName);
        return _repository.Add(new PriceSnapshotArchiveInput
        {
            CreatedAt = now,
            CustomerId = report.CustomerId,
            CustomerName = report.CustomerName,
            Query = report.Query ?? "",
            StatusFilter = report.StatusFilter,
            RowCount = report.Rows.Count,
            FileName = pdfFileName,
            RelativePath = relativePath,
            CreatedBy = string.IsNullOrWhiteSpace(createdBy) ? "سیستم" : createdBy,
            Notes = $"HTML: {htmlFileName}"
        }, report.Rows);
    }

    public string GetPhysicalPath(PriceSnapshotArchiveItem item)
    {
        var archiveRoot = Path.GetFullPath(GetArchiveRoot());
        var fullPath = Path.GetFullPath(Path.Combine(archiveRoot, item.RelativePath));
        if (!fullPath.StartsWith(archiveRoot, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("مسیر فایل آرشیو معتبر نیست.");
        }

        return fullPath;
    }

    private string GetArchiveRoot()
    {
        return Path.Combine(_environment.ContentRootPath, "App_Data", "PriceSnapshots");
    }

    private static void CreatePdfWithEdge(string htmlPath, string pdfPath)
    {
        var edgePath = FindEdgePath();
        if (edgePath is null)
        {
            throw new InvalidOperationException("Microsoft Edge برای ساخت PDF پیدا نشد.");
        }

        var userDataDir = Path.Combine(Path.GetTempPath(), "TextilePricingApp", "edge-profile-" + Guid.NewGuid().ToString("N", CultureInfo.InvariantCulture));
        Directory.CreateDirectory(userDataDir);
        if (File.Exists(pdfPath))
        {
            File.Delete(pdfPath);
        }

        using var process = new Process();
        process.StartInfo.FileName = edgePath;
        process.StartInfo.UseShellExecute = false;
        process.StartInfo.CreateNoWindow = true;
        process.StartInfo.RedirectStandardError = true;
        process.StartInfo.RedirectStandardOutput = true;
        process.StartInfo.ArgumentList.Add("--headless");
        process.StartInfo.ArgumentList.Add("--disable-gpu");
        process.StartInfo.ArgumentList.Add("--no-first-run");
        process.StartInfo.ArgumentList.Add("--no-default-browser-check");
        process.StartInfo.ArgumentList.Add($"--user-data-dir={userDataDir}");
        process.StartInfo.ArgumentList.Add($"--print-to-pdf={pdfPath}");
        process.StartInfo.ArgumentList.Add(Path.GetFullPath(htmlPath));
        process.Start();

        if (!process.WaitForExit(30000))
        {
            try
            {
                process.Kill(entireProcessTree: true);
            }
            catch
            {
                // Best effort cleanup only.
            }

            throw new TimeoutException("ساخت PDF بیشتر از زمان مجاز طول کشید.");
        }

        try
        {
            if (Directory.Exists(userDataDir))
            {
                Directory.Delete(userDataDir, recursive: true);
            }
        }
        catch
        {
            // Temporary browser profile cleanup is best effort.
        }

        var pdfWasCreated = File.Exists(pdfPath) && new FileInfo(pdfPath).Length > 0;
        if (!pdfWasCreated)
        {
            var error = process.StandardError.ReadToEnd();
            throw new InvalidOperationException($"ساخت PDF ناموفق بود. {error}");
        }
    }

    private static string? FindEdgePath()
    {
        var candidates = new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Google", "Chrome", "Application", "chrome.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Google", "Chrome", "Application", "chrome.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Google", "Chrome", "Application", "chrome.exe")
        };

        return candidates.FirstOrDefault(File.Exists);
    }

    private static string BuildHtml(CustomerPriceReport report, DateTime createdAt)
    {
        var rows = new StringBuilder();
        if (report.Rows.Count == 0)
        {
            rows.AppendLine("<tr><td colspan=\"4\">ردیفی برای چاپ وجود ندارد.</td></tr>");
        }
        else
        {
            for (var index = 0; index < report.Rows.Count; index++)
            {
                var row = report.Rows[index];
                rows.AppendLine($"""
                    <tr>
                        <td>{index + 1}</td>
                        <td>{Html(row.ProductCode)}</td>
                        <td>{Money(row.CustomerCashPrice)}</td>
                        <td>{Money(row.CustomerPrice)}</td>
                    </tr>
                    """);
            }
        }

        return $$"""
            <!DOCTYPE html>
            <html lang="fa" dir="rtl">
            <head>
                <meta charset="utf-8" />
                <title>اسنپ‌شات قیمت مشتریان</title>
                <style>
                    @page { size: A4 portrait; margin: 12mm; }
                    * { box-sizing: border-box; }
                    body {
                        color: #111;
                        direction: rtl;
                        font-family: Tahoma, Arial, sans-serif;
                        font-size: 12px;
                        line-height: 1.7;
                        margin: 0;
                    }
                    .header {
                        align-items: flex-start;
                        border-bottom: 2px solid #111;
                        display: flex;
                        justify-content: space-between;
                        margin-bottom: 12px;
                        padding-bottom: 10px;
                    }
                    h1 {
                        font-size: 18px;
                        margin: 0 0 8px;
                    }
                    .meta {
                        display: grid;
                        gap: 3px;
                        text-align: left;
                    }
                    table {
                        border-collapse: collapse;
                        table-layout: fixed;
                        width: 100%;
                    }
                    th, td {
                        border: 1px solid #222;
                        padding: 6px 7px;
                        text-align: center;
                        vertical-align: middle;
                    }
                    th {
                        background: #f0f0f0;
                        font-weight: 900;
                    }
                    td:nth-child(2), th:nth-child(2) {
                        text-align: right;
                    }
                    .footer {
                        color: #555;
                        font-size: 10px;
                        margin-top: 10px;
                        text-align: left;
                    }
                </style>
            </head>
            <body>
                <header class="header">
                    <div>
                        <h1>قیمت مشتریان</h1>
                        <div>مشتری: {{Html(report.CustomerName)}}</div>
                        <div>فیلتر محصول: {{Html(string.IsNullOrWhiteSpace(report.Query) ? "همه" : report.Query)}}</div>
                    </div>
                    <div class="meta">
                        <span>تاریخ ثبت: {{CustomerPriceReportService.PersianDateTime(createdAt)}}</span>
                        <span>تعداد ردیف: {{report.Rows.Count}}</span>
                    </div>
                </header>
                <table>
                    <thead>
                        <tr>
                            <th style="width: 60px;">ردیف</th>
                            <th>عنوان محصول</th>
                            <th style="width: 140px;">فروش نقدی</th>
                            <th style="width: 140px;">فروش اعتباری</th>
                        </tr>
                    </thead>
                    <tbody>
                        {{rows}}
                    </tbody>
                </table>
                <div class="footer">این فایل اسنپ‌شات قیمت‌ها در لحظه ثبت است و با تغییرات بعدی قیمت‌ها تغییر نمی‌کند.</div>
            </body>
            </html>
            """;
    }

    private static string Html(string? value) => WebUtility.HtmlEncode(value ?? "");

    private static string Money(decimal value) => string.Format(CultureInfo.InvariantCulture, "{0:N0}", value);

    private static string MakeSafeFilePart(string value)
    {
        var invalid = Path.GetInvalidFileNameChars().ToHashSet();
        var builder = new StringBuilder();
        foreach (var ch in value.Trim())
        {
            builder.Append(invalid.Contains(ch) || char.IsWhiteSpace(ch) ? '-' : ch);
        }

        var text = builder.ToString().Trim('-');
        return string.IsNullOrWhiteSpace(text) ? "all" : text;
    }
}
