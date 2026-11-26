using System.Globalization;
using Microsoft.Data.Sqlite;
using TextilePricingApp.Models;

namespace TextilePricingApp.Services;

public sealed class PriceSnapshotRepository
{
    private readonly string _databasePath;
    private readonly object _gate = new();
    private bool _initialized;

    public PriceSnapshotRepository(IWebHostEnvironment environment)
    {
        _databasePath = Path.Combine(environment.ContentRootPath, "App_Data", "pricing.db");
    }

    public PriceSnapshotArchiveItem Add(PriceSnapshotArchiveInput input, IEnumerable<CustomerPriceRow>? rows = null)
    {
        EnsureInitialized();
        using var connection = OpenConnection();
        using var transaction = connection.BeginTransaction();
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            INSERT INTO PriceSnapshots
                (CreatedAt, CustomerId, CustomerName, Query, StatusFilter, RowCount, FileName, RelativePath, CreatedBy, Notes)
            VALUES
                ($createdAt, $customerId, $customerName, $query, $statusFilter, $rowCount, $fileName, $relativePath, $createdBy, $notes)
            RETURNING Id
            """;
        command.Parameters.AddWithValue("$createdAt", StoreDateTime(input.CreatedAt));
        command.Parameters.AddWithValue("$customerId", input.CustomerId is > 0 ? input.CustomerId.Value : (object)DBNull.Value);
        command.Parameters.AddWithValue("$customerName", input.CustomerName.Trim());
        command.Parameters.AddWithValue("$query", input.Query.Trim());
        command.Parameters.AddWithValue("$statusFilter", input.StatusFilter.Trim());
        command.Parameters.AddWithValue("$rowCount", input.RowCount);
        command.Parameters.AddWithValue("$fileName", input.FileName.Trim());
        command.Parameters.AddWithValue("$relativePath", input.RelativePath.Trim());
        command.Parameters.AddWithValue("$createdBy", input.CreatedBy.Trim());
        command.Parameters.AddWithValue("$notes", input.Notes.Trim());
        var id = Convert.ToInt32(command.ExecuteScalar(), CultureInfo.InvariantCulture);
        if (rows is not null)
        {
            foreach (var row in rows)
            {
                using var lineCommand = connection.CreateCommand();
                lineCommand.Transaction = transaction;
                lineCommand.CommandText = """
                    INSERT INTO PriceSnapshotLines
                        (SnapshotId, CreatedAt, CustomerId, ProductCode, ProductName, CashPrice, CreditPrice)
                    VALUES
                        ($snapshotId, $createdAt, $customerId, $productCode, $productName, $cashPrice, $creditPrice)
                    """;
                lineCommand.Parameters.AddWithValue("$snapshotId", id);
                lineCommand.Parameters.AddWithValue("$createdAt", StoreDateTime(input.CreatedAt));
                lineCommand.Parameters.AddWithValue("$customerId", input.CustomerId is > 0 ? input.CustomerId.Value : (object)DBNull.Value);
                lineCommand.Parameters.AddWithValue("$productCode", row.ProductCode.Trim());
                lineCommand.Parameters.AddWithValue("$productName", row.ProductName.Trim());
                lineCommand.Parameters.AddWithValue("$cashPrice", StoreDecimal(row.CustomerCashPrice));
                lineCommand.Parameters.AddWithValue("$creditPrice", StoreDecimal(row.CustomerPrice));
                lineCommand.ExecuteNonQuery();
            }
        }

        transaction.Commit();
        return GetById(id)!;
    }

    public PriceSnapshotArchiveItem? GetById(int id)
    {
        EnsureInitialized();
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT Id, CreatedAt, CustomerId, CustomerName, Query, StatusFilter, RowCount, FileName, RelativePath, CreatedBy, Notes
            FROM PriceSnapshots
            WHERE Id = $id
            """;
        command.Parameters.AddWithValue("$id", id);
        using var reader = command.ExecuteReader();
        return reader.Read() ? ReadSnapshot(reader) : null;
    }

    public IReadOnlyList<PriceSnapshotArchiveItem> Search(
        string? query,
        int? customerId,
        DateTime? fromDate,
        DateTime? toDate,
        int take = 200)
    {
        EnsureInitialized();
        var items = new List<PriceSnapshotArchiveItem>();
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT Id, CreatedAt, CustomerId, CustomerName, Query, StatusFilter, RowCount, FileName, RelativePath, CreatedBy, Notes
            FROM PriceSnapshots
            WHERE ($customerId IS NULL OR CustomerId = $customerId)
              AND ($query = '' OR CustomerName LIKE $queryLike OR Query LIKE $queryLike OR FileName LIKE $queryLike OR CreatedBy LIKE $queryLike OR Notes LIKE $queryLike)
              AND ($fromDate = '' OR CreatedAt >= $fromDate)
              AND ($toDate = '' OR CreatedAt <= $toDate)
            ORDER BY CreatedAt DESC, Id DESC
            LIMIT $take
            """;
        var normalizedQuery = query?.Trim() ?? "";
        command.Parameters.AddWithValue("$customerId", customerId is > 0 ? customerId.Value : (object)DBNull.Value);
        command.Parameters.AddWithValue("$query", normalizedQuery);
        command.Parameters.AddWithValue("$queryLike", $"%{normalizedQuery}%");
        command.Parameters.AddWithValue("$fromDate", fromDate.HasValue ? StoreDateTime(fromDate.Value.Date) : "");
        command.Parameters.AddWithValue("$toDate", toDate.HasValue ? StoreDateTime(toDate.Value.Date.AddDays(1).AddTicks(-1)) : "");
        command.Parameters.AddWithValue("$take", take);

        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            items.Add(ReadSnapshot(reader));
        }

        return items;
    }

    public IReadOnlyDictionary<string, PriceSnapshotLineItem> GetLatestLinesByProduct(int? customerId)
    {
        EnsureInitialized();
        var items = new Dictionary<string, PriceSnapshotLineItem>(StringComparer.CurrentCultureIgnoreCase);
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT SnapshotId, CreatedAt, CustomerId, ProductCode, ProductName, CashPrice, CreditPrice
            FROM PriceSnapshotLines
            WHERE (($customerId IS NULL AND CustomerId IS NULL) OR CustomerId = $customerId)
            ORDER BY CreatedAt DESC, SnapshotId DESC
            """;
        command.Parameters.AddWithValue("$customerId", customerId is > 0 ? customerId.Value : (object)DBNull.Value);
        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            var productCode = reader.GetString(3);
            if (items.ContainsKey(productCode))
            {
                continue;
            }

            items[productCode] = new PriceSnapshotLineItem
            {
                SnapshotId = reader.GetInt32(0),
                CreatedAt = ReadDateTime(reader, 1),
                CustomerId = reader.IsDBNull(2) ? null : reader.GetInt32(2),
                ProductCode = productCode,
                ProductName = reader.GetString(4),
                CashPrice = ReadDecimal(reader, 5),
                CreditPrice = ReadDecimal(reader, 6)
            };
        }

        return items;
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
                CREATE TABLE IF NOT EXISTS PriceSnapshots (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    CreatedAt TEXT NOT NULL,
                    CustomerId INTEGER NULL,
                    CustomerName TEXT NOT NULL,
                    Query TEXT NOT NULL DEFAULT '',
                    StatusFilter TEXT NOT NULL DEFAULT 'all',
                    RowCount INTEGER NOT NULL DEFAULT 0,
                    FileName TEXT NOT NULL,
                    RelativePath TEXT NOT NULL,
                    CreatedBy TEXT NOT NULL DEFAULT '',
                    Notes TEXT NOT NULL DEFAULT ''
                );
                """;
            command.ExecuteNonQuery();
            command.CommandText = """
                CREATE TABLE IF NOT EXISTS PriceSnapshotLines (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    SnapshotId INTEGER NOT NULL,
                    CreatedAt TEXT NOT NULL,
                    CustomerId INTEGER NULL,
                    ProductCode TEXT NOT NULL,
                    ProductName TEXT NOT NULL DEFAULT '',
                    CashPrice TEXT NOT NULL,
                    CreditPrice TEXT NOT NULL,
                    FOREIGN KEY (SnapshotId) REFERENCES PriceSnapshots(Id) ON DELETE CASCADE
                );
                """;
            command.ExecuteNonQuery();
            command.CommandText = "CREATE INDEX IF NOT EXISTS IX_PriceSnapshots_CreatedAt ON PriceSnapshots (CreatedAt DESC)";
            command.ExecuteNonQuery();
            command.CommandText = "CREATE INDEX IF NOT EXISTS IX_PriceSnapshots_CustomerId ON PriceSnapshots (CustomerId)";
            command.ExecuteNonQuery();
            command.CommandText = "CREATE INDEX IF NOT EXISTS IX_PriceSnapshotLines_Lookup ON PriceSnapshotLines (CustomerId, ProductCode, CreatedAt DESC)";
            command.ExecuteNonQuery();
            _initialized = true;
        }
    }

    private SqliteConnection OpenConnection()
    {
        var connection = new SqliteConnection($"Data Source={_databasePath}");
        connection.Open();
        return connection;
    }

    private static PriceSnapshotArchiveItem ReadSnapshot(SqliteDataReader reader)
    {
        return new PriceSnapshotArchiveItem
        {
            Id = reader.GetInt32(0),
            CreatedAt = ReadDateTime(reader, 1),
            CustomerId = reader.IsDBNull(2) ? null : reader.GetInt32(2),
            CustomerName = reader.GetString(3),
            Query = reader.GetString(4),
            StatusFilter = reader.GetString(5),
            RowCount = reader.GetInt32(6),
            FileName = reader.GetString(7),
            RelativePath = reader.GetString(8),
            CreatedBy = reader.GetString(9),
            Notes = reader.GetString(10)
        };
    }

    private static string StoreDateTime(DateTime value)
    {
        var utc = value.Kind == DateTimeKind.Utc ? value : value.ToUniversalTime();
        return utc.ToString("O", CultureInfo.InvariantCulture);
    }

    private static DateTime ReadDateTime(SqliteDataReader reader, int ordinal)
    {
        var text = reader.GetString(ordinal);
        return DateTime.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var value)
            ? value.ToLocalTime()
            : DateTime.MinValue;
    }

    private static string StoreDecimal(decimal value)
    {
        return decimal.Round(value, 4, MidpointRounding.AwayFromZero).ToString(CultureInfo.InvariantCulture);
    }

    private static decimal ReadDecimal(SqliteDataReader reader, int ordinal)
    {
        return decimal.TryParse(reader.GetString(ordinal), NumberStyles.Any, CultureInfo.InvariantCulture, out var value)
            ? value
            : 0;
    }
}
