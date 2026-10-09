using Microsoft.AspNetCore.Mvc;
using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;
using YarnTrade.Api.Controllers;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;
using YarnTrade.Api.Services;

namespace YarnTrade.Tests;

public sealed class PersonsFormTests
{
    [Fact]
    public async Task Mobile_list_and_primary_roundtrip_independently_of_phones()
    {
        var options = Options(); Guid id;
        await using (var db = new AppDbContext(options)) {
            var input = Input("MOBILE-001", "Mobile list test");
            input.PhoneNumbers = ["02111111111", "02122222222"]; input.Phone = "02122222222";
            input.MobileNumbers = ["09121111111", "09122222222"]; input.Mobile = "09122222222";
            var saved = Assert.IsType<PersonView>(Assert.IsType<CreatedAtActionResult>((await Controller(db).CreatePerson(input, default)).Result).Value);
            id = saved.Id;
            Assert.Equal(input.MobileNumbers, saved.MobileNumbers); Assert.Equal(input.Mobile, saved.Mobile);
        }
        await using (var reopened = new AppDbContext(options)) {
            var person = await reopened.Persons.SingleAsync(); person.RowVersion = new byte[8]; await reopened.SaveChangesAsync();
            var input = Input("MOBILE-001", "Mobile list test"); input.Mobile = "09121111111";
            var updated = Assert.IsType<PersonView>(Assert.IsType<OkObjectResult>((await Controller(reopened).UpdatePerson(id, input, Convert.ToBase64String(person.RowVersion), default)).Result).Value);
            Assert.Equal(new[] { "09121111111", "09122222222" }, updated.MobileNumbers); Assert.Equal("09121111111", updated.Mobile);
            Assert.Equal(new[] { "02111111111", "02122222222" }, updated.PhoneNumbers); Assert.Equal("02122222222", updated.Phone);
        }
        await using var readContext = new AppDbContext(options);
        var read = Assert.IsType<PersonView>(Assert.IsType<OkObjectResult>((await Controller(readContext).PersonById(id, default)).Result).Value);
        Assert.Equal(new[] { "09121111111", "09122222222" }, read.MobileNumbers); Assert.Equal("09121111111", read.Mobile);
    }

    [Fact]
    public async Task Phone_list_and_primary_roundtrip_and_legacy_client_preserves_all_numbers()
    {
        var options = Options(); Guid id;
        await using (var db = new AppDbContext(options)) {
            var input = Input("PHONE-001", "Phone list test"); input.PhoneNumbers = ["02111111111", "02122222222"]; input.Phone = "02122222222";
            var saved = Assert.IsType<PersonView>(Assert.IsType<CreatedAtActionResult>((await Controller(db).CreatePerson(input, default)).Result).Value);
            id = saved.Id;
            Assert.Equal(input.PhoneNumbers, saved.PhoneNumbers); Assert.Equal(input.Phone, saved.Phone);
        }
        await using (var reopened = new AppDbContext(options)) {
            var person = await reopened.Persons.SingleAsync(); person.RowVersion = new byte[8]; await reopened.SaveChangesAsync();
            var read = Assert.IsType<PersonView>(Assert.IsType<OkObjectResult>((await Controller(reopened).PersonById(id, default)).Result).Value);
            Assert.Equal(new[] { "02111111111", "02122222222" }, read.PhoneNumbers);
            var legacyInput = Input("PHONE-001", "Phone list test"); legacyInput.Phone = "02111111111";
            var updated = Assert.IsType<PersonView>(Assert.IsType<OkObjectResult>((await Controller(reopened).UpdatePerson(id, legacyInput, Convert.ToBase64String(person.RowVersion), default)).Result).Value);
            Assert.Equal(read.PhoneNumbers, updated.PhoneNumbers); Assert.Equal("02111111111", updated.Phone);
        }
    }

    [Fact]
    public async Task Contract_creation_assigns_partner_ignores_requested_job_and_links_without_changing_investors()
    {
        var options = Options(); Guid personId, contractId;
        await using (var db = new AppDbContext(options)) {
            var partner = new ParameterValue { ParameterType = ParameterType.Job, Code = "PARTNER", NameFa = "شریک", NameEn = "Partner" };
            var customer = new ParameterValue { ParameterType = ParameterType.Job, Code = "CUSTOMER", NameFa = "مشتری", NameEn = "Customer" };
            db.AddRange(partner, customer);
            db.Investors.AddRange(new Investor { Id = Guid.Parse("11111111-1111-1111-1111-111111111111"), InvestorCode = "INV-0001", LegalName = "Owner" },
                new Investor { Id = Guid.Parse("22222222-2222-2222-2222-222222222222"), InvestorCode = "INV-0002", LegalName = "Investor partner" });
            await db.SaveChangesAsync();
            var input = Input("COMMERCIAL-PARTNER", "Commercial partner"); input.JobId = customer.Id;
            var created = Assert.IsType<PersonView>(Assert.IsType<CreatedAtActionResult>((await Controller(db).CreateContractPerson(input, default)).Result).Value);
            personId = created.Id;
            Assert.Equal(partner.Id, created.JobId);
            Assert.Equal("Partner", (await db.Persons.Include(x => x.Roles).SingleAsync()).Roles.Single().Role);
            var contracts = new BusinessContractsController(db, new BusinessContractService(db));
            Assert.IsType<CreatedAtActionResult>(await contracts.Create(BusinessContractRulesTests.Input(BusinessStructure.Partnership, personId, 50, 50), default));
            contractId = (await db.BusinessContractVersions.SingleAsync()).Id;
            Assert.Equal(2, await db.Investors.CountAsync());
            Assert.Empty(await db.InvestorBalances.ToListAsync());
        }
        await using var reopened = new AppDbContext(options);
        Assert.Equal(personId, (await reopened.BusinessContractVersions.SingleAsync(x => x.Id == contractId)).PartnerPersonId);
        Assert.Equal("PARTNER", (await reopened.Persons.Include(x => x.Job).SingleAsync(x => x.Id == personId)).Job!.Code);
    }

    [Fact]
    public async Task Ordinary_person_api_cannot_assign_partner_but_preserves_other_jobs()
    {
        await using var db = new AppDbContext(Options());
        var jobs = new[] { "CUSTOMER", "SELLER", "SUPPLIER", "PARTNER", "MANAGEMENT", "ORDERS", "COMMERCE", "WAREHOUSE", "FINANCE", "OTHER" }
            .Select(code => new ParameterValue { ParameterType = ParameterType.Job, Code = code, NameFa = code, NameEn = code }).ToArray();
        db.AddRange(jobs); await db.SaveChangesAsync();
        foreach (var job in jobs) {
            var input = Input(job.Code, job.Code); input.JobId = job.Id;
            var result = (await Controller(db).CreatePerson(input, default)).Result;
            if (job.Code == "PARTNER") Assert.IsType<BadRequestObjectResult>(result);
            else Assert.IsType<CreatedAtActionResult>(result);
        }
        var existing = await db.Persons.FirstAsync(); existing.RowVersion = new byte[8]; await db.SaveChangesAsync();
        var changed = Input(existing.PersonCode, existing.LastName!); changed.JobId = jobs.Single(x => x.Code == "PARTNER").Id;
        Assert.IsType<BadRequestObjectResult>((await Controller(db).UpdatePerson(existing.Id, changed, Convert.ToBase64String(existing.RowVersion), default)).Result);
        Assert.Equal(9, await db.Persons.CountAsync());
        Assert.True(await db.ParameterValues.AnyAsync(x => x.Code == "PARTNER"));
    }

    [Theory]
    [InlineData("MR")]
    [InlineData("COMPANY")]
    [InlineData("OFFICE")]
    public async Task Duplicate_names_normalize_variants_and_whitespace_and_allow_self_edit(string titleCode)
    {
        await using var db = new AppDbContext(Options());
        var title = new ParameterValue { ParameterType = ParameterType.Title, Code = titleCode, NameFa = titleCode, NameEn = titleCode };
        db.Add(title); await db.SaveChangesAsync();
        var original = Input("ORIGINAL", "کریمی  نیا"); original.FirstName = "علی"; original.TitleId = title.Id;
        var saved = Assert.IsType<PersonView>(Assert.IsType<CreatedAtActionResult>((await Controller(db).CreatePerson(original, default)).Result).Value);
        var duplicate = Input("DUPLICATE", "  كريمي\tنیا  "); duplicate.FirstName = " علي "; duplicate.TitleId = title.Id;
        Assert.IsType<BadRequestObjectResult>((await Controller(db).CreatePerson(duplicate, default)).Result);
        var person = await db.Persons.SingleAsync(); person.RowVersion = new byte[8]; await db.SaveChangesAsync();
        Assert.IsType<OkObjectResult>((await Controller(db).UpdatePerson(saved.Id, original, Convert.ToBase64String(person.RowVersion), default)).Result);
        Assert.Single(await db.Persons.ToListAsync());
    }

    [Fact]
    public async Task Individuals_with_different_first_names_are_distinct_and_historical_duplicates_are_not_deleted()
    {
        await using var db = new AppDbContext(Options());
        db.Persons.AddRange(new Person { PersonCode = "OLD1", FirstName = "علی", LastName = "کریمی", DisplayName = "علی کریمی" },
            new Person { PersonCode = "OLD2", FirstName = "علي", LastName = "كريمي", DisplayName = "علي كريمي" });
        await db.SaveChangesAsync();
        var input = Input("NEW", "کریمی"); input.FirstName = "رضا";
        Assert.IsType<CreatedAtActionResult>((await Controller(db).CreatePerson(input, default)).Result);
        Assert.Equal(3, await db.Persons.CountAsync());
    }

    [Theory]
    [InlineData("MR", PersonType.Individual)]
    [InlineData("MRS", PersonType.Individual)]
    [InlineData("COMPANY", PersonType.Company)]
    [InlineData("OFFICE", PersonType.Company)]
    public async Task Title_controls_type_and_names_are_persisted(string titleCode, PersonType expected)
    {
        var options = Options();
        Guid id;
        await using (var db = new AppDbContext(options)) {
            var title = new ParameterValue { ParameterType = ParameterType.Title, Code = titleCode, NameFa = titleCode, NameEn = titleCode };
            db.Add(title); await db.SaveChangesAsync();
            var input = Input("TITLE-001", "Family or organization");
            input.TitleId = title.Id; input.FirstName = "First"; input.DirectorName = "Director";
            input.PersonType = expected == PersonType.Company ? PersonType.Individual : PersonType.Company;
            var result = await Controller(db).CreatePerson(input, default);
            var saved = Assert.IsType<PersonView>(Assert.IsType<CreatedAtActionResult>(result.Result).Value);
            id = saved.Id;
            Assert.Equal(expected, saved.PersonType);
        }
        await using var reopened = new AppDbContext(options);
        var person = Assert.IsType<PersonView>(Assert.IsType<OkObjectResult>((await Controller(reopened).PersonById(id, default)).Result).Value);
        Assert.Equal(expected, person.PersonType);
        Assert.Equal("Family or organization", person.LastName);
        Assert.Equal(expected == PersonType.Individual ? "First" : null, person.FirstName);
        Assert.Equal("Director", person.DirectorName);
    }

    [Theory]
    [InlineData("MR")]
    [InlineData("MRS")]
    [InlineData("COMPANY")]
    [InlineData("OFFICE")]
    public async Task Every_title_requires_its_family_or_organization_name(string titleCode)
    {
        await using var db = new AppDbContext(Options());
        var title = new ParameterValue { ParameterType = ParameterType.Title, Code = titleCode, NameFa = titleCode, NameEn = titleCode };
        db.Add(title); await db.SaveChangesAsync();
        var input = Input("REQUIRED-001", " "); input.TitleId = title.Id;
        Assert.IsType<BadRequestObjectResult>((await Controller(db).CreatePerson(input, default)).Result);
        Assert.Empty(await db.Persons.ToListAsync());
    }

    private static DbContextOptions<AppDbContext> Options() => new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
    private static MasterDataController Controller(AppDbContext db) => new(db, new PersonAccountService(db));
    private static PersonInput Input(string code, string name) => new() { PersonCode = code, LastName = name, PreferredLanguage = "en" };
}

public sealed partial class SecurityBaselineTests
{
    [Fact]
    public async Task Persons_mobile_SQL_migration_preserves_legacy_mobile_and_phone_list()
    {
        await using var sql = await A4SqlDatabase.Create();
        Guid id; byte[] token;
        await using (var db = sql.Context()) {
            await db.GetService<IMigrator>().MigrateAsync("20261008145059_AddPersonPhoneNumbers");
            await db.Database.ExecuteSqlRawAsync("INSERT INTO Persons (Id, PersonCode, PersonType, DisplayName, LastName, Phone, PhoneNumbersJson, Mobile, PreferredLanguage, CreditLimitIRR, IsActive, PartnerKind, CreatedAtUtc) VALUES (NEWID(), N'MOBILE-SQL', 1, N'Mobile SQL company', N'Mobile SQL company', N'02122222222', N'[\"02111111111\",\"02122222222\"]', N'09121111111', N'en', 0, 1, 0, SYSUTCDATETIME())");
            id = await db.Persons.Where(x => x.PersonCode == "MOBILE-SQL").Select(x => x.Id).SingleAsync();
            token = await db.Persons.Where(x => x.Id == id).Select(x => x.RowVersion).SingleAsync();
            await db.Database.MigrateAsync();
        }
        await using (var db = sql.Context()) {
            var controller = new MasterDataController(db, new PersonAccountService(db));
            var before = Assert.IsType<PersonView>(Assert.IsType<OkObjectResult>((await controller.PersonById(id, default)).Result).Value);
            Assert.Equal(token, before.RowVersion); Assert.Equal(new[] { "09121111111" }, before.MobileNumbers);
            Assert.Equal(new[] { "02111111111", "02122222222" }, before.PhoneNumbers); Assert.Equal("02122222222", before.Phone);
            var input = new PersonInput { PersonCode = before.PersonCode, PersonType = before.PersonType, LastName = before.LastName,
                Phone = before.Phone, PhoneNumbers = before.PhoneNumbers, Mobile = "09122222222", MobileNumbers = ["09121111111", "09122222222"], PreferredLanguage = before.PreferredLanguage };
            Assert.IsType<OkObjectResult>((await controller.UpdatePerson(id, input, Convert.ToBase64String(token), default)).Result);
        }
        await using var reopened = sql.Context();
        var restored = Assert.IsType<PersonView>(Assert.IsType<OkObjectResult>((await new MasterDataController(reopened, new PersonAccountService(reopened)).PersonById(id, default)).Result).Value);
        Assert.Equal(new[] { "09121111111", "09122222222" }, restored.MobileNumbers); Assert.Equal("09122222222", restored.Mobile);
        Assert.Equal(new[] { "02111111111", "02122222222" }, restored.PhoneNumbers); Assert.Equal("02122222222", restored.Phone);
    }

    [Fact]
    public async Task Persons_phone_SQL_migration_preserves_legacy_primary_and_restores_multiple_numbers()
    {
        await using var sql = await A4SqlDatabase.Create();
        Guid id; byte[] token;
        await using (var db = sql.Context()) {
            await db.GetService<IMigrator>().MigrateAsync("20261008125711_AddPersonDirectorName");
            await db.Database.ExecuteSqlRawAsync("INSERT INTO Persons (Id, PersonCode, PersonType, DisplayName, LastName, DirectorName, Phone, Mobile, PreferredLanguage, CreditLimitIRR, IsActive, PartnerKind, CreatedAtUtc) VALUES (NEWID(), N'PHONE-SQL', 1, N'Phone SQL company', N'Phone SQL company', N'Legacy director', N'02111111111', N'09121111111', N'en', 0, 1, 0, SYSUTCDATETIME())");
            id = await db.Persons.Where(x => x.PersonCode == "PHONE-SQL").Select(x => x.Id).SingleAsync();
            token = await db.Persons.Where(x => x.Id == id).Select(x => x.RowVersion).SingleAsync();
            await db.Database.MigrateAsync();
        }
        await using (var db = sql.Context()) {
            var controller = new MasterDataController(db, new PersonAccountService(db));
            var before = Assert.IsType<PersonView>(Assert.IsType<OkObjectResult>((await controller.PersonById(id, default)).Result).Value);
            Assert.Equal(token, before.RowVersion); Assert.Equal(new[] { "02111111111" }, before.PhoneNumbers);
            Assert.Equal("09121111111", before.Mobile); Assert.Equal("Legacy director", before.DirectorName);
            var input = new PersonInput { PersonCode = before.PersonCode, PersonType = before.PersonType, LastName = before.LastName, DirectorName = before.DirectorName,
                Phone = "02122222222", PhoneNumbers = ["02111111111", "02122222222"], Mobile = before.Mobile, PreferredLanguage = before.PreferredLanguage };
            Assert.IsType<OkObjectResult>((await controller.UpdatePerson(id, input, Convert.ToBase64String(token), default)).Result);
        }
        await using var reopened = sql.Context();
        var restored = Assert.IsType<PersonView>(Assert.IsType<OkObjectResult>((await new MasterDataController(reopened, new PersonAccountService(reopened)).PersonById(id, default)).Result).Value);
        Assert.Equal(new[] { "02111111111", "02122222222" }, restored.PhoneNumbers); Assert.Equal("02122222222", restored.Phone);
        Assert.Equal("09121111111", restored.Mobile);
    }

    [Fact]
    public async Task Persons_partner_protection_SQL_HTTP_blocks_ordinary_bypass_and_respects_contract_lock()
    {
        await using var sql = await A4SqlDatabase.CreateLatest(operationalContract: false);
        await using var host = await CreateApp(sqlConnection: sql.Connection);
        await CreateUser(host.App, "persons-guard@example.test"); await SignIn(host, "persons-guard@example.test");
        await SetPermissions(host, "persons-guard@example.test", "persons.view", "persons.create", "persons.edit", "persons.delete");
        var input = new PersonInput { PersonCode = "GUARD-001", FirstName = "Guard", LastName = "Originally customer" };
        var created = await host.Client.PostAsJsonAsync("/api/master-data/persons", input);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var person = (await created.Content.ReadFromJsonAsync<PersonView>())!;
        Guid contractId;
        using (var scope = host.App.Services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Investors.AddRange(new Investor { Id = Guid.Parse("11111111-1111-1111-1111-111111111111"), InvestorCode = "INV-0001", LegalName = "Owner" },
                new Investor { Id = Guid.Parse("22222222-2222-2222-2222-222222222222"), InvestorCode = "INV-0002", LegalName = "Partner investor" });
            await db.SaveChangesAsync();
            Assert.IsType<CreatedAtActionResult>(await new BusinessContractsController(db, new BusinessContractService(db)).Create(BusinessContractRulesTests.Input(BusinessStructure.Partnership, person.Id, 50, 50), default));
            contractId = (await db.BusinessContractVersions.SingleAsync()).Id;
        }
        var reopened = (await host.Client.GetFromJsonAsync<PersonView>($"/api/master-data/persons/{person.Id}"))!;
        Assert.True(reopened.IsContractPartner);
        input.LastName = "Changed only through contract";
        await A4AssertCode(await host.Client.PutAsJsonAsync(A4Version($"/api/master-data/persons/{person.Id}", person.RowVersion), input), HttpStatusCode.Conflict, "CONTRACT_PARTNER_MANAGED_BY_CONTRACT");
        await A4AssertCode(await host.Client.DeleteAsync(A4Version($"/api/master-data/persons/{person.Id}", person.RowVersion)), HttpStatusCode.Conflict, "CONTRACT_PARTNER_MANAGED_BY_CONTRACT");
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.PutAsJsonAsync(A4Version($"/api/master-data/contract-persons/{person.Id}", person.RowVersion), input)).StatusCode);
        await SetPermissions(host, "persons-guard@example.test", "persons.view", "persons.edit", "persons.delete", "settings.edit");
        var updated = await host.Client.PutAsJsonAsync(A4Version($"/api/master-data/contract-persons/{person.Id}", person.RowVersion), input);
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);
        var edited = (await updated.Content.ReadFromJsonAsync<PersonView>())!;
        using (var scope = host.App.Services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var warehouse = new Warehouse { Code = "GUARD-WH", NameFa = "Guard warehouse", NameEn = "Guard warehouse" };
            db.Warehouses.Add(warehouse); await db.SaveChangesAsync();
            db.Sales.Add(new Sale { SaleNumber = "GUARD-SALE", SaleDate = new DateOnly(2026, 2, 1), CustomerId = person.Id, SellerId = person.Id,
                WarehouseId = warehouse.Id, Status = DocumentStatus.Posted, BusinessContractVersionId = contractId });
            await db.SaveChangesAsync();
        }
        input.LastName = "Must not persist";
        await A4AssertCode(await host.Client.PutAsJsonAsync(A4Version($"/api/master-data/contract-persons/{person.Id}", edited.RowVersion), input), HttpStatusCode.Conflict, "CONTRACT_VERSION_LOCKED");
        await A4AssertCode(await host.Client.DeleteAsync(A4Version($"/api/master-data/contract-persons/{person.Id}", edited.RowVersion)), HttpStatusCode.Conflict, "CONTRACT_PARTNER_STILL_LINKED");
        Assert.Equal("Changed only through contract", (await host.Client.GetFromJsonAsync<PersonView>($"/api/master-data/persons/{person.Id}"))!.LastName);
    }

    [Fact]
    public async Task Persons_contract_creation_HTTP_requires_both_contract_and_person_permissions()
    {
        await using var host = await CreateApp();
        var input = new PersonInput { PersonCode = "HTTP-PARTNER", LastName = "HTTP Partner", PreferredLanguage = "zh" };
        Assert.Equal(HttpStatusCode.Unauthorized, (await host.Client.PostAsJsonAsync("/api/master-data/contract-persons", input)).StatusCode);
        await CreateUser(host.App, "persons-workflow@example.test"); await SignIn(host, "persons-workflow@example.test");
        await SetPermissions(host, "persons-workflow@example.test", "persons.create");
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.PostAsJsonAsync("/api/master-data/contract-persons", input)).StatusCode);
        await SetPermissions(host, "persons-workflow@example.test", "settings.edit");
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.PostAsJsonAsync("/api/master-data/contract-persons", input)).StatusCode);
        await SetPermissions(host, "persons-workflow@example.test", "settings.edit", "persons.create");
        using (var scope = host.App.Services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            if (!await db.ParameterValues.AnyAsync(x => x.ParameterType == ParameterType.Job && x.Code == "PARTNER")) {
                db.Add(new ParameterValue { ParameterType = ParameterType.Job, Code = "PARTNER", NameFa = "شریک", NameEn = "Partner" });
                await db.SaveChangesAsync();
            }
        }
        var response = await host.Client.PostAsJsonAsync("/api/master-data/contract-persons", input);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        using var checkScope = host.App.Services.CreateScope();
        var saved = await checkScope.ServiceProvider.GetRequiredService<AppDbContext>().Persons.Include(x => x.Job).Include(x => x.Roles).SingleAsync(x => x.PersonCode == input.PersonCode);
        Assert.Equal("PARTNER", saved.Job!.Code); Assert.Equal("Partner", saved.Roles.Single().Role);
    }

    [Fact]
    public async Task Persons_director_sql_migration_preserves_existing_data_and_persists_director()
    {
        await using var sql = await A4SqlDatabase.Create();
        Guid id; byte[] token;
        await using (var db = sql.Context()) {
            await db.GetService<IMigrator>().MigrateAsync("20261007123138_AddInvestorIdentities");
            await db.Database.ExecuteSqlRawAsync("INSERT INTO Persons (Id, PersonCode, PersonType, DisplayName, LastName, Phone, Mobile, PreferredLanguage, CreditLimitIRR, IsActive, PartnerKind, CreatedAtUtc) VALUES (NEWID(), N'PRESERVE-001', 1, N'Preserved company', N'Preserved company', N'02112345678', N'09121234567', N'en', 0, 1, 0, SYSUTCDATETIME())");
            // Query through the pre-migration projection without selecting the new column.
            id = await db.Persons.Where(x => x.PersonCode == "PRESERVE-001").Select(x => x.Id).SingleAsync();
            token = await db.Persons.Where(x => x.Id == id).Select(x => x.RowVersion).SingleAsync();
            await db.Database.MigrateAsync();
        }
        await using (var db = sql.Context()) {
            var before = await db.Persons.SingleAsync(x => x.Id == id);
            Assert.Equal("Preserved company", before.LastName); Assert.Equal("02112345678", before.Phone);
            Assert.Equal("09121234567", before.Mobile); Assert.Equal("en", before.PreferredLanguage);
            Assert.Equal(token, before.RowVersion); Assert.Null(before.DirectorName);
            var title = await db.ParameterValues.SingleAsync(x => x.ParameterType == ParameterType.Title && x.Code == "OFFICE");
            var input = new PersonInput { PersonCode = "DIRECTOR-001", LastName = "Director SQL office", TitleId = title.Id, DirectorName = "Director SQL name" };
            var controller = new MasterDataController(db, new PersonAccountService(db));
            var saved = Assert.IsType<PersonView>(Assert.IsType<CreatedAtActionResult>((await controller.CreatePerson(input, default)).Result).Value);
            id = saved.Id;
        }
        await using var reopened = sql.Context();
        Assert.Equal("Director SQL name", (await reopened.Persons.SingleAsync(x => x.Id == id)).DirectorName);
    }
}
