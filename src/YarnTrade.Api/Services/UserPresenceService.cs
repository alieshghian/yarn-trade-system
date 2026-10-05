using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;

namespace YarnTrade.Api.Services;

public sealed class UserPresenceService(AppDbContext db, UserManager<AppUser> users)
{
    public static readonly TimeSpan OnlineWindow = TimeSpan.FromSeconds(90);

    public async Task RecordActivity(ClaimsPrincipal principal, CancellationToken ct = default)
    {
        if (!TryUserId(principal, out var userId)) return;
        var now = DateTime.UtcNow;
        var changed = await db.UserSessions.Where(x => x.UserId == userId && (!x.IsOnline || x.LastSeenAtUtc < now.AddSeconds(-20)))
            .ExecuteUpdateAsync(update => update.SetProperty(x => x.LastSeenAtUtc, now).SetProperty(x => x.IsOnline, true), ct);
        if (changed != 0 || await db.UserSessions.AsNoTracking().AnyAsync(x => x.UserId == userId, ct)) return;
        db.UserSessions.Add(new UserSession { UserId = userId, LastSeenAtUtc = now, IsOnline = true });
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException) { db.ChangeTracker.Clear(); }
    }

    public async Task MarkOffline(ClaimsPrincipal principal, CancellationToken ct = default)
    {
        if (!TryUserId(principal, out var userId)) return;
        await db.UserSessions.Where(x => x.UserId == userId).ExecuteUpdateAsync(update => update.SetProperty(x => x.IsOnline, false), ct);
    }

    public async Task<List<OnlineUserView>> GetOtherOnlineUsers(ClaimsPrincipal principal, CancellationToken ct = default)
    {
        if (!TryUserId(principal, out var currentUserId)) return [];
        var threshold = DateTime.UtcNow.Subtract(OnlineWindow);
        return await (from session in db.UserSessions.AsNoTracking()
                      join user in db.Users.AsNoTracking() on session.UserId equals user.Id
                      where session.UserId != currentUserId && user.IsActive && session.IsOnline && session.LastSeenAtUtc >= threshold
                      orderby user.DisplayName
                      select new OnlineUserView(user.Id, user.DisplayName, user.Email ?? string.Empty, session.LastSeenAtUtc)).ToListAsync(ct);
    }

    public async Task<MaintenanceNoticeView?> CurrentNotice(ClaimsPrincipal principal, CancellationToken ct = default)
    {
        if (!TryUserId(principal, out var currentUserId)) return null;
        var now = DateTime.UtcNow;
        return await db.MaintenanceNotices.AsNoTracking().Where(x => x.RequestedByUserId != currentUserId && x.ExpiresAtUtc > now)
            .OrderByDescending(x => x.CreatedAtUtc).Select(x => new MaintenanceNoticeView(x.Id, x.RequesterName, x.RequesterRoles, x.Operation, x.Reason, x.EstimatedMinutes, x.CreatedAtUtc, x.ExpiresAtUtc)).FirstOrDefaultAsync(ct);
    }

    public async Task<MaintenanceNoticeView> CreateNotice(ClaimsPrincipal principal, MaintenanceNoticeInput input, CancellationToken ct = default)
    {
        var validation = MaintenanceNoticeRules.Validate(input);
        if (validation is not null) throw new ArgumentException(validation);
        var user = await users.GetUserAsync(principal) ?? throw new UnauthorizedAccessException();
        var roles = await users.GetRolesAsync(user);
        var now = DateTime.UtcNow;
        var item = new MaintenanceNotice
        {
            RequestedByUserId = user.Id, RequesterName = user.DisplayName, RequesterRoles = string.Join(", ", roles),
            Operation = input.Operation, Reason = input.Reason.Trim(), EstimatedMinutes = input.EstimatedMinutes,
            CreatedAtUtc = now, ExpiresAtUtc = now.AddMinutes(input.EstimatedMinutes + 30)
        };
        db.MaintenanceNotices.Add(item); await db.SaveChangesAsync(ct);
        return new(item.Id, item.RequesterName, item.RequesterRoles, item.Operation, item.Reason, item.EstimatedMinutes, item.CreatedAtUtc, item.ExpiresAtUtc);
    }

    public async Task CompleteNotices(ClaimsPrincipal principal, CancellationToken ct = default)
    {
        if (!TryUserId(principal, out var userId)) return;
        var now = DateTime.UtcNow;
        await db.MaintenanceNotices.Where(x => x.RequestedByUserId == userId && x.ExpiresAtUtc > now)
            .ExecuteUpdateAsync(update => update.SetProperty(x => x.ExpiresAtUtc, now), ct);
    }

    private static bool TryUserId(ClaimsPrincipal principal, out Guid id) => Guid.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out id);
}

public sealed record OnlineUserView(Guid Id, string DisplayName, string Email, DateTime LastSeenAtUtc);
public sealed record MaintenanceNoticeInput(string Operation, string Reason, int EstimatedMinutes);
public sealed record MaintenanceNoticeView(Guid Id, string RequesterName, string RequesterRoles, string Operation, string Reason, int EstimatedMinutes, DateTime CreatedAtUtc, DateTime ExpiresAtUtc);

public static class MaintenanceNoticeRules
{
    public static string? Validate(MaintenanceNoticeInput input)
    {
        if (input.Operation is not ("Backup" or "Restore")) return "نوع عملیات معتبر نیست.";
        if (string.IsNullOrWhiteSpace(input.Reason) || input.Reason.Trim().Length is < 5 or > 500) return "دلیل خروج باید بین ۵ تا ۵۰۰ نویسه باشد.";
        if (input.EstimatedMinutes is < 1 or > 240) return "مدت زمان تقریبی باید بین ۱ تا ۲۴۰ دقیقه باشد.";
        return null;
    }
}

public sealed class UserPresenceMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, UserPresenceService presence)
    {
        if (context.User.Identity?.IsAuthenticated == true) await presence.RecordActivity(context.User, context.RequestAborted);
        await next(context);
    }
}
