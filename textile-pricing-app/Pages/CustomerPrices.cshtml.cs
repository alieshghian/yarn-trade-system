using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using TextilePricingApp.Models;
using TextilePricingApp.Services;

namespace TextilePricingApp.Pages;

public class CustomerPricesModel : PageModel
{
    private readonly CustomerRepository _customers;
    private readonly CustomerPriceReportService _reports;
    private readonly PriceSnapshotService _snapshots;
    private readonly PriceSnapshotRepository _snapshotRepository;
    private readonly PageAccessService _access;

    public CustomerPricesModel(
        CustomerRepository customers,
        CustomerPriceReportService reports,
        PriceSnapshotService snapshots,
        PriceSnapshotRepository snapshotRepository,
        PageAccessService access)
    {
        _customers = customers;
        _reports = reports;
        _snapshots = snapshots;
        _snapshotRepository = snapshotRepository;
        _access = access;
    }

    [BindProperty(SupportsGet = true)]
    public int? CustomerId { get; set; }

    [BindProperty(SupportsGet = true)]
    public string? Query { get; set; }

    [BindProperty(SupportsGet = true)]
    public string StatusFilter { get; set; } = "all";

    [BindProperty(SupportsGet = true)]
    public string SortBy { get; set; } = "default";

    [BindProperty(SupportsGet = true)]
    public string SortDirection { get; set; } = "desc";

    [BindProperty(SupportsGet = true)]
    public bool OnlyWithTargetPrice { get; set; }

    public IReadOnlyList<Customer> Customers { get; private set; } = [];
    public Customer? SelectedCustomer { get; private set; }
    public IReadOnlyList<CustomerPriceRow> Rows { get; private set; } = [];
    public IReadOnlyDictionary<string, PriceSnapshotLineItem> PreviousPrices { get; private set; } =
        new Dictionary<string, PriceSnapshotLineItem>(StringComparer.CurrentCultureIgnoreCase);
    public string ReportCustomerName => SelectedCustomer?.Name ?? "همه محصولات";
    public string ReportDateText => CustomerPriceReportService.PersianDate(DateTime.Now);

    public void OnGet()
    {
        LoadPage();
    }

    public IActionResult OnPostCreateSnapshot()
    {
        var snapshot = _snapshots.CreateCustomerPricesSnapshot(
            CustomerId,
            Query,
            StatusFilter,
            _access.DisplayName,
            SortBy,
            SortDirection,
            OnlyWithTargetPrice);
        return RedirectToPage("/PriceSnapshots", new { SnapshotId = snapshot.Id });
    }

    private void LoadPage()
    {
        Customers = _customers.GetAll();
        SelectedCustomer = CustomerId is > 0
            ? _customers.GetById(CustomerId.Value)
            : null;
        Rows = _reports.Build(CustomerId, Query, StatusFilter, SortBy, SortDirection, OnlyWithTargetPrice).Rows;
        PreviousPrices = _snapshotRepository.GetLatestLinesByProduct(SelectedCustomer?.Id);
    }
}
