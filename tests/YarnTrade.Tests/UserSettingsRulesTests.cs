using YarnTrade.Api.Controllers;
using YarnTrade.Api.Data.Migrations;
using Microsoft.EntityFrameworkCore.Migrations;

namespace YarnTrade.Tests;

public sealed class UserSettingsRulesTests
{
    [Fact]
    public void Migration_is_discoverable() => Assert.Equal("20260809120000_AddUserSettings", Assert.Single(typeof(AddUserSettings).GetCustomAttributes(typeof(MigrationAttribute), false).Cast<MigrationAttribute>()).Id);

    [Fact]
    public void Accepts_supported_preferences() => Assert.Null(UserSettingsRules.Validate(new("fa", 30, "dark", true, "tahoma", "large")));

    [Fact]
    public void Accepts_chinese_as_a_per_user_language() => Assert.Null(UserSettingsRules.Validate(new("zh", 30, "light", false, "vazirmatn", "normal")));

    [Theory]
    [InlineData("de", 30, "light")]
    [InlineData("fa", 0, "light")]
    [InlineData("en", 481, "light")]
    [InlineData("en", 30, "unknown")]
    public void Rejects_invalid_preferences(string language, int timeout, string theme) =>
        Assert.NotNull(UserSettingsRules.Validate(new(language, timeout, theme, false, "vazirmatn", "normal")));

    [Theory]
    [InlineData("unknown", "normal")]
    [InlineData("tahoma", "huge")]
    public void Rejects_invalid_typography(string font, string size) =>
        Assert.NotNull(UserSettingsRules.Validate(new("fa", 30, "light", false, font, size)));

    [Fact]
    public void Typography_migration_is_discoverable() => Assert.Equal("20260810120000_AddUserTypography", Assert.Single(typeof(AddUserTypography).GetCustomAttributes(typeof(MigrationAttribute), false).Cast<MigrationAttribute>()).Id);
}
