using System.Text.Json.Nodes;

namespace TextilePricingApp.Services;

public sealed class RubikaBotUpdatesWorker(RubikaBotService bot, RubikaBotConnectionRepository connections) : BackgroundService
{
    public async Task PollAsync(CancellationToken cancellation)
    {
        await bot.ControlGate.WaitAsync(cancellation);
        try
        {
            var state = bot.State();
            if (!state.Connected) return;
            var offset = connections.Offset(state.BotId);
            var input = new JsonObject { ["limit"] = 100 };
            if (offset.Length > 0) input["offset_id"] = offset;
            var data = await bot.CallAsync(state.Token, "getUpdates", input, cancellation);
            if (data["updates"] is not JsonArray updates) throw new InvalidOperationException("پاسخ دریافت پیام‌های ربات معتبر نیست.");
            foreach (var update in updates.OfType<JsonObject>())
            {
                var type = update["type"]?.GetValue<string>();
                var chatId = update["chat_id"]?.GetValue<string>() ?? "";
                if (chatId.Length == 0) continue;
                if (type == "StoppedBot") { connections.Stopped(state.BotId, chatId); continue; }
                if (type is not ("NewMessage" or "StartedBot")) continue;
                var message = update["new_message"];
                if (type == "NewMessage" && message?["sender_type"]?.GetValue<string>() != "User") continue;
                var code = message?["aux_data"]?["start_id"]?.GetValue<string>() ?? update["aux_data"]?["start_id"]?.GetValue<string>() ?? "";
                var text = (message?["text"]?.GetValue<string>() ?? "").Trim();
                // Local polling may omit the deep-link payload. Accept a normal text
                // message containing only the private invite code, without slash commands.
                if (code.Length == 0) code = text.StartsWith("/start ", StringComparison.Ordinal) ? text[7..].Trim() : text;
                if (code.Length != 48 || !code.All(Uri.IsHexDigit)) continue;
                // Never associate group chats or bots with customer price documents.
                var response = await bot.CallAsync(state.Token, "getChat", new() { ["chat_id"] = chatId }, cancellation);
                var chat = response["chat"];
                if (chat?["chat_type"]?.GetValue<string>() != "User") continue;
                var name = $"{chat["first_name"]?.GetValue<string>()} {chat["last_name"]?.GetValue<string>()} (@{chat["username"]?.GetValue<string>()})";
                connections.Claim(state.BotId, code, chatId, name.Trim());
            }
            var next = data["next_offset_id"]?.GetValue<string>();
            if (!string.IsNullOrEmpty(next)) connections.Offset(state.BotId, next);
        }
        finally { bot.ControlGate.Release(); }
    }
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var delay = 5;
            try { await PollAsync(stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception) { delay = 60; /* No raw exceptions: token appears in request URLs. */ }
            await Task.Delay(TimeSpan.FromSeconds(delay), stoppingToken);
        }
    }
}
