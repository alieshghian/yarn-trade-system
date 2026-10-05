using YarnTrade.Api.Domain;
using YarnTrade.Api.Services;

namespace YarnTrade.Tests;

public sealed class PurchaseComparisonTests
{
    [Fact]
    public void Keeps_order_and_invoice_values_and_reports_quantity_difference()
    {
        var yarn = new YarnItem { Code = "Y-1", NameFa = "نخ نمونه", NameEn = "Sample", YarnTypeId = Guid.NewGuid() };
        var supplier = Guid.NewGuid();
        var order = new PurchaseOrder { OrderNumber = "O-1", OrderDate = DateOnly.FromDateTime(DateTime.Today), RequestedByUserId = Guid.NewGuid(), PreferredSupplierId = supplier };
        order.Items.Add(new PurchaseOrderItem { PurchaseOrderId = order.Id, LineNumber = 1, YarnItemId = yarn.Id, DescriptionSnapshot = "نخ نمونه", Quantity = 100, EstimatedUnitPrice = 2 });
        var invoice = new PurchaseInvoice { InternalNumber = "P-1", InvoiceDate = order.OrderDate, SupplierId = supplier };
        invoice.Items.Add(new PurchaseInvoiceItem { PurchaseInvoiceId = invoice.Id, LineNumber = 1, YarnItemId = yarn.Id, OriginalDescription = "نخ نمونه", NetWeight = 120, UnitPriceUSD = 2 });

        var result = PurchaseComparisonService.Compare(order, invoice, new Dictionary<Guid, YarnItem> { [yarn.Id] = yarn });

        Assert.True(result.HasDiscrepancy);
        Assert.Equal(100, result.Lines.Single().OrderedQuantity);
        Assert.Equal(120, result.Lines.Single().InvoicedQuantity);
    }

    [Fact]
    public void Unmapped_imported_line_is_a_discrepancy()
    {
        var order = new PurchaseOrder { OrderNumber = "O-1", OrderDate = DateOnly.FromDateTime(DateTime.Today), RequestedByUserId = Guid.NewGuid() };
        var invoice = new PurchaseInvoice { InternalNumber = "P-1", InvoiceDate = order.OrderDate, SupplierId = Guid.NewGuid() };
        invoice.Items.Add(new PurchaseInvoiceItem { PurchaseInvoiceId = invoice.Id, LineNumber = 1, OriginalDescription = "raw imported yarn", NetWeight = 25 });

        var result = PurchaseComparisonService.Compare(order, invoice, new Dictionary<Guid, YarnItem>());

        Assert.True(result.HasDiscrepancy);
        Assert.Contains(result.Lines, x => x.YarnItemId is null);
    }
}
