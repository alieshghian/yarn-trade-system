using System.Security.Claims;

namespace TextilePricingApp.Services;

public sealed class PageAccessService
{
    private readonly AuthRepository _auth;
    private readonly IHttpContextAccessor _httpContextAccessor;

    public PageAccessService(AuthRepository auth, IHttpContextAccessor httpContextAccessor)
    {
        _auth = auth;
        _httpContextAccessor = httpContextAccessor;
    }

    public bool IsAuthenticated => _httpContextAccessor.HttpContext?.User.Identity?.IsAuthenticated == true;

    public int UserId
    {
        get
        {
            var value = _httpContextAccessor.HttpContext?.User.FindFirstValue(ClaimTypes.NameIdentifier);
            return int.TryParse(value, out var id) ? id : 0;
        }
    }

    public bool IsAdmin => _httpContextAccessor.HttpContext?.User.HasClaim("IsAdmin", "true") == true;

    public string DisplayName =>
        _httpContextAccessor.HttpContext?.User.FindFirstValue("DisplayName")
        ?? _httpContextAccessor.HttpContext?.User.Identity?.Name
        ?? "";

    public FormAccess GetAccess(string formKey)
    {
        if (IsAdmin)
        {
            return new FormAccess(true, true);
        }

        return UserId > 0 ? _auth.GetAccess(UserId, formKey) : new FormAccess(false, false);
    }

    public bool CanView(string formKey) => GetAccess(formKey).CanView;

    public bool CanEdit(string formKey) => GetAccess(formKey).CanEdit;
}
