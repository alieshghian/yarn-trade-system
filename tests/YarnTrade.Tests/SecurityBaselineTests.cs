using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.AspNetCore.Authentication.BearerToken;
using Microsoft.AspNetCore.Authentication.Cookies;
using YarnTrade.Api.Controllers;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;
using YarnTrade.Api.Security;

namespace YarnTrade.Tests;

public sealed class SecurityBaselineTests
{
    private const string Password = "SmokeTest!Password42";

    [Theory]
    [InlineData("AllowedHosts", "")]
    [InlineData("AllowedHosts", "*")]
    [InlineData("AllowedHosts", "*.example.test")]
    [InlineData("AllowedHosts", "https://api.example.test")]
    [InlineData("Cors:Origins:0", "")]
    [InlineData("Cors:Origins:0", "http://app.example.test")]
    [InlineData("Cors:Origins:0", "https://*.example.test")]
    [InlineData("Cors:Origins:0", "https://app.example.test/path")]
    [InlineData("ConnectionStrings:DefaultConnection", "")]
    [InlineData("ConnectionStrings:DefaultConnection", "Server=db.example.test;Encrypt=False")]
    [InlineData("ConnectionStrings:DefaultConnection", "Server=db.example.test;Encrypt=True;TrustServerCertificate=True")]
    [InlineData("ConnectionStrings:DefaultConnection", "invalid-test-connection")]
    [InlineData("Database:AutoMigrate", "true")]
    [InlineData("Seed:Enabled", "true")]
    [InlineData("Security:Authentication:PermitLimit", "0")]
    [InlineData("Security:ReverseProxy:Enabled", "true")]
    [InlineData("Security:AccessTokenMinutes", "120")]
    [InlineData("Security:MfaRequiredRoles:0", "Other")]
    public void Unsafe_production_configuration_fails_before_startup(string key, string value)
    {
        var config = Configuration(new() { [key] = value });
        var error = Assert.Throws<InvalidOperationException>(() => InternetSecurity.ValidateConfiguration(config, development: false));
        Assert.DoesNotContain("invalid-test-connection", error.Message);
    }

    [Fact]
    public void Development_allows_local_HTTP_and_wildcard_hosts()
    {
        var config = Configuration(new() { ["AllowedHosts"] = "*", ["Cors:Origins:0"] = "http://localhost:5173" });
        Assert.NotNull(InternetSecurity.ValidateConfiguration(config, development: true));
    }

    [Theory]
    [InlineData("/api/reports/stock")]
    [InlineData("/api/auth/mfa-status")]
    [InlineData("/api/auth/manage/info")]
    public async Task Protected_routes_reject_anonymous_requests(string path)
    {
        await using var host = await CreateApp();
        Assert.Equal(HttpStatusCode.Unauthorized, (await host.Client.GetAsync(path)).StatusCode);
    }

    [Theory]
    [InlineData("/api/auth/login", "{}")]
    [InlineData("/api/auth/forgotPassword", "{\"email\":\"absent@example.test\"}")]
    [InlineData("/api/auth/resetPassword", "{}")]
    public async Task Authentication_and_recovery_are_throttled(string path, string json)
    {
        await using var host = await CreateApp(new() { ["Security:Authentication:PermitLimit"] = "2" });
        for (var i = 0; i < 2; i++)
            Assert.NotEqual(HttpStatusCode.TooManyRequests, (await host.Client.PostAsync(path, new StringContent(json, System.Text.Encoding.UTF8, "application/json"))).StatusCode);
        var rejected = await host.Client.PostAsync(path, new StringContent(json, System.Text.Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.TooManyRequests, rejected.StatusCode);
        Assert.NotNull(rejected.Headers.RetryAfter);
        Assert.Contains("traceId", await rejected.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Business_rate_limits_are_applied_only_to_intended_endpoints()
    {
        await using var host = await CreateApp();
        var endpoints = ((IEndpointRouteBuilder)host.App).DataSources.SelectMany(source => source.Endpoints).OfType<RouteEndpoint>().ToList();
        string? Policy(string route, string verb) => endpoints.Single(endpoint => endpoint.RoutePattern.RawText == route &&
            endpoint.Metadata.GetMetadata<HttpMethodMetadata>()!.HttpMethods.Contains(verb)).Metadata.GetMetadata<EnableRateLimitingAttribute>()?.PolicyName;
        Assert.Equal(InternetSecurity.Uploads, Policy("api/attachments", "POST"));
        Assert.Null(Policy("api/attachments", "GET"));
        Assert.Equal(InternetSecurity.Uploads, Policy("api/purchases/import", "POST"));
        Assert.Equal(InternetSecurity.Uploads, Policy("api/commerce/orders/{orderId:guid}/import", "POST"));
        Assert.Equal(InternetSecurity.Reports, Policy("api/reports/stock", "GET"));
        Assert.Equal(InternetSecurity.Backups, Policy("api/system-backup/export", "POST"));
        Assert.Equal(InternetSecurity.Backups, Policy("api/system-backup/restore", "POST"));
        Assert.Null(Policy("api/presence/heartbeat", "POST"));
    }

    [Theory]
    [InlineData("Uploads", "/test/uploads")]
    [InlineData("Reports", "/test/reports")]
    [InlineData("Backups", "/test/backups")]
    public async Task Business_limits_partition_by_authenticated_user(string setting, string path)
    {
        await using var host = await CreateApp(new() { [$"Security:{setting}:PermitLimit"] = "1" });
        await CreateUser(host.App, "alice@example.test");
        await CreateUser(host.App, "bob@example.test");
        var alice = await Login(host.Client, "alice@example.test");
        var bob = await Login(host.Client, "bob@example.test");
        host.Client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", alice.AccessToken);
        Assert.Equal(HttpStatusCode.OK, (await host.Client.PostAsync(path, null)).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await host.Client.PostAsync(path, null)).StatusCode);
        host.Client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", bob.AccessToken);
        Assert.Equal(HttpStatusCode.OK, (await host.Client.PostAsync(path, null)).StatusCode);
    }

    [Fact]
    public async Task A_valid_refresh_token_issues_a_new_session()
    {
        await using var host = await CreateApp();
        await CreateUser(host.App, "refresh@example.test");
        var tokens = await Login(host.Client, "refresh@example.test");
        var refreshed = await host.Client.PostAsJsonAsync("/api/auth/refresh", new { refreshToken = tokens.RefreshToken });
        Assert.Equal(HttpStatusCode.OK, refreshed.StatusCode);
        var replacement = (await refreshed.Content.ReadFromJsonAsync<TokenResponse>())!;
        host.Client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", replacement.AccessToken);
        Assert.Equal(HttpStatusCode.OK, (await host.Client.GetAsync("/api/auth/mfa-status")).StatusCode);
    }

    [Theory]
    [InlineData("/test/error")]
    [InlineData("/test/problem")]
    public async Task Production_errors_and_logs_do_not_expose_exception_details(string path)
    {
        await using var host = await CreateApp();
        var response = await host.Client.GetAsync(path);
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("sensitive-test-marker", body);
        Assert.DoesNotContain("stackTrace", body);
        Assert.Contains("traceId", body);
        Assert.DoesNotContain(host.Logs.Messages, message => message.Contains("sensitive-test-marker"));
        if (path == "/test/error") Assert.Contains(host.Logs.Messages, message => message.Contains("FailureType=InvalidOperationException") && message.Contains("TraceId="));
    }

    [Fact]
    public async Task Production_restricts_hosts_and_CORS_and_sets_security_headers()
    {
        await using var host = await CreateApp();
        foreach (var origin in new[] { "https://app.example.test", "https://evil.example.test" })
        {
            using var request = new HttpRequestMessage(HttpMethod.Options, "/api/auth/login");
            request.Headers.Add("Origin", origin);
            request.Headers.Add("Access-Control-Request-Method", "POST");
            var response = await host.Client.SendAsync(request);
            if (origin == "https://app.example.test")
            {
                Assert.Equal(origin, Assert.Single(response.Headers.GetValues("Access-Control-Allow-Origin")));
                Assert.Equal("true", Assert.Single(response.Headers.GetValues("Access-Control-Allow-Credentials")));
            }
            else Assert.False(response.Headers.Contains("Access-Control-Allow-Origin"));
        }
        var allowed = await host.Client.GetAsync("/api/auth/mfa-status");
        Assert.Contains("max-age=2592000", Assert.Single(allowed.Headers.GetValues("Strict-Transport-Security")));
        Assert.Equal("nosniff", Assert.Single(allowed.Headers.GetValues("X-Content-Type-Options")));
        Assert.True(allowed.Headers.CacheControl!.NoStore);
        using var badHost = new HttpRequestMessage(HttpMethod.Get, "/test/network");
        badHost.Headers.Host = "evil.example.test";
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.SendAsync(badHost)).StatusCode);
        Assert.Equal(HttpStatusCode.PermanentRedirect, (await host.Client.GetAsync("http://api.example.test/test/network")).StatusCode);
    }

    [Theory]
    [InlineData("127.0.0.1", HttpStatusCode.OK)]
    [InlineData("203.0.113.2", HttpStatusCode.PermanentRedirect)]
    public async Task Only_configured_proxies_can_forward_scheme_and_client_IP(string remoteIp, HttpStatusCode expected)
    {
        await using var host = await CreateApp(new() { ["Security:ReverseProxy:Enabled"] = "true", ["Security:ReverseProxy:KnownProxies:0"] = "127.0.0.1" }, remoteIp);
        using var request = new HttpRequestMessage(HttpMethod.Get, "http://api.example.test/test/network");
        request.Headers.Add("X-Forwarded-Proto", "https");
        request.Headers.Add("X-Forwarded-For", "198.51.100.5");
        request.Headers.Add("X-Forwarded-Host", "evil.example.test");
        var response = await host.Client.SendAsync(request);
        Assert.Equal(expected, response.StatusCode);
        if (expected == HttpStatusCode.OK)
        {
            var body = await response.Content.ReadAsStringAsync();
            Assert.Contains("198.51.100.5", body);
            Assert.Contains("api.example.test", body);
            Assert.DoesNotContain("evil.example.test", body);
        }
    }

    [Fact]
    public async Task MFA_foundation_reports_role_requirement_without_selecting_a_method()
    {
        await using var host = await CreateApp();
        foreach (var role in new[] { "Administrator", "Manager", "Partner", "Customer" })
        {
            var email = role + "@example.test";
            await CreateUser(host.App, email, role);
            var token = await Login(host.Client, email);
            host.Client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token.AccessToken);
            var status = await host.Client.GetFromJsonAsync<JsonElement>("/api/auth/mfa-status");
            Assert.Equal(role != "Customer", status.GetProperty("requiredForRole").GetBoolean());
            Assert.True(status.GetProperty("methodDecisionPending").GetBoolean());
            Assert.False(status.GetProperty("enforcementActive").GetBoolean());
        }
    }

    [Fact]
    public async Task Identity_requires_a_second_factor_when_it_is_enabled_and_supports_recovery_codes()
    {
        await using var host = await CreateApp();
        await CreateUser(host.App, "mfa@example.test", "Administrator");
        using (var scope = host.App.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
            var user = (await users.FindByEmailAsync("mfa@example.test"))!;
            Assert.True((await users.SetTwoFactorEnabledAsync(user, true)).Succeeded);
        }
        Assert.Equal(HttpStatusCode.Unauthorized, (await host.Client.PostAsJsonAsync("/api/auth/login", new { email = "mfa@example.test", password = Password })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await host.Client.PostAsJsonAsync("/api/auth/login", new { email = "mfa@example.test", password = Password, twoFactorCode = "invalid" })).StatusCode);
        var token = await Login(host.Client, "mfa@example.test", "test-second-factor");
        host.Client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token.AccessToken);
        Assert.Equal(HttpStatusCode.OK, (await host.Client.GetAsync("/api/auth/mfa-status")).StatusCode);
        using var scope2 = host.App.Services.CreateScope();
        var manager = scope2.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
        var account = (await manager.FindByEmailAsync("mfa@example.test"))!;
        var recovery = (await manager.GenerateNewTwoFactorRecoveryCodesAsync(account, 1))!.Single();
        host.Client.DefaultRequestHeaders.Authorization = null;
        Assert.Equal(HttpStatusCode.OK, (await host.Client.PostAsJsonAsync("/api/auth/login", new { email = "mfa@example.test", password = Password, twoFactorRecoveryCode = recovery })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await host.Client.PostAsJsonAsync("/api/auth/login", new { email = "mfa@example.test", password = Password, twoFactorRecoveryCode = recovery })).StatusCode);
    }

    [Theory]
    [InlineData("logout")]
    [InlineData("password")]
    [InlineData("inactive")]
    [InlineData("locked")]
    public async Task Revocation_blocks_existing_access_and_refresh_tokens(string action)
    {
        await using var host = await CreateApp();
        await CreateUser(host.App, "session@example.test");
        var tokens = await Login(host.Client, "session@example.test");
        Assert.Equal(3600, tokens.ExpiresIn);
        host.Client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", tokens.AccessToken);
        if (action == "logout") Assert.Equal(HttpStatusCode.NoContent, (await host.Client.PostAsync("/test/logout", null)).StatusCode);
        else
        {
            using var scope = host.App.Services.CreateScope();
            var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
            var user = (await users.FindByEmailAsync("session@example.test"))!;
            if (action == "password") Assert.True((await users.ChangePasswordAsync(user, Password, "NewSmokeTest!Password42")).Succeeded);
            if (action == "inactive") { user.IsActive = false; Assert.True((await users.UpdateAsync(user)).Succeeded); }
            if (action == "locked") Assert.True((await users.SetLockoutEndDateAsync(user, DateTimeOffset.UtcNow.AddMinutes(10))).Succeeded);
        }
        Assert.Equal(HttpStatusCode.Unauthorized, (await host.Client.GetAsync("/api/auth/mfa-status")).StatusCode);
        host.Client.DefaultRequestHeaders.Authorization = null;
        Assert.Equal(HttpStatusCode.Unauthorized, (await host.Client.PostAsJsonAsync("/api/auth/refresh", new { refreshToken = tokens.RefreshToken })).StatusCode);
        if (action is "inactive" or "locked")
            Assert.Equal(HttpStatusCode.Unauthorized, (await host.Client.PostAsJsonAsync("/api/auth/login", new { email = "session@example.test", password = Password })).StatusCode);
    }

    [Fact]
    public async Task Failed_logins_lock_out_the_account()
    {
        await using var host = await CreateApp();
        await CreateUser(host.App, "lockout@example.test");
        for (var i = 0; i < 5; i++)
            Assert.Equal(HttpStatusCode.Unauthorized, (await host.Client.PostAsJsonAsync("/api/auth/login", new { email = "lockout@example.test", password = "wrong" })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await host.Client.PostAsJsonAsync("/api/auth/login", new { email = "lockout@example.test", password = Password })).StatusCode);
    }

    [Fact]
    public async Task Cookie_authentication_uses_secure_settings_and_requires_CSRF()
    {
        await using var host = await CreateApp();
        await CreateUser(host.App, "cookie@example.test");
        var cookieOptions = host.App.Services.GetRequiredService<IOptionsMonitor<CookieAuthenticationOptions>>().Get(IdentityConstants.ApplicationScheme);
        Assert.True(cookieOptions.Cookie.HttpOnly);
        Assert.Equal(CookieSecurePolicy.Always, cookieOptions.Cookie.SecurePolicy);
        Assert.Equal(SameSiteMode.Strict, cookieOptions.Cookie.SameSite);
        Assert.False(cookieOptions.SlidingExpiration);
        var bearerOptions = host.App.Services.GetRequiredService<IOptionsMonitor<BearerTokenOptions>>().Get(IdentityConstants.BearerScheme);
        Assert.Equal(TimeSpan.FromHours(24), bearerOptions.RefreshTokenExpiration);
        foreach (var path in new[] { "/api/auth/login?useCookies=true", "/API/AUTH/LOGIN/?useSessionCookies=true" })
            Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.PostAsJsonAsync(path, new { email = "cookie@example.test", password = Password })).StatusCode);
        var csrf = await host.Client.GetAsync("/api/auth/csrf");
        var requestToken = (await csrf.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("requestToken").GetString();
        host.Client.DefaultRequestHeaders.Add("Cookie", Cookies(csrf));
        host.Client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", requestToken);
        var login = await host.Client.PostAsJsonAsync("/api/auth/login?useCookies=true", new { email = "cookie@example.test", password = Password });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        Assert.All(login.Headers.GetValues("Set-Cookie"), cookie => { Assert.Contains("secure", cookie); Assert.Contains("httponly", cookie); Assert.Contains("samesite=strict", cookie); });
        host.Client.DefaultRequestHeaders.Remove("Cookie");
        host.Client.DefaultRequestHeaders.Add("Cookie", Cookies(login));
        host.Client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        Assert.Equal(HttpStatusCode.OK, (await host.Client.GetAsync("/api/auth/mfa-status")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.PostAsync("/test/logout", null)).StatusCode);
        var authenticatedCsrf = await host.Client.GetAsync("/api/auth/csrf");
        var authenticatedToken = (await authenticatedCsrf.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("requestToken").GetString();
        var authCookie = host.Client.DefaultRequestHeaders.GetValues("Cookie").Single();
        host.Client.DefaultRequestHeaders.Remove("Cookie");
        host.Client.DefaultRequestHeaders.Add("Cookie", authCookie + "; " + Cookies(authenticatedCsrf));
        host.Client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", authenticatedToken);
        Assert.Equal(HttpStatusCode.NoContent, (await host.Client.PostAsync("/test/logout", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await host.Client.GetAsync("/api/auth/mfa-status")).StatusCode);
    }

    private static string Cookies(HttpResponseMessage response) => string.Join("; ", response.Headers.GetValues("Set-Cookie").Select(cookie => cookie.Split(';')[0]));
    private static IConfiguration Configuration(Dictionary<string, string?>? changes = null)
    {
        var values = new Dictionary<string, string?>
        {
            ["AllowedHosts"] = "api.example.test", ["Cors:Origins:0"] = "https://app.example.test",
            ["ConnectionStrings:DefaultConnection"] = "Server=db.example.test;Database=SecuritySmoke;Encrypt=True;TrustServerCertificate=False",
            ["Database:AutoMigrate"] = "false", ["Seed:Enabled"] = "false"
        };
        if (changes is not null) foreach (var change in changes) values[change.Key] = change.Value;
        return new ConfigurationBuilder().AddInMemoryCollection(values).Build();
    }

    private static async Task<TestApp> CreateApp(Dictionary<string, string?>? changes = null, string remoteIp = "127.0.0.1")
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Production" });
        builder.Configuration.Sources.Clear();
        builder.Configuration.AddConfiguration(Configuration(changes));
        builder.WebHost.UseTestServer();
        var logs = new SafeLogCapture();
        builder.Logging.ClearProviders();
        builder.Logging.AddProvider(logs);
        // Keep test token/CSRF cryptography isolated from the machine's Windows key store.
        builder.Services.AddDataProtection().UseEphemeralDataProtectionProvider();
        var databaseName = Guid.NewGuid().ToString();
        builder.Services.AddDbContext<AppDbContext>(options => options.UseInMemoryDatabase(databaseName));
        builder.AddInternetSecurity().AddEntityFrameworkStores<AppDbContext>().AddTokenProvider<TestSecondFactor>("SmokeSecondFactor");
        builder.Services.Configure<IdentityOptions>(options => options.Tokens.AuthenticatorTokenProvider = "SmokeSecondFactor");
        builder.Services.AddAuthorization();
        builder.Services.AddControllers().AddApplicationPart(typeof(PresenceController).Assembly);
        var app = builder.Build();
        app.Use((context, next) =>
        {
            context.Connection.RemoteIpAddress = IPAddress.Parse(remoteIp);
            // Use the installed runtime's stream writer when net8 TestHost is run with major roll-forward.
            context.Features.Set<IHttpResponseBodyFeature>(new StreamResponseBodyFeature(context.Response.Body));
            return next(context);
        });
        app.UseInternetSecurity();
        app.UseRouting();
        app.UseCors("frontend");
        app.UseAuthentication();
        app.UseRateLimiter();
        app.UseMiddleware<AuthenticationSessionMiddleware>();
        app.UseAuthorization();
        var authentication = app.MapGroup("/api/auth").RequireRateLimiting(InternetSecurity.Authentication);
        authentication.MapIdentityApi<AppUser>();
        authentication.MapAuthenticationSecurity();
        app.MapControllers();
        app.MapGet("/test/error", IResult () => throw new InvalidOperationException("sensitive-test-marker"));
        app.MapGet("/test/problem", () => Results.Problem(detail: "sensitive-test-marker", statusCode: 500, extensions: new Dictionary<string, object?> { ["debug"] = "sensitive-test-marker" }));
        app.MapGet("/test/network", (HttpContext context) => Results.Ok(new { context.Request.Scheme, ip = context.Connection.RemoteIpAddress!.ToString(), host = context.Request.Host.Value }));
        app.MapPost("/test/logout", async (ClaimsPrincipal principal, AppSignInManager signIn) => { await signIn.RevokeSessionsAsync(principal); return Results.NoContent(); }).RequireAuthorization();
        app.MapPost("/test/uploads", () => Results.Ok()).RequireAuthorization().RequireRateLimiting(InternetSecurity.Uploads);
        app.MapPost("/test/reports", () => Results.Ok()).RequireAuthorization().RequireRateLimiting(InternetSecurity.Reports);
        app.MapPost("/test/backups", () => Results.Ok()).RequireAuthorization().RequireRateLimiting(InternetSecurity.Backups);
        await app.StartAsync();
        var client = app.GetTestClient();
        client.BaseAddress = new Uri("https://api.example.test");
        return new TestApp(app, client, logs);
    }

    private static async Task CreateUser(WebApplication app, string email, string? role = null)
    {
        using var scope = app.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
        var user = new AppUser { Id = Guid.NewGuid(), Email = email, UserName = email, EmailConfirmed = true, IsActive = true };
        Assert.True((await users.CreateAsync(user, Password)).Succeeded);
        if (role is not null)
        {
            var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
            if (!await roles.RoleExistsAsync(role)) Assert.True((await roles.CreateAsync(new IdentityRole<Guid>(role))).Succeeded);
            Assert.True((await users.AddToRoleAsync(user, role)).Succeeded);
        }
    }

    private static async Task<TokenResponse> Login(HttpClient client, string email, string? twoFactorCode = null)
    {
        var response = await client.PostAsJsonAsync("/api/auth/login", new { email, password = Password, twoFactorCode });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<TokenResponse>())!;
    }

    private sealed record TokenResponse(string AccessToken, string RefreshToken, int ExpiresIn);
    private sealed record TestApp(WebApplication App, HttpClient Client, SafeLogCapture Logs) : IAsyncDisposable
    {
        public async ValueTask DisposeAsync() { Client.Dispose(); await App.DisposeAsync(); }
    }

    // Test-only provider exercises Identity's second-factor contract without selecting a production method.
    public sealed class TestSecondFactor : IUserTwoFactorTokenProvider<AppUser>
    {
        public Task<bool> CanGenerateTwoFactorTokenAsync(UserManager<AppUser> manager, AppUser user) => Task.FromResult(true);
        public Task<string> GenerateAsync(string purpose, UserManager<AppUser> manager, AppUser user) => Task.FromResult("test-second-factor");
        public Task<bool> ValidateAsync(string purpose, string token, UserManager<AppUser> manager, AppUser user) => Task.FromResult(token == "test-second-factor");
    }

    private sealed class SafeLogCapture : ILoggerProvider
    {
        public List<string> Messages { get; } = [];
        public ILogger CreateLogger(string categoryName) => new CaptureLogger(this);
        public void Dispose() { }
        private sealed class CaptureLogger(SafeLogCapture owner) : ILogger
        {
            public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
            public bool IsEnabled(LogLevel level) => true;
            public void Log<TState>(LogLevel level, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
            { lock (owner.Messages) owner.Messages.Add(formatter(state, exception) + (exception is null ? "" : " " + exception.Message)); }
        }
    }
}
