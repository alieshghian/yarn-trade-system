using YarnTrade.Api.Controllers;
using System.Text.Json;

namespace YarnTrade.Tests;

public sealed class SerialCodeTests
{
    [Fact]
    public void Configurable_engine_matches_shared_frontend_vectors()
    {
        using var document = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "serial-code-cases.json")));
        var json = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
        foreach (var item in document.RootElement.GetProperty("suggestions").EnumerateArray())
        {
            var options = item.GetProperty("settings").Deserialize<CodeOptions>(json)!;
            var result = SerialCode.Suggest(item.GetProperty("values").Deserialize<string[]>()!, options);
            Assert.True(result.Value == item.GetProperty("expected").GetString(), item.GetProperty("name").GetString());
            Assert.Equal(item.GetProperty("error").GetBoolean(), result.Error is not null);
        }
        foreach (var item in document.RootElement.GetProperty("validation").EnumerateArray())
        {
            var options = item.GetProperty("settings").Deserialize<CodeOptions>(json)!;
            var error = SerialCode.ValidateCode(item.GetProperty("value").GetString()!, options, item.GetProperty("existing").Deserialize<string[]>()!);
            Assert.True((error is null) == item.GetProperty("valid").GetBoolean(), item.GetProperty("name").GetString());
        }
        Assert.Equal("AB120", SerialCode.NormalizeCode(" ab۱۲٠ "));
        Assert.Equal("ab120", SerialCode.FormatCode(" ab۱۲٠ "));
    }

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
    [Fact]
    public void Mixed_case_is_preserved_in_suggestions_but_uniqueness_is_case_insensitive()
    {
        var legacy = new CodeOptions { Mode = "alphanumeric", SuffixWidth = 1 };
        Assert.Equal("ac1", SerialCode.Suggest(["ab9"], legacy).Value);
        Assert.Equal("Duplicate code.", SerialCode.ValidateCode("ab۱۲", legacy, ["AB12"]));
        var segments = new CodeOptions
        {
            Mode = "alphanumeric", Format = "segments",
            Segments = [new CodeSegment("number", 2), new CodeSegment("letters", 1)],
            IncrementOrder = [1, 0]
        };
        Assert.Equal("11b", SerialCode.Suggest(["11a"], segments).Value);
        Assert.Equal("12a", SerialCode.Suggest(["11z"], segments).Value);
    }
}
