using Microsoft.AspNetCore.Mvc.RazorPages;
using TextilePricingApp.Models;
using TextilePricingApp.Services;

namespace TextilePricingApp.Pages;

public class LicenseModel : PageModel
{
    private readonly LicenseService _license;

    public LicenseModel(LicenseService license)
    {
        _license = license;
    }

    public LicenseStatus Status { get; private set; } = default!;

    public void OnGet()
    {
        Status = _license.GetStatus();
    }
}
