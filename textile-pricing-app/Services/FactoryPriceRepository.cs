using System.Globalization;
using Microsoft.Data.Sqlite;

namespace TextilePricingApp.Services;

public sealed class FactoryPriceRepository
{
    private readonly string _databasePath;
    private readonly AuditLogRepository _auditLogs;
    private readonly object _gate = new();
    private bool _initialized;

    public FactoryPriceRepository(IWebHostEnvironment environment, AuditLogRepository auditLogs)
    {
        _databasePath = Path.Combine(environment.ContentRootPath, "App_Data", "pricing.db");
        _auditLogs = auditLogs;
    }

    public IReadOnlyDictionary<string, decimal> GetAll()
    {
        EnsureInitialized();

        var prices = new Dictionary<string, decimal>(StringComparer.CurrentCultureIgnoreCase);
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT ProductCode, Price
            FROM FactorySalePrices
            """;

        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            prices[reader.GetString(0)] = ReadDecimal(reader, 1);
        }

        return prices;
    }

    public IReadOnlyDictionary<string, FactorySalePrice> GetAllDetails()
    {
        EnsureInitialized();

        var prices = new Dictionary<string, FactorySalePrice>(StringComparer.CurrentCultureIgnoreCase);
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT ProductCode, Price, LastEditedAt, BaseProfitPercent
            FROM FactorySalePrices
            """;

        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            var item = new FactorySalePrice(
                reader.GetString(0),
                ReadDecimal(reader, 1),
                ReadDateTime(reader, 2),
                ReadNullableDecimal(reader, 3));
            prices[item.ProductCode] = item;
        }

        return prices;
    }

    public void UpsertMany(IEnumerable<FactoryPriceInput> prices)
    {
        EnsureInitialized();
        var inputItems = prices.ToList();
        var oldItems = GetAllDetails();
        var auditItems = new List<AuditLogInput>();

        using var connection = OpenConnection();
        using var transaction = connection.BeginTransaction();
        foreach (var price in inputItems)
        {
            oldItems.TryGetValue(price.ProductCode.Trim(), out var oldPrice);
            var roundedPrice = decimal.Round(price.Price, 0, MidpointRounding.AwayFromZero);
            var roundedBaseProfit = decimal.Round(price.BaseProfitPercent, 4, MidpointRounding.AwayFromZero);
            using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText = """
                INSERT INTO FactorySalePrices (ProductCode, Price, LastEditedAt, BaseProfitPercent)
                VALUES ($productCode, $price, $lastEditedAt, $baseProfitPercent)
                ON CONFLICT(ProductCode) DO UPDATE
                SET Price = excluded.Price,
                    LastEditedAt = excluded.LastEditedAt,
                    BaseProfitPercent = excluded.BaseProfitPercent
                """;
            command.Parameters.AddWithValue("$productCode", price.ProductCode.Trim());
            command.Parameters.AddWithValue("$price", StoreDecimal(roundedPrice));
            command.Parameters.AddWithValue("$lastEditedAt", StoreDateTime(DateTime.UtcNow));
            command.Parameters.AddWithValue("$baseProfitPercent", StoreDecimal(roundedBaseProfit));
            var changed = command.ExecuteNonQuery();
            if (changed > 0)
            {
                var operation = oldPrice is null ? "ثبت" : "ویرایش";
                auditItems.Add(AuditLogRepository.CreateDecimal("قیمت فروش کارخانه", "قیمت محصول کارخانه", price.ProductCode.Trim(), price.ProductCode.Trim(), "فروش اعتباری کارخانه", oldPrice?.Price, roundedPrice, operation, "Price", "FactoryPrices"));
                auditItems.Add(AuditLogRepository.CreateDecimal("قیمت فروش کارخانه", "قیمت محصول کارخانه", price.ProductCode.Trim(), price.ProductCode.Trim(), "درصد سود مطلوب", oldPrice?.BaseProfitPercent, roundedBaseProfit, operation, "Percent", "FactoryPrices"));
            }
        }

        transaction.Commit();
        _auditLogs.AddMany(auditItems);
    }

    public void DeleteMany(IEnumerable<string> productCodes)
    {
        EnsureInitialized();
        var oldItems = GetAllDetails();
        var auditItems = new List<AuditLogInput>();

        using var connection = OpenConnection();
        using var transaction = connection.BeginTransaction();
        foreach (var productCode in productCodes.Where(code => !string.IsNullOrWhiteSpace(code)).Distinct(StringComparer.CurrentCultureIgnoreCase))
        {
            using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText = "DELETE FROM FactorySalePrices WHERE ProductCode = $productCode";
            command.Parameters.AddWithValue("$productCode", productCode.Trim());
            var changed = command.ExecuteNonQuery();
            if (changed > 0 && oldItems.TryGetValue(productCode.Trim(), out var oldPrice))
            {
                auditItems.Add(AuditLogRepository.CreateDecimal("قیمت فروش کارخانه", "قیمت محصول کارخانه", productCode.Trim(), productCode.Trim(), "فروش اعتباری کارخانه", oldPrice.Price, null, "حذف", "Price", "FactoryPrices"));
                auditItems.Add(AuditLogRepository.CreateDecimal("قیمت فروش کارخانه", "قیمت محصول کارخانه", productCode.Trim(), productCode.Trim(), "درصد سود مطلوب", oldPrice.BaseProfitPercent, null, "حذف", "Percent", "FactoryPrices"));
            }
        }

        transaction.Commit();
        _auditLogs.AddMany(auditItems);
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
                CREATE TABLE IF NOT EXISTS FactorySalePrices (
                    ProductCode TEXT PRIMARY KEY,
                    Price TEXT NOT NULL,
                    LastEditedAt TEXT NOT NULL DEFAULT '',
                    BaseProfitPercent TEXT NOT NULL DEFAULT ''
                );
                """;
            command.ExecuteNonQuery();

            command.CommandText = "PRAGMA table_info(FactorySalePrices)";
            var hasLastEditedAt = false;
            var hasBaseProfitPercent = false;
            using (var reader = command.ExecuteReader())
            {
                while (reader.Read())
                {
                    if (string.Equals(reader.GetString(1), "LastEditedAt", StringComparison.OrdinalIgnoreCase))
                    {
                        hasLastEditedAt = true;
                    }

                    if (string.Equals(reader.GetString(1), "BaseProfitPercent", StringComparison.OrdinalIgnoreCase))
                    {
                        hasBaseProfitPercent = true;
                    }
                }
            }

            if (!hasLastEditedAt)
            {
                command.CommandText = "ALTER TABLE FactorySalePrices ADD COLUMN LastEditedAt TEXT NOT NULL DEFAULT ''";
                command.ExecuteNonQuery();
            }

            if (!hasBaseProfitPercent)
            {
                command.CommandText = "ALTER TABLE FactorySalePrices ADD COLUMN BaseProfitPercent TEXT NOT NULL DEFAULT ''";
                command.ExecuteNonQuery();
            }

            _initialized = true;
        }
    }

    private SqliteConnection OpenConnection()
    {
        var connection = new SqliteConnection($"Data Source={_databasePath}");
        connection.Open();
        return connection;
    }

    private static decimal ReadDecimal(SqliteDataReader reader, int ordinal)
    {
        return decimal.Parse(reader.GetString(ordinal), CultureInfo.InvariantCulture);
    }

    private static decimal? ReadNullableDecimal(SqliteDataReader reader, int ordinal)
    {
        var raw = reader.GetString(ordinal);
        return decimal.TryParse(raw, CultureInfo.InvariantCulture, out var value)
            ? value
            : null;
    }

    private static string StoreDecimal(decimal value)
    {
        return value.ToString(CultureInfo.InvariantCulture);
    }

    private static DateTime? ReadDateTime(SqliteDataReader reader, int ordinal)
    {
        var raw = reader.GetString(ordinal);
        return DateTime.TryParse(raw, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var value)
            ? value
            : null;
    }

    private static string StoreDateTime(DateTime value)
    {
        return value.ToString("O", CultureInfo.InvariantCulture);
    }
}

public sealed record FactoryPriceInput(string ProductCode, decimal Price, decimal BaseProfitPercent);
public sealed record FactorySalePrice(string ProductCode, decimal Price, DateTime? LastEditedAt, decimal? BaseProfitPercent);
