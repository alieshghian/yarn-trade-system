using Microsoft.Data.Sqlite;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.DataProtection;

namespace TextilePricingApp.Services;

public sealed record RubikaBotConnection(string ChatId, string PendingChatId, string PendingName);
public sealed class RubikaBotConnectionRepository(IWebHostEnvironment environment, IDataProtectionProvider protection)
{
    private readonly IDataProtector _protector = protection.CreateProtector("RubikaBot.Invite.v1");
    private readonly object _schemaGate = new();
    private bool _schemaReady;
    private SqliteConnection Open()
    {
        Directory.CreateDirectory(Path.Combine(environment.ContentRootPath, "App_Data"));
        var c = new SqliteConnection($"Data Source={Path.Combine(environment.ContentRootPath, "App_Data", "pricing.db")}");
        c.Open();
        lock (_schemaGate)
        {
            if (_schemaReady) return c;
            using var cmd = c.CreateCommand();
            cmd.CommandText = """
                CREATE TABLE IF NOT EXISTS RubikaBotConnections(CustomerId INTEGER NOT NULL, BotId TEXT NOT NULL, ChatId TEXT NOT NULL DEFAULT '', PendingChatId TEXT NOT NULL DEFAULT '', PendingName TEXT NOT NULL DEFAULT '', InviteHash TEXT NOT NULL DEFAULT '', Expires TEXT NOT NULL DEFAULT '', PRIMARY KEY(CustomerId,BotId));
                CREATE UNIQUE INDEX IF NOT EXISTS IX_RubikaBotChat ON RubikaBotConnections(BotId,ChatId) WHERE ChatId<>'';
                CREATE TABLE IF NOT EXISTS RubikaBotOffsets(BotId TEXT PRIMARY KEY, OffsetId TEXT NOT NULL);
                """; cmd.ExecuteNonQuery();
            cmd.CommandText = "SELECT COUNT(*) FROM pragma_table_info('RubikaBotConnections') WHERE name='InviteProtected'";
            if (Convert.ToInt32(cmd.ExecuteScalar()) == 0)
            {
                cmd.CommandText = "ALTER TABLE RubikaBotConnections ADD COLUMN InviteProtected TEXT NOT NULL DEFAULT ''";
                cmd.ExecuteNonQuery();
            }
            _schemaReady = true;
        }
        return c;
    }
    private static string Hash(string code) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(code)));
    private IDataProtector InviteProtector(int id, string botId) => _protector.CreateProtector(botId, id.ToString(System.Globalization.CultureInfo.InvariantCulture));
    public string? InviteCode(int id, string botId)
    {
        using var c = Open(); using var cmd = c.CreateCommand();
        cmd.CommandText = "SELECT InviteProtected,InviteHash FROM RubikaBotConnections WHERE CustomerId=$id AND BotId=$bot AND InviteHash<>'' AND Expires>$now AND EXISTS(SELECT 1 FROM Customers WHERE Id=$id)";
        cmd.Parameters.AddWithValue("$id", id); cmd.Parameters.AddWithValue("$bot", botId); cmd.Parameters.AddWithValue("$now", DateTime.UtcNow.ToString("O"));
        using var r = cmd.ExecuteReader();
        if (!r.Read() || r.GetString(0).Length == 0) return null;
        try
        {
            var code = InviteProtector(id, botId).Unprotect(r.GetString(0));
            return Hash(code) == r.GetString(1) ? code : null;
        }
        catch (CryptographicException) { return null; }
    }
    public RubikaBotConnection Get(int customerId, string botId)
    {
        using var c = Open(); using var cmd = c.CreateCommand();
        cmd.CommandText = "SELECT ChatId,PendingChatId,PendingName FROM RubikaBotConnections WHERE CustomerId=$id AND BotId=$bot AND EXISTS(SELECT 1 FROM Customers WHERE Id=$id)";
        cmd.Parameters.AddWithValue("$id", customerId); cmd.Parameters.AddWithValue("$bot", botId);
        using var r = cmd.ExecuteReader(); return r.Read() ? new(r.GetString(0), r.GetString(1), r.GetString(2)) : new("", "", "");
    }
    public string Invite(int customerId, string botId)
    {
        var code = Convert.ToHexString(RandomNumberGenerator.GetBytes(24)).ToLowerInvariant();
        using var c = Open(); using var cmd = c.CreateCommand();
        cmd.CommandText = """
            INSERT INTO RubikaBotConnections(CustomerId,BotId,InviteHash,Expires,InviteProtected) VALUES($id,$bot,$hash,$expires,$protected)
            ON CONFLICT(CustomerId,BotId) DO UPDATE SET InviteHash=excluded.InviteHash,Expires=excluded.Expires,InviteProtected=excluded.InviteProtected,PendingChatId='',PendingName='';
            """;
        cmd.Parameters.AddWithValue("$id", customerId); cmd.Parameters.AddWithValue("$bot", botId);
        cmd.Parameters.AddWithValue("$hash", Hash(code)); cmd.Parameters.AddWithValue("$expires", DateTime.UtcNow.AddDays(7).ToString("O"));
        cmd.Parameters.AddWithValue("$protected", InviteProtector(customerId, botId).Protect(code));
        cmd.ExecuteNonQuery(); return code;
    }
    public bool Claim(string botId, string code, string chatId, string name)
    {
        if (code.Length != 48 || !code.All(Uri.IsHexDigit) || string.IsNullOrWhiteSpace(chatId) || chatId.Length > 200) return false;
        code = code.ToLowerInvariant();
        using var c = Open(); using var cmd = c.CreateCommand();
        cmd.CommandText = """
            UPDATE RubikaBotConnections SET PendingChatId=$chat,PendingName=$name,InviteHash='',InviteProtected=''
            WHERE BotId=$bot AND InviteHash=$hash AND Expires>$now AND EXISTS(SELECT 1 FROM Customers WHERE Id=CustomerId)
            AND NOT EXISTS(SELECT 1 FROM RubikaBotConnections WHERE BotId=$bot AND (ChatId=$chat OR PendingChatId=$chat));
            """;
        cmd.Parameters.AddWithValue("$chat", chatId); cmd.Parameters.AddWithValue("$name", name.Length > 200 ? name[..200] : name);
        cmd.Parameters.AddWithValue("$bot", botId); cmd.Parameters.AddWithValue("$hash", Hash(code)); cmd.Parameters.AddWithValue("$now", DateTime.UtcNow.ToString("O"));
        return cmd.ExecuteNonQuery() == 1;
    }
    public bool Approve(int id, string botId, string expectedChat)
    {
        if (expectedChat.Length == 0) return false;
        using var c = Open(); using var cmd = c.CreateCommand();
        cmd.CommandText = "UPDATE RubikaBotConnections SET ChatId=PendingChatId,PendingChatId='',PendingName='',InviteHash='',InviteProtected='' WHERE CustomerId=$id AND BotId=$bot AND PendingChatId=$chat AND EXISTS(SELECT 1 FROM Customers WHERE Id=$id)";
        cmd.Parameters.AddWithValue("$id", id); cmd.Parameters.AddWithValue("$bot", botId); cmd.Parameters.AddWithValue("$chat", expectedChat);
        try { return cmd.ExecuteNonQuery() == 1; } catch (SqliteException e) when (e.SqliteErrorCode == 19) { return false; }
    }
    public void Unlink(int id, string botId)
    {
        using var c = Open(); using var cmd = c.CreateCommand();
        cmd.CommandText = "DELETE FROM RubikaBotConnections WHERE CustomerId=$id AND BotId=$bot";
        cmd.Parameters.AddWithValue("$id", id); cmd.Parameters.AddWithValue("$bot", botId); cmd.ExecuteNonQuery();
    }
    public void Stopped(string botId, string chatId)
    {
        using var c = Open(); using var cmd = c.CreateCommand();
        cmd.CommandText = "UPDATE RubikaBotConnections SET ChatId='',PendingChatId='',PendingName='',InviteHash='',InviteProtected='' WHERE BotId=$bot AND (ChatId=$chat OR PendingChatId=$chat)";
        cmd.Parameters.AddWithValue("$bot", botId); cmd.Parameters.AddWithValue("$chat", chatId); cmd.ExecuteNonQuery();
    }
    public string Offset(string botId)
    {
        using var c = Open(); using var cmd = c.CreateCommand(); cmd.CommandText = "SELECT OffsetId FROM RubikaBotOffsets WHERE BotId=$bot";
        cmd.Parameters.AddWithValue("$bot", botId); return cmd.ExecuteScalar() as string ?? "";
    }
    public void Offset(string botId, string offset)
    {
        using var c = Open(); using var cmd = c.CreateCommand(); cmd.CommandText = "INSERT INTO RubikaBotOffsets VALUES($bot,$offset) ON CONFLICT(BotId) DO UPDATE SET OffsetId=excluded.OffsetId";
        cmd.Parameters.AddWithValue("$bot", botId); cmd.Parameters.AddWithValue("$offset", offset); cmd.ExecuteNonQuery();
    }
}
