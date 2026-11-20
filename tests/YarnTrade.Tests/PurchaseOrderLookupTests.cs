using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Controllers;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;
using YarnTrade.Api.Services;

namespace YarnTrade.Tests;

public sealed class PurchaseOrderLookupTests
{
    [Fact]
    public async Task LookupsPageThroughAllEligibleRecordsBeyondTheOriginalFirst500()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        await using var db = new AppDbContext(options);
        var jobs = new[] { "SUPPLIER", "PARTNER", "CUSTOMER" }.Select(code =>
            new ParameterValue { ParameterType = ParameterType.Job, Code = code, NameEn = code, NameFa = code }).ToArray();
        db.AddRange(jobs);
        var yarns = new List<Guid>();
        var suppliers = new List<Guid>();
        for (int i = 0; i < 603; i++)
        {
            var code = i.ToString("D4");
            var yarn = new YarnItem { Code = code, NameFa = code, NameEn = code, IsActive = i != 602 };
            var person = new Person { PersonCode = code, DisplayName = code, IsActive = i != 602,
                Job = i % 10 == 0 ? jobs[2] : (i % 3 == 2 ? null : jobs[i % 3]) };
            db.Add(yarn);
            db.Add(person);
            if (yarn.IsActive) yarns.Add(yarn.Id);
            if (person.IsActive && person.Job != jobs[2]) suppliers.Add(person.Id);
        }
        await db.SaveChangesAsync();
        var yarnController = new YarnsController(db);
        var persons = new MasterDataController(db, new PersonAccountService(db));

        // Reproduce both calls formerly made by the form. The API honors 500,
        // but eligible records after that page are absent from both selectors.
        var oldYarns = Read(await yarnController.List(false, 1, 500));
        var oldPeople = Read(await persons.Persons(null, false, 1, 500));
        Assert.Equal(500, oldYarns.Ids.Length);
        Assert.Equal(500, oldPeople.Ids.Length);
        Assert.Equal(602, oldPeople.Total);
        Assert.DoesNotContain(yarns[^1], oldYarns.Ids);
        Assert.DoesNotContain(suppliers[^1], oldPeople.Ids);

        await CheckAll(yarns, page => yarnController.List(false, page, 50));
        await CheckAll(suppliers, page => persons.Persons(null, false, page, 50, purchaseSuppliersOnly: true));
    }

    private static async Task CheckAll(List<Guid> expected, Func<int, Task<object>> load)
    {
        Assert.True(expected.Count > 500);
        var actual = new List<Guid>();
        for (var page = 1; actual.Count < expected.Count; page++)
        {
            var result = Read(await load(page));
            Assert.Equal(expected.Count, result.Total);
            Assert.InRange(result.Ids.Length, 1, 50);
            actual.AddRange(result.Ids);
        }
        Assert.Equal(expected, actual);
    }

    private static (int Total, Guid[] Ids) Read(object page)
    {
        var json = JsonSerializer.SerializeToElement(page, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        return (json.GetProperty("total").GetInt32(), json.GetProperty("items").EnumerateArray()
            .Select(item => item.GetProperty("id").GetGuid()).ToArray());
    }
}
