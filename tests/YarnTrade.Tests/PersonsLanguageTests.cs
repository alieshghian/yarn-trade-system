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
    [InlineData("IR", "fa")]
    [InlineData("CN", "zh")]
    [InlineData("CN", "en")]
    public async Task Create_and_reopen_preserves_selected_language(string nationalityCode, string language)
    {
        var options = new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        Guid id;
        await using (var db = new AppDbContext(options)) {
            var nationality = Nationality(nationalityCode);
            db.ParameterValues.Add(nationality);
            await db.SaveChangesAsync();
            var result = await Controller(db).CreatePerson(Input(nationality.Id, language), default);
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
