using YarnTrade.Api.Controllers;

namespace YarnTrade.Tests;

public sealed class SerialCodeTests
{
    [Theory]
    [InlineData(null, "PER-0001", "PER-0001")]
    [InlineData("", "YRN-0001", "YRN-0001")]
    [InlineData("PER-0099", "PER-0001", "PER-0100")]
    [InlineData("1405/0009", "DOC-0001", "1405/0010")]
    [InlineData("POR-1405-0027", "POR-2026-0001", "POR-1405-0028")]
    [InlineData("CUSTOM/99", "POR-2026-0001", "CUSTOM/100")]
    [InlineData("ABC", "DOC-0001", "ABC-0001")]
    [InlineData("YRN-9", "YRN-0001", "YRN-10")]
    public void Increment_preserves_prefix_and_numeric_width(string? last, string fallback, string expected)
        => Assert.Equal(expected, SerialCode.Increment(last, fallback));
}
