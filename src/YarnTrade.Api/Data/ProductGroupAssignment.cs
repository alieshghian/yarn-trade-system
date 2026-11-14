using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Domain;

namespace YarnTrade.Api.Data;

internal static class ProductGroupAssignment
{
    internal sealed record Resolution(ProductGroup Root, int Depth, bool Selectable, bool InUse, string Message);

    public static async Task<Resolution?> Resolve(AppDbContext db, Guid id, CancellationToken ct)
    {
        var node = await db.ProductGroups.SingleOrDefaultAsync(x => x.Id == id && !x.IsDeleted, ct);
        if (node is null) return null;
        var root = await db.ProductGroups.SingleAsync(x => x.ParentId == null && x.RootCode == node.RootCode && !x.IsDeleted, ct);
        var locked = await LockedDepth(db, root.RootCode, ct);
        var depth = locked ?? await db.ProductGroups.Where(x => x.RootCode == root.RootCode && !x.IsDeleted).MaxAsync(x => x.Depth, ct);
        var selectable = node.Depth == depth && !await db.ProductGroups.AnyAsync(x => x.ParentId == id && !x.IsDeleted, ct);
        var message = selectable
            ? $"با ثبت کالا، آخرین سطح تمام شاخه‌های گروه {root.RootCode} روی سطح {depth} قفل می‌شود؛ تا زمان استفادهٔ کالاها، افزودن سطح عمیق‌تر مجاز نیست؛ با آزادشدن کامل گروه این محدودیت برداشته می‌شود. تأیید می‌کنید؟"
            : $"این شاخه کامل نیست؛ برای گروه {root.RootCode} فقط آخرین سطح یکسان ({depth}) قابل استفاده در کالا است.";
        return new(root, depth, selectable, locked is not null, message);
    }

    // Stored depth is a cache, never proof of current usage. All mutation callers share the group write lock.
    public static Task<int?> LockedDepth(AppDbContext db, string rootCode, CancellationToken ct) =>
        (from item in db.YarnItems join groupNode in db.ProductGroups on item.ProductGroupId equals (Guid?)groupNode.Id
         where groupNode.RootCode == rootCode
         select (int?)groupNode.Depth).MaxAsync(ct);
}
