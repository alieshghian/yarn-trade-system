using System.Globalization;
using Microsoft.Data.Sqlite;

namespace TextilePricingApp.Services;

public sealed class AuditLogRepository
{
    private readonly string _databasePath;
    private readonly object _gate = new();
    private bool _initialized;

    public AuditLogRepository(IWebHostEnvironment environment)
    {
        _databasePath = Path.Combine(environment.ContentRootPath, "App_Data", "pricing.db");
    }

    public void Add(AuditLogInput input)
    {
        AddMany([input]);
    }

    public void AddMany(IEnumerable<AuditLogInput> inputs)
    {
        EnsureInitialized();
        var items = inputs
            .Where(input => !string.Equals(input.OldValue, input.NewValue, StringComparison.Ordinal))
            .ToList();

        if (items.Count == 0)
        {
            return;
        }

        using var connection = OpenConnection();
        using var transaction = connection.BeginTransaction();
        foreach (var input in items)
        {
            Insert(connection, transaction, input);
        }

        transaction.Commit();
    }

    public IReadOnlyList<AuditLogEntry> Get(AuditLogQuery query)
    {
        EnsureInitialized();

        var where = new List<string>();
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();

        if (!string.IsNullOrWhiteSpace(query.EntityType))
        {
            where.Add("EntityType = $entityType");
            command.Parameters.AddWithValue("$entityType", query.EntityType.Trim());
        }

        if (!string.IsNullOrWhiteSpace(query.EntityId))
        {
            where.Add("EntityId LIKE '%' || $entityId || '%'");
            command.Parameters.AddWithValue("$entityId", query.EntityId.Trim());
        }

        if (!string.IsNullOrWhiteSpace(query.EntityName))
        {
            where.Add("EntityName LIKE '%' || $entityName || '%'");
            command.Parameters.AddWithValue("$entityName", query.EntityName.Trim());
        }

        if (!string.IsNullOrWhiteSpace(query.FieldName))
        {
            where.Add("FieldName LIKE '%' || $fieldName || '%'");
            command.Parameters.AddWithValue("$fieldName", query.FieldName.Trim());
        }

        if (!string.IsNullOrWhiteSpace(query.Operation))
        {
            where.Add("Operation = $operation");
            command.Parameters.AddWithValue("$operation", query.Operation.Trim());
        }

        if (!string.IsNullOrWhiteSpace(query.ChangeKind))
        {
            where.Add("ChangeKind = $changeKind");
            command.Parameters.AddWithValue("$changeKind", query.ChangeKind.Trim());
        }

        if (query.From is not null)
        {
            where.Add("ChangedAt >= $from");
            command.Parameters.AddWithValue("$from", StoreDateTime(query.From.Value.Date));
        }

        if (query.To is not null)
        {
            where.Add("ChangedAt < $to");
            command.Parameters.AddWithValue("$to", StoreDateTime(query.To.Value.Date.AddDays(1)));
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            where.Add("""
                (
                    EntityType LIKE '%' || $search || '%'
                    OR EntityId LIKE '%' || $search || '%'
                    OR EntityName LIKE '%' || $search || '%'
                    OR FieldName LIKE '%' || $search || '%'
                    OR OldValue LIKE '%' || $search || '%'
                    OR NewValue LIKE '%' || $search || '%'
                    OR Note LIKE '%' || $search || '%'
                )
                """);
            command.Parameters.AddWithValue("$search", query.Search.Trim());
        }

        command.CommandText = $$"""
            SELECT Id, ChangedAt, Area, EntityType, EntityId, EntityName, FieldName, OldValue, NewValue, Operation, ChangeKind, SourcePage, Note
            FROM AuditLogs
            {{(where.Count == 0 ? "" : "WHERE " + string.Join(" AND ", where))}}
            ORDER BY ChangedAt DESC, Id DESC
            LIMIT $limit
            """;
        command.Parameters.AddWithValue("$limit", Math.Clamp(query.Take, 50, 2000));

        var rows = new List<AuditLogEntry>();
        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            rows.Add(new AuditLogEntry(
                reader.GetInt64(0),
                ReadDateTime(reader, 1),
                reader.GetString(2),
                reader.GetString(3),
                reader.GetString(4),
                reader.GetString(5),
                reader.GetString(6),
                reader.GetString(7),
                reader.GetString(8),
                reader.GetString(9),
                reader.GetString(10),
                reader.GetString(11),
                reader.GetString(12)));
        }

        return rows;
    }

    public IReadOnlyList<string> GetEntityTypes()
    {
        EnsureInitialized();
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT DISTINCT EntityType FROM AuditLogs ORDER BY EntityType";
        var items = new List<string>();
        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            items.Add(reader.GetString(0));
        }

        return items;
    }

    public static AuditLogInput Create(
        string area,
        string entityType,
        string entityId,
        string entityName,
        string fieldName,
        string? oldValue,
        string? newValue,
        string operation,
        string changeKind,
        string sourcePage,
        string note = "")
    {
        return new AuditLogInput(
            area,
            entityType,
            entityId,
            entityName,
            fieldName,
            oldValue ?? "",
            newValue ?? "",
            operation,
            changeKind,
            sourcePage,
            note);
    }

    public static AuditLogInput CreateDecimal(
        string area,
        string entityType,
        string entityId,
        string entityName,
        string fieldName,
        decimal? oldValue,
        decimal? newValue,
        string operation,
        string changeKind,
        string sourcePage,
        string note = "")
    {
        return Create(
            area,
            entityType,
            entityId,
            entityName,
            fieldName,
            oldValue?.ToString(CultureInfo.InvariantCulture),
            newValue?.ToString(CultureInfo.InvariantCulture),
            operation,
            changeKind,
            sourcePage,
            note);
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
                CREATE TABLE IF NOT EXISTS AuditLogs (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ChangedAt TEXT NOT NULL,
                    Area TEXT NOT NULL,
                    EntityType TEXT NOT NULL,
                    EntityId TEXT NOT NULL,
                    EntityName TEXT NOT NULL,
                    FieldName TEXT NOT NULL,
                    OldValue TEXT NOT NULL,
                    NewValue TEXT NOT NULL,
                    Operation TEXT NOT NULL,
                    ChangeKind TEXT NOT NULL,
                    SourcePage TEXT NOT NULL,
                    Note TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS IX_AuditLogs_ChangedAt ON AuditLogs (ChangedAt);
                CREATE INDEX IF NOT EXISTS IX_AuditLogs_Entity ON AuditLogs (EntityType, EntityId, ChangedAt);
                CREATE INDEX IF NOT EXISTS IX_AuditLogs_Field ON AuditLogs (FieldName, ChangedAt);
                """;
            command.ExecuteNonQuery();

            _initialized = true;
        }
    }

    private static void Insert(SqliteConnection connection, SqliteTransaction transaction, AuditLogInput input)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            INSERT INTO AuditLogs (ChangedAt, Area, EntityType, EntityId, EntityName, FieldName, OldValue, NewValue, Operation, ChangeKind, SourcePage, Note)
            VALUES ($changedAt, $area, $entityType, $entityId, $entityName, $fieldName, $oldValue, $newValue, $operation, $changeKind, $sourcePage, $note)
            """;
        command.Parameters.AddWithValue("$changedAt", StoreDateTime(DateTime.UtcNow));
        command.Parameters.AddWithValue("$area", input.Area);
        command.Parameters.AddWithValue("$entityType", input.EntityType);
        command.Parameters.AddWithValue("$entityId", input.EntityId);
        command.Parameters.AddWithValue("$entityName", input.EntityName);
        command.Parameters.AddWithValue("$fieldName", input.FieldName);
        command.Parameters.AddWithValue("$oldValue", input.OldValue);
        command.Parameters.AddWithValue("$newValue", input.NewValue);
        command.Parameters.AddWithValue("$operation", input.Operation);
        command.Parameters.AddWithValue("$changeKind", input.ChangeKind);
        command.Parameters.AddWithValue("$sourcePage", input.SourcePage);
        command.Parameters.AddWithValue("$note", input.Note);
        command.ExecuteNonQuery();
    }

    private SqliteConnection OpenConnection()
    {
        var connection = new SqliteConnection($"Data Source={_databasePath}");
        connection.Open();
        return connection;
    }

    private static DateTime ReadDateTime(SqliteDataReader reader, int ordinal)
    {
        var value = reader.GetString(ordinal);
        return DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var result)
            ? result
            : DateTime.UtcNow;
    }

    private static string StoreDateTime(DateTime value)
    {
        return value.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture);
    }
}

public sealed record AuditLogInput(
    string Area,
    string EntityType,
    string EntityId,
    string EntityName,
    string FieldName,
    string OldValue,
    string NewValue,
    string Operation,
    string ChangeKind,
    string SourcePage,
    string Note);

public sealed record AuditLogEntry(
    long Id,
    DateTime ChangedAt,
    string Area,
    string EntityType,
    string EntityId,
    string EntityName,
    string FieldName,
    string OldValue,
    string NewValue,
    string Operation,
    string ChangeKind,
    string SourcePage,
    string Note);

public sealed class AuditLogQuery
{
    public string? EntityType { get; set; }
    public string? EntityId { get; set; }
    public string? EntityName { get; set; }
    public string? FieldName { get; set; }
    public string? Operation { get; set; }
    public string? ChangeKind { get; set; }
    public string? Search { get; set; }
    public DateTime? From { get; set; }
    public DateTime? To { get; set; }
    public int Take { get; set; } = 300;
}
