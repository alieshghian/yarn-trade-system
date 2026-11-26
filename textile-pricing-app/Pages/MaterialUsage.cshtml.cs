using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using TextilePricingApp.Models;
using TextilePricingApp.Services;

namespace TextilePricingApp.Pages;

public class MaterialUsageModel : PageModel
{
    private readonly AnalysisRepository _analysis;

    public MaterialUsageModel(AnalysisRepository analysis)
    {
        _analysis = analysis;
    }

    [BindProperty(SupportsGet = true)]
    public string? Query { get; set; }

    [BindProperty(SupportsGet = true)]
    public int? MaterialId { get; set; }

    public IReadOnlyList<MaterialUsageSummary> Materials { get; private set; } = [];
    public IReadOnlyList<MaterialUsageRow> Rows { get; private set; } = [];
    public MaterialUsageSummary? SelectedMaterial { get; private set; }

    public void OnGet()
    {
        Materials = _analysis.GetMaterialUsageSummary(Query);
        if (MaterialId is null && Materials.Count > 0)
        {
            MaterialId = Materials.First().MaterialId;
        }

        SelectedMaterial = MaterialId is > 0
            ? Materials.FirstOrDefault(item => item.MaterialId == MaterialId.Value)
            : null;
        Rows = _analysis.GetMaterialUsages(MaterialId, Query);
    }
}
