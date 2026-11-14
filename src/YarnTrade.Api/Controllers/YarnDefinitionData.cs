using System.Text.Json;
using System.Globalization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Domain;
using YarnTrade.Api.Data;
using YarnTrade.Api.Security;

namespace YarnTrade.Api.Controllers;

public sealed record YarnColorInput(Guid? Id, string Value, bool IsDefault);
public sealed record YarnVolumeInput(Guid? Id, Guid PackagingId, decimal CbmPerTon, bool IsDefault);
public sealed record YarnDefinitionInput(string ReleaseId, Dictionary<string,string> Values, YarnColorInput[] Colors, YarnVolumeInput[] Packaging);
public sealed record YarnColorResult(Guid Id,string Value,bool IsDefault);
public sealed record YarnVolumeResult(Guid Id,Guid PackagingId,string PackagingName,decimal CbmPerTon,bool IsDefault);
public sealed record YarnDefinitionResult(string ReleaseId,Dictionary<string,string> Values,YarnColorResult[] Colors,YarnVolumeResult[] Packaging);
public sealed record YarnReferenceInput(string Name);
public sealed record YarnReferenceChange(Guid? Id,string Name,bool IsDefault,string? RowVersion,bool Remove=false);

public sealed partial class YarnsController
{
    // Read-only, bounded suggestions from the same persisted scalar field.
    [HttpGet("definition-number-options"),RequirePermission("yarns.view")]
    public async Task<ActionResult<decimal[]>> DefinitionNumberOptions(string field,string? q,CancellationToken ct)
    {
        q=(q??"").Trim();
        if(q.Length==0)return Ok(Array.Empty<decimal>());
        if(q.Length>32||q.Any(c=>!char.IsAsciiDigit(c)&&c!='.'&&c!='-'))return BadRequest("پیشوند عدد معتبر وارد کنید.");
        var rows=db.YarnItems.AsNoTracking();
        IQueryable<decimal?>? numbers=field switch {
            "countValue"=>rows.Select(x=>x.CountValue),
            "filamentNumber"=>rows.Select(x=>x.FilamentNumber),
            "plyCount"=>rows.Select(x=>(decimal?)x.PlyCount),
            "twistAmount"=>rows.Select(x=>x.TwistAmount),
            _=>null
        };
        if(numbers is null)return BadRequest("این فیلد منبع عددی مجاز ندارد.");
        return Ok(await numbers.Where(x=>x.HasValue&&x.Value.ToString().StartsWith(q)).Select(x=>x!.Value).Distinct().OrderBy(x=>x).Take(20).ToArrayAsync(ct));
    }
    private static readonly JsonDocument ApprovedDefinition = JsonDocument.Parse(typeof(YarnsController).Assembly.GetManifestResourceStream("YarnTrade.Api.Contracts.YarnApprovedDefinition.json")!);
    private static string DefinitionRelease => ApprovedDefinition.RootElement.GetProperty("releaseId").GetString()!;
    private static CodeOptions DefinitionCodeOptions=>JsonSerializer.Deserialize<CodeOptions>(DefinitionFields.Single(f=>f.GetProperty("id").GetString()=="code").GetProperty("settings").GetProperty("componentSettings").GetRawText(),new JsonSerializerOptions{PropertyNameCaseInsensitive=true})!;
    private static JsonElement[] DefinitionFields => ApprovedDefinition.RootElement.GetProperty("schema").GetProperty("fields").EnumerateArray().ToArray();
    private static string NormalizeDefinition(string value) => ProductGroupsController.NormalizeName(value);
    private static string ReferenceField(string property) => char.ToLowerInvariant(property[0])+property[1..];
    private async Task<bool> IsReferenceValue(string property,string value,CancellationToken ct)
    {
        var field=ReferenceField(property); var normalized=NormalizeDefinition(value);
        return await db.Set<YarnDefinitionReference>().AnyAsync(x=>x.FieldId==field&&x.NormalizedName==normalized,ct);
    }
    private async Task<string?> ValidateDefinition(YarnInput input,Guid? currentId,CancellationToken ct)
    {
        var d=input.Definition!;
        if(d.ReleaseId!=DefinitionRelease)return "نسخهٔ فرم با قرارداد عملیاتی تطبیق ندارد؛ فرم را دوباره باز کنید.";
        var unchangedLegacy=currentId is Guid legacyId&&!await db.Set<YarnDefinitionState>().AnyAsync(s=>s.YarnId==legacyId,ct)&&await db.YarnItems.AnyAsync(y=>y.Id==legacyId&&y.Code==input.Code,ct);
        if(!unchangedLegacy&&SerialCode.ValidateCode(input.Code,DefinitionCodeOptions) is {} codeError)return codeError;
        if(d.Values is null||d.Colors is null||d.Packaging is null||d.Values.Count>100||d.Colors.Length>500||d.Packaging.Length>100)return "حجم یا ساختار اطلاعات فرم معتبر نیست.";
        if(d.Colors.Length==0||d.Colors.Count(x=>x.IsDefault)!=1)return "حداقل یک رنگ و دقیقاً یک رنگ پیش‌فرض انتخاب کنید.";
        if(d.Colors.Any(x=>string.IsNullOrWhiteSpace(x.Value)||x.Value.Length>120)||d.Colors.Select(x=>NormalizeDefinition(x.Value)).Distinct().Count()!=d.Colors.Length)return "نام یا کد رنگ خالی یا تکراری است.";
        if(d.Packaging.Length==0||d.Packaging.Count(x=>x.IsDefault)!=1||d.Packaging.Select(x=>x.PackagingId).Distinct().Count()!=d.Packaging.Length)return "بسته‌بندی و پیش‌فرض آن را کامل کنید؛ بسته‌بندی تکراری مجاز نیست.";
        if(d.Packaging.Any(x=>x.CbmPerTon<=0||x.CbmPerTon>999999999||decimal.Round(x.CbmPerTon,3)!=x.CbmPerTon))return "CBM باید مثبت و حداکثر دارای سه رقم اعشار باشد.";
        var ids=d.Packaging.Select(x=>x.PackagingId).ToArray();
        if(await db.Set<YarnDefinitionReference>().CountAsync(x=>x.FieldId=="packaging"&&ids.Contains(x.Id),ct)!=ids.Length)return "نوع بسته‌بندی در مرجع مشترک وجود ندارد.";
        // Authoritative scalar values, not an independently supplied client dictionary.
        var values=DefinitionValues(input);
        if(DefinitionName(values).Length>600)return "نام کامل نخ بیش از ۶۰۰ نویسه است.";
        if(new[]{input.FilamentNumber,input.CountValue,input.TwistAmount}.Any(n=>n is decimal value&&(decimal.Round(value,6)!=value||value>99999999999999m)))return "مقدار عددی باید حداکثر شش رقم اعشار و چهارده رقم صحیح داشته باشد.";
        foreach(var field in DefinitionFields){
            var id=field.GetProperty("id").GetString()!;var component=field.GetProperty("componentId").GetString();
            if(component is "base-form.derived-display" or "base-form.packaging-volume" or "base-form.batch-values")continue;
            if(field.TryGetProperty("required",out var required)&&required.ValueKind==JsonValueKind.True&&string.IsNullOrWhiteSpace(values.GetValueOrDefault(id)))return "فیلد «"+field.GetProperty("label").GetProperty("fa").GetString()+"» الزامی است.";
        }
        var name=NormalizeDefinition(input.Name);
        if(await db.Set<YarnDefinitionState>().AnyAsync(x=>x.YarnId!=currentId&&x.NormalizedName==name,ct)||await db.YarnItems.AnyAsync(x=>x.Id!=currentId&&x.NameFa==input.Name.Trim(),ct))return "نام نخ طبق قانون یکتایی مستقل قبلاً استفاده شده است.";
        if(d.Values.Any(x=>x.Value is null||x.Value.Length>2000))return "طول مقدار فیلد معتبر نیست.";
        if(input.Code.Any(c=>c>127))return "کد نخ فقط باید با حروف و اعداد انگلیسی ثبت شود.";
        foreach(var property in Allowed.Keys){var value=typeof(YarnInput).GetProperty(property)!.GetValue(input) as string;if(value?.Length>120)return "طول مشخصات نخ بیش از حد مجاز است.";}
        if(currentId is Guid yarnId){
            var existing=await db.Set<YarnColor>().Where(x=>x.YarnId==yarnId).ToListAsync(ct);
            if(d.Colors.Any(c=>c.Id is Guid id&&existing.All(x=>x.Id!=id)))return "شناسهٔ رنگ به این نخ تعلق ندارد.";
            if(d.Colors.Any(c=>existing.Any(x=>x.NormalizedValue==NormalizeDefinition(c.Value)&&c.Id is Guid id&&x.Id!=id)))return "نام رنگ به شناسهٔ دیگری تعلق دارد.";
        }
        return null;
    }
    private static Dictionary<string,string> DefinitionValues(YarnInput input)
    {
        var values=new Dictionary<string,string>();
        foreach(var field in DefinitionFields){var id=field.GetProperty("id").GetString()!;
            var property=id=="yarnGroup"?nameof(YarnInput.ProductGroupId):char.ToUpperInvariant(id[0])+id[1..];
            var raw=typeof(YarnInput).GetProperty(property)?.GetValue(input);
            values[id]=raw switch{null=>"",bool v=>v?"true":"false",IFormattable n=>n.ToString(null,CultureInfo.InvariantCulture)??"",_=>raw.ToString()??""};
        }
        return values;
    }
    private static string DefinitionName(Dictionary<string,string> values)
    {
        var derived=DefinitionFields.Single(x=>x.GetProperty("componentId").GetString()=="base-form.derived-display").GetProperty("settings").GetProperty("derivedSettings");
        var parts=new List<string>();
        foreach(var source in derived.GetProperty("sourceFieldIds").EnumerateArray()){
            var id=source.GetString()!;var value=values.GetValueOrDefault(id)??"";if(string.IsNullOrWhiteSpace(value))continue;
            if(Labels.TryGetValue(value,out var translated))value=translated;
            if(derived.TryGetProperty("sourceFormats",out var formats)&&formats.TryGetProperty(id,out var format)){
                var label=format.TryGetProperty("label",out var l)?l.GetString()??"":DefinitionFields.First(f=>f.GetProperty("id").GetString()==id).GetProperty("label").GetProperty("fa").GetString()!;
                value=format.GetProperty("mode").GetString() switch{"valueLabel"=>value+" "+label,"labelValue"=>label+" "+value,"label"=>label,_=>value};
            }
            parts.Add(value);
        }
        return string.Join(derived.GetProperty("separator").GetString(),parts);
    }
    private async Task ApplyDefinition(YarnItem yarn,YarnDefinitionInput input,CancellationToken ct)
    {
        var state=await db.Set<YarnDefinitionState>().SingleOrDefaultAsync(x=>x.YarnId==yarn.Id,ct);
        if(state is null){state=new(){YarnId=yarn.Id};db.Add(state);}
        // Scalars were validated against the request; reconstruct them from the entity after Apply.
        var values=new Dictionary<string,string>();foreach(var field in DefinitionFields){var id=field.GetProperty("id").GetString()!;var property=id switch{"yarnGroup"=>"ProductGroupId","name"=>"NameFa",_=>char.ToUpperInvariant(id[0])+id[1..]};var raw=typeof(YarnItem).GetProperty(property)?.GetValue(yarn);values[id]=raw is IFormattable n?n.ToString(null,CultureInfo.InvariantCulture)??"":raw is bool b?b?"true":"false":raw?.ToString()??"";}
        state.ValuesJson=JsonSerializer.Serialize(values);state.ReleaseId=DefinitionRelease;state.NormalizedName=NormalizeDefinition(yarn.NameFa);
        yarn.ComprehensiveName=DefinitionName(values);yarn.SearchText=PersianTextNormalizer.Normalize(yarn.Code+" "+yarn.ComprehensiveName+" "+string.Join(' ',input.Colors.Select(x=>x.Value)));
        // Release filtered unique default slots inside the enclosing serializable
        // transaction, before EF orders inserts/updates. Rollback restores them.
        if(db.Database.IsSqlServer()){
            await db.Set<YarnColor>().Where(x=>x.YarnId==yarn.Id&&x.IsDefault).ExecuteUpdateAsync(s=>s.SetProperty(x=>x.IsDefault,false),ct);
            await db.Set<YarnPackagingCoefficient>().Where(x=>x.YarnId==yarn.Id&&x.IsDefault).ExecuteUpdateAsync(s=>s.SetProperty(x=>x.IsDefault,false),ct);
        }
        var oldColors=await db.Set<YarnColor>().Where(x=>x.YarnId==yarn.Id).ToListAsync(ct);
        var retained=new HashSet<Guid>();foreach(var c in input.Colors){var normalized=NormalizeDefinition(c.Value);var old=oldColors.FirstOrDefault(x=>c.Id==x.Id)??oldColors.FirstOrDefault(x=>x.NormalizedValue==normalized);if(old is null){old=new(){YarnId=yarn.Id};db.Add(old);}old.Value=c.Value.Trim();old.NormalizedValue=normalized;old.IsDefault=c.IsDefault;retained.Add(old.Id);}db.RemoveRange(oldColors.Where(x=>!retained.Contains(x.Id)));
        var oldVolumes=await db.Set<YarnPackagingCoefficient>().Where(x=>x.YarnId==yarn.Id).ToListAsync(ct);var kept=new HashSet<Guid>();
        foreach(var v in input.Packaging){var old=oldVolumes.FirstOrDefault(x=>x.PackagingId==v.PackagingId);if(old is null){old=new(){YarnId=yarn.Id,PackagingId=v.PackagingId};db.Add(old);}old.CbmPerTon=v.CbmPerTon;old.IsDefault=v.IsDefault;kept.Add(old.Id);}db.RemoveRange(oldVolumes.Where(x=>!kept.Contains(x.Id)));
    }
    private async Task<YarnView> DefinitionView(YarnItem yarn,CancellationToken ct)
    {
        var state=await db.Set<YarnDefinitionState>().AsNoTracking().SingleOrDefaultAsync(x=>x.YarnId==yarn.Id,ct);if(state is null)return YarnView.From(yarn);
        var colors=await db.Set<YarnColor>().Where(x=>x.YarnId==yarn.Id).OrderBy(x=>x.Id).Select(x=>new YarnColorResult(x.Id,x.Value,x.IsDefault)).ToArrayAsync(ct);
        var packaging=await (from v in db.Set<YarnPackagingCoefficient>() join p in db.Set<YarnDefinitionReference>() on v.PackagingId equals p.Id where v.YarnId==yarn.Id orderby p.Name select new YarnVolumeResult(v.Id,p.Id,p.Name,v.CbmPerTon,v.IsDefault)).ToArrayAsync(ct);
        return YarnView.From(yarn) with{Definition=new(state.ReleaseId,JsonSerializer.Deserialize<Dictionary<string,string>>(state.ValuesJson)??[],colors,packaging)};
    }
    [HttpGet("definition-references"),RequirePermission("yarns.view")]
    public async Task<object> References(CancellationToken ct)=>await db.Set<YarnDefinitionReference>().AsNoTracking().OrderBy(x=>x.FieldId).ThenBy(x=>x.Name).Select(x=>new{x.Id,x.FieldId,x.Name,x.IsDefault,x.RowVersion}).ToListAsync(ct);

    [HttpGet("definition-latest"),RequirePermission("yarns.view")]
    public async Task<ActionResult<YarnView>> LatestDefinition(CancellationToken ct){
        var item=await db.YarnItems.AsNoTracking().OrderByDescending(x=>x.UpdatedAtUtc??x.CreatedAtUtc).ThenByDescending(x=>x.Id).FirstOrDefaultAsync(ct);
        return item is null?NotFound(new{error="هنوز نخی ثبت نشده است."}):Ok(await DefinitionView(item,ct));
    }

    [HttpGet("definition-suggest-code"),RequirePermission("yarns.view")]
    public async Task<ActionResult> DefinitionCode(CancellationToken ct){
        var options=DefinitionCodeOptions;
        var previous=await db.YarnItems.AsNoTracking().Where(x=>x.Code.Length<=(options.MaxLength??50)).OrderByDescending(x=>x.CreatedAtUtc).ThenByDescending(x=>x.Id).Select(x=>x.Code).FirstOrDefaultAsync(ct);
        var suggestion=SerialCode.Suggest(previous is null?[]:[previous],options);
        var normalized=suggestion.Value.ToUpperInvariant();
        if(suggestion.Value!=""&&await db.YarnItems.AnyAsync(x=>x.Code.ToUpper()==normalized,ct))return Ok(new{suggestion="",error="کد پیشنهادی همزمان استفاده شده است؛ کد دیگری وارد کنید."});
        return Ok(new{suggestion=suggestion.Value,error=suggestion.Error});
    }

    [HttpPost("definition-references/{fieldId}"),RequirePermission("yarns.create")]
    public Task<ActionResult> AddReference(string fieldId,YarnReferenceInput input,CancellationToken ct)=>ProductGroupWriteScope.Run<ActionResult>(db,async()=>{
        var field=DefinitionFields.FirstOrDefault(f=>f.GetProperty("id").GetString()==fieldId);
        if(fieldId!="packaging"&&(field.ValueKind==JsonValueKind.Undefined||field.GetProperty("componentId").GetString()!="persons.title-control"))return BadRequest(new{error="منبع تعریف معتبر نیست."});
        if(field.ValueKind!=JsonValueKind.Undefined&&field.TryGetProperty("settings",out var settings)&&settings.TryGetProperty("listSettings",out var list)&&list.TryGetProperty("permissions",out var permissions)&&permissions.TryGetProperty("add",out var permission)){
            var value=permission.GetString();if(value=="none"||value=="admin"&&!(User.IsInRole("Administrator")||User.IsInRole("Manager")))return Forbid();
        }
        if(string.IsNullOrWhiteSpace(input.Name)||input.Name.Length>120)return BadRequest(new{error="نام مرجع الزامی و حداکثر ۱۲۰ کاراکتر است."});
        var key=NormalizeDefinition(input.Name);var found=await db.Set<YarnDefinitionReference>().SingleOrDefaultAsync(x=>x.FieldId==fieldId&&x.NormalizedName==key,ct);if(found is not null)return Ok(new{found.Id,found.FieldId,found.Name,found.IsDefault,found.RowVersion});
        var item=new YarnDefinitionReference{FieldId=fieldId,Name=input.Name.Trim(),NormalizedName=key};db.Add(item);await db.SaveChangesAsync(ct);return Ok(new{item.Id,item.FieldId,item.Name,item.IsDefault,item.RowVersion});
    },ct);

    [HttpPut("definition-references/{fieldId}"),RequirePermission("yarns.create")]
    public Task<ActionResult> SaveReferences(string fieldId,YarnReferenceChange[] input,CancellationToken ct)=>ProductGroupWriteScope.Run<ActionResult>(db,async()=>{
        var field=DefinitionFields.FirstOrDefault(f=>f.GetProperty("id").GetString()==fieldId);
        if(field.ValueKind==JsonValueKind.Undefined||field.GetProperty("componentId").GetString()!="persons.title-control")return BadRequest(new{error="منبع تعریف معتبر نیست."});
        bool AllowedOperation(string operation){
            var value="everyone";
            if(field.TryGetProperty("settings",out var s)&&s.TryGetProperty("listSettings",out var l)&&l.TryGetProperty("permissions",out var p)&&p.TryGetProperty(operation,out var permission))value=permission.GetString();
            return value=="everyone"||value=="admin"&&(User.IsInRole("Administrator")||User.IsInRole("Manager"));
        }
        var active=input.Where(x=>!x.Remove).ToArray();
        if(input.Length>1000||active.Count(x=>x.IsDefault)>1||active.Any(x=>string.IsNullOrWhiteSpace(x.Name)||x.Name.Length>120)||active.Select(x=>NormalizeDefinition(x.Name)).Distinct().Count()!=active.Length)return BadRequest(new{error="نام مرجع خالی یا تکراری است."});
        var existing=await db.Set<YarnDefinitionReference>().Where(x=>x.FieldId==fieldId).ToListAsync(ct);
        if(input.Any(x=>x.Id is Guid id&&existing.All(e=>e.Id!=id)))return BadRequest(new{error="شناسهٔ مرجع معتبر نیست."});
        var property=char.ToUpperInvariant(fieldId[0])+fieldId[1..];
        foreach(var old in existing){
            var next=input.FirstOrDefault(x=>x.Id==old.Id);
            if(next is null)return Conflict(new{error="فهرست مرجع تغییر کرده است؛ دوباره باز کنید."});
            var change=next.Remove||next.Name.Trim()!=old.Name;
            if(change&&!AllowedOperation(next.Remove?"remove":"edit")||next is not null&&next.IsDefault!=old.IsDefault&&!AllowedOperation("setDefault"))return Forbid();
            if(change&&await db.YarnItems.AnyAsync(y=>EF.Property<string>(y,property)==old.Name,ct))return Conflict(new{error="این مقدار استفاده شده و قابل تغییر یا حذف نیست."});
            if(next.Remove){var deletionConflict=AggregateConcurrency.Apply(db,old,next.RowVersion,touch:false);if(deletionConflict is not null)return deletionConflict;db.Remove(old);continue;}
            if(next.Name.Trim()==old.Name&&next.IsDefault==old.IsDefault)continue;
            var conflict=AggregateConcurrency.Apply(db,old,next.RowVersion);if(conflict is not null)return conflict;
            old.Name=next.Name.Trim();old.NormalizedName=NormalizeDefinition(old.Name);old.IsDefault=next.IsDefault;
        }
        foreach(var next in active.Where(x=>x.Id is null)){
            if(!AllowedOperation("add"))return Forbid();
            db.Add(new YarnDefinitionReference{FieldId=fieldId,Name=next.Name.Trim(),NormalizedName=NormalizeDefinition(next.Name),IsDefault=next.IsDefault});
        }
        try{await db.SaveChangesAsync(ct);}catch(DbUpdateConcurrencyException){return AggregateConcurrency.Conflict();}catch(DbUpdateException){return Conflict(new{error="نام مرجع همزمان تغییر کرده یا تکراری است."});}
        return Ok(await db.Set<YarnDefinitionReference>().Where(x=>x.FieldId==fieldId).Select(x=>new{x.Id,x.FieldId,x.Name,x.IsDefault,x.RowVersion}).ToArrayAsync(ct));
    },ct,r=>(r as Microsoft.AspNetCore.Mvc.Infrastructure.IStatusCodeActionResult)?.StatusCode is null or <400);
}
