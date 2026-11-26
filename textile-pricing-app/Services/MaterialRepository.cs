using System.Globalization;
using System.Text.Json;
using Microsoft.Data.Sqlite;
using TextilePricingApp.Models;

namespace TextilePricingApp.Services;

public sealed class MaterialRepository
{
    private readonly string _databasePath;
    private readonly string _seedPath;
    private readonly AuditLogRepository _auditLogs;
    private readonly object _gate = new();
    private bool _initialized;

    public MaterialRepository(IWebHostEnvironment environment, AuditLogRepository auditLogs)
    {
        _databasePath = Path.Combine(environment.ContentRootPath, "App_Data", "pricing.db");
        _seedPath = Path.Combine(environment.ContentRootPath, "Data", "seed.json");
        _auditLogs = auditLogs;
    }

    public IReadOnlyList<MaterialItem> GetAll(string? query = null, int? take = null)
    {
        EnsureInitialized();

        var items = new List<MaterialItem>();
        var hasQuery = !string.IsNullOrWhiteSpace(query);
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT Id, Name, Kind, Price, Unit, MeasurementUnit, RialPrice, LastEditedAt
            FROM Materials
            ORDER BY Name
            LIMIT $limit
            """;
        command.Parameters.AddWithValue("$limit", hasQuery ? 5000 : take ?? 5000);

        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            items.Add(ReadMaterial(reader));
        }

        return hasQuery
            ? items
                .Where(item => SearchMatches($"{item.Name} {item.Kind} {item.Unit} {item.MeasurementUnit}", query))
                .Take(take ?? 5000)
                .ToList()
            : items;
    }

    public IReadOnlyList<MaterialItem> GetByKind(string kind, string? query = null, int take = 200)
    {
        EnsureInitialized();

        if (!string.IsNullOrWhiteSpace(query))
        {
            return GetAll(query, 5000)
                .Where(item => string.Equals(item.Kind.Trim(), kind.Trim(), StringComparison.CurrentCultureIgnoreCase))
                .Take(take)
                .ToList();
        }

        var items = new List<MaterialItem>();
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT Id, Name, Kind, Price, Unit, MeasurementUnit, RialPrice, LastEditedAt
            FROM Materials
            WHERE Kind = $kind
            ORDER BY Name
            LIMIT $limit
            """;
        command.Parameters.AddWithValue("$kind", kind.Trim());
        command.Parameters.AddWithValue("$limit", take);

        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            items.Add(ReadMaterial(reader));
        }

        return items;
    }

    public IReadOnlyDictionary<string, int> CountByKind(string? query = null)
    {
        EnsureInitialized();

        if (!string.IsNullOrWhiteSpace(query))
        {
            return GetAll(query, 5000)
                .GroupBy(item => item.Kind.Trim(), StringComparer.CurrentCultureIgnoreCase)
                .ToDictionary(group => group.Key, group => group.Count(), StringComparer.CurrentCultureIgnoreCase);
        }

        var counts = new Dictionary<string, int>(StringComparer.CurrentCultureIgnoreCase);
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT Kind, COUNT(*)
            FROM Materials
            GROUP BY Kind
            """;

        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            counts[reader.GetString(0).Trim()] = reader.GetInt32(1);
        }

        return counts;
    }

    public MaterialItem? GetById(int id)
    {
        EnsureInitialized();

        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT Id, Name, Kind, Price, Unit, MeasurementUnit, RialPrice, LastEditedAt
            FROM Materials
            WHERE Id = $id
            """;
        command.Parameters.AddWithValue("$id", id);

        using var reader = command.ExecuteReader();
        return reader.Read() ? ReadMaterial(reader) : null;
    }

    public void Add(MaterialInput input)
    {
        EnsureInitialized();

        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO Materials (Name, Kind, Price, Unit, MeasurementUnit, RialPrice, LastEditedAt)
            VALUES ($name, $kind, $price, $unit, $measurementUnit, $rialPrice, $lastEditedAt)
            """;
        AddInputParameters(command, input);
        command.ExecuteNonQuery();

        using var idCommand = connection.CreateCommand();
        idCommand.CommandText = "SELECT last_insert_rowid()";
        var id = Convert.ToInt32(idCommand.ExecuteScalar(), CultureInfo.InvariantCulture);
        _auditLogs.AddMany(BuildMaterialLogs(null, GetById(id), "ثبت", "Materials"));
    }

    public void Update(MaterialInput input)
    {
        EnsureInitialized();
        var old = GetById(input.Id);

        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            UPDATE Materials
            SET Name = $name,
                Kind = $kind,
                Price = $price,
                Unit = $unit,
                MeasurementUnit = $measurementUnit,
                RialPrice = $rialPrice,
                LastEditedAt = $lastEditedAt
            WHERE Id = $id
            """;
        command.Parameters.AddWithValue("$id", input.Id);
        AddInputParameters(command, input);
        command.ExecuteNonQuery();
        SyncProductComponentMaterialName(connection, input.Id, input.Name);
        _auditLogs.AddMany(BuildMaterialLogs(old, GetById(input.Id), "ویرایش", "Materials"));
    }

    public int UpdatePrices(IEnumerable<MaterialPriceInput> inputs, decimal dollarRate)
    {
        EnsureInitialized();

        var normalizedInputs = inputs
            .Where(input => input.Id > 0)
            .Select(input => new MaterialPriceInput
            {
                Id = input.Id,
                Price = Math.Max(0, input.Price)
            })
            .ToList();

        if (normalizedInputs.Count == 0)
        {
            return 0;
        }

        using var connection = OpenConnection();
        using var transaction = connection.BeginTransaction();
        var updated = 0;
        var oldItems = normalizedInputs
            .Select(input => GetById(input.Id))
            .Where(item => item is not null)
            .ToDictionary(item => item!.Id, item => item!);
        var auditItems = new List<AuditLogInput>();

        foreach (var input in normalizedInputs)
        {
            if (!oldItems.TryGetValue(input.Id, out var oldItem))
            {
                continue;
            }

            var roundedPrice = RoundPriceByUnit(input.Price, oldItem.Unit);
            var newRialPrice = oldItem.Unit == "دلار"
                ? decimal.Round(roundedPrice * dollarRate, 0, MidpointRounding.AwayFromZero)
                : roundedPrice;
            using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText = """
                UPDATE Materials
                SET Price = $price,
                    RialPrice = CASE
                        WHEN Unit = $dollarUnit THEN $dollarRialPrice
                        ELSE $price
                    END,
                    LastEditedAt = $lastEditedAt
                WHERE Id = $id
                """;
            command.Parameters.AddWithValue("$id", input.Id);
            command.Parameters.AddWithValue("$price", StoreDecimal(roundedPrice));
            command.Parameters.AddWithValue("$dollarUnit", "دلار");
            command.Parameters.AddWithValue("$dollarRialPrice", StoreDecimal(newRialPrice));
            command.Parameters.AddWithValue("$lastEditedAt", StoreDateTime(DateTime.UtcNow));
            var changed = command.ExecuteNonQuery();
            updated += changed;
            if (changed > 0)
            {
                auditItems.Add(AuditLogRepository.CreateDecimal("اطلاعات پایه", "کالا/خدمت", input.Id.ToString(CultureInfo.InvariantCulture), oldItem.Name, "قیمت", oldItem.Price, roundedPrice, "ویرایش گروهی", "Price", "Materials"));
                auditItems.Add(AuditLogRepository.CreateDecimal("اطلاعات پایه", "کالا/خدمت", input.Id.ToString(CultureInfo.InvariantCulture), oldItem.Name, "قیمت ریالی", oldItem.RialPrice, newRialPrice, "ویرایش گروهی", "Price", "Materials", oldItem.Unit == "دلار" ? "محاسبه با نرخ دلار" : ""));
            }
        }

        transaction.Commit();
        _auditLogs.AddMany(auditItems);
        return updated;
    }

    public int RefreshPriceValidity(IEnumerable<int> ids)
    {
        EnsureInitialized();

        var normalizedIds = ids
            .Where(id => id > 0)
            .Distinct()
            .ToList();

        if (normalizedIds.Count == 0)
        {
            return 0;
        }

        using var connection = OpenConnection();
        using var transaction = connection.BeginTransaction();
        var updated = 0;
        var now = DateTime.UtcNow;
        var auditItems = new List<AuditLogInput>();
        var oldItems = normalizedIds
            .Select(GetById)
            .Where(item => item is not null)
            .ToDictionary(item => item!.Id, item => item!);

        foreach (var id in normalizedIds)
        {
            if (!oldItems.TryGetValue(id, out var oldItem))
            {
                continue;
            }

            using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText = """
                UPDATE Materials
                SET LastEditedAt = $lastEditedAt
                WHERE Id = $id
                """;
            command.Parameters.AddWithValue("$id", id);
            command.Parameters.AddWithValue("$lastEditedAt", StoreDateTime(now));
            var changed = command.ExecuteNonQuery();
            updated += changed;
            if (changed > 0)
            {
                auditItems.Add(AuditLogRepository.Create(
                    "اطلاعات پایه",
                    "کالا/خدمت",
                    id.ToString(CultureInfo.InvariantCulture),
                    oldItem.Name,
                    "اعتبار قیمت",
                    StoreDateTime(oldItem.LastEditedAt),
                    StoreDateTime(now),
                    "تمدید اعتبار",
                    "Date",
                    "Home",
                    "تمدید اعتبار بدون تغییر قیمت"));
            }
        }

        transaction.Commit();
        _auditLogs.AddMany(auditItems);
        return updated;
    }

    public void Delete(int id)
    {
        EnsureInitialized();
        var old = GetById(id);

        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = "DELETE FROM Materials WHERE Id = $id";
        command.Parameters.AddWithValue("$id", id);
        command.ExecuteNonQuery();
        _auditLogs.AddMany(BuildMaterialLogs(old, null, "حذف", "Materials"));
    }

    public int RecalculateDollarPrices(decimal dollarRate)
    {
        EnsureInitialized();

        using var connection = OpenConnection();
        using var transaction = connection.BeginTransaction();
        using var select = connection.CreateCommand();
        select.Transaction = transaction;
        select.CommandText = """
            SELECT Id, Price
            FROM Materials
            WHERE Unit = $unit
            """;
        select.Parameters.AddWithValue("$unit", "دلار");

        var updates = new List<(int Id, decimal RialPrice)>();
        var oldItems = new Dictionary<int, MaterialItem>();
        using (var reader = select.ExecuteReader())
        {
            while (reader.Read())
            {
                var price = ReadDecimal(reader, 1);
                var id = reader.GetInt32(0);
                var oldItem = GetById(id);
                if (oldItem is not null)
                {
                    oldItems[id] = oldItem;
                }

                updates.Add((
                    id,
                    decimal.Round(price * dollarRate, 0, MidpointRounding.AwayFromZero)));
            }
        }

        var auditItems = new List<AuditLogInput>();
        foreach (var update in updates)
        {
            using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText = """
                UPDATE Materials
                SET RialPrice = $rialPrice
                WHERE Id = $id
                """;
            command.Parameters.AddWithValue("$id", update.Id);
            command.Parameters.AddWithValue("$rialPrice", StoreDecimal(update.RialPrice));
            var changed = command.ExecuteNonQuery();
            if (changed > 0 && oldItems.TryGetValue(update.Id, out var oldItem))
            {
                auditItems.Add(AuditLogRepository.CreateDecimal("اطلاعات پایه", "کالا/خدمت", update.Id.ToString(CultureInfo.InvariantCulture), oldItem.Name, "قیمت ریالی", oldItem.RialPrice, update.RialPrice, "محاسبه مجدد", "Price", "Settings", "تغییر نرخ دلار"));
            }
        }

        transaction.Commit();
        _auditLogs.AddMany(auditItems);
        return updates.Count;
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
                CREATE TABLE IF NOT EXISTS Materials (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Name TEXT NOT NULL,
                    Kind TEXT NOT NULL,
                    Price TEXT NOT NULL,
                    Unit TEXT NOT NULL,
                    MeasurementUnit TEXT NOT NULL DEFAULT 'کیلوگرم',
                    RialPrice TEXT NOT NULL,
                    LastEditedAt TEXT NOT NULL DEFAULT ''
                );

                CREATE UNIQUE INDEX IF NOT EXISTS IX_Materials_Name ON Materials (Name);
                """;
            command.ExecuteNonQuery();
            EnsureMaterialColumns(connection);

            if (IsMaterialsTableEmpty(connection))
            {
                SeedMaterials(connection);
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

    private static bool IsMaterialsTableEmpty(SqliteConnection connection)
    {
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT COUNT(*) FROM Materials";
        return Convert.ToInt32(command.ExecuteScalar(), CultureInfo.InvariantCulture) == 0;
    }

    private void SeedMaterials(SqliteConnection connection)
    {
        using var stream = File.OpenRead(_seedPath);
        var seed = JsonSerializer.Deserialize<PricingData>(stream, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        }) ?? new PricingData();

        using var transaction = connection.BeginTransaction();
        foreach (var material in seed.Materials)
        {
            using var insert = connection.CreateCommand();
            insert.Transaction = transaction;
            insert.CommandText = """
                INSERT OR IGNORE INTO Materials (Name, Kind, Price, Unit, MeasurementUnit, RialPrice, LastEditedAt)
                VALUES ($name, $kind, $price, $unit, $measurementUnit, $rialPrice, $lastEditedAt)
                """;
            AddMaterialParameters(insert, material);
            insert.ExecuteNonQuery();
        }

        transaction.Commit();
    }

    private static MaterialItem ReadMaterial(SqliteDataReader reader)
    {
        return new MaterialItem
        {
            Id = reader.GetInt32(0),
            Name = reader.GetString(1),
            Kind = reader.GetString(2),
            Price = ReadDecimal(reader, 3),
            Unit = reader.GetString(4),
            MeasurementUnit = reader.GetString(5),
            RialPrice = ReadDecimal(reader, 6),
            LastEditedAt = ReadDateTime(reader, 7)
        };
    }

    private static bool SearchMatches(string haystack, string? query)
    {
        var normalizedQuery = NormalizeSearchText(query);
        if (string.IsNullOrWhiteSpace(normalizedQuery))
        {
            return true;
        }

        var normalizedHaystack = NormalizeSearchText(haystack);
        var compactQuery = normalizedQuery.Replace(" ", "", StringComparison.Ordinal);
        var compactHaystack = normalizedHaystack.Replace(" ", "", StringComparison.Ordinal);
        if (compactHaystack.Contains(compactQuery, StringComparison.Ordinal))
        {
            return true;
        }

        return normalizedQuery
            .Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .All(token => normalizedHaystack.Contains(token, StringComparison.Ordinal) ||
                compactHaystack.Contains(token, StringComparison.Ordinal));
    }

    private static string NormalizeSearchText(string? value)
    {
        var text = (value ?? "")
            .Trim()
            .ToLower(CultureInfo.CurrentCulture)
            .Replace('ي', 'ی')
            .Replace('ى', 'ی')
            .Replace('ك', 'ک')
            .Replace('ة', 'ه')
            .Replace('أ', 'ا')
            .Replace('إ', 'ا')
            .Replace('آ', 'ا')
            .Replace('ۀ', 'ه')
            .Replace('ؤ', 'و')
            .Replace('‌', ' ')
            .Replace('ـ', ' ');

        var chars = text.Select(ch => char.IsLetterOrDigit(ch) ? ch : ' ').ToArray();
        return string.Join(' ', new string(chars).Split(' ', StringSplitOptions.RemoveEmptyEntries));
    }

    private static void AddInputParameters(SqliteCommand command, MaterialInput input)
    {
        command.Parameters.AddWithValue("$name", input.Name.Trim());
        command.Parameters.AddWithValue("$kind", input.Kind.Trim());
        command.Parameters.AddWithValue("$price", StoreDecimal(input.Price));
        command.Parameters.AddWithValue("$unit", input.Unit.Trim());
        command.Parameters.AddWithValue("$measurementUnit", input.MeasurementUnit.Trim());
        command.Parameters.AddWithValue("$rialPrice", StoreDecimal(input.RialPrice));
        command.Parameters.AddWithValue("$lastEditedAt", StoreDateTime(DateTime.UtcNow));
    }

    private static void AddMaterialParameters(SqliteCommand command, MaterialItem material)
    {
        command.Parameters.AddWithValue("$name", material.Name.Trim());
        command.Parameters.AddWithValue("$kind", material.Kind.Trim());
        command.Parameters.AddWithValue("$price", StoreDecimal(material.Price));
        command.Parameters.AddWithValue("$unit", material.Unit.Trim());
        command.Parameters.AddWithValue("$measurementUnit", string.IsNullOrWhiteSpace(material.MeasurementUnit) ? "کیلوگرم" : material.MeasurementUnit.Trim());
        command.Parameters.AddWithValue("$rialPrice", StoreDecimal(material.RialPrice));
        command.Parameters.AddWithValue("$lastEditedAt", StoreDateTime(material.LastEditedAt == default ? DateTime.UtcNow : material.LastEditedAt));
    }

    private static void EnsureMaterialColumns(SqliteConnection connection)
    {
        var columns = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        using (var command = connection.CreateCommand())
        {
            command.CommandText = "PRAGMA table_info(Materials)";
            using var reader = command.ExecuteReader();
            while (reader.Read())
            {
                columns.Add(reader.GetString(1));
            }
        }

        AddColumnIfMissing(connection, columns, "LastEditedAt", "TEXT NOT NULL DEFAULT ''");
        AddColumnIfMissing(connection, columns, "MeasurementUnit", "TEXT NOT NULL DEFAULT 'کیلوگرم'");
        using var updateCommand = connection.CreateCommand();
        updateCommand.CommandText = "UPDATE Materials SET LastEditedAt = $now WHERE LastEditedAt = ''";
        updateCommand.Parameters.AddWithValue("$now", StoreDateTime(DateTime.UtcNow));
        updateCommand.ExecuteNonQuery();
    }

    private static void AddColumnIfMissing(SqliteConnection connection, HashSet<string> columns, string name, string definition)
    {
        if (columns.Contains(name))
        {
            return;
        }

        using var command = connection.CreateCommand();
        command.CommandText = $"ALTER TABLE Materials ADD COLUMN {name} {definition}";
        command.ExecuteNonQuery();
    }

    private static void SyncProductComponentMaterialName(SqliteConnection connection, int materialId, string materialName)
    {
        using (var tableCheck = connection.CreateCommand())
        {
            tableCheck.CommandText = "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'ProductComponents'";
            if (Convert.ToInt32(tableCheck.ExecuteScalar(), CultureInfo.InvariantCulture) == 0)
            {
                return;
            }
        }

        using var command = connection.CreateCommand();
        command.CommandText = """
            UPDATE ProductComponents
            SET MaterialName = $materialName
            WHERE MaterialId = $materialId
            """;
        command.Parameters.AddWithValue("$materialId", materialId);
        command.Parameters.AddWithValue("$materialName", materialName.Trim());
        command.ExecuteNonQuery();
    }

    private static decimal ReadDecimal(SqliteDataReader reader, int ordinal)
    {
        var value = reader.IsDBNull(ordinal) ? "" : reader.GetString(ordinal);
        return decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var result)
            ? result
            : 0m;
    }

    private static DateTime ReadDateTime(SqliteDataReader reader, int ordinal)
    {
        var value = reader.GetString(ordinal);
        return DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var result)
            ? result
            : DateTime.UtcNow;
    }

    private static string StoreDecimal(decimal value)
    {
        return value.ToString(CultureInfo.InvariantCulture);
    }

    private static decimal RoundPriceByUnit(decimal price, string? unit)
    {
        var decimals = string.Equals(unit?.Trim(), "دلار", StringComparison.CurrentCultureIgnoreCase) ? 2 : 0;
        return decimal.Round(Math.Max(0, price), decimals, MidpointRounding.AwayFromZero);
    }

    private static string StoreDateTime(DateTime value)
    {
        return value.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture);
    }

    private static IReadOnlyList<AuditLogInput> BuildMaterialLogs(MaterialItem? oldItem, MaterialItem? newItem, string operation, string sourcePage)
    {
        var entityId = (newItem?.Id ?? oldItem?.Id ?? 0).ToString(CultureInfo.InvariantCulture);
        var entityName = newItem?.Name ?? oldItem?.Name ?? "";
        return
        [
            AuditLogRepository.Create("اطلاعات پایه", "کالا/خدمت", entityId, entityName, "نام", oldItem?.Name, newItem?.Name, operation, "Text", sourcePage),
            AuditLogRepository.Create("اطلاعات پایه", "کالا/خدمت", entityId, entityName, "نوع", oldItem?.Kind, newItem?.Kind, operation, "Text", sourcePage),
            AuditLogRepository.CreateDecimal("اطلاعات پایه", "کالا/خدمت", entityId, entityName, "قیمت", oldItem?.Price, newItem?.Price, operation, "Price", sourcePage),
            AuditLogRepository.Create("اطلاعات پایه", "کالا/خدمت", entityId, entityName, "واحد پولی", oldItem?.Unit, newItem?.Unit, operation, "Text", sourcePage),
            AuditLogRepository.Create("اطلاعات پایه", "کالا/خدمت", entityId, entityName, "واحد", oldItem?.MeasurementUnit, newItem?.MeasurementUnit, operation, "Text", sourcePage),
            AuditLogRepository.CreateDecimal("اطلاعات پایه", "کالا/خدمت", entityId, entityName, "قیمت ریالی", oldItem?.RialPrice, newItem?.RialPrice, operation, "Price", sourcePage)
        ];
    }
}
