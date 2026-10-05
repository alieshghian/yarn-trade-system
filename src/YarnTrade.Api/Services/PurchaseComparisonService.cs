using YarnTrade.Api.Domain;

namespace YarnTrade.Api.Services;

public sealed record PurchaseComparisonLine(
    Guid? YarnItemId, string YarnCode, string YarnName, decimal OrderedQuantity, decimal InvoicedQuantity,
    decimal? OrderedUnitPrice, decimal? InvoicedUnitPrice, IReadOnlyList<string> Issues);

public sealed record PurchaseComparisonResult(bool HasDiscrepancy, IReadOnlyList<string> HeaderIssues,
    IReadOnlyList<PurchaseComparisonLine> Lines);

public static class PurchaseComparisonService
{
    private const decimal Tolerance = 0.01m;

    public static PurchaseComparisonResult Compare(PurchaseOrder order, PurchaseInvoice invoice,
        IReadOnlyDictionary<Guid, YarnItem> yarns)
    {
        var headerIssues = new List<string>();
        if (order.PreferredSupplierId.HasValue && order.PreferredSupplierId != invoice.SupplierId)
            headerIssues.Add("تأمین‌کننده فاکتور با تأمین‌کننده پیشنهادی سفارش متفاوت است.");
        if (order.Currency != invoice.Currency)
            headerIssues.Add("ارز فاکتور با ارز سفارش متفاوت است.");

        var ordered = order.Items.GroupBy(x => x.YarnItemId).ToDictionary(x => x.Key, x => new
        {
            Quantity = x.Sum(i => i.Quantity),
            UnitPrice = WeightedPrice(x.Select(i => (i.Quantity, i.EstimatedUnitPrice)))
        });
        var invoiced = invoice.Items.Where(x => x.YarnItemId.HasValue).GroupBy(x => x.YarnItemId!.Value)
            .ToDictionary(x => x.Key, x => new
            {
                Quantity = x.Sum(i => i.NetWeight),
                UnitPrice = WeightedPrice(x.Select(i => (i.NetWeight, (decimal?)i.UnitPriceUSD)))
            });
        var ids = ordered.Keys.Union(invoiced.Keys).OrderBy(id => yarns.GetValueOrDefault(id)?.Code).ToArray();
        var lines = new List<PurchaseComparisonLine>();
        foreach (var id in ids)
        {
            ordered.TryGetValue(id, out var requested);
            invoiced.TryGetValue(id, out var actual);
            var issues = new List<string>();
            if (requested is null) issues.Add("این نخ در سفارش خرید وجود نداشته است.");
            if (actual is null) issues.Add("این نخ سفارش داده شده اما در فاکتور وجود ندارد.");
            if (requested is not null && actual is not null && Math.Abs(requested.Quantity - actual.Quantity) > Tolerance)
                issues.Add($"اختلاف مقدار: سفارش {requested.Quantity:N3}، فاکتور {actual.Quantity:N3}.");
            if (requested?.UnitPrice is not null && actual?.UnitPrice is not null && Math.Abs(requested.UnitPrice.Value - actual.UnitPrice.Value) > Tolerance)
                issues.Add($"اختلاف قیمت واحد: سفارش {requested.UnitPrice:N4}، فاکتور {actual.UnitPrice:N4}.");
            var yarn = yarns.GetValueOrDefault(id);
            lines.Add(new(id, yarn?.Code ?? "—", yarn?.ComprehensiveName ?? yarn?.NameFa ?? "نخ حذف‌شده",
                requested?.Quantity ?? 0, actual?.Quantity ?? 0, requested?.UnitPrice, actual?.UnitPrice, issues));
        }

        foreach (var item in invoice.Items.Where(x => !x.YarnItemId.HasValue))
            lines.Add(new(null, "—", item.OriginalDescription, 0, item.NetWeight, null, item.UnitPriceUSD,
                ["ردیف فاکتور هنوز به یکی از نخ‌های تعریف‌شده در سیستم متصل نشده است."]));

        return new(headerIssues.Count > 0 || lines.Any(x => x.Issues.Count > 0), headerIssues, lines);
    }

    private static decimal? WeightedPrice(IEnumerable<(decimal Quantity, decimal? Price)> values)
    {
        var priced = values.Where(x => x.Price.HasValue).ToArray();
        var quantity = priced.Sum(x => x.Quantity);
        return quantity <= 0 ? null : priced.Sum(x => x.Quantity * x.Price!.Value) / quantity;
    }
}
