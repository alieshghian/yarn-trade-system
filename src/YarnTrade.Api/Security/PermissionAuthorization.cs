using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authorization.Policy;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Options;

namespace YarnTrade.Api.Security;

[AttributeUsage(AttributeTargets.Method, AllowMultiple = true)]
public sealed class RequirePermissionAttribute : AuthorizeAttribute
{
    public const string PolicyPrefix = "Permission:";
    public string Permission { get; }
    public RequirePermissionAttribute(string permission)
    {
        if (!PermissionCatalog.All.Any(x => x.Key == permission))
            throw new ArgumentException("The permission must be defined in PermissionCatalog.", nameof(permission));
        Permission = permission;
        Policy = PolicyPrefix + permission;
    }
}

// An explicit exception for own-account/session operations, never a blanket controller exemption.
[AttributeUsage(AttributeTargets.Method)]
public sealed class AuthenticatedOnlyAttribute : AuthorizeAttribute
{
    public string Reason { get; }
    public AuthenticatedOnlyAttribute(string reason)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(reason);
        Reason = reason;
    }
}

public sealed record PermissionRequirement(string Permission) : IAuthorizationRequirement;
public sealed class EndpointAuthorizationDecision : IAuthorizationRequirement;

public sealed class PermissionPolicyProvider(IOptions<AuthorizationOptions> options) : DefaultAuthorizationPolicyProvider(options)
{
    public override Task<AuthorizationPolicy?> GetPolicyAsync(string policyName)
    {
        if (!policyName.StartsWith(RequirePermissionAttribute.PolicyPrefix, StringComparison.Ordinal))
            return base.GetPolicyAsync(policyName);
        var permission = policyName[RequirePermissionAttribute.PolicyPrefix.Length..];
        if (!PermissionCatalog.All.Any(x => x.Key == permission))
            throw new InvalidOperationException("Unknown permission policy.");
        return Task.FromResult<AuthorizationPolicy?>(new AuthorizationPolicyBuilder().RequireAuthenticatedUser()
            .AddRequirements(new EndpointAuthorizationDecision(), new PermissionRequirement(permission)).Build());
    }
}

public sealed class PermissionAuthorizationHandler(PermissionService permissions) : AuthorizationHandler<PermissionRequirement>
{
    protected override async Task HandleRequirementAsync(AuthorizationHandlerContext context, PermissionRequirement requirement)
    {
        if (context.User.Identity?.IsAuthenticated == true &&
            (await permissions.GetEffectiveAsync(context.User, (context.Resource as HttpContext)?.RequestAborted ?? default)).Contains(requirement.Permission))
            context.Succeed(requirement);
    }
}

public sealed class EndpointAuthorizationDecisionHandler : AuthorizationHandler<EndpointAuthorizationDecision>
{
    protected override Task HandleRequirementAsync(AuthorizationHandlerContext context, EndpointAuthorizationDecision requirement)
    {
        var endpoint = (context.Resource as HttpContext)?.GetEndpoint();
        // Router-generated rejection endpoints (405/415) are not RouteEndpoints and
        // execute no application action. Keep those responses and unmatched 404s.
        // Every mapped application endpoint is also checked by startup validation.
        if (endpoint is not RouteEndpoint || context.User.Identity?.IsAuthenticated == true && PermissionAuthorization.HasExplicitDecision(endpoint))
            context.Succeed(requirement);
        return Task.CompletedTask;
    }
}

public sealed class PermissionAuthorizationResultHandler : IAuthorizationMiddlewareResultHandler
{
    private readonly AuthorizationMiddlewareResultHandler fallback = new();
    public async Task HandleAsync(RequestDelegate next, HttpContext context, AuthorizationPolicy policy, PolicyAuthorizationResult result)
    {
        // Role-only policies do not combine ASP.NET Core's default policy. They must not
        // become an implicit classification if an endpoint's permission is forgotten.
        if (result.Forbidden || result.Succeeded && context.GetEndpoint() is RouteEndpoint endpoint && !PermissionAuthorization.HasExplicitDecision(endpoint))
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            var missing = result.AuthorizationFailure?.FailedRequirements.OfType<PermissionRequirement>().Select(x => x.Permission).FirstOrDefault();
            await context.Response.WriteAsJsonAsync(new { error = "شما مجوز انجام این عملیات را ندارید.", permission = missing }, context.RequestAborted);
            return;
        }
        await fallback.HandleAsync(next, context, policy, result);
    }
}

public static class PermissionAuthorization
{
    public static IServiceCollection AddPermissionAuthorization(this IServiceCollection services)
    {
        services.AddAuthorization(options =>
        {
            options.DefaultPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().AddRequirements(new EndpointAuthorizationDecision()).Build();
            options.FallbackPolicy = new AuthorizationPolicyBuilder().AddRequirements(new EndpointAuthorizationDecision()).Build();
        });
        services.AddSingleton<IAuthorizationPolicyProvider, PermissionPolicyProvider>();
        services.AddScoped<IAuthorizationHandler, PermissionAuthorizationHandler>();
        services.AddSingleton<IAuthorizationHandler, EndpointAuthorizationDecisionHandler>();
        services.AddSingleton<IAuthorizationMiddlewareResultHandler, PermissionAuthorizationResultHandler>();
        services.AddScoped<PermissionService>();
        services.AddScoped<IDataScope, CurrentUserDataScope>();
        return services;
    }

    public static bool HasExplicitDecision(Endpoint endpoint) =>
        endpoint.Metadata.GetMetadata<IAllowAnonymous>() is not null ||
        endpoint.Metadata.GetOrderedMetadata<IAuthorizeData>().Any(x => x is RequirePermissionAttribute or AuthenticatedOnlyAttribute);

    public static void ValidateEndpointDecisions(IEnumerable<Endpoint> endpoints)
    {
        foreach (var endpoint in endpoints)
        {
            var permissions = endpoint.Metadata.GetOrderedMetadata<RequirePermissionAttribute>();
            var ownAccount = endpoint.Metadata.GetMetadata<AuthenticatedOnlyAttribute>();
            var anonymous = endpoint.Metadata.GetMetadata<IAllowAnonymous>();
            if (!HasExplicitDecision(endpoint) || anonymous is not null && (permissions.Count > 0 || ownAccount is not null) ||
                ownAccount is not null && permissions.Count > 0)
                throw new InvalidOperationException($"Endpoint needs one explicit authorization classification: {endpoint.DisplayName}");
        }
    }

    public static TBuilder RequirePermission<TBuilder>(this TBuilder builder, string permission) where TBuilder : IEndpointConventionBuilder =>
        builder.RequireAuthorization(new RequirePermissionAttribute(permission));
    public static TBuilder RequireAuthenticatedAccess<TBuilder>(this TBuilder builder, string reason) where TBuilder : IEndpointConventionBuilder =>
        builder.RequireAuthorization(new AuthenticatedOnlyAttribute(reason));
}
