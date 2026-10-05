using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;
using YarnTrade.Api.Services;

namespace YarnTrade.Api.Controllers;

[ApiController, Route("api/master-data"), Authorize]
public sealed class MasterDataController(AppDbContext db, PersonAccountService personAccounts) : ControllerBase
{
    [HttpGet("persons")]
    public async Task<object> Persons([FromQuery] string? q, [FromQuery] bool includeInactive = true, [FromQuery] int page = 1, [FromQuery] int pageSize = 50, CancellationToken ct = default)
    {
        var query = db.Persons.AsNoTracking().Include(x => x.Job).Include(x => x.Title).Include(x => x.Nationality).AsQueryable();
        if (!includeInactive) query = query.Where(x => x.IsActive);
        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim();
            query = query.Where(x => x.PersonCode.Contains(term) || x.DisplayName.Contains(term)
                || (x.FirstName != null && x.FirstName.Contains(term)) || (x.LastName != null && x.LastName.Contains(term))
                || (x.CompanyName != null && x.CompanyName.Contains(term)) || (x.Mobile != null && x.Mobile.Contains(term))
                || (x.Job != null && (x.Job.NameFa.Contains(term) || x.Job.NameEn.Contains(term))));
        }
        var total = await query.CountAsync(ct);
        var take = Math.Clamp(pageSize, 1, 500);
        var entities = await query.OrderBy(x => x.PersonCode).Skip((Math.Max(page, 1) - 1) * take).Take(take).ToListAsync(ct);
        var items = entities.Select(PersonView.From).ToList();
        return new { items, total, page, pageSize };
    }

    [HttpGet("persons/{id:guid}")]
    public async Task<ActionResult<PersonView>> PersonById(Guid id, CancellationToken ct)
    {
        var item = await db.Persons.AsNoTracking().Include(x => x.Job).Include(x => x.Title).Include(x => x.Nationality).SingleOrDefaultAsync(x => x.Id == id, ct);
        return item is null ? NotFound() : Ok(PersonView.From(item));
    }

    [HttpPost("persons")]
    public async Task<ActionResult<PersonView>> CreatePerson(PersonInput input, CancellationToken ct)
    {
        var error = await ValidatePersonAsync(input, null, ct);
        if (error is not null) return BadRequest(new { error });
        var person = new Person { Id = Guid.NewGuid(), PersonCode = string.Empty, DisplayName = string.Empty };
        Apply(person, input);
        db.Persons.Add(person);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException) { return Conflict(new { error = "کد شخص تکراری است.", code = "DUPLICATE_PERSON_CODE" }); }
        return CreatedAtAction(nameof(PersonById), new { id = person.Id }, PersonView.From(person));
    }

    [HttpPut("persons/{id:guid}")]
    public async Task<ActionResult<PersonView>> UpdatePerson(Guid id, PersonInput input, CancellationToken ct)
    {
        var person = await db.Persons.SingleOrDefaultAsync(x => x.Id == id, ct);
        if (person is null) return NotFound();
        var error = await ValidatePersonAsync(input, id, ct);
        if (error is not null) return BadRequest(new { error });
        Apply(person, input);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException) { return Conflict(new { error = "کد شخص تکراری است.", code = "DUPLICATE_PERSON_CODE" }); }
        return Ok(PersonView.From(person));
    }

    [HttpDelete("persons/{id:guid}")]
    public async Task<IActionResult> DeletePerson(Guid id, CancellationToken ct)
    {
        var person = await db.Persons.Include(x => x.Roles).SingleOrDefaultAsync(x => x.Id == id, ct);
        if (person is null) return NotFound();
        var summary = await personAccounts.GetSummaryAsync(id, ct);
        if (person.PartnerKind != PartnerKind.None || summary.HasHistory || summary.BalanceIRR != 0)
            return Conflict(new { error = "حذف شخص فقط در صورت نداشتن سابقه و مانده صفر مجاز است.", code = "PERSON_HAS_HISTORY_OR_BALANCE", summary.BalanceIRR, summary.HasHistory });
        db.PersonRoles.RemoveRange(person.Roles);
        db.Persons.Remove(person);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpGet("parameters")]
    public async Task<List<ParameterView>> Parameters([FromQuery] ParameterType? type, CancellationToken ct)
    {
        var query = db.ParameterValues.AsNoTracking().Where(x => x.IsActive);
        if (type.HasValue) query = query.Where(x => x.ParameterType == type);
        return await query.OrderBy(x => x.ParameterType).ThenBy(x => x.SortOrder).Select(x => new ParameterView(x.Id, x.ParameterType, x.Code, x.NameFa, x.NameEn)).ToListAsync(ct);
    }

    [HttpGet("yarns")]
    public async Task<object> Yarns([FromQuery] string? q, [FromQuery] int page = 1, [FromQuery] int pageSize = 25, CancellationToken ct = default)
    {
        var query = db.YarnItems.AsNoTracking().Include(x => x.YarnType).Where(x => x.IsActive);
        if (!string.IsNullOrWhiteSpace(q)) query = query.Where(x => x.Code.Contains(q) || x.NameFa.Contains(q) || x.NameEn.Contains(q) || x.SearchText.Contains(q));
        var total = await query.CountAsync(ct);
        var items = await query.OrderBy(x => x.Code).Skip((page - 1) * pageSize).Take(Math.Clamp(pageSize, 1, 100)).ToListAsync(ct);
        return new { items, total, page, pageSize };
    }

    [HttpPost("yarn-types")]
    public async Task<ActionResult<YarnType>> CreateYarnType(YarnType item, CancellationToken ct)
    {
        item.Id = Guid.NewGuid(); db.YarnTypes.Add(item); await db.SaveChangesAsync(ct); return Ok(item);
    }

    [HttpPost("yarns")]
    public async Task<ActionResult<YarnItem>> CreateYarn(YarnItem item, CancellationToken ct)
    {
        item.Id = Guid.NewGuid();
        item.SearchText = PersianTextNormalizer.Normalize($"{item.Code} {item.NameFa} {item.NameEn} {item.Property1Value} {item.Property2Value}");
        db.YarnItems.Add(item); await db.SaveChangesAsync(ct); return Ok(item);
    }

    [HttpGet("warehouses")]
    public Task<List<Warehouse>> Warehouses(CancellationToken ct) => db.Warehouses.AsNoTracking().Where(x => x.IsActive).OrderBy(x => x.Code).ToListAsync(ct);

    [HttpPost("warehouses")]
    public async Task<ActionResult<Warehouse>> CreateWarehouse(Warehouse item, CancellationToken ct)
    { item.Id = Guid.NewGuid(); db.Warehouses.Add(item); await db.SaveChangesAsync(ct); return Ok(item); }

    [HttpGet("exchange-rates")]
    public Task<List<ExchangeRate>> Rates([FromQuery] DateOnly? from, [FromQuery] DateOnly? to, CancellationToken ct)
    {
        var q = db.ExchangeRates.AsNoTracking().AsQueryable();
        if (from.HasValue) q = q.Where(x => x.RateDate >= from);
        if (to.HasValue) q = q.Where(x => x.RateDate <= to);
        return q.OrderByDescending(x => x.RateDate).ToListAsync(ct);
    }

    [HttpPost("exchange-rates")]
    public async Task<ActionResult<ExchangeRate>> CreateRate(ExchangeRate item, CancellationToken ct)
    { item.Id = Guid.NewGuid(); db.ExchangeRates.Add(item); await db.SaveChangesAsync(ct); return Ok(item); }

    private async Task<string?> ValidatePersonAsync(PersonInput input, Guid? currentId, CancellationToken ct)
    {
        input.PersonCode = input.PersonCode.Trim();
        if (string.IsNullOrWhiteSpace(input.PersonCode) || input.PersonCode.Length > 30) return "کد شخص الزامی و حداکثر ۳۰ کاراکتر است.";
        if (input.CreditLimitIRR < 0) return "مبلغ اعتبار نمی‌تواند منفی باشد.";
        if (input.PreferredLanguage is not ("fa" or "en")) return "زبان باید فارسی یا انگلیسی باشد.";
        if (string.IsNullOrWhiteSpace(input.LastName)) return "نام خانوادگی یا نام شرکت/اداره الزامی است.";
        if (await db.Persons.AnyAsync(x => x.PersonCode == input.PersonCode && x.Id != currentId, ct)) return "کد شخص تکراری است.";
        if (!await IsParameterAsync(input.JobId, ParameterType.Job, ct)) return "شغل انتخاب‌شده معتبر نیست.";
        if (!await IsParameterAsync(input.TitleId, ParameterType.Title, ct)) return "عنوان انتخاب‌شده معتبر نیست.";
        if (!await IsParameterAsync(input.NationalityId, ParameterType.Nationality, ct)) return "ملیت انتخاب‌شده معتبر نیست.";
        return null;
    }

    private Task<bool> IsParameterAsync(Guid? id, ParameterType type, CancellationToken ct) => id is null
        ? Task.FromResult(true)
        : db.ParameterValues.AnyAsync(x => x.Id == id && x.ParameterType == type && x.IsActive, ct);

    private static void Apply(Person person, PersonInput input)
    {
        person.PersonCode = input.PersonCode.Trim();
        person.AccountingCode = string.IsNullOrWhiteSpace(input.AccountingCode) ? person.PersonCode : input.AccountingCode.Trim();
        person.PersonType = input.PersonType;
        person.FirstName = input.PersonType == PersonType.Individual ? Clean(input.FirstName) : null;
        person.LastName = Clean(input.LastName);
        person.CompanyName = null;
        person.DisplayName = input.PersonType == PersonType.Company ? person.LastName! : $"{person.FirstName} {person.LastName}".Trim();
        person.JobId = input.JobId; person.TitleId = input.TitleId; person.NationalityId = input.NationalityId;
        person.PreferredLanguage = input.PreferredLanguage; person.CreditLimitIRR = input.CreditLimitIRR;
        person.Phone = Clean(input.Phone); person.Mobile = Clean(input.Mobile); person.Address = Clean(input.Address); person.Notes = Clean(input.Notes);
        person.IsActive = input.IsActive;
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

public sealed class PersonInput
{
    public string PersonCode { get; set; } = string.Empty;
    public string? AccountingCode { get; set; }
    public PersonType PersonType { get; set; }
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
    public string? CompanyName { get; set; }
    public Guid? JobId { get; set; }
    public Guid? TitleId { get; set; }
    public Guid? NationalityId { get; set; }
    public string PreferredLanguage { get; set; } = "fa";
    public decimal CreditLimitIRR { get; set; }
    public string? Phone { get; set; }
    public string? Mobile { get; set; }
    public string? Address { get; set; }
    public string? Notes { get; set; }
    public bool IsActive { get; set; } = true;
}

public sealed record ParameterView(Guid Id, ParameterType ParameterType, string Code, string NameFa, string NameEn);
public sealed record PersonView(Guid Id, string PersonCode, string? AccountingCode, PersonType PersonType, string? FirstName, string? LastName,
    string? CompanyName, string DisplayName, Guid? JobId, ParameterView? Job, Guid? TitleId, ParameterView? Title,
    Guid? NationalityId, ParameterView? Nationality, string PreferredLanguage, decimal CreditLimitIRR, string? Phone,
    string? Mobile, string? Address, string? Notes, bool IsActive)
{
    public static PersonView From(Person x) => new(x.Id, x.PersonCode, x.AccountingCode, x.PersonType, x.FirstName, x.LastName ?? x.CompanyName, x.CompanyName,
        x.DisplayName, x.JobId, Map(x.Job), x.TitleId, Map(x.Title), x.NationalityId, Map(x.Nationality), x.PreferredLanguage,
        x.CreditLimitIRR, x.Phone, x.Mobile, x.Address, x.Notes, x.IsActive);
    private static ParameterView? Map(ParameterValue? x) => x is null ? null : new(x.Id, x.ParameterType, x.Code, x.NameFa, x.NameEn);
}

public static class PersianTextNormalizer
{
    public static string Normalize(string value) => string.Join(' ', value.Replace('ي', 'ی').Replace('ك', 'ک').Replace('\u200c', ' ').Split(' ', StringSplitOptions.RemoveEmptyEntries)).Trim().ToLowerInvariant();
}
