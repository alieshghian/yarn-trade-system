using TextilePricingApp.Services;

namespace TextilePricingApp.Pages;

public class CustomerPanelModel : CustomerPricesModel
{
    public CustomerPanelModel(
        CustomerRepository customers,
        CustomerPriceReportService reports,
        PriceSnapshotService snapshots,
        PriceSnapshotRepository snapshotRepository,
        PageAccessService access)
        : base(customers, reports, snapshots, snapshotRepository, access)
    {
    }
}
