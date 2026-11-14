using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Controllers;
namespace YarnTrade.Tests;
public sealed partial class SecurityBaselineTests
{
    [Fact]
    public async Task ProductGroup_SQL_selected_branch_preserves_two_children_under_each_parent()
    {
        await using var sql=await A4SqlDatabase.CreateLatest(operationalContract:false);
        await using var host=await CreateApp(sqlConnection:sql.Connection,sqlRetries:true);
        await CreateUser(host.App,"branch-four@example.test","Administrator");await SignIn(host,"branch-four@example.test");
        const string url="/api/master-data/product-groups";
        async Task<ProductGroupView> Add(string name,Guid? parent=null) {
            var response=await host.Client.PostAsJsonAsync(url,new ProductGroupCreate(name,parent,Guid.NewGuid()));
            Assert.Equal(HttpStatusCode.Created,response.StatusCode);return (await response.Content.ReadFromJsonAsync<ProductGroupView>())!;
        }
        var root=await Add("DTY");var bright=await Add("BRIGHT",root.Id);
        var source=await Add("RW",bright.Id);var target=await Add("RW STEAMED",bright.Id);
        var selected=new List<ProductGroupView>();
        foreach(var name in new[]{"300D","150D"}) {
            var parent=await Add(name,source.Id);selected.Add(parent);
            selected.Add(await Add("96F",parent.Id));selected.Add(await Add("288F",parent.Id));
        }
        var versions=selected.Append(source).Append(target).ToDictionary(x=>x.Id,x=>Convert.ToBase64String(x.RowVersion));
        var response=await host.Client.PostAsJsonAsync(url+"/copy-branch",new ProductGroupCopyBranch(source.Id,target.Id,selected.Select(x=>x.Id).ToArray(),versions));
        Assert.Equal(HttpStatusCode.OK,response.StatusCode);
        var receipt=await response.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        Assert.Equal(6,receipt.GetProperty("processedSourceIds").GetArrayLength());Assert.Equal(6,receipt.GetProperty("created").GetInt32());
        await using var db=sql.Context();
        var parents=await db.ProductGroups.Where(x=>x.ParentId==target.Id).ToListAsync();Assert.Equal(2,parents.Count);
        foreach(var parent in parents)Assert.Equal(new[]{"288F","96F"},await db.ProductGroups.Where(x=>x.ParentId==parent.Id).OrderBy(x=>x.Name).Select(x=>x.Name).ToArrayAsync());
    }
    [Fact]
    public async Task ProductGroup_SQL_recursive_branch_copy_merges_atomically_with_target_codes()
    {
        await using var sql=await A4SqlDatabase.CreateLatest(operationalContract:false);
        await using var host=await CreateApp(sqlConnection:sql.Connection,sqlRetries:true);
        await CreateUser(host.App,"branch-copy@example.test","Administrator");await SignIn(host,"branch-copy@example.test");
        const string url="/api/master-data/product-groups";
        async Task<ProductGroupView> Add(string name,Guid? parent=null) {
            var response=await host.Client.PostAsJsonAsync(url,new ProductGroupCreate(name,parent,Guid.NewGuid()));
            Assert.Equal(HttpStatusCode.Created,response.StatusCode);return (await response.Content.ReadFromJsonAsync<ProductGroupView>())!;
        }
        var source=await Add("DTY");var target=await Add("FDY");
        var mat=await Add("مات",source.Id);var raw=await Add("خام",mat.Id);
        var grades=new List<ProductGroupView>();for(var i=0;i<50;i++)grades.Add(await Add("نمره "+i,raw.Id));
        var existing=await Add("مات",target.Id);
        var selected=new[]{mat,raw}.Concat(grades).ToArray();
        var versions=selected.Append(source).Append(target).ToDictionary(x=>x.Id,x=>Convert.ToBase64String(x.RowVersion));
        var request=new ProductGroupCopyBranch(source.Id,target.Id,selected.Select(x=>x.Id).ToArray(),versions);
        var responses=await Task.WhenAll(Enumerable.Range(0,3).Select(_=>host.Client.PostAsJsonAsync(url+"/copy-branch",request)));
        Assert.All(responses,x=>Assert.Equal(HttpStatusCode.OK,x.StatusCode));
        await using(var db=sql.Context()) {
            var copied=await db.ProductGroups.Where(x=>x.RootCode==target.Code).ToListAsync();
            Assert.Equal(53,copied.Count);Assert.Contains(copied,x=>x.Id==existing.Id);
            Assert.Equal(copied.Count,copied.Select(x=>x.HierarchyCode).Distinct().Count());
            Assert.All(copied.Where(x=>x.ParentId.HasValue),x=>Assert.Contains(copied,p=>p.Id==x.ParentId));
            Assert.Equal(53,await db.ProductGroups.CountAsync(x=>x.RootCode==source.Code));
        }
        var beforeCount=0;await using(var db=sql.Context())beforeCount=await db.ProductGroups.CountAsync();
        var invalid=request with {SelectedIds=[grades[0].Id]};
        Assert.Equal(HttpStatusCode.BadRequest,(await host.Client.PostAsJsonAsync(url+"/copy-branch",invalid)).StatusCode);
        var stale=request with {Versions=new(versions) {[raw.Id]="stale"}};
        Assert.Equal(HttpStatusCode.Conflict,(await host.Client.PostAsJsonAsync(url+"/copy-branch",stale)).StatusCode);
        await using(var db=sql.Context())Assert.Equal(beforeCount,await db.ProductGroups.CountAsync());
        await CreateUser(host.App,"branch-denied@example.test","Customer");await SignIn(host,"branch-denied@example.test");
        Assert.Equal(HttpStatusCode.Forbidden,(await host.Client.PostAsJsonAsync(url+"/copy-branch",request)).StatusCode);
    }
}
