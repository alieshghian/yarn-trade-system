using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using YarnTrade.Api.Controllers;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;

namespace YarnTrade.Tests;

public sealed partial class SecurityBaselineTests
{
    private static AppDbContext WarehouseMemory() => new(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
    private static Warehouse SavedWarehouse(IActionResult value) => Assert.IsType<Warehouse>(Assert.IsType<OkObjectResult>(value).Value);

    [Fact]
    public async Task WarehouseDefinition_optional_keeper_dock_normalized_zones_and_restricted_deactivation()
    {
        await using var db=WarehouseMemory();var api=new WarehousesController(db);
        var w=SavedWarehouse(await api.Create(new("wh-01","انبار یک",null,null,null,Location:"inside"),default));
        Assert.Null(w.CustodianPersonId);Assert.Empty(await db.Set<WarehouseCustodianPeriod>().ToArrayAsync());
        var dock=Assert.Single(await db.Set<WarehouseZone>().ToArrayAsync());Assert.True(dock.IsDefaultReceiving);Assert.True(dock.IsActive);
        Assert.IsType<BadRequestObjectResult>(await api.Create(new("WH-01","تکراری",null,null,null,Location:"inside"),default));
        var z=Assert.IsType<WarehouseZone>(Assert.IsType<OkObjectResult>(await api.CreateZone(w.Id,new("1-A","  كالا   يک ",null),default)).Value);
        Assert.IsType<ConflictObjectResult>(await api.CreateZone(w.Id,new("1-B","کالا یک",null),default));
        Assert.IsType<ConflictObjectResult>(await api.CreateZone(w.Id,new("1-a","متفاوت",null),default));
        var other=SavedWarehouse(await api.Create(new("WH-02","انبار دو",null,null,null,Location:"inside"),default));
        Assert.IsType<OkObjectResult>(await api.CreateZone(other.Id,new("1-A","کالا یک",null),default));
        dock.RowVersion=new byte[8];await db.SaveChangesAsync();
        Assert.IsType<ConflictObjectResult>(await api.UpdateZone(w.Id,dock.Id,new("1-DOCK","بارانداز",null,false),Convert.ToBase64String(dock.RowVersion),default));
        Assert.IsType<NotFoundResult>(await api.UpdateZone(other.Id,z.Id,new("1-C","اشتباه",null),null,default));
    }

    [Fact]
    public async Task WarehouseDefinition_keeper_periods_and_stale_changes_preserve_history()
    {
        await using var db=WarehouseMemory();var a=new Person{PersonCode="A",DisplayName="اول"};var b=new Person{PersonCode="B",DisplayName="دوم"};db.Persons.AddRange(a,b);await db.SaveChangesAsync();
        var api=new WarehousesController(db);var w=SavedWarehouse(await api.Create(new("W1","Warehouse",null,null,a.Id,Location:"inside"),default));
        Assert.Equal(a.Id,Assert.Single(await db.Set<WarehouseCustodianPeriod>().ToArrayAsync()).PersonId);
        w.RowVersion=new byte[8];await db.SaveChangesAsync();
        SavedWarehouse(await api.Update(w.Id,new("W1","Warehouse",null,null,b.Id,CustodianChangeReason:"تغییر مسئول",Location:"inside"),Convert.ToBase64String(w.RowVersion),default));
        var periods=await db.Set<WarehouseCustodianPeriod>().ToArrayAsync();Assert.Equal(2,periods.Length);
        Assert.Equal(b.Id,Assert.Single(periods,x=>x.EndedAtUtc==null).PersonId);Assert.NotNull(periods.Single(x=>x.PersonId==a.Id).EndedAtUtc);
        Assert.IsType<ConflictObjectResult>(await api.Update(w.Id,new("W1","Stale",null,null,a.Id,Location:"inside"),Convert.ToBase64String(new byte[]{1,0,0,0,0,0,0,0}),default));
        Assert.Equal(b.Id,w.CustodianPersonId);
    }

    [Fact]
    public async Task WarehouseDefinition_API_permissions_grid_filter_sort_and_empty_state()
    {
        await using var host=await CreateApp();await CreateUser(host.App,"warehouse-admin@example.test","Administrator");await SignIn(host,"warehouse-admin@example.test");
        var empty=await host.Client.PostAsJsonAsync("/api/warehouses/grid",new WarehouseGridRequest());empty.EnsureSuccessStatusCode();
        Assert.Equal(0,(await empty.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("total").GetInt32());
        foreach(var name in new[]{"Alpha","Beta"}){var response=await host.Client.PostAsJsonAsync("/api/warehouses",new WarehouseInput(name,name,null,null,null,Location:"inside"));response.EnsureSuccessStatusCode();}
        var grid=await host.Client.PostAsJsonAsync("/api/warehouses/grid",new WarehouseGridRequest(Search:"Beta",SearchMode:"contains"));grid.EnsureSuccessStatusCode();
        Assert.Equal("Beta",(await grid.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("items")[0].GetProperty("name").GetString());
        await CreateUser(host.App,"warehouse-view@example.test","ReportViewer");await SignIn(host,"warehouse-view@example.test");
        Assert.Equal(HttpStatusCode.Forbidden,(await host.Client.PostAsJsonAsync("/api/warehouses",new WarehouseInput("DENY","Denied",null,null,null,Location:"inside"))).StatusCode);
    }

    [Fact]
    public void WarehouseDefinition_migration_additive_snapshot_and_constraints()
    {
        using var db=new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlServer("Server=unused;Database=unused").Options);
        var assembly=db.GetService<IMigrationsAssembly>();var migration=assembly.CreateMigration(assembly.Migrations.Single(x=>x.Key.EndsWith("_WarehouseZonesAndCustodians")).Value,"Microsoft.EntityFrameworkCore.SqlServer");
        Assert.DoesNotContain(migration.UpOperations,x=>x is Microsoft.EntityFrameworkCore.Migrations.Operations.DropTableOperation or Microsoft.EntityFrameworkCore.Migrations.Operations.DropColumnOperation);
        var snapshot=db.GetService<IModelRuntimeInitializer>().Initialize(assembly.ModelSnapshot!.Model);
        Assert.Empty(db.GetService<IMigrationsModelDiffer>().GetDifferences(snapshot.GetRelationalModel(),db.GetService<Microsoft.EntityFrameworkCore.Metadata.IDesignTimeModel>().Model.GetRelationalModel()));
        var indexes=migration.UpOperations.OfType<Microsoft.EntityFrameworkCore.Migrations.Operations.CreateIndexOperation>();Assert.Contains(indexes,x=>x.Name=="UX_WarehouseZones_Receiving"&&x.IsUnique);
    }

    [Fact]
    public async Task WarehouseDefinition_SQL_API_reload_grid_100000_paging_filter_options_and_concurrent_codes()
    {
        await using var sql=await A4SqlDatabase.CreateLatest(false);
        await using var host=await CreateApp(sqlConnection:sql.Connection);
        await CreateUser(host.App,"warehouse-sql@example.test","Administrator");await SignIn(host,"warehouse-sql@example.test");
        var first=await host.Client.PostAsJsonAsync("/api/warehouses/grid",new WarehouseGridRequest());first.EnsureSuccessStatusCode();
        Assert.Equal(0,(await first.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("total").GetInt32());
        var creates=await Task.WhenAll(Enumerable.Range(0,8).Select(i=>host.Client.PostAsJsonAsync("/api/warehouses",new WarehouseInput("SHARED","Warehouse "+i,null,null,null,Location:"inside"))));
        Assert.Single(creates.Where(x=>x.IsSuccessStatusCode));
        Assert.All(creates.Where(x=>!x.IsSuccessStatusCode),x=>Assert.Contains(x.StatusCode,new[]{HttpStatusCode.BadRequest,HttpStatusCode.Conflict}));
        var saved=await creates.Single(x=>x.IsSuccessStatusCode).Content.ReadFromJsonAsync<JsonElement>();var id=saved.GetProperty("id").GetGuid();
        var reloaded=await host.Client.GetFromJsonAsync<JsonElement>("/api/warehouses/"+id);Assert.Equal("SHARED",reloaded.GetProperty("code").GetString());
        var version=Uri.EscapeDataString(reloaded.GetProperty("rowVersion").GetString()!);
        (await host.Client.PutAsJsonAsync($"/api/warehouses/{id}?rowVersion={version}",new WarehouseInput("SHARED","Updated",null,"Saved",null,Location:"inside"))).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Conflict,(await host.Client.PutAsJsonAsync($"/api/warehouses/{id}?rowVersion={version}",new WarehouseInput("SHARED","Stale",null,null,null,Location:"inside"))).StatusCode);
        await using(var db=sql.Context()){
            // Only this disposable database receives load fixtures; never seed the live application.
            await db.Database.ExecuteSqlRawAsync("WITH n AS (SELECT TOP (100000) ROW_NUMBER() OVER(ORDER BY (SELECT NULL)) AS i FROM sys.all_objects a CROSS JOIN sys.all_objects b) INSERT INTO Warehouses(Id,Code,NameFa,NameEn,IsActive,CreatedAtUtc) SELECT NEWID(), CONCAT('LOAD-',RIGHT(CONCAT('000000',i),6)),CONCAT('Load ',i),CONCAT('Load ',i),1,SYSUTCDATETIME() FROM n;");
        }
        async Task<JsonElement> Grid(WarehouseGridRequest request){var response=await host.Client.PostAsJsonAsync("/api/warehouses/grid",request);response.EnsureSuccessStatusCode();return await response.Content.ReadFromJsonAsync<JsonElement>();}
        var request=new WarehouseGridRequest(Page:2,PageSize:50,Sort:[new("code","asc")]);var page=await Grid(request);var repeated=await Grid(request);
        Assert.Equal(100001,page.GetProperty("total").GetInt32());Assert.Equal(50,page.GetProperty("items").GetArrayLength());
        Assert.Equal(page.GetProperty("items").GetRawText(),repeated.GetProperty("items").GetRawText());
        var filter=await Grid(new(Search:"Updated",SearchMode:"exact"));Assert.Equal(1,filter.GetProperty("total").GetInt32());
        var selected=await Grid(new(Filters:new(){["code"]=new(SelectedValues:["string:SHARED"])}));Assert.Equal(1,selected.GetProperty("total").GetInt32());
        var options=await Grid(new(OptionsColumn:"code",OptionsSearch:"SHARED"));Assert.Contains("SHARED",options.GetProperty("filterValues").GetRawText());
        var latest=await host.Client.GetFromJsonAsync<JsonElement>("/api/warehouses/"+id);(await host.Client.DeleteAsync($"/api/warehouses/{id}?rowVersion={Uri.EscapeDataString(latest.GetProperty("rowVersion").GetString()!)}")).EnsureSuccessStatusCode();
        Assert.Equal(0,(await Grid(new(Search:"Updated",SearchMode:"exact"))).GetProperty("total").GetInt32());
    }

    [Fact]
    public async Task WarehouseDefinition_SQL_concurrent_zone_duplicates_and_single_custodian()
    {
        // Explicit test connection only; helper creates and removes its own isolated database.
        await using var sql=await A4SqlDatabase.CreateLatest(false);
        Guid id;await using(var db=sql.Context()){id=SavedWarehouse(await new WarehousesController(db).Create(new("WSQL","Warehouse",null,null,null,Location:"inside"),default)).Id;}
        async Task<IActionResult> Add(int i){await using var db=sql.Context();return await new WarehousesController(db).CreateZone(id,new("1-Z"+i,"همزمان",null),default);}
        var result=await Task.WhenAll(Enumerable.Range(0,8).Select(Add));Assert.Single(result.OfType<OkObjectResult>());Assert.Equal(7,result.OfType<ConflictObjectResult>().Count());
        await using var check=sql.Context();Assert.Equal(2,await check.Set<WarehouseZone>().CountAsync(x=>x.WarehouseId==id));Assert.Single(await check.Set<WarehouseZone>().Where(x=>x.WarehouseId==id&&x.IsDefaultReceiving).ToArrayAsync());
        var different=await Task.WhenAll(Enumerable.Range(10,4).Select(async i=>{await using var db=sql.Context();return await new WarehousesController(db).CreateZone(id,new("1-Z"+i,"زون "+i,null),default);}));Assert.All(different,x=>Assert.IsType<OkObjectResult>(x));
        var a=new Person{PersonCode="KEEPER-A",DisplayName="اول"};var b=new Person{PersonCode="KEEPER-B",DisplayName="دوم"};check.Persons.AddRange(a,b);await check.SaveChangesAsync();
        var w=await check.Warehouses.SingleAsync(x=>x.Id==id);var api=new WarehousesController(check);
        SavedWarehouse(await api.Update(id,new("WSQL","Warehouse",null,null,a.Id,Location:"inside"),Convert.ToBase64String(w.RowVersion),default));
        SavedWarehouse(await api.Update(id,new("WSQL","Warehouse",null,null,b.Id,Location:"inside"),Convert.ToBase64String(w.RowVersion),default));
        Assert.Equal(2,await check.Set<WarehouseCustodianPeriod>().CountAsync(x=>x.WarehouseId==id));Assert.Equal(b.Id,(await check.Set<WarehouseCustodianPeriod>().SingleAsync(x=>x.WarehouseId==id&&x.EndedAtUtc==null)).PersonId);
    }
}
