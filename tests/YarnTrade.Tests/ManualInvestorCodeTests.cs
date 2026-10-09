using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Controllers;
using YarnTrade.Api.Domain;
using YarnTrade.Api.Services;

namespace YarnTrade.Tests;

public sealed partial class SecurityBaselineTests
{
    [Fact]
    public async Task Focused_manual_investor_code_reserves_person_identity_without_commercial_roles_or_balances()
    {
        await using var db = InvestorDatabase();
        var response = await new InvestorsController(db).Create(new("Manual Owner", PersonType.Company, InvestorCode: " own-50 "), default);
        var investor = Assert.IsType<Investor>(Assert.IsType<ObjectResult>(response).Value);
        Assert.Equal("OWN-50", investor.InvestorCode);
        var person = await db.Persons.SingleAsync();
        Assert.Equal(investor.InvestorCode, person.PersonCode); Assert.Equal(investor.Id, person.CapitalInvestorId);
        Assert.Equal(investor.LegalName, person.DisplayName); Assert.False(person.IsActive); Assert.Empty(person.Roles);
        Assert.Empty(db.InvestorBalances); Assert.Empty(db.MoneyDocuments);
        Assert.Equal(0, (await new PersonAccountService(db).GetSummaryAsync(person.Id)).BalanceIRR);
    }

    [Fact]
    public async Task Focused_manual_codes_reject_duplicate_investor_and_existing_person_in_both_directions()
    {
        await using var db = InvestorDatabase();
        var investors = new InvestorsController(db);
        Assert.IsType<ObjectResult>(await investors.Create(new("Owner", PersonType.Company, InvestorCode: "MAN-1"), default));
        Assert.Equal(409, Assert.IsType<ConflictObjectResult>(await investors.Create(new("Partner", PersonType.Company, InvestorCode: "man-1"), default)).StatusCode);
        var persons = new MasterDataController(db, new PersonAccountService(db));
        Assert.IsType<BadRequestObjectResult>((await persons.CreatePerson(new() { PersonCode = "man-1", LastName = "Collision", PersonType = PersonType.Company }, default)).Result);
        db.Persons.Add(new Person { PersonCode = "EXISTING", DisplayName = "Already registered" }); await db.SaveChangesAsync();
        Assert.IsType<ConflictObjectResult>(await investors.Create(new("Collision", PersonType.Company, InvestorCode: "EXISTING"), default));
        Assert.Single(db.Investors); Assert.Equal(2, await db.Persons.CountAsync());
    }

    [Fact]
    public async Task Focused_sole_owner_requires_no_manual_code_and_reserved_person_cannot_be_changed_or_deleted()
    {
        await using var db = InvestorDatabase();
        var created = Assert.IsType<ObjectResult>(await new InvestorsController(db).Create(new("Sole Owner", PersonType.Company), default));
        Assert.Equal(201, created.StatusCode);
        var person = await db.Persons.SingleAsync();
        var persons = new MasterDataController(db, new PersonAccountService(db));
        Assert.IsType<ConflictObjectResult>((await persons.UpdatePerson(person.Id, new() { PersonCode = "TAKEN", LastName = "Tampered" }, null, default)).Result);
        Assert.IsType<ConflictObjectResult>(await persons.DeletePerson(person.Id, null, default));
        Assert.Single(db.Persons);
    }

    [Theory]
    [InlineData("")]
    [InlineData(" ")]
    [InlineData("1234567890123456789012345678901")]
    public async Task Focused_manual_invalid_code_is_rejected(string code)
    {
        await using var db = InvestorDatabase();
        Assert.IsType<BadRequestObjectResult>(await new InvestorsController(db).Create(new("Owner", PersonType.Company, InvestorCode: code), default));
        Assert.Empty(db.Investors); Assert.Empty(db.Persons);
    }

    [Fact]
    public async Task Focused_sql_manual_identity_edit_updates_reservation_and_operational_lock_blocks_changes()
    {
        await using var sql = await A4SqlDatabase.CreateLatest(operationalContract: false);
        await using var host = await CreateApp(sqlConnection: sql.Connection, sqlRetries: true);
        await CreateUser(host.App, "manual-code@example.test", "Administrator"); await SignIn(host, "manual-code@example.test");
        var response = await host.Client.PostAsJsonAsync("/api/investors", new InvestorInput("Owner", PersonType.Company, InvestorCode: "OWN-42"));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var investor = (await response.Content.ReadFromJsonAsync<Investor>())!;
        var edit = new InvestorEditInput("OWN-43", "Owner Updated", PersonType.Company);
        response = await host.Client.PutAsJsonAsync(A4Version($"/api/investors/{investor.Id}", investor.RowVersion), edit);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode); investor = (await response.Content.ReadFromJsonAsync<Investor>())!;
        await using (var db = sql.Context())
        {
            var identity = await db.Persons.SingleAsync(x => x.CapitalInvestorId == investor.Id);
            Assert.Equal("OWN-43", identity.PersonCode); Assert.Equal("Owner Updated", identity.DisplayName); Assert.False(identity.IsActive);
            var version = InvestorContract(investor.Id); db.BusinessContractVersions.Add(version);
            db.MoneyDocuments.Add(new MoneyDocument { DocumentNumber = "LOCK-MANUAL", DocumentDate = new(2026, 10, 7), PersonId = Guid.NewGuid(), CreatedBy = Guid.NewGuid(), Status = DocumentStatus.Posted, BusinessContractVersionId = version.Id });
            await db.SaveChangesAsync();
        }
        await A4AssertCode(await host.Client.PutAsJsonAsync(A4Version($"/api/investors/{investor.Id}", investor.RowVersion), edit with { InvestorCode = "NEW-CODE" }), HttpStatusCode.Conflict, "INVESTOR_IDENTITY_LOCKED");
        await A4AssertCode(await host.Client.DeleteAsync(A4Version($"/api/investors/{investor.Id}", investor.RowVersion)), HttpStatusCode.Conflict, "INVESTOR_IDENTITY_LOCKED");
    }

    [Fact]
    public async Task Focused_sql_partnership_uses_two_manual_master_identities_and_preserves_one_contract_date()
    {
        await using var sql = await A4SqlDatabase.CreateLatest(operationalContract: false);
        await using var host = await CreateApp(sqlConnection: sql.Connection, sqlRetries: true);
        await CreateUser(host.App, "manual-contract@example.test", "Administrator"); await SignIn(host, "manual-contract@example.test");
        var owner = (await (await host.Client.PostAsJsonAsync("/api/investors", new InvestorInput("Owner", PersonType.Company, InvestorCode: "OWNER-71"))).Content.ReadFromJsonAsync<Investor>())!;
        var partner = (await (await host.Client.PostAsJsonAsync("/api/investors", new InvestorInput("Partner", PersonType.Individual, InvestorCode: "PARTNER-72"))).Content.ReadFromJsonAsync<Investor>())!;
        var input = BusinessContractRulesTests.Input(BusinessStructure.Partnership, null, 60, 40) with { PrimaryInvestorId = owner.Id, PartnerInvestorId = partner.Id, EffectiveFrom = new(2026, 10, 7) };
        Assert.Equal(HttpStatusCode.Created, (await host.Client.PostAsJsonAsync("/api/business-contract", input)).StatusCode);
        await using var db = sql.Context();
        var contract = await db.BusinessContractVersions.SingleAsync();
        Assert.Equal(owner.Id, contract.PrimaryInvestorId); Assert.Equal(partner.Id, contract.PartnerInvestorId); Assert.Equal(input.EffectiveFrom, contract.EffectiveFrom);
        Assert.Equal(2, await db.Persons.CountAsync(x => x.CapitalInvestorId != null)); Assert.Empty(db.PersonRoles); Assert.Empty(db.InvestorBalances);
    }

    [Fact]
    public async Task Focused_sql_concurrent_person_and_investor_code_registration_accepts_one_identity_only()
    {
        await using var sql = await A4SqlDatabase.CreateLatest(operationalContract: false);
        await using var host = await CreateApp(sqlConnection: sql.Connection, sqlRetries: true);
        await CreateUser(host.App, "manual-race@example.test", "Administrator"); await SignIn(host, "manual-race@example.test");
        var results = await Task.WhenAll(
            host.Client.PostAsJsonAsync("/api/investors", new InvestorInput("Capital", PersonType.Company, InvestorCode: "RACE-42")),
            host.Client.PostAsJsonAsync("/api/master-data/persons", new PersonInput { PersonCode = "RACE-42", LastName = "Trading", PersonType = PersonType.Company }));
        Assert.Single(results, x => x.StatusCode == HttpStatusCode.Created);
        Assert.Single(results, x => x.StatusCode is HttpStatusCode.Conflict or HttpStatusCode.BadRequest);
        await using var db = sql.Context(); Assert.Equal(1, await db.Persons.CountAsync(x => x.PersonCode == "RACE-42"));
    }
}
