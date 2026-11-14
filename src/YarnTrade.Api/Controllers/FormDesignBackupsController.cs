using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using YarnTrade.Api.Security;

namespace YarnTrade.Api.Controllers;

// Each completed write is a separate JSON file. Never replace an older version.
[ApiController, Route("api/form-design-backups"), Authorize(Roles = "Administrator")]
public sealed class FormDesignBackupsController(IWebHostEnvironment environment) : ControllerBase
{
    private string? OwnDirectory()
    {
        if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id)) return null;
        return Path.Combine(environment.ContentRootPath, "App_Data", "form-design-backups", id.ToString("N"));
    }

    [HttpPost, RequirePermission("formLaboratory.view"), RequestSizeLimit(32 * 1024 * 1024)]
    public async Task<IActionResult> Create([FromBody] JsonElement document, CancellationToken ct)
    {
        var directory = OwnDirectory();
        if (directory is null) return Unauthorized();
        if (document.ValueKind != JsonValueKind.Object || !document.TryGetProperty("snapshot", out var snapshot) || snapshot.ValueKind != JsonValueKind.Object || !document.TryGetProperty("formId", out var formId) || formId.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(formId.GetString()) || formId.GetString()!.Length > 200) return BadRequest();
        Directory.CreateDirectory(directory);
        var id = Guid.NewGuid().ToString("N");
        var temporary = Path.Combine(directory, id + ".tmp");
        var destination = Path.Combine(directory, id + ".json");
        try
        {
            await using (var file = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None, 65536, FileOptions.Asynchronous | FileOptions.WriteThrough))
            {
                await JsonSerializer.SerializeAsync(file, document, cancellationToken: ct);
                await file.FlushAsync(ct);
                file.Flush(true);
            }
            System.IO.File.Move(temporary, destination);
            return Ok(new { id });
        }
        finally { if (System.IO.File.Exists(temporary)) System.IO.File.Delete(temporary); }
    }

    [HttpGet, RequirePermission("formLaboratory.view")]
    public IActionResult List([FromQuery] string? formId)
    {
        var directory = OwnDirectory();
        if (directory is null) return Unauthorized();
        if (!Directory.Exists(directory)) return Ok(Array.Empty<object>());
        var entries = new List<object>();
        foreach (var path in Directory.EnumerateFiles(directory, "*.json").OrderByDescending(System.IO.File.GetLastWriteTimeUtc))
        {
            try
            {
                using var json = JsonDocument.Parse(System.IO.File.ReadAllBytes(path));
                var root = json.RootElement;
                if (!root.TryGetProperty("formId", out var field) || field.ValueKind != JsonValueKind.String || (formId is not null && field.GetString() != formId)) continue;
                entries.Add(new { id = Path.GetFileNameWithoutExtension(path), formId = field.GetString(), createdAt = System.IO.File.GetLastWriteTimeUtc(path), reason = root.TryGetProperty("reason", out var reason) && reason.ValueKind == JsonValueKind.String ? reason.GetString() : "" });
            }
            catch (JsonException) { /* Keep corrupt files untouched for manual investigation. */ }
        }
        return Ok(entries);
    }

    [HttpGet("{id}"), RequirePermission("formLaboratory.view")]
    public IActionResult Read(string id, [FromQuery] bool handoff = false)
    {
        var directory = OwnDirectory();
        if (directory is null) return Unauthorized();
        if (!Guid.TryParseExact(id, "N", out _)) return BadRequest();
        var path = Path.Combine(directory, id + ".json");
        if (handoff && System.IO.File.Exists(path))
        {
            try
            {
                using var json = JsonDocument.Parse(System.IO.File.ReadAllBytes(path));
                if (json.RootElement.TryGetProperty("snapshot", out var snapshot) && snapshot.ValueKind == JsonValueKind.Object && snapshot.TryGetProperty("artifact", out var artifact) && artifact.ValueKind == JsonValueKind.String && artifact.GetString() == "yarn-trade.single-form-design-export") return Content(snapshot.GetRawText(), "application/json", System.Text.Encoding.UTF8);
                return NotFound();
            }
            catch (JsonException) { return NotFound(); }
        }
        return System.IO.File.Exists(path) ? PhysicalFile(path, "application/json", id + ".json") : NotFound();
    }
}
