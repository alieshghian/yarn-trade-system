using System.Globalization;
using System.Text.RegularExpressions;

namespace YarnTrade.Api.Services;

public static partial class BackupNaming
{
    private static readonly PersianCalendar Calendar = new();

    public static string Create(string prefix, DateTime localDate)
    {
        var normalized = prefix?.Trim() ?? string.Empty;
        if (!PrefixPattern().IsMatch(normalized)) throw new ArgumentException("پیشوند باید یک یا دو حرف انگلیسی باشد.", nameof(prefix));
        return $"{normalized.ToUpperInvariant()}-{Calendar.GetYear(localDate):0000}{Calendar.GetMonth(localDate):00}{Calendar.GetDayOfMonth(localDate):00}.zip";
    }

    public static bool IsValidArchiveName(string? fileName)
    {
        var raw = fileName ?? string.Empty;
        if (!raw.Equals(Path.GetFileName(raw), StringComparison.Ordinal)) return false;
        var match = ArchivePattern().Match(raw);
        if (!match.Success) return false;
        var value = match.Groups[1].Value;
        return int.TryParse(value[..4], out var year) && int.TryParse(value.Substring(4, 2), out var month) && int.TryParse(value.Substring(6, 2), out var day) &&
               year is >= 1300 and <= 1600 && month is >= 1 and <= 12 && day >= 1 && day <= Calendar.GetDaysInMonth(year, month);
    }

    [GeneratedRegex("^[A-Za-z]{1,2}$", RegexOptions.CultureInvariant)]
    private static partial Regex PrefixPattern();
    [GeneratedRegex("^[A-Za-z]{1,2}-(\\d{8})\\.zip$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex ArchivePattern();
}
