using System.Net.Http.Json;
using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;

namespace YarnTrade.Api.Services;

public sealed class LabelTranslationException(string code) : Exception(code);

public sealed class LabelTranslationService(IHttpClientFactory clients, IConfiguration configuration) : IDisposable
{
    private readonly MemoryCache cache = new(new MemoryCacheOptions { SizeLimit = 256 });
    public async Task<Dictionary<string, string>> Translate(string text, string source, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(text) || text.Length > 160 || !new[] { "fa", "en", "zh" }.Contains(source)) throw new LabelTranslationException("INVALID_TRANSLATION_INPUT");
        var key = configuration["Translation:Azure:Key"];
        var provider = configuration["Translation:Provider"] ?? "Microsoft";
        if (!configuration.GetValue<bool>("Translation:Enabled") || (provider != "MyMemory" && (provider != "Microsoft" || string.IsNullOrWhiteSpace(key)))) throw new LabelTranslationException("TRANSLATION_NOT_CONFIGURED");
        var languages = new[] { "fa", "en", "zh" }.Where(x => x != source).ToArray();
        var cacheKey = provider + ":" + source + ":" + text;
        if (cache.TryGetValue<Dictionary<string, string>>(cacheKey, out var saved)) return new(saved!);
        if (provider == "MyMemory")
        {
            if (Encoding.UTF8.GetByteCount(text) > 500) throw new LabelTranslationException("INVALID_TRANSLATION_INPUT");
            var translated = new Dictionary<string, string>();
            foreach (var language in languages)
            {
                static string MyMemoryLanguage(string value) => value == "zh" ? "zh-CN" : value;
                var url = "https://api.mymemory.translated.net/get?q=" + Uri.EscapeDataString(text) + "&langpair=" + Uri.EscapeDataString(MyMemoryLanguage(source) + "|" + MyMemoryLanguage(language));
                using var result = await clients.CreateClient("label-translation").GetAsync(url, ct);
                if (!result.IsSuccessStatusCode) throw new LabelTranslationException("TRANSLATION_PROVIDER_UNAVAILABLE");
                var body = await result.Content.ReadAsStringAsync(ct);
                if (body.Length > 65536) throw new LabelTranslationException("INVALID_TRANSLATION_RESPONSE");
                try
                {
                    using var json = JsonDocument.Parse(body);
                    if (json.RootElement.GetProperty("responseStatus").GetInt32() != 200) throw new LabelTranslationException("TRANSLATION_PROVIDER_UNAVAILABLE");
                    var value = WebUtility.HtmlDecode(json.RootElement.GetProperty("responseData").GetProperty("translatedText").GetString());
                    // Some public translation-memory entries contain UTF-8 bytes decoded as Latin-1.
                    // Repair only a strict, reversible encoding mismatch with C1 controls; never guess words.
                    if (value is not null && value.Any(c => c is >= '\u0080' and <= '\u009f') && value.All(c => c <= '\u00ff'))
                    {
                        try { value = new UTF8Encoding(false, true).GetString(Encoding.Latin1.GetBytes(value)); }
                        catch (DecoderFallbackException) { throw new LabelTranslationException("INVALID_TRANSLATION_RESPONSE"); }
                    }
                    if (string.IsNullOrWhiteSpace(value) || value.Length > 160) throw new LabelTranslationException("INVALID_TRANSLATION_RESPONSE");
                    if (value.Any(char.IsControl)) throw new LabelTranslationException("INVALID_TRANSLATION_RESPONSE");
                    translated[language] = value;
                }
                catch (Exception error) when (error is JsonException or InvalidOperationException or KeyNotFoundException) { throw new LabelTranslationException("INVALID_TRANSLATION_RESPONSE"); }
            }
            cache.Set(cacheKey, new Dictionary<string, string>(translated), new MemoryCacheEntryOptions { Size = 1, AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(1) });
            return translated;
        }
        static string ProviderLanguage(string language) => language == "zh" ? "zh-Hans" : language;
        var query = "api-version=3.0&textType=plain&from=" + ProviderLanguage(source) + string.Concat(languages.Select(x => "&to=" + ProviderLanguage(x)));
        using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.cognitive.microsofttranslator.com/translate?" + query);
        request.Headers.Add("Ocp-Apim-Subscription-Key", key);
        var region = configuration["Translation:Azure:Region"];
        if (!string.IsNullOrWhiteSpace(region)) request.Headers.Add("Ocp-Apim-Subscription-Region", region);
        request.Content = JsonContent.Create(new[] { new { Text = text } });
        using var response = await clients.CreateClient("label-translation").SendAsync(request, ct);
        if (!response.IsSuccessStatusCode) throw new LabelTranslationException("TRANSLATION_PROVIDER_UNAVAILABLE");
        var content = await response.Content.ReadAsStringAsync(ct);
        if (content.Length > 65536) throw new LabelTranslationException("INVALID_TRANSLATION_RESPONSE");
        try
        {
            using var json = JsonDocument.Parse(content);
            var result = new Dictionary<string, string>();
            foreach (var translation in json.RootElement[0].GetProperty("translations").EnumerateArray())
            {
                var language = translation.GetProperty("to").GetString();
                if (language == "zh-Hans") language = "zh";
                var value = translation.GetProperty("text").GetString();
                if (language is not null && languages.Contains(language) && !string.IsNullOrWhiteSpace(value) && value.Length <= 160) result[language] = value;
            }
            if (result.Count != languages.Length) throw new LabelTranslationException("INVALID_TRANSLATION_RESPONSE");
            cache.Set(cacheKey, new Dictionary<string, string>(result), new MemoryCacheEntryOptions { Size = 1, AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(1) });
            return result;
        }
        catch (Exception error) when (error is JsonException or InvalidOperationException or KeyNotFoundException or IndexOutOfRangeException) { throw new LabelTranslationException("INVALID_TRANSLATION_RESPONSE"); }
    }
    public void Dispose() => cache.Dispose();
}
