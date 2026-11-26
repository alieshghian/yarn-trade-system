using System.Diagnostics;
using System.Text;
using System.Text.Json;

namespace TextilePricingApp.Services;

public sealed class MaterialsPdfService(IWebHostEnvironment environment, IConfiguration configuration)
{
    public async Task<byte[]> RenderAsync(object document, CancellationToken cancellationToken)
    {
        var python = configuration["Reports:PythonPath"] ?? configuration["Rubika:PythonPath"] ??
            Path.Combine(environment.ContentRootPath, "App_Data", "rubika-venv", OperatingSystem.IsWindows() ? "Scripts/python.exe" : "bin/python");
        var start = new ProcessStartInfo(python)
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardInputEncoding = new UTF8Encoding(false),
            WorkingDirectory = environment.ContentRootPath
        };
        start.ArgumentList.Add(Path.Combine(environment.ContentRootPath, "RubikaBridge", "materials_pdf.py"));
        start.Environment["PYTHONUTF8"] = "1";
        using var process = Process.Start(start) ?? throw new InvalidOperationException("ساخت گزارش چاپ آغاز نشد.");
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(30));
        try
        {
            using var output = new MemoryStream();
            var readOutput = process.StandardOutput.BaseStream.CopyToAsync(output, timeout.Token);
            var readErrors = process.StandardError.ReadToEndAsync(timeout.Token);
            await process.StandardInput.WriteAsync(JsonSerializer.Serialize(document).AsMemory(), timeout.Token);
            process.StandardInput.Close();
            await process.WaitForExitAsync(timeout.Token);
            await readOutput;
            await readErrors;
            var bytes = output.ToArray();
            if (process.ExitCode != 0 || bytes.Length < 5 || Encoding.ASCII.GetString(bytes, 0, 5) != "%PDF-")
                throw new InvalidOperationException("ساخت PDF گزارش ناموفق بود؛ وابستگی‌های گزارش را بررسی کنید.");
            return bytes;
        }
        finally
        {
            if (!process.HasExited) process.Kill(entireProcessTree: true);
        }
    }
}
