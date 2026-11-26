using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using TextilePricingApp.Models;
using TextilePricingApp.Services;

namespace TextilePricingApp.Pages;

public class PriceSnapshotsModel : PageModel
{
    private readonly PriceSnapshotRepository _repository;
    private readonly PriceSnapshotService _snapshots;
    private readonly CustomerRepository _customers;

    public PriceSnapshotsModel(
        PriceSnapshotRepository repository,
        PriceSnapshotService snapshots,
        CustomerRepository customers)
    {
        _repository = repository;
        _snapshots = snapshots;
        _customers = customers;
    }

    [BindProperty(SupportsGet = true)]
    public string? Query { get; set; }

    [BindProperty(SupportsGet = true)]
    public int? CustomerId { get; set; }

    [BindProperty(SupportsGet = true)]
    public int? SnapshotId { get; set; }

    public IReadOnlyList<Customer> Customers { get; private set; } = [];
    public IReadOnlyList<PriceSnapshotArchiveItem> Items { get; private set; } = [];
    public PriceSnapshotArchiveItem? CreatedSnapshot { get; private set; }

    public void OnGet()
    {
        LoadPage();
    }

    public IActionResult OnGetDownload(int id)
    {
        var item = _repository.GetById(id);
        if (item is null)
        {
            return NotFound();
        }

        var path = _snapshots.GetPhysicalPath(item);
        if (!System.IO.File.Exists(path))
        {
            return NotFound();
        }

        return PhysicalFile(path, "application/pdf");
    }

    private void LoadPage()
    {
        Customers = _customers.GetAll();
        CreatedSnapshot = SnapshotId is > 0 ? _repository.GetById(SnapshotId.Value) : null;
        Items = _repository.Search(Query, CustomerId, null, null);
    }

    public static string PersianDateTime(DateTime? value) => CustomerPriceReportService.PersianDateTime(value);
}
