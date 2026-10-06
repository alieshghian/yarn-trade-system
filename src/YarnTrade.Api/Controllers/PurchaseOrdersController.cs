using YarnTrade.Api.Security;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;

namespace YarnTrade.Api.Controllers;

[ApiController, Route("api/purchase-orders"), Authorize]
public sealed class PurchaseOrdersController(AppDbContext db) : ControllerBase
{
    [RequirePermission("purchaseOrders.view")]
    [HttpGet]
    public async Task<object> List([FromQuery] PurchaseOrderStatus? status, [FromQuery] bool commerceCartable = false,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 200, CancellationToken ct = default)
    {
        var query = db.PurchaseOrders.AsNoTracking();
        if (commerceCartable)
            query = query.Where(x => x.Status == PurchaseOrderStatus.SubmittedToCommerce || x.Status == PurchaseOrderStatus.InCommerce || x.Status == PurchaseOrderStatus.Completed);
        else if (status.HasValue) query = query.Where(x => x.Status == status);

        var total = await query.CountAsync(ct);
        var take = Math.Clamp(pageSize, 1, 500);
        var rows = await query.OrderByDescending(x => x.OrderDate).ThenByDescending(x => x.CreatedAtUtc)
            .Skip((Math.Max(page, 1) - 1) * take).Take(take)
            .Select(x => new PurchaseOrderListView(
                x.Id, x.OrderNumber, x.OrderDate, x.RequiredByDate, x.Priority, x.Currency, x.PreferredSupplierId,
                x.Status, x.Items.Count, x.Items.Sum(i => i.Quantity),
                x.Items.Sum(i => i.EstimatedAmount ?? 0), x.CreatedAtUtc))
            .ToListAsync(ct);
        return new { items = rows, total, page = Math.Max(page, 1), pageSize = take };
    }

    [RequirePermission("purchaseOrders.view")]
    [HttpGet("{id:guid}")]
    public async Task<ActionResult<PurchaseOrderView>> Get(Guid id, CancellationToken ct)
    {
        var order = await db.PurchaseOrders.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
        if (order is null) return NotFound();
        var items = await (from item in db.PurchaseOrderItems.AsNoTracking()
                           join yarn in db.YarnItems.AsNoTracking() on item.YarnItemId equals yarn.Id
                           where item.PurchaseOrderId == id
                           orderby item.LineNumber
                           select new PurchaseOrderItemView(item.Id, item.LineNumber, item.YarnItemId,
                               yarn.Code, item.DescriptionSnapshot, item.Quantity, item.Unit, item.EstimatedUnitPrice,
                               item.EstimatedAmount, item.RequiredSpecifications, item.Notes)).ToListAsync(ct);
        return Ok(PurchaseOrderView.From(order, items));
    }

    [RequirePermission("purchaseOrders.create")]
    [HttpPost]
    public async Task<ActionResult<PurchaseOrderView>> Create(PurchaseOrderInput input, CancellationToken ct)
    {
        var validation = await Validate(input, null, ct);
        if (validation is not null) return BadRequest(new { error = validation });
        var userId = CurrentUserId();
        if (userId is null) return Unauthorized();
        var order = new PurchaseOrder
        {
            OrderNumber = input.OrderNumber.Trim(),
            OrderDate = input.OrderDate,
            RequiredByDate = input.RequiredByDate,
            Priority = input.Priority,
            Currency = input.Currency,
            PreferredSupplierId = input.PreferredSupplierId,
            RequestedByUserId = userId.Value,
            Status = PurchaseOrderStatus.Draft,
            Notes = Clean(input.Notes)
        };
        ApplyItems(order, input.Items);
        db.PurchaseOrders.Add(order);
        await db.SaveChangesAsync(ct);
        return CreatedAtAction(nameof(Get), new { id = order.Id }, await BuildView(order, ct));
    }

    [RequirePermission("purchaseOrders.edit")]
    [HttpPut("{id:guid}")]
    public async Task<ActionResult<PurchaseOrderView>> Update(Guid id, PurchaseOrderInput input, CancellationToken ct)
    {
        var order = await db.PurchaseOrders.Include(x => x.Items).SingleOrDefaultAsync(x => x.Id == id, ct);
        if (order is null) return NotFound();
        if (order.Status != PurchaseOrderStatus.Draft)
            return Conflict(new { error = "فقط سفارش پیش‌نویس قابل ویرایش است.", code = "ORDER_NOT_EDITABLE" });
        var validation = await Validate(input, id, ct);
        if (validation is not null) return BadRequest(new { error = validation });
        order.OrderDate = input.OrderDate;
        order.OrderNumber = input.OrderNumber.Trim();
        order.RequiredByDate = input.RequiredByDate;
        order.Priority = input.Priority;
        order.Currency = input.Currency;
        order.PreferredSupplierId = input.PreferredSupplierId;
        order.Notes = Clean(input.Notes);
        db.PurchaseOrderItems.RemoveRange(order.Items);
        order.Items.Clear();
        ApplyItems(order, input.Items);
        await db.SaveChangesAsync(ct);
        return Ok(await BuildView(order, ct));
    }

    [RequirePermission("purchaseOrders.delete")]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var order = await db.PurchaseOrders.SingleOrDefaultAsync(x => x.Id == id, ct);
        if (order is null) return NotFound();
        if (order.Status != PurchaseOrderStatus.Draft)
            return Conflict(new { error = "سفارش ارسال‌شده یا در حال پیگیری قابل حذف نیست.", code = "ORDER_NOT_DELETABLE" });
        if (await db.PurchaseInvoices.AnyAsync(x => x.PurchaseOrderId == id, ct))
            return Conflict(new { error = "برای این سفارش خرید ثبت شده و حذف آن ممکن نیست.", code = "ORDER_HAS_PURCHASE" });
        db.PurchaseOrders.Remove(order);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [RequirePermission("purchaseOrders.submit")]
    [HttpPost("{id:guid}/submit")]
    public async Task<ActionResult<PurchaseOrderView>> Submit(Guid id, CancellationToken ct)
    {
        var order = await db.PurchaseOrders.Include(x => x.Items).SingleOrDefaultAsync(x => x.Id == id, ct);
        if (order is null) return NotFound();
        if (order.Status != PurchaseOrderStatus.Draft)
            return Conflict(new { error = "این سفارش قبلاً از حالت پیش‌نویس خارج شده است." });
        if (order.Items.Count == 0) return BadRequest(new { error = "سفارش بدون ردیف کالا قابل ارسال نیست." });
        order.Status = PurchaseOrderStatus.SubmittedToCommerce;
        order.SubmittedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return Ok(await BuildView(order, ct));
    }

    [RequirePermission("commerce.accept")]
    [HttpPost("{id:guid}/accept")]
    public async Task<ActionResult<PurchaseOrderView>> Accept(Guid id, CancellationToken ct)
    {
        var order = await db.PurchaseOrders.SingleOrDefaultAsync(x => x.Id == id, ct);
        if (order is null) return NotFound();
        if (order.Status != PurchaseOrderStatus.SubmittedToCommerce)
            return Conflict(new { error = "فقط سفارش ارسال‌شده به بازرگانی قابل پذیرش است." });
        order.Status = PurchaseOrderStatus.InCommerce;
        order.CommerceStartedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return Ok(await BuildView(order, ct));
    }

    private async Task<string?> Validate(PurchaseOrderInput input, Guid? currentId, CancellationToken ct)
    {
        input.OrderNumber = input.OrderNumber.Trim();
        if (input.OrderNumber.Length is 0 or > 30) return "شماره سفارش الزامی و حداکثر ۳۰ کاراکتر است.";
        if (await db.PurchaseOrders.AnyAsync(x => x.OrderNumber == input.OrderNumber && x.Id != currentId, ct)) return "شماره سفارش تکراری است.";
        if (input.OrderDate == default) return "تاریخ سفارش الزامی است.";
        if (input.RequiredByDate.HasValue && input.RequiredByDate < input.OrderDate) return "تاریخ نیاز نمی‌تواند قبل از تاریخ سفارش باشد.";
        if (input.Items.Count == 0) return "حداقل یک ردیف نخ باید ثبت شود.";
        if (input.Items.Count > 200) return "حداکثر ۲۰۰ ردیف در هر سفارش مجاز است.";
        if (input.Items.Any(x => x.YarnItemId == Guid.Empty || x.Quantity <= 0)) return "نخ و مقدار مثبت در تمام ردیف‌ها الزامی است.";
        if (input.Items.Any(x => x.EstimatedUnitPrice < 0)) return "قیمت احتمالی نمی‌تواند منفی باشد.";
        var ids = input.Items.Select(x => x.YarnItemId).Distinct().ToArray();
        if (await db.YarnItems.CountAsync(x => ids.Contains(x.Id) && x.IsActive, ct) != ids.Length) return "یک یا چند نخ انتخاب‌شده معتبر یا فعال نیست.";
        if (input.PreferredSupplierId.HasValue && !await db.Persons.AnyAsync(x => x.Id == input.PreferredSupplierId && x.IsActive, ct))
            return "تأمین‌کننده انتخاب‌شده معتبر نیست.";
        return null;
    }

    private static void ApplyItems(PurchaseOrder order, IReadOnlyList<PurchaseOrderItemInput> inputs)
    {
        for (var index = 0; index < inputs.Count; index++)
        {
            var input = inputs[index];
            order.Items.Add(new PurchaseOrderItem
            {
                PurchaseOrderId = order.Id,
                LineNumber = index + 1,
                YarnItemId = input.YarnItemId,
                DescriptionSnapshot = input.DescriptionSnapshot.Trim(),
                Quantity = input.Quantity,
                Unit = string.IsNullOrWhiteSpace(input.Unit) ? "KG" : input.Unit.Trim(),
                EstimatedUnitPrice = input.EstimatedUnitPrice,
                EstimatedAmount = input.EstimatedUnitPrice.HasValue ? input.Quantity * input.EstimatedUnitPrice.Value : null,
                RequiredSpecifications = Clean(input.RequiredSpecifications),
                Notes = Clean(input.Notes)
            });
        }
    }

    private async Task<PurchaseOrderView> BuildView(PurchaseOrder order, CancellationToken ct)
    {
        var items = await (from item in db.PurchaseOrderItems.AsNoTracking()
                           join yarn in db.YarnItems.AsNoTracking() on item.YarnItemId equals yarn.Id
                           where item.PurchaseOrderId == order.Id
                           orderby item.LineNumber
                           select new PurchaseOrderItemView(item.Id, item.LineNumber, item.YarnItemId,
                               yarn.Code, item.DescriptionSnapshot, item.Quantity, item.Unit, item.EstimatedUnitPrice,
                               item.EstimatedAmount, item.RequiredSpecifications, item.Notes)).ToListAsync(ct);
        return PurchaseOrderView.From(order, items);
    }

    private Guid? CurrentUserId() => Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;
    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

public sealed class PurchaseOrderInput
{
    public string OrderNumber { get; set; } = string.Empty;
    public DateOnly OrderDate { get; set; }
    public DateOnly? RequiredByDate { get; set; }
    public PurchaseOrderPriority Priority { get; set; }
    public Currency Currency { get; set; } = Currency.USD;
    public Guid? PreferredSupplierId { get; set; }
    public string? Notes { get; set; }
    public List<PurchaseOrderItemInput> Items { get; set; } = [];
}

public sealed class PurchaseOrderItemInput
{
    public Guid YarnItemId { get; set; }
    public string DescriptionSnapshot { get; set; } = string.Empty;
    public decimal Quantity { get; set; }
    public string Unit { get; set; } = "KG";
    public decimal? EstimatedUnitPrice { get; set; }
    public string? RequiredSpecifications { get; set; }
    public string? Notes { get; set; }
}

public sealed record PurchaseOrderListView(Guid Id, string OrderNumber, DateOnly OrderDate, DateOnly? RequiredByDate,
    PurchaseOrderPriority Priority, Currency Currency, Guid? PreferredSupplierId, PurchaseOrderStatus Status,
    int ItemCount, decimal TotalQuantity, decimal EstimatedTotal, DateTime CreatedAtUtc);

public sealed record PurchaseOrderItemView(Guid Id, int LineNumber, Guid YarnItemId, string YarnCode,
    string DescriptionSnapshot, decimal Quantity, string Unit, decimal? EstimatedUnitPrice,
    decimal? EstimatedAmount, string? RequiredSpecifications, string? Notes);

public sealed record PurchaseOrderView(Guid Id, string OrderNumber, DateOnly OrderDate, DateOnly? RequiredByDate,
    PurchaseOrderPriority Priority, Currency Currency, Guid? PreferredSupplierId, Guid RequestedByUserId,
    PurchaseOrderStatus Status, string? Notes, DateTime? SubmittedAtUtc, DateTime? CommerceStartedAtUtc,
    DateTime? CompletedAtUtc, IReadOnlyList<PurchaseOrderItemView> Items, DateTime CreatedAtUtc)
{
    public static PurchaseOrderView From(PurchaseOrder x, IReadOnlyList<PurchaseOrderItemView> items) =>
        new(x.Id, x.OrderNumber, x.OrderDate, x.RequiredByDate, x.Priority, x.Currency, x.PreferredSupplierId,
            x.RequestedByUserId, x.Status, x.Notes, x.SubmittedAtUtc, x.CommerceStartedAtUtc, x.CompletedAtUtc, items, x.CreatedAtUtc);
}
