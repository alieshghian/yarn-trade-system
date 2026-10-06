using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using YarnTrade.Api.Security;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;
using YarnTrade.Api.Services;

namespace YarnTrade.Api.Controllers;

[ApiController, Route("api/commerce"), Authorize]
public sealed class CommerceController(AppDbContext db, XlsxPurchaseImporter importer, PostingService posting) : ControllerBase
{
    [RequirePermission("commerce.view")]
    [HttpGet("workbench")]
    public async Task<IActionResult> Workbench(CancellationToken ct)
    {
        var orders = await db.PurchaseOrders.AsNoTracking()
            .Where(x => x.Status == PurchaseOrderStatus.SubmittedToCommerce || x.Status == PurchaseOrderStatus.InCommerce || x.Status == PurchaseOrderStatus.Completed)
            .OrderByDescending(x => x.OrderDate).ThenByDescending(x => x.CreatedAtUtc).Take(500)
            .Select(x => new
            {
                x.Id, x.OrderNumber, x.OrderDate, x.RequiredByDate, x.Priority, x.Currency, x.PreferredSupplierId,
                x.Status, ItemCount = x.Items.Count, TotalQuantity = x.Items.Sum(i => i.Quantity),
                EstimatedTotal = x.Items.Sum(i => i.EstimatedAmount ?? 0), x.CreatedAtUtc, x.RowVersion
            }).ToListAsync(ct);
        var people = await db.Persons.AsNoTracking().Where(x => x.IsActive).OrderBy(x => x.DisplayName)
            .Select(x => new { x.Id, x.DisplayName }).Take(500).ToListAsync(ct);
        var warehouses = await db.Warehouses.AsNoTracking().Where(x => x.IsActive).OrderBy(x => x.Code)
            .Select(x => new { x.Id, x.Code, x.NameFa, x.NameEn }).ToListAsync(ct);
        var yarns = await db.YarnItems.AsNoTracking().Where(x => x.IsActive).OrderBy(x => x.Code)
            .Select(x => new { x.Id, x.Code, x.NameFa, x.ComprehensiveName }).Take(500).ToListAsync(ct);
        return Ok(new { Orders = new { Items = orders, Total = orders.Count }, People = new { Items = people, Total = people.Count }, Warehouses = warehouses, Yarns = new { Items = yarns, Total = yarns.Count } });
    }

    [RequirePermission("commerce.view")]
    [HttpGet("orders/{orderId:guid}/workbench")]
    public async Task<IActionResult> OrderWorkbench(Guid orderId, CancellationToken ct)
    {
        var orderEntity = await db.PurchaseOrders.AsNoTracking().SingleOrDefaultAsync(x => x.Id == orderId &&
            (x.Status == PurchaseOrderStatus.SubmittedToCommerce || x.Status == PurchaseOrderStatus.InCommerce || x.Status == PurchaseOrderStatus.Completed), ct);
        if (orderEntity is null) return NotFound();
        var items = await (from item in db.PurchaseOrderItems.AsNoTracking()
                           join yarn in db.YarnItems.AsNoTracking() on item.YarnItemId equals yarn.Id
                           where item.PurchaseOrderId == orderId
                           orderby item.LineNumber
                           select new
                           {
                               item.Id, item.LineNumber, item.YarnItemId, YarnCode = yarn.Code, item.DescriptionSnapshot,
                               item.Quantity, item.Unit, item.EstimatedUnitPrice, item.EstimatedAmount,
                               item.RequiredSpecifications, item.Notes
                           }).ToListAsync(ct);
        var order = new
        {
            orderEntity.Id, orderEntity.OrderNumber, orderEntity.OrderDate, orderEntity.RequiredByDate,
            orderEntity.Priority, orderEntity.Currency, orderEntity.PreferredSupplierId, orderEntity.Status,
            ItemCount = items.Count, TotalQuantity = items.Sum(x => x.Quantity),
            EstimatedTotal = items.Sum(x => x.EstimatedAmount ?? 0), orderEntity.CreatedAtUtc, orderEntity.Notes, orderEntity.RowVersion, Items = items
        };
        var invoice = await db.PurchaseInvoices.AsNoTracking().Include(x => x.Items).Include(x => x.Containers)
            .SingleOrDefaultAsync(x => x.PurchaseOrderId == orderId, ct);
        var invoiceId = invoice == null ? (Guid?)null : invoice.Id;
        var attachments = await db.Attachments.AsNoTracking()
            .Where(x => (x.EntityType == nameof(PurchaseOrder) && x.EntityId == orderId) ||
                        (invoiceId.HasValue && x.EntityType == nameof(PurchaseInvoice) && x.EntityId == invoiceId.Value))
            .OrderByDescending(x => x.UploadedAtUtc).ToListAsync(ct);
        var comparison = invoice is null ? null : await Compare(orderId, invoice, ct);
        return Ok(new { Order = order, Invoice = invoice, Attachments = attachments, Comparison = comparison });
    }

    [RequirePermission("commerce.edit")]
    [HttpPost("orders/{orderId:guid}/invoice")]
    public async Task<ActionResult<CommerceInvoiceResult>> CreateInvoice(Guid orderId, [FromQuery] string? rowVersion, CancellationToken ct)
    {
        var order = await db.PurchaseOrders.Include(x => x.Items).SingleOrDefaultAsync(x => x.Id == orderId, ct);
        if (order is null) return NotFound();
        var existing = await db.PurchaseInvoices.AsNoTracking().Include(x => x.Items).Include(x => x.Containers)
            .SingleOrDefaultAsync(x => x.PurchaseOrderId == orderId, ct);
        if (existing is not null) return Ok(new CommerceInvoiceResult(existing, order.RowVersion));

        if (AggregateConcurrency.Apply(db, order, rowVersion) is { } concurrencyError) return concurrencyError;
        if (order.Status is not (PurchaseOrderStatus.SubmittedToCommerce or PurchaseOrderStatus.InCommerce))
            return Conflict(new { error = "سفارش در کارتابل بازرگانی نیست." });
        if (!order.PreferredSupplierId.HasValue)
            return BadRequest(new { error = "قبل از ایجاد فاکتور، تأمین‌کننده سفارش را مشخص کنید." });

        if (order.Status == PurchaseOrderStatus.SubmittedToCommerce)
        {
            order.Status = PurchaseOrderStatus.InCommerce;
            order.CommerceStartedAtUtc = DateTime.UtcNow;
        }
        var year = DateTime.Today.Year;
        var last = await db.PurchaseInvoices.AsNoTracking().OrderByDescending(x => x.CreatedAtUtc)
            .Select(x => x.InternalNumber).FirstOrDefaultAsync(ct);
        var invoice = new PurchaseInvoice
        {
            PurchaseOrderId = order.Id,
            InternalNumber = SerialCode.Increment(last, $"PUR-{year}-0001"),
            InvoiceDate = DateOnly.FromDateTime(DateTime.Today),
            SupplierId = order.PreferredSupplierId.Value,
            OrderNumber = order.OrderNumber,
            Currency = order.Currency,
            Status = DocumentStatus.Draft,
            Notes = order.Notes
        };
        foreach (var source in order.Items.OrderBy(x => x.LineNumber))
            invoice.Items.Add(new PurchaseInvoiceItem
            {
                PurchaseInvoiceId = invoice.Id,
                LineNumber = source.LineNumber,
                YarnItemId = source.YarnItemId,
                OriginalDescription = source.DescriptionSnapshot,
                OriginalSpecification = source.RequiredSpecifications,
                Unit = source.Unit,
                NetWeight = source.Quantity,
                UnitPriceUSD = source.EstimatedUnitPrice ?? 0,
                GoodsAmountUSD = source.EstimatedAmount ?? 0,
                Notes = source.Notes
            });
        invoice.TotalNetWeight = invoice.Items.Sum(x => x.NetWeight);
        invoice.GoodsTotal = invoice.Items.Sum(x => x.GoodsAmountUSD);
        invoice.GrandTotal = invoice.GoodsTotal;
        db.PurchaseInvoices.Add(invoice);
        await db.SaveChangesAsync(ct);
        return Ok(new CommerceInvoiceResult(invoice, order.RowVersion));
    }

    [RequirePermission("commerce.upload")]
    [HttpPost("orders/{orderId:guid}/import"), EnableRateLimiting(InternetSecurity.Uploads)]
    [RequestSizeLimit(25_000_000)]
    public async Task<ActionResult<ImportedPurchase>> Import(Guid orderId, IFormFile file, [FromQuery] string? rowVersion, CancellationToken ct)
    {
        var order = await db.PurchaseOrders.SingleOrDefaultAsync(x => x.Id == orderId, ct);
        if (order is null) return NotFound();
        if (AggregateConcurrency.Apply(db, order, rowVersion) is { } concurrencyError) return concurrencyError;
        if (!order.PreferredSupplierId.HasValue) return BadRequest(new { error = "تأمین‌کننده سفارش مشخص نشده است." });
        if (await db.PurchaseInvoices.AnyAsync(x => x.PurchaseOrderId == orderId, ct))
            return Conflict(new { error = "برای این سفارش قبلاً فاکتور خرید ایجاد شده است." });
        if (!Path.GetExtension(file.FileName).Equals(".xlsx", StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { error = "استخراج خودکار فعلاً فقط برای فایل Excel پشتیبانی می‌شود." });
        var userId = CurrentUserId();
        if (!userId.HasValue) return Unauthorized();
        // Save the imported invoice and the expected order version atomically in the final SaveChanges.
        var result = await importer.ImportAsync(file, order.PreferredSupplierId.Value, userId.Value, ct, saveChanges: false);
        result.Invoice.PurchaseOrderId = orderId;
        result.Invoice.OrderNumber = order.OrderNumber;
        if (order.Status == PurchaseOrderStatus.SubmittedToCommerce)
        {
            order.Status = PurchaseOrderStatus.InCommerce;
            order.CommerceStartedAtUtc = DateTime.UtcNow;
        }
        await db.SaveChangesAsync(ct);
        return Ok(result with { RowVersion = order.RowVersion });
    }

    [RequirePermission("commerce.sendToWarehouse")]
    [HttpPost("invoices/{invoiceId:guid}/send-to-warehouse")]
    public async Task<IActionResult> SendToWarehouse(Guid invoiceId, [FromQuery] Guid warehouseId,
        [FromQuery] string? rowVersion, [FromQuery] bool confirmInvoiceData = false, [FromQuery] bool confirmDiscrepancy = false, CancellationToken ct = default)
    {
        var invoice = await db.PurchaseInvoices.Include(x => x.Items).SingleOrDefaultAsync(x => x.Id == invoiceId, ct);
        if (invoice is null) return NotFound();
        if (AggregateConcurrency.Apply(db, invoice, rowVersion) is { } concurrencyError) return concurrencyError;
        if (!await db.Warehouses.AnyAsync(x => x.Id == warehouseId && x.IsActive, ct))
            return BadRequest(new { error = "انبار مقصد معتبر نیست." });
        if (invoice.Status != DocumentStatus.Draft)
            return Conflict(new { error = "این فاکتور قبلاً قطعی شده است." });
        if (invoice.Items.Count == 0 || invoice.Items.Any(x => !x.YarnItemId.HasValue || x.NetWeight <= 0 || string.IsNullOrWhiteSpace(x.OriginalDescription)))
            return BadRequest(new { error = "پیش از تأیید، نخ سیستم، شرح و مقدار مثبت تمام ردیف‌های فاکتور را تکمیل کنید.", code = "INVOICE_LINES_INCOMPLETE" });
        if (!confirmInvoiceData)
            return BadRequest(new { error = "تأیید صحت اطلاعات فاکتور توسط کاربر بازرگانی الزامی است.", code = "INVOICE_CONFIRMATION_REQUIRED" });

        PurchaseComparisonResult? comparison = null;
        if (invoice.PurchaseOrderId.HasValue)
        {
            comparison = await Compare(invoice.PurchaseOrderId.Value, invoice, ct);
            if (comparison.HasDiscrepancy && !confirmDiscrepancy)
                return Conflict(new { error = "فاکتور با سفارش خرید مغایرت دارد و تأیید صریح کاربر بازرگانی لازم است.", code = "ORDER_DISCREPANCY_CONFIRMATION_REQUIRED", comparison });
        }
        var userId = CurrentUserId();
        if (!userId.HasValue) return Unauthorized();
        var result = await posting.PostPurchaseAsync(invoiceId, warehouseId,
            new PurchasePostingConfirmation(userId.Value, comparison?.HasDiscrepancy == true, JsonSerializer.Serialize(comparison)), ct);
        return Ok(new { id = result.InvoiceId, rowVersion = result.RowVersion });
    }

    [RequirePermission("commerce.view")]
    [HttpGet("orders/{orderId:guid}/comparison")]
    public async Task<ActionResult<PurchaseComparisonResult>> Comparison(Guid orderId, CancellationToken ct)
    {
        var invoice = await db.PurchaseInvoices.AsNoTracking().Include(x => x.Items)
            .SingleOrDefaultAsync(x => x.PurchaseOrderId == orderId, ct);
        return invoice is null ? NotFound() : Ok(await Compare(orderId, invoice, ct));
    }

    private async Task<PurchaseComparisonResult> Compare(Guid orderId, PurchaseInvoice invoice, CancellationToken ct)
    {
        var order = await db.PurchaseOrders.AsNoTracking().Include(x => x.Items).SingleAsync(x => x.Id == orderId, ct);
        var ids = order.Items.Select(x => x.YarnItemId).Concat(invoice.Items.Where(x => x.YarnItemId.HasValue).Select(x => x.YarnItemId!.Value)).Distinct().ToArray();
        var yarns = await db.YarnItems.AsNoTracking().Where(x => ids.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
        return PurchaseComparisonService.Compare(order, invoice, yarns);
    }

    private Guid? CurrentUserId() =>
        Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;
}

// This command uses the order token; the new invoice has its own independent token.
public sealed record CommerceInvoiceResult(PurchaseInvoice Invoice, byte[] RowVersion);
