using System.Security.Claims;

namespace YarnTrade.Api.Security;

public enum DataScopeKind { OwnUser, BusinessRecord }
public sealed record DataScopeRequest(DataScopeKind Kind, Guid? OwnerUserId = null);

public interface IDataScope
{
    Guid? GetUserId(ClaimsPrincipal principal);
    bool Allows(ClaimsPrincipal principal, DataScopeRequest request);
}

// Only the authenticated user's identity is known today. Business ownership is not guessed.
public sealed class CurrentUserDataScope : IDataScope
{
    public Guid? GetUserId(ClaimsPrincipal principal) => principal.Identity?.IsAuthenticated == true &&
        Guid.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var userId) ? userId : null;
    public bool Allows(ClaimsPrincipal principal, DataScopeRequest request) => request.Kind == DataScopeKind.OwnUser &&
        GetUserId(principal) is { } userId && request.OwnerUserId == userId;
}
