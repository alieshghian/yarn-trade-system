using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace YarnTrade.Api.Data;

public sealed record DefinitionDeleteRow(Guid Id, string? RowVersion);
public sealed record DefinitionBulkDeleteInput(DefinitionDeleteRow[] Rows);

internal static class DefinitionBulkDelete
{
    public static Task<IActionResult> Run(AppDbContext db, DefinitionBulkDeleteInput input,
        Func<DefinitionDeleteRow,CancellationToken,Task<IActionResult>> delete, CancellationToken ct, Action? beginAttempt=null) =>
        ProductGroupWriteScope.Run<IActionResult>(db, async () => {
            beginAttempt?.Invoke();
            if (!db.Database.IsSqlServer()) return new ObjectResult(new { error="حذف گروهی به تراکنش SQL Server نیاز دارد." }) { StatusCode=503 };
            if (input.Rows is null || input.Rows.Length is 0 or >500 || input.Rows.Any(x=>x is null||x.Id==Guid.Empty) || input.Rows.Select(x=>x.Id).Distinct().Count()!=input.Rows.Length)
                return new BadRequestObjectResult(new { error="۱ تا ۵۰۰ شناسهٔ یکتا برای حذف انتخاب کنید." });
            foreach(var row in input.Rows) {
                try { if(string.IsNullOrWhiteSpace(row.RowVersion)||Convert.FromBase64String(row.RowVersion).Length!=8)return Blocked(row.Id,"نسخهٔ رکورد معتبر نیست؛ جدول را دوباره دریافت کنید."); }
                catch(FormatException) { return Blocked(row.Id,"نسخهٔ رکورد معتبر نیست؛ جدول را دوباره دریافت کنید."); }
            }
            foreach(var row in input.Rows) {
                try {
                    var result=await delete(row,ct);
                    if(result is not NoContentResult) {
                        var cause=(result as ObjectResult)?.Value;
                        var reason="رکورد استفاده شده، تغییر کرده یا قابل حذف نیست.";
                        if(cause is not null){var detail=System.Text.Json.JsonSerializer.SerializeToElement(cause);if(detail.ValueKind==System.Text.Json.JsonValueKind.Object&&detail.TryGetProperty("error",out var message)&&message.ValueKind==System.Text.Json.JsonValueKind.String)reason=message.GetString()??reason;}
                        return new ConflictObjectResult(new { error=reason+" هیچ ردیفی حذف نشد.", code="BULK_DELETE_BLOCKED", blockedIds=new[]{row.Id}, cause });
                    }
                }
                catch(DbUpdateConcurrencyException) { return Blocked(row.Id,"رکورد هم‌زمان تغییر کرده است؛ هیچ ردیفی حذف نشد. جدول را دوباره دریافت کنید."); }
                catch(DbUpdateException e) when(e.InnerException is Microsoft.Data.SqlClient.SqlException { Number:547 }) { return Blocked(row.Id,"این رکورد در سیستم استفاده شده است؛ هیچ ردیفی حذف نشد."); }
            }
            return new NoContentResult();
        },ct,result=>result is NoContentResult);

    public static IActionResult Blocked(Guid id,string error)=>new ConflictObjectResult(new{error,code="BULK_DELETE_BLOCKED",blockedIds=new[]{id}});
}
