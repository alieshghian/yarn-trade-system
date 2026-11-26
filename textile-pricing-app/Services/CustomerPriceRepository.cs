using Microsoft.Data.Sqlite;
using TextilePricingApp.Models;

namespace TextilePricingApp.Services;

public sealed class CustomerPriceRepository
{
    private readonly CustomerRepository _customers;
    private readonly AuditLogRepository _auditLogs;
    private readonly CustomerProductAssignmentRepository _assignments;
    private readonly string _databasePath;

    public CustomerPriceRepository(IWebHostEnvironment environment, CustomerRepository customers, AuditLogRepository auditLogs, CustomerProductAssignmentRepository assignments)
    {
        _customers = customers;
        _auditLogs = auditLogs;
        _assignments = assignments;
        _databasePath = Path.Combine(environment.ContentRootPath, "App_Data", "pricing.db");
    }

    public IReadOnlyDictionary<string, CustomerProductDiscount> GetByCustomer(int customerId)
    {
        _customers.GetAll();
        EnsureDiscountColumns();
        _assignments.EnsureInitialized();

        var discounts = new Dictionary<string, CustomerProductDiscount>(StringComparer.CurrentCultureIgnoreCase);
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT a.CustomerId, p.Code, COALESCE(d.CreditDiscountPercent,'0'),
                   COALESCE(d.CashDiscountPercent,'0'), d.LastEditedAt
            FROM CustomerProductAssignments a JOIN ProductRecipes p ON p.Id=a.ProductId
            LEFT JOIN CustomerProductDiscounts d ON d.CustomerId=a.CustomerId AND d.ProductCode=p.Code COLLATE NOCASE
            WHERE a.CustomerId = $customerId
            """;
        command.Parameters.AddWithValue("$customerId", customerId);

        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            var discount = new CustomerProductDiscount(
                reader.GetInt32(0),
                reader.GetString(1),
                CustomerRepository.ReadDecimal(reader, 2),
                CustomerRepository.ReadDecimal(reader, 3),
                reader.IsDBNull(4) ? DateTime.MinValue : CustomerRepository.ReadDateTime(reader, 4));
            discounts[discount.ProductCode] = discount;
        }

        return discounts;
    }

    public IReadOnlyDictionary<int, int> GetDiscountCountsByCustomer()
    {
        return _assignments.Counts().Customers;
    }

    public void UpsertMany(IEnumerable<CustomerProductDiscountInput> discounts)
    {
        _customers.GetAll();
        EnsureDiscountColumns();
        _assignments.EnsureInitialized();
        var inputItems = discounts.ToList();
        var customers = _customers.GetAll().ToDictionary(customer => customer.Id);
        var oldByCustomer = inputItems
            .Select(input => input.CustomerId)
            .Distinct()
            .ToDictionary(customerId => customerId, GetByCustomer);
        var auditItems = new List<AuditLogInput>();

        using var connection = OpenConnection();
        using var transaction = connection.BeginTransaction();
        foreach (var discount in inputItems)
        {
            oldByCustomer.TryGetValue(discount.CustomerId, out var oldDiscounts);
            oldDiscounts ??= new Dictionary<string, CustomerProductDiscount>(StringComparer.CurrentCultureIgnoreCase);
            oldDiscounts.TryGetValue(discount.ProductCode, out var oldDiscount);
            var entityId = $"{discount.CustomerId}:{discount.ProductCode.Trim()}";
            var entityName = customers.TryGetValue(discount.CustomerId, out var customer)
                ? $"{customer.Name} / {discount.ProductCode.Trim()}"
                : entityId;
            using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText = """
                INSERT INTO CustomerProductDiscounts (CustomerId, ProductCode, DiscountPercent, CreditDiscountPercent, CashDiscountPercent, LastEditedAt)
                VALUES ($customerId, $productCode, $creditDiscountPercent, $creditDiscountPercent, $cashDiscountPercent, $lastEditedAt)
                ON CONFLICT(CustomerId, ProductCode) DO UPDATE
                SET DiscountPercent = excluded.CreditDiscountPercent,
                    CreditDiscountPercent = excluded.CreditDiscountPercent,
                    CashDiscountPercent = excluded.CashDiscountPercent,
                    LastEditedAt = excluded.LastEditedAt
                """;
            command.Parameters.AddWithValue("$customerId", discount.CustomerId);
            command.Parameters.AddWithValue("$productCode", discount.ProductCode.Trim());
            command.Parameters.AddWithValue("$creditDiscountPercent", CustomerRepository.StoreDecimal(decimal.Round(discount.CreditDiscountPercent, 2, MidpointRounding.AwayFromZero)));
            command.Parameters.AddWithValue("$cashDiscountPercent", CustomerRepository.StoreDecimal(decimal.Round(discount.CashDiscountPercent, 2, MidpointRounding.AwayFromZero)));
            command.Parameters.AddWithValue("$lastEditedAt", CustomerRepository.StoreDateTime(DateTime.UtcNow));
            var changed = command.ExecuteNonQuery();
            using var assign = connection.CreateCommand();
            assign.Transaction = transaction;
            assign.CommandText = "INSERT OR IGNORE INTO CustomerProductAssignments(CustomerId,ProductId) SELECT $customerId,Id FROM ProductRecipes WHERE Code=$code COLLATE NOCASE";
            assign.Parameters.AddWithValue("$customerId", discount.CustomerId);
            assign.Parameters.AddWithValue("$code", discount.ProductCode.Trim());
            assign.ExecuteNonQuery();
            if (changed > 0)
            {
                auditItems.Add(AuditLogRepository.CreateDecimal("مشتریان", "تخفیف محصول مشتری", entityId, entityName, "تخفیف اعتباری", oldDiscount?.CreditDiscountPercent, discount.CreditDiscountPercent, oldDiscount is null ? "ثبت" : "ویرایش", "Percent", "Customers"));
                auditItems.Add(AuditLogRepository.CreateDecimal("مشتریان", "تخفیف محصول مشتری", entityId, entityName, "تخفیف نقدی", oldDiscount?.CashDiscountPercent, discount.CashDiscountPercent, oldDiscount is null ? "ثبت" : "ویرایش", "Percent", "Customers"));
            }
        }

        transaction.Commit();
        _auditLogs.AddMany(auditItems);
    }

    public void Delete(int customerId, string productCode)
    {
        _customers.GetAll();
        EnsureDiscountColumns();
        var old = GetByCustomer(customerId).GetValueOrDefault(productCode.Trim());
        var customer = _customers.GetById(customerId);

        using var connection = OpenConnection();
        using var transaction = connection.BeginTransaction();
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            DELETE FROM CustomerProductDiscounts
            WHERE CustomerId = $customerId AND ProductCode = $productCode COLLATE NOCASE;
            DELETE FROM CustomerProductAssignments WHERE CustomerId=$customerId
            AND ProductId IN (SELECT Id FROM ProductRecipes WHERE Code=$productCode COLLATE NOCASE);
            """;
        command.Parameters.AddWithValue("$customerId", customerId);
        command.Parameters.AddWithValue("$productCode", productCode.Trim());
        command.ExecuteNonQuery();
        transaction.Commit();
        if (old is not null)
        {
            var entityId = $"{customerId}:{productCode.Trim()}";
            var entityName = customer is null ? entityId : $"{customer.Name} / {productCode.Trim()}";
            _auditLogs.AddMany(
            [
                AuditLogRepository.CreateDecimal("مشتریان", "تخفیف محصول مشتری", entityId, entityName, "تخفیف اعتباری", old.CreditDiscountPercent, null, "حذف", "Percent", "Customers"),
                AuditLogRepository.CreateDecimal("مشتریان", "تخفیف محصول مشتری", entityId, entityName, "تخفیف نقدی", old.CashDiscountPercent, null, "حذف", "Percent", "Customers")
            ]);
        }
    }

    private SqliteConnection OpenConnection()
    {
        var connection = new SqliteConnection($"Data Source={_databasePath}");
        connection.Open();
        return connection;
    }

    private void EnsureDiscountColumns()
    {
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = "PRAGMA table_info(CustomerProductDiscounts)";
        var columns = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        using (var reader = command.ExecuteReader())
        {
            while (reader.Read())
            {
                columns.Add(reader.GetString(1));
            }
        }

        if (!columns.Contains("CreditDiscountPercent"))
        {
            command.CommandText = "ALTER TABLE CustomerProductDiscounts ADD COLUMN CreditDiscountPercent TEXT NOT NULL DEFAULT ''";
            command.ExecuteNonQuery();
            command.CommandText = "UPDATE CustomerProductDiscounts SET CreditDiscountPercent = DiscountPercent WHERE CreditDiscountPercent = ''";
            command.ExecuteNonQuery();
        }

        if (!columns.Contains("CashDiscountPercent"))
        {
            command.CommandText = "ALTER TABLE CustomerProductDiscounts ADD COLUMN CashDiscountPercent TEXT NOT NULL DEFAULT '0'";
            command.ExecuteNonQuery();
        }
    }
}
