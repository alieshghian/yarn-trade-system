using System.Globalization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using TextilePricingApp.Services;

namespace TextilePricingApp.Pages;

public class AuditLogsModel : PageModel
{
    private readonly AuditLogRepository _auditLogs;

    public AuditLogsModel(AuditLogRepository auditLogs)
    {
        _auditLogs = auditLogs;
    }

    [BindProperty(SupportsGet = true)]
    public string? EntityType { get; set; }

    [BindProperty(SupportsGet = true)]
    public string? EntityId { get; set; }

    [BindProperty(SupportsGet = true)]
    public string? EntityName { get; set; }

    [BindProperty(SupportsGet = true)]
    public string? FieldName { get; set; }

    [BindProperty(SupportsGet = true)]
    public string? Operation { get; set; }

    [BindProperty(SupportsGet = true)]
    public string? ChangeKind { get; set; }

    [BindProperty(SupportsGet = true)]
    public string? Search { get; set; }

    [BindProperty(SupportsGet = true)]
    public DateTime? From { get; set; }

    [BindProperty(SupportsGet = true)]
    public DateTime? To { get; set; }

    [BindProperty(SupportsGet = true)]
    public int Take { get; set; } = 300;

    public IReadOnlyList<AuditLogEntry> Rows { get; private set; } = [];
    public IReadOnlyList<string> EntityTypes { get; private set; } = [];

    public void OnGet()
    {
        EntityTypes = _auditLogs.GetEntityTypes();
        Rows = _auditLogs.Get(new AuditLogQuery
        {
            EntityType = EntityType,
            EntityId = EntityId,
            EntityName = EntityName,
            FieldName = FieldName,
            Operation = Operation,
            ChangeKind = ChangeKind,
            Search = Search,
            From = From,
            To = To,
            Take = Take
        });
    }

    public static string PersianDateTime(DateTime value)
    {
        var local = value.Kind == DateTimeKind.Utc ? value.ToLocalTime() : value;
        var calendar = new PersianCalendar();
        return $"{calendar.GetYear(local):0000}/{calendar.GetMonth(local):00}/{calendar.GetDayOfMonth(local):00} {local:HH:mm}";
    }
}
