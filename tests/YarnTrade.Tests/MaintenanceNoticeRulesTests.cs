using Microsoft.EntityFrameworkCore.Migrations;
using YarnTrade.Api.Data.Migrations;
using YarnTrade.Api.Services;

namespace YarnTrade.Tests;

public sealed class MaintenanceNoticeRulesTests
{
    [Theory]
    [InlineData("Backup")]
    [InlineData("Restore")]
    public void Accepts_complete_message(string operation) => Assert.Null(MaintenanceNoticeRules.Validate(new(operation, "Database maintenance", 15)));

    [Theory]
    [InlineData("Delete", "Database maintenance", 15)]
    [InlineData("Backup", "x", 15)]
    [InlineData("Restore", "Database maintenance", 0)]
    [InlineData("Restore", "Database maintenance", 241)]
    public void Rejects_invalid_message(string operation, string reason, int minutes) => Assert.NotNull(MaintenanceNoticeRules.Validate(new(operation, reason, minutes)));

    [Fact]
    public void Presence_migration_is_discoverable() => Assert.Equal("20260810160000_AddUserPresenceAndMaintenanceNotices", Assert.Single(typeof(AddUserPresenceAndMaintenanceNotices).GetCustomAttributes(typeof(MigrationAttribute), false).Cast<MigrationAttribute>()).Id);
}
