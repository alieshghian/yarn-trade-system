using System.Security.Claims;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;
using YarnTrade.Api.Domain;

namespace YarnTrade.Api.Security;

public sealed class AppSignInManager(UserManager<AppUser> users, IHttpContextAccessor accessor,
    IUserClaimsPrincipalFactory<AppUser> claimsFactory, IOptions<IdentityOptions> options,
    ILogger<SignInManager<AppUser>> logger, IAuthenticationSchemeProvider schemes, IUserConfirmation<AppUser> confirmation)
    : SignInManager<AppUser>(users, accessor, claimsFactory, options, logger, schemes, confirmation)
{
    public override Task<bool> CanSignInAsync(AppUser user) => user.IsActive ? base.CanSignInAsync(user) : Task.FromResult(false);

    public override async Task<AppUser?> ValidateSecurityStampAsync(ClaimsPrincipal? principal)
    {
        var user = await base.ValidateSecurityStampAsync(principal);
        return user is { IsActive: true } && !await UserManager.IsLockedOutAsync(user) ? user : null;
    }

    public async Task RevokeSessionsAsync(ClaimsPrincipal principal)
    {
        var user = await UserManager.GetUserAsync(principal) ?? throw new InvalidOperationException("Session revocation failed.");
        if (!(await UserManager.UpdateSecurityStampAsync(user)).Succeeded)
            throw new InvalidOperationException("Session revocation failed.");
        await SignOutAsync();
        await ForgetTwoFactorClientAsync();
    }
}

public sealed class AuthenticationSessionMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, SignInManager<AppUser> signIn, IAntiforgery antiforgery, ILogger<AuthenticationSessionMiddleware> logger)
    {
        var action = context.Request.Path.Value?.TrimEnd('/').ToLowerInvariant() switch
        {
            "/api/auth/login" => "login",
            "/api/auth/forgotpassword" => "recovery-request",
            "/api/auth/resetpassword" => "password-reset",
            "/api/auth/manage/2fa" => "mfa-management",
            "/api/presence/logout" => "logout",
            _ => null
        };
        if (action is not null && HttpMethods.IsPost(context.Request.Method))
            context.Response.OnCompleted(() =>
            {
                logger.LogInformation("Authentication event. Action={Action} StatusCode={StatusCode} TraceId={TraceId}", action, context.Response.StatusCode, context.TraceIdentifier);
                return Task.CompletedTask;
            });
        if (context.User.Identity?.IsAuthenticated == true && await signIn.ValidateSecurityStampAsync(context.User) is null)
        {
            await signIn.SignOutAsync();
            await signIn.ForgetTwoFactorClientAsync();
            await Results.Problem(statusCode: 401, title: "The session is no longer valid.").ExecuteAsync(context);
            return;
        }
        var unsafeMethod = !HttpMethods.IsGet(context.Request.Method) && !HttpMethods.IsHead(context.Request.Method) && !HttpMethods.IsOptions(context.Request.Method);
        var cookieLogin = context.Request.Path.Value?.TrimEnd('/').Equals("/api/auth/login", StringComparison.OrdinalIgnoreCase) == true &&
            (IsTrue("useCookies") || IsTrue("useSessionCookies"));
        var cookieAuthenticated = context.User.Identity?.IsAuthenticated == true &&
            !(await context.AuthenticateAsync(IdentityConstants.BearerScheme)).Succeeded &&
            (await context.AuthenticateAsync(IdentityConstants.ApplicationScheme)).Succeeded;
        if (unsafeMethod && (cookieLogin || cookieAuthenticated))
        {
            try { await antiforgery.ValidateRequestAsync(context); }
            catch (AntiforgeryValidationException)
            {
                await Results.Problem(statusCode: 400, title: "A valid CSRF token is required.").ExecuteAsync(context);
                return;
            }
        }
        await next(context);
        bool IsTrue(string key) => bool.TryParse(context.Request.Query[key], out var value) && value;
    }
}
