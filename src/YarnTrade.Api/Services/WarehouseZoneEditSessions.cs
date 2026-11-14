using System.Data;
using Microsoft.Data.SqlClient;

namespace YarnTrade.Api.Services;

// A SQL session-owned application lock coordinates editors across API instances.
// No warehouse records or schema are changed by acquiring/releasing this lease.
public sealed class WarehouseZoneEditSessions : IDisposable
{
    private sealed record Lease(string Actor, string Token, SqlConnection Connection, DateTime Expires);
    private readonly Dictionary<Guid, Lease> leases = new();
    private readonly SemaphoreSlim gate = new(1);
    private readonly Timer cleanup;
    private readonly TimeProvider clock;
    private DateTime Now => clock.GetUtcNow().UtcDateTime;
    public WarehouseZoneEditSessions(TimeProvider? clock = null) { this.clock=clock??TimeProvider.System;cleanup = new Timer(_ => _ = Expire(), null, TimeSpan.FromSeconds(30), TimeSpan.FromSeconds(30)); }
    private static string Resource(Guid warehouse) => "yarn-trade.warehouse-zones.editor:" + warehouse;
    public async Task<bool> Acquire(Guid warehouse, string actor, string token, string connectionString, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(actor) || !Guid.TryParse(token, out _)) return false;
        await gate.WaitAsync(ct);
        try
        {
            await RemoveExpired();
            if (leases.TryGetValue(warehouse, out var current))
                return current.Actor == actor && current.Token == token && await RenewLocked(warehouse, current, ct);
            var connection = new SqlConnection(new SqlConnectionStringBuilder(connectionString) { Pooling = false }.ConnectionString);
            try
            {
                await connection.OpenAsync(ct);
                await using var command = connection.CreateCommand();
                command.CommandText = "DECLARE @r int; EXEC @r=sys.sp_getapplock @Resource=@resource,@LockMode='Exclusive',@LockOwner='Session',@LockTimeout=0; SELECT @r;";
                command.Parameters.AddWithValue("@resource", Resource(warehouse));
                if (Convert.ToInt32(await command.ExecuteScalarAsync(ct)) < 0) { await connection.DisposeAsync(); return false; }
                leases.Add(warehouse, new(actor, token, connection, Now.AddMinutes(2)));
                return true;
            }
            catch { await connection.DisposeAsync(); throw; }
        }
        finally { gate.Release(); }
    }
    private async Task<bool> RenewLocked(Guid id, Lease lease, CancellationToken ct)
    {
        if (lease.Expires <= Now || lease.Connection.State != ConnectionState.Open) { await Remove(id); return false; }
        try
        {
            await using var command = lease.Connection.CreateCommand();
            command.CommandText = "SELECT APPLOCK_MODE('public',@resource,'Session')";
            command.Parameters.AddWithValue("@resource", Resource(id));
            if (!Equals(await command.ExecuteScalarAsync(ct), "Exclusive")) { await Remove(id); return false; }
            leases[id] = lease with { Expires = Now.AddMinutes(2) };
            return true;
        }
        catch (SqlException) { await Remove(id); return false; }
    }
    public async Task<T> Use<T>(Guid warehouse, string actor, string token, Func<Task<T>> action, Func<T> denied, CancellationToken ct)
    {
        await gate.WaitAsync(ct);
        try
        {
            if (!leases.TryGetValue(warehouse, out var lease) || lease.Actor != actor || lease.Token != token || !await RenewLocked(warehouse, lease, ct)) return denied();
            // Keep the lease alive until this write completes; cleanup/release cannot race it.
            return await action();
        }
        finally { gate.Release(); }
    }
    public async Task Release(Guid warehouse, string actor, string token, CancellationToken ct)
    {
        await gate.WaitAsync(ct);
        try { if (leases.TryGetValue(warehouse, out var lease) && lease.Actor == actor && lease.Token == token) await Remove(warehouse); }
        finally { gate.Release(); }
    }
    private async Task Remove(Guid id) { if (leases.Remove(id, out var lease)) await lease.Connection.DisposeAsync(); }
    private async Task RemoveExpired() { foreach (var id in leases.Where(x => x.Value.Expires <= Now).Select(x => x.Key).ToArray()) await Remove(id); }
    private async Task Expire() { await gate.WaitAsync(); try { await RemoveExpired(); } finally { gate.Release(); } }
    public void Dispose() { cleanup.Dispose(); gate.Wait(); try { foreach (var lease in leases.Values) lease.Connection.Dispose(); leases.Clear(); } finally { gate.Release(); } }
}
