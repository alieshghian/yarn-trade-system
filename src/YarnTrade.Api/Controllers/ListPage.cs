using Microsoft.EntityFrameworkCore;

namespace YarnTrade.Api.Controllers;

internal static class ListPage
{
    public static async Task<object> ReadAsync<T>(IOrderedQueryable<T> ordered, int page, int pageSize, CancellationToken ct)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var offset = (long)(page - 1) * pageSize;
        var total = await ordered.CountAsync(ct);
        var items = offset < total
            ? await ordered.Skip((int)offset).Take(pageSize).ToArrayAsync(ct)
            : Array.Empty<T>();
        return new { items, total, page, pageSize };
    }
}
