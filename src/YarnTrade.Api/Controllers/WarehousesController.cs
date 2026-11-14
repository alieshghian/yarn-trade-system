using System.Security.Claims;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;
using YarnTrade.Api.Security;
using YarnTrade.Api.Services;

namespace YarnTrade.Api.Controllers;

public sealed record WarehouseInput(string Code, string Name, string? Address, string? Description, Guid? CustodianPersonId, string[]? Addresses = null, string? CustodianChangeReason = null, int FloorCount = 1, string? Location = null);
public sealed record ZoneInput(string Code, string Name, string? Description, bool IsActive = true, int FloorNumber = 1);
public sealed record ZoneCopyInput(int SourceFloor, int TargetFloor, Guid[] ZoneIds);
public sealed record ZoneBatchPreviewInput(int FloorNumber, string StartCode, int Count);
public sealed record ZoneBatchInput(ZoneInput[] Items);

[ApiController, Route("api/warehouses"), Authorize]
public sealed class WarehousesController(AppDbContext db) : ControllerBase
{
    public static string Normalize(string value) => Regex.Replace(SerialCode.FormatCode(value.Normalize(NormalizationForm.FormKC)).Replace('ي','ی').Replace('ك','ک').Replace('\u200c',' ').Trim(), @"\s+", " ").ToUpperInvariant();
    private DbSet<WarehouseZone> Zones => db.Set<WarehouseZone>();
    private DbSet<WarehouseCustodianPeriod> Periods => db.Set<WarehouseCustodianPeriod>();

    [HttpGet("{id:guid}"), RequirePermission("warehouses.view")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct) => await db.Warehouses.AsNoTracking().SingleOrDefaultAsync(x=>x.Id==id,ct) is {} warehouse ? Ok(warehouse) : NotFound();

    [HttpGet("latest"), RequirePermission("warehouses.view")]
    public async Task<IActionResult> Latest(CancellationToken ct) => await db.Warehouses.AsNoTracking().Where(x=>x.IsActive).OrderByDescending(x=>x.UpdatedAtUtc??x.CreatedAtUtc).ThenByDescending(x=>x.Id).FirstOrDefaultAsync(ct) is {} warehouse ? Ok(warehouse) : NotFound();

    [HttpGet("suggest-code"), RequirePermission("warehouses.view")]
    public async Task<IActionResult> Suggest(CancellationToken ct)
    {
        var previous=await db.Warehouses.OrderByDescending(x=>x.CreatedAtUtc).ThenByDescending(x=>x.Id).Select(x=>x.Code).FirstOrDefaultAsync(ct);
        var value=previous is null ? new CodeSuggestion("WH-0001") : SerialCode.Suggest([previous],new CodeOptions{Incremental=true,SuffixWidth=1,MaxLength=30});
        return Ok(new {suggestion=value.Value,error=value.Error});
    }

    [HttpPost, RequirePermission("warehouses.create")]
    public Task<IActionResult> Create(WarehouseInput input,CancellationToken ct) => Write(async()=>{
        if(await Validate(input,null,ct) is {} error)return BadRequest(new{error});
        var warehouse=new Warehouse{Code=SerialCode.FormatCode(input.Code),NameFa=input.Name.Trim(),NameEn=input.Name.Trim()};
        Apply(warehouse,input); db.Warehouses.Add(warehouse);
        Zones.Add(Dock(warehouse.Id,1));
        await ChangeCustodian(warehouse,null,input,ct);
        await db.SaveChangesAsync(ct); return Ok(warehouse);
    },ct);

    [HttpPut("{id:guid}"), RequirePermission("warehouses.edit")]
    public Task<IActionResult> Update(Guid id,WarehouseInput input,string? rowVersion,CancellationToken ct) => Write(async()=>{
        var warehouse=await db.Warehouses.SingleOrDefaultAsync(x=>x.Id==id,ct); if(warehouse is null)return NotFound();
        if(AggregateConcurrency.Apply(db,warehouse,rowVersion) is {} conflict)return conflict;
        if(await Validate(input,id,ct) is {} error)return BadRequest(new{error});
        var old=warehouse.CustodianPersonId;
        Apply(warehouse,input); await ChangeCustodian(warehouse,old,input,ct);
        await db.SaveChangesAsync(ct); return Ok(warehouse);
    },ct);

    [HttpPost("bulk-delete"), RequirePermission("warehouses.delete")]
    public Task<IActionResult> DeleteMany(DefinitionBulkDeleteInput input,CancellationToken ct) =>
        DefinitionBulkDelete.Run(db,input,async(row,token)=>{
            var warehouse=await db.Warehouses.SingleOrDefaultAsync(x=>x.Id==row.Id,token);
            if(warehouse is null)return NotFound();
            if(AggregateConcurrency.Apply(db,warehouse,row.RowVersion,touch:false) is {} conflict)return conflict;
            if(await db.InventoryMovements.AnyAsync(x=>x.WarehouseId==row.Id,token)||await db.InventoryLayers.AnyAsync(x=>x.WarehouseId==row.Id,token)||await Periods.AnyAsync(x=>x.WarehouseId==row.Id,token))
                return DefinitionBulkDelete.Blocked(row.Id,"انبار دارای سابقه قابل حذف نیست.");
            db.RemoveRange(await Zones.Where(x=>x.WarehouseId==row.Id).ToArrayAsync(token));
            db.Warehouses.Remove(warehouse);await db.SaveChangesAsync(token);return NoContent();
        },ct);
    [HttpDelete("{id:guid}"), RequirePermission("warehouses.delete")]
    public Task<IActionResult> Deactivate(Guid id,string? rowVersion,CancellationToken ct) => Write(async()=>{
        var warehouse=await db.Warehouses.SingleOrDefaultAsync(x=>x.Id==id,ct);if(warehouse is null)return NotFound();
        if(AggregateConcurrency.Apply(db,warehouse,rowVersion) is {} conflict)return conflict;
        if(await db.InventoryLayers.AnyAsync(x=>x.WarehouseId==id&&x.RemainingQuantity>0,ct))return Conflict(new{error="انبار دارای موجودی قابل غیرفعال‌کردن نیست."});
        warehouse.IsActive=false;await db.SaveChangesAsync(ct);return Ok(warehouse);
    },ct);

    [HttpGet("{id:guid}/custodians"), RequirePermission("warehouses.view")]
    public async Task<object> History(Guid id,CancellationToken ct) => await (from h in Periods.AsNoTracking() join p in db.Persons on h.PersonId equals p.Id where h.WarehouseId==id orderby h.StartedAtUtc descending select new{h.Id,h.PersonId,p.DisplayName,h.StartedAtUtc,h.EndedAtUtc,h.ChangedByUserId,h.Reason}).ToArrayAsync(ct);

    [HttpGet("{id:guid}/zones"), RequirePermission("warehouses.view")]
    public async Task<object> ListZones(Guid id,CancellationToken ct) => await Zones.AsNoTracking().Where(x=>x.WarehouseId==id).OrderByDescending(x=>x.IsDefaultReceiving).ThenBy(x=>x.Code).ToArrayAsync(ct);

    private static WarehouseZone Dock(Guid id,int floor)=>new(){WarehouseId=id,FloorNumber=floor,Code=$"{floor}-DOCK",Name="بارانداز",NormalizedCode=$"{floor}-DOCK",NormalizedName=Normalize("بارانداز"),IsDefaultReceiving=true};
    [WarehouseZoneEditor]
    [HttpPost("{id:guid}/floors/{floor:int}/dock"), RequirePermission("warehouses.zones")]
    public Task<IActionResult> CreateDock(Guid id,int floor,CancellationToken ct)=>Write(async()=>{
        var w=await db.Warehouses.SingleOrDefaultAsync(x=>x.Id==id&&x.IsActive,ct);
        if(w is null||floor<1||floor>w.FloorCount)return BadRequest(new{error="طبقه معتبر نیست."});
        if(await Zones.AnyAsync(x=>x.WarehouseId==id&&x.FloorNumber==floor&&(x.IsDefaultReceiving||x.NormalizedName==Normalize("بارانداز")||x.NormalizedCode==$"{floor}-DOCK"),ct))return Conflict(new{error="بارانداز این طبقه قبلاً تعریف شده است."});
        var dock=Dock(id,floor);Zones.Add(dock);await db.SaveChangesAsync(ct);return Ok(dock);
    },ct);
    [HttpPost("{id:guid}/zones/edit-session"), RequirePermission("warehouses.zones")]
    public async Task<IActionResult> BeginZoneEdit(Guid id, [FromServices] WarehouseZoneEditSessions sessions, CancellationToken ct)
    {
        if (!await db.Warehouses.AnyAsync(x=>x.Id==id&&x.IsActive,ct)) return NotFound();
        var token=Request.Headers[WarehouseZoneEditorFilter.Header].ToString();
        return await sessions.Acquire(id,WarehouseZoneEditorFilter.Actor(HttpContext),token,db.Database.GetConnectionString()!,ct) ? Ok(new{active=true,expiresInSeconds=120}) : WarehouseZoneEditorFilter.Denied();
    }
    [HttpPut("{id:guid}/zones/edit-session"), RequirePermission("warehouses.zones")]
    public Task<IActionResult> RenewZoneEdit(Guid id, [FromServices] WarehouseZoneEditSessions sessions, CancellationToken ct) => sessions.Use<IActionResult>(id,WarehouseZoneEditorFilter.Actor(HttpContext),Request.Headers[WarehouseZoneEditorFilter.Header].ToString(),()=>Task.FromResult<IActionResult>(Ok(new{active=true,expiresInSeconds=120})),WarehouseZoneEditorFilter.Denied,ct);
    [HttpDelete("{id:guid}/zones/edit-session"), RequirePermission("warehouses.zones")]
    public async Task<IActionResult> EndZoneEdit(Guid id, [FromServices] WarehouseZoneEditSessions sessions, CancellationToken ct) { await sessions.Release(id,WarehouseZoneEditorFilter.Actor(HttpContext),Request.Headers[WarehouseZoneEditorFilter.Header].ToString(),ct);return NoContent(); }
    [HttpGet("{id:guid}/zones/suggest-code"), RequirePermission("warehouses.view")]
    public async Task<IActionResult> SuggestZone(Guid id,int floor,CancellationToken ct){
        var w=await db.Warehouses.AsNoTracking().SingleOrDefaultAsync(x=>x.Id==id&&x.IsActive,ct);
        if(w is null||floor<1||floor>w.FloorCount)return BadRequest();
        var codes=await Zones.Where(x=>x.WarehouseId==id&&x.FloorNumber==floor).Select(x=>x.NormalizedCode).ToArrayAsync(ct);
        var n=1;while(codes.Contains($"{floor}-{n:000}"))n++;
        return Ok(new{suggestion=$"{floor}-{n:000}"});
    }
    [WarehouseZoneEditor]
    [HttpPost("{id:guid}/zones/copy"), RequirePermission("warehouses.zones")]
    public Task<IActionResult> CopyZones(Guid id,ZoneCopyInput input,CancellationToken ct)=>Write(async()=>{
        var w=await db.Warehouses.SingleOrDefaultAsync(x=>x.Id==id&&x.IsActive,ct);
        if(w is null||input.SourceFloor==input.TargetFloor||input.SourceFloor<1||input.TargetFloor<1||input.SourceFloor>w.FloorCount||input.TargetFloor>w.FloorCount||input.ZoneIds is null||input.ZoneIds.Length is 0 or >500)return BadRequest(new{error="طبقات و موارد انتخاب‌شده معتبر نیستند."});
        var source=await Zones.AsNoTracking().Where(x=>x.WarehouseId==id&&x.FloorNumber==input.SourceFloor&&input.ZoneIds.Contains(x.Id)&&!x.IsDefaultReceiving).ToArrayAsync(ct);
        if(source.Length!=input.ZoneIds.Distinct().Count())return BadRequest(new{error="زون مبدأ معتبر نیست؛ بارانداز قابل کپی نیست."});
        var target=await Zones.Where(x=>x.WarehouseId==id&&x.FloorNumber==input.TargetFloor).ToListAsync(ct);
        var added=new List<WarehouseZone>();
        foreach(var z in source){var suffix=z.Code[(z.Code.IndexOf('-')+1)..];var code=$"{input.TargetFloor}-{suffix}";var normalized=Normalize(code);
            if(target.Any(x=>x.NormalizedCode==normalized||x.NormalizedName==z.NormalizedName))continue;
            var next=new WarehouseZone{WarehouseId=id,FloorNumber=input.TargetFloor,Code=code,NormalizedCode=normalized,Name=z.Name,NormalizedName=z.NormalizedName,Description=z.Description,IsActive=z.IsActive};
            Zones.Add(next);target.Add(next);added.Add(next);
        }
        await db.SaveChangesAsync(ct);return Ok(new{items=added,skipped=source.Length-added.Count});
    },ct);
    [HttpGet("{id:guid}/zones/copy-options"), RequirePermission("warehouses.view")]
    public async Task<IActionResult> CopyOptions(Guid id,int sourceFloor,int targetFloor,CancellationToken ct){
        var w=await db.Warehouses.AsNoTracking().SingleOrDefaultAsync(x=>x.Id==id&&x.IsActive,ct);
        if(w is null||sourceFloor==targetFloor||sourceFloor<1||targetFloor<1||sourceFloor>w.FloorCount||targetFloor>w.FloorCount)return BadRequest();
        var prefix=(sourceFloor+"-").Length;
        var options=await Zones.AsNoTracking().Where(x=>x.WarehouseId==id&&x.FloorNumber==sourceFloor&&!x.IsDefaultReceiving&&x.IsActive)
            .Where(x=>!Zones.Any(t=>t.WarehouseId==id&&t.FloorNumber==targetFloor&&(t.NormalizedName==x.NormalizedName||t.NormalizedCode==targetFloor+"-"+x.NormalizedCode.Substring(prefix))))
            .OrderBy(x=>x.Code).ThenBy(x=>x.Id).Take(501).ToArrayAsync(ct);
        return Ok(new{items=options.Take(500),hasMore=options.Length>500});
    }

    [WarehouseZoneEditor]
    [HttpPost("{id:guid}/zones"), RequirePermission("warehouses.zones")]
    public Task<IActionResult> CreateZone(Guid id,ZoneInput input,CancellationToken ct) => SaveZone(id,null,input,null,ct);
    [WarehouseZoneEditor]
    [HttpPost("{id:guid}/zones/batch-preview"), RequirePermission("warehouses.zones")]
    public async Task<IActionResult> PreviewZoneBatch(Guid id,ZoneBatchPreviewInput input,CancellationToken ct)
    {
        var warehouse=await db.Warehouses.AsNoTracking().SingleOrDefaultAsync(x=>x.Id==id&&x.IsActive,ct);
        if(warehouse is null||input.FloorNumber<1||input.FloorNumber>warehouse.FloorCount||input.Count is <1 or >100)
            return BadRequest(new{error="طبقه معتبر و تعداد ۱ تا ۱۰۰ زون را انتخاب کنید."});
        var code=SerialCode.FormatCode(input.StartCode??"");var prefix=input.FloorNumber+"-";
        if(!code.StartsWith(prefix,StringComparison.Ordinal)||code.Length<=prefix.Length||code.Length>28||SerialCode.ValidateCode(code,new CodeOptions{MaxLength=28,SuffixWidth=1}) is not null||Normalize(code)==prefix+"DOCK")
            return BadRequest(new{error="کد شروع معتبر زون را وارد کنید."});
        var occupied=(await Zones.AsNoTracking().Where(x=>x.WarehouseId==id).Select(x=>x.NormalizedCode).ToArrayAsync(ct)).ToHashSet();
        var codes=new List<string>();
        while(codes.Count<input.Count){
            if(code.Length>28)return BadRequest(new{error="ظرفیت کد زون تکمیل شده است."});
            if(occupied.Add(Normalize(code)))codes.Add(code);
            var suffix=code[prefix.Length..];var match=Regex.Match(suffix,@"^(.*?)([0-9]+)$");
            code=prefix+(match.Success?match.Groups[1].Value+(System.Numerics.BigInteger.Parse(match.Groups[2].Value)+1).ToString().PadLeft(match.Groups[2].Length,'0'):suffix+"1");
        }
        return Ok(new{codes});
    }
    [WarehouseZoneEditor]
    [HttpPost("{id:guid}/zones/batch"), RequirePermission("warehouses.zones")]
    public Task<IActionResult> CreateZoneBatch(Guid id,ZoneBatchInput input,CancellationToken ct)=>Write(async()=>{
        if(input.Items is null||input.Items.Length is <1 or >100)return BadRequest(new{error="تعداد مجاز ثبت گروهی ۱ تا ۱۰۰ زون است."});
        var warehouse=await db.Warehouses.SingleOrDefaultAsync(x=>x.Id==id&&x.IsActive,ct);
        var floor=input.Items[0].FloorNumber;
        if(warehouse is null||floor<1||floor>warehouse.FloorCount)return BadRequest(new{error="انبار و طبقه فعال معتبر را انتخاب کنید."});
        var codes=new HashSet<string>();var names=new HashSet<string>();var added=new List<WarehouseZone>();
        for(var index=0;index<input.Items.Length;index++){
            var item=input.Items[index];if(item is null)return BadRequest(new{error="ردیف زون نامعتبر است.",index});var code=Normalize(item.Code??"");var name=Normalize(item.Name??"");
            if(item.FloorNumber!=floor||code.Length is 0 or >28||SerialCode.ValidateCode(code,new CodeOptions{MaxLength=28,SuffixWidth=1}) is not null||name.Length is 0 or >200||item.Description?.Length>4000||!code.StartsWith(floor+"-",StringComparison.Ordinal)||code.Length<=(floor+"-").Length||code==floor+"-DOCK"||name==Normalize("بارانداز"))
                return BadRequest(new{error=$"اطلاعات ردیف {index+1} معتبر نیست؛ کد، نام و طبقه را بررسی کنید.",index});
            if(!codes.Add(code)||!names.Add(name))return Conflict(new{error=$"کد یا نام ردیف {index+1} در همین مجموعه تکراری است.",index});
            added.Add(new WarehouseZone{WarehouseId=id,FloorNumber=floor,Code=SerialCode.FormatCode(item.Code!),NormalizedCode=code,Name=item.Name!.Trim(),NormalizedName=name,Description=item.Description?.Trim(),IsActive=item.IsActive});
        }
        if(await Zones.AnyAsync(x=>x.WarehouseId==id&&(codes.Contains(x.NormalizedCode)||x.FloorNumber==floor&&names.Contains(x.NormalizedName)),ct))
            return Conflict(new{error="یکی از کدها یا نام‌ها هم‌زمان ثبت شده یا از قبل وجود دارد؛ هیچ ردیفی ثبت نشد. کدها را دوباره پیشنهاد بگیرید."});
        Zones.AddRange(added);await db.SaveChangesAsync(ct);return Ok(new{items=added});
    },ct);
    [WarehouseZoneEditor]
    [HttpPost("{id:guid}/zones/bulk-delete"), RequirePermission("warehouses.zones"), RequirePermission("warehouses.delete")]
    public Task<IActionResult> DeleteZones(Guid id,DefinitionBulkDeleteInput input,CancellationToken ct) =>
        DefinitionBulkDelete.Run(db,input,async(row,token)=>{
            var zone=await Zones.SingleOrDefaultAsync(x=>x.Id==row.Id&&x.WarehouseId==id,token);
            if(zone is null)return NotFound();
            if(zone.IsDefaultReceiving)return DefinitionBulkDelete.Blocked(row.Id,"بارانداز پیش‌فرض قابل حذف نیست.");
            if(AggregateConcurrency.Apply(db,zone,row.RowVersion,touch:false) is {} conflict)return conflict;
            // Until ledger rows identify individual zones, preserve all zones of a warehouse with history.
            if(await db.InventoryMovements.AnyAsync(x=>x.WarehouseId==id,token)||await db.InventoryLayers.AnyAsync(x=>x.WarehouseId==id,token))return DefinitionBulkDelete.Blocked(row.Id,"انبار دارای سابقهٔ موجودی است؛ حذف زون مجاز نیست.");
            Zones.Remove(zone);await db.SaveChangesAsync(token);return NoContent();
        },ct);
    [WarehouseZoneEditor]
    [HttpPut("{id:guid}/zones/{zoneId:guid}"), RequirePermission("warehouses.zones")]
    public Task<IActionResult> UpdateZone(Guid id,Guid zoneId,ZoneInput input,string? rowVersion,CancellationToken ct) => SaveZone(id,zoneId,input,rowVersion,ct);
    private Task<IActionResult> SaveZone(Guid id,Guid? zoneId,ZoneInput input,string? rowVersion,CancellationToken ct) => Write(async()=>{
        var warehouse=await db.Warehouses.SingleOrDefaultAsync(x=>x.Id==id&&x.IsActive,ct);
        if(warehouse is null||input.FloorNumber<1||input.FloorNumber>warehouse.FloorCount)return BadRequest(new{error="انبار و طبقه فعال معتبر را انتخاب کنید."});
        var code=Normalize(input.Code);var name=Normalize(input.Name);
        if(code.Length is 0 or >60||name.Length is 0 or >200||input.Description?.Length>4000)return BadRequest(new{error="کد و نام زون الزامی است؛ طول کد ۶۰، نام ۲۰۰ و توضیحات ۴۰۰۰ کاراکتر."});
        if(!input.Code.StartsWith(input.FloorNumber+"-",StringComparison.Ordinal)||string.IsNullOrWhiteSpace(input.Code[(input.Code.IndexOf('-')+1)..]))return BadRequest(new{error="پیشوند کد باید شماره طبقه و خط تیره باشد."});
        if(await Zones.AnyAsync(x=>x.WarehouseId==id&&x.Id!=zoneId&&(x.NormalizedCode==code||x.FloorNumber==input.FloorNumber&&x.NormalizedName==name),ct))return Conflict(new{error="کد یا نام زون در همین طبقه تکراری است."});
        var zone=zoneId is null?new WarehouseZone{WarehouseId=id}:await Zones.SingleOrDefaultAsync(x=>x.Id==zoneId&&x.WarehouseId==id,ct);
        if(zone is null)return NotFound();
        if(zoneId is not null&&AggregateConcurrency.Apply(db,zone,rowVersion) is {} conflict)return conflict;
        if(zone.IsDefaultReceiving)return Conflict(new{error="نام، طبقه و وضعیت بارانداز ثابت است."});
        if(name==Normalize("بارانداز")||code==$"{input.FloorNumber}-DOCK")return BadRequest(new{error="از گزینه ایجاد بارانداز این طبقه استفاده کنید."});
        if(zoneId is not null&&zone.FloorNumber!=input.FloorNumber)return Conflict(new{error="طبقه زون موجود قابل تغییر نیست."});
        zone.FloorNumber=input.FloorNumber;
        zone.Code=input.Code.Trim();zone.Name=input.Name.Trim();zone.NormalizedCode=code;zone.NormalizedName=name;zone.Description=input.Description?.Trim();zone.IsActive=input.IsActive;
        if(zoneId is null)Zones.Add(zone);await db.SaveChangesAsync(ct);return Ok(zone);
    },ct);

    private async Task<string?> Validate(WarehouseInput input,Guid? id,CancellationToken ct)
    {
        if(input.FloorCount is <1 or >5)return "تعداد طبقات باید بین ۱ تا ۵ باشد.";
        if(id is {} warehouseId&&await Zones.AnyAsync(x=>x.WarehouseId==warehouseId&&x.FloorNumber>input.FloorCount,ct))return "طبقات دارای زون یا سابقه را نمی‌توان حذف کرد.";
        if(input.Location is not ("inside" or "outside"))return "موقعیت انبار را داخل یا خارج از محوطه شرکت مشخص کنید.";
        var code=SerialCode.FormatCode(input.Code);
        if(SerialCode.ValidateCode(code,new CodeOptions{MaxLength=30,SuffixWidth=1}) is not null||code.Length==0)return "کد انبار معتبر وارد کنید.";
        if(string.IsNullOrWhiteSpace(input.Name)||input.Name.Length>200||input.Address?.Length>2000||input.Description?.Length>4000||input.CustodianChangeReason?.Length>2000||input.Addresses?.Length>30||input.Addresses?.Any(x=>x is null||x.Length>2000)==true)return "نام، آدرس یا توضیحات انبار معتبر نیست.";
        var upper=code.ToUpperInvariant();
        if(await db.Warehouses.AnyAsync(x=>x.Id!=id&&x.Code.ToUpper()==upper,ct))return "کد انبار تکراری است.";
        if(input.CustodianPersonId is {} person&&!await db.Persons.AnyAsync(x=>x.Id==person&&x.IsActive,ct))return "انباردار باید از اشخاص فعال انتخاب شود.";
        return null;
    }
    private static void Apply(Warehouse w,WarehouseInput i){w.FloorCount=i.FloorCount;w.Location=i.Location;w.Code=SerialCode.FormatCode(i.Code);w.NameFa=i.Name.Trim();w.NameEn=i.Name.Trim();w.Address=i.Address?.Trim();w.Description=i.Description?.Trim();w.AddressesJson=JsonSerializer.Serialize(i.Addresses??[]);w.CustodianPersonId=i.CustodianPersonId;}
    private async Task ChangeCustodian(Warehouse w,Guid? old,WarehouseInput input,CancellationToken ct)
    {
        if(old==input.CustodianPersonId)return;
        var now=DateTime.UtcNow;
        var active=await Periods.Where(x=>x.WarehouseId==w.Id&&x.EndedAtUtc==null).ToArrayAsync(ct);
        foreach(var h in active)h.EndedAtUtc=now;
        // Release the filtered unique slot before adding its replacement, within the same SQL transaction.
        if(active.Length>0)await db.SaveChangesAsync(ct);
        if(input.CustodianPersonId is {} person)Periods.Add(new WarehouseCustodianPeriod{WarehouseId=w.Id,PersonId=person,StartedAtUtc=now,ChangedByUserId=Guid.TryParse(User?.FindFirstValue(ClaimTypes.NameIdentifier),out var actor)?actor:null,Reason=input.CustodianChangeReason});
    }
    private async Task<IActionResult> Write(Func<Task<IActionResult>> action,CancellationToken ct)
    {
        var attempt=0;
        return await db.Database.CreateExecutionStrategy().ExecuteAsync(async()=>{
            if(attempt++>0)db.ChangeTracker.Clear();
            await using var transaction=db.Database.IsSqlServer()?await db.Database.BeginTransactionAsync(ct):null;
            if(transaction is not null)await db.Database.ExecuteSqlRawAsync("DECLARE @r int; EXEC @r=sys.sp_getapplock @Resource=N'yarn-trade.warehouses.write.v1',@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=10000; IF @r<0 THROW 51000,'Warehouse write lock unavailable',1;",ct);
            try{var result=await action();if(transaction is not null&&result is OkObjectResult)await transaction.CommitAsync(ct);return result;}
            catch(DbUpdateConcurrencyException){return AggregateConcurrency.Conflict();}
            catch(DbUpdateException e)when(e.InnerException is Microsoft.Data.SqlClient.SqlException{Number:2601 or 2627}){return Conflict(new{error="کد یا نام تکراری است. اطلاعات را دوباره دریافت کنید."});}
        });
    }
}
