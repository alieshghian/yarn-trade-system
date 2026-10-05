using YarnTrade.Api.Controllers;

namespace YarnTrade.Tests;

public sealed class WorkItemRoutingTests
{
    [Fact]
    public void Commerce_task_is_delivered_only_to_explicit_commerce_role()
    {
        Assert.True(WorkItemRouting.CanReceive(["Commerce"], "CommerceOrder"));
        Assert.True(WorkItemRouting.CanReceive(["Orders", "Commerce"], "CommerceOrder"));
        Assert.False(WorkItemRouting.CanReceive(["Administrator"], "CommerceOrder"));
        Assert.False(WorkItemRouting.CanReceive(["Manager"], "CommerceOrder"));
        Assert.False(WorkItemRouting.CanReceive(["Orders"], "CommerceOrder"));
    }

    [Fact]
    public void Warehouse_task_is_not_delivered_to_other_operational_roles()
    {
        Assert.True(WorkItemRouting.CanReceive(["WarehouseOperator"], "WarehouseReceipt"));
        Assert.False(WorkItemRouting.CanReceive(["Commerce"], "WarehouseReceipt"));
        Assert.False(WorkItemRouting.CanReceive(["Administrator"], "WarehouseReceipt"));
    }
}
