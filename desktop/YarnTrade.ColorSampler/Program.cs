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
        controller.SetWindow(window);
        // Create the UI dispatch handle before accepting commands. Background startup
        // must not hide the first user-requested Show through a late Shown callback.
        _ = window.Handle;
        using var server = new LocalSamplerServer(controller);
        server.StartAsync().GetAwaiter().GetResult();
        if (isBackground)
        {
            using var context = new ApplicationContext();
            window.FormClosed += (_, _) => context.ExitThread();
            Application.Run(context);
        }
        else Application.Run(window);
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
