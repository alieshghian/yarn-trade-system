using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Controllers;
using YarnTrade.Api.Domain;

namespace YarnTrade.Tests;
public sealed partial class SecurityBaselineTests
{
    [Fact]
    public async Task ZoneBatch_preview_skips_occupied_codes_and_commit_is_all_or_nothing()
    {
        await using var db=WarehouseMemory();var api=new WarehousesController(db);
        var w=SavedWarehouse(await api.Create(new("BATCH","Batch warehouse",null,null,null,Location:"inside"),default));
        Assert.IsType<OkObjectResult>(await api.CreateZone(w.Id,new("1-12","Existing",null),default));
        var preview=Assert.IsType<OkObjectResult>(await api.PreviewZoneBatch(w.Id,new(1,"1-11",5),default));
        var codes=JsonSerializer.SerializeToElement(preview.Value).GetProperty("codes").EnumerateArray().Select(x=>x.GetString()!).ToArray();
        Assert.Equal(new[]{"1-11","1-13","1-14","1-15","1-16"},codes);
        var invalid=new ZoneBatchInput([new("1-11","New",null),new("1-13","Existing",null)]);
        Assert.IsType<ConflictObjectResult>(await api.CreateZoneBatch(w.Id,invalid,default));
        Assert.Equal(2,await db.Set<WarehouseZone>().CountAsync());
        Assert.IsType<ConflictObjectResult>(await api.CreateZoneBatch(w.Id,new([new("1-11","مکان يک",null),new("1-13"," مکان یک ",null)]),default));
        Assert.IsType<BadRequestObjectResult>(await api.CreateZoneBatch(w.Id,new([new("1-11","Valid",null),new("1-13","",null)]),default));
        Assert.Equal(2,await db.Set<WarehouseZone>().CountAsync());
        var batch=new ZoneBatchInput(codes.Select((code,i)=>new ZoneInput(code,"Zone "+i,null)).ToArray());
        var saved=Assert.IsType<OkObjectResult>(await api.CreateZoneBatch(w.Id,batch,default));
        var items=JsonSerializer.SerializeToElement(saved.Value).GetProperty("items");Assert.Equal(5,items.GetArrayLength());
        Assert.Equal(5,items.EnumerateArray().Select(x=>x.GetProperty("Id").GetGuid()).Distinct().Count());
        Assert.IsType<ConflictObjectResult>(await api.CreateZoneBatch(w.Id,batch,default));
        Assert.Equal(7,await db.Set<WarehouseZone>().CountAsync());
    }

    [Fact]
    public async Task ZoneBatch_SQL_concurrent_submissions_never_partially_insert_or_duplicate()
    {
        await using var sql=await A4SqlDatabase.CreateLatest(false);
        await using var db=sql.Context();var api=new WarehousesController(db);
        var w=SavedWarehouse(await api.Create(new("SQL-BATCH","Batch warehouse",null,null,null,Location:"inside"),default));
        var batch=new ZoneBatchInput([new("1-11","Zone A",null),new("1-12","Zone B",null)]);
        async Task<IActionResult> Save(){await using var other=sql.Context();return await new WarehousesController(other).CreateZoneBatch(w.Id,batch,default);}
        var results=await Task.WhenAll(Save(),Save(),Save());
        Assert.Single(results.OfType<OkObjectResult>());Assert.Equal(2,results.OfType<ConflictObjectResult>().Count());
        await using var reload=sql.Context();var rows=await reload.Set<WarehouseZone>().Where(x=>x.WarehouseId==w.Id&&!x.IsDefaultReceiving).ToArrayAsync();
        Assert.Equal(2,rows.Length);Assert.Equal(2,rows.Select(x=>x.Code).Distinct().Count());
        Assert.IsType<ConflictObjectResult>(await api.CreateZoneBatch(w.Id,new([new("1-20","New",null),new("1-12","Conflict",null)]),default));
        Assert.False(await reload.Set<WarehouseZone>().AnyAsync(x=>x.Code=="1-20"));
    }
    private sealed class ZoneLeaseClock : TimeProvider { public DateTimeOffset Now=DateTimeOffset.UtcNow; public override DateTimeOffset GetUtcNow()=>Now; }
    [Fact]
    public async Task ZoneEditor_SQL_excludes_other_users_browsers_and_instances_and_releases_expired_sessions()
    {
        await using var sql=await A4SqlDatabase.CreateLatest(false);
        await using var db=sql.Context();var cs=db.Database.GetConnectionString()!;var id=Guid.NewGuid();
        var clock=new ZoneLeaseClock();using var first=new YarnTrade.Api.Services.WarehouseZoneEditSessions(clock);using var second=new YarnTrade.Api.Services.WarehouseZoneEditSessions(clock);
        var a=Guid.NewGuid().ToString();var b=Guid.NewGuid().ToString();
        Assert.True(await first.Acquire(id,"user-a",a,cs,default));
        Assert.False(await second.Acquire(id,"user-b",b,cs,default));
        Assert.False(await second.Acquire(id,"user-a",b,cs,default));
        Assert.False(await first.Use(id,"user-b",a,()=>Task.FromResult(true),()=>false,default));
        Assert.False(await first.Use(id,"user-a",b,()=>Task.FromResult(true),()=>false,default));
        Assert.True(await first.Use(id,"user-a",a,()=>Task.FromResult(true),()=>false,default));
        await first.Release(id,"user-a",b,default);Assert.False(await second.Acquire(id,"user-b",b,cs,default));
        await first.Release(id,"user-a",a,default);Assert.True(await second.Acquire(id,"user-b",b,cs,default));
        clock.Now=clock.Now.AddMinutes(3);
        Assert.False(await second.Use(id,"user-b",b,()=>Task.FromResult(true),()=>false,default));
        Assert.True(await first.Acquire(id,"user-a",a,cs,default));
        Assert.True(await second.Acquire(Guid.NewGuid(),"user-b",b,cs,default));
    }
    [Fact]
    public void ZoneEditor_all_mutation_endpoints_require_the_editor_session()
    {
        foreach(var name in new[]{"CreateDock","CopyZones","CreateZone","PreviewZoneBatch","CreateZoneBatch","UpdateZone"})
            Assert.NotNull(typeof(WarehousesController).GetMethod(name)!.GetCustomAttributes(typeof(YarnTrade.Api.Security.WarehouseZoneEditorAttribute),false).SingleOrDefault());
    }

}
