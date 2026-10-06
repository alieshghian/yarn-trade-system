using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;
using YarnTrade.Api.Security;

namespace YarnTrade.Api.Controllers;

[ApiController, Route("api"), Authorize]
public sealed class UsersController(AppDbContext db, UserManager<AppUser> users, RoleManager<IdentityRole<Guid>> roles,
    PermissionService permissionService, PrivateAuthentication authentication, IAuthenticationEmailSender mail, IDataScope dataScope) : ControllerBase
{
    [AuthenticatedOnly("Own account/session; record identity comes from the authenticated user.")]
    [HttpGet("user-access")]
    public async Task<ActionResult<object>> MyAccess(CancellationToken ct)
    {
        var user = await users.GetUserAsync(User);
        if (user is null) return Unauthorized();
        if (!dataScope.Allows(User, new(DataScopeKind.OwnUser, user.Id))) return Forbid();
        var userRoles = await users.GetRolesAsync(user);
        var permissions = await permissionService.GetEffectiveAsync(User, ct);
        return Ok(new { user.Id, user.Email, user.DisplayName, user.PersonId, user.PreferredLanguage, user.SessionTimeoutMinutes, user.Theme, user.CompactMode, user.FontFamily, user.FontSize, Roles = userRoles, Permissions = permissions.Order().ToArray() });
    }

    [RequirePermission("users.view")]
    [HttpGet("users"), Authorize(Roles = "Administrator,Manager")]
    public async Task<ActionResult<object>> List(CancellationToken ct)
    {
        var rows = await db.Users.AsNoTracking().OrderBy(x => x.DisplayName).Select(x => new
        {
            x.Id, x.PersonId, x.Email, x.DisplayName, x.PreferredLanguage, x.IsActive, PendingInvitation = x.PasswordHash == null
        }).ToListAsync(ct);
        var result = new List<object>();
        foreach (var row in rows)
        {
            var user = await users.FindByIdAsync(row.Id.ToString());
            result.Add(new { row.Id, row.PersonId, row.Email, row.DisplayName, row.PreferredLanguage, row.IsActive, row.PendingInvitation, Roles = user is null ? [] : await users.GetRolesAsync(user) });
        }
        return Ok(result);
    }

    [RequirePermission("users.view")]
    [HttpGet("users/catalog"), Authorize(Roles = "Administrator,Manager")]
    public async Task<ActionResult<object>> Catalog(CancellationToken ct)
    {
        string[] desiredRoles = ["Administrator", "Customer", "Seller", "Supplier", "Partner", "Manager", "Orders", "Commerce", "WarehouseOperator", "FinanceOperator", "Other"];
        var existingRoles = await roles.Roles.Select(x => x.Name!).ToListAsync(ct);
        var roleRows = desiredRoles.Where(x => existingRoles.Contains(x, StringComparer.OrdinalIgnoreCase)).ToList();
        var persons = await db.Persons.AsNoTracking().Where(x => x.IsActive).OrderBy(x => x.DisplayName)
            .Select(x => new { x.Id, x.PersonCode, x.DisplayName }).ToListAsync(ct);
        var roleDefaults = roleRows.ToDictionary(x => x, x => PermissionCatalog.Defaults([x]).Order().ToArray());
        return Ok(new { Roles = roleRows, Persons = persons, Permissions = PermissionCatalog.All, RoleDefaults = roleDefaults });
    }

    [RequirePermission("users.view")]
    [HttpGet("users/{id:guid}"), Authorize(Roles = "Administrator,Manager")]
    public async Task<ActionResult<object>> Get(Guid id, CancellationToken ct)
    {
        var user = await users.FindByIdAsync(id.ToString());
        if (user is null) return NotFound();
        var userRoles = await users.GetRolesAsync(user);
        var savedPermissions = await db.UserPermissions.AsNoTracking().Where(x => x.UserId == id).ToListAsync(ct);
        var granted = savedPermissions.Count == 0
            ? PermissionCatalog.Defaults(userRoles).Order().ToArray()
            : savedPermissions.Where(x => x.IsGranted).Select(x => x.PermissionKey).Order().ToArray();
        return Ok(new
        {
            user.Id, user.PersonId, user.Email, user.DisplayName, user.PreferredLanguage, user.IsActive, PendingInvitation = user.PasswordHash == null,
            Roles = userRoles,
            Permissions = granted
        });
    }

    [RequirePermission("users.create")]
    [HttpPost("users"), Authorize(Roles = "Administrator")]
    [Microsoft.AspNetCore.RateLimiting.EnableRateLimiting(InternetSecurity.Authentication)]
    public async Task<ActionResult<object>> Create(UserInput input, CancellationToken ct)
    {
        if (!mail.IsAvailable) throw new AuthenticationEmailUnavailableException();
        if (!string.IsNullOrWhiteSpace(input.Password)) return BadRequest(new { error = "رمز اولیه فقط توسط کاربر از طریق دعوت تعیین می‌شود." });
        if (input.Roles.Contains("Administrator", StringComparer.OrdinalIgnoreCase) && !User.IsInRole("Administrator"))
            return Forbid();
        var validation = await Validate(input, null, ct);
        if (validation is not null) return BadRequest(new { error = validation });
        var person = await db.Persons.FindAsync([input.PersonId], ct);
        var user = new AppUser
        {
            Id = Guid.NewGuid(), PersonId = input.PersonId, Email = input.Email.Trim(), UserName = input.Email.Trim(),
            EmailConfirmed = false, DisplayName = person!.DisplayName, PreferredLanguage = input.PreferredLanguage,
            IsActive = input.IsActive, LockoutEnabled = true, LockoutEnd = input.IsActive ? null : DateTimeOffset.MaxValue
        };
        var created = await users.CreateAsync(user);
        if (!created.Succeeded) return BadRequest(new { error = string.Join(" ", created.Errors.Select(x => x.Description)) });
        var roleResult = await users.AddToRolesAsync(user, input.Roles.Distinct());
        if (!roleResult.Succeeded) { await users.DeleteAsync(user); return BadRequest(new { error = string.Join(" ", roleResult.Errors.Select(x => x.Description)) }); }
        await ReplacePermissions(user.Id, input.Permissions, ct);
        await authentication.SendInvitationAsync(user, ct);
        return CreatedAtAction(nameof(Get), new { id = user.Id }, new { user.Id });
    }

    [RequirePermission("users.edit")]
    [HttpPut("users/{id:guid}"), Authorize(Roles = "Administrator,Manager")]
    public async Task<IActionResult> Update(Guid id, UserInput input, CancellationToken ct)
    {
        var user = await users.FindByIdAsync(id.ToString());
        if (user is null) return NotFound();
        var currentRoles = await users.GetRolesAsync(user);
        if (!string.Equals(user.Email, input.Email.Trim(), StringComparison.Ordinal) && !User.IsInRole("Administrator")) return Forbid();
        if ((currentRoles.Contains("Administrator") || input.Roles.Contains("Administrator", StringComparer.OrdinalIgnoreCase)) && !User.IsInRole("Administrator"))
            return Forbid();
        if (users.GetUserId(User) == id.ToString() && !input.IsActive)
            return BadRequest(new { error = "کاربر نمی‌تواند حساب خودش را غیرفعال کند." });
        var effective = await permissionService.GetEffectiveAsync(User, ct);
        if (!string.IsNullOrWhiteSpace(input.Password)) return BadRequest(new { error = "رمز فقط توسط کاربر از طریق بازیابی ایمیلی تغییر می‌کند." });
        var existingGranted = await db.UserPermissions.AsNoTracking().Where(x => x.UserId == id && x.IsGranted).Select(x => x.PermissionKey).ToListAsync(ct);
        if ((!currentRoles.ToHashSet(StringComparer.OrdinalIgnoreCase).SetEquals(input.Roles) ||
             !existingGranted.ToHashSet(StringComparer.OrdinalIgnoreCase).SetEquals(input.Permissions)) &&
            !effective.Contains("users.permissions")) return Forbid();
        var validation = await Validate(input, id, ct);
        if (validation is not null) return BadRequest(new { error = validation });
        var person = await db.Persons.FindAsync([input.PersonId], ct);
        var revokeSessions = user.IsActive != input.IsActive || user.Email != input.Email.Trim() ||
            !currentRoles.ToHashSet(StringComparer.OrdinalIgnoreCase).SetEquals(input.Roles) ||
            !existingGranted.ToHashSet(StringComparer.OrdinalIgnoreCase).SetEquals(input.Permissions);
        user.PersonId = input.PersonId; user.DisplayName = person!.DisplayName; user.PreferredLanguage = input.PreferredLanguage; user.IsActive = input.IsActive;
        user.Email = input.Email.Trim(); user.UserName = input.Email.Trim();
        // The new address must prove ownership on the next login; pending accounts still need activation.
        user.LockoutEnabled = true; user.LockoutEnd = input.IsActive ? null : DateTimeOffset.MaxValue;
        var updated = await users.UpdateAsync(user);
        if (!updated.Succeeded) return BadRequest(new { error = string.Join(" ", updated.Errors.Select(x => x.Description)) });
        await users.RemoveFromRolesAsync(user, currentRoles.Except(input.Roles));
        await users.AddToRolesAsync(user, input.Roles.Except(currentRoles));
        if (revokeSessions && !(await users.UpdateSecurityStampAsync(user)).Succeeded)
            throw new InvalidOperationException("Session revocation failed.");
        await ReplacePermissions(user.Id, input.Permissions, ct);
        return NoContent();
    }

    [RequirePermission("users.create")]
    [HttpPost("users/{id:guid}/invitation"), Authorize(Roles = "Administrator")]
    [Microsoft.AspNetCore.RateLimiting.EnableRateLimiting(InternetSecurity.Authentication)]
    public async Task<IActionResult> ReissueInvitation(Guid id, CancellationToken ct)
    {
        var user = await users.FindByIdAsync(id.ToString());
        if (user is null) return NotFound();
        if (await users.HasPasswordAsync(user)) return Conflict(new { error = "حساب قبلاً فعال شده است." });
        if (!mail.IsAvailable) throw new AuthenticationEmailUnavailableException();
        await authentication.SendInvitationAsync(user, ct);
        return NoContent();
    }

    [RequirePermission("users.permissions")]
    [HttpPost("users/{id:guid}/security-reset"), Authorize(Roles = "Administrator")]
    [Microsoft.AspNetCore.RateLimiting.EnableRateLimiting(InternetSecurity.Authentication)]
    public async Task<IActionResult> ResetSecurity(Guid id)
    {
        var user = await users.FindByIdAsync(id.ToString());
        if (user is null) return NotFound();
        if (!(await users.UpdateSecurityStampAsync(user)).Succeeded) throw new InvalidOperationException("Security reset failed.");
        return NoContent();
    }

    private async Task<string?> Validate(UserInput input, Guid? editingId, CancellationToken ct)
    {
        if (input.PersonId == Guid.Empty || !await db.Persons.AnyAsync(x => x.Id == input.PersonId && x.IsActive, ct)) return "انتخاب شخص معتبر الزامی است.";
        if (string.IsNullOrWhiteSpace(input.Email) || !System.Net.Mail.MailAddress.TryCreate(input.Email.Trim(), out var email) || email.Address != input.Email.Trim()) return "ایمیل معتبر الزامی است.";
        if (await db.Users.AnyAsync(x => x.PersonId == input.PersonId && x.Id != editingId, ct)) return "برای این شخص قبلاً کاربر تعریف شده است.";
        if (await db.Users.AnyAsync(x => x.NormalizedEmail == input.Email.Trim().ToUpper() && x.Id != editingId, ct)) return "این ایمیل قبلاً استفاده شده است.";
        if (input.Roles.Count == 0) return "حداقل یک نقش انتخاب کنید.";
        var validRoles = await roles.Roles.Select(x => x.Name!).ToListAsync(ct);
        if (input.Roles.Except(validRoles, StringComparer.OrdinalIgnoreCase).Any()) return "نقش انتخاب‌شده معتبر نیست.";
        return null;
    }

    private async Task ReplacePermissions(Guid userId, IReadOnlyCollection<string> granted, CancellationToken ct)
    {
        var valid = PermissionCatalog.All.Select(x => x.Key).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var old = await db.UserPermissions.Where(x => x.UserId == userId).ToListAsync(ct);
        db.UserPermissions.RemoveRange(old);
        db.UserPermissions.AddRange(valid.Select(key => new UserPermission { UserId = userId, PermissionKey = key, IsGranted = granted.Contains(key, StringComparer.OrdinalIgnoreCase) }));
        await db.SaveChangesAsync(ct);
    }
}

public sealed record UserInput(Guid PersonId, string Email, string? Password, string PreferredLanguage, bool IsActive,
    IReadOnlyCollection<string> Roles, IReadOnlyCollection<string> Permissions);
