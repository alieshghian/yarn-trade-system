using System.Globalization;
using System.Text.Json;
using Microsoft.Data.Sqlite;
using TextilePricingApp.Models;

namespace TextilePricingApp.Services;

public sealed class WasteTierRepository
{
    private readonly string _databasePath;
    private readonly string _seedPath;
    private readonly AuditLogRepository _auditLogs;
    private readonly object _gate = new();
    private bool _initialized;

    public WasteTierRepository(IWebHostEnvironment environment, AuditLogRepository auditLogs)
    {
        _databasePath = Path.Combine(environment.ContentRootPath, "App_Data", "pricing.db");
        _seedPath = Path.Combine(environment.ContentRootPath, "Data", "seed.json");
        _auditLogs = auditLogs;
    }

    public IReadOnlyList<RateTier> GetAll()
    {
        EnsureInitialized();

        var tiers = new List<RateTier>();
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT Id, CategoryName, Percent
            FROM WasteTiers
            ORDER BY CategoryName
            """;

        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            tiers.Add(ReadTier(reader));
        }

        return tiers;
    }

    public RateTier? GetById(int id)
    {
        EnsureInitialized();

        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT Id, CategoryName, Percent
            FROM WasteTiers
            WHERE Id = $id
            """;
        command.Parameters.AddWithValue("$id", id);

        using var reader = command.ExecuteReader();
        return reader.Read() ? ReadTier(reader) : null;
    }

    public decimal ResolveWasteRate(string categoryName, decimal fallbackWasteRate)
    {
        var tier = GetAll()
            .FirstOrDefault(item => string.Equals(item.CategoryName, categoryName, StringComparison.CurrentCultureIgnoreCase));

        return tier is null ? fallbackWasteRate : tier.Percent / 100m;
    }

    public void Add(RateTierInput input)
    {
        EnsureInitialized();

        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO WasteTiers (CategoryName, Percent)
            VALUES ($categoryName, $percent)
        """;
        AddInputParameters(command, input);
        command.ExecuteNonQuery();
        using var idCommand = connection.CreateCommand();
        idCommand.CommandText = "SELECT last_insert_rowid()";
        var id = Convert.ToInt32(idCommand.ExecuteScalar(), CultureInfo.InvariantCulture);
        _auditLogs.AddMany(BuildTierLogs(null, GetById(id), "ثبت"));
    }

    public void Update(RateTierInput input)
    {
        EnsureInitialized();
        var old = GetById(input.Id);

        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            UPDATE WasteTiers
            SET CategoryName = $categoryName,
                Percent = $percent
            WHERE Id = $id
            """;
        command.Parameters.AddWithValue("$id", input.Id);
        AddInputParameters(command, input);
        command.ExecuteNonQuery();
        _auditLogs.AddMany(BuildTierLogs(old, GetById(input.Id), "ویرایش"));
    }

    public void Delete(int id)
    {
        EnsureInitialized();
        var old = GetById(id);

        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = "DELETE FROM WasteTiers WHERE Id = $id";
        command.Parameters.AddWithValue("$id", id);
        command.ExecuteNonQuery();
        _auditLogs.AddMany(BuildTierLogs(old, null, "حذف"));
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
                CREATE TABLE IF NOT EXISTS WasteTiers (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    CategoryName TEXT NOT NULL,
                    Percent TEXT NOT NULL
                );

                CREATE UNIQUE INDEX IF NOT EXISTS IX_WasteTiers_CategoryName ON WasteTiers (CategoryName);
                """;
            command.ExecuteNonQuery();

            if (IsTableEmpty(connection))
            {
                SeedWasteTiers(connection);
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

    private static bool IsTableEmpty(SqliteConnection connection)
    {
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT COUNT(*) FROM WasteTiers";
        return Convert.ToInt32(command.ExecuteScalar(), CultureInfo.InvariantCulture) == 0;
    }

    private void SeedWasteTiers(SqliteConnection connection)
    {
        using var stream = File.OpenRead(_seedPath);
        var seed = JsonSerializer.Deserialize<PricingData>(stream, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        }) ?? new PricingData();

        using var transaction = connection.BeginTransaction();
        foreach (var tier in seed.WasteTiers)
        {
            using var insert = connection.CreateCommand();
            insert.Transaction = transaction;
            insert.CommandText = """
                INSERT OR IGNORE INTO WasteTiers (CategoryName, Percent)
                VALUES ($categoryName, $percent)
                """;
            AddTierParameters(insert, tier);
            insert.ExecuteNonQuery();
        }

        transaction.Commit();
    }

    private static RateTier ReadTier(SqliteDataReader reader)
    {
        return new RateTier
        {
            Id = reader.GetInt32(0),
            CategoryName = reader.GetString(1),
            Percent = ReadDecimal(reader, 2)
        };
    }

    private static void AddInputParameters(SqliteCommand command, RateTierInput input)
    {
        command.Parameters.AddWithValue("$categoryName", input.CategoryName.Trim());
        command.Parameters.AddWithValue("$percent", StoreDecimal(input.Percent));
    }

    private static void AddTierParameters(SqliteCommand command, RateTier tier)
    {
        var categoryName = string.IsNullOrWhiteSpace(tier.CategoryName)
            ? tier.SeedCategoryNumber?.ToString(CultureInfo.InvariantCulture) ?? ""
            : tier.CategoryName.Trim();

        command.Parameters.AddWithValue("$categoryName", categoryName);
        command.Parameters.AddWithValue("$percent", StoreDecimal(tier.Percent));
    }

    private static decimal ReadDecimal(SqliteDataReader reader, int ordinal)
    {
        return decimal.Parse(reader.GetString(ordinal), CultureInfo.InvariantCulture);
    }

    private static string StoreDecimal(decimal value)
    {
        return value.ToString(CultureInfo.InvariantCulture);
    }

    private static IReadOnlyList<AuditLogInput> BuildTierLogs(RateTier? oldTier, RateTier? newTier, string operation)
    {
        var entityId = (newTier?.Id ?? oldTier?.Id ?? 0).ToString(CultureInfo.InvariantCulture);
        var entityName = newTier?.CategoryName ?? oldTier?.CategoryName ?? "";
        return
        [
            AuditLogRepository.Create("اطلاعات پایه", "دسته کسری و ضایعات", entityId, entityName, "نام دسته", oldTier?.CategoryName, newTier?.CategoryName, operation, "Text", "WasteTiers"),
            AuditLogRepository.CreateDecimal("اطلاعات پایه", "دسته کسری و ضایعات", entityId, entityName, "درصد کسری و ضایعات", oldTier?.Percent, newTier?.Percent, operation, "Percent", "WasteTiers")
        ];
    }
}
