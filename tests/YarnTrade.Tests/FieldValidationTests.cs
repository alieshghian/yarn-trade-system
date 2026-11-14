using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Controllers;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;

namespace YarnTrade.Tests;

public class FieldValidationTests
{
    [Fact]
    public async Task Yarn_and_investor_preflights_use_the_existing_code_namespace()
    {
        await using var db=Database();var yarn=new YarnItem{Code="Y900",NameFa="نخ",NameEn="Yarn"};var investor=new Investor{InvestorCode="INV-9",LegalName="سرمایه‌گذار"};db.Add(yarn);db.Add(investor);await db.SaveChangesAsync();var api=new FieldValidationController(db);
        Assert.NotNull(Error(await api.Yarn(new("code","Y900"),default)));
        Assert.Null(Error(await api.Yarn(new("code","Y900",yarn.Id),default)));
        Assert.NotNull(Error(await api.InvestorField(new("identity0Code","inv-9"),default)));
        Assert.Null(Error(await api.InvestorField(new("identity0Code","INV-9",investor.Id),default)));
    }
    private static AppDbContext Database()=>new(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
    private static string? Error(object result)=>JsonSerializer.SerializeToElement(result).GetProperty("error").GetString();
    [Fact]
    public async Task Warehouse_preflight_finds_duplicate_beyond_grid_page_and_allows_self_edit()
    {
        await using var db=Database();var row=new Warehouse{Code="WH-900",NameFa="انبار",NameEn="Warehouse"};db.Warehouses.Add(row);await db.SaveChangesAsync();
        var api=new FieldValidationController(db);
        Assert.NotNull(Error(await api.Warehouse(new("code","wh-۹۰۰"),default)));
        Assert.Null(Error(await api.Warehouse(new("code","WH-900",row.Id),default)));
        Assert.NotNull(Error(await api.Warehouse(new("code"," "),default)));
        Assert.NotNull(Error(await api.Warehouse(new("code","کد"),default)));
        Assert.Null(Error(await api.Warehouse(new("name","انبار"),default))); // No new name-uniqueness rule.
    }
    [Fact]
    public async Task Zone_preflight_matches_normalized_siblings_and_floor_scope()
    {
        await using var db=Database();var w=new Warehouse{Code="W",NameFa="انبار",NameEn="W",FloorCount=2};db.Add(w);
        var z=new WarehouseZone{WarehouseId=w.Id,FloorNumber=1,Code="1-A",NormalizedCode="1-A",Name="کالا یک",NormalizedName=WarehousesController.Normalize("کالا یک")};db.Add(z);await db.SaveChangesAsync();
        var api=new FieldValidationController(db);
        Assert.NotNull(Error(await api.Zone(new("name"," كالا   يک ",WarehouseId:w.Id),default)));
        Assert.Null(Error(await api.Zone(new("name","کالا یک",WarehouseId:w.Id,FloorNumber:2),default)));
        Assert.Null(Error(await api.Zone(new("code","1-a",CurrentId:z.Id,WarehouseId:w.Id),default)));
        Assert.NotNull(Error(await api.Zone(new("code","1-DOCK",WarehouseId:w.Id),default)));
    }
    [Fact]
    public async Task Brand_preflight_preserves_digit_case_and_optional_name_contract()
    {
        await using var db=Database();var b=new Brand{BrandCode="Ab-12",BrandName="مشترک"};db.Add(b);await db.SaveChangesAsync();var api=new FieldValidationController(db);
        Assert.NotNull(Error(await api.Brand(new("brandCode","aB-۱۲"),default)));
        Assert.Null(Error(await api.Brand(new("brandCode","AB-12",b.Id),default)));
        Assert.Null(Error(await api.Brand(new("brandName","مشترک"),default)));
    }
    [Fact]
    public async Task Person_preflight_uses_composite_identity_and_does_not_block_equal_family_names()
    {
        await using var db=Database();var p=new Person{PersonCode="1001",FirstName="علی",LastName="کریمی",DisplayName="علی کریمی",PersonType=PersonType.Individual};db.Add(p);await db.SaveChangesAsync();var api=new FieldValidationController(db);
        Assert.NotNull(Error(await api.Person(new("personCode","1001"),default)));
        Assert.Null(Error(await api.Person(new("personCode","1001",p.Id),default)));
        Assert.NotNull(Error(await api.Person(new("lastName","كريمي",FirstName:"علی"),default)));
        Assert.Null(Error(await api.Person(new("lastName","کریمی",FirstName:"رضا"),default)));
    }
    [Fact]
    public async Task User_preflight_rejects_existing_email_and_person_and_validates_format()
    {
        await using var db=Database();var p=new Person{PersonCode="1",DisplayName="Test"};db.Add(p);var u=new AppUser{PersonId=p.Id,Email="a@example.com",NormalizedEmail="A@EXAMPLE.COM",UserName="a@example.com"};db.Add(u);await db.SaveChangesAsync();var api=new FieldValidationController(db);
        Assert.NotNull(Error(await api.UserField(new("email","a@EXAMPLE.com"),default)));
        Assert.NotNull(Error(await api.UserField(new("email","wrong"),default)));
        Assert.NotNull(Error(await api.UserField(new("personId",p.Id.ToString()),default)));
        Assert.Null(Error(await api.UserField(new("email","a@example.com",u.Id),default)));
    }
}
