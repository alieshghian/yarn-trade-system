using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;
using YarnTrade.Api.Controllers;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;
using YarnTrade.Api.Security;
using YarnTrade.Api.Services;

namespace YarnTrade.Tests;

public sealed partial class SecurityBaselineTests
{
    [Fact]
    public async Task Brand_creation_update_duplicate_validation_and_stale_update()
    {
        await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var api = new BrandsController(db);
        Assert.IsType<BadRequestObjectResult>((await api.Create(new("", "Name", null), default)).Result);
        var created = Assert.IsType<BrandView>(Assert.IsType<CreatedAtActionResult>((await api.Create(new(" long-7000 ", " Name ", null), default)).Result).Value);
        Assert.Equal("LONG-7000", created.BrandCode); Assert.Null(created.Address);
        Assert.IsType<BadRequestObjectResult>((await api.Create(new("long-7000", "Duplicate", "Address"), default)).Result);
        var entity = await db.Brands.SingleAsync(); entity.RowVersion = new byte[8]; await db.SaveChangesAsync();
        var saved = Assert.IsType<BrandView>(Assert.IsType<OkObjectResult>((await api.Update(entity.Id, new("700", "Updated", "Address"), Convert.ToBase64String(entity.RowVersion), default)).Result).Value);
        Assert.Equal(created.Id, saved.Id); Assert.Equal("Updated", saved.BrandName);
        Assert.IsType<ConflictObjectResult>((await api.Update(entity.Id, new("701", "Stale", null), Convert.ToBase64String(new byte[] { 1, 0, 0, 0, 0, 0, 0, 0 }), default)).Result);
    }

    [Fact]
    public async Task Brand_person_many_to_many_default_roundtrip_and_legacy_preservation()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        Guid personId, aId, bId, titleId;
        await using (var db = new AppDbContext(options))
        {
            var a = new Brand { BrandCode = "700", BrandName = "A" }; var b = new Brand { BrandCode = "LONG", BrandName = "B" };
            var title = new ParameterValue { Code = "MR", ParameterType = ParameterType.Title, NameFa = "آقای", NameEn = "Mr.", TitlePersonType = PersonType.Individual };
            db.AddRange(a, b, title); await db.SaveChangesAsync(); aId = a.Id; bId = b.Id; titleId = title.Id;
            var controller = new MasterDataController(db, new PersonAccountService(db));
            var input = BrandPersonInput(titleId, [aId, bId], aId);
            var person = Assert.IsType<PersonView>(Assert.IsType<CreatedAtActionResult>((await controller.CreatePerson(input, default)).Result).Value);
            personId = person.Id; Assert.Equal(2, person.BrandIds.Length); Assert.Equal(aId, person.DefaultBrandId);
            var second = BrandPersonInput(titleId, [aId], aId); second.PersonCode = "SECOND"; second.LastName = "Second";
            Assert.IsType<CreatedAtActionResult>((await controller.CreatePerson(second, default)).Result);
        }
        await using (var db = new AppDbContext(options))
        {
            var api = new MasterDataController(db, new PersonAccountService(db));
            var person = await db.Persons.Include(x => x.BrandLinks).SingleAsync(x => x.Id == personId); person.RowVersion = new byte[8]; await db.SaveChangesAsync();
            var token = Convert.ToBase64String(person.RowVersion);
            Assert.IsType<BadRequestObjectResult>((await api.UpdatePerson(personId, BrandPersonInput(titleId, [bId], aId), token, default)).Result);
            Assert.IsType<BadRequestObjectResult>((await api.UpdatePerson(personId, BrandPersonInput(titleId, [Guid.NewGuid()], null), token, default)).Result);
            var legacy = BrandPersonInput(titleId, null, null); legacy.Notes = "Unchanged draft info";
            var preserved = Assert.IsType<PersonView>(Assert.IsType<OkObjectResult>((await api.UpdatePerson(personId, legacy, token, default)).Result).Value);
            Assert.Equal(2, preserved.BrandIds.Length); Assert.Equal(aId, preserved.DefaultBrandId);
            var changed = Assert.IsType<PersonView>(Assert.IsType<OkObjectResult>((await api.UpdatePerson(personId, BrandPersonInput(titleId, [bId], bId), token, default)).Result).Value);
            Assert.Equal(new[] { bId }, changed.BrandIds); Assert.Equal(bId, changed.DefaultBrandId);
            Assert.Equal(2, await db.PersonBrands.CountAsync()); // Other person's association survives.
        }
        await using var read = new AppDbContext(options);
        var persisted = await read.Persons.Include(x => x.BrandLinks).SingleAsync(x => x.Id == personId);
        Assert.Equal(bId, persisted.DefaultBrandId); Assert.Equal(bId, persisted.BrandLinks.Single().BrandId);
        Assert.Equal("+982111111111", persisted.Phone); Assert.Equal("Preserved address", persisted.Address);
    }

    private static PersonInput BrandPersonInput(Guid title, Guid[]? ids, Guid? defaultId) => new()
    {
        PersonCode = "BRAND-PERSON", FirstName = "Test", LastName = "Person", TitleId = title,
        BrandIds = ids, DefaultBrandId = defaultId, Phone = "+982111111111", Address = "Preserved address", Notes = "Draft notes"
    };

    [Fact]
    public async Task Brand_endpoints_permissions_and_menu_are_enforced()
    {
        await using var host = await CreateApp();
        await CreateUser(host.App, "brand-view@example.test", "Customer"); await SignIn(host, "brand-view@example.test");
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.GetAsync("/api/master-data/brands")).StatusCode);
        await SetPermissions(host, "brand-view@example.test", "brands.view");
        Assert.Equal(HttpStatusCode.OK, (await host.Client.GetAsync("/api/master-data/brands")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.PostAsJsonAsync("/api/master-data/brands", new BrandInput("700", "Brand", null))).StatusCode);
        var navigation = await host.Client.GetFromJsonAsync<JsonElement>("/api/navigation");
        Assert.Contains(navigation.GetProperty("nodes").EnumerateArray(), x => x.GetProperty("routeId").GetString() == "brands");
        await CreateUser(host.App, "brand-admin@example.test", "Administrator"); await SignIn(host, "brand-admin@example.test");
        Assert.Equal(HttpStatusCode.Created, (await host.Client.PostAsJsonAsync("/api/master-data/brands", new BrandInput("700", "Brand", null))).StatusCode);
    }

    [Fact]
    public void Brand_navigation_moves_between_groups_without_losing_preferences()
    {
        var nodes = NavigationRules.Defaults();
        Assert.Equal("definitions", nodes.Single(x => x.RouteId == "brands").ParentId);
        nodes.Add(new("custom", null, null, "Custom", "persons", true));
        nodes = nodes.Select(x => x.RouteId == "brands" ? x with { ParentId = "custom" } : x).ToList();
        Assert.Null(NavigationRules.Validate(nodes));
        var own = new NavigationPreferences(["persons", "brands"], ["persons"], ["custom"], ["brands"]);
        var reconciled = NavigationRules.Reconcile(own, nodes);
        Assert.Equal(own.Order, reconciled.Order); Assert.Equal(own.Hidden, reconciled.Hidden);
        Assert.Equal(own.Collapsed, reconciled.Collapsed); Assert.Equal(own.Pinned, reconciled.Pinned);
        Assert.DoesNotContain(NavigationRules.Permitted(nodes, new HashSet<string> { "persons.view" }), x => x.RouteId == "brands");
        Assert.Contains("brands.view", PermissionCatalog.Defaults(["PurchaseOperator"]));
        Assert.DoesNotContain("brands.edit", PermissionCatalog.Defaults(["PurchaseOperator"]));
    }

    [Fact]
    public async Task Brand_SQL_migration_preserves_records_layout_preferences_and_rollback()
    {
        await using var sql = await A4SqlDatabase.Create(); await using var db = sql.Context();
        var before = db.Database.GetMigrations().Where(x => !x.EndsWith("_AddBrandDefinition")).Last();
        var migrator = db.GetService<IMigrator>(); await migrator.MigrateAsync(before);
        var person = new Person { PersonCode = "LEGACY", DisplayName = "Legacy person", Notes = "Keep" }; db.Persons.Add(person);
        // Use raw SQL so the old schema is exercised before the new model's nullable columns exist.
        db.ChangeTracker.Clear();
        await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO Persons (Id, PersonCode, DisplayName, Notes, PersonType, PreferredLanguage, CreditLimitIRR, IsActive, PartnerKind, CreatedAtUtc) VALUES ({person.Id}, {person.PersonCode}, {person.DisplayName}, {person.Notes}, {0}, {"fa"}, {0m}, {true}, {0}, {DateTime.UtcNow})");
        var nodes = NavigationRules.Defaults().Where(x => x.RouteId != "brands").Reverse().ToList();
        nodes = nodes.Select(x => x.Id == "persons" ? x with { ParentId = "definitions", Label = "Custom people" } : x).ToList();
        var json = JsonSerializer.Serialize(nodes, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        db.SystemSettings.Add(new() { Key = "Navigation.Global.v1", Value = json, ValidFrom = new(2000, 1, 1) });
        var own = new SystemSetting { Key = "Navigation.User.v1.test", Value = "{\"pinned\":[\"persons\"],\"hidden\":[\"settings\"]}", ValidFrom = new(2000, 1, 1) }; db.SystemSettings.Add(own); await db.SaveChangesAsync();
        await migrator.MigrateAsync(); db.ChangeTracker.Clear();
        var saved = await db.Persons.SingleAsync(x => x.Id == person.Id); Assert.Equal("Keep", saved.Notes); Assert.Null(saved.DefaultBrandId);
        var layout = JsonSerializer.Deserialize<List<NavigationNode>>((await db.SystemSettings.SingleAsync(x => x.Key == "Navigation.Global.v1")).Value, new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
        Assert.Equal(nodes, layout.Where(x => x.RouteId != "brands").ToList()); Assert.Equal("definitions", layout.Single(x => x.RouteId == "brands").ParentId);
        Assert.Equal(own.Value, (await db.SystemSettings.SingleAsync(x => x.Key == own.Key)).Value);
        await migrator.MigrateAsync(before); await migrator.MigrateAsync(); db.ChangeTracker.Clear();
        Assert.Equal("Keep", (await db.Persons.SingleAsync(x => x.Id == person.Id)).Notes);
    }

    [Fact]
    public async Task Brand_SQL_unique_code_links_deletion_protection_and_purchase_uses_any_brand()
    {
        await using var sql = await A4SqlDatabase.CreateLatest(false);
        Guid brandId, personId;
        await using (var db = sql.Context())
        {
            var brand = new Brand { BrandCode = "700", BrandName = "Master" }; db.Brands.Add(brand); await db.SaveChangesAsync(); brandId = brand.Id;
            var controller = new MasterDataController(db, new PersonAccountService(db));
            var title = await db.ParameterValues.SingleAsync(x => x.ParameterType == ParameterType.Title && x.Code == "MR");
            var result = await controller.CreatePerson(BrandPersonInput(title.Id, [brand.Id], brand.Id), default);
            personId = Assert.IsType<PersonView>(Assert.IsType<CreatedAtActionResult>(result.Result).Value).Id;
            Assert.IsType<ConflictObjectResult>(await new BrandsController(db).Delete(brand.Id, Convert.ToBase64String(brand.RowVersion), default));
            var person = await db.Persons.SingleAsync(x => x.Id == personId);
            Assert.IsType<OkObjectResult>((await controller.UpdatePerson(personId, BrandPersonInput(title.Id, [], null), Convert.ToBase64String(person.RowVersion), default)).Result);
            Assert.Empty(await db.PersonBrands.ToListAsync());
            var supplier = await db.Persons.FirstAsync(x => x.Id != personId);
            // This supplier has no association with the brand: the unrestricted purchase remains valid.
            var purchases = new PurchasesController(db, null!, null!); // Create does not invoke posting/import services.
            var purchase = new PurchaseInvoice { InternalNumber = "BRAND-TEST", SupplierId = supplier.Id, BrandId = brand.Id, InvoiceDate = new(2026, 10, 9) };
            Assert.IsType<CreatedAtActionResult>((await purchases.Create(purchase, default)).Result);
            Assert.IsType<ConflictObjectResult>(await new BrandsController(db).Delete(brand.Id, Convert.ToBase64String(brand.RowVersion), default));
        }
        await using (var db = sql.Context())
        {
            db.Brands.Add(new Brand { BrandCode = "700", BrandName = "Duplicate" }); await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        }
        await using (var db = sql.Context())
        {
            db.PersonBrands.AddRange(new PersonBrand { PersonId = personId, BrandId = brandId }, new PersonBrand { PersonId = personId, BrandId = brandId });
            await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        }
        await using (var db = sql.Context())
        {
            var brand = await db.Brands.SingleAsync(x => x.Id == brandId); db.Remove(brand);
            await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        }
    }
}
