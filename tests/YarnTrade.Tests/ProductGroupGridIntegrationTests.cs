using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Controllers;
using YarnTrade.Api.Domain;

namespace YarnTrade.Tests;

public sealed partial class SecurityBaselineTests
{
    [Fact]
    public async Task ProductGroup_SQL_grid_pages_searches_filters_sorts_100000_leaf_paths()
    {
        await using var sql=await A4SqlDatabase.CreateLatest(operationalContract:false);
        await using var host=await CreateApp(sqlConnection:sql.Connection,sqlRetries:true);
        await CreateUser(host.App,"group-grid@example.test","Administrator");await SignIn(host,"group-grid@example.test");
        const string url="/api/master-data/product-groups/grid", level="product-group.cascading-tree.level.1";
        async Task<ServerGridPage<ProductGroupReportView>> Query(ProductGroupGridRequest request) {
            var response=await host.Client.PostAsJsonAsync(url,request);
            var message=await response.Content.ReadAsStringAsync();Assert.True(response.IsSuccessStatusCode,message+" request="+System.Text.Json.JsonSerializer.Serialize(request)+" logs="+string.Join("\n",host.Logs.Messages.TakeLast(5)));
            return (await response.Content.ReadFromJsonAsync<ServerGridPage<ProductGroupReportView>>())!;
        }
        Assert.Empty((await Query(new())).Items);
        await using(var db=sql.Context()) {
            // This raw insert is confined to the harness-generated disposable database.
            var root=Guid.NewGuid();
            db.ProductGroups.Add(new ProductGroup{Id=root,Name="DTY",NormalizedName="dty",RootCode="001",HierarchyCode="001",Depth=0,RequestId=Guid.NewGuid()});await db.SaveChangesAsync();
            // SQL-side generator avoids loading 100k fixture entities in either HTTP or the test client.
            await db.Database.ExecuteSqlInterpolatedAsync($@"
WITH numbers AS (SELECT TOP (100000) ROW_NUMBER() OVER(ORDER BY (SELECT NULL)) AS n FROM sys.all_objects a CROSS JOIN sys.all_objects b)
INSERT INTO ProductGroups (Id,ParentId,Name,NormalizedName,RootCode,HierarchyCode,Depth,RequestId,IsDeleted,CreatedAtUtc)
SELECT NEWID(),{root},CONCAT(N'نمره ',FORMAT(n,'000000')),CONCAT(N'نمره ',FORMAT(n,'000000')),'001',CONCAT('001.',FORMAT(n,'000000')),1,NEWID(),0,SYSUTCDATETIME() FROM numbers");
        }
        var first=await Query(new());var second=await Query(new(Page:2));
        Assert.Equal(100000,first.Total);Assert.Equal(100,first.Items.Count);Assert.Empty(first.Items.Select(x=>x.Id).Intersect(second.Items.Select(x=>x.Id)));
        Assert.All(first.Items,x=>{Assert.Equal("001",x.Code);Assert.Equal("DTY",x.Level0);Assert.Equal("",x.Level2);});
        Assert.Equal(first.Items.Select(x=>x.Id),(await Query(new())).Items.Select(x=>x.Id));
        var search=await Query(new(Search:"نمره 099999",SearchMode:"exact"));Assert.Single(search.Items);Assert.Equal("نمره 099999",search.Items[0].Level1);
        Assert.Equal(99999,(await Query(new(Search:"نمره 099999",SearchMode:"exact",ReverseSearch:true))).Total);
        var sorted=await Query(new(Sort:[new(level,"desc")]));Assert.Equal("نمره 100000",sorted.Items[0].Level1);
        var filtered=await Query(new(Filters:new(){[level]=new(SelectedValues:["string:نمره 099999"])}));Assert.Single(filtered.Items);
        var options=await Query(new(OptionsColumn:level,OptionsSearch:"099999"));Assert.Single(options.FilterValues!);Assert.Empty(options.Items);
        Assert.True((await Query(new(PageSize:10000))).Items.Count<=500);
        await using var reopen=sql.Context();Assert.Equal(100001,await reopen.ProductGroups.CountAsync());
        await using var denied=await CreateApp(sqlConnection:sql.Connection,sqlRetries:true);
        Assert.Equal(HttpStatusCode.Unauthorized,(await denied.Client.PostAsJsonAsync(url,new ProductGroupGridRequest())).StatusCode);
    }
}
