using Microsoft.Data.Sqlite;

namespace TextilePricingApp.Services;

public sealed record AssignmentChoice(int Id, string Name, string Code = "");
public sealed record AssignmentCounts(IReadOnlyDictionary<int, int> Products, IReadOnlyDictionary<int, int> Customers);

public sealed class CustomerProductAssignmentRepository
{
    private readonly string _path;
    private readonly CustomerRepository _customers;
    private readonly AnalysisRepository _products;
    private readonly object _gate = new();
    private bool _initialized;

    public CustomerProductAssignmentRepository(IWebHostEnvironment environment, CustomerRepository customers, AnalysisRepository products)
    {
        _path = Path.Combine(environment.ContentRootPath, "App_Data", "pricing.db");
        _customers = customers;
        _products = products;
    }

    private SqliteConnection Open()
    {
        var connection = new SqliteConnection($"Data Source={_path};Foreign Keys=True");
        connection.Open();
        return connection;
    }

    private void Initialize()
    {
        lock (_gate)
        {
            if (_initialized) return;
            // Initialize the existing parent tables before adding relationships.
            _customers.GetAll();
            _products.GetAll(take: 1);
            using var connection = Open();
            using var command = connection.CreateCommand();
            command.CommandText = """
                CREATE TABLE IF NOT EXISTS CustomerProductAssignments (
                    CustomerId INTEGER NOT NULL REFERENCES Customers(Id) ON DELETE CASCADE,
                    ProductId INTEGER NOT NULL REFERENCES ProductRecipes(Id) ON DELETE CASCADE,
                    PRIMARY KEY (CustomerId, ProductId)
                );
                CREATE INDEX IF NOT EXISTS IX_CustomerProductAssignments_ProductId
                    ON CustomerProductAssignments(ProductId);
                CREATE TRIGGER IF NOT EXISTS CustomerProductAssignments_DeleteCustomer
                    AFTER DELETE ON Customers BEGIN
                    DELETE FROM CustomerProductAssignments WHERE CustomerId = OLD.Id;
                END;
                CREATE TRIGGER IF NOT EXISTS CustomerProductAssignments_DeleteProduct
                    AFTER DELETE ON ProductRecipes BEGIN
                    DELETE FROM CustomerProductAssignments WHERE ProductId = OLD.Id;
                END;
                """;
            command.ExecuteNonQuery();
            // Merge the legacy customer-page relationships once, without changing discounts.
            // A version marker prevents removed assignments from returning on next startup.
            using var transaction = connection.BeginTransaction();
            command.Transaction = transaction;
            command.CommandText = """
                CREATE TABLE IF NOT EXISTS CustomerAssignmentMigrations (Version INTEGER PRIMARY KEY);
                INSERT OR IGNORE INTO CustomerProductAssignments(CustomerId, ProductId)
                SELECT d.CustomerId, p.Id FROM CustomerProductDiscounts d
                JOIN Customers c ON c.Id=d.CustomerId
                JOIN ProductRecipes p ON p.Code=d.ProductCode COLLATE NOCASE
                WHERE NOT EXISTS (SELECT 1 FROM CustomerAssignmentMigrations WHERE Version=1);
                INSERT OR IGNORE INTO CustomerAssignmentMigrations(Version) VALUES(1);
                """;
            command.ExecuteNonQuery();
            transaction.Commit();
            _initialized = true;
        }
    }

    public void EnsureInitialized() => Initialize();

    public IReadOnlyList<AssignmentChoice> Products()
    {
        Initialize();
        using var connection = Open();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT Id, Name, Code FROM ProductRecipes ORDER BY Code, Name";
        using var reader = command.ExecuteReader();
        var result = new List<AssignmentChoice>();
        while (reader.Read()) result.Add(new(reader.GetInt32(0), reader.GetString(1), reader.GetString(2)));
        return result;
    }

    public IReadOnlyList<AssignmentChoice> Customers()
    {
        Initialize();
        return _customers.GetAll().Select(item => new AssignmentChoice(item.Id, item.Name)).ToList();
    }

    public IReadOnlyList<int> RelatedIds(string side, int id)
    {
        Initialize();
        var (owner, related, _) = Columns(side);
        using var connection = Open();
        using var command = connection.CreateCommand();
        command.CommandText = $"SELECT {related} FROM CustomerProductAssignments WHERE {owner} = $id";
        command.Parameters.AddWithValue("$id", id);
        using var reader = command.ExecuteReader();
        var result = new List<int>();
        while (reader.Read()) result.Add(reader.GetInt32(0));
        return result;
    }

    public AssignmentCounts Counts()
    {
        Initialize();
        using var connection = Open();
        using var transaction = connection.BeginTransaction();
        Dictionary<int, int> ReadCounts(string column)
        {
            using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText = $"SELECT {column}, COUNT(*) FROM CustomerProductAssignments GROUP BY {column}";
            using var reader = command.ExecuteReader();
            var counts = new Dictionary<int, int>();
            while (reader.Read()) counts.Add(reader.GetInt32(0), reader.GetInt32(1));
            return counts;
        }
        var result = new AssignmentCounts(ReadCounts("ProductId"), ReadCounts("CustomerId"));
        transaction.Commit();
        return result;
    }

    public bool Save(string side, int id, IEnumerable<int> relatedIds)
    {
        Initialize();
        var (owner, related, ownerTable) = Columns(side);
        var relatedTable = side == "product" ? "Customers" : "ProductRecipes";
        var ids = relatedIds.Distinct().ToList();
        using var connection = Open();
        using var transaction = connection.BeginTransaction();
        bool Exists(string table, int key)
        {
            using var check = connection.CreateCommand();
            check.Transaction = transaction;
            check.CommandText = $"SELECT COUNT(*) FROM {table} WHERE Id = $id";
            check.Parameters.AddWithValue("$id", key);
            return Convert.ToInt32(check.ExecuteScalar()) == 1;
        }
        if (!Exists(ownerTable, id) || ids.Any(key => !Exists(relatedTable, key))) return false;
        using (var delete = connection.CreateCommand())
        {
            delete.Transaction = transaction;
            delete.CommandText = $"DELETE FROM CustomerProductAssignments WHERE {owner} = $id";
            delete.Parameters.AddWithValue("$id", id);
            delete.ExecuteNonQuery();
        }
        foreach (var relatedId in ids)
        {
            using var insert = connection.CreateCommand();
            insert.Transaction = transaction;
            insert.CommandText = $"INSERT INTO CustomerProductAssignments ({owner}, {related}) VALUES ($id, $relatedId)";
            insert.Parameters.AddWithValue("$id", id);
            insert.Parameters.AddWithValue("$relatedId", relatedId);
            insert.ExecuteNonQuery();
        }
        transaction.Commit();
        return true;
    }

    private static (string Owner, string Related, string Table) Columns(string side) => side switch
    {
        "product" => ("ProductId", "CustomerId", "ProductRecipes"),
        "customer" => ("CustomerId", "ProductId", "Customers"),
        _ => throw new ArgumentException("Invalid assignment side", nameof(side))
    };
}
