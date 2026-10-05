using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;
using YarnTrade.Api.Services;

namespace YarnTrade.Api.Controllers;

[ApiController, Route("api/finance"), Authorize]
public sealed class FinanceController(AppDbContext db) : ControllerBase
{
    [HttpGet("money-documents")]
    public async Task<object> Documents([FromQuery] MoneyDocumentType? type, [FromQuery] Guid? personId, [FromQuery] int page = 1, [FromQuery] int pageSize = 25, CancellationToken ct = default)
    {
        var q = db.MoneyDocuments.AsNoTracking().AsQueryable();
        if (type.HasValue) q = q.Where(x => x.DocumentType == type);
        if (personId.HasValue) q = q.Where(x => x.PersonId == personId);
        var total = await q.CountAsync(ct);
        var items = await q.OrderByDescending(x => x.DocumentDate).Skip((page - 1) * pageSize).Take(Math.Clamp(pageSize, 1, 100)).ToListAsync(ct);
        return new { items, total, page, pageSize };
    }

    [HttpPost("money-documents")]
    public async Task<ActionResult<MoneyDocument>> CreateDocument(MoneyDocument document, CancellationToken ct)
    {
        document.Id = Guid.NewGuid(); document.Status = DocumentStatus.Draft;
        foreach (var line in document.Lines) { line.Id = Guid.NewGuid(); line.MoneyDocumentId = document.Id; }
        document.TotalIRR = document.Lines.Sum(x => x.AmountIRR + x.AmountUSD * x.ExchangeRate);
        document.TotalUSD = document.Lines.Sum(x => x.AmountUSD);
        db.MoneyDocuments.Add(document); await db.SaveChangesAsync(ct); return Ok(document);
    }

    [HttpPost("money-documents/{id:guid}/post")]
    public async Task<IActionResult> PostDocument(Guid id, CancellationToken ct)
    {
        var doc = await db.MoneyDocuments.Include(x => x.Lines).SingleOrDefaultAsync(x => x.Id == id, ct);
        if (doc is null) return NotFound();
        if (doc.Status != DocumentStatus.Draft) return Conflict();
        if (doc.Lines.Count == 0 || doc.Lines.Any(x => x.AmountIRR < 0 || x.AmountUSD < 0)) return BadRequest();
        doc.Status = DocumentStatus.Posted; doc.PostedAtUtc = DateTime.UtcNow;
        db.AuditLogs.Add(new AuditLog { Action = "Post", EntityName = nameof(MoneyDocument), EntityId = id.ToString() });
        await db.SaveChangesAsync(ct); return NoContent();
    }

    [HttpGet("checks")]
    public async Task<object> Checks([FromQuery] CheckStatus? status, [FromQuery] DateOnly? dueFrom, [FromQuery] DateOnly? dueTo, [FromQuery] int page = 1, [FromQuery] int pageSize = 25, CancellationToken ct = default)
    {
        var q = db.Checks.AsNoTracking().AsQueryable();
        if (status.HasValue) q = q.Where(x => x.CurrentStatus == status);
        if (dueFrom.HasValue) q = q.Where(x => x.DueDate >= dueFrom);
        if (dueTo.HasValue) q = q.Where(x => x.DueDate <= dueTo);
        var total = await q.CountAsync(ct);
        var items = await q.OrderBy(x => x.DueDate).Skip((page - 1) * pageSize).Take(Math.Clamp(pageSize, 1, 100)).ToListAsync(ct);
        return new { items, total, page, pageSize };
    }

    [HttpPost("checks")]
    public async Task<ActionResult<Check>> CreateCheck(Check item, CancellationToken ct)
    { item.Id = Guid.NewGuid(); item.CurrentStatus = CheckStatus.Received; db.Checks.Add(item); await db.SaveChangesAsync(ct); return Ok(item); }

    [HttpPost("checks/{id:guid}/transition")]
    public async Task<IActionResult> TransitionCheck(Guid id, CheckTransitionRequest input, CancellationToken ct)
    {
        var check = await db.Checks.SingleOrDefaultAsync(x => x.Id == id, ct);
        if (check is null) return NotFound();
        if (!CheckTransitions.IsAllowed(check.CurrentStatus, input.ToStatus)) return Conflict(new { error = "Invalid check status transition." });
        var from = check.CurrentStatus; check.CurrentStatus = input.ToStatus;
        db.CheckOperations.Add(new CheckOperation { CheckId = id, OperationDateUtc = DateTime.UtcNow, OperationType = input.ToStatus.ToString(), FromStatus = from, ToStatus = input.ToStatus, Description = input.Description, CreatedBy = input.UserId });
        db.AuditLogs.Add(new AuditLog { UserId = input.UserId, Action = "CheckStatusChanged", EntityName = nameof(Check), EntityId = id.ToString(), PreviousValueJson = $"\"{from}\"", NewValueJson = $"\"{input.ToStatus}\"" });
        await db.SaveChangesAsync(ct); return NoContent();
    }

    [HttpPost("settlements")]
    public async Task<ActionResult<PartnerSettlement>> CreateSettlement(PartnerSettlement item, CancellationToken ct)
    {
        item.Id = Guid.NewGuid(); item.Status = DocumentStatus.Draft; item.EquivalentIRR = BusinessCalculations.ConvertUsdToIrr(item.PaidUSD, item.ExchangeRate, 2);
        foreach (var row in item.Allocations) { row.Id = Guid.NewGuid(); row.PartnerSettlementId = item.Id; }
        db.PartnerSettlements.Add(item); await db.SaveChangesAsync(ct); return Ok(item);
    }

    [HttpPost("settlements/{id:guid}/post")]
    public async Task<IActionResult> PostSettlement(Guid id, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var item = await db.PartnerSettlements.Include(x => x.Allocations).SingleOrDefaultAsync(x => x.Id == id, ct);
        if (item is null) return NotFound();
        if (item.Status != DocumentStatus.Draft) return Conflict();
        if (Math.Abs(item.Allocations.Sum(x => x.ConvertedUSD) - item.PaidUSD) > 0.01m) return BadRequest(new { error = "Allocation total must equal paid USD." });
        db.PartnerLedgerEntries.Add(new PartnerLedgerEntry { PartnerId = item.PartnerId, EntryDate = item.SettlementDate, EntryType = "Settlement", DescriptionFa = $"تسویه {item.SettlementNumber}", DescriptionEn = $"Settlement {item.SettlementNumber}", DebitUSD = item.PaidUSD, SourceDocumentType = nameof(PartnerSettlement), SourceDocumentId = item.Id, IsPosted = true });
        item.Status = DocumentStatus.Posted;
        db.AuditLogs.Add(new AuditLog { Action = "Post", EntityName = nameof(PartnerSettlement), EntityId = id.ToString() });
        await db.SaveChangesAsync(ct); await transaction.CommitAsync(ct); return NoContent();
    }
}

public sealed record CheckTransitionRequest(CheckStatus ToStatus, Guid UserId, string? Description);

public static class CheckTransitions
{
    private static readonly Dictionary<CheckStatus, CheckStatus[]> Allowed = new()
    {
        [CheckStatus.Received] = [CheckStatus.InCashbox, CheckStatus.Returned, CheckStatus.Cancelled],
        [CheckStatus.InCashbox] = [CheckStatus.Deposited, CheckStatus.TransferredToThirdParty, CheckStatus.Returned],
        [CheckStatus.Deposited] = [CheckStatus.Collected, CheckStatus.Bounced],
        [CheckStatus.Bounced] = [CheckStatus.Deposited, CheckStatus.Replaced, CheckStatus.Returned],
        [CheckStatus.TransferredToThirdParty] = [CheckStatus.Returned, CheckStatus.Collected],
        [CheckStatus.Replaced] = [CheckStatus.Cancelled],
        [CheckStatus.Collected] = [], [CheckStatus.Returned] = [], [CheckStatus.Cancelled] = []
    };
    public static bool IsAllowed(CheckStatus from, CheckStatus to) => Allowed.TryGetValue(from, out var next) && next.Contains(to);
}
