using YarnTrade.Api.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;
using YarnTrade.Api.Services;

namespace YarnTrade.Api.Controllers;

[ApiController, Route("api/sales"), Authorize]
public sealed class SalesController(AppDbContext db, PostingService posting) : ControllerBase
{
    [RequirePermission("sales.view")]
    [HttpGet]
    public async Task<object> Search([FromQuery] string? number, [FromQuery] Guid? customerId, [FromQuery] Guid? sellerId, [FromQuery] Guid? warehouseId,
        [FromQuery] DateOnly? from, [FromQuery] DateOnly? to, [FromQuery] int page = 1, [FromQuery] int pageSize = 25, CancellationToken ct = default)
    {
        var q = db.Sales.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(number)) q = q.Where(x => x.SaleNumber.Contains(number));
        if (customerId.HasValue) q = q.Where(x => x.CustomerId == customerId);
        if (sellerId.HasValue) q = q.Where(x => x.SellerId == sellerId);
        if (warehouseId.HasValue) q = q.Where(x => x.WarehouseId == warehouseId);
        if (from.HasValue) q = q.Where(x => x.SaleDate >= from);
        if (to.HasValue) q = q.Where(x => x.SaleDate <= to);
        var total = await q.CountAsync(ct);
        var items = await q.OrderByDescending(x => x.SaleDate).Skip((page - 1) * pageSize).Take(Math.Clamp(pageSize, 1, 100)).ToListAsync(ct);
        return new { items, total, page, pageSize };
    }

    [RequirePermission("sales.view")]
    [HttpGet("{id:guid}")]
    public async Task<ActionResult<Sale>> Get(Guid id, CancellationToken ct)
    {
        var item = await db.Sales.AsNoTracking().Include(x => x.Items).Include(x => x.PaymentSchedules).SingleOrDefaultAsync(x => x.Id == id, ct);
        return item is null ? NotFound() : Ok(item);
    }

    [RequirePermission("sales.create")]
    [HttpPost]
    public async Task<ActionResult<Sale>> Create(Sale sale, CancellationToken ct)
    {
        sale.Id = Guid.NewGuid(); sale.Status = DocumentStatus.Draft;
        foreach (var item in sale.Items) { item.Id = Guid.NewGuid(); item.SaleId = sale.Id; }
        foreach (var row in sale.PaymentSchedules) { row.Id = Guid.NewGuid(); row.SaleId = sale.Id; row.DueDaysFromSale = row.DueDate.DayNumber - sale.SaleDate.DayNumber; }
        db.Sales.Add(sale); await db.SaveChangesAsync(ct); return CreatedAtAction(nameof(Get), new { id = sale.Id }, sale);
    }

    [RequirePermission("sales.create")]
    [HttpPost("calculate-credit")]
    public async Task<ActionResult<CreditPriceResult>> CalculateCredit(CreditCalculationRequest input, CancellationToken ct)
    {
        var rules = await db.CreditRateRules.AsNoTracking().Where(x => x.IsActive && x.ValidFrom <= input.SaleDate && (x.ValidTo == null || x.ValidTo >= input.SaleDate) && (x.YarnItemId == null || x.YarnItemId == input.YarnItemId) && (x.SellerId == null || x.SellerId == input.SellerId)).ToListAsync(ct);
        return Ok(input.AgreedCreditPrice.HasValue && input.DueDate.HasValue
            ? BusinessCalculations.AnalyzeNegotiatedCreditPrice(input.CashUnitPrice, input.AgreedCreditPrice.Value, input.SaleDate, input.DueDate.Value)
            : BusinessCalculations.CalculateSystemCreditPrice(input.CashUnitPrice, input.CreditDays ?? 0, rules));
    }

    [RequirePermission("sales.post")]
    [HttpPost("{id:guid}/post")]
    public async Task<IActionResult> Post(Guid id, PostSaleRequest input, [FromQuery] string? rowVersion, CancellationToken ct)
    {
        var sale = await db.Sales.Include(x => x.Items).SingleOrDefaultAsync(x => x.Id == id, ct);
        if (sale is null) return NotFound();
        if (AggregateConcurrency.Apply(db, sale, rowVersion) is { } concurrencyError) return concurrencyError;
        try
        {
            var result = await posting.PostSaleAsync(id, User, input.CreditLimitOverrideRequested, ct);
            return Ok(new { id = result.SaleId, rowVersion = result.RowVersion });
        }
        catch (SalePostingRejectedException ex) { return StatusCode(ex.StatusCode, ex.Response); }
    }

    [RequirePermission("sales.post")]
    [HttpPost("{id:guid}/reverse")]
    public async Task<IActionResult> Reverse(Guid id, [FromQuery] string? rowVersion, CancellationToken ct)
    {
        var sale = await db.Sales.SingleOrDefaultAsync(x => x.Id == id, ct);
        if (sale is null) return NotFound();
        if (AggregateConcurrency.Apply(db, sale, rowVersion) is { } concurrencyError) return concurrencyError;
        await posting.ReverseSaleAsync(id, ct); return Ok(new { sale.Id, sale.RowVersion });
    }
}

public sealed record CreditCalculationRequest(DateOnly SaleDate, Guid? YarnItemId, Guid? SellerId, decimal CashUnitPrice, int? CreditDays, DateOnly? DueDate, decimal? AgreedCreditPrice);
public sealed record PostSaleRequest(bool CreditLimitOverrideRequested = false);
