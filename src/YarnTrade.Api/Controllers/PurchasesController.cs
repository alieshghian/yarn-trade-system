using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using YarnTrade.Api.Security;
using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;
using YarnTrade.Api.Services;

namespace YarnTrade.Api.Controllers;

[ApiController, Route("api/purchases"), Authorize]
public sealed class PurchasesController(AppDbContext db, PostingService posting, XlsxPurchaseImporter importer) : ControllerBase
{
    [RequirePermission("purchases.view")]
    [HttpGet]
    public async Task<object> Search([FromQuery] string? number, [FromQuery] DateOnly? from, [FromQuery] DateOnly? to, [FromQuery] Guid? supplierId, [FromQuery] Guid? purchaseOrderId,
        [FromQuery] DocumentStatus? status, [FromQuery] int page = 1, [FromQuery] int pageSize = 25, CancellationToken ct = default)
    {
        var q = db.PurchaseInvoices.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(number)) q = q.Where(x => x.InternalNumber.Contains(number) || (x.ExternalInvoiceNumber != null && x.ExternalInvoiceNumber.Contains(number)));
        if (from.HasValue) q = q.Where(x => x.InvoiceDate >= from);
        if (to.HasValue) q = q.Where(x => x.InvoiceDate <= to);
        if (supplierId.HasValue) q = q.Where(x => x.SupplierId == supplierId);
        if (purchaseOrderId.HasValue) q = q.Where(x => x.PurchaseOrderId == purchaseOrderId);
        if (status.HasValue) q = q.Where(x => x.Status == status);
        var total = await q.CountAsync(ct);
        var items = await q.OrderByDescending(x => x.InvoiceDate).Skip((page - 1) * pageSize).Take(Math.Clamp(pageSize, 1, 100)).ToListAsync(ct);
        return new { items, total, page, pageSize };
    }

    [RequirePermission("purchases.view")]
    [HttpGet("{id:guid}")]
    public async Task<ActionResult<PurchaseInvoice>> Get(Guid id, CancellationToken ct)
    {
        var item = await db.PurchaseInvoices.AsNoTracking().Include(x => x.Items).Include(x => x.Containers).Include(x => x.Costs).SingleOrDefaultAsync(x => x.Id == id, ct);
        return item is null ? NotFound() : Ok(item);
    }

    [RequirePermission("purchases.create")]
    [HttpPost]
    public async Task<ActionResult<PurchaseInvoice>> Create(PurchaseInvoice invoice, CancellationToken ct)
    {
        invoice.Id = Guid.NewGuid(); invoice.Status = DocumentStatus.Draft;
        foreach (var item in invoice.Items) { item.Id = Guid.NewGuid(); item.PurchaseInvoiceId = invoice.Id; }
        foreach (var container in invoice.Containers) { container.Id = Guid.NewGuid(); container.PurchaseInvoiceId = invoice.Id; }
        db.PurchaseInvoices.Add(invoice); await db.SaveChangesAsync(ct); return CreatedAtAction(nameof(Get), new { id = invoice.Id }, invoice);
    }

    [RequirePermission("purchases.create")]
    [HttpPost("import"), EnableRateLimiting(InternetSecurity.Uploads)]
    [RequestSizeLimit(25_000_000)]
    public async Task<ActionResult<ImportedPurchase>> Import(IFormFile file, [FromForm] Guid supplierId, [FromForm] Guid uploadedBy, CancellationToken ct)
    {
        if (!Path.GetExtension(file.FileName).Equals(".xlsx", StringComparison.OrdinalIgnoreCase)) return BadRequest(new { error = "Only .xlsx is supported in version 1." });
        return Ok(await importer.ImportAsync(file, supplierId, uploadedBy, ct));
    }

    [RequirePermission("purchases.edit")]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, PurchaseInvoice input, [FromQuery] string? rowVersion, CancellationToken ct)
    {
        var invoice = await db.PurchaseInvoices.Include(x => x.Items).Include(x => x.Containers).Include(x => x.Costs).SingleOrDefaultAsync(x => x.Id == id, ct);
        if (invoice is null) return NotFound();
        if (AggregateConcurrency.Apply(db, invoice, rowVersion) is { } concurrencyError) return concurrencyError;
        if (invoice.Status != DocumentStatus.Draft) return Conflict(new { error = "Posted documents are immutable." });
        AggregateConcurrency.CopyEditableValues(db, invoice, input);
        invoice.Status = DocumentStatus.Draft;
        invoice.PostedAtUtc = null;
        db.PurchaseInvoiceItems.RemoveRange(invoice.Items);
        db.PurchaseContainers.RemoveRange(invoice.Containers);
        invoice.Items = input.Items.Select((x, index) => new PurchaseInvoiceItem
        {
            PurchaseInvoiceId = invoice.Id, LineNumber = index + 1, YarnItemId = x.YarnItemId,
            OriginalDescription = x.OriginalDescription.Trim(), OriginalSpecification = x.OriginalSpecification,
            Unit = string.IsNullOrWhiteSpace(x.Unit) ? "KG" : x.Unit.Trim(), NetWeight = x.NetWeight,
            GrossWeight = x.GrossWeight, PackageCount = x.PackageCount, UnitPriceUSD = x.UnitPriceUSD,
            GoodsAmountUSD = x.NetWeight * x.UnitPriceUSD, Notes = x.Notes
        }).ToList();
        invoice.Containers = input.Containers.Select(x => new PurchaseContainer
        {
            PurchaseInvoiceId = invoice.Id, ContainerNumber = x.ContainerNumber.Trim(), SealNumber = x.SealNumber,
            ContainerType = x.ContainerType, BillOfLadingNumber = x.BillOfLadingNumber, NetWeight = x.NetWeight,
            GrossWeight = x.GrossWeight, PackageCount = x.PackageCount, Notes = x.Notes
        }).ToList();
        db.PurchaseInvoiceItems.AddRange(invoice.Items);
        db.PurchaseContainers.AddRange(invoice.Containers);
        invoice.GoodsTotal = invoice.Items.Sum(x => x.GoodsAmountUSD);
        invoice.TotalNetWeight = invoice.Items.Sum(x => x.NetWeight);
        invoice.TotalGrossWeight = invoice.Items.Sum(x => x.GrossWeight);
        invoice.TotalPackages = invoice.Items.Sum(x => x.PackageCount);
        invoice.GrandTotal = invoice.GoodsTotal + invoice.InternationalFreight + invoice.OtherForeignCosts;
        var yarnIds = invoice.Items.Where(x => x.YarnItemId.HasValue).Select(x => x.YarnItemId!.Value).Distinct().ToArray();
        if (await db.YarnItems.CountAsync(x => yarnIds.Contains(x.Id) && x.IsActive, ct) != yarnIds.Length)
            return BadRequest(new { error = "یک یا چند نخ انتخاب‌شده معتبر یا فعال نیست." });
        await db.SaveChangesAsync(ct); return Ok(invoice);
    }

    [RequirePermission("purchases.post")]
    [HttpPost("{id:guid}/post")]
    public async Task<IActionResult> Post(Guid id, [FromQuery] Guid warehouseId, [FromQuery] string? rowVersion, CancellationToken ct)
    {
        var invoice = await db.PurchaseInvoices.SingleOrDefaultAsync(x => x.Id == id, ct);
        if (invoice is null) return NotFound();
        if (AggregateConcurrency.Apply(db, invoice, rowVersion) is { } concurrencyError) return concurrencyError;
        if (await db.PurchaseInvoices.AnyAsync(x => x.Id == id && x.PurchaseOrderId != null, ct))
            return Conflict(new { error = "فاکتور مرتبط با سفارش خرید باید در فرم خرید نخ توسط کاربر بازرگانی تطبیق و تأیید شود." });
        await posting.PostPurchaseAsync(id, warehouseId, ct); return Ok(new { invoice.Id, invoice.RowVersion });
    }
}
