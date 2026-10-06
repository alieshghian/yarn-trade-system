using YarnTrade.Api.Security;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;

namespace YarnTrade.Api.Controllers;

[ApiController, Route("api/work-items"), Authorize]
public sealed class WorkItemsController(AppDbContext db, IDataScope dataScope, PermissionService permissions, IAuthorizationService authorization) : ControllerBase
{
    [RequirePermission("dashboard.view")]
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<WorkItemView>>> List(CancellationToken ct)
    {
        var userId = CurrentUserId();
        if (userId is null) return Unauthorized();
        var candidates = await BuildCandidates(ct);
        var keys = candidates.Select(x => x.Id).ToArray();
        var states = await db.UserTaskStates.AsNoTracking()
            .Where(x => x.UserId == userId && keys.Contains(x.WorkItemKey))
            .ToDictionaryAsync(x => x.WorkItemKey, ct);
        var roleNames = User.FindAll(ClaimTypes.Role).Select(x => x.Value).ToArray();
        var settings = await db.RoleTaskSettings.AsNoTracking()
            .Where(x => roleNames.Contains(x.RoleName))
            .ToListAsync(ct);

        var result = candidates.Select(item =>
        {
            states.TryGetValue(item.Id, out var state);
            var roleSla = settings.Where(x => roleNames.Contains(x.RoleName) && x.TaskCategory == item.Category).Select(x => (int?)x.SlaHours).Min();
            return item with { ViewedAtUtc = state?.ViewedAtUtc, ActionStartedAtUtc = state?.ActionStartedAtUtc, SlaHours = roleSla ?? 24 };
        }).OrderBy(x => x.ActionStartedAtUtc.HasValue).ThenBy(x => x.ViewedAtUtc.HasValue)
          .ThenByDescending(x => x.Severity == "Urgent").ThenBy(x => x.AssignedAtUtc).ToList();
        return Ok(result);
    }

    [RequirePermission("dashboard.view")]
    [HttpPost("{id}/view")]
    public async Task<IActionResult> MarkViewed(string id, CancellationToken ct)
    {
        var userId = CurrentUserId();
        if (userId is null) return Unauthorized();
        if (!await CanAccessWorkItem(id, startAction: false)) return Forbid();
        if (!await IsAvailable(id, ct)) return NotFound();
        var state = await GetOrCreateState(userId.Value, id, ct);
        state.ViewedAtUtc ??= DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return Ok(new { state.ViewedAtUtc, state.ActionStartedAtUtc });
    }

    [RequirePermission("dashboard.view")]
    [HttpPost("{id}/action")]
    public async Task<IActionResult> StartAction(string id, [FromQuery] string? rowVersion, CancellationToken ct)
    {
        var userId = CurrentUserId();
        if (userId is null) return Unauthorized();
        if (!await CanAccessWorkItem(id, startAction: true)) return Forbid();
        if (!await IsAvailable(id, ct)) return NotFound();
        PurchaseOrder? order = null;
        if (id.StartsWith("commerce-order:", StringComparison.OrdinalIgnoreCase) && Guid.TryParse(id[15..], out var orderId))
        {
            order = await db.PurchaseOrders.SingleAsync(x => x.Id == orderId, ct);
            if (AggregateConcurrency.Apply(db, order, rowVersion) is { } concurrencyError) return concurrencyError;
        }
        var state = await GetOrCreateState(userId.Value, id, ct);
        var now = DateTime.UtcNow;
        state.ViewedAtUtc ??= now;
        state.ActionStartedAtUtc ??= now;
        if (order is not null)
        {
            if (order.Status == PurchaseOrderStatus.SubmittedToCommerce)
            {
                order.Status = PurchaseOrderStatus.InCommerce;
                order.CommerceStartedAtUtc = now;
            }
        }
        await db.SaveChangesAsync(ct);
        return Ok(new { state.ViewedAtUtc, state.ActionStartedAtUtc, rowVersion = order?.RowVersion });
    }

    private async Task<List<WorkItemView>> BuildCandidates(CancellationToken ct)
    {
        var items = new List<WorkItemView>();
        var effective = await permissions.GetEffectiveAsync(User, ct);
        // دسترسی مدیریتی به فرم‌ها به معنی عضویت در کارتابل عملیاتی نیست.
        // تسک خرید فقط به کاربری تحویل می‌شود که صراحتاً نقش بازرگانی دارد.
        if (CanReceive("CommerceOrder") && effective.Contains("commerce.view"))
        {
            var orders = await db.PurchaseOrders.AsNoTracking()
                .Where(x => x.Status == PurchaseOrderStatus.SubmittedToCommerce || x.Status == PurchaseOrderStatus.InCommerce)
                .OrderByDescending(x => x.Priority).ThenBy(x => x.SubmittedAtUtc).Take(100)
                .Select(x => new { x.Id, x.OrderNumber, x.Status, x.Priority, x.SubmittedAtUtc, x.CreatedAtUtc, x.RowVersion, ItemCount = x.Items.Count })
                .ToListAsync(ct);
            items.AddRange(orders.Select(x => new WorkItemView(
                $"commerce-order:{x.Id}", "CommerceOrder", "پیگیری خرید",
                x.Status == PurchaseOrderStatus.SubmittedToCommerce ? "سفارش خرید جدید" : "سفارش در حال پیگیری",
                $"سفارش {x.OrderNumber} با {x.ItemCount} ردیف نخ برای بررسی واحد بازرگانی ارجاع شده است.",
                x.Priority == PurchaseOrderPriority.Urgent ? "Urgent" : x.Status == PurchaseOrderStatus.SubmittedToCommerce ? "Warning" : "Info",
                "commerce", x.Id, x.SubmittedAtUtc ?? x.CreatedAtUtc, null, null, 24, x.RowVersion)));
        }

        if (CanReceive("WarehouseReceipt") && effective.Contains("inventory.view"))
        {
            var receipts = await db.PurchaseInvoices.AsNoTracking()
                .Where(x => x.Status == DocumentStatus.Posted && x.PostedAtUtc != null)
                .OrderByDescending(x => x.PostedAtUtc).Take(20)
                .Select(x => new { x.Id, x.InternalNumber, x.PostedAtUtc, x.TotalPackages, x.TotalNetWeight })
                .ToListAsync(ct);
            items.AddRange(receipts.Select(x => new WorkItemView(
                $"warehouse-receipt:{x.Id}", "WarehouseReceipt", "تحویل کالا", "ورود خرید",
                $"فاکتور {x.InternalNumber} شامل {x.TotalPackages} بسته و {x.TotalNetWeight:N2} کیلوگرم برای اقدام انبار ارسال شده است.",
                "Info", "inventory", x.Id, x.PostedAtUtc!.Value, null, null, 24)));
        }
        return items;
    }

    private async Task<bool> IsAvailable(string id, CancellationToken ct)
    {
        if (id.StartsWith("commerce-order:", StringComparison.OrdinalIgnoreCase) && CanReceive("CommerceOrder") && Guid.TryParse(id[15..], out var orderId))
            return await db.PurchaseOrders.AnyAsync(x => x.Id == orderId && (x.Status == PurchaseOrderStatus.SubmittedToCommerce || x.Status == PurchaseOrderStatus.InCommerce), ct);
        if (id.StartsWith("warehouse-receipt:", StringComparison.OrdinalIgnoreCase) && CanReceive("WarehouseReceipt") && Guid.TryParse(id[18..], out var invoiceId))
            return await db.PurchaseInvoices.AnyAsync(x => x.Id == invoiceId && x.Status == DocumentStatus.Posted, ct);
        return false;
    }

    private async Task<UserTaskState> GetOrCreateState(Guid userId, string key, CancellationToken ct)
    {
        var state = await db.UserTaskStates.SingleOrDefaultAsync(x => x.UserId == userId && x.WorkItemKey == key, ct);
        if (state is not null) return state;
        state = new UserTaskState { UserId = userId, WorkItemKey = key };
        db.UserTaskStates.Add(state);
        return state;
    }

    private async Task<bool> CanAccessWorkItem(string id, bool startAction)
    {
        // These are known work-item categories, not URL-derived permissions.
        if (id.StartsWith("commerce-order:", StringComparison.OrdinalIgnoreCase))
        {
            if (!(await authorization.AuthorizeAsync(User, null, new PermissionRequirement("commerce.view"))).Succeeded) return false;
            if (startAction && !(await authorization.AuthorizeAsync(User, null, new PermissionRequirement("commerce.accept"))).Succeeded) return false;
        }
        if (id.StartsWith("warehouse-receipt:", StringComparison.OrdinalIgnoreCase) &&
            !(await authorization.AuthorizeAsync(User, null, new PermissionRequirement("inventory.view"))).Succeeded) return false;
        return true;
    }
    private Guid? CurrentUserId() => dataScope.GetUserId(User);
    private bool CanReceive(string category) => WorkItemRouting.CanReceive(User.FindAll(ClaimTypes.Role).Select(x => x.Value), category);
}

public static class WorkItemRouting
{
    private static readonly IReadOnlyDictionary<string, string> TargetRoles = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
        ["CommerceOrder"] = "Commerce",
        ["WarehouseReceipt"] = "WarehouseOperator"
    };

    public static bool CanReceive(IEnumerable<string> userRoles, string category)
        => TargetRoles.TryGetValue(category, out var targetRole)
           && userRoles.Contains(targetRole, StringComparer.OrdinalIgnoreCase);
}

public sealed record WorkItemView(string Id, string Category, string Summary, string Title, string Description,
    string Severity, string Target, Guid EntityId, DateTime AssignedAtUtc, DateTime? ViewedAtUtc,
    DateTime? ActionStartedAtUtc, int SlaHours, byte[]? RowVersion = null);
