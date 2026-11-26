using TextilePricingApp.Models;

namespace TextilePricingApp.Services;

public sealed class SemiFinishedMaterialService
{
    private const string FabricKind = "پارچه";
    private const string RialUnit = "ریال";
    private readonly AnalysisRepository _analysis;
    private readonly MaterialRepository _materials;
    private readonly FactoryPriceRepository _factoryPrices;
    private readonly SettingsRepository _settings;
    private readonly PricingService _pricing;

    public SemiFinishedMaterialService(
        AnalysisRepository analysis,
        MaterialRepository materials,
        FactoryPriceRepository factoryPrices,
        SettingsRepository settings,
        PricingService pricing)
    {
        _analysis = analysis;
        _materials = materials;
        _factoryPrices = factoryPrices;
        _settings = settings;
        _pricing = pricing;
    }

    public IReadOnlySet<int> GetSystemMaterialIds()
    {
        var productKeys = _analysis.GetAll(take: 5000)
            .SelectMany(product => new[] { product.Name.Trim(), product.Code.Trim() })
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .ToHashSet(StringComparer.CurrentCultureIgnoreCase);

        return _materials.GetAll(take: 5000)
            .Where(material =>
                string.Equals(material.Kind.Trim(), FabricKind, StringComparison.CurrentCultureIgnoreCase) &&
                productKeys.Contains(material.Name.Trim()))
            .Select(material => material.Id)
            .ToHashSet();
    }

    public bool IsSystemMaterial(int materialId) =>
        materialId > 0 && GetSystemMaterialIds().Contains(materialId);

    public void Synchronize(int productId, ProductRecipe? previousProduct = null)
    {
        var product = _analysis.GetById(productId);
        if (product is null)
        {
            return;
        }

        if (product.ProductStatus != ProductStatus.SemiFinished)
        {
            RemoveManagedMaterial(product, previousProduct);
            return;
        }

        var materialName = string.IsNullOrWhiteSpace(product.Name) ? product.Code.Trim() : product.Name.Trim();
        if (string.IsNullOrWhiteSpace(materialName))
        {
            return;
        }

        var candidates = new[]
        {
            materialName,
            product.Code.Trim(),
            previousProduct?.Name.Trim() ?? "",
            previousProduct?.Code.Trim() ?? ""
        }.Where(value => !string.IsNullOrWhiteSpace(value)).ToHashSet(StringComparer.CurrentCultureIgnoreCase);
        var existing = _materials.GetAll(take: 5000)
            .FirstOrDefault(material => candidates.Contains(material.Name.Trim()));
        var cashFactoryPrice = CalculateCashFactoryPrice(product);
        var input = new MaterialInput
        {
            Id = existing?.Id ?? 0,
            Name = materialName,
            Kind = FabricKind,
            Price = cashFactoryPrice,
            Unit = RialUnit,
            MeasurementUnit = MeasurementUnitCatalog.Normalize(product.MeasurementUnit),
            RialPrice = cashFactoryPrice
        };

        if (existing is null)
        {
            _materials.Add(input);
        }
        else if (existing.Name != input.Name ||
                 existing.Kind != input.Kind ||
                 existing.Price != input.Price ||
                 existing.Unit != input.Unit ||
                 existing.MeasurementUnit != input.MeasurementUnit ||
                 existing.RialPrice != input.RialPrice)
        {
            _materials.Update(input);
        }
    }

    public void SynchronizeAll()
    {
        var products = _analysis.GetAll(take: 5000);
        foreach (var product in products.Where(product => product.ProductStatus == ProductStatus.ReadyForSale))
        {
            Synchronize(product.Id);
        }

        var productIds = products
            .Where(product => product.ProductStatus == ProductStatus.SemiFinished)
            .Select(product => product.Id)
            .ToList();

        // Two passes also refresh products whose analysis consumes another semi-finished product.
        for (var pass = 0; pass < 2; pass++)
        {
            foreach (var productId in productIds)
            {
                Synchronize(productId);
            }
        }
    }

    private void RemoveManagedMaterial(ProductRecipe product, ProductRecipe? previousProduct)
    {
        var candidates = new[]
        {
            product.Name.Trim(),
            product.Code.Trim(),
            previousProduct?.Name.Trim() ?? "",
            previousProduct?.Code.Trim() ?? ""
        }.Where(value => !string.IsNullOrWhiteSpace(value))
            .ToHashSet(StringComparer.CurrentCultureIgnoreCase);
        if (candidates.Count == 0)
        {
            return;
        }

        var managedMaterial = _materials.GetAll(take: 5000)
            .FirstOrDefault(material =>
                candidates.Contains(material.Name.Trim()) &&
                string.Equals(material.Kind.Trim(), FabricKind, StringComparison.CurrentCultureIgnoreCase) &&
                string.Equals(material.Unit.Trim(), RialUnit, StringComparison.CurrentCultureIgnoreCase) &&
                material.Price == material.RialPrice);
        if (managedMaterial is null)
        {
            return;
        }

        var isUsedByAnotherProduct = _analysis.GetMaterialUsages(managedMaterial.Id)
            .Any(usage => usage.ProductRecipeId != product.Id);
        if (isUsedByAnotherProduct)
        {
            return;
        }

        _materials.Delete(managedMaterial.Id);
    }

    private decimal CalculateCashFactoryPrice(ProductRecipe product)
    {
        var storedPrices = _factoryPrices.GetAll();
        var settings = _settings.Get();
        var factoryPrice = storedPrices.TryGetValue(product.Code, out var storedFactoryPrice)
            ? storedFactoryPrice
            : CalculateSystemFactoryPrice(product, settings.GlobalProfitPercent);

        var discount = Math.Clamp(settings.CashPaymentDiscountPercent, 0, 100);
        return RoundPrice(factoryPrice * (1 - discount / 100m));
    }

    private decimal CalculateSystemFactoryPrice(ProductRecipe product, decimal profitPercent)
    {
        var cost = _pricing.Calculate(product.Code).Summary.CashCost;
        return RoundPrice(cost * (1 + Math.Max(0, profitPercent) / 100m));
    }

    private static decimal RoundPrice(decimal value) =>
        decimal.Round(Math.Max(0, value) / 100m, 0, MidpointRounding.AwayFromZero) * 100m;
}
