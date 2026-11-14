using YarnTrade.Api.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;
using System.Numerics;
using System.Text.RegularExpressions;

namespace YarnTrade.Api.Controllers;

[ApiController, Route("api/sequence-suggestions"), Authorize]
public sealed class SequenceSuggestionsController(AppDbContext db) : ControllerBase
{
    [HttpGet("person"), RequirePermission("persons.view")]
    public Task<ActionResult<object>> Person(CancellationToken ct) => Suggest("person", ct);
    [HttpGet("yarn"), RequirePermission("yarns.view")]
    public Task<ActionResult<object>> Yarn(CancellationToken ct) => Suggest("yarn", ct);
    [HttpGet("brand"), RequirePermission("brands.view")]
    public async Task<ActionResult<object>> Brand(CancellationToken ct)
    {
        var previous = await db.Brands.AsNoTracking().OrderByDescending(x => x.CreatedAtUtc).ThenByDescending(x => x.Id).Select(x => x.BrandCode).FirstOrDefaultAsync(ct);
        var options = new CodeOptions { Incremental = true, SuffixWidth = 1, MaxLength = 30 };
        var candidate = previous is null ? new CodeSuggestion("BRD-0001") : SerialCode.ValidateCode(previous, options) is not null ? new CodeSuggestion("", "کد آخرین ثبت با قالب مجاز سازگار نیست؛ کد را دستی وارد کنید.") : SerialCode.Suggest([previous], options);
        var comparison = candidate.Value.ToUpperInvariant();
        var occupied = candidate.Value.Length > 0 && (db.Database.IsSqlServer()
            ? await db.Brands.AnyAsync(x => EF.Functions.Collate(x.BrandCode, "Latin1_General_100_CI_AS") == candidate.Value, ct)
            : await db.Brands.AnyAsync(x => x.BrandCode.ToUpper() == comparison, ct));
        if (occupied)
            candidate = new("", "کد بعدی قبلاً ثبت شده است؛ کد موردنظر را دستی وارد کنید.");
        return Ok(new { suggestion = candidate.Value, error = candidate.Error, previous });
    }
    [HttpGet("purchase-order"), RequirePermission("purchaseOrders.view")]
    public Task<ActionResult<object>> PurchaseOrder(CancellationToken ct) => Suggest("purchase-order", ct);
    [HttpGet("purchase-invoice"), RequirePermission("purchases.view")]
    public Task<ActionResult<object>> PurchaseInvoice(CancellationToken ct) => Suggest("purchase-invoice", ct);
    [HttpGet("sale-invoice"), RequirePermission("sales.view")]
    public Task<ActionResult<object>> SaleInvoice(CancellationToken ct) => Suggest("sale-invoice", ct);
    [HttpGet("receipt"), RequirePermission("finance.view")]
    public Task<ActionResult<object>> Receipt(CancellationToken ct) => Suggest("receipt", ct);
    [HttpGet("payment"), RequirePermission("finance.view")]
    public Task<ActionResult<object>> Payment(CancellationToken ct) => Suggest("payment", ct);

    private async Task<ActionResult<object>> Suggest(string scope, CancellationToken ct)
    {
        var year = DateTime.Today.Year;
        string? last;
        string fallback;
        switch (scope.Trim().ToLowerInvariant())
        {
            case "person":
                last = await db.Persons.AsNoTracking().OrderByDescending(x => x.CreatedAtUtc).Select(x => x.PersonCode).FirstOrDefaultAsync(ct);
                fallback = "PER-0001";
                break;
            case "yarn":
                last = await db.YarnItems.AsNoTracking().OrderByDescending(x => x.CreatedAtUtc).Select(x => x.Code).FirstOrDefaultAsync(ct);
                fallback = "YRN-0001";
                break;
            case "purchase-order":
                fallback = $"POR-{year}-0001";
                last = await db.PurchaseOrders.AsNoTracking()
                    .OrderByDescending(x => x.CreatedAtUtc).ThenByDescending(x => x.Id)
                    .Select(x => x.OrderNumber).FirstOrDefaultAsync(ct);
                break;
            case "purchase-invoice":
                fallback = $"PUR-{year}-0001";
                last = await db.PurchaseInvoices.AsNoTracking()
                    .OrderByDescending(x => x.CreatedAtUtc).ThenByDescending(x => x.Id)
                    .Select(x => x.InternalNumber).FirstOrDefaultAsync(ct);
                break;
            case "sale-invoice":
                fallback = $"SAL-{year}-0001";
                last = await db.Sales.AsNoTracking()
                    .OrderByDescending(x => x.CreatedAtUtc).ThenByDescending(x => x.Id)
                    .Select(x => x.SaleNumber).FirstOrDefaultAsync(ct);
                break;
            case "receipt":
                fallback = $"REC-{year}-0001";
                last = await db.MoneyDocuments.AsNoTracking().Where(x => x.DocumentType == MoneyDocumentType.Receipt)
                    .OrderByDescending(x => x.CreatedAtUtc).ThenByDescending(x => x.Id)
                    .Select(x => x.DocumentNumber).FirstOrDefaultAsync(ct);
                break;
            case "payment":
                fallback = $"PAY-{year}-0001";
                last = await db.MoneyDocuments.AsNoTracking().Where(x => x.DocumentType == MoneyDocumentType.Payment)
                    .OrderByDescending(x => x.CreatedAtUtc).ThenByDescending(x => x.Id)
                    .Select(x => x.DocumentNumber).FirstOrDefaultAsync(ct);
                break;
            default:
                return BadRequest(new { error = "حوزه شماره‌گذاری معتبر نیست." });
        }
        return Ok(new { suggestion = SerialCode.Increment(last, fallback), previous = last });
    }
}

public static class SerialCode
{
    // Opt-in configurable engine. Existing HTTP endpoints retain Increment(last, fallback).
    // Display/storage code preserves Latin letter case, while Persian/Arabic digits become ASCII.
    public static string FormatCode(string value) => new(value.Trim().Select(c =>
        c is >= '\u06f0' and <= '\u06f9' ? (char)('0' + c - '\u06f0') :
        c is >= '\u0660' and <= '\u0669' ? (char)('0' + c - '\u0660') : c).ToArray());

    // Comparison key only. Never overwrite a displayed/stored value with this result.
    public static string NormalizeCode(string value) => new(FormatCode(value).Select(c =>
        c is >= 'a' and <= 'z' ? (char)(c - 'a' + 'A') : c).ToArray());

    public static string? ValidateOptions(CodeOptions options)
    {
        static bool Length(int? n) => n is null || n is >= 1 and <= 128;
        if (options.Mode is not ("number" or "letters" or "alphanumeric") || options.Format is not ("legacy" or "segments") || options.SuffixWidth is < 1 or > 12 || !Length(options.FixedLength) || !Length(options.MaxLength) || options.FixedLength > (options.MaxLength ?? 128)) return "Invalid code options.";
        if (options.Format != "segments") return null;
        var parts = options.Segments;
        if (parts is null || parts.Length is < 1 or > 16 || parts.Any(p => p is null || p.Kind is not ("number" or "letters") || p.Length < 1 || p.Length > (p.Kind == "number" ? 12 : 64) || p.Minimum is not (0 or 1))) return "Invalid code segments.";
        if (parts.Any(p => options.Mode == "number" && p.Kind != "number" || options.Mode == "letters" && p.Kind != "letters")) return "Incompatible segments.";
        var total = parts.Sum(p => p.Length);
        if (total > (options.MaxLength ?? 128) || options.FixedLength.HasValue && options.FixedLength != total) return "Invalid code length.";
        var order = options.IncrementOrder;
        if (order is not null && (order.Length != parts.Length || order.Distinct().Count() != parts.Length || order.Any(i => i < 0 || i >= parts.Length))) return "Invalid increment order.";
        return null;
    }

    public static string? ValidateCode(string value, CodeOptions options, IEnumerable<string>? existing = null)
    {
        var error = ValidateOptions(options);
        if (error is not null) return error;
        var code = NormalizeCode(value);
        if (code.Length == 0) return options.Required ? "Code is required." : null;
        var pattern = options.Mode == "number" ? "^[0-9]+$" : options.Mode == "letters" ? "^[A-Z]+$" : options.Format == "segments" ? "^[A-Z0-9]+$" : "^[A-Z0-9/_\\-.]+$";
        if (!Regex.IsMatch(code, pattern, RegexOptions.CultureInvariant) || !Regex.IsMatch(code, "[A-Z0-9]")) return "Invalid code characters.";
        if (code.Length > (options.MaxLength ?? 128) || options.FixedLength.HasValue && code.Length != options.FixedLength) return "Invalid code length.";
        if (options.Format == "segments")
        {
            var offset = 0;
            foreach (var part in options.Segments!)
            {
                if (offset + part.Length > code.Length) return "Invalid segment length.";
                var text = code.Substring(offset, part.Length); offset += part.Length;
                if (!Regex.IsMatch(text, part.Kind == "letters" ? "^[A-Z]+$" : "^[0-9]+$") || part.Kind == "number" && BigInteger.Parse(text) < part.Minimum) return "Invalid segment value.";
            }
            if (offset != code.Length) return "Invalid code length.";
        }
        if (options.Unique && existing?.Any(item => NormalizeCode(item) == code) == true) return "Duplicate code.";
        return null;
    }

    private static string IncrementLetters(string value)
    {
        var letters = value.ToCharArray();
        for (var i = letters.Length - 1; i >= 0; i--)
        {
            var lower = letters[i] is >= 'a' and <= 'z';
            var upper = char.ToUpperInvariant(letters[i]);
            if (upper != 'Z') { letters[i] = (char)(upper + 1 + (lower ? 'a' - 'A' : 0)); return new string(letters); }
            letters[i] = lower ? 'a' : 'A';
        }
        return (value[0] is >= 'a' and <= 'z' ? "a" : "A") + new string(letters);
    }

    /// <summary>Input values are in successful registration order, independent of UI sorting. Does not reserve a code.</summary>
    public static CodeSuggestion Suggest(IEnumerable<string> values, CodeOptions options)
    {
        var configError = ValidateOptions(options);
        if (configError is not null) return new("", configError);
        var codes = values.Select(FormatCode).ToArray();
        var last = codes.LastOrDefault(value => value.Length > 0 && ValidateCode(value, options with { Unique = false }) is null);
        string next;
        if (options.Format == "segments")
        {
            var parts = options.Segments!; var chunks = new string[parts.Length]; var offset = 0;
            for (var i = 0; i < parts.Length; i++) { var p = parts[i]; chunks[i] = last is not null ? last.Substring(offset, p.Length) : p.Kind == "letters" ? new string('A', p.Length) : p.Minimum.ToString().PadLeft(p.Length, '0'); offset += p.Length; }
            if (last is not null)
            {
                var carry = true;
                foreach (var index in options.IncrementOrder ?? Enumerable.Range(0, parts.Length).Reverse().ToArray())
                {
                    var p = parts[index];
                    if (p.Kind == "letters") { var text = IncrementLetters(chunks[index]); if (text.Length <= p.Length) { chunks[index] = text; carry = false; break; } chunks[index] = new string(chunks[index].Select(c => c is >= 'a' and <= 'z' ? 'a' : 'A').ToArray()); }
                    else { var n = BigInteger.Parse(chunks[index]) + 1; if (n < BigInteger.Pow(10, p.Length)) { chunks[index] = n.ToString().PadLeft(p.Length, '0'); carry = false; break; } chunks[index] = p.Minimum.ToString().PadLeft(p.Length, '0'); }
                }
                if (carry) return new("", "Code capacity exhausted.");
            }
            next = string.Concat(chunks);
        }
        else if (options.Mode == "letters") next = last is null ? new string('A', options.FixedLength ?? 1) : IncrementLetters(last);
        else
        {
            var match = Regex.Match(last ?? "", "^(.*?)([0-9]+)$"); var width = options.FixedLength ?? options.SuffixWidth;
            if (last is null) next = "1".PadLeft(width, '0');
            else if (!match.Success) next = last + "1".PadLeft(options.SuffixWidth, '0');
            else { var prefix = match.Groups[1].Value; var digits = match.Groups[2].Value; var n = BigInteger.Parse(digits) + 1;
                next = options.Mode == "alphanumeric" && Regex.IsMatch(prefix, "^[A-Za-z]+$") && n >= BigInteger.Pow(10, digits.Length) ? IncrementLetters(prefix) + "1".PadLeft((options.FixedLength.HasValue ? digits.Length : Math.Max(options.SuffixWidth, digits.Length)), '0') : prefix + n.ToString().PadLeft((options.FixedLength.HasValue && prefix.Length > 0 ? digits.Length : Math.Max(prefix.Length > 0 ? options.SuffixWidth : width, digits.Length)), '0'); }
        }
        if (ValidateCode(next, options with { Unique = false }) is not null) return new("", "Code capacity or length exhausted.");
        if (options.Unique && codes.Any(code => NormalizeCode(code) == NormalizeCode(next))) return new("", "Next code exists; enter a code manually.");
        return new(next);
    }

    public static string Increment(string? last, string fallback)
    {
        if (string.IsNullOrWhiteSpace(last)) return fallback;
        var value = last.Trim();
        var end = value.Length - 1;
        while (end >= 0 && char.IsDigit(value[end])) end--;
        var numberStart = end + 1;
        if (numberStart == value.Length) return $"{value}-0001";
        var numberText = value[numberStart..];
        return long.TryParse(numberText, out var number)
            ? $"{value[..numberStart]}{(number + 1).ToString($"D{numberText.Length}")}"
            : fallback;
    }
}

public sealed record CodeSegment(string Kind, int Length, int Minimum = 1);
public sealed record CodeOptions
{
    public string Mode { get; init; } = "alphanumeric";
    public bool Required { get; init; } = true;
    public bool Unique { get; init; } = true;
    public bool Incremental { get; init; }
    public int SuffixWidth { get; init; } = 3;
    public string Format { get; init; } = "legacy";
    public int? FixedLength { get; init; }
    public int? MaxLength { get; init; }
    public CodeSegment[]? Segments { get; init; }
    public int[]? IncrementOrder { get; init; }
}
public sealed record CodeSuggestion(string Value, string? Error = null);
