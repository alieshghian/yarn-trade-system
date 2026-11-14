using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;
using YarnTrade.Api.Controllers;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;

namespace YarnTrade.Tests;

public sealed partial class SecurityBaselineTests
{
    [Fact]
    public async Task ProductGroup_SQL_copy_children_is_atomic_idempotent_and_normalized()
    {
        await using var sql = await A4SqlDatabase.CreateLatest(operationalContract:false);
        await using var host = await CreateApp(sqlConnection:sql.Connection, sqlRetries:true);
        await CreateUser(host.App,"groups-copy@example.test","Administrator"); await SignIn(host,"groups-copy@example.test");
        const string url="/api/master-data/product-groups";
        async Task<ProductGroupView> Add(string name,Guid? parent=null) {
            var response=await host.Client.PostAsJsonAsync(url,new ProductGroupCreate(name,parent,Guid.NewGuid()));
            Assert.Equal(HttpStatusCode.Created,response.StatusCode); return (await response.Content.ReadFromJsonAsync<ProductGroupView>())!;
        }
        var root=await Add("نخ"); var source=await Add("رنگرزی",root.Id); var target=await Add("خام",root.Id);
        var child=await Add("نمره ۱۲",source.Id); var grade3=await Add("نمره ۳",source.Id);
        var original=await Add("نمره12",target.Id);
        var other=await Add("دوب داید",root.Id);
        var invalid=new ProductGroupCopyChildren(source.Id,Targets:[new(target.Id,[grade3.Id]),new(Guid.NewGuid(),[grade3.Id])]);
        Assert.Equal(HttpStatusCode.BadRequest,(await host.Client.PostAsJsonAsync(url+"/copy-children",invalid)).StatusCode);
        await using(var unchanged=sql.Context()) Assert.Equal(1,await unchanged.ProductGroups.CountAsync(x=>x.ParentId==target.Id && !x.IsDeleted));
        Assert.Equal(HttpStatusCode.Conflict,(await host.Client.PostAsJsonAsync(url,new ProductGroupCreate(" نمره  ١٢ ",target.Id,Guid.NewGuid()))).StatusCode);
        var batch=new ProductGroupCopyChildren(source.Id,Targets:[new(target.Id,[child.Id,grade3.Id]),new(other.Id,[grade3.Id])]);
        var results=await Task.WhenAll(Enumerable.Range(0,6).Select(_=>host.Client.PostAsJsonAsync(url+"/copy-children",batch)));
        Assert.All(results,response=>Assert.Equal(HttpStatusCode.OK,response.StatusCode));
        await using var db=sql.Context();
        var children=await db.ProductGroups.Where(x=>x.ParentId==target.Id && !x.IsDeleted).ToListAsync();
        Assert.Equal(2,children.Count); Assert.Contains(children,x=>x.Id==original.Id && x.Name=="نمره12");
        Assert.All(children,x=>Assert.Equal(root.Code,x.RootCode)); Assert.Equal(2,children.Select(x=>x.HierarchyCode).Distinct().Count());
        Assert.Equal(2,await db.ProductGroups.CountAsync(x=>x.ParentId==source.Id && !x.IsDeleted));
        var otherChild=Assert.Single(await db.ProductGroups.Where(x=>x.ParentId==other.Id && !x.IsDeleted).ToListAsync());
        Assert.Equal("نمره ۳",otherChild.Name); Assert.Equal(root.Code,otherChild.RootCode);
        Assert.Equal(child.Id,(await db.ProductGroups.FindAsync(child.Id))!.Id);
        Assert.Equal(HttpStatusCode.BadRequest,(await host.Client.PostAsJsonAsync(url+"/copy-children",new ProductGroupCopyChildren(root.Id,target.Id))).StatusCode);
        var grade5=await Add("نمره ۵",other.Id);
        var unrelated=await Add("شاخه دیگر"); var unrelatedGrade=await Add("نمره ۱۰",unrelated.Id);
        var invalidPool=new ProductGroupCopyChildren(target.Id,Targets:[new(target.Id,[unrelatedGrade.Id])],PoolSiblingSources:true);
        Assert.Equal(HttpStatusCode.BadRequest,(await host.Client.PostAsJsonAsync(url+"/copy-children",invalidPool)).StatusCode);
        var pooled=new ProductGroupCopyChildren(target.Id,Targets:[new(target.Id,[grade3.Id,child.Id,grade5.Id])],PoolSiblingSources:true);
        var pooledResults=await Task.WhenAll(Enumerable.Range(0,6).Select(_=>host.Client.PostAsJsonAsync(url+"/copy-children",pooled)));
        Assert.All(pooledResults,response=>Assert.Equal(HttpStatusCode.OK,response.StatusCode));
        var pooledChildren=await db.ProductGroups.AsNoTracking().Where(x=>x.ParentId==target.Id && !x.IsDeleted).ToListAsync();
        Assert.Equal(3,pooledChildren.Count); Assert.Contains(pooledChildren,x=>x.Id==original.Id);
        Assert.Equal(3,pooledChildren.Select(x=>x.HierarchyCode).Distinct().Count());
        Assert.Equal(2,await db.ProductGroups.CountAsync(x=>x.ParentId==other.Id && !x.IsDeleted));
        await CreateUser(host.App,"groups-copy-denied@example.test","Customer"); await SignIn(host,"groups-copy-denied@example.test");
        Assert.Equal(HttpStatusCode.Forbidden,(await host.Client.PostAsJsonAsync(url+"/copy-children",new ProductGroupCopyChildren(source.Id,target.Id))).StatusCode);
    }
    [Fact]
    public async Task ProductGroup_SQL_active_usage_depth_lock_release_and_concurrent_extension()
    {
        await using var sql=await A4SqlDatabase.CreateLatest(operationalContract:false);
        await using var host=await CreateApp(sqlConnection:sql.Connection,sqlRetries:true);
        await CreateUser(host.App,"terminal@example.test","Administrator");await SignIn(host,"terminal@example.test");
        const string url="/api/master-data/product-groups";
        async Task<ProductGroupView> Add(string name,Guid? parent=null) {
            var response=await host.Client.PostAsJsonAsync(url,new ProductGroupCreate(name,parent,Guid.NewGuid()));
            Assert.Equal(HttpStatusCode.Created,response.StatusCode);return (await response.Content.ReadFromJsonAsync<ProductGroupView>())!;
        }
        var root=await Add("اصل");var a=await Add("الف",root.Id);var b=await Add("ب",root.Id);var leaf=await Add("برگ",a.Id);
        Assert.Equal(HttpStatusCode.BadRequest,(await host.Client.PostAsJsonAsync("/api/yarns",new YarnInput{Code="SHORT",Name="ناقص",ProductGroupId=b.Id,ConfirmedProductGroupDepth=1})).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,(await host.Client.PostAsJsonAsync("/api/yarns",new YarnInput{Code="UNCONFIRMED",Name="تأیید نشده",ProductGroupId=leaf.Id})).StatusCode);
        var response=await host.Client.PostAsJsonAsync("/api/yarns",new YarnInput{Code="LOCK",Name="کالا",ProductGroupId=leaf.Id,ConfirmedProductGroupDepth=2});
        Assert.Equal(HttpStatusCode.Created,response.StatusCode);var yarn=(await response.Content.ReadFromJsonAsync<YarnView>())!;
        Assert.Equal(HttpStatusCode.Conflict,(await host.Client.PostAsJsonAsync(url,new ProductGroupCreate("عمیق",leaf.Id,Guid.NewGuid()))).StatusCode);
        var completed=await Add("تکمیل",b.Id);
        var requests=await Task.WhenAll(Enumerable.Range(0,4).Select(i=>host.Client.PostAsJsonAsync(url,new ProductGroupCreate("عمیق "+i,completed.Id,Guid.NewGuid()))));
        Assert.All(requests,r=>Assert.Equal(HttpStatusCode.Conflict,r.StatusCode));
        var other=await Add("مستقل");var otherChild=await Add("آزاد",other.Id);var otherSource=await Add("منبع",otherChild.Id);var otherLeaf=await Add("عمیق آزاد",otherSource.Id);
        Assert.Equal(HttpStatusCode.Conflict,(await host.Client.PostAsJsonAsync(url+"/copy-children",new ProductGroupCopyChildren(otherSource.Id,leaf.Id))).StatusCode);
        var secondResponse=await host.Client.PostAsJsonAsync("/api/yarns",new YarnInput{Code="SECOND",Name="کالای دوم",ProductGroupId=completed.Id});
        Assert.Equal(HttpStatusCode.Created,secondResponse.StatusCode);var second=(await secondResponse.Content.ReadFromJsonAsync<YarnView>())!;
        foreach(var protectedNode in new[]{root,a,leaf,b,completed}) {
            var query="?rowVersion="+Uri.EscapeDataString(Convert.ToBase64String(protectedNode.RowVersion));
            Assert.Equal(HttpStatusCode.Conflict,(await host.Client.PutAsJsonAsync(url+"/"+protectedNode.Id+query,new ProductGroupRename("ویرایش ممنوع"))).StatusCode);
            Assert.Equal(HttpStatusCode.Conflict,(await host.Client.DeleteAsync(url+"/"+protectedNode.Id+query)).StatusCode);
        }
        var protectedList=await host.Client.GetFromJsonAsync<System.Text.Json.JsonElement>(url);
        Assert.True(protectedList.GetProperty("items").EnumerateArray().Where(x=>new[]{root.Id,a.Id,b.Id,leaf.Id,completed.Id}.Contains(x.GetProperty("id").GetGuid())).All(x=>x.GetProperty("isProtected").GetBoolean()));
        Assert.Equal(HttpStatusCode.NoContent,(await host.Client.DeleteAsync("/api/yarns/"+yarn.Id+"?rowVersion="+Uri.EscapeDataString(Convert.ToBase64String(yarn.RowVersion)))).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,(await host.Client.PostAsJsonAsync(url,new ProductGroupCreate("هنوز در استفاده",leaf.Id,Guid.NewGuid()))).StatusCode);
        Assert.Equal(HttpStatusCode.OK,(await host.Client.PutAsJsonAsync("/api/yarns/"+second.Id+"?rowVersion="+Uri.EscapeDataString(Convert.ToBase64String(second.RowVersion)),new YarnInput{Code="SECOND",Name="کالای دوم",ProductGroupId=otherLeaf.Id,ConfirmedProductGroupDepth=3})).StatusCode);
        var list=await host.Client.GetFromJsonAsync<System.Text.Json.JsonElement>(url);
        Assert.Equal(System.Text.Json.JsonValueKind.Null,list.GetProperty("items").EnumerateArray().Single(x=>x.GetProperty("id").GetGuid()==root.Id).GetProperty("lockedDepth").ValueKind);
        Assert.False(list.GetProperty("items").EnumerateArray().Single(x=>x.GetProperty("id").GetGuid()==root.Id).GetProperty("isProtected").GetBoolean());
        var deeper=await Add("پس از آزادشدن",leaf.Id);
        Assert.Equal(3,deeper.Depth);
        var preview=await host.Client.GetFromJsonAsync<System.Text.Json.JsonElement>(url+"/"+deeper.Id+"/assignment");
        Assert.True(preview.GetProperty("requiresConfirmation").GetBoolean());
        Assert.DoesNotContain("حتی پس از حذف",preview.GetProperty("message").GetString()!);
        await using(var db=sql.Context()) Assert.Equal(otherLeaf.Id,(await db.YarnItems.SingleAsync()).ProductGroupId);
        var deleteRoot=await Add("آزاد با حذف");
        var deletionResponse=await host.Client.PostAsJsonAsync("/api/yarns",new YarnInput{Code="DELETE-LAST",Name="حذف آخرین",ProductGroupId=deleteRoot.Id,ConfirmedProductGroupDepth=0});
        Assert.Equal(HttpStatusCode.Created,deletionResponse.StatusCode);var deleteYarn=(await deletionResponse.Content.ReadFromJsonAsync<YarnView>())!;
        Assert.Equal(HttpStatusCode.NoContent,(await host.Client.DeleteAsync("/api/yarns/"+deleteYarn.Id+"?rowVersion="+Uri.EscapeDataString(Convert.ToBase64String(deleteYarn.RowVersion)))).StatusCode);
        await Add("زیرگروه پس از حذف آخرین",deleteRoot.Id);
        var raceRoot=await Add("همزمان");var raceLeaf=await Add("انتهایی",raceRoot.Id);
        var assign=host.Client.PostAsJsonAsync("/api/yarns",new YarnInput{Code="RACE",Name="همزمان",ProductGroupId=raceLeaf.Id,ConfirmedProductGroupDepth=1});
        var extend=host.Client.PostAsJsonAsync(url,new ProductGroupCreate("سطح بعدی",raceLeaf.Id,Guid.NewGuid()));
        await Task.WhenAll(assign,extend);
        Assert.True((assign.Result.StatusCode==HttpStatusCode.Created && extend.Result.StatusCode==HttpStatusCode.Conflict) || (assign.Result.StatusCode==HttpStatusCode.BadRequest && extend.Result.StatusCode==HttpStatusCode.Created));
    }
    [Fact]
    public async Task ProductGroup_LocalDevelopment_apply_verified_terminal_depth_migration()
    {
        var connection=Environment.GetEnvironmentVariable("YARN_TRADE_LOCAL_PRODUCT_GROUP_CONNECTION");
        Assert.Equal("true",Environment.GetEnvironmentVariable("YARN_TRADE_TERMINAL_BACKUP_VERIFIED"));
        Assert.False(string.IsNullOrWhiteSpace(connection));
        await using var db=new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlServer(connection).Options);
        var pending=(await db.Database.GetPendingMigrationsAsync()).ToArray();
        Assert.All(pending,id=>Assert.Equal("20261108030000_LockProductGroupTerminalDepth",id));
        var before=await db.ProductGroups.CountAsync();var items=await db.YarnItems.CountAsync();
        await db.Database.MigrateAsync();
        Assert.Equal(before,await db.ProductGroups.CountAsync());Assert.Equal(items,await db.YarnItems.CountAsync());
        Assert.Empty(await db.Database.GetPendingMigrationsAsync());
    }
    private static ProductGroupView ProductGroupResult(ActionResult result) => Assert.IsType<ProductGroupView>(Assert.IsAssignableFrom<ObjectResult>(result).Value);
    [Fact]
    public async Task ProductGroup_empty_create_reload_normalization_idempotency_and_crud()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        Guid rootId, childId;
        await using (var db = new AppDbContext(options))
        {
            Assert.Empty(await db.ProductGroups.ToListAsync());
            var api = new ProductGroupsController(db); var request = new ProductGroupCreate(" نخ ", null, Guid.NewGuid());
            var root = ProductGroupResult(await api.Create(request, default)); rootId = root.Id;
            Assert.Equal("001", root.Code);
            Assert.Equal(root.Id, ProductGroupResult(await api.Create(request, default)).Id);
            Assert.IsType<ConflictObjectResult>(await api.Create(new("نخ", null, Guid.NewGuid()), default));
            var child = ProductGroupResult(await api.Create(new("كشمير ۲", root.Id, Guid.NewGuid()), default)); childId = child.Id;
            Assert.Equal(root.Code, child.Code); Assert.Equal("001.001", child.HierarchyCode);
            Assert.IsType<ConflictObjectResult>(await api.Create(new("کشمیر 2", root.Id, Guid.NewGuid()), default));
            Assert.IsType<BadRequestObjectResult>(await api.Create(new("مفقود", Guid.NewGuid(), Guid.NewGuid()), default));
            var entity = await db.ProductGroups.FindAsync(child.Id); entity!.RowVersion = new byte[8]; await db.SaveChangesAsync();
            Assert.IsType<ConflictObjectResult>(await api.Rename(child.Id, new("جدید"), Convert.ToBase64String(new byte[] {1,0,0,0,0,0,0,0}), default));
            var updated = ProductGroupResult(await api.Rename(child.Id, new("جدید"), Convert.ToBase64String(new byte[8]), default));
            Assert.Equal(child.Id, updated.Id); Assert.Equal(child.HierarchyCode, updated.HierarchyCode);
            var parent = await db.ProductGroups.FindAsync(root.Id); parent!.RowVersion = new byte[8]; await db.SaveChangesAsync();
            Assert.IsType<ConflictObjectResult>(await api.Delete(root.Id, Convert.ToBase64String(new byte[8]), default));
        }
        await using (var db = new AppDbContext(options))
        {
            Assert.Equal(2, await db.ProductGroups.CountAsync(x => !x.IsDeleted));
            Assert.Equal(rootId, (await db.ProductGroups.FindAsync(childId))!.ParentId);
            var api = new ProductGroupsController(db);
            Assert.IsType<NoContentResult>(await api.Delete(childId, Convert.ToBase64String(new byte[8]), default));
            var next = ProductGroupResult(await api.Create(new("بعدی", rootId, Guid.NewGuid()), default));
            Assert.Equal("001.002", next.HierarchyCode); // No renumbering or reuse after deletion.
        }
    }
    [Fact]
    public async Task ProductGroup_five_levels_and_depth_policy_are_enforced()
    {
        await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        db.ProductGroupPolicies.Add(new() { Id = ProductGroupPolicy.SingletonId, RowVersion = new byte[8] }); await db.SaveChangesAsync();
        var api = new ProductGroupsController(db); Guid? parent = null;
        for (int i = 0; i < 5; i++) parent = ProductGroupResult(await api.Create(new("سطح " + i, parent, Guid.NewGuid()), default)).Id;
        Assert.IsType<BadRequestObjectResult>(await api.Create(new("ششم", parent, Guid.NewGuid()), default));
        Assert.IsType<ConflictObjectResult>(await api.Configure(new(2, Convert.ToBase64String(new byte[8])), default));
        Assert.Equal("کشمیر 2", ProductGroupsController.NormalizeName(" كَشمير ۲ "));
    }
    [Fact]
    public async Task ProductGroup_depth_policy_roundtrip_preserves_deeper_records()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        await using (var db = new AppDbContext(options))
        {
            db.ProductGroupPolicies.Add(new() { Id = ProductGroupPolicy.SingletonId, RowVersion = new byte[8] }); await db.SaveChangesAsync();
            var api = new ProductGroupsController(db);
            Assert.IsType<OkObjectResult>(await api.Configure(new(0, Convert.ToBase64String(new byte[8])), default));
            var root = ProductGroupResult(await api.Create(new("Root", null, Guid.NewGuid()), default));
            Assert.IsType<BadRequestObjectResult>(await api.Create(new("Child", root.Id, Guid.NewGuid()), default));
            Assert.IsType<OkObjectResult>(await api.Configure(new(4, Convert.ToBase64String(new byte[8])), default));
            ProductGroupResult(await api.Create(new("Child", root.Id, Guid.NewGuid()), default));
            Assert.IsType<ConflictObjectResult>(await api.Configure(new(0, Convert.ToBase64String(new byte[8])), default));
            Assert.IsType<BadRequestObjectResult>(await api.Configure(new(5, Convert.ToBase64String(new byte[8])), default));
        }
        await using var reloaded = new AppDbContext(options);
        Assert.Equal(4, await reloaded.ProductGroupPolicies.Select(x => x.MaxSubgroups).SingleAsync());
        Assert.Equal(2, await reloaded.ProductGroups.CountAsync(x => !x.IsDeleted));
    }
    [Fact]
    public async Task ProductGroup_HTTP_permissions_and_empty_dataset()
    {
        await using var host = await CreateApp();
        await CreateUser(host.App, "groups-view@example.test", "Customer"); await SignIn(host, "groups-view@example.test");
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.GetAsync("/api/master-data/product-groups")).StatusCode);
        await SetPermissions(host, "groups-view@example.test", "productGroups.view");
        var empty = await host.Client.GetFromJsonAsync<System.Text.Json.JsonElement>("/api/master-data/product-groups");
        Assert.Equal(0, empty.GetProperty("items").GetArrayLength());
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.PostAsJsonAsync("/api/master-data/product-groups", new ProductGroupCreate("Root", null, Guid.NewGuid()))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.PutAsJsonAsync("/api/master-data/product-groups/policy", new ProductGroupDepthInput(2,""))).StatusCode);
        await CreateUser(host.App, "groups-admin@example.test", "Administrator"); await SignIn(host, "groups-admin@example.test");
        Assert.Equal(HttpStatusCode.Created, (await host.Client.PostAsJsonAsync("/api/master-data/product-groups", new ProductGroupCreate("Root", null, Guid.NewGuid()))).StatusCode);
    }
    [Fact]
    public void ProductGroup_migration_is_additive_and_snapshot_matches()
    {
        using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlServer("Server=unused;Database=unused;Trusted_Connection=True;TrustServerCertificate=True").Options);
        var migrations = db.GetService<IMigrationsAssembly>();
        var migration = migrations.CreateMigration(migrations.Migrations["20261108000000_AddProductGroups"], "Microsoft.EntityFrameworkCore.SqlServer");
        Assert.DoesNotContain(migration.UpOperations, op => op is Microsoft.EntityFrameworkCore.Migrations.Operations.DropTableOperation or Microsoft.EntityFrameworkCore.Migrations.Operations.DropColumnOperation);
        var create = Assert.Single(migration.UpOperations.OfType<Microsoft.EntityFrameworkCore.Migrations.Operations.CreateTableOperation>(), op => op.Name == "ProductGroups");
        Assert.Contains(create.Columns, c => c.Name == "RowVersion" && c.IsRowVersion);
        Assert.DoesNotContain(migration.UpOperations.OfType<Microsoft.EntityFrameworkCore.Migrations.Operations.InsertDataOperation>(), op => op.Table == "ProductGroups");
        var script = db.GetService<IMigrator>().GenerateScript("20261009212407_AddBrandDescription", "20261108000000_AddProductGroups");
        Assert.Contains("UX_ProductGroups_RootName", script); Assert.Contains("[ParentId] IS NOT NULL AND [IsDeleted] = 0", script);
        var differ = db.GetService<IMigrationsModelDiffer>();
        var snapshot = db.GetService<IModelRuntimeInitializer>().Initialize(migrations.ModelSnapshot!.Model);
        var differences = differ.GetDifferences(snapshot.GetRelationalModel(), db.GetService<Microsoft.EntityFrameworkCore.Metadata.IDesignTimeModel>().Model.GetRelationalModel());
        Assert.True(differences.Count == 0, string.Join("; ", differences.Select(op => op.GetType().Name + ":" + System.Text.Json.JsonSerializer.Serialize(op, op.GetType()))));
    }
    [Fact]
    public async Task ProductGroup_SQL_concurrent_duplicate_codes_and_stale_write()
    {
        await using var sql = await A4SqlDatabase.CreateLatest(operationalContract:false);
        async Task<ActionResult> Create(string name) { await using var db = sql.Context(); return await new ProductGroupsController(db).Create(new(name, null, Guid.NewGuid()), default); }
        var race = await Task.WhenAll(Enumerable.Range(0, 8).Select(_ => Create("همزمان")));
        Assert.Single(race.OfType<ObjectResult>(), r => r.StatusCode == 201); Assert.Equal(7, race.OfType<ConflictObjectResult>().Count());
        var distinct = await Task.WhenAll(Enumerable.Range(0, 8).Select(i => Create("جدا " + i)));
        Assert.Equal(8, distinct.Select(ProductGroupResult).Select(n => n.Code).Distinct().Count());
        await using var read = sql.Context(); Assert.Equal(9, await read.ProductGroups.CountAsync());
        var node = await read.ProductGroups.AsNoTracking().FirstAsync(); var token = Convert.ToBase64String(node.RowVersion);
        await using (var edit = sql.Context()) Assert.IsType<OkObjectResult>(await new ProductGroupsController(edit).Rename(node.Id, new("ویرایش"), token, default));
        await using (var stale = sql.Context()) Assert.IsType<ConflictObjectResult>(await new ProductGroupsController(stale).Rename(node.Id, new("قدیمی"), token, default));
    }

    [Fact]
    public async Task ProductGroup_SQL_real_HTTP_inventory_protection_and_persistence()
    {
        await using var sql = await A4SqlDatabase.CreateLatest(operationalContract:false);
        await using var host = await CreateApp(sqlConnection:sql.Connection, sqlRetries:true);
        await CreateUser(host.App,"product-group-sql-admin@example.test","Administrator"); await SignIn(host,"product-group-sql-admin@example.test");
        const string url = "/api/master-data/product-groups";
        Assert.Empty((await host.Client.GetFromJsonAsync<System.Text.Json.JsonElement>(url)).GetProperty("items").EnumerateArray());
        async Task<ProductGroupView> Create(string name, Guid? parent = null) {
            var response=await host.Client.PostAsJsonAsync(url,new ProductGroupCreate(name,parent,Guid.NewGuid()));
            Assert.Equal(HttpStatusCode.Created,response.StatusCode); return (await response.Content.ReadFromJsonAsync<ProductGroupView>())!;
        }
        var root=await Create("کالای آزمون"); var child=await Create("شاخه",root.Id); var leaf=await Create("برگ",child.Id); var sibling=await Create("شاخهٔ آزاد",root.Id);
        Assert.Equal(root.Code,leaf.Code); Assert.Equal(root.HierarchyCode+".001.001",leaf.HierarchyCode);
        var next=await Create("سطح سه",leaf.Id);next=await Create("سطح چهار",next.Id);
        Assert.Equal(HttpStatusCode.BadRequest,(await host.Client.PostAsJsonAsync(url,new ProductGroupCreate("غیرمجاز",next.Id,Guid.NewGuid()))).StatusCode);
        var candidates=await Task.WhenAll(Enumerable.Range(0,8).Select(_=>host.Client.PostAsJsonAsync(url,new ProductGroupCreate("تکراری همزمان",sibling.Id,Guid.NewGuid()))));
        Assert.Single(candidates,r=>r.StatusCode==HttpStatusCode.Created);Assert.Equal(7,candidates.Count(r=>r.StatusCode==HttpStatusCode.Conflict));
        await CreateUser(host.App,"product-group-sql-second@example.test","Administrator");
        var secondUser=await Login(host,"product-group-sql-second@example.test");
        // Restore first actor; explicitly exercise different authenticated users.
        await SignIn(host,"product-group-sql-admin@example.test");
        var multiUser=await Task.WhenAll(Enumerable.Range(0,6).Select(async i=>{
            using var request=new HttpRequestMessage(HttpMethod.Post,url){Content=JsonContent.Create(new ProductGroupCreate("کاربر همزمان "+i,null,Guid.NewGuid()))};
            if(i%2==0)request.Headers.Authorization=new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer",secondUser.AccessToken);
            var response=await host.Client.SendAsync(request);Assert.Equal(HttpStatusCode.Created,response.StatusCode);return (await response.Content.ReadFromJsonAsync<ProductGroupView>())!;
        }));
        Assert.Equal(6,multiUser.Select(x=>x.Code).Distinct().Count());
        Guid yarnId;
        await using(var db=sql.Context()) {
            var type=new YarnType {Code="PG-TYPE",NameFa="نوع",NameEn="Type",BaseUnit="KG"};
            var yarn=new YarnItem {Code="PG-ITEM",NameFa="کالا",NameEn="Item",YarnType=type,ProductGroupId=leaf.Id};yarnId=yarn.Id;
            var warehouse=new Warehouse {Code="PG-WH",NameFa="انبار",NameEn="Warehouse"};db.AddRange(type,yarn,warehouse);await db.SaveChangesAsync();
            // A product reference without ledger movements permits rename but never deletion.
            Assert.Equal(HttpStatusCode.Conflict,(await host.Client.DeleteAsync(url+"/"+leaf.Id+"?rowVersion="+Uri.EscapeDataString(Convert.ToBase64String(leaf.RowVersion)))).StatusCode);
            db.InventoryMovements.Add(new InventoryMovement {YarnItemId=yarn.Id,WarehouseId=warehouse.Id,MovementType=MovementType.PurchaseReceipt,Quantity=1,SourceDocumentType="ProductGroup SQL test",SourceDocumentId=Guid.NewGuid(),PostedAtUtc=DateTime.UtcNow});await db.SaveChangesAsync();
        }
        foreach(var protectedNode in new[]{root,child,leaf}) {
            var query="?rowVersion="+Uri.EscapeDataString(Convert.ToBase64String(protectedNode.RowVersion));
            var response=await host.Client.PutAsJsonAsync(url+"/"+protectedNode.Id+query,new ProductGroupRename("تغییر ممنوع"));
            Assert.Equal(HttpStatusCode.Conflict,response.StatusCode);
            Assert.Contains("GROUP_HAS_INVENTORY_HISTORY",await response.Content.ReadAsStringAsync());
            Assert.Equal(HttpStatusCode.Conflict,(await host.Client.DeleteAsync(url+"/"+protectedNode.Id+query)).StatusCode);
        }
        Assert.Equal(HttpStatusCode.OK,(await host.Client.PutAsJsonAsync(url+"/"+sibling.Id+"?rowVersion="+Uri.EscapeDataString(Convert.ToBase64String(sibling.RowVersion)),new ProductGroupRename("ویرایش شاخهٔ آزاد"))).StatusCode);
        var unused=await Create("قابل حذف");Assert.Equal(HttpStatusCode.NoContent,(await host.Client.DeleteAsync(url+"/"+unused.Id+"?rowVersion="+Uri.EscapeDataString(Convert.ToBase64String(unused.RowVersion)))).StatusCode);
        await using(var reopened=sql.Context()) {
            var item=await reopened.YarnItems.SingleAsync(x=>x.Id==yarnId);
            Assert.Equal(leaf.Id,item.ProductGroupId);
            var reassignment=await host.Client.PutAsJsonAsync("/api/yarns/"+yarnId+"?rowVersion="+Uri.EscapeDataString(Convert.ToBase64String(item.RowVersion)),new YarnInput{Code=item.Code,Name=item.NameFa,ProductGroupId=sibling.Id});
            Assert.Equal(HttpStatusCode.BadRequest,reassignment.StatusCode);
            var detachment=await host.Client.PutAsJsonAsync("/api/yarns/"+yarnId+"?rowVersion="+Uri.EscapeDataString(Convert.ToBase64String(item.RowVersion)),new YarnInput{Code=item.Code,Name=item.NameFa,ProductGroupId=null});
            Assert.Equal(HttpStatusCode.BadRequest,detachment.StatusCode);
            Assert.Single(await reopened.InventoryMovements.Where(x=>x.YarnItemId==yarnId).ToListAsync());
            Assert.False(await reopened.ProductGroups.AnyAsync(x=>x.ParentId!=null && !reopened.ProductGroups.Any(p=>p.Id==x.ParentId)));
        }
        await CreateUser(host.App,"product-group-sql-reader@example.test","Customer");await SignIn(host,"product-group-sql-reader@example.test");
        Assert.Equal(HttpStatusCode.Forbidden,(await host.Client.PostAsJsonAsync(url,new ProductGroupCreate("ممنوع",null,Guid.NewGuid()))).StatusCode);
    }

    [Fact]
    public async Task ProductGroup_LocalDevelopment_apply_only_approved_additive_migrations()
    {
        var connection=Environment.GetEnvironmentVariable("YARN_TRADE_LOCAL_PRODUCT_GROUP_CONNECTION");
        Assert.False(string.IsNullOrWhiteSpace(connection),"Explicit authorized local development connection required.");
        await using var db=new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlServer(connection).Options);
        var pending=(await db.Database.GetPendingMigrationsAsync()).ToArray();
        Assert.All(pending,id=>Assert.Contains(id,new[]{"20261108000000_AddProductGroups","20261108010000_LinkProductGroupsToInventory"}));
        await db.Database.MigrateAsync();
        Assert.Empty(await db.Database.GetPendingMigrationsAsync());
        Assert.Equal(0,await db.ProductGroups.CountAsync());
    }
}
