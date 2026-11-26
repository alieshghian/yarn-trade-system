using TextilePricingApp.Models;

namespace TextilePricingApp.Services;

public sealed class MaterialSuggestionService
{
    private const string ServiceKind = "خدمت";
    private const string YarnKind = "نخ";
    private const string FabricKind = "پارچه";

    public IReadOnlyList<MaterialSuggestion> Rank(
        AnalysisRuleRowDefinition row,
        IEnumerable<MaterialItem> materials,
        IReadOnlySet<int> semiFinishedMaterialIds,
        int take = 3)
    {
        return materials
            .Where(material => IsAllowed(row, material, semiFinishedMaterialIds))
            .Select(material => new MaterialSuggestion(material, Score(row.SuggestedKeywords, material.Name)))
            .Where(suggestion => suggestion.Rank > 0)
            .OrderByDescending(suggestion => suggestion.Rank)
            .ThenBy(suggestion => suggestion.Material.Name, StringComparer.CurrentCulture)
            .Take(Math.Max(1, take))
            .ToList();
    }

    public IReadOnlyList<MaterialItem> GetAllowed(
        AnalysisRuleRowDefinition row,
        IEnumerable<MaterialItem> materials,
        IReadOnlySet<int> semiFinishedMaterialIds)
    {
        return materials
            .Where(material => IsAllowed(row, material, semiFinishedMaterialIds))
            .OrderBy(material => material.Name, StringComparer.CurrentCulture)
            .ToList();
    }

    public bool IsAllowed(
        AnalysisRuleRowDefinition row,
        MaterialItem material,
        IReadOnlySet<int> semiFinishedMaterialIds)
    {
        var isService = string.Equals(material.Kind.Trim(), ServiceKind, StringComparison.CurrentCultureIgnoreCase);
        return row.SelectionScope switch
        {
            AnalysisSelectionScope.ServicesOnly =>
                isService,
            AnalysisSelectionScope.PackagingOnly => IsPackaging(material.Name),
            AnalysisSelectionScope.MaterialsOrSemiFinished =>
                !isService && !IsPackaging(material.Name),
            AnalysisSelectionScope.YarnOrSemiFinished =>
                semiFinishedMaterialIds.Contains(material.Id) ||
                IsFabric(material) ||
                (!isService && !IsPackaging(material.Name) &&
                 (string.Equals(material.Kind.Trim(), YarnKind, StringComparison.CurrentCultureIgnoreCase) ||
                  material.Name.Contains(YarnKind, StringComparison.CurrentCultureIgnoreCase) ||
                  material.Name.Contains("چله", StringComparison.CurrentCultureIgnoreCase) ||
                  material.Name.Contains("تار", StringComparison.CurrentCultureIgnoreCase))),
            AnalysisSelectionScope.SemiFinishedOnly =>
                semiFinishedMaterialIds.Contains(material.Id) || IsFabric(material),
            _ => false
        };
    }

    public int Score(IEnumerable<string> keywords, string materialName)
    {
        var score = 0;
        foreach (var keyword in keywords.Where(value => !string.IsNullOrWhiteSpace(value)))
        {
            var normalized = keyword.Trim();
            if (materialName.Contains(normalized, StringComparison.CurrentCultureIgnoreCase))
            {
                score += 100;
                if (materialName.StartsWith(normalized, StringComparison.CurrentCultureIgnoreCase))
                {
                    score += 20;
                }
            }
        }

        return score;
    }

    private static bool IsPackaging(string name)
    {
        return name.Contains("بسته", StringComparison.CurrentCultureIgnoreCase) ||
            name.Contains("کارتن", StringComparison.CurrentCultureIgnoreCase) ||
            name.Contains("لفاف", StringComparison.CurrentCultureIgnoreCase);
    }

    private static bool IsFabric(MaterialItem material) =>
        string.Equals(material.Kind.Trim(), FabricKind, StringComparison.CurrentCultureIgnoreCase);
}
