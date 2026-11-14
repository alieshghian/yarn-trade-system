using YarnTrade.Api.Security;
using System.Globalization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;

namespace YarnTrade.Api.Controllers;

[ApiController, Route("api/yarns"), Authorize]
public sealed partial class YarnsController(AppDbContext db) : ControllerBase
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
        return item is null ? NotFound() : Ok(await DefinitionView(item, ct));
    }

    [RequirePermission("yarns.create")]
    [HttpPost]
    public Task<ActionResult<YarnView>> Create(YarnInput input, CancellationToken ct) => ProductGroupWriteScope.Run(db, () => CreateCore(input, ct), ct, r => (r.Result as Microsoft.AspNetCore.Mvc.Infrastructure.IStatusCodeActionResult)?.StatusCode is null or < 400);
    private async Task<ActionResult<YarnView>> CreateCore(YarnInput input, CancellationToken ct)
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
        if (input.Definition is not null) await ApplyDefinition(item, input.Definition, ct);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { return AggregateConcurrency.Conflict(); }
        catch (DbUpdateException) { return Conflict(new { error = "کد نخ تکراری است.", code = "DUPLICATE_YARN_CODE" }); }
        return CreatedAtAction(nameof(ById), new { id = item.Id }, await DefinitionView(item, ct));
    }

    [RequirePermission("yarns.edit")]
    [HttpPut("{id:guid}")]
    public Task<ActionResult<YarnView>> Update(Guid id, YarnInput input, [FromQuery] string? rowVersion, CancellationToken ct) => ProductGroupWriteScope.Run(db, () => UpdateCore(id, input, rowVersion, ct), ct, r => (r.Result as Microsoft.AspNetCore.Mvc.Infrastructure.IStatusCodeActionResult)?.StatusCode is null or < 400);
    private async Task<ActionResult<YarnView>> UpdateCore(Guid id, YarnInput input, string? rowVersion, CancellationToken ct)
    {
        var item = await db.YarnItems.SingleOrDefaultAsync(x => x.Id == id, ct);
        if (item is null) return NotFound();
        var concurrency = AggregateConcurrency.Apply(db, item, rowVersion);
        if (concurrency is not null) return concurrency;
        var error = await Validate(input, id, ct);
        if (error is not null) return BadRequest(new { error });
        Apply(item, input);
        if (input.Definition is not null) await ApplyDefinition(item, input.Definition, ct);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { return AggregateConcurrency.Conflict(); }
        catch (DbUpdateException) { return Conflict(new { error = "کد نخ تکراری است.", code = "DUPLICATE_YARN_CODE" }); }
        return Ok(await DefinitionView(item, ct));
    }

    [HttpPost("bulk-delete"),RequirePermission("yarns.delete")]
    public Task<IActionResult> DeleteDefinitionRows(DefinitionBulkDeleteInput input,CancellationToken ct)
    {
        var processed=new HashSet<Guid>();
        return DefinitionBulkDelete.Run(db,input,async(row,token)=>{
            if(processed.Contains(row.Id))return NoContent();
            var color=await db.Set<YarnColor>().SingleOrDefaultAsync(x=>x.Id==row.Id,token);
            var yarnId=color?.YarnId??row.Id;
            var colors=await db.Set<YarnColor>().Where(x=>x.YarnId==yarnId).ToListAsync(token);
            if(color is null) {
                if(colors.Count>0)return DefinitionBulkDelete.Blocked(row.Id,"رنگ‌های این کالا تغییر کرده‌اند؛ جدول را دوباره دریافت کنید.");
                return await DeleteCore(yarnId,row.RowVersion,token);
            }
            var selected=input.Rows.Where(x=>colors.Any(c=>c.Id==x.Id)).ToArray();
            if(selected.Any(x=>x.RowVersion!=row.RowVersion))return DefinitionBulkDelete.Blocked(row.Id,"نسخهٔ ردیف‌های یک کالا یکسان نیست؛ جدول را دوباره دریافت کنید.");
            if(selected.Length==colors.Count){var result=await DeleteCore(yarnId,row.RowVersion,token);if(result is NoContentResult)foreach(var chosenRow in selected)processed.Add(chosenRow.Id);return result;}
            var yarn=await db.YarnItems.SingleAsync(x=>x.Id==yarnId,token);
            if(AggregateConcurrency.Apply(db,yarn,row.RowVersion) is {} conflict)return conflict;
            if(await HasHistory(yarnId,token))return DefinitionBulkDelete.Blocked(row.Id,"این کالا سابقهٔ استفاده دارد؛ رنگ آن قابل حذف نیست.");
            var chosen=selected.Select(x=>x.Id).ToHashSet();
            var remaining=colors.Where(x=>!chosen.Contains(x.Id)).ToArray();
            db.RemoveRange(colors.Where(x=>chosen.Contains(x.Id)));
            await db.SaveChangesAsync(token);
            if(!remaining.Any(x=>x.IsDefault)){remaining[0].IsDefault=true;await db.SaveChangesAsync(token);}
            yarn.SearchText=PersianTextNormalizer.Normalize(yarn.Code+" "+yarn.ComprehensiveName+" "+string.Join(' ',remaining.Select(x=>x.Value)));
            await db.SaveChangesAsync(token);foreach(var chosenRow in selected)processed.Add(chosenRow.Id);return NoContent();
        },ct,()=>processed.Clear());
    }
    [RequirePermission("yarns.delete")]
    [HttpDelete("{id:guid}")]
    public Task<IActionResult> Delete(Guid id, [FromQuery] string? rowVersion, CancellationToken ct) => ProductGroupWriteScope.Run<IActionResult>(db, () => DeleteCore(id,rowVersion,ct),ct);
    private async Task<IActionResult> DeleteCore(Guid id,string? rowVersion,CancellationToken ct)
    {
        var item = await db.YarnItems.SingleOrDefaultAsync(x => x.Id == id, ct);
        if (item is null) return NotFound();
        var concurrency = AggregateConcurrency.Apply(db, item, rowVersion, touch: false);
        if (concurrency is not null) return concurrency;
        var hasHistory = await HasHistory(id,ct);
        if (hasHistory) return Conflict(new { error = "این نخ در تراکنش‌های سیستم استفاده شده و قابل حذف نیست.", code = "YARN_HAS_HISTORY" });
        db.RemoveRange(await db.Set<YarnColor>().Where(x=>x.YarnId==id).ToListAsync(ct));
        db.RemoveRange(await db.Set<YarnPackagingCoefficient>().Where(x=>x.YarnId==id).ToListAsync(ct));
        db.RemoveRange(await db.Set<YarnDefinitionState>().Where(x=>x.YarnId==id).ToListAsync(ct));
        db.YarnItems.Remove(item);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    private async Task<bool> HasHistory(Guid id,CancellationToken ct) =>
            await db.PurchaseOrderItems.AnyAsync(x => x.YarnItemId == id, ct) ||
            await db.PurchaseInvoiceItems.AnyAsync(x => x.YarnItemId == id, ct) ||
            await db.InventoryMovements.AnyAsync(x => x.YarnItemId == id, ct) ||
            await db.InventoryLayers.AnyAsync(x => x.YarnItemId == id, ct) ||
            await db.PriceListItems.AnyAsync(x => x.YarnItemId == id, ct) ||
            await db.CreditRateRules.AnyAsync(x => x.YarnItemId == id, ct) ||
            await db.SaleItems.AnyAsync(x => x.YarnItemId == id, ct) ||
            await db.PartnerShareRules.AnyAsync(x => x.YarnItemId == id, ct);

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
            if (!string.IsNullOrWhiteSpace(value) && !pair.Value.Contains(value) && (input.Definition is null || !await IsReferenceValue(pair.Key, value, ct))) return $"مقدار {pair.Key} معتبر نیست.";
        }
        if (await db.YarnItems.AnyAsync(x => x.Code == input.Code && x.Id != currentId, ct)) return "کد نخ تکراری است.";
        if (input.ProductGroupSpecified)
        {
            ProductGroupAssignment.Resolution? assignment = null;
            if (input.ProductGroupId is Guid groupId)
            {
                assignment = await ProductGroupAssignment.Resolve(db, groupId, ct);
                if (assignment is null) return "گروه کالا موجود یا فعال نیست.";
                if (!assignment.Selectable) return assignment.Message;
                if (!assignment.InUse && input.ConfirmedProductGroupDepth != assignment.Depth)
                    return "ساختار گروه باید دوباره بررسی و قفل عمق نهایی آن پیش از ثبت کالا تأیید شود.";
            }
            if (currentId is Guid yarnId)
            {
                var oldGroup = await db.YarnItems.Where(x => x.Id == yarnId).Select(x => x.ProductGroupId).SingleAsync(ct);
                if (oldGroup != input.ProductGroupId && await db.InventoryMovements.AnyAsync(x => x.YarnItemId == yarnId, ct))
                    return "کالای دارای گردش انبار را نمی‌توان به گروه دیگری منتقل کرد.";
            }
            if (assignment is not null) assignment.Root.LockedDepth = assignment.Depth;
        }
        return input.Definition is null ? null : await ValidateDefinition(input, currentId, ct);
    }

    private static void Apply(YarnItem item, YarnInput input)
    {
        item.Code = input.Code.Trim();
        // Older forms omit this optional binding; never detach their existing group.
        if (input.ProductGroupSpecified) item.ProductGroupId = input.ProductGroupId;
        item.NameFa = input.Name.Trim();
        item.NameEn = input.Name.Trim();
        item.Luster = Clean(input.Luster); item.UnitOfMeasure = input.UnitOfMeasure;
        item.FixStatus = Clean(input.FixStatus); item.Material = Clean(input.Material); item.SpinType = Clean(input.SpinType);
        item.FilamentNumber = input.FilamentNumber; item.SpinningMethod = Clean(input.SpinningMethod);
        item.ContinuityType = Clean(input.ContinuityType); item.CountValue = input.CountValue; item.CountType = Clean(input.CountType);
        item.TwistAmount = input.TwistAmount; item.TwistType = Clean(input.TwistType); item.PlyCount = (byte)input.PlyCount;
        item.Notes = Clean(input.Notes); item.IsActive = input.IsActive;
        item.ComprehensiveName = BuildName(input);
        item.SearchText = PersianTextNormalizer.Normalize($"{item.Code} {item.NameFa} {item.ComprehensiveName} {Label(item.Material)}");
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
    public YarnDefinitionInput? Definition { get; set; }
    private Guid? productGroupId;
    public Guid? ProductGroupId { get => productGroupId; set { productGroupId = value; ProductGroupSpecified = true; } }
    public int? ConfirmedProductGroupDepth { get; set; }
    [System.Text.Json.Serialization.JsonIgnore]
    public bool ProductGroupSpecified { get; private set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
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

public sealed record YarnView(Guid Id, string Code, string Name, string ComprehensiveName, Guid? ProductGroupId, string? Luster,
    string UnitOfMeasure, string? FixStatus, string? Material, string? SpinType, decimal? FilamentNumber,
    string? SpinningMethod, string? ContinuityType, decimal? CountValue, string? CountType, decimal? TwistAmount,
    string? TwistType, byte PlyCount, string? Notes, bool IsActive, byte[] RowVersion)
{
    public YarnDefinitionResult? Definition { get; init; }
    public static YarnView From(YarnItem x) => new(x.Id, x.Code, x.NameFa, x.ComprehensiveName, x.ProductGroupId, x.Luster,
        x.UnitOfMeasure, x.FixStatus, x.Material, x.SpinType, x.FilamentNumber, x.SpinningMethod, x.ContinuityType,
        x.CountValue, x.CountType, x.TwistAmount, x.TwistType, x.PlyCount, x.Notes, x.IsActive, x.RowVersion);
}
