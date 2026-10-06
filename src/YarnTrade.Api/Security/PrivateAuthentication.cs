using System.Globalization;
using System.Net;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.BearerToken;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;
using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;

namespace YarnTrade.Api.Security;

public sealed class DevelopmentAutoLoginOptions
{
    public bool Enabled { get; set; }
    public string UserEmail { get; set; } = "admin@yarntrade.local";
}

public sealed class PrivateAuthentication(UserManager<AppUser> users, AppSignInManager signIn,
    IAuthenticationEmailSender mail, IDataProtectionProvider protection, TimeProvider clock,
    SecurityBaselineOptions settings, IWebHostEnvironment environment, ILogger<PrivateAuthentication> logger, AppDbContext db)
{
    public const string TokenProvider = "YarnTrade.Authentication";
    public const string SessionClaim = "yarntrade.session";
    private const string ChallengeName = "EmailChallenge";
    private readonly IDataProtector protector = protection.CreateProtector("YarnTrade.PrivateAuthentication.v1");
    private sealed record Envelope(string Purpose, string Email, string Stamp, DateTimeOffset Expires,
        string Value, bool UseCookies = false, bool Persistent = false);
    private sealed record Challenge(string Nonce, string Stamp, DateTimeOffset Expires, int Attempts, int Sends, DateTimeOffset SentAt);

    public static bool IsLocalDevelopmentRequest(HttpContext context, SecurityBaselineOptions options, IWebHostEnvironment env)
    {
        if (!env.IsDevelopment() || !options.DevelopmentAutoLogin.Enabled || context.Connection.RemoteIpAddress is not { } ip ||
            !IsLoopback(ip) || context.Request.Headers.ContainsKey("Forwarded") ||
            context.Request.Headers.ContainsKey("X-Forwarded-For") || context.Request.Headers.ContainsKey("X-Forwarded-Proto")) return false;
        // The local Vite proxy overwrites this header from the actual socket peer, including LAN clients.
        if (context.Request.Headers.TryGetValue("X-YarnTrade-Development-Client", out var peer) &&
            (!IPAddress.TryParse(peer.ToString(), out var address) || !IsLoopback(address))) return false;
        if (context.Request.Headers.TryGetValue("Origin", out var origin) &&
            (!Uri.TryCreate(origin, UriKind.Absolute, out var uri) || !IsLocalHost(uri.Host))) return false;
        return IsLocalHost(context.Request.Host.Host);
    }

    private static bool IsLocalHost(string host) => host.Equals("localhost", StringComparison.OrdinalIgnoreCase) ||
        IPAddress.TryParse(host.Trim('[', ']'), out var address) && IsLoopback(address);
    private static bool IsLoopback(IPAddress address) => IPAddress.IsLoopback(address.IsIPv4MappedToIPv6 ? address.MapToIPv4() : address);
    private bool Eligible(AppUser? user) => user is { IsActive: true, EmailConfirmed: true, PasswordHash: not null };
    private static IResult Failure() => Results.Problem(statusCode: 401, title: "Sign in or verification failed.");
    private static IResult InvalidLink() => Results.Problem(statusCode: 400, title: "This link is invalid or expired.");
    private static string Nonce() => Convert.ToHexString(RandomNumberGenerator.GetBytes(24));
    private string Protect(Envelope value) => protector.Protect(JsonSerializer.Serialize(value));
    private Envelope? Read(string? value, string purpose)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(value) || value.Length > 8192) return null;
            var result = JsonSerializer.Deserialize<Envelope>(protector.Unprotect(value));
            return result?.Purpose == purpose && result.Expires > clock.GetUtcNow() ? result : null;
        }
        catch (Exception ex) when (ex is CryptographicException or JsonException or FormatException) { return null; }
    }

    public async Task<IResult> LoginAsync(PasswordLoginInput input, HttpContext context, bool useCookies, bool persistent, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(input.Email) || string.IsNullOrEmpty(input.Password)) return Failure();
        var user = await users.FindByEmailAsync(input.Email.Trim());
        if (!Eligible(user) || !(await signIn.CheckPasswordSignInAsync(user!, input.Password, lockoutOnFailure: true)).Succeeded) return Failure();
        if (await signIn.HasValidBrowserTrustAsync(user!, clock))
            return await IssueAsync(user!, useCookies, persistent, "email-device");
        return await BeginChallengeAsync(user!, useCookies, persistent, ct);
    }

    private async Task<IResult> BeginChallengeAsync(AppUser user, bool useCookies, bool persistent, CancellationToken ct)
    {
        if (!mail.IsAvailable) throw new AuthenticationEmailUnavailableException();
        var now = clock.GetUtcNow();
        var previous = await GetChallengeAsync(user);
        if (previous is not null && previous.Stamp == user.SecurityStamp && previous.Expires > now)
        {
            // Repeated password submissions cannot reset the attempt budget or the resend cooldown.
            if (previous.Attempts >= settings.OtpMaxAttempts) return Failure();
            return ChallengeResult(user, previous, useCookies, persistent);
        }
        var state = new Challenge(Nonce(), user.SecurityStamp!, now.AddMinutes(settings.OtpMinutes), 0, 1, now);
        if (!(await SaveChallengeAsync(user, state)).Succeeded) return Failure();
        try { await SendCodeAsync(user, state, ct); }
        catch (AuthenticationEmailUnavailableException) { await users.RemoveAuthenticationTokenAsync(user, TokenProvider, ChallengeName); throw; }
        return ChallengeResult(user, state, useCookies, persistent);
    }

    private IResult ChallengeResult(AppUser user, Challenge state, bool cookie, bool persistent) => Results.Json(new
    {
        requiresVerification = true,
        challenge = Protect(new("email-device", user.Email!, state.Stamp, state.Expires, state.Nonce, cookie, persistent)),
        message = "A verification code was sent to your registered email address.",
        resendAfterSeconds = settings.OtpResendSeconds
    }, statusCode: 202);
    private async Task SendCodeAsync(AppUser user, Challenge state, CancellationToken ct)
    {
        var code = await users.GenerateUserTokenAsync(user, TokenOptions.DefaultEmailProvider, "EmailDevice:" + state.Nonce);
        await mail.SendAsync(user.Email!, "Yarn Trade verification code", "Your one-time verification code is: " + code +
            "\nIt expires shortly. Do not share this code.", ct);
    }

    private async Task<Challenge?> GetChallengeAsync(AppUser user)
    {
        var value = await users.GetAuthenticationTokenAsync(user, TokenProvider, ChallengeName);
        return value is null ? null : JsonSerializer.Deserialize<Challenge>(value);
    }
    private Task<IdentityResult> SaveChallengeAsync(AppUser user, Challenge value) =>
        users.SetAuthenticationTokenAsync(user, TokenProvider, ChallengeName, JsonSerializer.Serialize(value));

    public async Task<IResult> VerifyAsync(EmailVerificationInput input, HttpContext context, IAntiforgery antiforgery, CancellationToken ct)
    {
        var envelope = Read(input.Challenge, "email-device");
        if (envelope is null) return Failure();
        var user = await users.FindByEmailAsync(envelope.Email);
        if (!Eligible(user) || user!.SecurityStamp != envelope.Stamp || await users.IsLockedOutAsync(user)) return Failure();
        var state = await GetChallengeAsync(user);
        if (state is null || state.Nonce != envelope.Value || state.Stamp != user.SecurityStamp ||
            state.Expires <= clock.GetUtcNow() || state.Attempts >= settings.OtpMaxAttempts) return Failure();
        if (envelope.UseCookies)
        {
            try { await antiforgery.ValidateRequestAsync(context); }
            catch (AntiforgeryValidationException) { return Results.Problem(statusCode: 400, title: "A valid CSRF token is required."); }
        }
        // Identity's user concurrency stamp reserves the attempt before checking the code.
        if (!(await SaveChallengeAsync(user, state with { Attempts = state.Attempts + 1 })).Succeeded) return Failure();
        if (string.IsNullOrWhiteSpace(input.Code) || !await users.VerifyUserTokenAsync(user, TokenOptions.DefaultEmailProvider, "EmailDevice:" + state.Nonce, input.Code))
        {
            await users.AccessFailedAsync(user);
            return Failure();
        }
        // Token removal and user concurrency update are one Identity/EF save; only its winner may sign in.
        if (!(await users.RemoveAuthenticationTokenAsync(user, TokenProvider, ChallengeName)).Succeeded) return Failure();
        if (!(await users.ResetAccessFailedCountAsync(user)).Succeeded) return Failure();
        await signIn.RememberTwoFactorClientAsync(user);
        return await IssueAsync(user, envelope.UseCookies, envelope.Persistent, "email-device");
    }

    public async Task<IResult> ResendAsync(EmailChallengeInput input, CancellationToken ct)
    {
        var envelope = Read(input.Challenge, "email-device");
        if (envelope is null) return Failure();
        var user = await users.FindByEmailAsync(envelope.Email);
        if (!Eligible(user) || user!.SecurityStamp != envelope.Stamp || await users.IsLockedOutAsync(user)) return Failure();
        var state = await GetChallengeAsync(user);
        if (state is null || state.Nonce != envelope.Value || state.Stamp != user.SecurityStamp ||
            state.Expires <= clock.GetUtcNow() || state.Attempts >= settings.OtpMaxAttempts || state.Sends >= settings.OtpMaxSends) return Failure();
        if (state.SentAt.AddSeconds(settings.OtpResendSeconds) > clock.GetUtcNow())
            return Results.Problem(statusCode: 429, title: "Please wait before requesting another code.");
        var replacement = state with { Nonce = Nonce(), Sends = state.Sends + 1, SentAt = clock.GetUtcNow() };
        if (!(await SaveChallengeAsync(user, replacement)).Succeeded) return Failure();
        try { await SendCodeAsync(user, replacement, ct); }
        catch (AuthenticationEmailUnavailableException) { await users.RemoveAuthenticationTokenAsync(user, TokenProvider, ChallengeName); throw; }
        return ChallengeResult(user, replacement, envelope.UseCookies, envelope.Persistent);
    }

    private async Task<IResult> IssueAsync(AppUser user, bool cookies, bool persistent, string method)
    {
        var oldSessions = await db.UserTokens.Where(x => x.UserId == user.Id && x.LoginProvider == TokenProvider && x.Name.StartsWith("Session:")).ToListAsync();
        db.UserTokens.RemoveRange(oldSessions.Where(x => !DateTimeOffset.TryParse(x.Value, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var expiry) || expiry <= clock.GetUtcNow()));
        await db.SaveChangesAsync();
        var session = Nonce();
        if (!(await users.SetAuthenticationTokenAsync(user, TokenProvider, "Session:" + session,
            clock.GetUtcNow().AddHours(settings.RefreshTokenHours).ToString("O", CultureInfo.InvariantCulture))).Succeeded) return Failure();
        signIn.AuthenticationScheme = cookies ? IdentityConstants.ApplicationScheme : IdentityConstants.BearerScheme;
        await signIn.SignInWithClaimsAsync(user, persistent, [new Claim("amr", method), new Claim(SessionClaim, session)]);
        return Results.Empty;
    }

    public async Task<bool> ValidateSessionAsync(ClaimsPrincipal principal, HttpContext context)
    {
        var method = principal.FindFirstValue("amr");
        if (method != "email-device" && (method != "development" || !IsLocalDevelopmentRequest(context, settings, environment))) return false;
        var user = await signIn.ValidateSecurityStampAsync(principal);
        var session = principal.FindFirstValue(SessionClaim);
        if (!Eligible(user) || string.IsNullOrEmpty(session)) return false;
        var expiry = await users.GetAuthenticationTokenAsync(user!, TokenProvider, "Session:" + session);
        return DateTimeOffset.TryParse(expiry, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var deadline) && deadline > clock.GetUtcNow();
    }

    public async Task<IResult> RefreshAsync(RefreshSessionInput input, HttpContext context, IOptionsMonitor<BearerTokenOptions> options)
    {
        AuthenticationTicket? ticket;
        try { ticket = options.Get(IdentityConstants.BearerScheme).RefreshTokenProtector.Unprotect(input.RefreshToken ?? ""); }
        catch (CryptographicException) { return Failure(); }
        if (ticket?.Properties.ExpiresUtc is not { } expiry || expiry <= clock.GetUtcNow() || !await ValidateSessionAsync(ticket.Principal, context)) return Failure();
        var user = (await users.GetUserAsync(ticket.Principal))!;
        if (!(await users.RemoveAuthenticationTokenAsync(user, TokenProvider, "Session:" + ticket.Principal.FindFirstValue(SessionClaim))).Succeeded) return Failure();
        return await IssueAsync(user, false, false, ticket.Principal.FindFirstValue("amr")!);
    }

    public async Task<IResult> DevelopmentSessionAsync(HttpContext context)
    {
        if (!environment.IsDevelopment() || !settings.DevelopmentAutoLogin.Enabled) return Results.NotFound();
        if (!IsLocalDevelopmentRequest(context, settings, environment)) return Results.Forbid();
        var user = await users.FindByEmailAsync(settings.DevelopmentAutoLogin.UserEmail);
        if (!Eligible(user) || !await users.IsInRoleAsync(user!, "Administrator") || await users.IsLockedOutAsync(user!)) return Failure();
        return await IssueAsync(user!, false, false, "development");
    }

    public async Task SendInvitationAsync(AppUser user, CancellationToken ct)
    {
        if (await users.HasPasswordAsync(user)) throw new InvalidOperationException("An activated account cannot be reinvited.");
        if (!(await users.UpdateSecurityStampAsync(user)).Succeeded) throw new InvalidOperationException("Invitation reissue failed.");
        var reset = await users.GeneratePasswordResetTokenAsync(user);
        var invitation = Protect(new("invitation", user.Email!, user.SecurityStamp!, clock.GetUtcNow().AddHours(settings.InvitationHours), reset));
        await mail.SendAsync(user.Email!, "Yarn Trade invitation", "Choose your password using this one-time link:\n" + Link("activate", invitation), ct);
    }

    public async Task<IResult> ActivateAsync(SetInitialPasswordInput input)
    {
        var envelope = Read(input.Token, "invitation");
        if (envelope is null) return InvalidLink();
        var user = await users.FindByEmailAsync(envelope.Email);
        if (user is null || user.SecurityStamp != envelope.Stamp || await users.HasPasswordAsync(user)) return InvalidLink();
        user.EmailConfirmed = true;
        var result = await users.ResetPasswordAsync(user, envelope.Value, input.NewPassword ?? "");
        return result.Succeeded ? Results.Ok() : PasswordFailure(result);
    }

    private string Link(string action, string token) => settings.PublicAppOrigin + "/#" + action + "=" + Uri.EscapeDataString(token);
    private static IResult PasswordFailure(IdentityResult result) => result.Errors.Any(error => error.Code.StartsWith("Password", StringComparison.Ordinal))
        ? Results.ValidationProblem(result.Errors.Where(error => error.Code.StartsWith("Password", StringComparison.Ordinal)).ToDictionary(error => error.Code, error => new[] { error.Description })) : InvalidLink();

    public async Task<IResult> ForgotPasswordAsync(RecoveryRequestInput input, HttpContext context, CancellationToken ct)
    {
        if (!mail.IsAvailable) throw new AuthenticationEmailUnavailableException();
        var user = string.IsNullOrWhiteSpace(input.Email) ? null : await users.FindByEmailAsync(input.Email.Trim());
        if (Eligible(user))
        {
            var reset = await users.GeneratePasswordResetTokenAsync(user!);
            var token = Protect(new("password-reset", user!.Email!, user.SecurityStamp!, clock.GetUtcNow().AddHours(settings.PasswordResetHours), reset));
            try { await mail.SendAsync(user.Email!, "Yarn Trade password reset", "Reset your password using this one-time link:\n" + Link("reset", token), ct); }
            catch (AuthenticationEmailUnavailableException)
            { logger.LogWarning("Authentication email unavailable. Action=recovery TraceId={TraceId}", context.TraceIdentifier); }
        }
        return Results.Ok(new { message = "If the account is eligible, instructions have been sent." });
    }

    public async Task<IResult> ResetPasswordAsync(SetInitialPasswordInput input)
    {
        var envelope = Read(input.Token, "password-reset");
        if (envelope is null) return InvalidLink();
        var user = await users.FindByEmailAsync(envelope.Email);
        if (!Eligible(user) || user!.SecurityStamp != envelope.Stamp) return InvalidLink();
        var result = await users.ResetPasswordAsync(user, envelope.Value, input.NewPassword ?? "");
        return result.Succeeded ? Results.Ok() : PasswordFailure(result);
    }

    public static void MapEndpoints(RouteGroupBuilder group)
    {
        group.MapPost("/login", (PasswordLoginInput input, HttpContext context, PrivateAuthentication auth, bool? useCookies, bool? useSessionCookies, CancellationToken ct) =>
            auth.LoginAsync(input, context, useCookies == true || useSessionCookies == true, useCookies == true && useSessionCookies != true, ct)).AllowAnonymous();
        group.MapPost("/verify-email", (EmailVerificationInput input, HttpContext context, IAntiforgery antiforgery, PrivateAuthentication auth, CancellationToken ct) => auth.VerifyAsync(input, context, antiforgery, ct)).AllowAnonymous();
        group.MapPost("/resend-code", (EmailChallengeInput input, PrivateAuthentication auth, CancellationToken ct) => auth.ResendAsync(input, ct)).AllowAnonymous();
        group.MapPost("/refresh", (RefreshSessionInput input, HttpContext context, PrivateAuthentication auth, IOptionsMonitor<BearerTokenOptions> options) => auth.RefreshAsync(input, context, options)).AllowAnonymous();
        group.MapPost("/activate", (SetInitialPasswordInput input, PrivateAuthentication auth) => auth.ActivateAsync(input)).AllowAnonymous();
        group.MapPost("/forgotPassword", (RecoveryRequestInput input, HttpContext context, PrivateAuthentication auth, CancellationToken ct) => auth.ForgotPasswordAsync(input, context, ct)).AllowAnonymous();
        group.MapPost("/resetPassword", (SetInitialPasswordInput input, PrivateAuthentication auth) => auth.ResetPasswordAsync(input)).AllowAnonymous();
        group.MapGet("/development-session", (HttpContext context, PrivateAuthentication auth) => auth.DevelopmentSessionAsync(context)).AllowAnonymous();
        group.MapGet("/manage/info", async (ClaimsPrincipal principal, UserManager<AppUser> users) =>
        {
            var user = await users.GetUserAsync(principal);
            return user is null ? Results.Unauthorized() : Results.Ok(new { email = user.Email, isEmailConfirmed = user.EmailConfirmed });
        }).RequireAuthenticatedAccess("Read own registered login email.");
        // No register, confirm/change-email, or authenticator-management routes are mapped.
    }
}

public sealed record PasswordLoginInput(string? Email, string? Password);
public sealed record EmailVerificationInput(string? Challenge, string? Code);
public sealed record EmailChallengeInput(string? Challenge);
public sealed record SetInitialPasswordInput(string? Token, string? NewPassword);
public sealed record RecoveryRequestInput(string? Email);
public sealed record RefreshSessionInput(string? RefreshToken);
