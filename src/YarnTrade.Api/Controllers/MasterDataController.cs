using YarnTrade.Api.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;
using YarnTrade.Api.Services;
using System.Text.Json;

namespace YarnTrade.Api.Controllers;

[ApiController, Route("api/master-data"), Authorize]
public sealed class MasterDataController(AppDbContext db, PersonAccountService personAccounts) : ControllerBase
{
    [RequirePermission("persons.view")]
    [HttpGet("persons")]
    public async Task<object> Persons([FromQuery] string? q, [FromQuery] bool includeInactive = true, [FromQuery] int page = 1, [FromQuery] int pageSize = 50, CancellationToken ct = default)
    {
        var query = db.Persons.AsNoTracking().Include(x => x.Job).Include(x => x.Title).Include(x => x.Nationality).Include(x => x.Roles).AsQueryable();
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
        var ids = entities.Select(x => x.Id).ToArray();
        var linked = await db.BusinessContractVersions.Where(x => x.PartnerPersonId.HasValue && ids.Contains(x.PartnerPersonId.Value)).Select(x => x.PartnerPersonId!.Value).Distinct().ToListAsync(ct);
        var items = entities.Select(x => PersonView.From(x, linked.Contains(x.Id))).ToList();
        return new { items, total, page, pageSize };
    }

    [RequirePermission("persons.view")]
    [HttpGet("persons/{id:guid}")]
    public async Task<ActionResult<PersonView>> PersonById(Guid id, CancellationToken ct)
    {
        var item = await db.Persons.AsNoTracking().Include(x => x.Job).Include(x => x.Title).Include(x => x.Nationality).Include(x => x.Roles).SingleOrDefaultAsync(x => x.Id == id, ct);
        return item is null ? NotFound() : Ok(PersonView.From(item, await LinkedToContract(id, ct)));
    }

    [RequirePermission("persons.create")]
    [HttpPost("persons")]
    public Task<ActionResult<PersonView>> CreatePerson(PersonInput input, CancellationToken ct) => CreatePersonCore(input, false, ct);

    [RequirePermission("settings.edit"), RequirePermission("persons.create")]
    [HttpPost("contract-persons")]
    public async Task<ActionResult<PersonView>> CreateContractPerson(PersonInput input, CancellationToken ct)
    {
        var partnerJob = await db.ParameterValues.SingleOrDefaultAsync(x => x.ParameterType == ParameterType.Job && x.Code == "PARTNER" && x.IsActive, ct);
        if (partnerJob is null) return Conflict(new { code = "PARTNER_ROLE_UNAVAILABLE" });
        input.JobId = partnerJob.Id;
        return await CreatePersonCore(input, true, ct);
    }

    private async Task<ActionResult<PersonView>> CreatePersonCore(PersonInput input, bool contractWorkflow, CancellationToken ct)
    {
        var error = await ValidatePersonAsync(input, null, ct, contractWorkflow);
        if (error is not null) return BadRequest(new { error });
        var person = new Person { Id = Guid.NewGuid(), PersonCode = string.Empty, DisplayName = string.Empty };
        Apply(person, input);
        if (contractWorkflow) person.Roles.Add(new PersonRole { Role = "Partner" });
        db.Persons.Add(person);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { return AggregateConcurrency.Conflict(); }
        catch (DbUpdateException) { return Conflict(new { error = "کد شخص تکراری است.", code = "DUPLICATE_PERSON_CODE" }); }
        return CreatedAtAction(nameof(PersonById), new { id = person.Id }, PersonView.From(person));
    }

    [RequirePermission("persons.edit")]
    [HttpPut("persons/{id:guid}")]
    public Task<ActionResult<PersonView>> UpdatePerson(Guid id, PersonInput input, [FromQuery] string? rowVersion, CancellationToken ct) => UpdatePersonCore(id, input, rowVersion, false, ct);

    [RequirePermission("settings.edit"), RequirePermission("persons.edit")]
    [HttpPut("contract-persons/{id:guid}")]
    public Task<ActionResult<PersonView>> UpdateContractPerson(Guid id, PersonInput input, [FromQuery] string? rowVersion, CancellationToken ct) =>
        db.Database.CreateExecutionStrategy().ExecuteAsync(async () => {
            await using var transaction = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync(ct) : null;
            await new BusinessContractService(db).LatestForUpdateAsync(ct);
            var result = await UpdatePersonCore(id, input, rowVersion, true, ct);
            if (result.Result is OkObjectResult && transaction is not null) await transaction.CommitAsync(ct);
            return result;
        });

    private async Task<ActionResult<PersonView>> UpdatePersonCore(Guid id, PersonInput input, string? rowVersion, bool contractWorkflow, CancellationToken ct)
    {
        var person = await db.Persons.Include(x => x.Job).Include(x => x.Roles).SingleOrDefaultAsync(x => x.Id == id, ct);
        if (person is null) return NotFound();
        var linked = await LinkedToContract(id, ct);
        var partner = IsPartner(person) || linked;
        if (!contractWorkflow && partner) return PartnerProtected();
        if (contractWorkflow && !partner) return BadRequest(new { code = "CONTRACT_PARTNER_REQUIRED" });
        if (contractWorkflow && linked && await new BusinessContractService(db).HasOperationalTransactionsAsync(ct))
            return Conflict(new { code = "CONTRACT_VERSION_LOCKED" });
        if (contractWorkflow) input.JobId = person.JobId;
        if (!contractWorkflow && (await personAccounts.GetSummaryAsync(id, ct)).HasHistory
            && !string.Equals(input.PersonCode?.Trim(), person.PersonCode, StringComparison.OrdinalIgnoreCase))
            return Conflict(new { code = "PERSON_CODE_IMMUTABLE", error = "کد شخص دارای سابقه عملیاتی قابل تغییر نیست." });
        if (await db.Investors.AnyAsync(x => x.Id == person.CapitalInvestorId && x.InvestorCode == person.PersonCode, ct))
            return Conflict(new { code = "INVESTOR_IDENTITY_MANAGED_BY_CONTRACT" });
        var concurrency = AggregateConcurrency.Apply(db, person, rowVersion);
        if (concurrency is not null) return concurrency;
        var error = await ValidatePersonAsync(input, id, ct, contractWorkflow);
        if (error is not null) return BadRequest(new { error });
        Apply(person, input);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { return AggregateConcurrency.Conflict(); }
        catch (DbUpdateException) { return Conflict(new { error = "کد شخص تکراری است.", code = "DUPLICATE_PERSON_CODE" }); }
        return Ok(PersonView.From(person, linked));
    }

    [RequirePermission("persons.delete")]
    [HttpDelete("persons/{id:guid}")]
    public Task<IActionResult> DeletePerson(Guid id, [FromQuery] string? rowVersion, CancellationToken ct) => DeletePersonCore(id, rowVersion, false, ct);

    [RequirePermission("settings.edit"), RequirePermission("persons.delete")]
    [HttpDelete("contract-persons/{id:guid}")]
    public Task<IActionResult> DeleteContractPerson(Guid id, [FromQuery] string? rowVersion, CancellationToken ct) =>
        db.Database.CreateExecutionStrategy().ExecuteAsync(async () => {
            await using var transaction = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync(ct) : null;
            await new BusinessContractService(db).LatestForUpdateAsync(ct);
            var result = await DeletePersonCore(id, rowVersion, true, ct);
            if (result is NoContentResult && transaction is not null) await transaction.CommitAsync(ct);
            return result;
        });

    private async Task<IActionResult> DeletePersonCore(Guid id, string? rowVersion, bool contractWorkflow, CancellationToken ct)
    {
        var person = await db.Persons.Include(x => x.Roles).Include(x => x.Job).SingleOrDefaultAsync(x => x.Id == id, ct);
        if (person is null) return NotFound();
        var linked = await LinkedToContract(id, ct);
        if (!contractWorkflow && (linked || IsPartner(person))) return PartnerProtected();
        if (contractWorkflow && !linked && !IsPartner(person)) return BadRequest(new { code = "CONTRACT_PARTNER_REQUIRED" });
        if (contractWorkflow && linked) return Conflict(new { code = "CONTRACT_PARTNER_STILL_LINKED" });
        if (await db.Investors.AnyAsync(x => x.Id == person.CapitalInvestorId && x.InvestorCode == person.PersonCode, ct))
            return Conflict(new { code = "INVESTOR_IDENTITY_MANAGED_BY_CONTRACT" });
        var concurrency = AggregateConcurrency.Apply(db, person, rowVersion, touch: false);
        if (concurrency is not null) return concurrency;
        var summary = await personAccounts.GetSummaryAsync(id, ct);
        if (person.PartnerKind != PartnerKind.None || summary.HasHistory || summary.BalanceIRR != 0)
            return Conflict(new { error = "حذف شخص فقط در صورت نداشتن سابقه و مانده صفر مجاز است.", code = "PERSON_HAS_HISTORY_OR_BALANCE", summary.BalanceIRR, summary.HasHistory });
        db.PersonRoles.RemoveRange(person.Roles);
        db.Persons.Remove(person);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [RequirePermission("persons.view")]
    [HttpGet("parameters")]
    public async Task<List<ParameterView>> Parameters([FromQuery] ParameterType? type, CancellationToken ct)
    {
        var query = db.ParameterValues.AsNoTracking().Where(x => x.IsActive);
        if (type.HasValue) query = query.Where(x => x.ParameterType == type);
        return await query.OrderBy(x => x.ParameterType).ThenBy(x => x.SortOrder).Select(x => new ParameterView(x.Id, x.ParameterType, x.Code, x.NameFa, x.NameEn, x.TitlePersonType)).ToListAsync(ct);
    }

    [RequirePermission("persons.create")]
    [HttpPost("parameters/titles")]
    public async Task<ActionResult<ParameterView>> CreateTitle(TitleInput input, CancellationToken ct)
    {
        var name = input.Name?.Trim() ?? "";
        if (name.Length is 0 or > 100 || input.PersonType is not (PersonType.Individual or PersonType.Company))
            return BadRequest(new { error = "عنوان (حداکثر ۱۰۰ کاراکتر) و انتخاب حقیقی یا حقوقی الزامی است." });
        var normalized = PersianTextNormalizer.NormalizeName(name == "آقا" ? "آقای" : name);
        var titles = await db.ParameterValues.AsNoTracking().Where(x => x.ParameterType == ParameterType.Title).ToListAsync(ct);
        if (titles.Any(x => PersianTextNormalizer.NormalizeName(x.NameFa == "آقا" ? "آقای" : x.NameFa) == normalized))
            return Conflict(new { error = "این عنوان قبلاً ثبت شده است.", code = "DUPLICATE_TITLE" });
        // The existing unique code index also rejects concurrent submissions of the same normalized title.
        var code = "TITLE_" + Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(normalized)))[..24];
        var title = new ParameterValue { Code = code, NameFa = name, NameEn = name, ParameterType = ParameterType.Title,
            TitlePersonType = input.PersonType, SortOrder = Math.Max(100, titles.Select(x => x.SortOrder).DefaultIfEmpty().Max() + 1) };
        db.ParameterValues.Add(title);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException e) when (e.InnerException is Microsoft.Data.SqlClient.SqlException { Number: 2601 or 2627 })
        { return Conflict(new { error = "این عنوان قبلاً ثبت شده است.", code = "DUPLICATE_TITLE" }); }
        return Ok(new ParameterView(title.Id, title.ParameterType, title.Code, title.NameFa, title.NameEn, title.TitlePersonType));
    }

    [RequirePermission("yarns.view")]
    [HttpGet("yarns")]
    public async Task<object> Yarns([FromQuery] string? q, [FromQuery] int page = 1, [FromQuery] int pageSize = 25, CancellationToken ct = default)
    {
        var query = db.YarnItems.AsNoTracking().Include(x => x.YarnType).Where(x => x.IsActive);
        if (!string.IsNullOrWhiteSpace(q)) query = query.Where(x => x.Code.Contains(q) || x.NameFa.Contains(q) || x.NameEn.Contains(q) || x.SearchText.Contains(q));
        var total = await query.CountAsync(ct);
        var items = await query.OrderBy(x => x.Code).Skip((page - 1) * pageSize).Take(Math.Clamp(pageSize, 1, 100)).ToListAsync(ct);
        return new { items, total, page, pageSize };
    }

    [RequirePermission("yarns.create")]
    [HttpPost("yarn-types")]
    public async Task<ActionResult<YarnType>> CreateYarnType(YarnType item, CancellationToken ct)
    {
        item.Id = Guid.NewGuid(); db.YarnTypes.Add(item); await db.SaveChangesAsync(ct); return Ok(item);
    }

    [RequirePermission("yarns.create")]
    [HttpPost("yarns")]
    public async Task<ActionResult<YarnItem>> CreateYarn(YarnItem item, CancellationToken ct)
    {
        item.Id = Guid.NewGuid();
        item.SearchText = PersianTextNormalizer.Normalize($"{item.Code} {item.NameFa} {item.NameEn} {item.Property1Value} {item.Property2Value}");
        db.YarnItems.Add(item); await db.SaveChangesAsync(ct); return Ok(item);
    }

    [RequirePermission("inventory.view")]
    [HttpGet("warehouses")]
    public Task<List<Warehouse>> Warehouses(CancellationToken ct) => db.Warehouses.AsNoTracking().Where(x => x.IsActive).OrderBy(x => x.Code).ToListAsync(ct);

    [RequirePermission("inventory.edit")]
    [HttpPost("warehouses")]
    public async Task<ActionResult<Warehouse>> CreateWarehouse(Warehouse item, CancellationToken ct)
    { item.Id = Guid.NewGuid(); db.Warehouses.Add(item); await db.SaveChangesAsync(ct); return Ok(item); }

    [RequirePermission("finance.view")]
    [HttpGet("exchange-rates")]
    public Task<List<ExchangeRate>> Rates([FromQuery] DateOnly? from, [FromQuery] DateOnly? to, CancellationToken ct)
    {
        var q = db.ExchangeRates.AsNoTracking().AsQueryable();
        if (from.HasValue) q = q.Where(x => x.RateDate >= from);
        if (to.HasValue) q = q.Where(x => x.RateDate <= to);
        return q.OrderByDescending(x => x.RateDate).ToListAsync(ct);
    }

    [RequirePermission("finance.create")]
    [HttpPost("exchange-rates")]
    public async Task<ActionResult<ExchangeRate>> CreateRate(ExchangeRate item, CancellationToken ct)
    { item.Id = Guid.NewGuid(); db.ExchangeRates.Add(item); await db.SaveChangesAsync(ct); return Ok(item); }

    private async Task<string?> ValidatePersonAsync(PersonInput input, Guid? currentId, CancellationToken ct, bool contractWorkflow = false)
    {
        input.PersonCode = input.PersonCode.Trim().ToUpperInvariant();
        if (string.IsNullOrWhiteSpace(input.PersonCode) || input.PersonCode.Length > 30) return "کد شخص الزامی و حداکثر ۳۰ کاراکتر است.";
        if (input.CreditLimitIRR < 0) return "مبلغ اعتبار نمی‌تواند منفی باشد.";
        if (input.PreferredLanguage is not ("fa" or "en" or "zh")) return "زبان باید فارسی، انگلیسی یا چینی باشد.";
        input.LastName = Clean(input.LastName) ?? Clean(input.CompanyName);
        if (string.IsNullOrWhiteSpace(input.LastName)) return "نام خانوادگی، نام شرکت یا نام اداره الزامی است.";
        if (input.DirectorName?.Length > 200) return "نام مدیر حداکثر ۲۰۰ کاراکتر است.";
        if (input.PhoneNumbers?.Any(string.IsNullOrWhiteSpace) == true) return "شمارهٔ تلفن نمی‌تواند خالی باشد.";
        if (input.MobileNumbers?.Any(string.IsNullOrWhiteSpace) == true) return "شمارهٔ موبایل نمی‌تواند خالی باشد.";
        if (await db.Persons.AnyAsync(x => x.PersonCode == input.PersonCode && x.Id != currentId, ct)) return "کد شخص تکراری است.";
        if (await db.Investors.AnyAsync(x => x.InvestorCode == input.PersonCode, ct)) return "کد شخص برای سرمایه‌گذار رزرو شده است.";
        if (!await IsParameterAsync(input.JobId, ParameterType.Job, ct)) return "شغل انتخاب‌شده معتبر نیست.";
        if (!contractWorkflow && await db.ParameterValues.AnyAsync(x => x.Id == input.JobId && x.ParameterType == ParameterType.Job && x.Code == "PARTNER", ct))
            return "نقش شریک فقط از مسیر مجاز قرارداد قابل تخصیص است.";
        if (!contractWorkflow && currentId is null && input.TitleId is null) return "عنوان الزامی است.";
        if (!await IsParameterAsync(input.TitleId, ParameterType.Title, ct)) return "عنوان انتخاب‌شده معتبر نیست.";
        var title = await db.ParameterValues.AsNoTracking().SingleOrDefaultAsync(x => x.Id == input.TitleId, ct);
        var titleCode = title?.Code;
        input.PersonType = title?.TitlePersonType ?? (titleCode switch { "MR" or "MRS" => PersonType.Individual, "COMPANY" or "OFFICE" or "INSTITUTE" or "ORGANIZATION" => PersonType.Company, _ => input.PersonType });
        var candidates = await db.Persons.AsNoTracking().Where(x => x.Id != currentId && x.PersonType == input.PersonType)
            .Select(x => new { x.FirstName, x.LastName, x.CompanyName, TitleCode = x.Title == null ? null : x.Title.Code }).ToListAsync(ct);
        var name = PersianTextNormalizer.NormalizeName(input.LastName!);
        if (candidates.Any(x => PersianTextNormalizer.NormalizeName(x.LastName ?? x.CompanyName ?? "") == name
            && (input.PersonType == PersonType.Individual
                ? PersianTextNormalizer.NormalizeName(x.FirstName ?? "") == PersianTextNormalizer.NormalizeName(input.FirstName ?? "")
                : (x.TitleCode == "OFFICE") == (titleCode == "OFFICE"))))
            return "نام شخص، شرکت یا اداره تکراری است.";
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
        person.DirectorName = Clean(input.DirectorName);
        person.CompanyName = null;
        person.DisplayName = input.PersonType == PersonType.Company ? person.LastName! : $"{person.FirstName} {person.LastName}".Trim();
        person.JobId = input.JobId; person.TitleId = input.TitleId; person.NationalityId = input.NationalityId;
        person.PreferredLanguage = input.PreferredLanguage; person.CreditLimitIRR = input.CreditLimitIRR;
        var primaryPhone = Clean(input.Phone) ?? (input.PhoneNumbers is null && person.PhoneNumbersJson is not null ? person.Phone : null);
        var phones = PersonNumberList.Read(input.PhoneNumbers is null ? person.PhoneNumbersJson : JsonSerializer.Serialize(input.PhoneNumbers), primaryPhone);
        person.Phone = primaryPhone ?? phones.FirstOrDefault();
        if (input.PhoneNumbers is not null || person.PhoneNumbersJson is not null) person.PhoneNumbersJson = JsonSerializer.Serialize(phones);
        var primaryMobile = Clean(input.Mobile) ?? (input.MobileNumbers is null && person.MobileNumbersJson is not null ? person.Mobile : null);
        var mobiles = PersonNumberList.Read(input.MobileNumbers is null ? person.MobileNumbersJson : JsonSerializer.Serialize(input.MobileNumbers), primaryMobile);
        person.Mobile = primaryMobile ?? mobiles.FirstOrDefault();
        if (input.MobileNumbers is not null || person.MobileNumbersJson is not null) person.MobileNumbersJson = JsonSerializer.Serialize(mobiles);
        var primaryAddress = Clean(input.Address) ?? (input.Addresses is null && person.AddressesJson is not null ? person.Address : null);
        var addresses = PersonNumberList.Read(input.Addresses is null ? person.AddressesJson : JsonSerializer.Serialize(input.Addresses), primaryAddress);
        person.Address = primaryAddress ?? addresses.FirstOrDefault();
        if (input.Addresses is not null || person.AddressesJson is not null) person.AddressesJson = JsonSerializer.Serialize(addresses);
        person.Notes = Clean(input.Notes);
        person.IsActive = input.IsActive;
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private Task<bool> LinkedToContract(Guid id, CancellationToken ct) => db.BusinessContractVersions.AnyAsync(x => x.PartnerPersonId == id, ct);
    private static bool IsPartner(Person person) => person.PartnerKind != PartnerKind.None || person.Job?.Code == "PARTNER" || person.Roles.Any(x => x.Role == "Partner");
    private static ConflictObjectResult PartnerProtected() => new(new { code = "CONTRACT_PARTNER_MANAGED_BY_CONTRACT", error = "این شخص شریک قرارداد است؛ تغییرات فقط از مسیر قرارداد مجاز است." });
}

public sealed class PersonInput
{
    public string PersonCode { get; set; } = string.Empty;
    public string? AccountingCode { get; set; }
    public PersonType PersonType { get; set; }
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
    public string? DirectorName { get; set; }
    public string? CompanyName { get; set; }
    public Guid? JobId { get; set; }
    public Guid? TitleId { get; set; }
    public Guid? NationalityId { get; set; }
    public string PreferredLanguage { get; set; } = "fa";
    public decimal CreditLimitIRR { get; set; }
    public string? Phone { get; set; }
    public string[]? PhoneNumbers { get; set; }
    public string? Mobile { get; set; }
    public string[]? MobileNumbers { get; set; }
    public string? Address { get; set; }
    public string[]? Addresses { get; set; }
    public string? Notes { get; set; }
    public bool IsActive { get; set; } = true;
}

public sealed record TitleInput(string? Name, PersonType? PersonType);
public sealed record ParameterView(Guid Id, ParameterType ParameterType, string Code, string NameFa, string NameEn, PersonType? PersonType = null);
public sealed record PersonView(Guid Id, string PersonCode, string? AccountingCode, PersonType PersonType, string? FirstName, string? LastName,
    string? CompanyName, string DisplayName, Guid? JobId, ParameterView? Job, Guid? TitleId, ParameterView? Title,
    Guid? NationalityId, ParameterView? Nationality, string PreferredLanguage, decimal CreditLimitIRR, string? Phone,
    string? Mobile, string? Address, string? Notes, bool IsActive, byte[] RowVersion)
{
    public string? DirectorName { get; init; }
    public string[] PhoneNumbers { get; init; } = [];
    public string[] MobileNumbers { get; init; } = [];
    public string[] Addresses { get; init; } = [];
    public bool IsContractPartner { get; init; }
    public static PersonView From(Person x) => From(x, false);
    public static PersonView From(Person x, bool linked) => new(x.Id, x.PersonCode, x.AccountingCode, x.PersonType, x.FirstName, x.LastName ?? x.CompanyName, x.CompanyName,
        x.DisplayName, x.JobId, Map(x.Job), x.TitleId, Map(x.Title), x.NationalityId, Map(x.Nationality), x.PreferredLanguage,
        x.CreditLimitIRR, x.Phone, x.Mobile, x.Address, x.Notes, x.IsActive, x.RowVersion) { DirectorName = x.DirectorName, PhoneNumbers = PersonNumberList.Read(x.PhoneNumbersJson, x.Phone), MobileNumbers = PersonNumberList.Read(x.MobileNumbersJson, x.Mobile),
            IsContractPartner = linked || x.PartnerKind != PartnerKind.None || x.Job?.Code == "PARTNER" || x.Roles.Any(role => role.Role == "Partner"),
            Addresses = PersonNumberList.Read(x.AddressesJson, x.Address) };
    private static ParameterView? Map(ParameterValue? x) => x is null ? null : new(x.Id, x.ParameterType, x.Code, x.NameFa, x.NameEn, x.TitlePersonType);
}

public static class PersianTextNormalizer
{
    public static string NormalizeName(string value) => string.Join(' ', value.Replace('ي', 'ی').Replace('ى', 'ی').Replace('ك', 'ک')
        .Replace('\u200c', ' ').Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries)).ToLowerInvariant();
    public static string Normalize(string value) => string.Join(' ', value.Replace('ي', 'ی').Replace('ك', 'ک').Replace('\u200c', ' ').Split(' ', StringSplitOptions.RemoveEmptyEntries)).Trim().ToLowerInvariant();
}

internal static class PersonNumberList
{
    public static string[] Read(string? json, string? primary)
    {
        string[] values;
        try { values = json is null ? [] : JsonSerializer.Deserialize<string[]>(json) ?? []; }
        catch (JsonException) { values = []; }
        return values.Append(primary ?? "").Where(x => !string.IsNullOrWhiteSpace(x)).Select(x => x.Trim()).Distinct(StringComparer.Ordinal).ToArray();
    }
}
