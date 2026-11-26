using System.Globalization;
using System.Text.Json;
using Microsoft.Data.Sqlite;
using TextilePricingApp.Models;

namespace TextilePricingApp.Services;

public sealed class SettingsRepository
{
    private readonly string _databasePath;
    private readonly string _seedPath;
    private readonly AuditLogRepository _auditLogs;
    private readonly object _gate = new();
    private bool _initialized;

    public SettingsRepository(IWebHostEnvironment environment, AuditLogRepository auditLogs)
    {
        _databasePath = Path.Combine(environment.ContentRootPath, "App_Data", "pricing.db");
        _seedPath = Path.Combine(environment.ContentRootPath, "Data", "seed.json");
        _auditLogs = auditLogs;
    }

    public PricingSettings Get()
    {
        EnsureInitialized();

        using var connection = OpenConnection();
        return new PricingSettings
        {
            CompanyName = ReadString(connection, "CompanyName"),
            DollarRate = ReadDecimal(connection, "DollarRate"),
            DollarIncreasePercent = ReadDecimal(connection, "DollarIncreasePercent"),
            VatRate = ReadDecimal(connection, "VatRate"),
            GlobalProfitPercent = ReadDecimal(connection, "GlobalProfitPercent"),
            CashPaymentDiscountPercent = ReadDecimal(connection, "CashPaymentDiscountPercent"),
            ForeignTransportPerContainerUsd = ReadDecimal(connection, "ForeignTransportPerContainerUsd"),
            DomesticTransportPerContainerRial = ReadDecimal(connection, "DomesticTransportPerContainerRial"),
            SourceFile = ReadString(connection, "SourceFile"),
            DollarUpdatedAt = ReadDateTime(connection, "DollarUpdatedAt"),
            DollarRefreshDays = ReadInt(connection, "DollarRefreshDays", 1),
            GoodsRefreshDays = ReadInt(connection, "GoodsRefreshDays", 30),
            ServicesRefreshDays = ReadInt(connection, "ServicesRefreshDays", 30),
            PriceChangeConfirmationThresholdPercent = ReadDecimal(connection, "PriceChangeConfirmationThresholdPercent", 20m),
            EnforceAnalysisSelectionScope = ReadBool(connection, "EnforceAnalysisSelectionScope", true)
        };
    }

    public void Update(PricingSettingsInput input, bool refreshDollarTimestamp = false)
    {
        EnsureInitialized();
        var oldSettings = Get();

        using var connection = OpenConnection();
        var currentDollarRate = ReadDecimal(connection, "DollarRate");
        var currentDollarIncreasePercent = ReadDecimal(connection, "DollarIncreasePercent");
        var currentDollarUpdatedAt = ReadString(connection, "DollarUpdatedAt");
        using var transaction = connection.BeginTransaction();
        Upsert(connection, transaction, "CompanyName", (input.CompanyName ?? "").Trim());
        Upsert(connection, transaction, "DollarRate", input.DollarRate);
        Upsert(connection, transaction, "DollarIncreasePercent", input.DollarIncreasePercent);
        Upsert(connection, transaction, "VatRate", input.VatPercent / 100m);
        Upsert(connection, transaction, "GlobalProfitPercent", input.GlobalProfitPercent);
        Upsert(connection, transaction, "CashPaymentDiscountPercent", input.CashPaymentDiscountPercent);
        Upsert(connection, transaction, "ForeignTransportPerContainerUsd", input.ForeignTransportPerContainerUsd);
        Upsert(connection, transaction, "DomesticTransportPerContainerRial", input.DomesticTransportPerContainerRial);
        Upsert(connection, transaction, "DollarRefreshDays", Math.Max(1, input.DollarRefreshDays));
        Upsert(connection, transaction, "GoodsRefreshDays", Math.Max(1, input.GoodsRefreshDays));
        Upsert(connection, transaction, "ServicesRefreshDays", Math.Max(1, input.ServicesRefreshDays));
        Upsert(connection, transaction, "PriceChangeConfirmationThresholdPercent", Math.Max(0, input.PriceChangeConfirmationThresholdPercent));
        Upsert(connection, transaction, "EnforceAnalysisSelectionScope", input.EnforceAnalysisSelectionScope);

        if (refreshDollarTimestamp ||
            currentDollarRate != input.DollarRate ||
            currentDollarIncreasePercent != input.DollarIncreasePercent ||
            string.IsNullOrWhiteSpace(currentDollarUpdatedAt))
        {
            Upsert(connection, transaction, "DollarUpdatedAt", DateTime.UtcNow);
        }

        transaction.Commit();
        _auditLogs.AddMany(
        [
            AuditLogRepository.Create("تنظیمات", "تنظیمات", "CompanyName", "نام شرکت", "نام شرکت", oldSettings.CompanyName, (input.CompanyName ?? "").Trim(), "ویرایش", "Text", "Settings"),
            AuditLogRepository.CreateDecimal("تنظیمات", "تنظیمات", "DollarRate", "نرخ دلار", "نرخ دلار", oldSettings.DollarRate, input.DollarRate, "ویرایش", "Price", "Settings"),
            AuditLogRepository.CreateDecimal("تنظیمات", "تنظیمات", "DollarIncreasePercent", "درصد افزایش دلار", "درصد افزایش دلار", oldSettings.DollarIncreasePercent, input.DollarIncreasePercent, "ویرایش", "Percent", "Settings"),
            AuditLogRepository.CreateDecimal("تنظیمات", "تنظیمات", "VatRate", "مالیات بر ارزش افزوده", "درصد مالیات", oldSettings.VatRate * 100m, input.VatPercent, "ویرایش", "Percent", "Settings"),
            AuditLogRepository.CreateDecimal("تنظیمات", "تنظیمات", "GlobalProfitPercent", "سود همه محصولات", "درصد سود", oldSettings.GlobalProfitPercent, input.GlobalProfitPercent, "ویرایش", "Percent", "Settings"),
            AuditLogRepository.CreateDecimal("تنظیمات", "تنظیمات", "CashPaymentDiscountPercent", "تخفیف پرداخت نقدی", "درصد تخفیف", oldSettings.CashPaymentDiscountPercent, input.CashPaymentDiscountPercent, "ویرایش", "Percent", "Settings"),
            AuditLogRepository.CreateDecimal("تنظیمات", "تنظیمات", "ForeignTransportPerContainerUsd", "حمل خارجی کانتینر", "هزینه دلاری", oldSettings.ForeignTransportPerContainerUsd, input.ForeignTransportPerContainerUsd, "ویرایش", "Price", "Settings"),
            AuditLogRepository.CreateDecimal("تنظیمات", "تنظیمات", "DomesticTransportPerContainerRial", "حمل داخلی کانتینر", "هزینه ریالی", oldSettings.DomesticTransportPerContainerRial, input.DomesticTransportPerContainerRial, "ویرایش", "Price", "Settings"),
            AuditLogRepository.CreateDecimal("تنظیمات", "تنظیمات", "DollarRefreshDays", "اعتبار نرخ دلار", "روز اعتبار", oldSettings.DollarRefreshDays, Math.Max(1, input.DollarRefreshDays), "ویرایش", "Number", "Settings"),
            AuditLogRepository.CreateDecimal("تنظیمات", "تنظیمات", "GoodsRefreshDays", "اعتبار قیمت کالا", "روز اعتبار", oldSettings.GoodsRefreshDays, Math.Max(1, input.GoodsRefreshDays), "ویرایش", "Number", "Settings"),
            AuditLogRepository.CreateDecimal("تنظیمات", "تنظیمات", "ServicesRefreshDays", "اعتبار قیمت خدمات", "روز اعتبار", oldSettings.ServicesRefreshDays, Math.Max(1, input.ServicesRefreshDays), "ویرایش", "Number", "Settings")
            ,AuditLogRepository.CreateDecimal("تنظیمات", "تنظیمات", "PriceChangeConfirmationThresholdPercent", "آستانه تأیید تغییر قیمت", "درصد آستانه", oldSettings.PriceChangeConfirmationThresholdPercent, Math.Max(0, input.PriceChangeConfirmationThresholdPercent), "ویرایش", "Percent", "Settings")
        ]);
        _auditLogs.Add(AuditLogRepository.Create(
            "تنظیمات",
            "تنظیمات",
            "EnforceAnalysisSelectionScope",
            "کنترل گزینه‌های مجاز آنالیز",
            "وضعیت",
            oldSettings.EnforceAnalysisSelectionScope ? "فعال" : "غیرفعال",
            input.EnforceAnalysisSelectionScope ? "فعال" : "غیرفعال",
            "ویرایش",
            "Text",
            "Settings"));
    }

    private void EnsureInitialized()
    {
        if (_initialized)
        {
            return;
        }

        lock (_gate)
        {
            if (_initialized)
            {
                return;
            }

            Directory.CreateDirectory(Path.GetDirectoryName(_databasePath)!);
            using var connection = OpenConnection();
            using var command = connection.CreateCommand();
            command.CommandText = """
                CREATE TABLE IF NOT EXISTS AppSettings (
                    Key TEXT PRIMARY KEY,
                    Value TEXT NOT NULL
                );
                """;
            command.ExecuteNonQuery();

            SeedMissingSettings(connection);
            _initialized = true;
        }
    }

    private SqliteConnection OpenConnection()
    {
        var connection = new SqliteConnection($"Data Source={_databasePath}");
        connection.Open();
        return connection;
    }

    private void SeedMissingSettings(SqliteConnection connection)
    {
        using var stream = File.OpenRead(_seedPath);
        var seed = JsonSerializer.Deserialize<PricingData>(stream, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        }) ?? new PricingData();

        using var transaction = connection.BeginTransaction();
        UpsertMissing(connection, transaction, "DollarRate", seed.Settings.DollarRate);
        UpsertMissing(connection, transaction, "DollarIncreasePercent", 0);
        UpsertMissing(connection, transaction, "VatRate", seed.Settings.VatRate);
        UpsertMissing(connection, transaction, "GlobalProfitPercent", seed.ProfitTiers.FirstOrDefault()?.Percent ?? 0);
        UpsertMissing(connection, transaction, "CashPaymentDiscountPercent", 0);
        UpsertMissing(connection, transaction, "ForeignTransportPerContainerUsd", 0);
        UpsertMissing(connection, transaction, "DomesticTransportPerContainerRial", 0);
        UpsertMissing(connection, transaction, "SourceFile", seed.Settings.SourceFile);
        UpsertMissing(connection, transaction, "DollarUpdatedAt", DateTime.UtcNow);
        UpsertMissing(connection, transaction, "DollarRefreshDays", 1);
        UpsertMissing(connection, transaction, "GoodsRefreshDays", 30);
        UpsertMissing(connection, transaction, "ServicesRefreshDays", 30);
        UpsertMissing(connection, transaction, "PriceChangeConfirmationThresholdPercent", 20m);
        UpsertMissing(connection, transaction, "EnforceAnalysisSelectionScope", true);
        transaction.Commit();
    }

    private static decimal ReadDecimal(SqliteConnection connection, string key)
    {
        return ReadDecimal(connection, key, 0);
    }

    private static decimal ReadDecimal(SqliteConnection connection, string key, decimal fallback)
    {
        var value = ReadString(connection, key);
        return decimal.TryParse(value, CultureInfo.InvariantCulture, out var result) ? result : fallback;
    }

    private static string ReadString(SqliteConnection connection, string key)
    {
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT Value FROM AppSettings WHERE Key = $key";
        command.Parameters.AddWithValue("$key", key);
        return Convert.ToString(command.ExecuteScalar(), CultureInfo.InvariantCulture) ?? "";
    }

    private static DateTime ReadDateTime(SqliteConnection connection, string key)
    {
        var value = ReadString(connection, key);
        return DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var result)
            ? result
            : DateTime.UtcNow;
    }

    private static int ReadInt(SqliteConnection connection, string key, int fallback)
    {
        var value = ReadString(connection, key);
        return int.TryParse(value, CultureInfo.InvariantCulture, out var result) && result > 0 ? result : fallback;
    }

    private static bool ReadBool(SqliteConnection connection, string key, bool fallback)
    {
        var value = ReadString(connection, key);
        if (string.IsNullOrWhiteSpace(value))
        {
            return fallback;
        }

        return value.Trim() switch
        {
            "1" => true,
            "0" => false,
            _ => bool.TryParse(value, out var result) ? result : fallback
        };
    }

    private static void Upsert(SqliteConnection connection, SqliteTransaction transaction, string key, decimal value)
    {
        Upsert(connection, transaction, key, value.ToString(CultureInfo.InvariantCulture));
    }

    private static void Upsert(SqliteConnection connection, SqliteTransaction transaction, string key, int value)
    {
        Upsert(connection, transaction, key, value.ToString(CultureInfo.InvariantCulture));
    }

    private static void Upsert(SqliteConnection connection, SqliteTransaction transaction, string key, bool value)
    {
        Upsert(connection, transaction, key, value ? "1" : "0");
    }

    private static void Upsert(SqliteConnection connection, SqliteTransaction transaction, string key, DateTime value)
    {
        Upsert(connection, transaction, key, value.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture));
    }

    private static void Upsert(SqliteConnection connection, SqliteTransaction transaction, string key, string value)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            INSERT INTO AppSettings (Key, Value)
            VALUES ($key, $value)
            ON CONFLICT(Key) DO UPDATE SET Value = excluded.Value
            """;
        command.Parameters.AddWithValue("$key", key);
        command.Parameters.AddWithValue("$value", value);
        command.ExecuteNonQuery();
    }

    private static void UpsertMissing(SqliteConnection connection, SqliteTransaction transaction, string key, decimal value)
    {
        UpsertMissing(connection, transaction, key, value.ToString(CultureInfo.InvariantCulture));
    }

    private static void UpsertMissing(SqliteConnection connection, SqliteTransaction transaction, string key, int value)
    {
        UpsertMissing(connection, transaction, key, value.ToString(CultureInfo.InvariantCulture));
    }

    private static void UpsertMissing(SqliteConnection connection, SqliteTransaction transaction, string key, bool value)
    {
        UpsertMissing(connection, transaction, key, value ? "1" : "0");
    }

    private static void UpsertMissing(SqliteConnection connection, SqliteTransaction transaction, string key, DateTime value)
    {
        UpsertMissing(connection, transaction, key, value.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture));
    }

    private static void UpsertMissing(SqliteConnection connection, SqliteTransaction transaction, string key, string value)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            INSERT OR IGNORE INTO AppSettings (Key, Value)
            VALUES ($key, $value)
            """;
        command.Parameters.AddWithValue("$key", key);
        command.Parameters.AddWithValue("$value", value);
        command.ExecuteNonQuery();
    }
}
