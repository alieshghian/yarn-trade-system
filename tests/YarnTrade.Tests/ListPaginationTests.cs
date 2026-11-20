using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Controllers;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;

namespace YarnTrade.Tests;

public sealed class ListPaginationTests
{
    private static readonly JsonSerializerOptions WebJson = new(JsonSerializerDefaults.Web);
    private static AppDbContext Database() => new(new DbContextOptionsBuilder<AppDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    [Fact]
    public async Task Purchase_pages_with_equal_dates_cover_every_matching_invoice_once()
    {
        using var db = Database();
        var supplier = Guid.NewGuid();
        var invoices = Enumerable.Range(1, 105).Select(i => new PurchaseInvoice
        {
            Id = new Guid(i, 0, 0, new byte[8]), InternalNumber = $"P-{i}",
            SupplierId = supplier, InvoiceDate = new DateOnly(2026, 1, 1)
        }).ToArray();
        db.PurchaseInvoices.AddRange(invoices.Reverse());
        db.PurchaseInvoices.Add(new PurchaseInvoice { InternalNumber = "Other supplier", SupplierId = Guid.NewGuid() });
        await db.SaveChangesAsync();
        var controller = new PurchasesController(db, null!, null!);
        var ids = new List<Guid>();
        foreach (var page in new[] { 1, 2 })
        {
            var response = JsonSerializer.SerializeToElement(await controller.Search(null, null, null, supplier, null, null, page, 120), WebJson);
            Assert.Equal(105, response.GetProperty("total").GetInt32());
            Assert.Equal(page, response.GetProperty("page").GetInt32());
            Assert.Equal(100, response.GetProperty("pageSize").GetInt32());
            ids.AddRange(response.GetProperty("items").EnumerateArray().Select(x => x.GetProperty("id").GetGuid()));
        }
        Assert.Equal(invoices.Select(x => x.Id), ids);
        var beyondLast = JsonSerializer.SerializeToElement(await controller.Search(null, null, null, supplier, null, null, int.MaxValue, 120), WebJson);
        Assert.Empty(beyondLast.GetProperty("items").EnumerateArray());
    }

    [Theory]
    [InlineData(-2, 0, 1, 1)]
    [InlineData(int.MaxValue, int.MaxValue, int.MaxValue, 100)]
    public async Task List_endpoints_report_effective_bounds(int page, int size, int expectedPage, int expectedSize)
    {
        using var db = Database();
        var finance = new FinanceController(db, new(db));
        var responses = new[] {
            await finance.Documents(null, null, page, size),
            await finance.Checks(null, null, null, page, size),
            await new SalesController(db, null!).Search(null, null, null, null, null, null, page, size),
            await new MasterDataController(db, new(db)).Yarns(null, page, size),
            await new PurchasesController(db, null!, null!).Search(null, null, null, null, null, null, page, size)
        };
        foreach (var result in responses)
        {
            var response = JsonSerializer.SerializeToElement(result);
            Assert.Equal(expectedPage, response.GetProperty("page").GetInt32());
            Assert.Equal(expectedSize, response.GetProperty("pageSize").GetInt32());
            Assert.Empty(response.GetProperty("items").EnumerateArray());
        }
    }
}
