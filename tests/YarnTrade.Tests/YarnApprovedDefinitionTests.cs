using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Controllers;
using YarnTrade.Api.Domain;

namespace YarnTrade.Tests;

public sealed partial class SecurityBaselineTests
{
    [Fact]
    public async Task Yarn_numeric_suggestions_SQL_prefix_distinct_bounded_and_read_only()
    {
        await using var sql=await A4SqlDatabase.CreateLatest(operationalContract:false);
        await using var host=await CreateApp(sqlConnection:sql.Connection,sqlRetries:true);
        await CreateUser(host.App,"numeric-reader@example.test","Administrator");await SignIn(host,"numeric-reader@example.test");
        await using var db=sql.Context();var type=new YarnType{Code="NUMERIC",NameFa="عدد",NameEn="Numeric"};db.Add(type);await db.SaveChangesAsync();
        db.YarnItems.AddRange(Enumerable.Range(0,35).Select(i=>new YarnItem{YarnTypeId=type.Id,Code="N"+i,NameFa="عدد "+i,NameEn="Numeric "+i,CountValue=300+i,FilamentNumber=288,TwistAmount=3.25m,PlyCount=2,UnitOfMeasure="KG"}));await db.SaveChangesAsync();
        var before=await db.YarnItems.CountAsync();
        var matches=await host.Client.GetFromJsonAsync<decimal[]>("/api/yarns/definition-number-options?field=countValue&q=30");Assert.Equal(Enumerable.Range(300,10).Select(x=>(decimal)x),matches!);
        Assert.Equal(20,(await host.Client.GetFromJsonAsync<decimal[]>("/api/yarns/definition-number-options?field=countValue&q=3"))!.Length);
        Assert.Equal(new[]{288m},await host.Client.GetFromJsonAsync<decimal[]>("/api/yarns/definition-number-options?field=filamentNumber&q=28"));
        Assert.Equal(new[]{3.25m},await host.Client.GetFromJsonAsync<decimal[]>("/api/yarns/definition-number-options?field=twistAmount&q=3.2"));
        Assert.Equal(new[]{2m},await host.Client.GetFromJsonAsync<decimal[]>("/api/yarns/definition-number-options?field=plyCount&q=2"));
        Assert.Equal(HttpStatusCode.BadRequest,(await host.Client.GetAsync("/api/yarns/definition-number-options?field=code&q=3")).StatusCode);
        Assert.Equal(before,await db.YarnItems.CountAsync());
    }
    [Fact]
    public async Task Yarn_approved_SQL_large_report_numeric_filters_and_stable_pages()
    {
        await using var sql=await A4SqlDatabase.CreateLatest(operationalContract:false);
        await using var host=await CreateApp(sqlConnection:sql.Connection,sqlRetries:true);
        await CreateUser(host.App,"yarn-volume@example.test","Administrator");await SignIn(host,"yarn-volume@example.test");
        await using var db=sql.Context();
        var type=new YarnType{Code="VOLUME",NameFa="آزمون حجم",NameEn="Volume"};db.Add(type);await db.SaveChangesAsync();
        db.YarnItems.AddRange(Enumerable.Range(0,1000).Select(i=>new YarnItem{YarnTypeId=type.Id,Code="B"+i.ToString("000"),NameFa="آزمون حجم "+i,NameEn="Volume "+i,ComprehensiveName="گزارش حجم "+i,CountValue=i%100,UnitOfMeasure="KG"}));await db.SaveChangesAsync();
        await db.Database.ExecuteSqlRawAsync("""
            INSERT INTO YarnColors (Id,YarnId,Value,NormalizedValue,IsDefault)
            SELECT NEWID(),y.Id,CONVERT(nvarchar(120),n.n),CONVERT(nvarchar(240),n.n),0
            FROM YarnItems y CROSS JOIN (SELECT TOP (100) ROW_NUMBER() OVER (ORDER BY object_id)-1 n FROM sys.all_objects) n
            WHERE y.Code LIKE 'B[0-9][0-9][0-9]'
            """);
        async Task<ServerGridPage<YarnDefinitionRow>> Query(WarehouseGridRequest request){var response=await host.Client.PostAsJsonAsync("/api/yarns/definition-grid",request);Assert.Equal(HttpStatusCode.OK,response.StatusCode);return (await response.Content.ReadFromJsonAsync<ServerGridPage<YarnDefinitionRow>>())!;}
        var first=await Query(new(PageSize:75,Sort:[new("CountValue","asc")]));
        Assert.Equal(100000,first.Total);Assert.Equal(75,first.Items.Count);Assert.All(first.Items,x=>Assert.Equal(0m,x.CountValue));
        var again=await Query(new(PageSize:75,Sort:[new("CountValue","asc")]));Assert.Equal(first.Items.Select(x=>x.Id),again.Items.Select(x=>x.Id));
        var second=await Query(new(Page:2,PageSize:75,Sort:[new("CountValue","asc")]));Assert.Empty(first.Items.Select(x=>x.Id).Intersect(second.Items.Select(x=>x.Id)));
        var filtered=await Query(new(Filters:new(){["CountValue"]=new(Custom:new("and",new("between","9","10")))},Sort:[new("CountValue","asc")]));
        Assert.Equal(2000,filtered.Total);Assert.All(filtered.Items,x=>Assert.InRange(x.CountValue!.Value,9m,10m));
        var selected=await Query(new(Filters:new(){["CountValue"]=new(SelectedValues:["number:10"])}));Assert.Equal(1000,selected.Total);
        var top=await Query(new(Filters:new(){["CountValue"]=new(ValueRule:new("top",1001))}));Assert.Equal(2000,top.Total);
        var average=await Query(new(Filters:new(){["CountValue"]=new(ValueRule:new("aboveAverage"))}));Assert.Equal(50000,average.Total);
        var options=await Query(new(OptionsColumn:"CountValue"));Assert.Equal(100,options.FilterValues!.Count);
        Assert.Equal(9m,((System.Text.Json.JsonElement)options.FilterValues[9]!).GetDecimal());
        var search=await Query(new(Search:"B999",SearchMode:"exact"));Assert.Equal(100,search.Total);
        Assert.Equal(500,(await Query(new(PageSize:100000))).Items.Count);
        Assert.Equal(100000,await db.Set<YarnColor>().CountAsync());
    }
    [Fact]
    public void Yarn_approved_model_snapshot_matches_current_model(){
        using var db=new YarnTrade.Api.Data.AppDbContext(new DbContextOptionsBuilder<YarnTrade.Api.Data.AppDbContext>().UseSqlServer().Options);
        Assert.False(db.Database.HasPendingModelChanges());
    }
    [Fact]
    public async Task Yarn_approved_SQL_roundtrip_concurrency_and_details()
    {
        await using var sql=await A4SqlDatabase.CreateLatest(operationalContract:false);
        await using var host=await CreateApp(sqlConnection:sql.Connection,sqlRetries:true);
        await CreateUser(host.App,"yarn-approved@example.test","Administrator");
        await SignIn(host,"yarn-approved@example.test");
        await using var db=sql.Context();
        Assert.Empty(await db.Set<YarnColor>().ToArrayAsync());
        Assert.Empty(await db.Set<YarnPackagingCoefficient>().ToArrayAsync());
        var suggestion=await host.Client.GetFromJsonAsync<System.Text.Json.JsonElement>("/api/yarns/definition-suggest-code");
        Assert.Equal("001",suggestion.GetProperty("suggestion").GetString());
        var groupResponse=await host.Client.PostAsJsonAsync("/api/master-data/product-groups",new ProductGroupCreate("گروه آزمون",null,Guid.NewGuid()));
        Assert.Equal(HttpStatusCode.Created,groupResponse.StatusCode);
        var group=(await groupResponse.Content.ReadFromJsonAsync<ProductGroupView>())!;
        var typeResponses=await Task.WhenAll(Enumerable.Range(0,4).Select(_=>host.Client.PostAsJsonAsync("/api/yarns/definition-references/packaging",new YarnReferenceInput("کارتن"))));
        Assert.All(typeResponses,r=>Assert.Equal(HttpStatusCode.OK,r.StatusCode));
        var types=await db.Set<YarnDefinitionReference>().ToArrayAsync(); Assert.Single(types);
        var unit=await host.Client.PostAsJsonAsync("/api/yarns/definition-references/unitOfMeasure",new YarnReferenceInput("کیلو"));Assert.Equal(HttpStatusCode.OK,unit.StatusCode);
        YarnInput Draft(string code,string name)=>new(){Code=code,Name=name,ProductGroupId=group.Id,ConfirmedProductGroupDepth=0,
            Material="POLYESTER",Luster="BRIGHT",UnitOfMeasure="کیلو",ContinuityType="INTERMINGLE",TwistType="S",CountType="DENIER",CountValue=300,PlyCount=2,
            Definition=new("a348e3e7-ae39-4ff6-b701-7dc55c3201c5",[],[new(null,"110",true),new(null,"120",false)], [new(null,types[0].Id,2.74m,true)])};
        var responses=await Task.WhenAll(Enumerable.Range(0,5).Select(_=>host.Client.PostAsJsonAsync("/api/yarns",Draft("001","نخ یک"))));
        Assert.Single(responses.Where(r=>r.StatusCode==HttpStatusCode.Created));
        Assert.All(responses.Where(r=>r.StatusCode!=HttpStatusCode.Created),r=>Assert.True(r.StatusCode is HttpStatusCode.BadRequest or HttpStatusCode.Conflict));
        var created=(await responses.Single(r=>r.StatusCode==HttpStatusCode.Created).Content.ReadFromJsonAsync<YarnView>())!;
        Assert.Equal(2,created.Definition!.Colors.Length); Assert.All(created.Definition.Colors,c=>Assert.NotEqual(Guid.Empty,c.Id));
        Assert.Contains("2 لا",created.ComprehensiveName);
        var loaded=(await host.Client.GetFromJsonAsync<YarnView>("/api/yarns/"+created.Id))!;
        Assert.Equal(created.Definition.Colors,loaded.Definition!.Colors); Assert.Equal(2.74m,loaded.Definition.Packaging[0].CbmPerTon);
        var edit=Draft("001","نخ یک");
        edit.Definition=edit.Definition! with {Colors=loaded.Definition.Colors.Select(c=>new YarnColorInput(c.Id,c.Value,!c.IsDefault)).ToArray()};
        var update=await host.Client.PutAsJsonAsync($"/api/yarns/{created.Id}?rowVersion={Uri.EscapeDataString(Convert.ToBase64String(loaded.RowVersion))}",edit);
        Assert.Equal(HttpStatusCode.OK,update.StatusCode);
        var updated=(await update.Content.ReadFromJsonAsync<YarnView>())!;
        Assert.Equal("120",updated.Definition!.Colors.Single(c=>c.IsDefault).Value);
        Assert.Equal(HttpStatusCode.Conflict,(await host.Client.PutAsJsonAsync($"/api/yarns/{created.Id}?rowVersion={Uri.EscapeDataString(Convert.ToBase64String(loaded.RowVersion))}",edit)).StatusCode);
        var different=await Task.WhenAll(new[]{host.Client.PostAsJsonAsync("/api/yarns",Draft("002","نخ دو")),host.Client.PostAsJsonAsync("/api/yarns",Draft("003","نخ سه"))});
        Assert.All(different,r=>Assert.Equal(HttpStatusCode.Created,r.StatusCode));
        Assert.Equal(3,await db.Set<YarnDefinitionState>().CountAsync());
        Assert.Equal(6,await db.Set<YarnColor>().CountAsync());
        var report=await host.Client.PostAsJsonAsync("/api/yarns/definition-grid",new WarehouseGridRequest(PageSize:2,Search:"نخ",SearchMode:"contains"));
        Assert.Equal(HttpStatusCode.OK,report.StatusCode);
        var page=(await report.Content.ReadFromJsonAsync<ServerGridPage<YarnDefinitionRow>>())!;
        Assert.Equal(6,page.Total);Assert.Equal(2,page.Items.Count);
        Assert.False(await db.Set<YarnColor>().AnyAsync(c=>!db.YarnItems.Any(y=>y.Id==c.YarnId)));
        var duplicate=Draft("004","نخ چهار"); duplicate.Definition=duplicate.Definition! with {Colors=[new(null,"۱۲",true),new(null,"12",false)]};
        Assert.Equal(HttpStatusCode.BadRequest,(await host.Client.PostAsJsonAsync("/api/yarns",duplicate)).StatusCode);
        Assert.Equal(3,await db.Set<YarnDefinitionState>().CountAsync());
        Assert.Equal(HttpStatusCode.BadRequest,(await host.Client.PostAsJsonAsync("/api/yarns",Draft("10000","کد طولانی"))).StatusCode);
        var usedUnit=await db.Set<YarnDefinitionReference>().SingleAsync(x=>x.FieldId=="unitOfMeasure");
        Assert.Equal(HttpStatusCode.Conflict,(await host.Client.PutAsJsonAsync("/api/yarns/definition-references/unitOfMeasure",new[]{new YarnReferenceChange(usedUnit.Id,"کیلو جدید",false,Convert.ToBase64String(usedUnit.RowVersion))})).StatusCode);
        var delete=await host.Client.DeleteAsync($"/api/yarns/{updated.Id}?rowVersion={Uri.EscapeDataString(Convert.ToBase64String(updated.RowVersion))}");
        Assert.Equal(HttpStatusCode.NoContent,delete.StatusCode);
        Assert.False(await db.Set<YarnColor>().AnyAsync(c=>c.YarnId==updated.Id));
        await CreateUser(host.App,"yarn-manager@example.test","Manager");await SignIn(host,"yarn-manager@example.test");
        Assert.Equal(HttpStatusCode.OK,(await host.Client.PostAsJsonAsync("/api/yarns/definition-references/unitOfMeasure",new YarnReferenceInput("متر"))).StatusCode);
        Assert.Equal(HttpStatusCode.OK,(await host.Client.PostAsJsonAsync("/api/yarns/definition-references/luster",new YarnReferenceInput("مات"))).StatusCode);
        await CreateUser(host.App,"yarn-editor@example.test","Orders");await SignIn(host,"yarn-editor@example.test");
        await SetPermissions(host,"yarn-editor@example.test","yarns.create");
        Assert.Equal(HttpStatusCode.Forbidden,(await host.Client.PostAsJsonAsync("/api/yarns/definition-references/unitOfMeasure",new YarnReferenceInput("عدد"))).StatusCode);
        Assert.Equal(HttpStatusCode.OK,(await host.Client.PostAsJsonAsync("/api/yarns/definition-references/luster",new YarnReferenceInput("براق"))).StatusCode);
        await CreateUser(host.App,"yarn-denied@example.test","Customer"); await SignIn(host,"yarn-denied@example.test");
        Assert.Equal(HttpStatusCode.Forbidden,(await host.Client.PostAsJsonAsync("/api/yarns",Draft("005","غیرمجاز"))).StatusCode);
    }
}
