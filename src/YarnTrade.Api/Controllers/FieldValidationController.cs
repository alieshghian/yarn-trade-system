using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;
using YarnTrade.Api.Security;
using YarnTrade.Api.Services;

namespace YarnTrade.Api.Controllers;

public sealed record FieldValidationInput(string Field, string? Value, Guid? CurrentId = null, Guid? WarehouseId = null, int FloorNumber = 1, string? FirstName = null, string? LastName = null, PersonType PersonType = PersonType.Individual, Guid? TitleId = null);

// Read-only preflight; write endpoints and database constraints remain the final concurrency gate.
[ApiController, Authorize, Route("api/field-validation")]
public sealed class FieldValidationController(AppDbContext db) : ControllerBase
{
    private static object Result(string? error) => new { error };
    [HttpPost("investors"), RequirePermission("settings.view")]
    public async Task<object> InvestorField(FieldValidationInput i,CancellationToken ct)
    {
        if(!i.Field.EndsWith("Code",StringComparison.Ordinal))return Result(null);
        var value=(i.Value??"").Trim().ToUpperInvariant();
        if(value.Length is 0 or >30)return Result("کد سرمایه‌گذار الزامی و حداکثر ۳۰ نویسه است.");
        return Result(await db.Investors.AnyAsync(x=>x.Id!=i.CurrentId&&x.InvestorCode==value,ct)||await db.Persons.AnyAsync(x=>x.CapitalInvestorId!=i.CurrentId&&x.PersonCode==value,ct)?"کد سرمایه‌گذار یا شخص تکراری است.":null);
    }
    [HttpPost("users"), RequirePermission("users.view"), Authorize(Roles="Administrator,Manager")]
    public async Task<object> UserField(FieldValidationInput i,CancellationToken ct)
    {
        var value=(i.Value??"").Trim();
        if(i.Field=="email") {
            if(!System.Net.Mail.MailAddress.TryCreate(value,out var address)||address.Address!=value)return Result("ایمیل معتبر وارد کنید.");
            var normalized=value.ToUpperInvariant();
            return Result(await db.Users.AnyAsync(x=>x.Id!=i.CurrentId&&x.NormalizedEmail==normalized,ct)?"این ایمیل قبلاً استفاده شده است.":null);
        }
        if(i.Field=="personId") {
            if(!Guid.TryParse(value,out var id)||!await db.Persons.AnyAsync(x=>x.Id==id&&x.IsActive,ct))return Result("شخص فعال معتبر انتخاب کنید.");
            return Result(await db.Users.AnyAsync(x=>x.Id!=i.CurrentId&&x.PersonId==id,ct)?"برای این شخص قبلاً کاربر تعریف شده است.":null);
        }
        return Result(null);
    }
    [HttpPost("warehouses"), RequirePermission("warehouses.view")]
    public async Task<object> Warehouse(FieldValidationInput i, CancellationToken ct)
    {
        var value=SerialCode.FormatCode(i.Value??"");
        if(i.Field=="code") {
            if(value.Length==0||SerialCode.ValidateCode(value,new CodeOptions{MaxLength=30,SuffixWidth=1}) is not null)return Result("کد انبار معتبر وارد کنید.");
            var upper=value.ToUpperInvariant();
            if(await db.Warehouses.AnyAsync(x=>x.Id!=i.CurrentId&&x.Code.ToUpper()==upper,ct))return Result("کد انبار تکراری است.");
        }
        return Result(null);
    }
    [HttpPost("zones"), RequirePermission("warehouses.view")]
    public async Task<object> Zone(FieldValidationInput i,CancellationToken ct)
    {
        var w=await db.Warehouses.AsNoTracking().SingleOrDefaultAsync(x=>x.Id==i.WarehouseId&&x.IsActive,ct);
        if(w is null||i.FloorNumber<1||i.FloorNumber>w.FloorCount)return Result("انبار و طبقه معتبر را انتخاب کنید.");
        if(i.Field is not ("code" or "name"))return Result(null);
        var value=WarehousesController.Normalize(i.Value??"");
        if(value.Length==0)return Result("تکمیل این فیلد الزامی است.");
        if(i.Field=="code"&&(!value.StartsWith(i.FloorNumber+"-")||value.Length>30))return Result("کد زون باید پیشوند طبقه و حداکثر ۳۰ نویسه داشته باشد.");
        if(i.Field=="name"&&value.Length>200)return Result("نام زون حداکثر ۲۰۰ نویسه است.");
        if(value==WarehousesController.Normalize("بارانداز")||value==$"{i.FloorNumber}-DOCK")return Result("از گزینهٔ ایجاد بارانداز استفاده کنید.");
        var query=db.Set<WarehouseZone>().Where(x=>x.WarehouseId==i.WarehouseId&&x.FloorNumber==i.FloorNumber&&x.Id!=i.CurrentId);
        var duplicate=i.Field=="code"?await query.AnyAsync(x=>x.NormalizedCode==value,ct):await query.AnyAsync(x=>x.NormalizedName==value,ct);
        return Result(duplicate?"این کد یا نام زون در همین طبقه قبلاً ثبت شده است.":null);
    }
    [HttpPost("brands"), RequirePermission("brands.view")]
    public async Task<object> Brand(FieldValidationInput i,CancellationToken ct)
    {
        if(i.Field!="brandCode")return Result(null); // Brand names are not globally unique by the existing contract.
        var value=SerialCode.FormatCode(i.Value??"");
        if(value.Length==0||SerialCode.ValidateCode(value,new CodeOptions{MaxLength=30,SuffixWidth=1}) is not null)return Result("کد برند معتبر وارد کنید.");
        var upper=value.ToUpperInvariant();
        var duplicate=db.Database.IsSqlServer()?await db.Brands.AnyAsync(x=>x.Id!=i.CurrentId&&EF.Functions.Collate(x.BrandCode,"Latin1_General_100_CI_AS")==value,ct):await db.Brands.AnyAsync(x=>x.Id!=i.CurrentId&&x.BrandCode.ToUpper()==upper,ct);
        return Result(duplicate?"کد برند تکراری است.":null);
    }
    [HttpPost("yarns"), RequirePermission("yarns.view")]
    public async Task<object> Yarn(FieldValidationInput i,CancellationToken ct)
    {
        if(i.Field!="code")return Result(null);
        var value=(i.Value??"").Trim();
        if(value.Length is 0 or >50)return Result("کد نخ الزامی و حداکثر ۵۰ نویسه است.");
        return Result(await db.YarnItems.AnyAsync(x=>x.Id!=i.CurrentId&&x.Code==value,ct)?"کد نخ تکراری است.":null);
    }
    [HttpPost("persons"), RequirePermission("persons.view")]
    public async Task<object> Person(FieldValidationInput i,CancellationToken ct)
    {
        var value=(i.Value??"").Trim();
        if(i.Field=="personCode") {
            var code=value.ToUpperInvariant();
            if(code.Length is 0 or >30)return Result("کد شخص الزامی و حداکثر ۳۰ نویسه است.");
            return Result(await db.Persons.AnyAsync(x=>x.Id!=i.CurrentId&&x.PersonCode==code,ct)||await db.Investors.AnyAsync(x=>x.InvestorCode==code,ct)?"کد شخص تکراری یا رزرو شده است.":null);
        }
        if(i.Field is not ("firstName" or "lastName"))return Result(null);
        var last=i.Field=="lastName"?value:i.LastName??"";
        if(string.IsNullOrWhiteSpace(last))return Result(i.Field=="lastName"?"نام خانوادگی یا نام شرکت الزامی است.":null);
        var first=i.Field=="firstName"?value:i.FirstName??"";
        var title=await db.ParameterValues.AsNoTracking().SingleOrDefaultAsync(x=>x.Id==i.TitleId,ct);
        var type=title?.TitlePersonType??i.PersonType;
        var candidates=await db.Persons.AsNoTracking().Where(x=>x.Id!=i.CurrentId&&x.PersonType==type).Select(x=>new{x.FirstName,x.LastName,x.CompanyName,TitleCode=x.Title==null?null:x.Title.Code}).ToArrayAsync(ct);
        var duplicate=candidates.Any(x=>PersianTextNormalizer.NormalizeName(x.LastName??x.CompanyName??"")==PersianTextNormalizer.NormalizeName(last)&&(type==PersonType.Individual?PersianTextNormalizer.NormalizeName(x.FirstName??"")==PersianTextNormalizer.NormalizeName(first):(x.TitleCode=="OFFICE")== (title?.Code=="OFFICE")));
        return Result(duplicate?"نام شخص، شرکت یا اداره تکراری است.":null);
    }
}
