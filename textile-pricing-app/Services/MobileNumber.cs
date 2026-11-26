using System.Text.RegularExpressions;

namespace TextilePricingApp.Services;

public static class MobileNumber
{
    public static string Normalize(string? value)
    {
        var text = string.Concat((value ?? "").Trim().Select(c => c is >= '۰' and <= '۹' ? (char)('0' + c - '۰') : c is >= '٠' and <= '٩' ? (char)('0' + c - '٠') : c).Where(c => !char.IsWhiteSpace(c) && c != '-'));
        if (text.StartsWith("+98")) text = "0" + text[3..];
        else if (text.StartsWith("0098")) text = "0" + text[4..];
        else if (text.StartsWith("98") && text.Length == 12) text = "0" + text[2..];
        return text;
    }
    public static bool IsValid(string? value) => Regex.IsMatch(Normalize(value), "^09[0-9]{9}$");
}
