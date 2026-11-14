using System.Net;
using System.Text;
using Microsoft.Extensions.Configuration;
using YarnTrade.Api.Services;

namespace YarnTrade.Tests;

public sealed class LabelTranslationTests
{
    [Fact]
    public async Task Keyless_provider_validates_both_languages_and_caches_only_complete_results()
    {
        var handler = new MyMemoryHandler();
        using var client = new HttpClient(handler);
        using var service = new LabelTranslationService(new Factory(client), MyMemoryConfig());
        var result = await service.Translate("عنوان تازه", "fa", default);
        Assert.Equal("New label", result["en"]);
        Assert.Equal("新标签", result["zh"]);
        await service.Translate("عنوان تازه", "fa", default);
        Assert.Equal(2, handler.Calls);
        handler.QuotaExceeded = true;
        Assert.Equal("TRANSLATION_PROVIDER_UNAVAILABLE", (await Assert.ThrowsAsync<LabelTranslationException>(() => service.Translate("عنوان دیگر", "fa", default))).Message);
        handler.QuotaExceeded = false;
        Assert.Equal(2, (await service.Translate("عنوان دیگر", "fa", default)).Count);
        Assert.Equal(5, handler.Calls);
        Assert.Equal("INVALID_TRANSLATION_INPUT", (await Assert.ThrowsAsync<LabelTranslationException>(() => service.Translate(new string('组', 161), "zh", default))).Message);
    }

    [Fact]
    public async Task Live_keyless_provider_smoke_when_explicitly_enabled()
    {
        if (Environment.GetEnvironmentVariable("LABEL_TRANSLATION_LIVE") != "1") return;
        using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
        using var service = new LabelTranslationService(new Factory(client), MyMemoryConfig());
        var translated = await service.Translate("مدیریت گروه کالا", "fa", default);
        Assert.False(string.IsNullOrWhiteSpace(translated["en"]));
        Assert.Matches("[\\u4e00-\\u9fff]", translated["zh"]);
        Assert.DoesNotContain("æ", translated["zh"]);
    }

    private static IConfiguration MyMemoryConfig() => new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Translation:Enabled"] = "true", ["Translation:Provider"] = "MyMemory" }).Build();
    [Fact]
    public async Task Keyless_provider_repairs_verified_utf8_latin1_mismatch()
    {
        using var client = new HttpClient(new MyMemoryHandler { BrokenEncoding = true });
        using var service = new LabelTranslationService(new Factory(client), MyMemoryConfig());
        var result = await service.Translate("گروه جدید", "fa", default);
        Assert.Equal("新标签", result["zh"]);
        Assert.Equal("New label", result["en"]);
    }
    private sealed class MyMemoryHandler : HttpMessageHandler
    {
        public int Calls; public bool QuotaExceeded; public bool BrokenEncoding;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Calls++;
            Assert.Equal("api.mymemory.translated.net", request.RequestUri!.Host);
            Assert.Equal("/get", request.RequestUri.AbsolutePath);
            Assert.False(request.Headers.Contains("Ocp-Apim-Subscription-Key"));
            var chinese = Uri.UnescapeDataString(request.RequestUri.Query).Contains("fa|zh-CN");
            var translatedText = chinese ? "新标签" : "New label";
            if (chinese && BrokenEncoding) translatedText = Encoding.Latin1.GetString(Encoding.UTF8.GetBytes(translatedText));
            var content = System.Text.Json.JsonSerializer.Serialize(new { responseStatus = QuotaExceeded ? 403 : 200, responseData = new { translatedText } });
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(content, Encoding.UTF8, "application/json") });
        }
    }

    [Fact]
    public async Task Provider_is_server_only_plain_text_bounded_and_cached()
    {
        var handler = new Handler();
        using var client = new HttpClient(handler);
        using var service = new LabelTranslationService(new Factory(client), Config(true));
        var first = await service.Translate("عنوان تازه", "fa", default);
        Assert.Equal("New label", first["en"]);
        Assert.Equal("新标签", first["zh"]);
        first["en"] = "mutated client result";
        Assert.Equal("New label", (await service.Translate("عنوان تازه", "fa", default))["en"]);
        Assert.Equal(1, handler.Calls);
        Assert.Contains("from=fa&to=en&to=zh-Hans", handler.Url);
        Assert.Contains("textType=plain", handler.Url);
        Assert.DoesNotContain("test-secret", handler.Url);
        Assert.True(handler.KeyPresent);
    }

    [Fact]
    public async Task Missing_config_and_invalid_input_never_contact_provider()
    {
        var handler = new Handler();
        using var client = new HttpClient(handler);
        using var service = new LabelTranslationService(new Factory(client), Config(false));
        var error = await Assert.ThrowsAsync<LabelTranslationException>(() => service.Translate("عنوان", "fa", default));
        Assert.Equal("TRANSLATION_NOT_CONFIGURED", error.Message);
        Assert.Equal("INVALID_TRANSLATION_INPUT", (await Assert.ThrowsAsync<LabelTranslationException>(() => service.Translate(new string('a', 161), "fa", default))).Message);
        Assert.Equal(0, handler.Calls);
    }

    [Fact]
    public async Task Provider_errors_are_sanitized_and_never_cached()
    {
        var handler = new Handler { Status = HttpStatusCode.Unauthorized };
        using var client = new HttpClient(handler);
        using var service = new LabelTranslationService(new Factory(client), Config(true));
        Assert.Equal("TRANSLATION_PROVIDER_UNAVAILABLE", (await Assert.ThrowsAsync<LabelTranslationException>(() => service.Translate("عنوان", "fa", default))).Message);
        handler.Status = HttpStatusCode.OK;
        await service.Translate("عنوان", "fa", default);
        Assert.Equal(2, handler.Calls);
    }

    private static IConfiguration Config(bool enabled) => new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Translation:Enabled"] = enabled.ToString(), ["Translation:Azure:Key"] = "test-secret" }).Build();
    private sealed class Factory(HttpClient client) : IHttpClientFactory { public HttpClient CreateClient(string name) => client; }
    private sealed class Handler : HttpMessageHandler
    {
        public int Calls; public string Url = ""; public bool KeyPresent; public HttpStatusCode Status = HttpStatusCode.OK;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Calls++; Url = request.RequestUri!.ToString(); KeyPresent = request.Headers.Contains("Ocp-Apim-Subscription-Key");
            return Task.FromResult(new HttpResponseMessage(Status) { Content = new StringContent("[{\"translations\":[{\"to\":\"en\",\"text\":\"New label\"},{\"to\":\"zh-Hans\",\"text\":\"新标签\"}]}]", Encoding.UTF8, "application/json") });
        }
    }
}
