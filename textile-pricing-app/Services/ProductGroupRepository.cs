using System.Globalization;
using Microsoft.Data.Sqlite;
using TextilePricingApp.Models;

namespace TextilePricingApp.Services;

public sealed class ProductGroupRepository
{
    private readonly string _databasePath;
    private readonly AuditLogRepository _auditLogs;
    private readonly object _gate = new();
    private bool _initialized;

    public ProductGroupRepository(IWebHostEnvironment environment, AuditLogRepository auditLogs)
    {
        _databasePath = Path.Combine(environment.ContentRootPath, "App_Data", "pricing.db");
        _auditLogs = auditLogs;
    }

    public IReadOnlyList<ProductGroup> GetAll()
    {
        EnsureInitialized();

        var items = new List<ProductGroup>();
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT Id, Name
            FROM ProductGroups
            ORDER BY Name
            """;

        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            items.Add(ReadGroup(reader));
        }

        return items;
    }

    public ProductGroup? GetById(int id)
    {
        EnsureInitialized();

        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT Id, Name
            FROM ProductGroups
            WHERE Id = $id
            """;
        command.Parameters.AddWithValue("$id", id);

        using var reader = command.ExecuteReader();
        return reader.Read() ? ReadGroup(reader) : null;
    }

    public bool IsInUse(string name)
    {
        EnsureInitialized();

        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT COUNT(*)
            FROM ProductRecipes
            WHERE lower(ProductGroupName) = lower($name)
            """;
        command.Parameters.AddWithValue("$name", name.Trim());
        return Convert.ToInt32(command.ExecuteScalar(), CultureInfo.InvariantCulture) > 0;
    }

    public void Add(ProductGroupInput input)
    {
        EnsureInitialized();

        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO ProductGroups (Name)
            VALUES ($name)
            """;
        command.Parameters.AddWithValue("$name", input.Name.Trim());
        command.ExecuteNonQuery();

        using var idCommand = connection.CreateCommand();
        idCommand.CommandText = "SELECT last_insert_rowid()";
        var id = Convert.ToInt32(idCommand.ExecuteScalar(), CultureInfo.InvariantCulture);
        _auditLogs.AddMany(BuildGroupLogs(null, GetById(id), "ثبت"));
    }

    public void Update(ProductGroupInput input)
    {
        EnsureInitialized();
        var old = GetById(input.Id);

        using var connection = OpenConnection();
        using var transaction = connection.BeginTransaction();
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            UPDATE ProductGroups
            SET Name = $name
            WHERE Id = $id
            """;
        command.Parameters.AddWithValue("$id", input.Id);
        command.Parameters.AddWithValue("$name", input.Name.Trim());
        command.ExecuteNonQuery();

        if (old is not null)
        {
            using var updateRecipes = connection.CreateCommand();
            updateRecipes.Transaction = transaction;
            updateRecipes.CommandText = """
                UPDATE ProductRecipes
                SET ProductGroupName = $newName
                WHERE lower(ProductGroupName) = lower($oldName)
                """;
            updateRecipes.Parameters.AddWithValue("$newName", input.Name.Trim());
            updateRecipes.Parameters.AddWithValue("$oldName", old.Name);
            updateRecipes.ExecuteNonQuery();
        }

        transaction.Commit();
        _auditLogs.AddMany(BuildGroupLogs(old, GetById(input.Id), "ویرایش"));
    }

    public void Delete(int id)
    {
        EnsureInitialized();
        var old = GetById(id);

        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = "DELETE FROM ProductGroups WHERE Id = $id";
        command.Parameters.AddWithValue("$id", id);
        command.ExecuteNonQuery();
        _auditLogs.AddMany(BuildGroupLogs(old, null, "حذف"));
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
                CREATE TABLE IF NOT EXISTS ProductGroups (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Name TEXT NOT NULL
                );

                CREATE UNIQUE INDEX IF NOT EXISTS IX_ProductGroups_Name ON ProductGroups (Name);
                """;
            command.ExecuteNonQuery();
            SeedFromExistingRecipes(connection);

            _initialized = true;
        }
    }

    private SqliteConnection OpenConnection()
    {
        var connection = new SqliteConnection($"Data Source={_databasePath}");
        connection.Open();
        return connection;
    }

    private static void SeedFromExistingRecipes(SqliteConnection connection)
    {
        using var tableCheck = connection.CreateCommand();
        tableCheck.CommandText = "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'ProductRecipes'";
        if (Convert.ToInt32(tableCheck.ExecuteScalar(), CultureInfo.InvariantCulture) == 0)
        {
            return;
        }

        using var columnCheck = connection.CreateCommand();
        columnCheck.CommandText = "PRAGMA table_info(ProductRecipes)";
        var hasGroupColumn = false;
        using (var reader = columnCheck.ExecuteReader())
        {
            while (reader.Read())
            {
                hasGroupColumn = hasGroupColumn ||
                    string.Equals(reader.GetString(1), "ProductGroupName", StringComparison.OrdinalIgnoreCase);
            }
        }

        if (!hasGroupColumn)
        {
            return;
        }

        using var seed = connection.CreateCommand();
        seed.CommandText = """
            INSERT OR IGNORE INTO ProductGroups (Name)
            SELECT DISTINCT trim(ProductGroupName)
            FROM ProductRecipes
            WHERE trim(ProductGroupName) <> ''
            """;
        seed.ExecuteNonQuery();
    }

    private static ProductGroup ReadGroup(SqliteDataReader reader)
    {
        return new ProductGroup
        {
            Id = reader.GetInt32(0),
            Name = reader.GetString(1)
        };
    }

    private static IReadOnlyList<AuditLogInput> BuildGroupLogs(ProductGroup? oldGroup, ProductGroup? newGroup, string operation)
    {
        var entityId = (newGroup?.Id ?? oldGroup?.Id ?? 0).ToString(CultureInfo.InvariantCulture);
        var entityName = newGroup?.Name ?? oldGroup?.Name ?? "";
        return
        [
            AuditLogRepository.Create("اطلاعات پایه", "گروه محصول", entityId, entityName, "نام گروه", oldGroup?.Name, newGroup?.Name, operation, "Text", "ProductGroups")
        ];
    }
}
