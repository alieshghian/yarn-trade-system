using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Data.Sqlite;
using System.Net;
using System.Text;
using System.Text.Json.Nodes;
using TextilePricingApp.Services;

var root = Path.Combine(Path.GetTempPath(), "textile-bot-smoke-" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(Path.Combine(root, "App_Data"));
var env = new TestEnvironment { ContentRootPath = root };
using (var c = new SqliteConnection($"Data Source={root}/App_Data/pricing.db"))
{
    c.Open(); using var cmd = c.CreateCommand(); cmd.CommandText = "CREATE TABLE Customers(Id INTEGER PRIMARY KEY,Name TEXT); INSERT INTO Customers VALUES(1,'Test A'),(2,'Test B'),(3,'Test C');"; cmd.ExecuteNonQuery();
}
var mock = new MockApi();
using var bot = new RubikaBotService(env, new EphemeralDataProtectionProvider(), new HttpClient(mock));
var inviteProtection = new EphemeralDataProtectionProvider();
var links = new RubikaBotConnectionRepository(env, inviteProtection);
var updates = new RubikaBotUpdatesWorker(bot, links);
await bot.ConnectAsync("TEST_TOKEN_NOT_REAL_123", CancellationToken.None);
Check(bot.State().Connected, "getMe / connect");
Check(!File.ReadAllText(root + "/App_Data/rubika-bot.protected").Contains("TEST_TOKEN"), "encrypted token");
var state = bot.State();
var code = links.Invite(1, state.BotId);
Check(new RubikaBotConnectionRepository(env, inviteProtection).InviteCode(1, state.BotId) == code, "invite survives page reload / encrypted persistence");
Check(links.InviteCode(1, "OTHER_BOT") is null, "invite display isolated by bot");
Check(RubikaBotService.Link(state, code).Contains("?st="), "official st link");
mock.Update = new() { ["type"] = "NewMessage", ["chat_id"] = "uTEST1", ["new_message"] = new JsonObject { ["sender_type"] = "User", ["text"] = "/start " + code } };
await updates.PollAsync(CancellationToken.None);
Check(links.Get(1, state.BotId).PendingChatId == "uTEST1" && links.Get(1, state.BotId).ChatId == "", "claim needs approval");
Check(!links.Claim(state.BotId, code, "uATTACK", "Other"), "invite single use");
Check(links.InviteCode(1, state.BotId) is null, "consumed code hidden");
Check(!links.Approve(1, state.BotId, "uATTACK"), "approval cannot substitute recipient");
Check(links.Approve(1, state.BotId, "uTEST1"), "approved recipient");
Check(links.Get(1, "OTHER_BOT").ChatId == "", "bot identities isolated");
var code2 = links.Invite(2, state.BotId);
Check(!links.Claim(state.BotId, code2, "uTEST1", "Duplicate"), "duplicate chat refused");
var oldCode = links.Invite(2, state.BotId); var newCode = links.Invite(2, state.BotId);
Check(!links.Claim(state.BotId, oldCode, "uTEST2", "B"), "regeneration revokes old link");
mock.ChatType = "Group";
mock.Update = new() { ["type"] = "StartedBot", ["chat_id"] = "gGROUP", ["aux_data"] = new JsonObject { ["start_id"] = newCode } };
await updates.PollAsync(CancellationToken.None);
Check(links.Get(2, state.BotId).PendingChatId == "", "group cannot receive customer prices");
mock.ChatType = "User"; mock.Update = null;
var localCode = links.Invite(3, state.BotId);
mock.Update = new() { ["type"] = "NewMessage", ["chat_id"] = "uLOCAL", ["new_message"] = new JsonObject { ["sender_type"] = "User", ["text"] = "  " + localCode.ToUpperInvariant() + "\n" } };
await updates.PollAsync(CancellationToken.None);
Check(links.Get(3, state.BotId).PendingChatId == "uLOCAL" && links.Get(3, state.BotId).ChatId == "", "plain code local polling / uppercase / whitespace / approval required");
mock.Update = null;
Check(links.Offset(state.BotId) == "next1", "durable polling cursor");
var caption = "Test prices"; var pdf = Encoding.UTF8.GetBytes("%PDF-1.4\nTest");
var sent = await bot.SendAsync(state.Sender, "uTEST1", caption, pdf, CancellationToken.None);
Check(sent == "message1" && mock.Sends == 1 && mock.Uploaded, "multipart PDF then sendFile once");
Check(mock.LastChat == "uTEST1" && mock.LastText == caption, "recipient / caption preserved");
try { await bot.SendAsync("OLD_SENDER", "uTEST1", caption, pdf, CancellationToken.None); throw new Exception("stale sender accepted"); }
catch (RubikaSendException e) { Check(e.Kind == "authentication" && mock.Sends == 1, "stale preview cannot send"); }
mock.FailSend = true;
try { await bot.SendAsync(state.Sender, "uTEST1", caption, pdf, CancellationToken.None); throw new Exception("ambiguous send accepted"); }
catch (RubikaSendException e) { Check(e.Kind == "network" && mock.Sends == 2, "ambiguous send is not retried"); }
mock.FailSend = false;
mock.SendStatus = "INVALID_ACCESS";
var sendsBeforeDenied = mock.Sends;
try { await bot.SendAsync(state.Sender, "uTEST1", caption, pdf, CancellationToken.None); throw new Exception("denial accepted"); }
catch (RubikaSendException e) { Check(e.Kind == "invalid_access" && !RubikaDispatchWorker.IsOutcomeUnknown(e) && e.Message.Contains("sendFile") && e.Message.Contains("INVALID_ACCESS") && mock.Sends == sendsBeforeDenied + 1, "INVALID_ACCESS recorded as failed with stage / stop run / no retry"); }
mock.SendStatus = "OK";
mock.FailUpload = true;
var sendsBeforeUpload = mock.Sends;
try { await bot.SendAsync(state.Sender, "uTEST1", caption, pdf, CancellationToken.None); throw new Exception("upload failure accepted"); }
catch (RubikaSendException e) { Check(!RubikaDispatchWorker.IsOutcomeUnknown(e) && mock.Sends == sendsBeforeUpload, "upload network failure cannot be delivery unknown / no sendFile"); }
mock.FailUpload = false;
Check(RubikaDispatchWorker.IsOutcomeUnknown(new RubikaSendException("network", "ambiguous send")), "send network ambiguity remains unknown");
var dispatches = new RubikaDispatchRepository(env);
var document = new RubikaPriceDocument(1, "Company", "Test A", "1405/07/12", false, [new("P1", "Product", 120, 20)]);
var run = dispatches.Prepare([new("", "Test A", caption, pdf, document, "uTEST1")], state.Sender);
Check(dispatches.Status(run)!.Items[0].ChatId == "uTEST1" && dispatches.Status(run)!.Items[0].CustomerId == 1, "queue snapshots recipient and document");
Check(!dispatches.Confirm(run, "OLD_SENDER") && dispatches.Confirm(run, state.Sender), "only same bot confirms");
var itemId = dispatches.Status(run)!.Items[0].Id;
dispatches.ItemState(itemId, "failed", "test");
Check(dispatches.PreviousPrices(1).Count == 0, "failed send does not update baseline");
dispatches.ItemState(itemId, "sent", messageId: "message1");
Check(dispatches.PreviousPrices(1)["P1"] == 120 && dispatches.LastSent() is not null, "successful send updates baseline");
mock.Update = new() { ["type"] = "StoppedBot", ["chat_id"] = "uTEST1" };
await updates.PollAsync(CancellationToken.None);
Check(links.Get(1, state.BotId).ChatId == "", "StoppedBot revokes connection");
links.Unlink(2, state.BotId);
Check(!links.Claim(state.BotId, newCode, "uTEST2", "B"), "unlink revokes invitation");
Check(!RubikaBotService.SafeRubikaUrl("https://rubika.ir.attacker.example/upload") && !RubikaBotService.SafeRubikaUrl("http://rubika.ir/upload"), "upload destination validation");
SharedAssignmentSmoke.Run();
Console.WriteLine("ALL OFFLINE BOT TESTS PASSED; no external requests or messages.");

static void Check(bool condition, string label) { if (!condition) throw new Exception("FAIL: " + label); Console.WriteLine("PASS: " + label); }
sealed class TestEnvironment : IWebHostEnvironment
{
    public string ApplicationName { get; set; } = "Test";
    public string EnvironmentName { get; set; } = "Development";
    public string ContentRootPath { get; set; } = "";
    public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    public string WebRootPath { get; set; } = "";
    public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
}
sealed class MockApi : HttpMessageHandler
{
    public JsonObject? Update;
    public string ChatType = "User", LastChat = "", LastText = "";
    public int Sends;
    public bool Uploaded, FailSend, FailUpload;
    public string SendStatus = "OK";
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var path = request.RequestUri!.AbsolutePath;
        JsonObject data;
        if (path.EndsWith("getMe")) data = new() { ["bot"] = new JsonObject { ["bot_id"] = "bot1", ["bot_title"] = "Test Bot", ["share_url"] = "https://rubika.ir/testbot" } };
        else if (path.EndsWith("getUpdates")) data = new() { ["updates"] = Update is null ? new JsonArray() : new JsonArray(Update.DeepClone()), ["next_offset_id"] = "next1" };
        else if (path.EndsWith("getChat")) data = new() { ["chat"] = new JsonObject { ["chat_type"] = ChatType, ["first_name"] = "Test", ["username"] = "test" } };
        else if (path.EndsWith("requestSendFile"))
        {
            var body = JsonNode.Parse(await request.Content!.ReadAsStringAsync(cancellationToken));
            if (body?["type"]?.GetValue<string>() != "File") throw new Exception("wrong file type");
            data = new() { ["upload_url"] = "https://upload.rubika.ir/upload" };
        }
        else if (path == "/upload")
        {
            if (FailUpload) throw new HttpRequestException("upload test only");
            var bytes = await request.Content!.ReadAsByteArrayAsync(cancellationToken);
            Uploaded = request.Content is MultipartFormDataContent && Encoding.UTF8.GetString(bytes).Contains("%PDF-1.4");
            data = new() { ["file_id"] = "file1" };
        }
        else if (path.EndsWith("sendFile"))
        {
            Sends++; if (FailSend) throw new HttpRequestException("test only");
            var body = JsonNode.Parse(await request.Content!.ReadAsStringAsync(cancellationToken))!;
            LastChat = body["chat_id"]!.GetValue<string>(); LastText = body["text"]!.GetValue<string>();
            if (body["file_id"]!.GetValue<string>() != "file1") throw new Exception("wrong file id");
            data = new() { ["message_id"] = "message1" };
        }
        else throw new Exception("Unexpected request");
        return new(HttpStatusCode.OK) { Content = new StringContent(new JsonObject { ["status"] = path.EndsWith("sendFile") ? SendStatus : "OK", ["data"] = data }.ToJsonString(), Encoding.UTF8, "application/json") };
    }
}
