using YarnTrade.Api.Services;

namespace YarnTrade.Tests;

public sealed class BackupNamingTests
{
    [Fact]
    public void Creates_standard_name_with_persian_date() => Assert.Equal("YT-14050121.zip", BackupNaming.Create("yt", new DateTime(2026, 4, 10)));

    [Theory]
    [InlineData("Y-14050121.zip")]
    [InlineData("YT-14050121.zip")]
    [InlineData("a-13991230.ZIP")]
    public void Accepts_valid_archive_names(string value) => Assert.True(BackupNaming.IsValidArchiveName(value));

    [Theory]
    [InlineData("YYY-14050121.zip")]
    [InlineData("YT_14050121.zip")]
    [InlineData("YT-14051301.zip")]
    [InlineData("YT-20260410.zip")]
    [InlineData("YT-14050121.rar")]
    [InlineData("../YT-14050121.zip")]
    public void Rejects_invalid_archive_names(string value) => Assert.False(BackupNaming.IsValidArchiveName(value));
}
