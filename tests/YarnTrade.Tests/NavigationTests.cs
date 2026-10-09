using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using YarnTrade.Api.Controllers;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;

namespace YarnTrade.Tests;

public sealed partial class SecurityBaselineTests
{
    [Fact]
    public async Task Navigation_corrupt_global_can_be_recovered_by_admin()
    {
        await using var host = await CreateApp();
        await CreateUser(host.App, "nav-recover@example.test", "Administrator"); await SignIn(host, "nav-recover@example.test");
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.SystemSettings.Add(new SystemSetting { Key = "Navigation.Global.v1", Value = "invalid-json", ValidFrom = new DateOnly(2000, 1, 1) });
            await db.SaveChangesAsync();
        }
        var view = await host.Client.GetFromJsonAsync<JsonElement>("/api/navigation/admin");
        Assert.True(view.GetProperty("recoveryRequired").GetBoolean());
        var revision = view.GetProperty("rowVersion").GetString();
        Assert.Equal(HttpStatusCode.OK, (await host.Client.PutAsJsonAsync($"/api/navigation/admin?rowVersion={revision}", new NavigationInput(NavigationRules.Defaults()))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await host.Client.GetAsync("/api/navigation")).StatusCode);
    }

    [Fact]
    public void Navigation_rules_reject_cycles_unknown_routes_and_missing_parents()
    {
        var nodes = NavigationRules.Defaults();
        Assert.Null(NavigationRules.Validate(nodes));
        nodes.Add(new("child", "definitions", null, "Child", "settings", true));
        Assert.Null(NavigationRules.Validate(nodes));
        Assert.NotNull(NavigationRules.Validate(nodes.Select(n => n.Id == "definitions" ? n with { ParentId = "child" } : n).ToList()));
        Assert.NotNull(NavigationRules.Validate([new("bad", null, "javascript:alert(1)", "Bad", "settings", true)]));
        Assert.NotNull(NavigationRules.Validate([new("bad", "missing", null, "Bad", "settings", true)]));
        Assert.NotNull(NavigationRules.Validate([new("same", null, "settings", "", "settings", true), new("same", null, "persons", "", "persons", true)]));
        var deep = new List<NavigationNode>();
        for (var i = 0; i < 80; i++) deep.Add(new($"g{i}", i == 0 ? null : $"g{i-1}", null, $"G{i}", "settings", true));
        deep.Add(new("leaf", "g79", "persons", "", "persons", true));
        Assert.Null(NavigationRules.Validate(deep));
        Assert.Equal(81, NavigationRules.Permitted(deep, new HashSet<string> { "persons.view" }).Count);
        deep[25] = deep[25] with { Enabled = false };
        Assert.Empty(NavigationRules.Permitted(deep, new HashSet<string> { "persons.view" }));
    }

    [Fact]
    public async Task Navigation_admin_persists_structure_and_rejects_stale_writes()
    {
        await using var host = await CreateApp();
        await CreateUser(host.App, "nav-admin@example.test", "Administrator"); await SignIn(host, "nav-admin@example.test");
        var nodes = NavigationRules.Defaults(); nodes.Add(new("nested", "definitions", null, "Nested", "settings", true));
        nodes = nodes.Select(n => n.Id == "persons" ? n with { ParentId = "nested" } : n).Reverse().ToList();
        var save = await host.Client.PutAsJsonAsync("/api/navigation/admin", new NavigationInput(nodes)); Assert.Equal(HttpStatusCode.OK, save.StatusCode);
        var revision = (await save.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("rowVersion").GetString();
        var global = await host.Client.GetFromJsonAsync<JsonElement>("/api/navigation/admin");
        Assert.Equal("nested", global.GetProperty("nodes").EnumerateArray().Single(n => n.GetProperty("id").GetString() == "persons").GetProperty("parentId").GetString());
        Assert.Equal(HttpStatusCode.Conflict, (await host.Client.PutAsJsonAsync("/api/navigation/admin", new NavigationInput(nodes))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await host.Client.PutAsJsonAsync($"/api/navigation/admin?rowVersion={revision}", new NavigationInput(NavigationRules.Defaults()))).StatusCode);
        var invalid = nodes.Select(n => n.Id == "definitions" ? n with { ParentId = "nested" } : n).ToList();
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.PutAsJsonAsync("/api/navigation/admin", new NavigationInput(invalid))).StatusCode);
        using var scope = host.App.Services.CreateScope();
        Assert.Equal(2, await scope.ServiceProvider.GetRequiredService<AppDbContext>().AuditLogs.CountAsync(x => x.Action == "Navigation.Update"));
    }

    [Fact]
    public async Task Navigation_two_users_have_independent_layouts_and_filtered_shortcuts()
    {
        await using var host = await CreateApp();
        await CreateUser(host.App, "nav-a@example.test", "Customer"); await CreateUser(host.App, "nav-b@example.test", "Customer");
        await SetPermissions(host, "nav-a@example.test", "persons.view"); await SetPermissions(host, "nav-b@example.test", "yarns.view");
        await SignIn(host, "nav-a@example.test");
        var a = new NavigationPreferences(["persons", "settings"], ["settings"], ["definitions"], ["persons"]);
        Assert.Equal(HttpStatusCode.OK, (await host.Client.PutAsJsonAsync("/api/navigation/preferences", a)).StatusCode);
        var first = await host.Client.GetFromJsonAsync<JsonElement>("/api/navigation");
        Assert.Equal("persons", first.GetProperty("preferences").GetProperty("pinned")[0].GetString());
        Assert.DoesNotContain(first.GetProperty("nodes").EnumerateArray(), n => n.GetProperty("routeId").GetString() == "yarns");
        await SignIn(host, "nav-b@example.test");
        var b = await host.Client.GetFromJsonAsync<JsonElement>("/api/navigation"); Assert.Empty(b.GetProperty("preferences").GetProperty("pinned").EnumerateArray());
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.PutAsJsonAsync("/api/navigation/preferences", a)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await host.Client.PutAsJsonAsync("/api/navigation/preferences", new NavigationPreferences(["yarns"], [], [], ["yarns"]))).StatusCode);
        await SignIn(host, "nav-a@example.test");
        var again = await host.Client.GetFromJsonAsync<JsonElement>("/api/navigation"); Assert.Equal("persons", again.GetProperty("preferences").GetProperty("pinned")[0].GetString());
        Assert.Equal(HttpStatusCode.Conflict, (await host.Client.PutAsJsonAsync("/api/navigation/preferences", NavigationPreferences.Default)).StatusCode);
        var revision = again.GetProperty("rowVersion").GetString();
        Assert.Equal(HttpStatusCode.OK, (await host.Client.PutAsJsonAsync($"/api/navigation/preferences?rowVersion={revision}", NavigationPreferences.Default)).StatusCode);
        Assert.Empty((await host.Client.GetFromJsonAsync<JsonElement>("/api/navigation")).GetProperty("preferences").GetProperty("hidden").EnumerateArray());
    }

    [Fact]
    public async Task Navigation_global_requires_admin_role_even_with_settings_permission()
    {
        await using var host = await CreateApp();
        Assert.Equal(HttpStatusCode.Unauthorized, (await host.Client.GetAsync("/api/navigation")).StatusCode);
        await CreateUser(host.App, "nav-manager@example.test", "Manager"); await SignIn(host, "nav-manager@example.test");
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.GetAsync("/api/navigation/admin")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.PutAsJsonAsync("/api/navigation/admin", new NavigationInput(NavigationRules.Defaults()))).StatusCode);
        await CreateUser(host.App, "nav-limited@example.test", "Administrator"); await SetPermissions(host, "nav-limited@example.test", "persons.view"); await SignIn(host, "nav-limited@example.test");
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.PutAsJsonAsync("/api/navigation/admin", new NavigationInput(NavigationRules.Defaults()))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.PutAsJsonAsync("/api/navigation/preferences", new { order = new[] { "persons" }, hidden = (string[]?)null, collapsed = Array.Empty<string>(), pinned = Array.Empty<string>() })).StatusCode);
    }
}
