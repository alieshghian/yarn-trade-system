using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;
using YarnTrade.Api.Security;

namespace YarnTrade.Api.Controllers;
public sealed record DesignTheme(string Id, string Name, Dictionary<string,string> Colors, string[] UserEditable);
public sealed record ThemeLibraryInput(List<DesignTheme> Themes);
public sealed record ThemePersonalInput(string ThemeId, Dictionary<string,string> Colors);
public sealed record ThemeLibraryVersion(int Version, List<DesignTheme> Themes);
public sealed record ThemeLibraryDocument(int Version, List<DesignTheme> Themes, List<ThemeLibraryVersion> Previous);
public static class ThemeDesignRules
{
    public static readonly string[] Tokens = ["background","surface","foreground","muted","border","accent","frame"];
    public static string? Validate(ThemeLibraryInput? input)
    {
        if(input?.Themes is null || input.Themes.Count is < 1 or > 40) return "تعداد تم‌ها معتبر نیست.";
        if(input.Themes.Any(t=>t is null || t.Id is null || !Regex.IsMatch(t.Id,"^[a-z][a-z0-9-]{0,47}$") || string.IsNullOrWhiteSpace(t.Name) || t.Name.Length>100 || t.Colors is null || t.UserEditable is null || t.Colors.Count!=Tokens.Length || Tokens.Any(key=>!t.Colors.ContainsKey(key)) || t.Colors.Any(c=>!Tokens.Contains(c.Key)||!Regex.IsMatch(c.Value??"","^#[0-9a-fA-F]{6}$")) || t.UserEditable.Any(key=>!Tokens.Contains(key))))return "شناسه، رنگ‌ها یا مجوزهای تم نامعتبر است.";
        return input.Themes.Select(t=>t.Id).Distinct().Count()!=input.Themes.Count?"شناسه تم تکراری است.":null;
    }
    public static string? ValidatePersonal(ThemePersonalInput input,List<DesignTheme> themes)
    {
        var theme=themes.FirstOrDefault(t=>t.Id==input.ThemeId);
        return theme is null || input.Colors is null || input.Colors.Any(c=>!theme.UserEditable.Contains(c.Key)||!Regex.IsMatch(c.Value??"","^#[0-9a-fA-F]{6}$"))?"شخصی‌سازی خارج از مجوزهای قالب مادر است.":null;
    }
    public static readonly ThemeLibraryDocument Empty = new(0,[],[]);
}

[ApiController,Route("api/design-system/themes"),Authorize]
public sealed class ThemeDesignController(AppDbContext db,IDataScope dataScope):ControllerBase
{
    public const string GlobalKey="FormDesign.Themes.v1";
    public static readonly DateOnly StorageDate=new(2000,1,1);
    private static readonly JsonSerializerOptions Json=new(JsonSerializerDefaults.Web);
    private static string Revision(string? value)=>value is null?"":Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
    private Task<SystemSetting?> Read(string key,CancellationToken ct)=>db.SystemSettings.AsNoTracking().SingleOrDefaultAsync(x=>x.Key==key&&x.ValidFrom==StorageDate,ct);
    public static ThemeLibraryDocument Parse(string? value)
    {
        if(value is null)return ThemeDesignRules.Empty;
        var document=JsonSerializer.Deserialize<ThemeLibraryDocument>(value,Json);
        if(document is null || document.Version<1 || document.Previous is null || ThemeDesignRules.Validate(new(document.Themes)) is not null)
            throw new InvalidOperationException("Stored theme library is invalid; the saved value was preserved.");
        return document;
    }
    private Guid? UserId=>Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier),out var id)?id:null;
    private string OwnKey=>"FormDesign.Theme.User.v1."+UserId;
    [HttpGet,AuthenticatedOnly("Own theme preferences; public design tokens contain no operational data.")]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        if(UserId is not {} id)return Unauthorized();
        if(!dataScope.Allows(User,new(DataScopeKind.OwnUser,id)))return Forbid();
        var stored=await Read(GlobalKey,ct);var library=Parse(stored?.Value);var personal=await Read(OwnKey,ct);
        var preferences=personal is null?null:JsonSerializer.Deserialize<ThemePersonalInput>(personal.Value,Json);
        return Ok(new{rowVersion=Revision(stored?.Value),library,preferences});
    }
    [HttpPut,RequirePermission("formLaboratory.view"),Authorize(Roles="Administrator")]
    public async Task<IActionResult> Publish(ThemeLibraryInput input,[FromQuery]string? rowVersion,CancellationToken ct)
    {
        if(ThemeDesignRules.Validate(input) is {} error)return BadRequest(new{error});
        var stored=await Read(GlobalKey,ct);var old=Parse(stored?.Value);
        // Published themes cannot disappear while users may still reference their stable IDs.
        if(old.Themes.Any(theme=>!input.Themes.Any(next=>next.Id==theme.Id)))return BadRequest(new{error="تم منتشرشده حذف نمی‌شود؛ نسخه یا نام آن را به‌روزرسانی کنید."});
        var next=new ThemeLibraryDocument(old.Version+1,input.Themes,[..old.Previous,new(old.Version,old.Themes)]);
        return await Save(GlobalKey,next,rowVersion,stored,true,ct);
    }
    [HttpPut("preferences"),AuthenticatedOnly("Only the authenticated user's permitted theme overrides.")]
    public async Task<IActionResult> Preferences(ThemePersonalInput input,CancellationToken ct)
    {
        if(UserId is not {} id)return Unauthorized();
        if(!dataScope.Allows(User,new(DataScopeKind.OwnUser,id)))return Forbid();
        var library=Parse((await Read(GlobalKey,ct))?.Value);
        if(ThemeDesignRules.ValidatePersonal(input,library.Themes) is {} error)return BadRequest(new{error});
        var stored=await Read(OwnKey,ct);
        return await Save(OwnKey,input,Revision(stored?.Value),stored,false,ct);
    }
    private async Task<IActionResult> Save<T>(string key,T value,string? revision,SystemSetting? old,bool audit,CancellationToken ct)
    {
        if((revision??"")!=Revision(old?.Value))return Conflict(new{code="CONCURRENCY_CONFLICT"});
        return await db.Database.CreateExecutionStrategy().ExecuteAsync<IActionResult>(async () =>
        {
        // Each retry owns its transaction and pending entities; no duplicate audit rows.
        db.ChangeTracker.Clear();
        await using var transaction=db.Database.IsRelational()?await db.Database.BeginTransactionAsync(ct):null;
        var json=JsonSerializer.Serialize(value,Json);
        if(old is null)db.SystemSettings.Add(new SystemSetting{Key=key,Value=json,ValidFrom=StorageDate});
        else if(db.Database.IsRelational())
        {
            var changed=await db.SystemSettings.Where(x=>x.Id==old.Id&&EF.Functions.Collate(x.Value,"Latin1_General_100_BIN2")==old.Value).ExecuteUpdateAsync(s=>s.SetProperty(x=>x.Value,json),ct);
            if(changed!=1)return Conflict(new{code="CONCURRENCY_CONFLICT"});
        }
        else{var tracked=await db.SystemSettings.FindAsync([old.Id],ct);tracked!.Value=json;}
        if(audit&&UserId is {} actor)db.AuditLogs.Add(new AuditLog{UserId=actor,Action="FormDesign.Themes.Publish",EntityName="ThemeLibrary",EntityId=key,PreviousValueJson=old?.Value,NewValueJson=json});
        try{await db.SaveChangesAsync(ct);}catch(DbUpdateException){return Conflict(new{code="CONCURRENCY_CONFLICT"});}
        if(transaction is not null)await transaction.CommitAsync(ct);
        return Ok(new{rowVersion=Revision(json)});
        });
    }
}
