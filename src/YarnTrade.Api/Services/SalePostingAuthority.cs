using System.Globalization;
using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;

namespace YarnTrade.Api.Services;

// A posting decision uses persisted, effective values; it never accepts financial request parameters.
internal sealed record SalePostingAuthority(Guid RateId, DateOnly RateDate, decimal UsdRate,
    CostingMethod CostingMethod, decimal PaymentToleranceIRR)
{
    public static async Task<SalePostingAuthority> ResolveAsync(AppDbContext db, DateOnly saleDate, CancellationToken ct)
    {
        var rates = await db.ExchangeRates.AsNoTracking().Where(x => x.RateDate == saleDate &&
            x.FromCurrency == Currency.USD && x.ToCurrency == Currency.IRR && x.IsFinal).Take(2).ToListAsync(ct);
        if (rates.Count != 1 || rates[0].Rate <= 0)
            throw new SalePostingRejectedException(409, new { code = "SALE_EXCHANGE_RATE_REQUIRED",
                error = "نرخ نهایی و معتبر دلار به ریال برای تاریخ همین فروش لازم است." });

        var methodValue = await SettingAsync(db, "CostingMethod", saleDate, ct);
        if (!Enum.TryParse<CostingMethod>(methodValue, true, out var method) || !Enum.IsDefined(method) ||
            !Enum.GetNames<CostingMethod>().Contains(methodValue, StringComparer.OrdinalIgnoreCase))
            throw InvalidSetting("CostingMethod");
        var toleranceValue = await SettingAsync(db, "RoundingToleranceIRR", saleDate, ct);
        if (!decimal.TryParse(toleranceValue, NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint,
            CultureInfo.InvariantCulture, out var tolerance) || tolerance < 0)
            throw InvalidSetting("RoundingToleranceIRR");

        return new(rates[0].Id, rates[0].RateDate, rates[0].Rate, method, tolerance);
    }

    private static async Task<string> SettingAsync(AppDbContext db, string key, DateOnly date, CancellationToken ct)
    {
        var settings = await db.SystemSettings.AsNoTracking().Where(x => x.Key == key && x.ValidFrom <= date)
            .OrderByDescending(x => x.ValidFrom).Take(2).ToListAsync(ct);
        if (settings.Count == 0)
            throw new SalePostingRejectedException(409, new { code = "POSTING_SETTING_MISSING", setting = key,
                error = "تنظیمات لازم برای قطعی‌کردن فروش در تاریخ فروش موجود نیست." });
        if (settings.Count > 1 && settings[0].ValidFrom == settings[1].ValidFrom) throw InvalidSetting(key);
        return settings[0].Value.Trim();
    }

    private static SalePostingRejectedException InvalidSetting(string key) => new(409,
        new { code = "POSTING_SETTING_INVALID", setting = key, error = "مقدار تنظیمات قطعی‌کردن فروش معتبر نیست." });
}

public sealed class SalePostingRejectedException(int statusCode, object response) : Exception("Sale posting rejected.")
{
    public int StatusCode { get; } = statusCode;
    public object Response { get; } = response;
}
