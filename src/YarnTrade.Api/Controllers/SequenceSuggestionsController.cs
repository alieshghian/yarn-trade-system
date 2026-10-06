using YarnTrade.Api.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;

namespace YarnTrade.Api.Controllers;

[ApiController, Route("api/sequence-suggestions"), Authorize]
public sealed class SequenceSuggestionsController(AppDbContext db) : ControllerBase
{
    [HttpGet("person"), RequirePermission("persons.view")]
    public Task<ActionResult<object>> Person(CancellationToken ct) => Suggest("person", ct);
    [HttpGet("yarn"), RequirePermission("yarns.view")]
    public Task<ActionResult<object>> Yarn(CancellationToken ct) => Suggest("yarn", ct);
    [HttpGet("purchase-order"), RequirePermission("purchaseOrders.view")]
    public Task<ActionResult<object>> PurchaseOrder(CancellationToken ct) => Suggest("purchase-order", ct);
    [HttpGet("purchase-invoice"), RequirePermission("purchases.view")]
    public Task<ActionResult<object>> PurchaseInvoice(CancellationToken ct) => Suggest("purchase-invoice", ct);
    [HttpGet("sale-invoice"), RequirePermission("sales.view")]
    public Task<ActionResult<object>> SaleInvoice(CancellationToken ct) => Suggest("sale-invoice", ct);
    [HttpGet("receipt"), RequirePermission("finance.view")]
    public Task<ActionResult<object>> Receipt(CancellationToken ct) => Suggest("receipt", ct);
    [HttpGet("payment"), RequirePermission("finance.view")]
    public Task<ActionResult<object>> Payment(CancellationToken ct) => Suggest("payment", ct);

    private async Task<ActionResult<object>> Suggest(string scope, CancellationToken ct)
    {
        var year = DateTime.Today.Year;
        string? last;
        string fallback;
        switch (scope.Trim().ToLowerInvariant())
        {
            case "person":
                last = await db.Persons.AsNoTracking().OrderByDescending(x => x.CreatedAtUtc).Select(x => x.PersonCode).FirstOrDefaultAsync(ct);
                fallback = "PER-0001";
                break;
            case "yarn":
                last = await db.YarnItems.AsNoTracking().OrderByDescending(x => x.CreatedAtUtc).Select(x => x.Code).FirstOrDefaultAsync(ct);
                fallback = "YRN-0001";
                break;
            case "purchase-order":
                fallback = $"POR-{year}-0001";
                last = await db.PurchaseOrders.AsNoTracking()
                    .OrderByDescending(x => x.CreatedAtUtc).ThenByDescending(x => x.Id)
                    .Select(x => x.OrderNumber).FirstOrDefaultAsync(ct);
                break;
            case "purchase-invoice":
                fallback = $"PUR-{year}-0001";
                last = await db.PurchaseInvoices.AsNoTracking()
                    .OrderByDescending(x => x.CreatedAtUtc).ThenByDescending(x => x.Id)
                    .Select(x => x.InternalNumber).FirstOrDefaultAsync(ct);
                break;
            case "sale-invoice":
                fallback = $"SAL-{year}-0001";
                last = await db.Sales.AsNoTracking()
                    .OrderByDescending(x => x.CreatedAtUtc).ThenByDescending(x => x.Id)
                    .Select(x => x.SaleNumber).FirstOrDefaultAsync(ct);
                break;
            case "receipt":
                fallback = $"REC-{year}-0001";
                last = await db.MoneyDocuments.AsNoTracking().Where(x => x.DocumentType == MoneyDocumentType.Receipt)
                    .OrderByDescending(x => x.CreatedAtUtc).ThenByDescending(x => x.Id)
                    .Select(x => x.DocumentNumber).FirstOrDefaultAsync(ct);
                break;
            case "payment":
                fallback = $"PAY-{year}-0001";
                last = await db.MoneyDocuments.AsNoTracking().Where(x => x.DocumentType == MoneyDocumentType.Payment)
                    .OrderByDescending(x => x.CreatedAtUtc).ThenByDescending(x => x.Id)
                    .Select(x => x.DocumentNumber).FirstOrDefaultAsync(ct);
                break;
            default:
                return BadRequest(new { error = "حوزه شماره‌گذاری معتبر نیست." });
        }
        return Ok(new { suggestion = SerialCode.Increment(last, fallback), previous = last });
    }
}

public static class SerialCode
{
    public static string Increment(string? last, string fallback)
    {
        if (string.IsNullOrWhiteSpace(last)) return fallback;
        var value = last.Trim();
        var end = value.Length - 1;
        while (end >= 0 && char.IsDigit(value[end])) end--;
        var numberStart = end + 1;
        if (numberStart == value.Length) return $"{value}-0001";
        var numberText = value[numberStart..];
        return long.TryParse(numberText, out var number)
            ? $"{value[..numberStart]}{(number + 1).ToString($"D{numberText.Length}")}"
            : fallback;
    }
}
