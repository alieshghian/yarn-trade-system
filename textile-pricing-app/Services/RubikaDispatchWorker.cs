namespace TextilePricingApp.Services;

public sealed class RubikaDispatchWorker(RubikaDispatchRepository dispatches, RubikaBotService bot, RubikaBotConnectionRepository connections, ILogger<RubikaDispatchWorker> logger) : BackgroundService
{
    public static bool IsOutcomeUnknown(RubikaSendException error) => error.DeliveryUncertain &&
        error.Kind is not ("not_found" or "blocked" or "permission_denied" or "invalid_access" or "authentication" or "rate_limited" or "account_restricted" or "dependencies" or "invalid_request");
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        dispatches.Recover();
        while (!stoppingToken.IsCancellationRequested)
        {
            var id = dispatches.NextRun();
            if (id is null) { await Task.Delay(2000, stoppingToken); continue; }
            dispatches.RunState(id, "running");
            try
            {
                foreach (var item in dispatches.Status(id)!.Items.Where(i => i.Status == "queued"))
                {
                    if (dispatches.Status(id)!.Items.First(i => i.Id == item.Id).Status != "queued") continue;
                    dispatches.ItemState(item.Id, "sending");
                    try
                    {
                        string message;
                        await bot.ControlGate.WaitAsync(stoppingToken);
                        try
                        {
                            var state = bot.State();
                            if (item.ChatId.Length == 0 || connections.Get(item.CustomerId, state.BotId).ChatId != item.ChatId)
                                throw new RubikaSendException("permission_denied", "اتصال این مشتری به ربات معتبر نیست؛ ارسال انجام نشد.");
                            message = await bot.SendAsync(dispatches.Status(id)!.Sender, item.ChatId, item.Text, item.Pdf, stoppingToken);
                        }
                        finally { bot.ControlGate.Release(); }
                        dispatches.ItemState(item.Id, "sent", messageId: message);
                    }
                    catch (RubikaSendException e)
                    {
                        var unknown = IsOutcomeUnknown(e);
                        dispatches.ItemState(item.Id, unknown ? "unknown" : "failed", e.Message);
                        // A recipient-specific failure skips the remainder of that customer's chunks.
                        if (e.Kind is "not_found" or "blocked" or "permission_denied")
                        {
                            foreach (var remaining in dispatches.Status(id)!.Items.Where(i => i.Phone == item.Phone && i.Status == "queued"))
                                dispatches.ItemState(remaining.Id, "stopped", "ارسال قبلی به این مشتری ناموفق بود.");
                            continue;
                        }
                        dispatches.Stop(id, "ارسال باقی‌مانده متوقف شد؛ خطای ثبت‌شده را بررسی کنید.");
                        break;
                    }
                    await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
                }
                if (dispatches.Status(id)!.Status == "running") dispatches.RunState(id, "completed");
            }
            catch (Exception e)
            {
                logger.LogError("Rubika dispatch stopped ({ExceptionType}); no automatic retry.", e.GetType().Name);
                // Keep an in-flight message unknown rather than falsely marking it as unsent.
                foreach (var item in dispatches.Status(id)!.Items.Where(i => i.Status == "sending"))
                    dispatches.ItemState(item.Id, "unknown", "وضعیت ارسال نامشخص است؛ پیش از ارسال مجدد بررسی کنید.");
                dispatches.Stop(id, "ارسال متوقف شد.");
            }
        }
    }
}
