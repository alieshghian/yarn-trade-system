using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Domain;

namespace YarnTrade.Api.Data;

public static class AggregateConcurrency
{
    public const string ConflictCode = "CONCURRENCY_CONFLICT";
    public const string ConflictMessage = "این اطلاعات توسط کاربر دیگری تغییر کرده است. اطلاعات جدید را دریافت و دوباره اقدام کنید.";

    public static ActionResult? Parse(string? value, out byte[] token)
    {
        token = [];
        if (string.IsNullOrWhiteSpace(value))
            return new BadRequestObjectResult(new { code = "CONCURRENCY_TOKEN_REQUIRED", error = "نسخه اطلاعات الزامی است. رکورد را دوباره دریافت کنید." });
        try { token = Convert.FromBase64String(value); }
        catch (FormatException) { return Invalid(); }
        if (token.Length != 8 || Convert.ToBase64String(token) != value) return Invalid();
        return null;
    }

    public static ActionResult? Apply(AppDbContext db, AuditedEntity entity, string? expected, bool touch = true)
    {
        var error = Parse(expected, out var token);
        if (error is not null) return error;
        if (!entity.RowVersion.AsSpan().SequenceEqual(token)) return Conflict(entity.RowVersion);
        Expect(db, entity, token, touch);
        return null;
    }

    // OriginalValue belongs in the UPDATE/DELETE predicate, never in the stored column.
    public static void Expect(AppDbContext db, AuditedEntity entity, byte[] token, bool touch = true)
    {
        db.Entry(entity).Property(x => x.RowVersion).OriginalValue = token;
        // A child-only edit must also update its aggregate root, even when scalar values are unchanged.
        if (touch) db.Entry(entity).Property(x => x.UpdatedAtUtc).IsModified = true;
    }

    public static void CopyEditableValues(AppDbContext db, AuditedEntity target, AuditedEntity input)
    {
        var entry = db.Entry(target);
        foreach (var property in entry.Properties.Where(x => x.Metadata.Name != nameof(Entity.Id) &&
            x.Metadata.Name != nameof(AuditedEntity.RowVersion) && x.Metadata.Name != nameof(AuditedEntity.CreatedAtUtc) &&
            x.Metadata.Name != nameof(AuditedEntity.UpdatedAtUtc)))
            property.CurrentValue = db.Entry(input).Property(property.Metadata.Name).CurrentValue;
    }

    public static ConflictObjectResult Conflict(byte[]? current = null) => new(new
    {
        code = ConflictCode, error = ConflictMessage,
        rowVersion = current is { Length: 8 } ? Convert.ToBase64String(current) : null
    });
    private static BadRequestObjectResult Invalid() => new(new { code = "INVALID_CONCURRENCY_TOKEN", error = "نسخه اطلاعات معتبر نیست. رکورد را دوباره دریافت کنید." });
}

// Only optimistic concurrency is translated here; existing business/duplicate checks keep their responses.
public sealed class ConcurrencyExceptionFilter : IExceptionFilter
{
    public void OnException(ExceptionContext context)
    {
        if (context.Exception is not DbUpdateConcurrencyException) return;
        context.Result = AggregateConcurrency.Conflict();
        context.ExceptionHandled = true;
    }
}
