using Microsoft.AspNetCore.Mvc;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using YarnTrade.Api.Controllers;
using YarnTrade.Api.Domain;

namespace YarnTrade.Tests;
public sealed partial class SecurityBaselineTests
{
    [Fact]
    public async Task WarehouseDefinition_location_required_and_five_floor_limit()
    {
        await using var db=WarehouseMemory();var api=new WarehousesController(db);
        Assert.IsType<BadRequestObjectResult>(await api.Create(new("LOC","Warehouse",null,null,null),default));
        Assert.IsType<BadRequestObjectResult>(await api.Create(new("LOC","Warehouse",null,null,null,Location:"unknown"),default));
        var invalid=Assert.IsType<BadRequestObjectResult>(await api.Create(new("LOC","Warehouse",null,null,null,FloorCount:6,Location:"inside"),default));
        Assert.Contains("۱ تا ۵",System.Text.Json.JsonSerializer.Serialize(invalid.Value,new System.Text.Json.JsonSerializerOptions{Encoder=System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping}));
        var warehouse=SavedWarehouse(await api.Create(new("LOC","Warehouse",null,null,null,FloorCount:5,Location:"outside"),default));
        Assert.Equal("outside",warehouse.Location);Assert.Equal(5,warehouse.FloorCount);
        Assert.IsType<OkObjectResult>(await api.CreateDock(warehouse.Id,5,default));
        Assert.IsType<BadRequestObjectResult>(await api.CreateDock(warehouse.Id,6,default));
    }

    [Fact]
    public async Task WarehouseDefinition_SQL_floor_upgrade_preserves_existing_zone_identity()
    {
        await using var sql=await A4SqlDatabase.Create();
        await using var db=sql.Context();
        await db.GetService<IMigrator>().MigrateAsync("20261110181715_WarehouseZonesAndCustodians");
        var warehouse=Guid.NewGuid();var dock=Guid.NewGuid();var zone=Guid.NewGuid();
        await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO Warehouses (Id,Code,NameFa,NameEn,IsActive,CreatedAtUtc) VALUES ({warehouse},N'OLD',N'Existing warehouse',N'Existing warehouse',1,SYSUTCDATETIME())");
        await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO WarehouseZones (Id,WarehouseId,Code,Name,NormalizedCode,NormalizedName,IsDefaultReceiving,IsActive,CreatedAtUtc) VALUES ({dock},{warehouse},N'DOCK',N'بارانداز',N'DOCK',N'بارانداز',1,1,SYSUTCDATETIME()),({zone},{warehouse},N'A-100',N'Shelf A',N'A-100',N'SHELF A',0,1,SYSUTCDATETIME())");
        await db.Database.MigrateAsync();
        Assert.Equal(1,(await db.Warehouses.SingleAsync(w=>w.Id==warehouse)).FloorCount);
        var rows=await db.Set<WarehouseZone>().Where(z=>z.WarehouseId==warehouse).ToArrayAsync();
        Assert.Equal(2,rows.Length);Assert.All(rows,z=>Assert.Equal(1,z.FloorNumber));
        Assert.Equal("1-DOCK",rows.Single(z=>z.Id==dock).Code);
        Assert.Equal("1-A-100",rows.Single(z=>z.Id==zone).Code);
        Assert.Equal("Shelf A",rows.Single(z=>z.Id==zone).Name);
    }

    [Fact]
    public async Task WarehouseDefinition_SQL_floors_docks_copy_and_prefix_integrity()
    {
        await using var sql=await A4SqlDatabase.CreateLatest(false);
        await using var db=sql.Context();var api=new WarehousesController(db);
        var w=SavedWarehouse(await api.Create(new("FLOORS","Two floors",null,null,null,FloorCount:2,Location:"inside"),default));
        var ground=await db.Set<WarehouseZone>().SingleAsync();Assert.Equal("1-DOCK",ground.Code);Assert.Equal(1,ground.FloorNumber);
        Assert.IsType<ConflictObjectResult>(await api.UpdateZone(w.Id,ground.Id,new("1-DOCK","Changed",null),Convert.ToBase64String(ground.RowVersion),default));
        var dock=Assert.IsType<WarehouseZone>(Assert.IsType<OkObjectResult>(await api.CreateDock(w.Id,2,default)).Value);Assert.Equal("2-DOCK",dock.Code);Assert.Equal("بارانداز",dock.Name);
        Assert.IsType<ConflictObjectResult>(await api.CreateDock(w.Id,2,default));
        Assert.IsType<BadRequestObjectResult>(await api.CreateZone(w.Id,new("1-A","Wrong floor",null,FloorNumber:2),default));
        Assert.IsType<BadRequestObjectResult>(await api.CreateZone(w.Id,new("3-A","Beyond floors",null,FloorNumber:3),default));
        var a=Assert.IsType<WarehouseZone>(Assert.IsType<OkObjectResult>(await api.CreateZone(w.Id,new("1-100","Shelf A",null),default)).Value);
        var b=Assert.IsType<WarehouseZone>(Assert.IsType<OkObjectResult>(await api.CreateZone(w.Id,new("1-B","Shelf B",null),default)).Value);
        Assert.IsType<OkObjectResult>(await api.CreateZone(w.Id,new("2-100","Shelf A",null,FloorNumber:2),default));
        var candidates=Assert.IsType<OkObjectResult>(await api.CopyOptions(w.Id,1,2,default));
        var json=System.Text.Json.JsonSerializer.SerializeToElement(candidates.Value);var options=json.GetProperty("items");Assert.Single(options.EnumerateArray());Assert.Equal(b.Id,options[0].GetProperty("Id").GetGuid());
        Assert.IsType<OkObjectResult>(await api.CopyZones(w.Id,new(1,2,[a.Id,b.Id]),default));
        Assert.IsType<OkObjectResult>(await api.CopyZones(w.Id,new(1,2,[a.Id,b.Id]),default));
        Assert.Equal(2,await db.Set<WarehouseZone>().CountAsync(z=>z.WarehouseId==w.Id&&z.FloorNumber==2&&!z.IsDefaultReceiving));
        Assert.IsType<BadRequestObjectResult>(await api.Update(w.Id,new("FLOORS","Two floors",null,null,null,FloorCount:1,Location:"inside"),Convert.ToBase64String(w.RowVersion),default));
        async Task<IActionResult> Race(){await using var other=sql.Context();return await new WarehousesController(other).CreateDock(w.Id,2,default);}
        var races=await Task.WhenAll(Enumerable.Range(0,4).Select(_=>Race()));Assert.All(races,r=>Assert.IsType<ConflictObjectResult>(r));
        await using var reload=sql.Context();Assert.Equal(2,(await reload.Warehouses.SingleAsync(x=>x.Id==w.Id)).FloorCount);Assert.Equal(2,await reload.Set<WarehouseZone>().CountAsync(x=>x.WarehouseId==w.Id&&x.IsDefaultReceiving));
        await using var host=await CreateApp(sqlConnection:sql.Connection);await CreateUser(host.App,"floor-admin@example.test","Administrator");await SignIn(host,"floor-admin@example.test");
        var report=await host.Client.PostAsJsonAsync($"/api/warehouses/{w.Id}/zones/grid?floor=2",new WarehouseGridRequest(Search:"Shelf",SearchMode:"contains"));report.EnsureSuccessStatusCode();
        var page=await report.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();Assert.Equal(2,page.GetProperty("total").GetInt32());Assert.All(page.GetProperty("items").EnumerateArray(),r=>Assert.StartsWith("2-",r.GetProperty("code").GetString()));
    }
}
