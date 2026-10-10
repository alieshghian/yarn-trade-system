using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;
using YarnTrade.Api.Security;

namespace YarnTrade.Api.Controllers;

public sealed record NavigationNode(string Id, string? ParentId, string? RouteId, string Label, string Icon, bool Enabled);
public sealed record NavigationPreferences(string[] Order, string[] Hidden, string[] Collapsed, string[] Pinned)
{
    public static NavigationPreferences Default => new([], [], [], []);
}
public sealed record NavigationRoute(string Id, string Icon, string? Permission);
public sealed record NavigationInput(List<NavigationNode> Nodes);

public static class NavigationRules
{
    public static readonly NavigationRoute[] Routes = [
        new("dashboard", "dashboard", "dashboard.view"), new("persons", "persons", "persons.view"),
        new("brands", "brands", "brands.view"), new("formLaboratory", "formLaboratory", "formLaboratory.view"),
        new("yarns", "yarns", "yarns.view"), new("purchaseOrders", "purchaseOrders", "purchaseOrders.view"),
        new("commerce", "commerce", "commerce.view"), new("purchases", "purchases", "purchases.view"),
        new("inventory", "inventory", "inventory.view"), new("sales", "sales", "sales.view"),
        new("finance", "finance", "finance.view"), new("checks", "checks", "checks.view"),
        new("partners", "partners", "partners.view"), new("reports", "reports", "reports.view"),
        new("users", "users", "users.view"), new("dataBackup", "dataBackup", "dataBackup.view"),
        new("businessContract", "businessContract", "settings.view"), new("settings", "settings", null)
    ];
    public static List<NavigationNode> Defaults() => Routes.Select(x => new NavigationNode(x.Id,
        x.Id is "businessContract" or "settings" or "brands" or "formLaboratory" ? "definitions" : null, x.Id, "", x.Icon, true))
        .Append(new NavigationNode("definitions", null, null, "تعاریف و تنظیمات", "settings", true)).ToList();

    public static string? Validate(List<NavigationNode>? nodes)
    {
        if (nodes is null || nodes.Count > 1000) return "ساختار منو نامعتبر یا بیش از حد بزرگ است.";
        if (nodes.Any(x => x is null || string.IsNullOrWhiteSpace(x.Id) || x.Id.Length > 80
            || x.Id.Any(c => !char.IsAsciiLetterOrDigit(c) && c is not ('-' or '_'))
            || x.Label is null || x.Label.Length > 100 || x.RouteId is null && string.IsNullOrWhiteSpace(x.Label)
            || !Routes.Any(r => r.Icon == x.Icon) || x.RouteId is not null && !Routes.Any(r => r.Id == x.RouteId)))
            return "شناسه، عنوان، آیکون یا مسیر منو معتبر نیست.";
        if (nodes.Select(x => x.Id).Distinct().Count() != nodes.Count) return "شناسهٔ منو تکراری است.";
        var map = nodes.ToDictionary(x => x.Id);
        foreach (var node in nodes)
        {
            var visited = new HashSet<string> { node.Id };
            var parent = node.ParentId;
            while (parent is not null)
            {
                if (!map.TryGetValue(parent, out var ancestor)) return "منوی والد وجود ندارد.";
                if (ancestor.RouteId is not null) return "والد باید یک گروه باشد.";
                if (!visited.Add(parent)) return "رابطهٔ دوری در منو مجاز نیست.";
                parent = ancestor.ParentId;
            }
        }
        return null;
    }

    public static List<NavigationNode> Permitted(List<NavigationNode> nodes, ISet<string> permissions)
    {
        var map = nodes.ToDictionary(x => x.Id);
        var result = new HashSet<string>();
        foreach (var node in nodes.Where(x => x.Enabled && Routes.Any(r => r.Id == x.RouteId && (r.Permission is null || permissions.Contains(r.Permission)))))
        {
            var path = new List<string> { node.Id };
            var parent = node.ParentId;
            while (parent is not null && map[parent].Enabled) { path.Add(parent); parent = map[parent].ParentId; }
            if (parent is null) result.UnionWith(path);
        }
        return nodes.Where(x => result.Contains(x.Id)).ToList();
    }
    public static NavigationPreferences Reconcile(NavigationPreferences value, List<NavigationNode> nodes)
    {
        var ids = nodes.Select(x => x.Id).ToHashSet();
        var groups = nodes.Where(x => x.RouteId is null).Select(x => x.Id).ToHashSet();
        var routes = nodes.Where(x => x.RouteId is not null).Select(x => x.RouteId!).ToHashSet();
        return new(value.Order.Where(ids.Contains).Distinct().ToArray(), value.Hidden.Where(ids.Contains).Distinct().ToArray(),
            value.Collapsed.Where(groups.Contains).Distinct().ToArray(), value.Pinned.Where(routes.Contains).Distinct().ToArray());
    }
}

[ApiController, Route("api/navigation"), Authorize]
public sealed class NavigationController(AppDbContext db, PermissionService permissions) : ControllerBase
{
    private const string GlobalKey = "Navigation.Global.v1";
    private static readonly DateOnly StorageDate = new(2000, 1, 1);
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static string Revision(string? value) => value is null ? "" : Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
    private Task<SystemSetting?> Read(string key, CancellationToken ct) => db.SystemSettings.AsNoTracking().SingleOrDefaultAsync(x => x.Key == key && x.ValidFrom == StorageDate, ct);
    private static List<NavigationNode> Nodes(SystemSetting? setting)
    {
        if (setting is null) return NavigationRules.Defaults();
        var nodes = JsonSerializer.Deserialize<List<NavigationNode>>(setting.Value, Json);
        if (NavigationRules.Validate(nodes) is not null) throw new InvalidOperationException("Stored navigation is invalid; an administrator must restore the default layout.");
        return nodes!;
    }
    private async Task<Guid?> OwnUser(CancellationToken ct) => Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id)
        && await db.Users.AnyAsync(x => x.Id == id && x.IsActive, ct) ? id : null;

    [HttpGet, AuthenticatedOnly("Permitted navigation and own preferences; identity is derived from the authenticated session.")]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        var id = await OwnUser(ct); if (id is null) return Unauthorized();
        var global = await Read(GlobalKey, ct);
        var nodes = NavigationRules.Permitted(Nodes(global), await permissions.GetEffectiveAsync(User, ct));
        var own = await Read($"Navigation.User.v1.{id}", ct);
        var prefs = own is null ? NavigationPreferences.Default : JsonSerializer.Deserialize<NavigationPreferences>(own.Value, Json)!;
        return Ok(new { nodes, preferences = NavigationRules.Reconcile(prefs, nodes), rowVersion = Revision(own?.Value) });
    }

    [HttpGet("admin"), Authorize(Roles = "Administrator"), RequirePermission("settings.edit")]
    public async Task<IActionResult> Admin(CancellationToken ct)
    {
        var global = await Read(GlobalKey, ct);
        var nodes = NavigationRules.Defaults();
        var recoveryRequired = false;
        if (global is not null)
        {
            // A corrupt layout must still be recoverable through the admin UI.
            try { var saved = JsonSerializer.Deserialize<List<NavigationNode>>(global.Value, Json); if (NavigationRules.Validate(saved) is null) nodes = saved!; else recoveryRequired = true; }
            catch (JsonException) { recoveryRequired = true; }
        }
        return Ok(new { nodes,
            routes = NavigationRules.Routes, defaults = NavigationRules.Defaults(), recoveryRequired, rowVersion = Revision(global?.Value) });
    }

    [HttpPut("admin"), Authorize(Roles = "Administrator"), RequirePermission("settings.edit")]
    public async Task<IActionResult> UpdateGlobal(NavigationInput input, [FromQuery] string? rowVersion, CancellationToken ct)
    {
        if (NavigationRules.Validate(input.Nodes) is { } error) return BadRequest(new { error });
        var id = await OwnUser(ct); if (id is null) return Unauthorized();
        return await Save(GlobalKey, input.Nodes, rowVersion, id.Value, true, ct);
    }

    [HttpPut("preferences"), AuthenticatedOnly("Own navigation preferences only; caller cannot supply another user's identity.")]
    public async Task<IActionResult> UpdatePreferences(NavigationPreferences input, [FromQuery] string? rowVersion, CancellationToken ct)
    {
        var id = await OwnUser(ct); if (id is null) return Unauthorized();
        if (input.Order is null || input.Hidden is null || input.Collapsed is null || input.Pinned is null
            || input.Order.Length + input.Hidden.Length + input.Collapsed.Length + input.Pinned.Length > 4000)
            return BadRequest(new { error = "تنظیمات منو نامعتبر است." });
        var nodes = NavigationRules.Permitted(Nodes(await Read(GlobalKey, ct)), await permissions.GetEffectiveAsync(User, ct));
        var safe = NavigationRules.Reconcile(input, nodes);
        if (!safe.Order.SequenceEqual(input.Order) || !safe.Hidden.SequenceEqual(input.Hidden)
            || !safe.Collapsed.SequenceEqual(input.Collapsed) || !safe.Pinned.SequenceEqual(input.Pinned)) return Forbid();
        return await Save($"Navigation.User.v1.{id}", safe, rowVersion, id.Value, false, ct);
    }

    private Task<IActionResult> Save<T>(string key, T value, string? revision, Guid actor, bool audit, CancellationToken ct) =>
        db.Database.CreateExecutionStrategy().ExecuteAsync<IActionResult>(async () =>
    {
        await using var transaction = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync(ct) : null;
        var old = await Read(key, ct);
        if ((revision ?? "") != Revision(old?.Value)) return Conflict(new { code = "CONCURRENCY_CONFLICT" });
        var json = JsonSerializer.Serialize(value, Json);
        if (old is null) db.SystemSettings.Add(new SystemSetting { Key = key, Value = json, ValidFrom = StorageDate });
        else if (db.Database.IsRelational())
        {
            // SystemSetting has no SQL RowVersion: compare the previous JSON atomically instead of adding a column.
            var changed = await db.SystemSettings.Where(x => x.Id == old.Id && EF.Functions.Collate(x.Value, "Latin1_General_100_BIN2") == old.Value).ExecuteUpdateAsync(s => s.SetProperty(x => x.Value, json), ct);
            if (changed != 1) return Conflict(new { code = "CONCURRENCY_CONFLICT" });
        }
        else { var tracked = await db.SystemSettings.FindAsync([old.Id], ct); tracked!.Value = json; }
        if (audit) db.AuditLogs.Add(new AuditLog { UserId = actor, Action = "Navigation.Update", EntityName = "Navigation", EntityId = key, PreviousValueJson = old?.Value, NewValueJson = json });
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException) { return Conflict(new { code = "CONCURRENCY_CONFLICT" }); }
        if (transaction is not null) await transaction.CommitAsync(ct);
        return Ok(new { rowVersion = Revision(json) });
    });
}
