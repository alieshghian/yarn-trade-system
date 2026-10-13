using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Windows.Forms;

namespace YarnTrade.ColorSampler;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        var isBackground = args.Contains("--background", StringComparer.OrdinalIgnoreCase);
        var isInstalled = args.Contains("--installed", StringComparer.OrdinalIgnoreCase);
        if (!isBackground && !isInstalled && InstallForCurrentUser()) return;

        using var mutex = new Mutex(true, "Local\\YarnTrade.ColorSampler", out var isFirstInstance);
        if (!isFirstInstance) return;

        Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        using var controller = new SamplerController();
        var window = new SamplerWindow(controller);
        if (isBackground)
        {
            window.Opacity = 0;
            window.Shown += (_, _) => { window.Hide(); window.Opacity = 1; };
        }
        controller.SetWindow(window);
        using var server = new LocalSamplerServer(controller);
        server.StartAsync().GetAwaiter().GetResult();
        Application.Run(window);
        server.StopAsync().GetAwaiter().GetResult();
    }

    private static bool InstallForCurrentUser()
    {
        var runningPath = Environment.ProcessPath;
        if (string.IsNullOrWhiteSpace(runningPath)) return false;
        var installDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "YarnTrade", "ColorSampler");
        var installedPath = Path.Combine(installDirectory, "YarnTrade.ColorSampler.exe");
        if (string.Equals(Path.GetFullPath(runningPath), Path.GetFullPath(installedPath), StringComparison.OrdinalIgnoreCase)) return false;

        try
        {
            Directory.CreateDirectory(installDirectory);
            File.Copy(runningPath, installedPath, overwrite: true);
            Process.Start(new ProcessStartInfo(installedPath, "--installed")
            {
                UseShellExecute = true,
                WorkingDirectory = installDirectory,
                WindowStyle = ProcessWindowStyle.Normal
            });
            return true;
        }
        catch (Exception error)
        {
            MessageBox.Show($"نصب در پوشهٔ کاربر انجام نشد؛ برنامه از همین مسیر اجرا می‌شود.\n{error.Message}", "Yarn Trade", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return false;
        }
    }
}
