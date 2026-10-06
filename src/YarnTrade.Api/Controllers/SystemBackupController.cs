using System.IO.Compression;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using YarnTrade.Api.Security;
using Microsoft.Data.SqlClient;
using YarnTrade.Api.Services;

namespace YarnTrade.Api.Controllers;

[ApiController, Route("api/system-backup"), Authorize(Roles = "Administrator,Manager")]
public sealed class SystemBackupController(IConfiguration configuration, IWebHostEnvironment environment, UserPresenceService presence) : ControllerBase
{
    private static readonly SemaphoreSlim OperationLock = new(1, 1);
    private const long MaxRestoreBytes = 5L * 1024 * 1024 * 1024;

    [HttpGet("info")]
    public IActionResult Info()
    {
        var connection = new SqlConnectionStringBuilder(GetConnectionString());
        var attachments = Path.Combine(environment.ContentRootPath, "App_Data", "attachments");
        return Ok(new { Database = connection.InitialCatalog, AttachmentCount = Directory.Exists(attachments) ? Directory.EnumerateFiles(attachments).Count() : 0, MaxRestoreSize = MaxRestoreBytes });
    }

    [HttpGet("online-users")]
    public async Task<IActionResult> OnlineUsers(CancellationToken ct) => Ok(await presence.GetOtherOnlineUsers(User, ct));

    [HttpPost("maintenance-notice")]
    public async Task<IActionResult> MaintenanceNotice(MaintenanceNoticeInput input, CancellationToken ct)
    {
        try { return Ok(await presence.CreateNotice(User, input, ct)); }
        catch (ArgumentException ex) { return BadRequest(new { error = ex.Message }); }
    }

    [HttpPost("maintenance-notice/cancel")]
    public async Task<IActionResult> CancelMaintenanceNotice(CancellationToken ct) { await presence.CompleteNotices(User, ct); return NoContent(); }

    [HttpPost("export"), EnableRateLimiting(InternetSecurity.Backups)]
    public async Task<IActionResult> Export(BackupRequest input, CancellationToken ct)
    {
        var onlineUsers = await presence.GetOtherOnlineUsers(User, ct);
        if (onlineUsers.Count != 0) return Conflict(new { error = "تا زمانی که کاربران دیگر در سیستم هستند تهیه نسخه پشتیبان امکان‌پذیر نیست.", onlineUsers });
        if (!await OperationLock.WaitAsync(0, ct)) return Conflict(new { error = "یک عملیات پشتیبان‌گیری یا بازخوانی در حال اجرا است." });
        string? work = null;
        try
        {
            var fileName = BackupNaming.Create(input.Prefix?.Trim() ?? string.Empty, DateTime.Now);
            work = CreateWorkDirectory();
            var bakPath = Path.Combine(work, "database.bak");
            await BackupDatabase(bakPath, ct);
            var manifest = new BackupManifest("YarnTrade", 1, fileName, DateTime.UtcNow, new SqlConnectionStringBuilder(GetConnectionString()).InitialCatalog, await Sha256(bakPath, ct));
            await System.IO.File.WriteAllTextAsync(Path.Combine(work, "manifest.json"), JsonSerializer.Serialize(manifest, JsonOptions), ct);
            CopyAttachments(Path.Combine(environment.ContentRootPath, "App_Data", "attachments"), Path.Combine(work, "attachments"));
            var zipPath = Path.Combine(Path.GetDirectoryName(work)!, $"{Guid.NewGuid():N}.zip");
            ZipFile.CreateFromDirectory(work, zipPath, CompressionLevel.Optimal, false);
            Directory.Delete(work, true); work = null;
            await presence.CompleteNotices(User, ct);
            Response.OnCompleted(() => { TryDeleteFile(zipPath); OperationLock.Release(); return Task.CompletedTask; });
            return PhysicalFile(zipPath, "application/zip", fileName, enableRangeProcessing: true);
        }
        catch (ArgumentException ex) { OperationLock.Release(); return BadRequest(new { error = environment.IsDevelopment() ? ex.Message : "درخواست پشتیبان‌گیری معتبر نیست." }); }
        catch
        {
            OperationLock.Release();
            throw;
        }
        finally { if (work is not null) TryDeleteDirectory(work); }
    }

    [HttpPost("restore"), EnableRateLimiting(InternetSecurity.Backups)]
    [RequestSizeLimit(MaxRestoreBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxRestoreBytes)]
    public async Task<IActionResult> Restore(IFormFile file, [FromForm] string confirmation, CancellationToken ct)
    {
        if (confirmation != "RESTORE") return BadRequest(new { error = "تأیید بازخوانی معتبر نیست." });
        if (file.Length == 0 || file.Length > MaxRestoreBytes) return BadRequest(new { error = "اندازه فایل پشتیبان معتبر نیست." });
        var originalName = Path.GetFileName(file.FileName);
        if (!BackupNaming.IsValidArchiveName(originalName)) return BadRequest(new { error = "نام فایل معتبر نیست. الگوی مجاز مانند YT-14050519.zip است." });
        var onlineUsers = await presence.GetOtherOnlineUsers(User, ct);
        if (onlineUsers.Count != 0) return Conflict(new { error = "تا زمانی که کاربران دیگر در سیستم هستند بازخوانی اطلاعات امکان‌پذیر نیست.", onlineUsers });
        if (!await OperationLock.WaitAsync(0, ct)) return Conflict(new { error = "یک عملیات پشتیبان‌گیری یا بازخوانی در حال اجرا است." });
        var work = CreateWorkDirectory();
        try
        {
            var zipPath = Path.Combine(work, "upload.zip");
            await using (var output = System.IO.File.Create(zipPath)) await file.CopyToAsync(output, ct);
            var extracted = Path.Combine(work, "extracted"); Directory.CreateDirectory(extracted);
            BackupManifest manifest;
            using (var archive = ZipFile.OpenRead(zipPath))
            {
                ValidateArchive(archive);
                var manifestEntry = archive.GetEntry("manifest.json") ?? throw new InvalidDataException("فایل مشخصات نسخه پشتیبان وجود ندارد.");
                await using var stream = manifestEntry.Open();
                manifest = await JsonSerializer.DeserializeAsync<BackupManifest>(stream, JsonOptions, ct) ?? throw new InvalidDataException("فایل مشخصات قابل خواندن نیست.");
                if (manifest.Product != "YarnTrade" || manifest.FormatVersion != 1 || !string.Equals(manifest.FileName, originalName, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("فایل انتخاب‌شده متعلق به این سیستم یا این نام فایل نیست.");
                archive.ExtractToDirectory(extracted, true);
            }
            var bakPath = Path.Combine(extracted, "database.bak");
            if (!System.IO.File.Exists(bakPath) || !string.Equals(await Sha256(bakPath, ct), manifest.DatabaseSha256, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("فایل دیتابیس ناقص یا تغییر داده شده است.");
            var database = new SqlConnectionStringBuilder(GetConnectionString()).InitialCatalog;
            if (!string.Equals(manifest.Database, database, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("نام دیتابیس فایل پشتیبان با دیتابیس جاری سازگار نیست.");
            await VerifyDatabaseBackup(bakPath, ct);
            var attachmentSwap = SwapAttachments(Path.Combine(extracted, "attachments"), Path.Combine(environment.ContentRootPath, "App_Data", "attachments"));
            try { await RestoreDatabase(bakPath, ct); attachmentSwap.Commit(); }
            catch { attachmentSwap.Rollback(); throw; }
            await presence.CompleteNotices(User, ct);
            return Ok(new { message = "اطلاعات با موفقیت بازخوانی شد. برای جلوگیری از استفاده از نشست قدیمی، دوباره وارد سیستم شوید.", manifest.CreatedAtUtc, manifest.FileName });
        }
        catch (InvalidDataException ex) { return BadRequest(new { error = environment.IsDevelopment() ? ex.Message : "فایل پشتیبان معتبر نیست یا با این پایگاه داده سازگار نیست." }); }
        finally { TryDeleteDirectory(work); OperationLock.Release(); }
    }

    private string GetConnectionString() => configuration.GetConnectionString("DefaultConnection") ?? throw new InvalidOperationException("رشته اتصال دیتابیس تنظیم نشده است.");
    private string CreateWorkDirectory() { var root = Path.Combine(environment.ContentRootPath, "App_Data", "backup-work"); Directory.CreateDirectory(root); var path = Path.Combine(root, Guid.NewGuid().ToString("N")); Directory.CreateDirectory(path); return path; }

    private async Task BackupDatabase(string path, CancellationToken ct)
    {
        var builder = new SqlConnectionStringBuilder(GetConnectionString());
        await using var connection = new SqlConnection(builder.ConnectionString); await connection.OpenAsync(ct);
        await using var command = connection.CreateCommand(); command.CommandTimeout = 0;
        command.CommandText = $"BACKUP DATABASE {Quote(builder.InitialCatalog)} TO DISK = @path WITH COPY_ONLY, INIT, CHECKSUM"; command.Parameters.AddWithValue("@path", path);
        await command.ExecuteNonQueryAsync(ct);
    }

    private async Task VerifyDatabaseBackup(string path, CancellationToken ct)
    {
        var builder = MasterConnection(); await using var connection = new SqlConnection(builder.ConnectionString); await connection.OpenAsync(ct);
        await using var command = connection.CreateCommand(); command.CommandTimeout = 0; command.CommandText = "RESTORE VERIFYONLY FROM DISK = @path WITH CHECKSUM"; command.Parameters.AddWithValue("@path", path); await command.ExecuteNonQueryAsync(ct);
    }

    private async Task RestoreDatabase(string path, CancellationToken ct)
    {
        var original = new SqlConnectionStringBuilder(GetConnectionString()); var master = MasterConnection(); SqlConnection.ClearAllPools();
        await using var connection = new SqlConnection(master.ConnectionString); await connection.OpenAsync(ct);
        try
        {
            await Execute(connection, $"ALTER DATABASE {Quote(original.InitialCatalog)} SET SINGLE_USER WITH ROLLBACK IMMEDIATE", ct);
            await using var restore = connection.CreateCommand(); restore.CommandTimeout = 0; restore.CommandText = $"RESTORE DATABASE {Quote(original.InitialCatalog)} FROM DISK = @path WITH REPLACE, CHECKSUM"; restore.Parameters.AddWithValue("@path", path); await restore.ExecuteNonQueryAsync(ct);
        }
        finally { try { await Execute(connection, $"ALTER DATABASE {Quote(original.InitialCatalog)} SET MULTI_USER", CancellationToken.None); } catch { } SqlConnection.ClearAllPools(); }
    }

    private SqlConnectionStringBuilder MasterConnection() { var value = new SqlConnectionStringBuilder(GetConnectionString()) { InitialCatalog = "master", Pooling = false }; return value; }
    private static async Task Execute(SqlConnection connection, string sql, CancellationToken ct) { await using var command = connection.CreateCommand(); command.CommandTimeout = 0; command.CommandText = sql; await command.ExecuteNonQueryAsync(ct); }
    private static string Quote(string identifier) => $"[{identifier.Replace("]", "]]", StringComparison.Ordinal)}]";
    private static async Task<string> Sha256(string path, CancellationToken ct) { await using var input = System.IO.File.OpenRead(path); return Convert.ToHexString(await SHA256.HashDataAsync(input, ct)); }
    private static void ValidateArchive(ZipArchive archive) { long total = 0; foreach (var entry in archive.Entries) { total += entry.Length; if (total > MaxRestoreBytes || entry.FullName.Contains("..", StringComparison.Ordinal) || Path.IsPathRooted(entry.FullName) || !(entry.FullName is "manifest.json" or "database.bak" || entry.FullName.StartsWith("attachments/", StringComparison.Ordinal))) throw new InvalidDataException("ساختار یا حجم فایل ZIP معتبر نیست."); } }
    private static void CopyAttachments(string source, string target) { if (!Directory.Exists(source)) return; Directory.CreateDirectory(target); foreach (var file in Directory.EnumerateFiles(source)) System.IO.File.Copy(file, Path.Combine(target, Path.GetFileName(file)), true); }
    private static AttachmentDirectorySwap SwapAttachments(string source, string target) => new(source, target);
    private static void TryDeleteDirectory(string path) { try { if (Directory.Exists(path)) Directory.Delete(path, true); } catch { } }
    private static void TryDeleteFile(string path) { try { if (System.IO.File.Exists(path)) System.IO.File.Delete(path); } catch { } }
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web) { WriteIndented = true };
}

public sealed record BackupRequest(string? Prefix);
public sealed record BackupManifest(string Product, int FormatVersion, string FileName, DateTime CreatedAtUtc, string Database, string DatabaseSha256);

internal sealed class AttachmentDirectorySwap
{
    private readonly string _target;
    private readonly string _previous;
    private bool _completed;

    public AttachmentDirectorySwap(string source, string target)
    {
        _target = target; _previous = $"{target}-previous-{Guid.NewGuid():N}";
        if (Directory.Exists(target)) Directory.Move(target, _previous);
        try { if (Directory.Exists(source)) Directory.Move(source, target); else Directory.CreateDirectory(target); }
        catch { if (Directory.Exists(_previous)) Directory.Move(_previous, target); throw; }
    }

    public void Commit() { if (_completed) return; _completed = true; try { if (Directory.Exists(_previous)) Directory.Delete(_previous, true); } catch { } }
    public void Rollback() { if (_completed) return; _completed = true; try { if (Directory.Exists(_target)) Directory.Delete(_target, true); if (Directory.Exists(_previous)) Directory.Move(_previous, _target); } catch { } }
}
