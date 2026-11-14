using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Controllers;

namespace YarnTrade.Tests;
public sealed partial class SecurityBaselineTests
{
    [Fact]
    public async Task ProductGroup_SQL_batch_creation_is_atomic_and_idempotent()
    {
        await using var sql=await A4SqlDatabase.CreateLatest(operationalContract:false);
        await using var host=await CreateApp(sqlConnection:sql.Connection,sqlRetries:true);
        await CreateUser(host.App,"groups-batch@example.test","Administrator");await SignIn(host,"groups-batch@example.test");
        const string url="/api/master-data/product-groups";
        var rootResponse=await host.Client.PostAsJsonAsync(url,new ProductGroupCreate("نخ",null,Guid.NewGuid()));
        var root=(await rootResponse.Content.ReadFromJsonAsync<ProductGroupView>())!;
        var first=new ProductGroupCreate("نمره ۳",root.Id,Guid.NewGuid());
        var second=new ProductGroupCreate("نمره ۵",root.Id,Guid.NewGuid());
        var batch=new ProductGroupBatchCreate([first,second]);
        var concurrent=await Task.WhenAll(Enumerable.Range(0,4).Select(_=>host.Client.PostAsJsonAsync(url+"/batch",batch)));
        Assert.All(concurrent,response=>Assert.Equal(HttpStatusCode.OK,response.StatusCode));
        await using(var db=sql.Context()) {
            var children=await db.ProductGroups.Where(x=>x.ParentId==root.Id).ToListAsync();
            Assert.Equal(2,children.Count);Assert.Equal(2,children.Select(x=>x.HierarchyCode).Distinct().Count());
            Assert.All(children,x=>Assert.Equal(root.Code,x.RootCode));
        }
        var invalid=new ProductGroupBatchCreate([new("نباید ثبت شود",root.Id,Guid.NewGuid()),new("نمره٣",root.Id,Guid.NewGuid())]);
        Assert.Equal(HttpStatusCode.Conflict,(await host.Client.PostAsJsonAsync(url+"/batch",invalid)).StatusCode);
        await using(var db=sql.Context()) Assert.Equal(2,await db.ProductGroups.CountAsync(x=>x.ParentId==root.Id));
        var duplicate=new ProductGroupBatchCreate([new("نمره۱۲",root.Id,Guid.NewGuid()),new("نمره ١٢",root.Id,Guid.NewGuid())]);
        Assert.Equal(HttpStatusCode.BadRequest,(await host.Client.PostAsJsonAsync(url+"/batch",duplicate)).StatusCode);
        await CreateUser(host.App,"batch-denied@example.test","Customer");await SignIn(host,"batch-denied@example.test");
        Assert.Equal(HttpStatusCode.Forbidden,(await host.Client.PostAsJsonAsync(url+"/batch",batch)).StatusCode);
    }
    [Fact]
    public async Task ProductGroup_SQL_copy_level_names_from_remote_branches()
    {
        await using var sql=await A4SqlDatabase.CreateLatest(operationalContract:false);
        await using var host=await CreateApp(sqlConnection:sql.Connection,sqlRetries:true);
        await CreateUser(host.App,"groups-level@example.test","Administrator");await SignIn(host,"groups-level@example.test");
        const string url="/api/master-data/product-groups";
        async Task<ProductGroupView> Add(string name,Guid? parent=null) {
            var response=await host.Client.PostAsJsonAsync(url,new ProductGroupCreate(name,parent,Guid.NewGuid()));
            Assert.Equal(HttpStatusCode.Created,response.StatusCode);return (await response.Content.ReadFromJsonAsync<ProductGroupView>())!;
        }
        var root=await Add("DTY");var mat=await Add("مات",root.Id);var bright=await Add("براق",root.Id);
        var md=await Add("دوب داید",mat.Id);var bd=await Add("دوب داید",bright.Id);
        var one=await Add("150D",md.Id);var two=await Add("300D",md.Id);var present=await Add("150D",bd.Id);
        var foreign=await Add("شنیل");var f1=await Add("پلی استر",foreign.Id);var f2=await Add("پرو",f1.Id);var f3=await Add("خام",f2.Id);
        var foreignCopy=new ProductGroupCopyChildren(bd.Id,Targets:[new(bd.Id,[f3.Id])],PoolLevelSources:true);
        Assert.Equal(HttpStatusCode.BadRequest,(await host.Client.PostAsJsonAsync(url+"/copy-children",foreignCopy)).StatusCode);
        var input=new ProductGroupCopyChildren(bd.Id,Targets:[new(bd.Id,[one.Id,two.Id])],PoolLevelSources:true);
        Assert.Equal(HttpStatusCode.OK,(await host.Client.PostAsJsonAsync(url+"/copy-children",input)).StatusCode);
        await using(var db=sql.Context()) {
            var children=await db.ProductGroups.Where(x=>x.ParentId==bd.Id).ToListAsync();Assert.Equal(2,children.Count);
            Assert.Contains(children,x=>x.Id==present.Id);Assert.All(children,x=>Assert.Equal(root.Code,x.RootCode));
            Assert.Equal(2,await db.ProductGroups.CountAsync(x=>x.ParentId==md.Id));
        }
        var bad=new ProductGroupCopyChildren(bd.Id,Targets:[new(bd.Id,[mat.Id])],PoolLevelSources:true);
        Assert.Equal(HttpStatusCode.BadRequest,(await host.Client.PostAsJsonAsync(url+"/copy-children",bad)).StatusCode);
        var higher=await Add("ساده",mat.Id);
        var upper=new ProductGroupCopyChildren(bright.Id,Targets:[new(bright.Id,[higher.Id])],PoolLevelSources:true);
        Assert.Equal(HttpStatusCode.OK,(await host.Client.PostAsJsonAsync(url+"/copy-children",upper)).StatusCode);
    }

}
