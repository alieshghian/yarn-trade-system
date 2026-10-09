using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Controllers;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;
using YarnTrade.Api.Services;

namespace YarnTrade.Tests;

public sealed class PersonsLanguageTests
{
    [Theory]
    [InlineData("IR", null, "fa")]
    [InlineData("CN", null, "zh")]
    [InlineData("CN", "en", "en")]
    [InlineData("IR", "zh", "zh")]
    public async Task Recipient_report_default_and_override_do_not_change_person_or_user_language(string code, string? chosen, string expected)
    {
        var options = new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        await using var db = new AppDbContext(options);
        var nationality = Nationality(code);
        var person = new Person { PersonCode = "RECIPIENT", LastName = "Recipient", DisplayName = "Recipient", Nationality = nationality, PreferredLanguage = "en" };
        var user = new AppUser { UserName = "editor", Email = "editor@example.test", PreferredLanguage = "fa" };
        db.AddRange(person, user);
        await db.SaveChangesAsync();
        var reports = new ReportsController(db);
        foreach (var result in new[] {
            await reports.YarnTransactions(null, null, person.Id, null, null, default, chosen),
            await reports.PartnerLedger(person.Id, null, null, default, chosen)
        }) Assert.Equal(expected, result.GetType().GetProperty("reportLanguage")!.GetValue(result));
        Assert.Equal("en", (await db.Persons.AsNoTracking().SingleAsync()).PreferredLanguage);
        Assert.Equal("fa", (await db.Users.AsNoTracking().SingleAsync()).PreferredLanguage);
    }

    [Fact]
    public async Task Changing_nationality_preserves_the_explicit_person_language()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        await using var db = new AppDbContext(options);
        var iranian = Nationality("IR"); var chinese = Nationality("CN");
        var person = new Person { PersonCode = "LANG-001", DisplayName = "Language test", LastName = "Language test", Nationality = iranian, PreferredLanguage = "en", RowVersion = new byte[8] };
        db.AddRange(iranian, chinese, person);
        await db.SaveChangesAsync();
        var result = await Controller(db).UpdatePerson(person.Id, Input(chinese.Id, "en"), Convert.ToBase64String(person.RowVersion), default);
        Assert.Equal("en", Assert.IsType<PersonView>(Assert.IsType<OkObjectResult>(result.Result).Value).PreferredLanguage);
        Assert.Equal(chinese.Id, (await db.Persons.AsNoTracking().SingleAsync()).NationalityId);
    }

    [Theory]
    [InlineData("IR", "fa")]
    [InlineData("CN", "zh")]
    [InlineData("CN", "en")]
    public async Task Create_and_reopen_preserves_selected_language(string nationalityCode, string language)
    {
        var options = new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        Guid id;
        await using (var db = new AppDbContext(options)) {
            var nationality = Nationality(nationalityCode);
            var title = new ParameterValue { ParameterType = ParameterType.Title, Code = "MR", NameFa = "آقای", NameEn = "Mr.", TitlePersonType = PersonType.Individual };
            db.ParameterValues.AddRange(nationality, title);
            await db.SaveChangesAsync();
            var input = Input(nationality.Id, language); input.TitleId = title.Id;
            var result = await Controller(db).CreatePerson(input, default);
            var view = Assert.IsType<PersonView>(Assert.IsType<CreatedAtActionResult>(result.Result).Value);
            Assert.Equal(language, view.PreferredLanguage);
            id = view.Id;
        }
        await using var reopened = new AppDbContext(options);
        var read = await Controller(reopened).PersonById(id, default);
        var restored = Assert.IsType<PersonView>(Assert.IsType<OkObjectResult>(read.Result).Value);
        Assert.Equal(language, restored.PreferredLanguage);
        Assert.Equal(nationalityCode, restored.Nationality!.Code);
    }

    [Fact]
    public async Task Existing_Chinese_English_preference_and_manual_language_changes_survive_reopening()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        Guid id, nationalityId;
        await using (var db = new AppDbContext(options)) {
            var nationality = Nationality("CN");
            var person = new Person { PersonCode = "LANG-001", DisplayName = "Language test", LastName = "Language test",
                NationalityId = nationality.Id, PreferredLanguage = "en", RowVersion = new byte[8] };
            db.AddRange(nationality, person);
            await db.SaveChangesAsync();
            id = person.Id; nationalityId = nationality.Id;
        }
        foreach (var language in new[] { "en", "zh", "en" }) {
            await using (var db = new AppDbContext(options)) {
                var update = await Controller(db).UpdatePerson(id, Input(nationalityId, language), Convert.ToBase64String(new byte[8]), default);
                var saved = Assert.IsType<PersonView>(Assert.IsType<OkObjectResult>(update.Result).Value);
                Assert.Equal(language, saved.PreferredLanguage);
            }
            await using var reopened = new AppDbContext(options);
            var read = await Controller(reopened).PersonById(id, default);
            Assert.Equal(language, Assert.IsType<PersonView>(Assert.IsType<OkObjectResult>(read.Result).Value).PreferredLanguage);
        }
    }

    private static MasterDataController Controller(AppDbContext db) => new(db, new PersonAccountService(db));
    private static ParameterValue Nationality(string code) => new() {
        ParameterType = ParameterType.Nationality, Code = code, NameFa = code, NameEn = code, IsActive = true
    };
    private static PersonInput Input(Guid nationalityId, string language) => new() {
        PersonCode = "LANG-001", LastName = "Language test", NationalityId = nationalityId, PreferredLanguage = language, IsActive = true
    };
}
