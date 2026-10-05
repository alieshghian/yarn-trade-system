using System.Security.Cryptography;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;

namespace YarnTrade.Api.Controllers;

[ApiController, Route("api/attachments"), Authorize]
public sealed class AttachmentsController(AppDbContext db, IWebHostEnvironment environment) : ControllerBase
{
    [HttpPost]
    [RequestSizeLimit(25_000_000)]
    public async Task<ActionResult<Attachment>> Upload(IFormFile file, [FromForm] string entityType, [FromForm] Guid entityId,
        [FromForm] string documentType, [FromForm] string? description, CancellationToken ct)
    {
        if (file.Length == 0) return BadRequest(new { error = "Empty file." });
        if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uploadedBy)) return Unauthorized();
        var root = Path.Combine(environment.ContentRootPath, "App_Data", "attachments");
        Directory.CreateDirectory(root);
        var storedName = $"{Guid.NewGuid():N}{Path.GetExtension(file.FileName)}";
        var target = Path.Combine(root, storedName);
        await using (var output = System.IO.File.Create(target)) await file.CopyToAsync(output, ct);
        await using var input = System.IO.File.OpenRead(target);
        var hash = Convert.ToHexString(await SHA256.HashDataAsync(input, ct));
        var item = new Attachment
        {
            EntityType = entityType, EntityId = entityId, DocumentType = documentType, OriginalFileName = Path.GetFileName(file.FileName), StoredFileName = storedName,
            ContentType = file.ContentType, FileSize = file.Length, FileHash = hash, Description = description, UploadedBy = uploadedBy
        };
        db.Attachments.Add(item); await db.SaveChangesAsync(ct); return Ok(item);
    }

    [HttpGet]
    public Task<List<Attachment>> List([FromQuery] string entityType, [FromQuery] Guid entityId, CancellationToken ct) =>
        db.Attachments.AsNoTracking().Where(x => x.EntityType == entityType && x.EntityId == entityId)
            .OrderByDescending(x => x.UploadedAtUtc).ToListAsync(ct);

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Download(Guid id, CancellationToken ct)
    {
        var item = await db.Attachments.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
        if (item is null) return NotFound();
        var path = Path.Combine(environment.ContentRootPath, "App_Data", "attachments", item.StoredFileName);
        return System.IO.File.Exists(path) ? PhysicalFile(path, item.ContentType, item.OriginalFileName) : NotFound();
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var item = await db.Attachments.SingleOrDefaultAsync(x => x.Id == id, ct);
        if (item is null) return NotFound();
        if (item.EntityType.Equals(nameof(PurchaseInvoice), StringComparison.OrdinalIgnoreCase))
        {
            var editable = await db.PurchaseInvoices.AnyAsync(x => x.Id == item.EntityId && x.Status == DocumentStatus.Draft, ct);
            if (!editable) return Conflict(new { error = "مدرک سند قطعی‌شده قابل حذف نیست." });
        }
        if (item.EntityType.Equals(nameof(PurchaseOrder), StringComparison.OrdinalIgnoreCase))
        {
            var editable = await db.PurchaseOrders.AnyAsync(x => x.Id == item.EntityId &&
                (x.Status == PurchaseOrderStatus.SubmittedToCommerce || x.Status == PurchaseOrderStatus.InCommerce), ct);
            if (!editable) return Conflict(new { error = "مدرک سفارش تکمیل‌شده قابل حذف نیست." });
        }
        db.Attachments.Remove(item);
        await db.SaveChangesAsync(ct);
        var path = Path.Combine(environment.ContentRootPath, "App_Data", "attachments", item.StoredFileName);
        if (System.IO.File.Exists(path)) System.IO.File.Delete(path);
        return NoContent();
    }
}
