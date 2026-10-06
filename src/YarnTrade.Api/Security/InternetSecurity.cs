using System.Net;
using System.Security.Claims;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication.BearerToken;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.HostFiltering;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Data.SqlClient;
using YarnTrade.Api.Domain;

namespace YarnTrade.Api.Security;

public sealed class SecurityBaselineOptions
{
    public int AccessTokenMinutes { get; set; } = 60;
    public int RefreshTokenHours { get; set; } = 24;
    public int CookieMinutes { get; set; } = 60;
    public int LockoutMinutes { get; set; } = 10;
    public int MaxFailedAccessAttempts { get; set; } = 5;
    public string PublicAppOrigin { get; set; } = "";
    public int InvitationHours { get; set; } = 24;
    public int PasswordResetHours { get; set; } = 1;
    public int TrustedBrowserDays { get; set; } = 30;
    public int OtpMinutes { get; set; } = 10;
    public int OtpMaxAttempts { get; set; } = 5;
    public int OtpMaxSends { get; set; } = 5;
    public int OtpResendSeconds { get; set; } = 60;
    public DevelopmentAutoLoginOptions DevelopmentAutoLogin { get; set; } = new();
    public ProxyOptions ReverseProxy { get; set; } = new();
    public RateLimitRule Authentication { get; set; } = new() { PermitLimit = 30, WindowSeconds = 60 };
    public RateLimitRule Uploads { get; set; } = new() { PermitLimit = 20, WindowSeconds = 60 };
    public RateLimitRule Reports { get; set; } = new() { PermitLimit = 60, WindowSeconds = 60 };
    public RateLimitRule Backups { get; set; } = new() { PermitLimit = 2, WindowSeconds = 300 };
}

public sealed class ProxyOptions
{
    public bool Enabled { get; set; }
    public int ForwardLimit { get; set; } = 1;
    public string[] KnownProxies { get; set; } = [];
}

public sealed class RateLimitRule
{
    public int PermitLimit { get; set; }
    public int WindowSeconds { get; set; }
}

public static class InternetSecurity
{
    public const string Authentication = "authentication";
    public const string Uploads = "uploads";
    public const string Reports = "reports";
    public const string Backups = "backups";

    public static SecurityBaselineOptions ValidateConfiguration(IConfiguration config, bool development)
    {
        var settings = config.GetSection("Security").Get<SecurityBaselineOptions>() ?? new();
        if (settings.AccessTokenMinutes is < 1 or > 60 || settings.RefreshTokenHours is < 1 or > 24 ||
            settings.CookieMinutes is < 1 or > 60 || settings.LockoutMinutes is < 1 or > 60 ||
            settings.MaxFailedAccessAttempts is < 3 or > 10)
            throw new InvalidOperationException("Security session/lockout settings are outside the supported safe ranges.");
        foreach (var rule in new[] { settings.Authentication, settings.Uploads, settings.Reports, settings.Backups })
            if (rule.PermitLimit < 1 || rule.WindowSeconds is < 1 or > 3600)
                throw new InvalidOperationException("Security rate limits must be positive, with windows of at most one hour.");
        if (!development && settings.DevelopmentAutoLogin.Enabled)
            throw new InvalidOperationException("Development auto-login must be disabled outside Development.");
        if (settings.DevelopmentAutoLogin.Enabled && (string.IsNullOrWhiteSpace(settings.DevelopmentAutoLogin.UserEmail) || settings.ReverseProxy.Enabled))
            throw new InvalidOperationException("Development auto-login requires a configured local user and no forwarded-header proxy.");
        if (settings.InvitationHours is < 1 or > 24 || settings.PasswordResetHours is < 1 or > 24 || settings.TrustedBrowserDays is < 1 or > 30 ||
            settings.OtpMinutes is < 1 or > 10 || settings.OtpMaxAttempts is < 1 or > 5 || settings.OtpMaxSends is < 1 or > 5 || settings.OtpResendSeconds is < 30 or > 300)
            throw new InvalidOperationException("Invitation, OTP and browser-trust settings are outside the supported safe ranges.");
        if (settings.ReverseProxy.Enabled && (settings.ReverseProxy.ForwardLimit is < 1 or > 5 ||
            settings.ReverseProxy.KnownProxies.Length == 0 || settings.ReverseProxy.KnownProxies.Any(value =>
                !IPAddress.TryParse(value, out var ip) || ip.Equals(IPAddress.Any) || ip.Equals(IPAddress.IPv6Any))))
            throw new InvalidOperationException("Reverse proxy support requires explicit trusted proxy IP addresses and a bounded ForwardLimit.");

        var origins = config.GetSection("Cors:Origins").Get<string[]>() ?? [];
        if (origins.Any(origin => !Uri.TryCreate(origin, UriKind.Absolute, out var uri) ||
            uri.UserInfo.Length != 0 || uri.Query.Length != 0 || uri.Fragment.Length != 0 ||
            uri.AbsolutePath != "/" || uri.Host.Contains('*') || origin != uri.GetLeftPart(UriPartial.Authority) ||
            (development ? uri.Scheme is not ("http" or "https") : uri.Scheme != "https")))
            throw new InvalidOperationException("Cors:Origins must contain exact origins; HTTPS is required outside Development.");
        if (!development)
        {
            var hosts = (config["AllowedHosts"] ?? "").Split(';', StringSplitOptions.TrimEntries);
            if (hosts.Length == 0 || hosts.Any(host => string.IsNullOrWhiteSpace(host) || host.Contains('*') ||
                Uri.CheckHostName(host) == UriHostNameType.Unknown))
                throw new InvalidOperationException("AllowedHosts must contain explicit host names outside Development.");
            if (origins.Length == 0)
                throw new InvalidOperationException("Cors:Origins must be explicitly configured outside Development.");
            var email = config.GetSection("AuthenticationEmail").Get<AuthenticationEmailOptions>() ?? new();
            if (!email.IsConfigured || !email.EnableSsl || email.Port is < 1 or > 65535)
                throw new InvalidOperationException("Production requires protected SMTP configuration with TLS for authentication email.");
            var connection = config.GetConnectionString("DefaultConnection");
            if (string.IsNullOrWhiteSpace(connection))
                throw new InvalidOperationException("ConnectionStrings:DefaultConnection must be supplied through protected deployment configuration.");
            SqlConnectionStringBuilder sql;
            try { sql = new SqlConnectionStringBuilder(connection); }
            catch (ArgumentException) { throw new InvalidOperationException("The protected SQL connection configuration is invalid."); }
            if (!sql.Encrypt || sql.TrustServerCertificate)
                throw new InvalidOperationException("Production SQL connections require Encrypt=True and TrustServerCertificate=False.");
            if (config.GetValue<bool>("Database:AutoMigrate") || config.GetValue<bool>("Seed:Enabled"))
                throw new InvalidOperationException("Database auto-migration and demo seeding must be disabled outside Development.");
        }
        else if (config.GetValue<bool>("Seed:Enabled") && string.IsNullOrWhiteSpace(config["Seed:AdminPassword"]))
            throw new InvalidOperationException("Set Seed:AdminPassword with .NET user-secrets before enabling development seeding.");
        if (!string.IsNullOrEmpty(settings.PublicAppOrigin) && !origins.Contains(settings.PublicAppOrigin, StringComparer.Ordinal))
            throw new InvalidOperationException("Security:PublicAppOrigin must be one of the exact configured frontend origins.");
        if (!development && string.IsNullOrEmpty(settings.PublicAppOrigin))
            throw new InvalidOperationException("Security:PublicAppOrigin is required for protected invitation/recovery links.");
        return settings;
    }

    public static IdentityBuilder AddInternetSecurity(this WebApplicationBuilder builder)
    {
        var development = builder.Environment.IsDevelopment();
        var settings = ValidateConfiguration(builder.Configuration, development);
        builder.Services.AddSingleton(settings);
        builder.Services.AddSingleton(builder.Configuration.GetSection("AuthenticationEmail").Get<AuthenticationEmailOptions>() ?? new());
        builder.Services.AddScoped<IAuthenticationEmailSender, SmtpAuthenticationEmailSender>();
        builder.Services.AddScoped<PrivateAuthentication>();
        builder.Services.AddDataProtection().SetApplicationName("YarnTrade:" + builder.Environment.EnvironmentName);
        // Framework exception/database loggers can include SQL, paths or URL query secrets.
        // SafeExceptionHandler records only exception type and correlation ID.
        if (!development)
        {
            builder.Logging.AddFilter("Microsoft.AspNetCore", LogLevel.Warning);
            builder.Logging.AddFilter("Microsoft.AspNetCore.Diagnostics.ExceptionHandlerMiddleware", LogLevel.None);
            builder.Logging.AddFilter("Microsoft.AspNetCore.Server.Kestrel", LogLevel.None);
            builder.Logging.AddFilter("Microsoft.EntityFrameworkCore", LogLevel.None);
        }
        builder.Services.AddProblemDetails(options => options.CustomizeProblemDetails = context =>
        {
            context.ProblemDetails.Extensions["traceId"] = context.HttpContext.TraceIdentifier;
            if (!development && context.ProblemDetails.Status >= 500)
            {
                context.ProblemDetails.Title = "An unexpected error occurred.";
                context.ProblemDetails.Detail = null;
                context.ProblemDetails.Instance = null;
                context.ProblemDetails.Extensions.Clear();
                context.ProblemDetails.Extensions["traceId"] = context.HttpContext.TraceIdentifier;
            }
        });
        builder.Services.AddExceptionHandler<SafeExceptionHandler>();
        builder.Services.Configure<HostFilteringOptions>(options =>
        {
            options.AllowedHosts = (builder.Configuration["AllowedHosts"] ?? "").Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            options.IncludeFailureMessage = false;
        });
        builder.Services.Configure<ForwardedHeadersOptions>(options =>
        {
            options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
            options.ForwardLimit = settings.ReverseProxy.ForwardLimit;
            options.KnownNetworks.Clear();
            options.KnownProxies.Clear();
            foreach (var proxy in settings.ReverseProxy.KnownProxies) options.KnownProxies.Add(IPAddress.Parse(proxy));
        });
        builder.Services.AddHsts(options => { options.MaxAge = TimeSpan.FromDays(30); options.IncludeSubDomains = false; options.Preload = false; });
        builder.Services.AddHttpsRedirection(options => { options.HttpsPort = 443; options.RedirectStatusCode = StatusCodes.Status308PermanentRedirect; });
        builder.Services.AddCors(options => options.AddPolicy("frontend", policy =>
            policy.WithOrigins(builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? []).AllowAnyHeader().AllowAnyMethod().AllowCredentials()));
        builder.Services.AddAntiforgery(options =>
        {
            options.HeaderName = "X-CSRF-TOKEN";
            options.Cookie.HttpOnly = true;
            options.Cookie.SameSite = SameSiteMode.Strict;
            options.Cookie.SecurePolicy = development ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
        });
        builder.Services.Configure<BearerTokenOptions>(IdentityConstants.BearerScheme, options =>
        {
            options.BearerTokenExpiration = TimeSpan.FromMinutes(settings.AccessTokenMinutes);
            options.RefreshTokenExpiration = TimeSpan.FromHours(settings.RefreshTokenHours);
        });
        builder.Services.AddOptions<BearerTokenOptions>(IdentityConstants.BearerScheme).Configure<TimeProvider>((options, clock) => options.TimeProvider = clock);
        foreach (var scheme in new[] { IdentityConstants.ApplicationScheme, IdentityConstants.ExternalScheme, IdentityConstants.TwoFactorUserIdScheme, IdentityConstants.TwoFactorRememberMeScheme })
            builder.Services.PostConfigure<CookieAuthenticationOptions>(scheme, options =>
            {
                options.Cookie.HttpOnly = true;
                options.Cookie.SameSite = SameSiteMode.Strict;
                options.Cookie.SecurePolicy = development ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
                options.ExpireTimeSpan = TimeSpan.FromMinutes(scheme == IdentityConstants.ExternalScheme || scheme == IdentityConstants.TwoFactorUserIdScheme ? 5 : settings.CookieMinutes);
                if (scheme == IdentityConstants.TwoFactorRememberMeScheme)
                {
                    options.ExpireTimeSpan = TimeSpan.FromDays(settings.TrustedBrowserDays);
                    options.Events.OnValidatePrincipal = async context =>
                    {
                        var signIn = context.HttpContext.RequestServices.GetRequiredService<AppSignInManager>();
                        if (await signIn.ValidateTwoFactorSecurityStampAsync(context.Principal) is null) context.RejectPrincipal();
                        context.ShouldRenew = false;
                    };
                }
                if (scheme == IdentityConstants.ApplicationScheme)
                    options.Events.OnValidatePrincipal = async context =>
                    {
                        var signIn = context.HttpContext.RequestServices.GetRequiredService<AppSignInManager>();
                        if (await signIn.ValidateSecurityStampAsync(context.Principal) is null) context.RejectPrincipal();
                        // Keep the session claim and its fixed expiry; Identity's periodic principal rebuild would drop it.
                        context.ShouldRenew = false;
                    };
                options.SlidingExpiration = false;
                options.Events.OnRedirectToLogin = context => { context.Response.StatusCode = 401; return Task.CompletedTask; };
                options.Events.OnRedirectToAccessDenied = context => { context.Response.StatusCode = 403; return Task.CompletedTask; };
            });
        foreach (var scheme in new[] { IdentityConstants.ApplicationScheme, IdentityConstants.ExternalScheme, IdentityConstants.TwoFactorUserIdScheme, IdentityConstants.TwoFactorRememberMeScheme })
            builder.Services.AddOptions<CookieAuthenticationOptions>(scheme).Configure<TimeProvider>((options, clock) => options.TimeProvider = clock);
        builder.Services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            AddPolicy(Authentication, settings.Authentication, byUser: false);
            AddPolicy(Uploads, settings.Uploads, byUser: true);
            AddPolicy(Reports, settings.Reports, byUser: true);
            AddPolicy(Backups, settings.Backups, byUser: true);
            void AddPolicy(string name, RateLimitRule rule, bool byUser) => options.AddPolicy(name, context =>
                RateLimitPartition.GetFixedWindowLimiter(
                    byUser && context.User.Identity?.IsAuthenticated == true
                        ? "user:" + context.User.FindFirstValue(ClaimTypes.NameIdentifier)
                        : "ip:" + (context.Connection.RemoteIpAddress?.ToString() ?? "unknown"),
                    _ => new FixedWindowRateLimiterOptions { PermitLimit = rule.PermitLimit, Window = TimeSpan.FromSeconds(rule.WindowSeconds), QueueLimit = 0, AutoReplenishment = true }));
            options.OnRejected = async (context, ct) =>
            {
                if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retry))
                    context.HttpContext.Response.Headers.RetryAfter = Math.Ceiling(retry.TotalSeconds).ToString(System.Globalization.CultureInfo.InvariantCulture);
                await Results.Problem(statusCode: 429, title: "Too many requests.", extensions: new Dictionary<string, object?> { ["traceId"] = context.HttpContext.TraceIdentifier }).ExecuteAsync(context.HttpContext);
            };
        });
        return builder.Services.AddIdentityApiEndpoints<AppUser>(options =>
        {
            options.User.RequireUniqueEmail = true;
            options.Password.RequiredLength = 12;
            options.Lockout.MaxFailedAccessAttempts = settings.MaxFailedAccessAttempts;
            options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(settings.LockoutMinutes);
        }).AddRoles<IdentityRole<Guid>>().AddSignInManager<AppSignInManager>();
    }

    public static void UseInternetSecurity(this WebApplication app)
    {
        if (app.Services.GetRequiredService<SecurityBaselineOptions>().ReverseProxy.Enabled) app.UseForwardedHeaders();
        app.UseExceptionHandler();
        app.UseHostFiltering();
        if (!app.Environment.IsDevelopment()) { app.UseHsts(); app.UseHttpsRedirection(); }
        app.Use(async (context, next) =>
        {
            context.Response.Headers["X-Content-Type-Options"] = "nosniff";
            context.Response.Headers["Referrer-Policy"] = "no-referrer";
            if (context.Request.Path.StartsWithSegments("/api")) context.Response.Headers.CacheControl = "no-store";
            await next();
        });
    }

    public static void MapAuthenticationSecurity(this RouteGroupBuilder group)
    {
        PrivateAuthentication.MapEndpoints(group);
        group.MapGet("/csrf", (HttpContext context, IAntiforgery antiforgery) =>
            Results.Ok(new { requestToken = antiforgery.GetAndStoreTokens(context).RequestToken })).AllowAnonymous();
        group.MapGet("/mfa-status", async (ClaimsPrincipal principal, UserManager<AppUser> users, SecurityBaselineOptions settings) =>
        {
            var user = await users.GetUserAsync(principal);
            if (user is null) return Results.Unauthorized();
            return Results.Ok(new { enabled = true, requiredForRole = true, method = "email-device", trustedBrowserDays = settings.TrustedBrowserDays,
                methodDecisionPending = false, enforcementActive = true });
        }).RequireAuthorization();
    }
}
