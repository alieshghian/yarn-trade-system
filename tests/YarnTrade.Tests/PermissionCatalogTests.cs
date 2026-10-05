using YarnTrade.Api.Security;

namespace YarnTrade.Tests;

public sealed class PermissionCatalogTests
{
    [Fact]
    public void Commerce_role_receives_its_workbench_but_not_user_management()
    {
        var permissions = PermissionCatalog.Defaults(["Commerce"]);

        Assert.Contains("commerce.view", permissions);
        Assert.Contains("commerce.sendToWarehouse", permissions);
        Assert.Contains("purchaseOrders.view", permissions);
        Assert.DoesNotContain("users.view", permissions);
    }

    [Fact]
    public void Orders_role_can_submit_orders_but_cannot_open_commerce()
    {
        var permissions = PermissionCatalog.Defaults(["Orders"]);

        Assert.Contains("purchaseOrders.create", permissions);
        Assert.Contains("purchaseOrders.submit", permissions);
        Assert.DoesNotContain("commerce.view", permissions);
    }

    [Fact]
    public void Administrator_receives_the_complete_catalog()
        => Assert.Equal(PermissionCatalog.All.Count, PermissionCatalog.Defaults(["Administrator"]).Count);
}
