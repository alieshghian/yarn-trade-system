using System.Globalization;
using Microsoft.Data.Sqlite;
using TextilePricingApp.Models;

namespace TextilePricingApp.Services;

public sealed class CustomerRepository
{
    private readonly string _databasePath;
    private readonly AuditLogRepository _auditLogs;
    private readonly object _gate = new();
    private bool _initialized;

    public CustomerRepository(IWebHostEnvironment environment, AuditLogRepository auditLogs)
    {
        _databasePath = Path.Combine(environment.ContentRootPath, "App_Data", "pricing.db");
        _auditLogs = auditLogs;
    }

    public IReadOnlyList<Customer> GetAll(string? query = null)
    {
        EnsureInitialized();

        var items = new List<Customer>();
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT Id, Name, IsVatExempt, LastEditedAt, MobileNumber
            FROM Customers
            WHERE $query IS NULL OR Name LIKE '%' || $query || '%' OR MobileNumber LIKE '%' || $query || '%'
            ORDER BY Name
            """;
        command.Parameters.AddWithValue("$query", string.IsNullOrWhiteSpace(query) ? DBNull.Value : query.Trim());

        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            items.Add(ReadCustomer(reader));
        }

        return items;
    }

    public Customer? GetById(int id)
    {
        EnsureInitialized();

        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT Id, Name, IsVatExempt, LastEditedAt, MobileNumber
            FROM Customers
            WHERE Id = $id
            """;
        command.Parameters.AddWithValue("$id", id);

        using var reader = command.ExecuteReader();
        return reader.Read() ? ReadCustomer(reader) : null;
    }

    public int Save(CustomerInput input)
    {
        EnsureInitialized();
        var old = input.Id > 0 ? GetById(input.Id) : null;

        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        if (input.Id > 0)
        {
            command.CommandText = """
                UPDATE Customers
                SET Name = $name,
                    MobileNumber = $mobileNumber,
                    IsVatExempt = $isVatExempt,
                    LastEditedAt = $lastEditedAt
                WHERE Id = $id
                """;
            command.Parameters.AddWithValue("$id", input.Id);
        }
        else
        {
            command.CommandText = """
                INSERT INTO Customers (Name, MobileNumber, ProfitPercent, VatPercent, IsVatExempt, LastEditedAt)
                VALUES ($name, $mobileNumber, '0', '0', $isVatExempt, $lastEditedAt)
                """;
        }

        AddInputParameters(command, input);
        command.ExecuteNonQuery();
        if (input.Id > 0)
        {
            _auditLogs.AddMany(BuildCustomerLogs(old, GetById(input.Id), "ویرایش"));
            return input.Id;
        }

        using var idCommand = connection.CreateCommand();
        idCommand.CommandText = "SELECT last_insert_rowid()";
        var id = Convert.ToInt32(idCommand.ExecuteScalar(), CultureInfo.InvariantCulture);
        _auditLogs.AddMany(BuildCustomerLogs(null, GetById(id), "ثبت"));
        return id;
    }

    public void Delete(int id)
    {
        EnsureInitialized();
        var old = GetById(id);

        using var connection = OpenConnection();
        using var transaction = connection.BeginTransaction();
        using (var deletePrices = connection.CreateCommand())
        {
            deletePrices.Transaction = transaction;
            deletePrices.CommandText = "DELETE FROM CustomerSalePrices WHERE CustomerId = $id";
            deletePrices.Parameters.AddWithValue("$id", id);
            deletePrices.ExecuteNonQuery();
        }

        using (var deleteDiscounts = connection.CreateCommand())
        {
            deleteDiscounts.Transaction = transaction;
            deleteDiscounts.CommandText = "DELETE FROM CustomerProductDiscounts WHERE CustomerId = $id";
            deleteDiscounts.Parameters.AddWithValue("$id", id);
            deleteDiscounts.ExecuteNonQuery();
        }

        using (var deleteCustomer = connection.CreateCommand())
        {
            deleteCustomer.Transaction = transaction;
            deleteCustomer.CommandText = "DELETE FROM Customers WHERE Id = $id";
            deleteCustomer.Parameters.AddWithValue("$id", id);
            deleteCustomer.ExecuteNonQuery();
        }

        transaction.Commit();
        _auditLogs.AddMany(BuildCustomerLogs(old, null, "حذف"));
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
                CREATE TABLE IF NOT EXISTS Customers (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Name TEXT NOT NULL UNIQUE,
                    ProfitPercent TEXT NOT NULL,
                    VatPercent TEXT NOT NULL,
                    IsVatExempt INTEGER NOT NULL DEFAULT 0,
                    LastEditedAt TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS CustomerSalePrices (
                    CustomerId INTEGER NOT NULL,
                    ProductCode TEXT NOT NULL,
                    Price TEXT NOT NULL,
                    LastEditedAt TEXT NOT NULL,
                    PRIMARY KEY (CustomerId, ProductCode)
                );

                CREATE TABLE IF NOT EXISTS CustomerProductDiscounts (
                    CustomerId INTEGER NOT NULL,
                    ProductCode TEXT NOT NULL,
                    DiscountPercent TEXT NOT NULL,
                    LastEditedAt TEXT NOT NULL,
                    PRIMARY KEY (CustomerId, ProductCode)
                );
                """;
            command.ExecuteNonQuery();
            AddColumnIfMissing(connection, "Customers", "IsVatExempt", "INTEGER NOT NULL DEFAULT 0");
            AddColumnIfMissing(connection, "Customers", "MobileNumber", "TEXT NOT NULL DEFAULT ''");

            _initialized = true;
        }
    }

    private SqliteConnection OpenConnection()
    {
        var connection = new SqliteConnection($"Data Source={_databasePath}");
        connection.Open();
        return connection;
    }

    private static void AddColumnIfMissing(SqliteConnection connection, string tableName, string columnName, string definition)
    {
        using var readCommand = connection.CreateCommand();
        readCommand.CommandText = $"PRAGMA table_info({tableName})";
        using var reader = readCommand.ExecuteReader();
        while (reader.Read())
        {
            if (string.Equals(reader.GetString(1), columnName, StringComparison.OrdinalIgnoreCase))
            {
                return;
            }
        }

        using var alterCommand = connection.CreateCommand();
        alterCommand.CommandText = $"ALTER TABLE {tableName} ADD COLUMN {columnName} {definition}";
        alterCommand.ExecuteNonQuery();
    }

    private static Customer ReadCustomer(SqliteDataReader reader)
    {
        return new Customer
        {
            Id = reader.GetInt32(0),
            Name = reader.GetString(1),
            IsVatExempt = reader.GetInt32(2) == 1,
            LastEditedAt = ReadDateTime(reader, 3),
            MobileNumber = reader.GetString(4)
        };
    }

    private static void AddInputParameters(SqliteCommand command, CustomerInput input)
    {
        command.Parameters.AddWithValue("$name", input.Name.Trim());
        command.Parameters.AddWithValue("$mobileNumber", input.MobileNumber.Trim());
        command.Parameters.AddWithValue("$isVatExempt", input.IsVatExempt ? 1 : 0);
        command.Parameters.AddWithValue("$lastEditedAt", StoreDateTime(DateTime.UtcNow));
    }

    internal static decimal ReadDecimal(SqliteDataReader reader, int ordinal)
    {
        return decimal.Parse(reader.GetString(ordinal), CultureInfo.InvariantCulture);
    }

    internal static DateTime ReadDateTime(SqliteDataReader reader, int ordinal)
    {
        var value = reader.GetString(ordinal);
        return DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var result)
            ? result
            : DateTime.UtcNow;
    }

    internal static string StoreDecimal(decimal value)
    {
        return value.ToString(CultureInfo.InvariantCulture);
    }

    internal static string StoreDateTime(DateTime value)
    {
        return value.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture);
    }

    private static IReadOnlyList<AuditLogInput> BuildCustomerLogs(Customer? oldCustomer, Customer? newCustomer, string operation)
    {
        var entityId = (newCustomer?.Id ?? oldCustomer?.Id ?? 0).ToString(CultureInfo.InvariantCulture);
        var entityName = newCustomer?.Name ?? oldCustomer?.Name ?? "";
        return
        [
            AuditLogRepository.Create("اطلاعات پایه", "مشتری", entityId, entityName, "نام مشتری", oldCustomer?.Name, newCustomer?.Name, operation, "Text", "Customers"),
            AuditLogRepository.Create("اطلاعات پایه", "مشتری", entityId, entityName, "شماره موبایل", oldCustomer?.MobileNumber, newCustomer?.MobileNumber, operation, "Text", "Customers")
        ];
    }
}
