using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using YarnTrade.Api.Controllers;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;
using YarnTrade.Api.Security;

namespace YarnTrade.Tests;

public sealed partial class SecurityBaselineTests
{
    private sealed record TestEndpointMarker;
    private static void MapAuthorizationProbes(WebApplication app)
    {
        app.MapGet("/test/forgot-permission", () => Results.Ok()).RequireAuthorization().WithMetadata(new TestEndpointMarker());
        app.MapGet("/test/forgot-all-authorization", () => Results.Ok()).WithMetadata(new TestEndpointMarker());
        app.MapGet("/test/forgot-permission-role-only", () => Results.Ok()).RequireAuthorization(new AuthorizeAttribute { Roles = "Administrator" }).WithMetadata(new TestEndpointMarker());
        app.MapGet("/test/unrelated-renamed-route", () => Results.Ok()).RequirePermission("persons.view").WithMetadata(new TestEndpointMarker());
    }

    private static IReadOnlyList<RouteEndpoint> ProductionEndpoints(TestApp host) => ((IEndpointRouteBuilder)host.App).DataSources
        .SelectMany(x => x.Endpoints).OfType<RouteEndpoint>().Where(x => x.Metadata.GetMetadata<TestEndpointMarker>() is null).ToList();

    [Fact]
    public async Task A3_every_production_endpoint_has_one_explicit_security_classification()
    {
        await using var host = await CreateApp();
        var endpoints = ProductionEndpoints(host);
        PermissionAuthorization.ValidateEndpointDecisions(endpoints);
        Assert.Equal(102, endpoints.Count);
        Assert.Equal(83, endpoints.Count(x => x.Metadata.GetOrderedMetadata<RequirePermissionAttribute>().Count > 0));
        Assert.Equal(9, endpoints.Count(x => x.Metadata.GetMetadata<AuthenticatedOnlyAttribute>() is not null));
        Assert.Equal(10, endpoints.Count(x => x.Metadata.GetMetadata<IAllowAnonymous>() is not null));
        Assert.Null(typeof(PermissionCatalog).Assembly.GetType("YarnTrade.Api.Security.PermissionGuardMiddleware"));
        foreach (var endpoint in endpoints)
            foreach (var permission in endpoint.Metadata.GetOrderedMetadata<RequirePermissionAttribute>())
                Assert.Contains(PermissionCatalog.All, x => x.Key == permission.Permission);
    }

    [Fact]
    public async Task A3_unclassified_endpoints_fail_runtime_and_coverage_checks()
    {
        await using var host = await CreateApp();
        foreach (var path in new[] { "/test/forgot-permission", "/test/forgot-all-authorization", "/test/forgot-permission-role-only" })
            Assert.Equal(HttpStatusCode.Unauthorized, (await host.Client.GetAsync(path)).StatusCode);
        await CreateUser(host.App, "admin@example.test", "Administrator"); await SignIn(host, "admin@example.test");
        foreach (var path in new[] { "/test/forgot-permission", "/test/forgot-all-authorization", "/test/forgot-permission-role-only" })
            Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.GetAsync(path)).StatusCode);
        var forgotten = ((IEndpointRouteBuilder)host.App).DataSources.SelectMany(x => x.Endpoints)
            .OfType<RouteEndpoint>().Where(x => x.Metadata.GetMetadata<TestEndpointMarker>() is not null && !PermissionAuthorization.HasExplicitDecision(x));
        Assert.Equal(3, forgotten.Count());
        Assert.Throws<InvalidOperationException>(() => PermissionAuthorization.ValidateEndpointDecisions(forgotten));
        Assert.Throws<ArgumentException>(() => new RequirePermissionAttribute("persons.nonexistent"));
        // Removal of an action's metadata must fail coverage even if its URL and [Authorize] remain unchanged.
        var actual = ProductionEndpoints(host).First(x => x.Metadata.GetOrderedMetadata<RequirePermissionAttribute>().Count > 0);
        var stripped = new Endpoint(actual.RequestDelegate, new EndpointMetadataCollection(actual.Metadata.Where(x => x is not RequirePermissionAttribute)), actual.DisplayName);
        Assert.Throws<InvalidOperationException>(() => PermissionAuthorization.ValidateEndpointDecisions([stripped]));
    }

    public static IEnumerable<object[]> A3EndpointCases()
    {
        const string id = "00000000-0000-0000-0000-000000000001";
        yield return ["GET", "/api/master-data/persons", "persons.view", 200];
        yield return ["POST", "/api/master-data/persons", "persons.create", 400];
        yield return ["PUT", $"/api/master-data/persons/{id}", "persons.edit", 404];
        yield return ["DELETE", $"/api/master-data/persons/{id}", "persons.delete", 404];
        yield return ["GET", "/api/yarns", "yarns.view", 200];
        yield return ["POST", "/api/yarns", "yarns.create", 400];
        yield return ["GET", "/api/purchase-orders", "purchaseOrders.view", 200];
        yield return ["POST", $"/api/purchase-orders/{id}/submit", "purchaseOrders.submit", 404];
        yield return ["POST", $"/api/purchase-orders/{id}/accept", "commerce.accept", 404];
        yield return ["GET", "/api/commerce/workbench", "commerce.view", 200];
        yield return ["POST", $"/api/commerce/orders/{id}/invoice", "commerce.edit", 404];
        yield return ["POST", $"/api/commerce/orders/{id}/import", "commerce.upload", 400];
        yield return ["POST", $"/api/commerce/invoices/{id}/send-to-warehouse", "commerce.sendToWarehouse", 404];
        yield return ["GET", "/api/purchases", "purchases.view", 200];
        yield return ["POST", "/api/purchases", "purchases.create", 400];
        yield return ["PUT", $"/api/purchases/{id}", "purchases.edit", 400];
        yield return ["POST", $"/api/purchases/{id}/post?warehouseId=invalid", "purchases.post", 400];
        yield return ["GET", "/api/master-data/warehouses", "inventory.view", 200];
        yield return ["POST", "/api/master-data/warehouses", "inventory.edit", 400];
        yield return ["GET", "/api/sales", "sales.view", 200];
        yield return ["POST", "/api/sales", "sales.create", 400];
        yield return ["POST", $"/api/sales/{id}/post", "sales.post", 404];
        yield return ["GET", "/api/finance/money-documents", "finance.view", 200];
        yield return ["POST", $"/api/finance/money-documents/{id}/post", "finance.post", 404];
        yield return ["GET", "/api/finance/checks", "checks.view", 200];
        yield return ["POST", "/api/finance/checks", "checks.create", 400];
        yield return ["POST", $"/api/finance/checks/{id}/transition", "checks.edit", 404];
        yield return ["POST", "/api/finance/settlements", "finance.create", 400];
        yield return ["GET", $"/api/reports/partner-ledger/{id}", "reports.view", 200];
        yield return ["GET", "/api/reports/stock", "reports.view", 200];
        yield return ["GET", "/api/users", "users.view", 200];
        yield return ["POST", "/api/users", "users.create", 400];
        yield return ["PUT", $"/api/users/{id}", "users.edit", 400];
        yield return ["POST", $"/api/users/{id}/invitation", "users.create", 404];
        yield return ["POST", $"/api/users/{id}/security-reset", "users.permissions", 404];
        yield return ["GET", "/api/system-backup/info", "dataBackup.view", 200];
        yield return ["POST", "/api/system-backup/export", "dataBackup.create", 400];
        yield return ["POST", "/api/system-backup/restore", "dataBackup.restore", 400];
        yield return ["GET", "/api/attachments?entityType=PurchaseOrder&entityId=" + id, "commerce.view", 200];
        yield return ["POST", "/api/attachments", "commerce.upload", 400];
        yield return ["DELETE", $"/api/attachments/{id}", "commerce.upload", 404];
        yield return ["GET", "/api/sequence-suggestions/purchase-invoice", "purchases.view", 200];
        yield return ["GET", "/api/sequence-suggestions/sale-invoice", "sales.view", 200];
        yield return ["GET", "/api/sequence-suggestions/receipt", "finance.view", 200];
    }

    private static async Task<HttpResponseMessage> A3Request(TestApp host, string method, string path)
    {
        using var request = new HttpRequestMessage(new HttpMethod(method), path);
        if (method == "POST" && (path.EndsWith("/import") || path is "/api/attachments" or "/api/system-backup/restore"))
            request.Content = new MultipartFormDataContent();
        else if (method is "POST" or "PUT") request.Content = JsonContent.Create(new { });
        return await host.Client.SendAsync(request);
    }
    private static async Task SetPermissions(TestApp host, string email, params string[] granted)
    {
        using var scope = host.App.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var id = await UserId(host, email);
        db.UserPermissions.RemoveRange(await db.UserPermissions.Where(x => x.UserId == id).ToListAsync());
        db.UserPermissions.AddRange(PermissionCatalog.All.Select(x => new UserPermission { UserId = id, PermissionKey = x.Key, IsGranted = granted.Contains(x.Key) }));
        await db.SaveChangesAsync();
    }

    [Theory]
    [MemberData(nameof(A3EndpointCases))]
    public async Task A3_real_endpoints_enforce_401_403_and_explicit_grants(string method, string path, string permission, int expected)
    {
        await using var host = await CreateApp(new() { ["Security:Reports:PermitLimit"] = "100", ["Security:Backups:PermitLimit"] = "100" });
        Assert.Equal(HttpStatusCode.Unauthorized, (await A3Request(host, method, path)).StatusCode);
        await CreateUser(host.App, "policy@example.test", "Administrator"); await SignIn(host, "policy@example.test");
        await SetPermissions(host, "policy@example.test");
        var denied = await A3Request(host, method, path); Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
        Assert.Equal(permission, (await denied.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("permission").GetString());
        await SetPermissions(host, "policy@example.test", permission);
        var allowed = await A3Request(host, method, path);
        Assert.True((int)allowed.StatusCode == expected, $"{method} {path}: expected {expected}, got {(int)allowed.StatusCode}");
        await SetPermissions(host, "policy@example.test");
        Assert.Equal(HttpStatusCode.Forbidden, (await A3Request(host, method, path)).StatusCode);
    }

    [Fact]
    public async Task A3_view_permissions_do_not_authorize_writes_posting_or_restore()
    {
        await using var host = await CreateApp();
        await CreateUser(host.App, "readonly@example.test", "Administrator"); await SignIn(host, "readonly@example.test");
        await SetPermissions(host, "readonly@example.test", "persons.view", "purchases.view", "finance.view", "dataBackup.view");
        Assert.Equal(HttpStatusCode.OK, (await host.Client.GetAsync("/api/master-data/persons")).StatusCode);
        foreach (var item in new[] {
            ("POST", "/api/master-data/persons"),
            ("PUT", "/api/master-data/persons/00000000-0000-0000-0000-000000000001"),
            ("POST", "/api/purchases/00000000-0000-0000-0000-000000000001/post"),
            ("POST", "/api/finance/money-documents/00000000-0000-0000-0000-000000000001/post"),
            ("POST", "/api/system-backup/restore") })
            Assert.Equal(HttpStatusCode.Forbidden, (await A3Request(host, item.Item1, item.Item2)).StatusCode);
    }

    [Fact]
    public async Task A3_hidden_menu_does_not_allow_direct_API_and_route_rename_keeps_permission()
    {
        await using var host = await CreateApp(); await CreateUser(host.App, "viewer@example.test", "Customer"); await SignIn(host, "viewer@example.test");
        var access = await host.Client.GetFromJsonAsync<JsonElement>("/api/user-access");
        Assert.DoesNotContain("persons.view", access.GetProperty("permissions").EnumerateArray().Select(x => x.GetString()));
        foreach (var path in new[] { "/api/master-data/persons", "/test/unrelated-renamed-route" })
            Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.GetAsync(path)).StatusCode);
        await SetPermissions(host, "viewer@example.test", "persons.view");
        foreach (var path in new[] { "/api/master-data/persons", "/test/unrelated-renamed-route" })
            Assert.Equal(HttpStatusCode.OK, (await host.Client.GetAsync(path)).StatusCode);
        using var scope = host.App.Services.CreateScope();
        var provider = scope.ServiceProvider.GetRequiredService<IAuthorizationPolicyProvider>();
        var policy = (await provider.GetPolicyAsync("Permission:persons.view"))!;
        Assert.Contains(policy.Requirements, x => x is PermissionRequirement { Permission: "persons.view" });
    }

    [Theory]
    [InlineData("/api/users")]
    [InlineData("/api/users/00000000-0000-0000-0000-000000000001/invitation")]
    [InlineData("/api/users/00000000-0000-0000-0000-000000000001/security-reset")]
    public async Task A3_users_permissions_do_not_bypass_Administrator_role(string path)
    {
        await using var host = await CreateApp(); await CreateUser(host.App, "manager@example.test", "Manager"); await SignIn(host, "manager@example.test");
        Assert.Equal(HttpStatusCode.Forbidden, (await A3Request(host, "POST", path)).StatusCode);
    }

    [Theory]
    [InlineData("/api/system-backup/info", "GET", "dataBackup.view")]
    [InlineData("/api/system-backup/export", "POST", "dataBackup.create")]
    [InlineData("/api/system-backup/restore", "POST", "dataBackup.restore")]
    public async Task A3_backup_permissions_do_not_bypass_existing_role_boundary(string path, string method, string permission)
    {
        await using var host = await CreateApp(); await CreateUser(host.App, "customer@example.test", "Customer"); await SignIn(host, "customer@example.test");
        await SetPermissions(host, "customer@example.test", permission);
        Assert.Equal(HttpStatusCode.Forbidden, (await A3Request(host, method, path)).StatusCode);
    }

    [Fact]
    public void A3_data_scope_allows_only_proven_own_identity_and_denies_undefined_business_scope()
    {
        IDataScope scope = new CurrentUserDataScope(); var id = Guid.NewGuid();
        var user = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, id.ToString())], "test"));
        Assert.True(scope.Allows(user, new(DataScopeKind.OwnUser, id)));
        Assert.False(scope.Allows(user, new(DataScopeKind.OwnUser, Guid.NewGuid())));
        Assert.False(scope.Allows(user, new(DataScopeKind.OwnUser)));
        Assert.False(scope.Allows(user, new(DataScopeKind.BusinessRecord, id)));
        Assert.False(scope.Allows(new ClaimsPrincipal(new ClaimsIdentity(user.Claims)), new(DataScopeKind.OwnUser, id)));
    }

    [Fact]
    public async Task A3_own_account_remains_accessible_without_business_permissions()
    {
        await using var host = await CreateApp(); await CreateUser(host.App, "own@example.test", "Customer"); await CreateUser(host.App, "other@example.test", "Customer");
        await SignIn(host, "own@example.test"); await SetPermissions(host, "own@example.test");
        foreach (var path in new[] { "/api/user-access", "/api/user-settings", "/api/auth/manage/info" })
            Assert.Equal(HttpStatusCode.OK, (await host.Client.GetAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await host.Client.GetAsync("/api/presence/notice")).StatusCode);
        var otherId = await UserId(host, "other@example.test");
        var update = await host.Client.PutAsJsonAsync("/api/user-settings", new { userId = otherId, preferredLanguage = "en", sessionTimeoutMinutes = 30, theme = "system", compactMode = false, fontFamily = "vazirmatn", fontSize = "normal" });
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        using var dbScope = host.App.Services.CreateScope(); var db = dbScope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal("fa", (await db.Users.FindAsync(otherId))!.PreferredLanguage);
        Assert.Equal("en", (await db.Users.FindAsync(await UserId(host, "own@example.test")))!.PreferredLanguage);
    }

    [Fact]
    public async Task A3_permissions_are_cached_only_within_one_request_and_cannot_be_mutated_by_callers()
    {
        await using var host = await CreateApp(); await CreateUser(host.App, "cache@example.test", "Customer"); await SignIn(host, "cache@example.test");
        await SetPermissions(host, "cache@example.test", "persons.view");
        using var scope = host.App.Services.CreateScope(); var service = scope.ServiceProvider.GetRequiredService<PermissionService>();
        var principal = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, (await UserId(host, "cache@example.test")).ToString())], "test"));
        var first = await service.GetEffectiveAsync(principal); first.Clear();
        Assert.Contains("persons.view", await service.GetEffectiveAsync(principal));
        await SetPermissions(host, "cache@example.test");
        Assert.Contains("persons.view", await service.GetEffectiveAsync(principal));
        using var nextScope = host.App.Services.CreateScope();
        Assert.DoesNotContain("persons.view", await nextScope.ServiceProvider.GetRequiredService<PermissionService>().GetEffectiveAsync(principal));
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.GetAsync("/api/master-data/persons")).StatusCode);
    }
    // Literal snapshots from the approved master baseline, not computed from today's Defaults implementation.
    public static IEnumerable<object[]> A3RoleDefaults()
    {
        yield return ["Administrator", "dashboard.view|persons.view|persons.create|persons.edit|persons.delete|yarns.view|yarns.create|yarns.edit|yarns.delete|purchaseOrders.view|purchaseOrders.create|purchaseOrders.edit|purchaseOrders.delete|purchaseOrders.submit|commerce.view|commerce.accept|commerce.edit|commerce.upload|commerce.sendToWarehouse|purchases.view|purchases.create|purchases.edit|purchases.post|inventory.view|inventory.edit|sales.view|sales.create|sales.edit|sales.post|finance.view|finance.create|finance.edit|finance.post|checks.view|checks.create|checks.edit|partners.view|partners.edit|reports.view|dataBackup.view|dataBackup.create|dataBackup.restore|settings.view|settings.edit|users.view|users.create|users.edit|users.resetPassword|users.permissions"];
        yield return ["Manager", "dashboard.view|persons.view|persons.create|persons.edit|persons.delete|yarns.view|yarns.create|yarns.edit|yarns.delete|purchaseOrders.view|purchaseOrders.create|purchaseOrders.edit|purchaseOrders.delete|purchaseOrders.submit|commerce.view|commerce.accept|commerce.edit|commerce.upload|commerce.sendToWarehouse|purchases.view|purchases.create|purchases.edit|purchases.post|inventory.view|inventory.edit|sales.view|sales.create|sales.edit|sales.post|finance.view|finance.create|finance.edit|finance.post|checks.view|checks.create|checks.edit|partners.view|partners.edit|reports.view|dataBackup.view|dataBackup.create|dataBackup.restore|settings.view|settings.edit|users.view|users.create|users.edit|users.resetPassword|users.permissions"];
        yield return ["Orders", "dashboard.view|persons.view|yarns.view|purchaseOrders.view|purchaseOrders.create|purchaseOrders.edit|purchaseOrders.delete|purchaseOrders.submit"];
        yield return ["Commerce", "dashboard.view|persons.view|yarns.view|purchaseOrders.view|commerce.view|commerce.accept|commerce.edit|commerce.upload|commerce.sendToWarehouse|purchases.view|inventory.view"];
        yield return ["WarehouseOperator", "dashboard.view|persons.view|yarns.view|inventory.view|inventory.edit"];
        yield return ["FinanceOperator", "dashboard.view|persons.view|persons.create|persons.edit|persons.delete|finance.view|finance.create|finance.edit|finance.post|checks.view|checks.create|checks.edit|partners.view|reports.view"];
        yield return ["SalesOperator", "dashboard.view|persons.view|yarns.view|inventory.view|sales.view|sales.create|sales.edit|sales.post"];
        yield return ["Seller", "dashboard.view|persons.view|yarns.view|inventory.view|sales.view|sales.create|sales.edit|sales.post"];
        yield return ["Partner", "dashboard.view|partners.view|reports.view"];
        yield return ["PurchaseOperator", "dashboard.view|persons.view|yarns.view|purchases.view|purchases.create|purchases.edit|purchases.post|inventory.view"];
        yield return ["ReportViewer", "dashboard.view|purchases.view|inventory.view|sales.view|finance.view|checks.view|partners.view|reports.view"];
        yield return ["Customer", "dashboard.view"];
        yield return ["Supplier", "dashboard.view"];
        yield return ["Other", "dashboard.view"];
    }
    [Theory]
    [MemberData(nameof(A3RoleDefaults))]
    public void A3_role_defaults_preserve_approved_snapshot_plus_A5_privileged_credit_override(string role, string snapshot)
    {
        // A5 adds only this sensitive permission to the two existing all-permission roles.
        var expected = snapshot.Split('|').Concat(role is "Administrator" or "Manager" ? ["sales.creditOverride"] : Array.Empty<string>());
        Assert.Equal(expected.Order(StringComparer.OrdinalIgnoreCase), PermissionCatalog.Defaults([role]).Order(StringComparer.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task A3_work_item_scope_keeps_actor_state_isolated_and_cannot_bypass_commerce_accept()
    {
        await using var host = await CreateApp();
        await CreateUser(host.App, "commerce@example.test", "Commerce");
        await CreateUser(host.App, "other-commerce@example.test", "Commerce");
        await CreateUser(host.App, "admin@example.test", "Administrator");
        var orderId = Guid.NewGuid();
        using (var scope = host.App.Services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            // Fixture token only: InMemory does not generate SQL rowversion values.
            db.PurchaseOrders.Add(new PurchaseOrder { Id = orderId, OrderNumber = "A3-0001", OrderDate = new DateOnly(2026, 10, 6), Status = PurchaseOrderStatus.SubmittedToCommerce, RowVersion = new byte[8] });
            db.UserTaskStates.Add(new UserTaskState { UserId = await UserId(host, "other-commerce@example.test"), WorkItemKey = "commerce-order:" + orderId, ViewedAtUtc = DateTime.UtcNow.AddHours(-1) });
            await db.SaveChangesAsync();
        }
        await SignIn(host, "commerce@example.test");
        await SetPermissions(host, "commerce@example.test", "dashboard.view", "commerce.view");
        var items = await host.Client.GetFromJsonAsync<JsonElement>("/api/work-items"); Assert.Equal(1, items.GetArrayLength());
        Assert.Equal(JsonValueKind.Null, items[0].GetProperty("viewedAtUtc").ValueKind);
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.PostAsync($"/api/work-items/commerce-order:{orderId}/action", null)).StatusCode);
        using (var scope = host.App.Services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            Assert.Equal(PurchaseOrderStatus.SubmittedToCommerce, (await db.PurchaseOrders.FindAsync(orderId))!.Status);
            var actorId = await UserId(host, "commerce@example.test");
            Assert.False(await db.UserTaskStates.AnyAsync(x => x.UserId == actorId));
        }
        await SetPermissions(host, "commerce@example.test", "dashboard.view");
        Assert.Equal(0, (await host.Client.GetFromJsonAsync<JsonElement>("/api/work-items")).GetArrayLength());
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.PostAsync($"/api/work-items/commerce-order:{orderId}/view", null)).StatusCode);
        await SetPermissions(host, "commerce@example.test", "dashboard.view", "commerce.view", "commerce.accept");
        Assert.Equal(HttpStatusCode.OK, (await host.Client.PostAsync($"/api/work-items/commerce-order:{orderId}/action?rowVersion={Uri.EscapeDataString(Convert.ToBase64String(new byte[8]))}", null)).StatusCode);
        await SignIn(host, "admin@example.test");
        Assert.Equal(0, (await host.Client.GetFromJsonAsync<JsonElement>("/api/work-items")).GetArrayLength());
        Assert.Equal(HttpStatusCode.NotFound, (await host.Client.PostAsync($"/api/work-items/commerce-order:{orderId}/action", null)).StatusCode);
    }

}
