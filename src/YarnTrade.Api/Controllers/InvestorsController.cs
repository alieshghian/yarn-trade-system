using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;
using YarnTrade.Api.Security;
using YarnTrade.Api.Services;

namespace YarnTrade.Api.Controllers;

[ApiController, Route("api/investors"), Authorize]
public sealed class InvestorsController(AppDbContext db) : ControllerBase
{
    [HttpPost, RequirePermission("settings.edit")]
    public async Task<IActionResult> Create(InvestorInput input, CancellationToken ct)
    {
        if (!Valid(input)) return BadRequest(new { code = "INVESTOR_VALIDATION_FAILED" });
        return await db.Database.CreateExecutionStrategy().ExecuteAsync<IActionResult>(async () =>
        {
            await using var transaction = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync(ct) : null;
            // Lock the existing identity namespace before reserving a code. No commercial role/balance is created.
            if (db.Database.IsSqlServer())
                await db.Persons.FromSqlRaw("SELECT * FROM [Persons] WITH (UPDLOCK, HOLDLOCK)").ToListAsync(ct);
            var query = db.Database.IsSqlServer() ? db.Investors.FromSqlRaw("SELECT * FROM [Investors] WITH (UPDLOCK, HOLDLOCK)") : db.Investors;
            var last = await query.OrderByDescending(x => x.CreatedAtUtc).ThenByDescending(x => x.Id).Select(x => x.InvestorCode).FirstOrDefaultAsync(ct);
            var code = input.InvestorCode?.Trim().ToUpperInvariant();
            if (string.IsNullOrEmpty(code))
            {
                code = SerialCode.Increment(last, "INV-0001");
                while (await db.Persons.AnyAsync(x => x.PersonCode == code, ct) || await db.Investors.AnyAsync(x => x.InvestorCode == code, ct))
                    code = SerialCode.Increment(code, "INV-0001");
            }
            if (await db.Persons.AnyAsync(x => x.PersonCode == code, ct) || await db.Investors.AnyAsync(x => x.InvestorCode == code, ct))
                return Conflict(new { code = "INVESTOR_CODE_EXISTS" });
            var investor = new Investor { InvestorCode = code, LegalName = input.LegalName.Trim(), PersonType = input.PersonType, Phone = input.Phone?.Trim(), Address = input.Address?.Trim() };
            db.Investors.Add(investor);
            var identity = new Person { PersonCode = code, DisplayName = investor.LegalName, CompanyName = input.PersonType == PersonType.Company ? investor.LegalName : null,
                LastName = investor.LegalName, PersonType = input.PersonType, Phone = investor.Phone, Address = investor.Address, CapitalInvestorId = investor.Id, IsActive = false };
            db.Persons.Add(identity);
            try { await db.SaveChangesAsync(ct); if (transaction is not null) await transaction.CommitAsync(ct); }
            catch (DbUpdateException) { db.Entry(investor).State = EntityState.Detached; db.Entry(identity).State = EntityState.Detached; return Conflict(new { code = "INVESTOR_CODE_EXISTS" }); }
            return StatusCode(201, investor);
        });
    }

    internal static bool Valid(InvestorInput input) => !string.IsNullOrWhiteSpace(input.LegalName) && input.LegalName.Trim().Length <= 200
        && Enum.IsDefined(input.PersonType)
        && (input.Phone?.Length ?? 0) <= 50 && (input.Address?.Length ?? 0) <= 500
        && (input.InvestorCode is null || !string.IsNullOrWhiteSpace(input.InvestorCode) && input.InvestorCode.Trim().Length <= 30);

    [HttpPut("{id:guid}"), RequirePermission("settings.edit")]
    public Task<IActionResult> Update(Guid id, InvestorEditInput input, [FromQuery] string? rowVersion, CancellationToken ct) =>
        Mutate(id, input, rowVersion, false, ct);

    [HttpDelete("{id:guid}"), RequirePermission("settings.edit")]
    public Task<IActionResult> Delete(Guid id, [FromQuery] string? rowVersion, CancellationToken ct) =>
        Mutate(id, null, rowVersion, true, ct);

    private Task<IActionResult> Mutate(Guid id, InvestorEditInput? input, string? rowVersion, bool delete, CancellationToken ct) =>
        db.Database.CreateExecutionStrategy().ExecuteAsync<IActionResult>(async () =>
        {
            await using var transaction = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync(ct) : null;
            var contracts = new BusinessContractService(db);
            // Same contract lock acquired by posting: identity edits cannot race operational use.
            await contracts.LatestForUpdateAsync(ct);
            var investor = await db.Investors.FindAsync([id], ct);
            if (investor is null) return NotFound();
            var referenced = await db.BusinessContractVersions.AnyAsync(x => x.PrimaryInvestorId == id || x.PartnerInvestorId == id, ct);
            if (referenced && await contracts.HasOperationalTransactionsAsync(ct)) return Conflict(new { code = "INVESTOR_IDENTITY_LOCKED" });
            if (AggregateConcurrency.Apply(db, investor, rowVersion) is { } error) return error;
            var identity = await db.Persons.SingleOrDefaultAsync(x => x.CapitalInvestorId == id && x.PersonCode == investor.InvestorCode, ct);
            if (delete)
            {
                if (referenced || await db.Persons.AnyAsync(x => x.CapitalInvestorId == id && (identity == null || x.Id != identity.Id), ct) || await db.InvestorBalances.AnyAsync(x => x.InvestorId == id, ct))
                    return Conflict(new { code = "INVESTOR_REFERENCED" });
                if (identity is not null) db.Persons.Remove(identity);
                db.Investors.Remove(investor);
            }
            else
            {
                if (input is null || !Valid(new(input.LegalName, input.PersonType, input.Phone, input.Address))
                    || string.IsNullOrWhiteSpace(input.InvestorCode) || input.InvestorCode.Trim().Length > 30)
                    return BadRequest(new { code = "INVESTOR_VALIDATION_FAILED" });
                var code = input.InvestorCode.Trim().ToUpperInvariant();
                if (await db.Investors.AnyAsync(x => x.Id != id && x.InvestorCode == code, ct)
                    || await db.Persons.AnyAsync(x => x.PersonCode == code && (identity == null || x.Id != identity.Id), ct)) return Conflict(new { code = "INVESTOR_CODE_EXISTS" });
                investor.InvestorCode = code; investor.LegalName = input.LegalName.Trim(); investor.PersonType = input.PersonType;
                investor.Phone = input.Phone?.Trim(); investor.Address = input.Address?.Trim();
                if (identity is null) { identity = new Person { PersonCode = code, DisplayName = investor.LegalName, CapitalInvestorId = id, IsActive = false }; db.Persons.Add(identity); }
                identity.PersonCode = code; identity.DisplayName = investor.LegalName; identity.LastName = investor.LegalName;
                identity.CompanyName = input.PersonType == PersonType.Company ? investor.LegalName : null;
                identity.PersonType = input.PersonType; identity.Phone = investor.Phone; identity.Address = investor.Address;
            }
            try { await db.SaveChangesAsync(ct); if (transaction is not null) await transaction.CommitAsync(ct); }
            catch (DbUpdateConcurrencyException) { return AggregateConcurrency.Conflict(); }
            catch (DbUpdateException) { return Conflict(new { code = "INVESTOR_REFERENCED_OR_CODE_EXISTS" }); }
            return delete ? NoContent() : Ok(investor);
        });
}

public sealed record InvestorInput(string LegalName, PersonType PersonType, string? Phone = null, string? Address = null, string? InvestorCode = null);
public sealed record InvestorEditInput(string InvestorCode, string LegalName, PersonType PersonType, string? Phone = null, string? Address = null);
