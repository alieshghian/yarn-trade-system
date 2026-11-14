using Microsoft.EntityFrameworkCore;

namespace YarnTrade.Api.Data;

// Product assignment and group edits share one transaction boundary. Serializable
// inventory range reads also order these changes against concurrent ledger inserts.
internal static class ProductGroupWriteScope
{
    public static async Task<T> Run<T>(AppDbContext db, Func<Task<T>> action, CancellationToken ct, Func<T,bool>? shouldCommit = null)
    {
        var attempt = 0;
        return await db.Database.CreateExecutionStrategy().ExecuteAsync(async () => {
            if (attempt++ > 0) db.ChangeTracker.Clear();
            await using var transaction = db.Database.IsSqlServer()
                ? await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct) : null;
            if (transaction is not null)
                await db.Database.ExecuteSqlRawAsync("DECLARE @r int; EXEC @r=sys.sp_getapplock @Resource=N'yarn-trade.product-groups.write.v1', @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=10000; IF @r<0 THROW 51000, 'Product group write lock unavailable', 1;", ct);
            var result = await action();
            if (transaction is not null) {
                if(shouldCommit?.Invoke(result) != false) await transaction.CommitAsync(ct);
                else await transaction.RollbackAsync(ct);
            }
            return result;
        });
    }
}
