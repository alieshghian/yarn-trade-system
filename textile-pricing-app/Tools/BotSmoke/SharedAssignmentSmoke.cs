using Microsoft.Data.Sqlite;
using TextilePricingApp.Models;
using TextilePricingApp.Services;

static class SharedAssignmentSmoke
{
    public static void Run()
    {
        var root = Path.Combine(Path.GetTempPath(), "textile-assignment-test-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Path.Combine(root, "Data"));
        File.Copy(Path.Combine(Directory.GetCurrentDirectory(), "Data", "seed.json"), Path.Combine(root, "Data", "seed.json"));
        var env = new TestEnvironment { ContentRootPath = root };
        var audit = new AuditLogRepository(env);
        var customers = new CustomerRepository(env, audit);
        var products = new AnalysisRepository(env, audit, new MaterialRepository(env, audit));
        products.Save(new ProductRecipeInput { Code = "TEST-A", Name = "Test A" });
        products.Save(new ProductRecipeInput { Code = "TEST-B", Name = "Test B" });
        var choices = products.GetAll().Where(p => p.Code.StartsWith("TEST-")).OrderBy(p => p.Code).ToList();
        var customer = customers.Save(new CustomerInput { Name = "Assignment test" });
        using (var connection = new SqliteConnection($"Data Source={root}/App_Data/pricing.db"))
        {
            connection.Open(); using var cmd = connection.CreateCommand();
            cmd.CommandText = "INSERT INTO CustomerProductDiscounts(CustomerId,ProductCode,DiscountPercent,LastEditedAt) VALUES($c,$p,'12','2026-01-01T00:00:00Z')";
            cmd.Parameters.AddWithValue("$c", customer); cmd.Parameters.AddWithValue("$p", choices[0].Code); cmd.ExecuteNonQuery();
        }
        var assignments = new CustomerProductAssignmentRepository(env, customers, products);
        var prices = new CustomerPriceRepository(env, customers, audit, assignments);
        Require(assignments.RelatedIds("customer", customer).SequenceEqual(new[] { choices[0].Id }), "legacy relationships migrate once");
        Require(prices.GetByCustomer(customer)[choices[0].Code].CreditDiscountPercent == 12, "legacy discounts preserved");
        Require(assignments.Save("customer", customer, choices.Select(p => p.Id)), "assign from relationship page");
        var rows = prices.GetByCustomer(customer);
        Require(rows.Count == 2 && rows[choices[1].Code].CreditDiscountPercent == 0, "customer page sees assigned product with zero discount");
        Require(prices.GetDiscountCountsByCustomer()[customer] == 2, "counts share assignment source");
        Require(assignments.Save("customer", customer, new[] { choices[1].Id }), "unassign legacy product");
        var restarted = new CustomerProductAssignmentRepository(env, customers, products);
        Require(restarted.RelatedIds("customer", customer).SequenceEqual(new[] { choices[1].Id }), "migration never resurrects removed relationships");
        Require(!prices.GetByCustomer(customer).ContainsKey(choices[0].Code), "unassigned discounts not visible");
        assignments.Save("customer", customer, choices.Select(p => p.Id));
        Require(prices.GetByCustomer(customer)[choices[0].Code].CreditDiscountPercent == 12, "reassignment restores preserved discount");
        assignments.Save("customer", customer, Array.Empty<int>());
        prices.UpsertMany(new[] { new CustomerProductDiscountInput(customer, choices[1].Code, 7, 3) });
        Require(assignments.RelatedIds("product", choices[1].Id).Contains(customer), "customer-page add creates shared relationship");
        prices.Delete(customer, choices[1].Code);
        Require(assignments.RelatedIds("customer", customer).Count == 0 && prices.GetByCustomer(customer).Count == 0, "customer-page delete removes shared relationship");
        Require(!assignments.Save("customer", customer, new[] { int.MaxValue }) && assignments.RelatedIds("customer", customer).Count == 0, "invalid assignment is atomic");
        Console.WriteLine("ALL SHARED ASSIGNMENT TESTS PASSED; isolated database only.");
    }
    static void Require(bool value, string label)
    {
        if (!value) throw new Exception("FAIL: " + label);
        Console.WriteLine("PASS: " + label);
    }
}
