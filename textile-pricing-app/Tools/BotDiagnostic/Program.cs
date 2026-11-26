using Microsoft.AspNetCore.DataProtection;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.Data.Sqlite;
using System.Security.Cryptography;
using System.Text;

// Diagnostics never print credentials, messages, chat IDs or invite codes.
// Upload mode uses only a synthetic PDF. Sending requires explicit --send-probe
// authorization and is restricted to the approved connection for customer 12.
var root = Path.GetFullPath(args[0]);
var protection = DataProtectionProvider.Create(new DirectoryInfo(Path.Combine(root, "App_Data", "Keys")),
    builder => builder.SetApplicationName("TextilePricingApp").DisableAutomaticKeyGeneration());
var state = JsonNode.Parse(protection.CreateProtector("RubikaBot.v1").Unprotect(
    File.ReadAllText(Path.Combine(root, "App_Data", "rubika-bot.protected"))))!;
var token = state["Token"]!.GetValue<string>();
using var db = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = Path.Combine(root, "App_Data", "pricing.db"), Mode = SqliteOpenMode.ReadOnly }.ToString());
db.Open();
using var query = db.CreateCommand();
query.CommandText = "SELECT InviteHash FROM RubikaBotConnections WHERE BotId=$bot AND InviteHash<>''";
query.Parameters.AddWithValue("$bot", state["BotId"]!.GetValue<string>());
using var reader = query.ExecuteReader();
var hashes = new HashSet<string>();
while (reader.Read()) hashes.Add(reader.GetString(0));
reader.Close();
using var http = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(40) };
try
{
    if (args.Length > 1 && args[1] is "--received-file-check" or "--received-file-echo")
    {
        using var target = db.CreateCommand();
        target.CommandText = "SELECT b.ChatId FROM RubikaBotConnections b JOIN Customers c ON c.Id=b.CustomerId WHERE b.CustomerId=12 AND b.BotId=$bot AND b.ChatId<>'' AND c.Name=$name";
        target.Parameters.AddWithValue("$bot", state["BotId"]!.GetValue<string>());
        target.Parameters.AddWithValue("$name", "آغاسی");
        var approvedChat = target.ExecuteScalar() as string;
        if (string.IsNullOrEmpty(approvedChat)) throw new InvalidOperationException("Authorized recipient connection not found");
        using var updatesResult = await http.PostAsJsonAsync("https://botapi.rubika.ir/v3/" + Uri.EscapeDataString(token) + "/getUpdates", new { limit = 100 });
        var updatesResponse = JsonNode.Parse(await updatesResult.Content.ReadAsStringAsync())!;
        Console.WriteLine($"getUpdates HTTP={(int)updatesResult.StatusCode}; status={SafeStatus(updatesResponse)}");
        if (!updatesResult.IsSuccessStatusCode || SafeStatus(updatesResponse) != "OK") return;
        var receivedUpdates = (updatesResponse["data"] ?? updatesResponse)["updates"] as JsonArray;
        Console.WriteLine("Updates count=" + (receivedUpdates?.Count ?? 0));
        var scopedFiles = receivedUpdates?.Where(u => u?["chat_id"]?.GetValue<string>() == approvedChat && u?["new_message"]?["sender_type"]?.GetValue<string>() == "User" && u?["new_message"]?["file"]?["file_id"] is JsonValue).ToList();
        Console.WriteLine("Received files from approved test customer=" + (scopedFiles?.Count ?? 0));
        if (args[1] == "--received-file-echo")
        {
            // Restrict this authorization to the single file verified in the previous check.
            if (scopedFiles?.Count != 1) throw new InvalidOperationException("Expected exactly one authorized received file");
            using var chatCheck = await http.PostAsJsonAsync("https://botapi.rubika.ir/v3/" + Uri.EscapeDataString(token) + "/getChat", new { chat_id = approvedChat });
            var chatResponse = JsonNode.Parse(await chatCheck.Content.ReadAsStringAsync())!;
            var chat = (chatResponse["data"] ?? chatResponse)["chat"];
            if (!chatCheck.IsSuccessStatusCode || SafeStatus(chatResponse) != "OK" || chat?["chat_type"]?.GetValue<string>() != "User" || chat?["chat_id"]?.GetValue<string>() != approvedChat)
                throw new InvalidOperationException("Authorized recipient validation failed");
            var echoFile = scopedFiles[0]!["new_message"]!["file"]!["file_id"]!;
            // Exactly one send; do not retry after any response or exception.
            using var echoResult = await http.PostAsJsonAsync("https://botapi.rubika.ir/v3/" + Uri.EscapeDataString(token) + "/sendFile", new JsonObject { ["chat_id"] = approvedChat, ["file_id"] = echoFile.DeepClone() });
            var echoResponse = JsonNode.Parse(await echoResult.Content.ReadAsStringAsync())!;
            var echoData = echoResponse["data"] ?? echoResponse;
            Console.WriteLine($"Received-file sendFile HTTP={(int)echoResult.StatusCode}; status={SafeStatus(echoResponse)}; messageIdPresent={!string.IsNullOrWhiteSpace(echoData["message_id"]?.GetValue<string>())}");
            Console.WriteLine("One received file echo attempted to original sender; no download/upload, retry, or production history changes.");
            return;
        }
        foreach (var item in scopedFiles ?? new())
        {
            var receivedFile = item!["new_message"]!["file"]!;
            Console.WriteLine("File metadata fields=" + Keys(receivedFile) + "; fileIdPresent=True");
            await Inspect("getFile", new JsonObject { ["file_id"] = receivedFile["file_id"]!.DeepClone() });
        }
        Console.WriteLine("Read-only check: no file download, send, or production cursor/history changes.");
        return;
    }
    if (args.Length > 1 && args[1] == "--text-probe")
    {
        using var target = db.CreateCommand();
        target.CommandText = "SELECT b.ChatId FROM RubikaBotConnections b JOIN Customers c ON c.Id=b.CustomerId WHERE b.CustomerId=12 AND b.BotId=$bot AND b.ChatId<>'' AND c.Name=$name";
        target.Parameters.AddWithValue("$bot", state["BotId"]!.GetValue<string>());
        target.Parameters.AddWithValue("$name", "آغاسی");
        var approvedChat = target.ExecuteScalar() as string;
        if (string.IsNullOrEmpty(approvedChat)) throw new InvalidOperationException("Authorized recipient connection not found");
        using var check = await http.PostAsJsonAsync("https://botapi.rubika.ir/v3/" + Uri.EscapeDataString(token) + "/getChat", new { chat_id = approvedChat });
        var checkedResponse = JsonNode.Parse(await check.Content.ReadAsStringAsync())!;
        var checkedChat = (checkedResponse["data"] ?? checkedResponse)["chat"];
        if (!check.IsSuccessStatusCode || SafeStatus(checkedResponse) != "OK" || checkedChat?["chat_type"]?.GetValue<string>() != "User" || checkedChat?["chat_id"]?.GetValue<string>() != approvedChat)
            throw new InvalidOperationException("Authorized recipient validation failed");
        // One explicitly authorized text message. Never retry a send.
        using var sent = await http.PostAsJsonAsync("https://botapi.rubika.ir/v3/" + Uri.EscapeDataString(token) + "/sendMessage", new { chat_id = approvedChat, text = "آزمایش ارتباط ربات — این پیام آزمایشی است." });
        var textResponse = JsonNode.Parse(await sent.Content.ReadAsStringAsync())!;
        var textData = textResponse["data"] ?? textResponse;
        Console.WriteLine($"sendMessage HTTP={(int)sent.StatusCode}; status={SafeStatus(textResponse)}; detail={SafeIdentifier(textResponse["status_det"])}; messageIdPresent={!string.IsNullOrWhiteSpace(textData["message_id"]?.GetValue<string>())}");
        Console.WriteLine("Exactly one text send attempted; no retry; no prices or customer information sent; production dispatch history unchanged.");
        return;
    }
    if (args.Length > 1 && args[1] is "--upload-probe" or "--send-probe" or "--pdf-minimal-probe" or "--image-probe")
    {
        var sendProbe = args[1] != "--upload-probe";
        var imageProbe = args[1] == "--image-probe";
        var minimalProbe = args[1] == "--pdf-minimal-probe" || imageProbe;
        string? approvedChat = null;
        if (sendProbe)
        {
            using var target = db.CreateCommand();
            target.CommandText = "SELECT b.ChatId FROM RubikaBotConnections b JOIN Customers c ON c.Id=b.CustomerId WHERE b.CustomerId=12 AND b.BotId=$bot AND b.ChatId<>'' AND c.Name=$name";
            target.Parameters.AddWithValue("$bot", state["BotId"]!.GetValue<string>());
            target.Parameters.AddWithValue("$name", "آغاسی");
            approvedChat = target.ExecuteScalar() as string;
            if (string.IsNullOrEmpty(approvedChat)) throw new InvalidOperationException("Authorized recipient connection not found");
            using var check = await http.PostAsJsonAsync("https://botapi.rubika.ir/v3/" + Uri.EscapeDataString(token) + "/getChat", new { chat_id = approvedChat });
            var checkResponse = JsonNode.Parse(await check.Content.ReadAsStringAsync())!;
            if (!check.IsSuccessStatusCode || SafeStatus(checkResponse) != "OK" || (checkResponse["data"] ?? checkResponse)["chat"]?["chat_type"]?.GetValue<string>() != "User")
                throw new InvalidOperationException("Authorized recipient validation failed");
        }
        using var prepare = await http.PostAsJsonAsync("https://botapi.rubika.ir/v3/" + Uri.EscapeDataString(token) + "/requestSendFile", new { type = imageProbe ? "Image" : "File" });
        var preparedResponse = JsonNode.Parse(await prepare.Content.ReadAsStringAsync())!;
        Console.WriteLine("Prepare HTTP=" + (int)prepare.StatusCode + "; status=" + SafeStatus(preparedResponse));
        if (!prepare.IsSuccessStatusCode || SafeStatus(preparedResponse) != "OK") return;
        var url = (preparedResponse["data"] ?? preparedResponse)["upload_url"]?.GetValue<string>() ?? "";
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || uri.Scheme != "https" || uri.Port != 443 || uri.UserInfo.Length > 0 || !(uri.Host == "rubika.ir" || uri.Host.EndsWith(".rubika.ir", StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException("Unexpected upload destination");
        var bytes = await File.ReadAllBytesAsync(Path.Combine(root, "tmp", "pdfs", imageProbe ? "rubika-upload-probe.png" : "rubika-upload-probe.pdf"));
        using var multipart = new MultipartFormDataContent();
        using var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new(imageProbe ? "image/png" : "application/pdf");
        multipart.Add(file, "file", imageProbe ? "image-test.png" : "upload-test.pdf");
        using var upload = await http.PostAsync(uri, multipart);
        var uploaded = JsonNode.Parse(await upload.Content.ReadAsStringAsync())!;
        var uploadedData = uploaded["data"] ?? uploaded;
        Console.WriteLine($"Upload HTTP={(int)upload.StatusCode}; status={SafeStatus(uploaded)}; rootKeys={Keys(uploaded)}; dataKeys={Keys(uploadedData)}; fileIdPresent={uploadedData["file_id"] is not null}");
        if (!sendProbe && upload.IsSuccessStatusCode && SafeStatus(uploaded) == "OK" && uploadedData["file_id"] is JsonValue probeFileId)
            await Inspect("getFile", new JsonObject { ["file_id"] = probeFileId.DeepClone() });
        if (!sendProbe) Console.WriteLine("No sendFile call; no recipient message sent.");
        else if (upload.IsSuccessStatusCode && SafeStatus(uploaded) == "OK" && uploadedData["file_id"] is JsonValue fileId)
        {
            await Inspect("getFile", new JsonObject { ["file_id"] = fileId.DeepClone() });
            var payload = new JsonObject { ["chat_id"] = approvedChat, ["file_id"] = fileId.DeepClone() };
            if (!minimalProbe) payload["text"] = "آزمایش ارسال فایل — بدون قیمت و اطلاعات مشتری";
            // Exactly one send attempt. Do not retry on any response or exception.
            using var sent = await http.PostAsJsonAsync("https://botapi.rubika.ir/v3/" + Uri.EscapeDataString(token) + "/sendFile", payload);
            var sentResponse = JsonNode.Parse(await sent.Content.ReadAsStringAsync())!;
            var sentData = sentResponse["data"] ?? sentResponse;
            Console.WriteLine($"Type={(imageProbe ? "Image" : "File")}; caption={!minimalProbe}; sendFile HTTP={(int)sent.StatusCode}; status={SafeStatus(sentResponse)}; detail={SafeIdentifier(sentResponse["status_det"])}; rootKeys={Keys(sentResponse)}; dataKeys={Keys(sentData)}; messageIdPresent={sentData["message_id"] is not null}");
            Console.WriteLine("Exactly one sendFile attempted; no retry; no customer prices sent; production dispatch history unchanged.");
        }
        return;
    }
    if (args.Length > 1 && args[1] == "--send-check")
    {
        await Inspect("getMe", new JsonObject());
        using var latest = db.CreateCommand();
        latest.CommandText = "SELECT ChatId FROM RubikaDispatchItems WHERE ChatId<>'' ORDER BY Id DESC LIMIT 1";
        var chatId = latest.ExecuteScalar() as string;
        if (!string.IsNullOrEmpty(chatId)) await Inspect("getChat", new JsonObject { ["chat_id"] = chatId });
        // Only obtain upload metadata; no file bytes or recipient messages are sent.
        await Inspect("requestSendFile", new JsonObject { ["type"] = "File" });
        return;
    }
    using var result = await http.PostAsJsonAsync("https://botapi.rubika.ir/v3/" + Uri.EscapeDataString(token) + "/getUpdates", new { limit = 100 });
    Console.WriteLine("HTTP=" + (int)result.StatusCode);
    var response = JsonNode.Parse(await result.Content.ReadAsStringAsync())!;
    Console.WriteLine("Status=" + response["status"]?.GetValue<string>());
    var data = response["data"] ?? response;
    Console.WriteLine("Data keys=" + Keys(data));
    if (data["updates"] is not JsonArray updates) return;
    Console.WriteLine("Updates=" + updates.Count);
    foreach (var update in updates)
    {
        var message = update?["new_message"];
        var code = message?["aux_data"]?["start_id"] ?? update?["aux_data"]?["start_id"];
        var text = message?["text"]?.GetValue<string>() ?? "";
        Console.WriteLine($"Type={update?["type"]}; keys={Keys(update)}; messageKeys={Keys(message)}; auxKeys={Keys(message?["aux_data"])}; senderType={message?["sender_type"]}; startCodeLength={code?.GetValue<string>().Length ?? 0}; startCommand={text.StartsWith("/start", StringComparison.Ordinal)}; textLength={text.Length}");
        foreach (var aux in new[] { update?["aux_data"], message?["aux_data"] }.OfType<JsonObject>())
            foreach (var entry in aux)
            {
                var value = entry.Value is JsonValue v && v.TryGetValue<string>(out var s) ? s : "";
                var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value.ToLowerInvariant())));
                Console.WriteLine($"Aux field={entry.Key}; stringLength={value.Length}; matchesActiveInvite={hashes.Contains(hash)}");
            }
    }
}
catch (Exception ex)
{
    Console.WriteLine("Diagnostic failure type=" + ex.GetType().Name);
    Environment.ExitCode = 1;
}
static string Keys(JsonNode? node) => node is JsonObject obj ? string.Join(",", obj.Select(p => p.Key)) : "none";
static string SafeStatus(JsonNode node)
{
    return SafeIdentifier(node["status"]);
}
static string SafeIdentifier(JsonNode? node)
{
    if (node is not JsonValue v || !v.TryGetValue<string>(out var status)) return "missing_or_structured";
    return status.Length <= 80 && status.All(c => char.IsAsciiLetterOrDigit(c) || c == '_') ? status : "unrecognized";
}
async Task Inspect(string method, JsonObject input)
{
    using var result = await http.PostAsJsonAsync("https://botapi.rubika.ir/v3/" + Uri.EscapeDataString(token) + "/" + method, input);
    var response = JsonNode.Parse(await result.Content.ReadAsStringAsync())!;
    var status = response["status"]?.GetValue<string>() ?? "missing";
    // Print only bounded status identifiers, never raw server descriptions or URLs.
    if (status.Length > 80 || !status.All(c => char.IsAsciiLetterOrDigit(c) || c == '_')) status = "unrecognized";
    var data = response["data"] ?? response;
    Console.WriteLine($"Method={method}; HTTP={(int)result.StatusCode}; status={status}; dataKeys={Keys(data)}");
    if (method == "getMe") Console.WriteLine("Bot identity matches=" + (data["bot"]?["bot_id"]?.GetValue<string>() == state["BotId"]?.GetValue<string>()));
    if (method == "getChat")
    {
        Console.WriteLine("Chat type=" + data["chat"]?["chat_type"]?.GetValue<string>());
        Console.WriteLine("Chat response fields=" + Keys(data["chat"]));
        Console.WriteLine("Returned chat ID matches request=" + (data["chat"]?["chat_id"]?.GetValue<string>() == input["chat_id"]?.GetValue<string>()));
    }
    if (method == "requestSendFile")
    {
        var url = data["upload_url"]?.GetValue<string>() ?? "";
        Console.WriteLine("Upload URL present=" + (url.Length > 0));
    }
}
