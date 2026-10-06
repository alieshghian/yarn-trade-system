using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using YarnTrade.Api.Security;
using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;
using YarnTrade.Api.Services;

namespace YarnTrade.Api.Controllers;

[ApiController, Route("api/attachments"), Authorize]
public sealed class AttachmentsController(AppDbContext db, AttachmentSecurityService storage) : ControllerBase
{
    [RequirePermission("commerce.upload")]
    [HttpPost]
    [EnableRateLimiting(InternetSecurity.Uploads)]
    [RequestSizeLimit(AttachmentSecurityService.MaxFileBytes)]
    public async Task<ActionResult<AttachmentMetadata>> Upload(IFormFile file, [FromForm] string entityType, [FromForm] Guid entityId,
        [FromForm] string documentType, [FromForm] string? description, CancellationToken ct)
    {
        if (Actor() is not { } uploadedBy) return Unauthorized();
        await ValidateParent(entityType, entityId, ct);
        using var validated = await storage.StageAsync(file, ct);
        var item = validated.CreateMetadata(entityType, entityId, documentType, uploadedBy, description);
        validated.Promote();
        db.Attachments.Add(item); db.AuditLogs.Add(validated.UploadAudit(item, uploadedBy));
        await db.SaveChangesAsync(ct); validated.Complete(); return Ok(AttachmentMetadata.From(item));
    }

    [RequirePermission("commerce.view")]
    [HttpGet]
    public async Task<ActionResult<List<AttachmentMetadata>>> List([FromQuery] string entityType, [FromQuery] Guid entityId, CancellationToken ct)
    {
        await ValidateParent(entityType, entityId, ct);
        var items = await db.Attachments.AsNoTracking().Where(x => x.EntityType == entityType && x.EntityId == entityId)
            .OrderByDescending(x => x.UploadedAtUtc).ToListAsync(ct);
        return Ok(items.Select(AttachmentMetadata.From));
    }

    [RequirePermission("commerce.view")]
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Download(Guid id, CancellationToken ct)
    {
        var item = await db.Attachments.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
        if (item is null) return NotFound();
        if (Actor() is not { } actor) return Unauthorized();
        await ValidateParent(item.EntityType, item.EntityId, ct);
        var stream = await storage.OpenVerifiedAsync(item, ct);
        try
        {
            db.AuditLogs.Add(AttachmentSecurityService.Audit("AttachmentDownloaded", item, actor));
            await db.SaveChangesAsync(ct);
            Response.Headers.CacheControl = "private, no-store, max-age=0";
            Response.Headers.Pragma = "no-cache";
            Response.Headers["X-Content-Type-Options"] = "nosniff";
            var downloadName = Path.GetFileNameWithoutExtension(AttachmentSecurityService.SafeOriginalName(item.OriginalFileName))
                + Path.GetExtension(item.StoredFileName);
            return File(stream, item.ContentType, downloadName);
        }
        catch { await stream.DisposeAsync(); throw; }
    }

    [RequirePermission("commerce.upload")]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var item = await db.Attachments.SingleOrDefaultAsync(x => x.Id == id, ct);
        if (item is null) return NotFound();
        if (Actor() is not { } actor) return Unauthorized();
        await ValidateParent(item.EntityType, item.EntityId, ct);
        // Validate before any filesystem access, including corrupt legacy database values.
        storage.FinalPath(item.StoredFileName);
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
        db.AuditLogs.Add(AttachmentSecurityService.Audit("AttachmentDeleted", item, actor));
        await db.SaveChangesAsync(ct);
        storage.DeleteFinal(item.StoredFileName);
        return NoContent();
    }

    private Guid? Actor() => Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) && id != Guid.Empty ? id : null;
    // Both current commerce parents share the explicit action permissions above. No guessed row ownership.
    private async Task ValidateParent(string type, Guid id, CancellationToken ct)
    {
        var exists = type switch
        {
            nameof(PurchaseOrder) => await db.PurchaseOrders.AnyAsync(x => x.Id == id, ct),
            nameof(PurchaseInvoice) => await db.PurchaseInvoices.AnyAsync(x => x.Id == id, ct),
            _ => throw new AttachmentSecurityException("ATTACHMENT_ENTITY_NOT_SUPPORTED", 400)
        };
        if (!exists) throw new AttachmentSecurityException("ATTACHMENT_ENTITY_NOT_FOUND", 404);
    }
}
