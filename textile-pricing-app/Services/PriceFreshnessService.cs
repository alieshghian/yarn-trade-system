using TextilePricingApp.Models;

namespace TextilePricingApp.Services;

public sealed class PriceFreshnessService
{
    private readonly SettingsRepository _settings;
    private readonly MaterialRepository _materials;

    public PriceFreshnessService(SettingsRepository settings, MaterialRepository materials)
    {
        _settings = settings;
        _materials = materials;
    }

    public PriceFreshnessStatus GetStatus()
    {
        PricingSettings settings;
        IReadOnlyList<MaterialItem> materials;
        try
        {
            settings = _settings.Get();
            materials = _materials.GetAll(take: 5000);
        }
        catch
        {
            return PriceFreshnessStatus.Empty;
        }

        var today = DateTime.Now.Date;

        var outdatedGoods = materials.Count(item =>
            IsGoodsKind(item.Kind) && IsExpired(item.LastEditedAt, settings.GoodsRefreshDays, today));
        var outdatedServices = materials.Count(item =>
            item.Kind == "خدمت" && IsExpired(item.LastEditedAt, settings.ServicesRefreshDays, today));
        var isDollarOutdated = IsExpired(settings.DollarUpdatedAt, settings.DollarRefreshDays, today);

        return new PriceFreshnessStatus(isDollarOutdated, outdatedGoods, outdatedServices);
    }

    private static bool IsExpired(DateTime lastEditedAt, int validDays, DateTime today)
    {
        var normalizedValidDays = Math.Max(1, validDays);
        var normalizedLastEditedAt = lastEditedAt == default ? today : lastEditedAt;
        var lastEditedDate = normalizedLastEditedAt.Kind == DateTimeKind.Utc
            ? normalizedLastEditedAt.ToLocalTime().Date
            : normalizedLastEditedAt.Date;
        return lastEditedDate.AddDays(normalizedValidDays) <= today;
    }

    private static bool IsGoodsKind(string kind)
    {
        return kind is "نخ" or "پارچه" or "کالا";
    }
}

public sealed record PriceFreshnessStatus(bool IsDollarOutdated, int OutdatedGoodsCount, int OutdatedServicesCount)
{
    public static PriceFreshnessStatus Empty { get; } = new(false, 0, 0);

    public bool HasWarning => IsDollarOutdated || OutdatedGoodsCount > 0 || OutdatedServicesCount > 0;

    public string Message
    {
        get
        {
            var parts = new List<string>();
            if (IsDollarOutdated)
            {
                parts.Add("قیمت دلار بروز نیست");
            }

            if (OutdatedGoodsCount > 0)
            {
                parts.Add($"{OutdatedGoodsCount:N0} کالا بروز نیست");
            }

            if (OutdatedServicesCount > 0)
            {
                parts.Add($"{OutdatedServicesCount:N0} خدمت بروز نیست");
            }

            return parts.Count == 0 ? "" : string.Join("، ", parts);
        }
    }
}
