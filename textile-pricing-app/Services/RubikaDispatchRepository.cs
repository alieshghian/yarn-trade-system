using Microsoft.Data.Sqlite;
using System.Globalization;
using System.Text.Json;

namespace TextilePricingApp.Services;

public sealed record RubikaPriceLine(string ProductCode, string ProductName, decimal Price, decimal? ChangePercent);
public sealed record RubikaPriceDocument(int CustomerId, string CompanyName, string CustomerName, string Date, bool IsVatExempt, IReadOnlyList<RubikaPriceLine> Rows);
public sealed record RubikaMessage(string Phone, string Name, string Text, byte[]? Pdf = null, RubikaPriceDocument? Document = null, string ChatId = "");
public sealed record RubikaDispatchItem(long Id, string Phone, string Name, string Text, string Status, string Error, byte[]? Pdf = null, string ChatId = "", int CustomerId = 0);
public sealed record RubikaDispatchStatus(string Id, string Status, int Sent, int Failed, int Remaining, DateTime? LastSent, IReadOnlyList<RubikaDispatchItem> Items, string Sender = "");

public sealed class RubikaDispatchRepository(IWebHostEnvironment environment)
{
    public static string DisplayDateTime(DateTime? utc) => CustomerPriceReportService.PersianDateTime(utc is null ? null : TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utc.Value, DateTimeKind.Utc), TimeZoneInfo.FindSystemTimeZoneById("Asia/Tehran")));
    private readonly object _gate = new();
    private bool _initialized;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private SqliteConnection Open()
    {
        Directory.CreateDirectory(Path.Combine(environment.ContentRootPath, "App_Data"));
        var connection = new SqliteConnection($"Data Source={Path.Combine(environment.ContentRootPath, "App_Data", "pricing.db")}");
        connection.Open();
        lock (_gate)
        {
            if (!_initialized)
            {
                using var command = connection.CreateCommand();
                command.CommandText = """
                    CREATE TABLE IF NOT EXISTS RubikaDispatches(Id TEXT PRIMARY KEY, Status TEXT NOT NULL, Created TEXT NOT NULL, Sender TEXT NOT NULL);
                    CREATE UNIQUE INDEX IF NOT EXISTS IX_RubikaSingleActive ON RubikaDispatches((1)) WHERE Status IN ('queued','running');
                    CREATE TABLE IF NOT EXISTS RubikaDispatchItems(Id INTEGER PRIMARY KEY, RunId TEXT NOT NULL, Phone TEXT NOT NULL, Name TEXT NOT NULL, Text TEXT NOT NULL, Status TEXT NOT NULL, Error TEXT NOT NULL DEFAULT '', MessageId TEXT, SentAt TEXT);
                    CREATE INDEX IF NOT EXISTS IX_RubikaItems_Run ON RubikaDispatchItems(RunId);
                    CREATE TABLE IF NOT EXISTS RubikaSentPrices(CustomerId INTEGER NOT NULL, ProductCode TEXT NOT NULL, Price TEXT NOT NULL, PRIMARY KEY(CustomerId,ProductCode));
                    """;
                command.ExecuteNonQuery();
                var columns = new HashSet<string>();
                command.CommandText = "PRAGMA table_info(RubikaDispatchItems)";
                using (var r = command.ExecuteReader()) { while (r.Read()) columns.Add(r.GetString(1)); }
                foreach (var (name, definition) in new[] { ("Pdf", "BLOB"), ("Payload", "TEXT NOT NULL DEFAULT ''"), ("ChatId", "TEXT NOT NULL DEFAULT ''") })
                {
                    if (columns.Contains(name)) continue;
                    command.CommandText = $"ALTER TABLE RubikaDispatchItems ADD COLUMN {name} {definition}";
                    command.ExecuteNonQuery();
                }
                _initialized = true;
            }
        }
        return connection;
    }
    public string Prepare(IReadOnlyList<RubikaMessage> messages, string sender)
    {
        using var connection = Open();
        using var tx = connection.BeginTransaction();
        using (var cleanup = connection.CreateCommand())
        {
            cleanup.Transaction = tx;
            cleanup.CommandText = "DELETE FROM RubikaDispatchItems WHERE RunId IN (SELECT Id FROM RubikaDispatches WHERE Status='prepared' AND Created<$expiry); DELETE FROM RubikaDispatches WHERE Status='prepared' AND Created<$expiry";
            cleanup.Parameters.AddWithValue("$expiry", DateTime.UtcNow.AddMinutes(-10).ToString("O"));
            cleanup.ExecuteNonQuery();
        }
        var id = Guid.NewGuid().ToString("N");
        using var command = connection.CreateCommand();
        command.Transaction = tx;
        command.CommandText = "INSERT INTO RubikaDispatches VALUES($id,'prepared',$now,$sender)";
        command.Parameters.AddWithValue("$id", id);
        command.Parameters.AddWithValue("$now", DateTime.UtcNow.ToString("O"));
        command.Parameters.AddWithValue("$sender", sender);
        command.ExecuteNonQuery();
        foreach (var item in messages)
        {
            using var insert = connection.CreateCommand();
            insert.Transaction = tx;
            insert.CommandText = "INSERT INTO RubikaDispatchItems(RunId,Phone,Name,Text,Status,Pdf,Payload,ChatId) VALUES($id,$phone,$name,$text,'prepared',$pdf,$payload,$chat)";
            insert.Parameters.AddWithValue("$chat", item.ChatId);
            insert.Parameters.AddWithValue("$id", id);
            insert.Parameters.AddWithValue("$phone", item.Phone);
            insert.Parameters.AddWithValue("$name", item.Name);
            insert.Parameters.AddWithValue("$text", item.Text);
            insert.Parameters.AddWithValue("$pdf", (object?)item.Pdf ?? DBNull.Value);
            insert.Parameters.AddWithValue("$payload", item.Document is null ? "" : JsonSerializer.Serialize(item.Document, JsonOptions));
            insert.ExecuteNonQuery();
        }
        tx.Commit();
        return id;
    }
    public bool Active()
    {
        using var c = Open(); using var cmd = c.CreateCommand();
        cmd.CommandText = "SELECT COUNT(*) FROM RubikaDispatches WHERE Status IN ('queued','running')";
        return Convert.ToInt32(cmd.ExecuteScalar()) > 0;
    }
    public bool Confirm(string id, string sender)
    {
        using var c = Open(); using var tx = c.BeginTransaction(); using var cmd = c.CreateCommand();
        cmd.Transaction = tx;
        cmd.CommandText = "UPDATE RubikaDispatches SET Status='queued' WHERE Id=$id AND Status='prepared' AND Sender=$sender AND Created>$expiry";
        cmd.Parameters.AddWithValue("$id", id); cmd.Parameters.AddWithValue("$sender", sender);
        cmd.Parameters.AddWithValue("$expiry", DateTime.UtcNow.AddMinutes(-10).ToString("O"));
        try { if (cmd.ExecuteNonQuery() != 1) return false; }
        catch (SqliteException e) when (e.SqliteErrorCode == 19) { return false; }
        cmd.CommandText = "UPDATE RubikaDispatchItems SET Status='queued' WHERE RunId=$id"; cmd.ExecuteNonQuery();
        tx.Commit(); return true;
    }
    public RubikaDispatchStatus? Status(string? id = null)
    {
        using var c = Open(); using var cmd = c.CreateCommand();
        cmd.CommandText = id is null ? "SELECT Id,Status,Sender FROM RubikaDispatches WHERE Status<>'prepared' ORDER BY Created DESC LIMIT 1" : "SELECT Id,Status,Sender FROM RubikaDispatches WHERE Id=$id";
        if (id is not null) cmd.Parameters.AddWithValue("$id", id);
        string run, state, sender;
        using (var r = cmd.ExecuteReader()) { if (!r.Read()) return null; run = r.GetString(0); state = r.GetString(1); sender = r.GetString(2); }
        cmd.Parameters.Clear(); cmd.Parameters.AddWithValue("$id", run);
        cmd.CommandText = "SELECT Id,Phone,Name,Text,Status,Error,Pdf,ChatId,Payload FROM RubikaDispatchItems WHERE RunId=$id ORDER BY Id";
        var items = new List<RubikaDispatchItem>();
        using (var r = cmd.ExecuteReader()) { while(r.Read()) items.Add(new(r.GetInt64(0), r.GetString(1), r.GetString(2), r.GetString(3), r.GetString(4), r.GetString(5), r.IsDBNull(6) ? null : (byte[])r.GetValue(6), r.GetString(7), r.GetString(8).Length == 0 ? 0 : JsonSerializer.Deserialize<RubikaPriceDocument>(r.GetString(8), JsonOptions)!.CustomerId)); }
        return new(run, state, items.Count(i => i.Status == "sent"), items.Count(i => i.Status is "failed" or "unknown" or "stopped"), items.Count(i => i.Status is "queued" or "sending"), LastSent(), items, sender);
    }
    public DateTime? LastSent()
    {
        using var c = Open(); using var cmd = c.CreateCommand();
        cmd.CommandText = "SELECT MAX(SentAt) FROM RubikaDispatchItems WHERE Status='sent'";
        return cmd.ExecuteScalar() is string text ? DateTime.Parse(text, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind) : null;
    }
    public string? NextRun()
    {
        using var c = Open(); using var cmd = c.CreateCommand();
        cmd.CommandText = "SELECT Id FROM RubikaDispatches WHERE Status='queued' ORDER BY Created LIMIT 1";
        return cmd.ExecuteScalar() as string;
    }
    public void RunState(string id, string state)
    {
        using var c = Open(); using var cmd = c.CreateCommand();
        cmd.CommandText = "UPDATE RubikaDispatches SET Status=$state WHERE Id=$id";
        cmd.Parameters.AddWithValue("$state", state); cmd.Parameters.AddWithValue("$id", id); cmd.ExecuteNonQuery();
    }
    public void ItemState(long id, string state, string error = "", string? messageId = null)
    {
        using var c = Open(); using var tx = c.BeginTransaction(); using var cmd = c.CreateCommand();
        cmd.Transaction = tx;
        cmd.CommandText = "UPDATE RubikaDispatchItems SET Status=$state,Error=$error,MessageId=$message,SentAt=$sent WHERE Id=$id";
        cmd.Parameters.AddWithValue("$state", state); cmd.Parameters.AddWithValue("$error", error);
        cmd.Parameters.AddWithValue("$id", id); cmd.Parameters.AddWithValue("$message", (object?)messageId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$sent", state == "sent" ? DateTime.UtcNow.ToString("O") : DBNull.Value); cmd.ExecuteNonQuery();
        if (state == "sent")
        {
            cmd.CommandText = "SELECT Payload FROM RubikaDispatchItems WHERE Id=$id";
            var payload = cmd.ExecuteScalar() as string;
            if (!string.IsNullOrEmpty(payload))
            {
                var document = JsonSerializer.Deserialize<RubikaPriceDocument>(payload, JsonOptions)!;
                foreach (var row in document.Rows)
                {
                    using var upsert = c.CreateCommand(); upsert.Transaction = tx;
                    upsert.CommandText = "INSERT INTO RubikaSentPrices VALUES($customer,$product,$price) ON CONFLICT(CustomerId,ProductCode) DO UPDATE SET Price=excluded.Price";
                    upsert.Parameters.AddWithValue("$customer", document.CustomerId);
                    upsert.Parameters.AddWithValue("$product", row.ProductCode);
                    upsert.Parameters.AddWithValue("$price", row.Price.ToString(CultureInfo.InvariantCulture));
                    upsert.ExecuteNonQuery();
                }
            }
        }
        tx.Commit();
    }
    public IReadOnlyDictionary<string, decimal> PreviousPrices(int customerId)
    {
        using var c = Open(); using var cmd = c.CreateCommand();
        cmd.CommandText = "SELECT ProductCode,Price FROM RubikaSentPrices WHERE CustomerId=$id";
        cmd.Parameters.AddWithValue("$id", customerId);
        using var r = cmd.ExecuteReader(); var prices = new Dictionary<string, decimal>(StringComparer.OrdinalIgnoreCase);
        while (r.Read()) prices.Add(r.GetString(0), decimal.Parse(r.GetString(1), CultureInfo.InvariantCulture));
        return prices;
    }
    public void Stop(string id, string reason)
    {
        using var c = Open(); using var cmd = c.CreateCommand();
        cmd.CommandText = "UPDATE RubikaDispatchItems SET Status='stopped',Error=$reason WHERE RunId=$id AND Status='queued'; UPDATE RubikaDispatches SET Status='stopped' WHERE Id=$id";
        cmd.Parameters.AddWithValue("$id", id); cmd.Parameters.AddWithValue("$reason", reason); cmd.ExecuteNonQuery();
    }
    public void Recover()
    {
        using var c = Open(); using var cmd = c.CreateCommand();
        cmd.CommandText = """
            UPDATE RubikaDispatchItems SET Status='unknown',Error='برنامه حین ارسال بسته شد؛ پیش از ارسال مجدد روبیکا را بررسی کنید.' WHERE Status='sending';
            UPDATE RubikaDispatchItems SET Status='stopped',Error='ارسال به دلیل راه‌اندازی مجدد برنامه متوقف شد.' WHERE Status='queued';
            UPDATE RubikaDispatches SET Status='stopped' WHERE Status IN ('queued','running');
            DELETE FROM RubikaDispatchItems WHERE RunId IN (SELECT Id FROM RubikaDispatches WHERE Status='prepared');
            DELETE FROM RubikaDispatches WHERE Status='prepared';
            """;
        cmd.ExecuteNonQuery();
    }
}
