using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
using TextilePricingApp.Models;

namespace TextilePricingApp.Services;

public sealed class PricingService
{
    private readonly Lazy<PricingData> _data;
    private readonly MaterialRepository _materials;
    private readonly WasteTierRepository _wasteTiers;
    private readonly SettingsRepository _settings;
    private readonly AnalysisRepository _analysis;
    private readonly IMemoryCache _cache;
    private readonly string _databasePath;

    public PricingService(
        IWebHostEnvironment environment,
        MaterialRepository materials,
        WasteTierRepository wasteTiers,
        SettingsRepository settings,
        AnalysisRepository analysis,
        IMemoryCache cache)
    {
        _materials = materials;
        _wasteTiers = wasteTiers;
        _settings = settings;
        _analysis = analysis;
        _cache = cache;
        _databasePath = Path.Combine(environment.ContentRootPath, "App_Data", "pricing.db");
        _data = new Lazy<PricingData>(() =>
        {
            var path = Path.Combine(environment.ContentRootPath, "Data", "seed.json");
            using var stream = File.OpenRead(path);
            return JsonSerializer.Deserialize<PricingData>(stream, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            }) ?? new PricingData();
        });
    }

    public PricingData Data => _data.Value;

    public PricingSettings Settings => GetSettingsSnapshot(GetDatabaseStamp());

    public IReadOnlyList<ProductRecipe> Recipes => GetRecipeSnapshot(GetDatabaseStamp());

    public IReadOnlyList<MaterialItem> SearchMaterials(string? query, int take = 40)
    {
        return _materials.GetAll(query, take);
    }

    private static bool IsPriceableRecipe(ProductRecipe recipe) =>
        recipe.Components.Count > 0 ||
        (recipe.ProductType == ProductType.Commercial && recipe.ProductPurchasePrice > 0);

    public ProductCalculation Calculate(string? productCode)
    {
        var stamp = GetDatabaseStamp();
        var recipes = GetRecipeSnapshot(stamp);
        var recipe = string.IsNullOrWhiteSpace(productCode)
            ? recipes.FirstOrDefault()
            : recipes.FirstOrDefault(item => string.Equals(item.Code, productCode.Trim(), StringComparison.CurrentCultureIgnoreCase));
        if (recipe is null)
        {
            return new ProductCalculation();
        }

        var cacheKey = $"pricing:calculation:{stamp}:{recipe.Code}";

        return _cache.GetOrCreate(cacheKey, entry =>
        {
            entry.SlidingExpiration = TimeSpan.FromMinutes(30);
            return CalculateCore(recipe, stamp);
        })!;
    }

    private ProductCalculation CalculateCore(ProductRecipe recipe, string stamp)
    {
        var settings = GetSettingsSnapshot(stamp);
        var materials = GetMaterialSnapshot(stamp);
        var wasteTiers = GetWasteTierSnapshot(stamp);
        var materialLookup = materials.ToDictionary(item => item.Name, StringComparer.CurrentCultureIgnoreCase);
        var materialIdLookup = materials.ToDictionary(item => item.Id);
        var wasteCategory = string.IsNullOrWhiteSpace(recipe.WasteCategoryName)
            ? recipe.WasteRate.ToString(System.Globalization.CultureInfo.InvariantCulture)
            : recipe.WasteCategoryName;
        var appliedProfitRate = settings.GlobalProfitPercent / 100m;
        var appliedWasteRate = ResolveWasteRate(wasteTiers, wasteCategory, recipe.WasteRate);
        var lines = new List<ComponentLine>();
        var missing = new List<string>();

        foreach (var component in recipe.Components)
        {
            if (UsesManagedContainerTransport(recipe) && IsLegacyTransportComponent(component.MaterialName))
            {
                continue;
            }

            MaterialItem? material = null;
            if (component.MaterialId is > 0)
            {
                materialIdLookup.TryGetValue(component.MaterialId.Value, out material);
            }

            if (material is null)
            {
                materialLookup.TryGetValue(component.MaterialName, out material);
            }

            if (material is null)
            {
                missing.Add(component.MaterialName);
                continue;
            }

            var unitPrice = material.RialPrice > 0 ? material.RialPrice : material.Price;
            var cashAmount = component.Quantity * unitPrice;
            lines.Add(new ComponentLine(
                material.Name,
                material.Kind,
                component.Quantity,
                unitPrice,
                cashAmount,
                cashAmount));
        }

        if (recipe.ProductType == ProductType.Commercial && recipe.ProductPurchasePrice > 0)
        {
            var purchaseAmount = recipe.LaminationOrigin == LaminationOriginCatalog.Foreign
                ? recipe.ProductPurchasePrice * settings.EffectiveDollarRate
                : recipe.ProductPurchasePrice;
            AddCalculatedPurchaseLine(lines, purchaseAmount);
        }

        if (UsesAutomaticContainerTransport(recipe) && recipe.ContainerMeters > 0)
        {
            var foreignTransport = settings.ForeignTransportPerContainerUsd * settings.EffectiveDollarRate / recipe.ContainerMeters;
            var domesticTransport = settings.DomesticTransportPerContainerRial / recipe.ContainerMeters;
            AddCalculatedTransportLine(lines, "حمل خارجی کانتینر", foreignTransport);
            AddCalculatedTransportLine(lines, "حمل داخلی کانتینر", domesticTransport);
        }

        var cashTotal = lines.Sum(line => line.CashAmount);
        var creditTotal = lines.Sum(line => line.CreditAmount);
        var cashWaste = cashTotal * appliedWasteRate;
        var creditWaste = creditTotal * appliedWasteRate;
        var cashCost = cashTotal + cashWaste;
        var creditCost = creditTotal + creditWaste;
        var cashSale = cashCost * (1 + appliedProfitRate);
        var creditSale = creditCost * (1 + appliedProfitRate);
        var cashVat = cashSale * settings.VatRate;
        var creditVat = creditSale * settings.VatRate;

        return new ProductCalculation
        {
            Recipe = recipe,
            AppliedProfitRate = appliedProfitRate,
            AppliedWasteRate = appliedWasteRate,
            Lines = lines,
            MissingMaterials = missing,
            Summary = new PriceSummary(
                cashTotal,
                creditTotal,
                cashWaste,
                creditWaste,
                cashCost,
                creditCost,
                cashSale,
                creditSale,
                cashVat,
                creditVat,
                cashSale + cashVat,
                creditSale + creditVat)
        };
    }

    private IReadOnlyList<ProductRecipe> GetRecipeSnapshot(string stamp)
    {
        return _cache.GetOrCreate($"pricing:recipes:{stamp}", entry =>
        {
            entry.SlidingExpiration = TimeSpan.FromMinutes(30);
            return _analysis.GetAll()
                .Where(IsPriceableRecipe)
                .OrderBy(recipe => recipe.Code, StringComparer.CurrentCulture)
                .ToList();
        })!;
    }

    private IReadOnlyList<MaterialItem> GetMaterialSnapshot(string stamp)
    {
        return _cache.GetOrCreate($"pricing:materials:{stamp}", entry =>
        {
            entry.SlidingExpiration = TimeSpan.FromMinutes(30);
            return _materials.GetAll();
        })!;
    }

    private IReadOnlyList<RateTier> GetWasteTierSnapshot(string stamp)
    {
        return _cache.GetOrCreate($"pricing:waste-tiers:{stamp}", entry =>
        {
            entry.SlidingExpiration = TimeSpan.FromMinutes(30);
            return _wasteTiers.GetAll();
        })!;
    }

    private PricingSettings GetSettingsSnapshot(string stamp)
    {
        return _cache.GetOrCreate($"pricing:settings:{stamp}", entry =>
        {
            entry.SlidingExpiration = TimeSpan.FromMinutes(30);
            return _settings.Get();
        })!;
    }

    private string GetDatabaseStamp()
    {
        if (!File.Exists(_databasePath))
        {
            return "missing";
        }

        var info = new FileInfo(_databasePath);
        return $"{info.LastWriteTimeUtc.Ticks}:{info.Length}";
    }

    private static decimal ResolveWasteRate(
        IEnumerable<RateTier> wasteTiers,
        string categoryName,
        decimal fallbackWasteRate)
    {
        var tier = wasteTiers.FirstOrDefault(item =>
            string.Equals(item.CategoryName, categoryName, StringComparison.CurrentCultureIgnoreCase));

        return tier is null ? fallbackWasteRate : tier.Percent / 100m;
    }

    private static bool UsesManagedContainerTransport(ProductRecipe recipe) =>
        recipe.ProductType is ProductType.Commercial or ProductType.Laminated;

    private static bool UsesAutomaticContainerTransport(ProductRecipe recipe) =>
        recipe.ProductType is ProductType.Commercial or ProductType.Laminated &&
        recipe.LaminationOrigin == LaminationOriginCatalog.Foreign;

    private static bool IsLegacyTransportComponent(string materialName) =>
        materialName.Contains("حمل خارجی", StringComparison.CurrentCultureIgnoreCase) ||
        materialName.Contains("حمل داخلی", StringComparison.CurrentCultureIgnoreCase);

    private static void AddCalculatedTransportLine(
        ICollection<ComponentLine> lines,
        string name,
        decimal amount)
    {
        if (amount <= 0)
        {
            return;
        }

        lines.Add(new ComponentLine(
            name,
            "هزینه حمل محاسباتی",
            1,
            amount,
            amount,
            amount));
    }

    private static void AddCalculatedPurchaseLine(
        ICollection<ComponentLine> lines,
        decimal amount)
    {
        if (amount <= 0)
        {
            return;
        }

        lines.Add(new ComponentLine(
            "قیمت خرید محصول",
            "هزینه خرید محاسباتی",
            1,
            amount,
            amount,
            amount));
    }
}
