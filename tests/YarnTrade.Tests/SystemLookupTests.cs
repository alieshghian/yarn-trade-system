using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Controllers;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;

namespace YarnTrade.Tests;
public sealed class SystemLookupTests
{
    [Fact]
    public async Task Brand_picker_includes_unassigned_and_current_owner_only()
    {
        await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var owner = Guid.NewGuid(); var other = Guid.NewGuid();
        var free = new Brand { BrandCode="1", BrandName="Free" };
        var own = new Brand { BrandCode="2", BrandName="Own" };
        var taken = new Brand { BrandCode="3", BrandName="Taken" };
        db.Brands.AddRange(free,own,taken);
        db.PersonBrands.AddRange(new PersonBrand { BrandId=own.Id,PersonId=owner },new PersonBrand { BrandId=taken.Id,PersonId=other });
        await db.SaveChangesAsync();
        var controller=new SystemLookupsController(db);
        var result=JsonSerializer.SerializeToElement(await controller.Brands(null,null,1,default,owner));
        Assert.Equal(2,result.GetProperty("total").GetInt32());
        var fresh=JsonSerializer.SerializeToElement(await controller.Brands(null,null,1,default,Guid.Empty));
        Assert.Equal(1,fresh.GetProperty("total").GetInt32());
        Assert.Equal(3,db.Brands.Count());
    }
    [Fact]
    public async Task Search_normalizes_digits_letters_tokens_and_pages_without_changing_source_data()
    {
        await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        db.Brands.Add(new Brand { BrandCode = "AB۱۲۳", BrandName = "كيان" });
        for(var i=0;i<44;i++) db.Brands.Add(new Brand { BrandCode=$"X{i:D3}", BrandName="Test" });
        await db.SaveChangesAsync();
        var controller=new SystemLookupsController(db);
        var result=JsonSerializer.SerializeToElement(await controller.Brands("۱۲۳ کیان","code,name",1));
        Assert.Equal(1,result.GetProperty("total").GetInt32());
        Assert.Equal("AB۱۲۳",result.GetProperty("items")[0].GetProperty("Code").GetString());
        var codeOnly=JsonSerializer.SerializeToElement(await controller.Brands("کیان","code",1));
        Assert.Equal(0,codeOnly.GetProperty("total").GetInt32());
        var page=JsonSerializer.SerializeToElement(await controller.Brands(null,null,2));
        Assert.Equal(5,page.GetProperty("items").GetArrayLength());
        Assert.Equal(45,await db.Brands.CountAsync());
    }
    [Fact]
    public async Task Product_group_lookup_exposes_all_saved_levels_and_returns_stable_identity_and_public_code() {
        await using var db=new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var root=new ProductGroup{Name="DTY",NormalizedName="dty",RootCode="004",HierarchyCode="004",Depth=0};
        var child=new ProductGroup{Name="مات",NormalizedName="مات",RootCode="004",HierarchyCode="004.001",Depth=1,Parent=root,ParentId=root.Id};
        var deep=new ProductGroup{Name="150D",NormalizedName="150d",RootCode="004",HierarchyCode="004.001.001",Depth=2,Parent=child,ParentId=child.Id};
        var incomplete=new ProductGroup{Name="براق",NormalizedName="براق",RootCode="004",HierarchyCode="004.002",Depth=1,Parent=root,ParentId=root.Id};
        db.ProductGroups.AddRange(root,child,deep,incomplete);await db.SaveChangesAsync();var api=new SystemLookupsController(db);
        var page=JsonSerializer.SerializeToElement(await api.ProductGroups(null,null));Assert.Equal(4,page.GetProperty("total").GetInt32());
        var rows=page.GetProperty("items").EnumerateArray().ToArray();Assert.All(rows,row=>Assert.Equal("004",row.GetProperty("Code").GetString()));
        Assert.Contains(rows,row=>row.GetProperty("Id").GetGuid()==deep.Id&&row.GetProperty("Name").GetString()=="DTY / مات / 150D");
        Assert.IsType<Microsoft.AspNetCore.Mvc.OkObjectResult>(await api.ProductGroup(root.Id));Assert.IsType<Microsoft.AspNetCore.Mvc.OkObjectResult>(await api.ProductGroup(incomplete.Id));
        root.IsDeleted=true;await db.SaveChangesAsync();Assert.IsType<Microsoft.AspNetCore.Mvc.NotFoundResult>(await api.ProductGroup(root.Id));
    }
    [Fact]
    public async Task Warehouse_lookup_returns_saved_active_names_and_ids_only() {
        await using var db=new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var row=new Warehouse{Code="12",NameFa="مرکزی",NameEn="Central"};db.Warehouses.AddRange(row,new Warehouse{Code="13",NameFa="غیرفعال",NameEn="Inactive",IsActive=false});await db.SaveChangesAsync();
        var api=new SystemLookupsController(db);var result=JsonSerializer.SerializeToElement(await api.Warehouses(null,null));Assert.Equal(1,result.GetProperty("total").GetInt32());Assert.Equal("مرکزی",result.GetProperty("items")[0].GetProperty("Name").GetString());Assert.IsType<Microsoft.AspNetCore.Mvc.OkObjectResult>(await api.Warehouse(row.Id));
    }

    [Fact]
    public async Task Numeric_suggestions_use_same_field_distinct_prefix_and_never_write() {
        await using var db=new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        db.YarnItems.AddRange(Enumerable.Range(0,32).Select(i=>new YarnItem{Code="N"+i,NameFa="Numeric "+i,NameEn="Numeric "+i,CountValue=300+i,FilamentNumber=288,PlyCount=2}));await db.SaveChangesAsync();
        var api=new YarnsController(db);
        var result=Assert.IsType<Microsoft.AspNetCore.Mvc.OkObjectResult>((await api.DefinitionNumberOptions("countValue","30",default)).Result);
        Assert.Equal(Enumerable.Range(300,10).Select(x=>(decimal)x),Assert.IsType<decimal[]>(result.Value));
        var limited=Assert.IsType<Microsoft.AspNetCore.Mvc.OkObjectResult>((await api.DefinitionNumberOptions("countValue","3",default)).Result);Assert.Equal(20,Assert.IsType<decimal[]>(limited.Value).Length);
        var distinct=Assert.IsType<Microsoft.AspNetCore.Mvc.OkObjectResult>((await api.DefinitionNumberOptions("filamentNumber","28",default)).Result);Assert.Equal(new[]{288m},Assert.IsType<decimal[]>(distinct.Value));
        Assert.IsType<Microsoft.AspNetCore.Mvc.BadRequestObjectResult>((await api.DefinitionNumberOptions("code","3",default)).Result);
        Assert.IsType<Microsoft.AspNetCore.Mvc.BadRequestObjectResult>((await api.DefinitionNumberOptions("countValue","bad",default)).Result);
        Assert.Equal(32,await db.YarnItems.CountAsync());Assert.False(db.ChangeTracker.HasChanges());
    }
}
