using YarnTrade.Api.Security;
using System.Globalization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;

namespace YarnTrade.Api.Controllers;

[ApiController, Route("api/yarns"), Authorize]
public sealed class YarnsController(AppDbContext db) : ControllerBase
{
    private static readonly Dictionary<string, string> Labels = new()
    {
        ["CN"] = "چینی", ["IR"] = "ایرانی", ["SOHAIL"] = "سهیل",
        ["BRIGHT"] = "براق", ["SEMI_DULL"] = "نیمه مات", ["DULL"] = "مات",
        ["KG"] = "کیلوگرم", ["COUNT"] = "عدد", ["CONE"] = "دوک", ["HANK"] = "کلاف",
        ["SHRINK"] = "جمع شو", ["FIXED"] = "فیکسه شده",
        ["ACRYLIC"] = "اکرولیک", ["POLYESTER"] = "پلی استر", ["COTTON"] = "پنبه", ["WIRE"] = "سیم",
        ["LUREX"] = "لمه", ["VISCOSE"] = "ویسکوز", ["SPUN"] = "اسپان", ["FILAMENT"] = "فیلامنت",
        ["OPEN_END"] = "اوپن", ["RING"] = "رینگ", ["ZERO"] = "0", ["INTERMINGLE"] = "اینترمینگل",
        ["TWISTED"] = "تابیده", ["SIMPLE"] = "ساده", ["COMMINGLE"] = "کومینگل",
        ["NM"] = "N.M.", ["DENIER"] = "دنیر", ["DTEX"] = "دیتکس", ["MICRON"] = "میکرون", ["NE"] = "N.E.",
        ["S"] = "S", ["Z"] = "Z"
    };

    private static readonly Dictionary<string, HashSet<string>> Allowed = new()
    {
        [nameof(YarnInput.YarnGroup)] = Set("CN", "IR", "SOHAIL"),
        [nameof(YarnInput.Luster)] = Set("BRIGHT", "SEMI_DULL", "DULL"),
        [nameof(YarnInput.UnitOfMeasure)] = Set("KG", "COUNT", "CONE", "HANK"),
        [nameof(YarnInput.FixStatus)] = Set("SHRINK", "FIXED"),
        [nameof(YarnInput.Material)] = Set("ACRYLIC", "POLYESTER", "COTTON", "WIRE", "LUREX", "VISCOSE"),
        [nameof(YarnInput.SpinType)] = Set("SPUN", "FILAMENT"),
        [nameof(YarnInput.SpinningMethod)] = Set("OPEN_END", "RING"),
        [nameof(YarnInput.ContinuityType)] = Set("ZERO", "INTERMINGLE", "TWISTED", "SIMPLE", "COMMINGLE"),
        [nameof(YarnInput.CountType)] = Set("NM", "DENIER", "DTEX", "MICRON", "NE"),
        [nameof(YarnInput.TwistType)] = Set("S", "Z")
    };

    [RequirePermission("yarns.view")]
    [HttpGet]
    public async Task<object> List([FromQuery] bool includeInactive = true, [FromQuery] int page = 1, [FromQuery] int pageSize = 500, CancellationToken ct = default)
    {
        var query = db.YarnItems.AsNoTracking().AsQueryable();
        if (!includeInactive) query = query.Where(x => x.IsActive);
        var total = await query.CountAsync(ct);
        var take = Math.Clamp(pageSize, 1, 500);
        var items = await query.OrderBy(x => x.Code).Skip((Math.Max(page, 1) - 1) * take).Take(take).Select(x => YarnView.From(x)).ToListAsync(ct);
        return new { items, total, page, pageSize = take };
    }

    [RequirePermission("yarns.view")]
    [HttpGet("{id:guid}")]
    public async Task<ActionResult<YarnView>> ById(Guid id, CancellationToken ct)
    {
        var item = await db.YarnItems.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
        return item is null ? NotFound() : Ok(YarnView.From(item));
    }

    [RequirePermission("yarns.create")]
    [HttpPost]
    public async Task<ActionResult<YarnView>> Create(YarnInput input, CancellationToken ct)
    {
        var error = await Validate(input, null, ct);
        if (error is not null) return BadRequest(new { error });
        var yarnType = await db.YarnTypes.OrderBy(x => x.Code).FirstOrDefaultAsync(ct);
        if (yarnType is null)
        {
            yarnType = new YarnType { Code = "GENERAL", NameFa = "عمومی", NameEn = "General", BaseUnit = input.UnitOfMeasure };
            db.YarnTypes.Add(yarnType);
        }
        var item = new YarnItem { YarnTypeId = yarnType.Id, YarnType = yarnType, Code = string.Empty, NameFa = string.Empty, NameEn = string.Empty };
        Apply(item, input);
        db.YarnItems.Add(item);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException) { return Conflict(new { error = "کد نخ تکراری است.", code = "DUPLICATE_YARN_CODE" }); }
        return CreatedAtAction(nameof(ById), new { id = item.Id }, YarnView.From(item));
    }

    [RequirePermission("yarns.edit")]
    [HttpPut("{id:guid}")]
    public async Task<ActionResult<YarnView>> Update(Guid id, YarnInput input, CancellationToken ct)
    {
        var item = await db.YarnItems.SingleOrDefaultAsync(x => x.Id == id, ct);
        if (item is null) return NotFound();
        var error = await Validate(input, id, ct);
        if (error is not null) return BadRequest(new { error });
        Apply(item, input);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException) { return Conflict(new { error = "کد نخ تکراری است.", code = "DUPLICATE_YARN_CODE" }); }
        return Ok(YarnView.From(item));
    }

    [RequirePermission("yarns.delete")]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var item = await db.YarnItems.SingleOrDefaultAsync(x => x.Id == id, ct);
        if (item is null) return NotFound();
        var hasHistory =
            await db.PurchaseOrderItems.AnyAsync(x => x.YarnItemId == id, ct) ||
            await db.PurchaseInvoiceItems.AnyAsync(x => x.YarnItemId == id, ct) ||
            await db.InventoryMovements.AnyAsync(x => x.YarnItemId == id, ct) ||
            await db.InventoryLayers.AnyAsync(x => x.YarnItemId == id, ct) ||
            await db.PriceListItems.AnyAsync(x => x.YarnItemId == id, ct) ||
            await db.CreditRateRules.AnyAsync(x => x.YarnItemId == id, ct) ||
            await db.SaleItems.AnyAsync(x => x.YarnItemId == id, ct) ||
            await db.PartnerShareRules.AnyAsync(x => x.YarnItemId == id, ct);
        if (hasHistory) return Conflict(new { error = "این نخ در تراکنش‌های سیستم استفاده شده و قابل حذف نیست.", code = "YARN_HAS_HISTORY" });
        db.YarnItems.Remove(item);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    private async Task<string?> Validate(YarnInput input, Guid? currentId, CancellationToken ct)
    {
        input.Code = input.Code.Trim();
        input.Name = input.Name.Trim();
        if (input.Code.Length is 0 or > 50) return "کد نخ الزامی و حداکثر ۵۰ کاراکتر است.";
        if (input.Name.Length is 0 or > 200) return "نام نخ الزامی و حداکثر ۲۰۰ کاراکتر است.";
        if (input.PlyCount is < 0 or > 9) return "تعداد لا باید بین صفر تا ۹ باشد.";
        if (input.FilamentNumber < 0 || input.CountValue < 0 || input.TwistAmount < 0) return "مقادیر عددی نمی‌توانند منفی باشند.";
        foreach (var pair in Allowed)
        {
            var value = typeof(YarnInput).GetProperty(pair.Key)!.GetValue(input) as string;
            if (!string.IsNullOrWhiteSpace(value) && !pair.Value.Contains(value)) return $"مقدار {pair.Key} معتبر نیست.";
        }
        if (await db.YarnItems.AnyAsync(x => x.Code == input.Code && x.Id != currentId, ct)) return "کد نخ تکراری است.";
        return null;
    }

    private static void Apply(YarnItem item, YarnInput input)
    {
        item.Code = input.Code.Trim();
        item.NameFa = input.Name.Trim();
        item.NameEn = input.Name.Trim();
        item.YarnGroup = Clean(input.YarnGroup); item.Luster = Clean(input.Luster); item.UnitOfMeasure = input.UnitOfMeasure;
        item.FixStatus = Clean(input.FixStatus); item.Material = Clean(input.Material); item.SpinType = Clean(input.SpinType);
        item.FilamentNumber = input.FilamentNumber; item.SpinningMethod = Clean(input.SpinningMethod);
        item.ContinuityType = Clean(input.ContinuityType); item.CountValue = input.CountValue; item.CountType = Clean(input.CountType);
        item.TwistAmount = input.TwistAmount; item.TwistType = Clean(input.TwistType); item.PlyCount = (byte)input.PlyCount;
        item.Notes = Clean(input.Notes); item.IsActive = input.IsActive;
        item.ComprehensiveName = BuildName(input);
        item.SearchText = PersianTextNormalizer.Normalize($"{item.Code} {item.NameFa} {item.ComprehensiveName} {Label(item.YarnGroup)} {Label(item.Material)}");
    }

    private static string BuildName(YarnInput x)
    {
        var parts = new List<string?> { x.Name, Label(x.Luster), Label(x.Material) };
        if (x.FilamentNumber.HasValue) parts.Add(Number(x.FilamentNumber.Value));
        parts.Add(Label(x.SpinType));
        if (x.CountValue.HasValue) parts.Add(Number(x.CountValue.Value));
        parts.Add(Label(x.CountType));
        if (x.PlyCount > 0) parts.Add($"{x.PlyCount} لا");
        return string.Join(' ', parts.Where(x => !string.IsNullOrWhiteSpace(x)));
    }

    private static string? Label(string? code) => code is not null && Labels.TryGetValue(code, out var value) ? value : null;
    private static string Number(decimal value) => value.ToString("0.######", CultureInfo.InvariantCulture);
    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static HashSet<string> Set(params string[] values) => new(values, StringComparer.Ordinal);
}

public sealed class YarnInput
{
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? YarnGroup { get; set; }
    public string? Luster { get; set; }
    public string UnitOfMeasure { get; set; } = "KG";
    public string? FixStatus { get; set; }
    public string? Material { get; set; }
    public string? SpinType { get; set; }
    public decimal? FilamentNumber { get; set; }
    public string? SpinningMethod { get; set; }
    public string? ContinuityType { get; set; }
    public decimal? CountValue { get; set; }
    public string? CountType { get; set; }
    public decimal? TwistAmount { get; set; }
    public string? TwistType { get; set; }
    public int PlyCount { get; set; }
    public string? Notes { get; set; }
    public bool IsActive { get; set; } = true;
}

public sealed record YarnView(Guid Id, string Code, string Name, string ComprehensiveName, string? YarnGroup, string? Luster,
    string UnitOfMeasure, string? FixStatus, string? Material, string? SpinType, decimal? FilamentNumber,
    string? SpinningMethod, string? ContinuityType, decimal? CountValue, string? CountType, decimal? TwistAmount,
    string? TwistType, byte PlyCount, string? Notes, bool IsActive)
{
    public static YarnView From(YarnItem x) => new(x.Id, x.Code, x.NameFa, x.ComprehensiveName, x.YarnGroup, x.Luster,
        x.UnitOfMeasure, x.FixStatus, x.Material, x.SpinType, x.FilamentNumber, x.SpinningMethod, x.ContinuityType,
        x.CountValue, x.CountType, x.TwistAmount, x.TwistType, x.PlyCount, x.Notes, x.IsActive);
}
