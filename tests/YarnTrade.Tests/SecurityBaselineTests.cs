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
using YarnTrade.Api.Services;

namespace YarnTrade.Tests;

public sealed partial class SecurityBaselineTests
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
    [InlineData("Security:DevelopmentAutoLogin:Enabled", "true")]
    [InlineData("AuthenticationEmail:Host", "")]
    [InlineData("AuthenticationEmail:Password", "")]
    [InlineData("AuthenticationEmail:EnableSsl", "false")]
    [InlineData("Security:TrustedBrowserDays", "31")]
    [InlineData("Security:OtpMaxAttempts", "6")]
    public void Unsafe_production_configuration_fails_before_startup(string key, string value)
    {
        var config = Configuration(new() { [key] = value });
        var error = Assert.Throws<InvalidOperationException>(() => InternetSecurity.ValidateConfiguration(config, development: false));
        Assert.DoesNotContain("invalid-test-connection", error.Message);
    }

    [Fact]
    public void Development_allows_local_HTTP_and_wildcard_hosts()
    {
        var config = Configuration(new() { ["AllowedHosts"] = "*", ["Cors:Origins:0"] = "http://localhost:5173", ["Security:PublicAppOrigin"] = "http://localhost:5173" });
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
    [InlineData("/api/auth/activate", "{}")]
    [InlineData("/api/auth/verify-email", "{}")]
    [InlineData("/api/auth/resend-code", "{}")]
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
        var alice = await Login(host, "alice@example.test");
        var bob = await Login(host, "bob@example.test");
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
        var tokens = await Login(host, "refresh@example.test");
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
    public async Task Email_device_verification_is_required_for_every_normal_role()
    {
        await using var host = await CreateApp();
        foreach (var role in new[] { "Administrator", "Manager", "Partner", "Customer" })
        {
            var email = role + "@example.test";
            await CreateUser(host.App, email, role);
            var token = await Login(host, email);
            host.Client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token.AccessToken);
            var status = await host.Client.GetFromJsonAsync<JsonElement>("/api/auth/mfa-status");
            Assert.True(status.GetProperty("requiredForRole").GetBoolean());
            Assert.False(status.GetProperty("methodDecisionPending").GetBoolean());
            Assert.True(status.GetProperty("enforcementActive").GetBoolean());
        }
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
        var tokens = await Login(host, "session@example.test");
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
        var begin = await host.Client.PostAsJsonAsync("/api/auth/login?useCookies=true", new { email = "cookie@example.test", password = Password });
        Assert.Equal(HttpStatusCode.Accepted, begin.StatusCode);
        var challenge = (await begin.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("challenge").GetString();
        var login = await host.Client.PostAsJsonAsync("/api/auth/verify-email", new { challenge, code = host.Mail.Code });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        Assert.All(login.Headers.GetValues("Set-Cookie"), cookie => { Assert.Contains("secure", cookie); Assert.Contains("httponly", cookie); Assert.Contains("samesite=strict", cookie); });
        host.Client.DefaultRequestHeaders.Remove("Cookie");
        host.Client.DefaultRequestHeaders.Add("Cookie", Cookies(login));
        host.Client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        Assert.Equal(HttpStatusCode.OK, (await host.Client.GetAsync("/api/auth/mfa-status")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.PostAsync("/test/logout", null)).StatusCode);
        host.Clock.Advance(TimeSpan.FromMinutes(31));
        Assert.Equal(HttpStatusCode.OK, (await host.Client.GetAsync("/api/auth/mfa-status")).StatusCode);
        var authenticatedCsrf = await host.Client.GetAsync("/api/auth/csrf");
        var authenticatedToken = (await authenticatedCsrf.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("requestToken").GetString();
        var authCookie = host.Client.DefaultRequestHeaders.GetValues("Cookie").Single();
        host.Client.DefaultRequestHeaders.Remove("Cookie");
        host.Client.DefaultRequestHeaders.Add("Cookie", authCookie + "; " + Cookies(authenticatedCsrf));
        host.Client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", authenticatedToken);
        Assert.Equal(HttpStatusCode.NoContent, (await host.Client.PostAsync("/test/logout", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await host.Client.GetAsync("/api/auth/mfa-status")).StatusCode);
    }

    [Fact]
    public async Task Public_registration_and_self_email_change_are_unavailable() {
        await using var host = await CreateApp();
        foreach (var path in new[] { "/api/auth/register", "/api/auth/confirmEmail", "/api/auth/manage/2fa" }) {
            var response = await host.Client.PostAsJsonAsync(path, new { email = "stranger@example.test", password = Password });
            Assert.Contains(response.StatusCode, new[] { HttpStatusCode.NotFound, HttpStatusCode.MethodNotAllowed });
        }
        Assert.Equal(HttpStatusCode.Unauthorized, (await host.Client.PostAsJsonAsync("/api/users", new {})).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await host.Client.PostAsJsonAsync("/api/auth/login", new { email = "stranger@example.test", password = Password })).StatusCode);
        using (var scope = host.App.Services.CreateScope()) Assert.Null(await scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>().FindByEmailAsync("stranger@example.test"));
        await CreateUser(host.App, "normal@example.test", "Customer");
        var tokens = await Login(host, "normal@example.test");
        host.Client.DefaultRequestHeaders.Authorization = new("Bearer", tokens.AccessToken);
        Assert.Equal(HttpStatusCode.MethodNotAllowed, (await host.Client.PostAsJsonAsync("/api/auth/manage/info", new { newEmail = "changed@example.test" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.PutAsJsonAsync("/api/users/" + Guid.NewGuid(), UserBody(Guid.NewGuid(), "changed@example.test"))).StatusCode);
    }

    private static object UserBody(Guid person, string email, string[]? roles = null, bool active = true, string? password = null) =>
        new { personId = person, email, password, preferredLanguage = "fa", isActive = active, roles = roles ?? ["Customer"], permissions = Array.Empty<string>() };
    private static async Task<Guid> PersonFor(TestApp host) {
        using var scope = host.App.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var person = new Person { PersonCode = Guid.NewGuid().ToString(), DisplayName = "Invited user" };
        db.Persons.Add(person); await db.SaveChangesAsync(); return person.Id;
    }
    private static async Task<Guid> UserId(TestApp host, string email) {
        using var scope = host.App.Services.CreateScope(); return (await scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>().FindByEmailAsync(email))!.Id;
    }
    private static async Task<string> Begin(TestApp host, string email, string password = Password) {
        var response = await host.Client.PostAsJsonAsync("/api/auth/login", new { email, password });
        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(body.TryGetProperty("code", out _)); Assert.False(body.TryGetProperty("accessToken", out _));
        return body.GetProperty("challenge").GetString()!;
    }
    private static Task<HttpResponseMessage> Verify(TestApp host, string challenge, string code) => host.Client.PostAsJsonAsync("/api/auth/verify-email", new { challenge, code });
    private static async Task SignIn(TestApp host, string email) {
        var tokens = await Login(host, email); host.Client.DefaultRequestHeaders.Authorization = new("Bearer", tokens.AccessToken);
    }

    [Theory]
    [InlineData("activate")]
    [InlineData("expired")]
    [InlineData("reissue")]
    public async Task Administrator_invites_and_only_fresh_single_use_invitation_activates(string action) {
        await using var host = await CreateApp();
        await CreateUser(host.App, "admin@example.test", "Administrator");
        await CreateUser(host.App, "customer@example.test", "Customer");
        await SignIn(host, "admin@example.test");
        var person = await PersonFor(host);
        var result = await host.Client.PostAsJsonAsync("/api/users", UserBody(person, "invited@example.test"));
        Assert.Equal(HttpStatusCode.Created, result.StatusCode);
        var body = await result.Content.ReadAsStringAsync(); var link = host.Mail.LinkToken;
        Assert.DoesNotContain(link, body); Assert.Equal("invited@example.test", host.Mail.Messages.Last().Email);
        var id = await UserId(host, "invited@example.test");
        if (action == "reissue") {
            Assert.Equal(HttpStatusCode.NoContent, (await host.Client.PostAsync($"/api/users/{id}/invitation", null)).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.PostAsJsonAsync("/api/auth/activate", new { token = link, newPassword = Password })).StatusCode);
            link = host.Mail.LinkToken;
        }
        host.Client.DefaultRequestHeaders.Authorization = null;
        Assert.Equal(HttpStatusCode.Unauthorized, (await host.Client.PostAsJsonAsync("/api/auth/login", new { email = "invited@example.test", password = Password })).StatusCode);
        if (action == "expired") host.Clock.Advance(TimeSpan.FromHours(25));
        var activation = await host.Client.PostAsJsonAsync("/api/auth/activate", new { token = link, newPassword = Password });
        Assert.Equal(action == "expired" ? HttpStatusCode.BadRequest : HttpStatusCode.OK, activation.StatusCode);
        if (action != "expired") {
            Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.PostAsJsonAsync("/api/auth/activate", new { token = link, newPassword = Password })).StatusCode);
            Assert.NotEmpty(await Begin(host, "invited@example.test"));
        }
        Assert.DoesNotContain(host.Logs.Messages, message => message.Contains(link));
    }

    [Fact]
    public async Task Only_administrator_creates_accounts_or_changes_login_email() {
        await using var host = await CreateApp();
        await CreateUser(host.App, "admin@example.test", "Administrator");
        await CreateUser(host.App, "manager@example.test", "Manager");
        await SignIn(host, "admin@example.test");
        var person = await PersonFor(host);
        Assert.Equal(HttpStatusCode.Created, (await host.Client.PostAsJsonAsync("/api/users", UserBody(person, "invited@example.test"))).StatusCode);
        var id = await UserId(host, "invited@example.test");
        await SignIn(host, "manager@example.test");
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.PostAsJsonAsync("/api/users", UserBody(await PersonFor(host), "new@example.test"))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.PutAsJsonAsync($"/api/users/{id}", UserBody(person, "changed@example.test"))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.PostAsync($"/api/users/{id}/invitation", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.PostAsync($"/api/users/{id}/security-reset", null)).StatusCode);
        await SignIn(host, "admin@example.test");
        Assert.Equal(HttpStatusCode.NoContent, (await host.Client.PutAsJsonAsync($"/api/users/{id}", UserBody(person, "changed@example.test"))).StatusCode);
        Assert.Equal(id, await UserId(host, "changed@example.test"));
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.PutAsJsonAsync($"/api/users/{id}", UserBody(person, "changed@example.test", password: Password))).StatusCode);
    }

    [Fact]
    public async Task OTP_is_private_invalid_codes_fail_and_success_is_single_use() {
        await using var host = await CreateApp(); await CreateUser(host.App, "otp@example.test");
        var challenge = await Begin(host, "otp@example.test"); var code = host.Mail.Code;
        Assert.Equal("otp@example.test", host.Mail.Messages.Last().Email);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Verify(host, challenge, "invalid")).StatusCode);
        var success = await Verify(host, challenge, code); Assert.Equal(HttpStatusCode.OK, success.StatusCode);
        Assert.DoesNotContain(code, await success.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.Unauthorized, (await Verify(host, challenge, code)).StatusCode);
        Assert.DoesNotContain(host.Logs.Messages, message => message.Contains(code) || message.Contains(challenge));
        using var scope = host.App.Services.CreateScope();
        var stored = await scope.ServiceProvider.GetRequiredService<AppDbContext>().UserTokens.ToListAsync();
        Assert.DoesNotContain(stored, x => (x.Value ?? "").Contains(code));
    }

    [Theory]
    [InlineData("expired")]
    [InlineData("attempts")]
    [InlineData("resend")]
    public async Task OTP_has_expiry_bounded_attempts_and_resend_cooldown(string action) {
        await using var host = await CreateApp(); await CreateUser(host.App, "otp@example.test");
        var challenge = await Begin(host, "otp@example.test"); var code = host.Mail.Code;
        if (action == "expired") host.Clock.Advance(TimeSpan.FromMinutes(11));
        if (action == "attempts") {
            for (var i = 0; i < 5; i++) Assert.Equal(HttpStatusCode.Unauthorized, (await Verify(host, challenge, "invalid")).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await host.Client.PostAsJsonAsync("/api/auth/login", new { email = "otp@example.test", password = Password })).StatusCode);
        }
        if (action == "resend") {
            Assert.Equal(HttpStatusCode.TooManyRequests, (await host.Client.PostAsJsonAsync("/api/auth/resend-code", new { challenge })).StatusCode);
            host.Clock.Advance(TimeSpan.FromSeconds(61));
            var resend = await host.Client.PostAsJsonAsync("/api/auth/resend-code", new { challenge }); Assert.Equal(HttpStatusCode.Accepted, resend.StatusCode);
            var replacement = (await resend.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("challenge").GetString()!;
            Assert.Equal(HttpStatusCode.Unauthorized, (await Verify(host, challenge, code)).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await Verify(host, replacement, host.Mail.Code)).StatusCode);
        } else Assert.Equal(HttpStatusCode.Unauthorized, (await Verify(host, challenge, code)).StatusCode);
    }

    [Fact]
    public async Task Repeated_password_login_does_not_reset_OTP_budget_or_send_more_mail() {
        await using var host = await CreateApp(new() { ["Security:OtpMaxAttempts"] = "2" }); await CreateUser(host.App, "otp@example.test");
        var challenge = await Begin(host, "otp@example.test");
        Assert.Equal(HttpStatusCode.Unauthorized, (await Verify(host, challenge, "invalid")).StatusCode);
        challenge = await Begin(host, "otp@example.test");
        Assert.Single(host.Mail.Messages);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Verify(host, challenge, "invalid")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Verify(host, challenge, host.Mail.Code)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await host.Client.PostAsJsonAsync("/api/auth/login", new { email = "otp@example.test", password = Password })).StatusCode);
    }

    [Theory]
    [InlineData("logout")]
    [InlineData("expiry")]
    [InlineData("password")]
    [InlineData("email")]
    [InlineData("role")]
    [InlineData("disable")]
    [InlineData("reset")]
    public async Task Browser_trust_survives_logout_but_expires_and_security_changes_revoke_it(string action) {
        await using var host = await CreateApp(); await CreateUser(host.App, "trusted@example.test", "Customer");
        var challenge = await Begin(host, "trusted@example.test");
        var verified = await Verify(host, challenge, host.Mail.Code); Assert.Equal(HttpStatusCode.OK, verified.StatusCode);
        var tokens = (await verified.Content.ReadFromJsonAsync<TokenResponse>())!;
        var trust = Cookies(verified);
        Assert.All(verified.Headers.GetValues("Set-Cookie"), value => { Assert.Contains("httponly", value); Assert.Contains("secure", value); Assert.Contains("samesite=strict", value); });
        var options = host.App.Services.GetRequiredService<IOptionsMonitor<CookieAuthenticationOptions>>().Get(IdentityConstants.TwoFactorRememberMeScheme);
        Assert.Equal(TimeSpan.FromDays(30), options.ExpireTimeSpan); Assert.False(options.SlidingExpiration);
        host.Client.DefaultRequestHeaders.Authorization = new("Bearer", tokens.AccessToken);
        if (action == "logout") Assert.Equal(HttpStatusCode.NoContent, (await host.Client.PostAsync("/test/logout", null)).StatusCode);
        if (action == "expiry") {
            host.Client.DefaultRequestHeaders.Authorization = null; host.Client.DefaultRequestHeaders.Add("Cookie", trust);
            host.Clock.Advance(TimeSpan.FromDays(29));
            var withinThirtyDays = await host.Client.PostAsJsonAsync("/api/auth/login", new { email = "trusted@example.test", password = Password });
            Assert.Equal(HttpStatusCode.OK, withinThirtyDays.StatusCode);
            Assert.False(withinThirtyDays.Headers.Contains("Set-Cookie")); Assert.Single(host.Mail.Messages);
            host.Client.DefaultRequestHeaders.Remove("Cookie"); host.Clock.Advance(TimeSpan.FromDays(2));
        }
        var email = "trusted@example.test"; var password = Password;
        if (action is "password" or "email" or "role" or "disable" or "reset") {
            await CreateUser(host.App, "admin@example.test", "Administrator");
            await SignIn(host, "admin@example.test");
            var id = await UserId(host, email); var person = await PersonFor(host);
            if (action == "reset") Assert.Equal(HttpStatusCode.NoContent, (await host.Client.PostAsync($"/api/users/{id}/security-reset", null)).StatusCode);
            else if (action == "password") {
                using var scope = host.App.Services.CreateScope(); var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
                password = "Changed!Password42"; Assert.True((await users.ChangePasswordAsync((await users.FindByEmailAsync(email))!, Password, password)).Succeeded);
            } else {
                if (action == "email") email = "changed@example.test";
                Assert.Equal(HttpStatusCode.NoContent, (await host.Client.PutAsJsonAsync($"/api/users/{id}", UserBody(person, email, action == "role" ? ["Manager"] : ["Customer"], action != "disable"))).StatusCode);
            }
        }
        host.Client.DefaultRequestHeaders.Authorization = new("Bearer", tokens.AccessToken);
        if (action != "expiry") Assert.Equal(HttpStatusCode.Unauthorized, (await host.Client.GetAsync("/api/auth/mfa-status")).StatusCode);
        host.Client.DefaultRequestHeaders.Authorization = null; host.Client.DefaultRequestHeaders.Add("Cookie", trust);
        var login = await host.Client.PostAsJsonAsync("/api/auth/login", new { email, password });
        Assert.Equal(action == "logout" ? HttpStatusCode.OK : action == "disable" ? HttpStatusCode.Unauthorized : HttpStatusCode.Accepted, login.StatusCode);
        if (action == "logout") { Assert.Single(host.Mail.Messages); Assert.False(login.Headers.Contains("Set-Cookie")); }
    }

    [Fact]
    public async Task Recovery_is_neutral_and_password_reset_revokes_session_and_trust() {
        await using var host = await CreateApp(); await CreateUser(host.App, "recover@example.test");
        var challenge = await Begin(host, "recover@example.test"); var verify = await Verify(host, challenge, host.Mail.Code);
        var trust = Cookies(verify); var tokens = (await verify.Content.ReadFromJsonAsync<TokenResponse>())!;
        var known = await host.Client.PostAsJsonAsync("/api/auth/forgotPassword", new { email = "recover@example.test" }); var reset = host.Mail.LinkToken;
        var unknown = await host.Client.PostAsJsonAsync("/api/auth/forgotPassword", new { email = "absent@example.test" });
        Assert.Equal(HttpStatusCode.OK, known.StatusCode); Assert.Equal(known.StatusCode, unknown.StatusCode);
        Assert.Equal(await known.Content.ReadAsStringAsync(), await unknown.Content.ReadAsStringAsync());
        Assert.DoesNotContain(reset, await known.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.OK, (await host.Client.PostAsJsonAsync("/api/auth/resetPassword", new { token = reset, newPassword = "Reset!Password42" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.PostAsJsonAsync("/api/auth/resetPassword", new { token = reset, newPassword = Password })).StatusCode);
        host.Client.DefaultRequestHeaders.Authorization = new("Bearer", tokens.AccessToken);
        Assert.Equal(HttpStatusCode.Unauthorized, (await host.Client.GetAsync("/api/auth/mfa-status")).StatusCode);
        host.Client.DefaultRequestHeaders.Authorization = null; host.Client.DefaultRequestHeaders.Add("Cookie", trust);
        Assert.NotEmpty(await Begin(host, "recover@example.test", "Reset!Password42"));
        Assert.DoesNotContain(host.Logs.Messages, message => message.Contains(reset));
    }

    [Fact]
    public async Task Mail_failure_is_safe_and_unknown_recovery_remains_neutral() {
        await using var host = await CreateApp(); await CreateUser(host.App, "mail@example.test"); host.Mail.FailDelivery = true;
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await host.Client.PostAsJsonAsync("/api/auth/login", new { email = "mail@example.test", password = Password })).StatusCode);
        var known = await host.Client.PostAsJsonAsync("/api/auth/forgotPassword", new { email = "mail@example.test" });
        var unknown = await host.Client.PostAsJsonAsync("/api/auth/forgotPassword", new { email = "unknown@example.test" });
        Assert.Equal(await known.Content.ReadAsStringAsync(), await unknown.Content.ReadAsStringAsync());
        host.Mail.FailDelivery = false; Assert.NotEmpty(await Begin(host, "mail@example.test"));
    }

    [Theory]
    [InlineData(true, "127.0.0.1", null, 200)]
    [InlineData(true, "::1", null, 200)]
    [InlineData(true, "::ffff:127.0.0.1", "::ffff:127.0.0.1", 200)]
    [InlineData(false, "127.0.0.1", null, 404)]
    [InlineData(true, "192.168.1.22", null, 403)]
    [InlineData(true, "127.0.0.1", "192.168.1.22", 403)]
    public async Task Development_bypass_requires_explicit_setting_and_real_loopback(bool enabled, string peer, string? proxyPeer, int expected) {
        await using var host = await CreateApp(new() { ["AllowedHosts"] = "localhost", ["Cors:Origins:0"] = "http://localhost:5173", ["Security:PublicAppOrigin"] = "http://localhost:5173", ["Security:DevelopmentAutoLogin:Enabled"] = enabled.ToString() }, peer, "Development");
        await CreateUser(host.App, "admin@yarntrade.local", "Administrator");
        if (proxyPeer is not null) host.Client.DefaultRequestHeaders.Add("X-YarnTrade-Development-Client", proxyPeer);
        var response = await host.Client.GetAsync("/api/auth/development-session"); Assert.Equal(expected, (int)response.StatusCode); Assert.Empty(host.Mail.Messages);
        if (expected == 200) {
            var tokens = (await response.Content.ReadFromJsonAsync<TokenResponse>())!; host.Client.DefaultRequestHeaders.Authorization = new("Bearer", tokens.AccessToken);
            var access = await host.Client.GetFromJsonAsync<JsonElement>("/api/user-access"); Assert.Contains("Administrator", access.GetProperty("roles").EnumerateArray().Select(x => x.GetString()));
            host.Client.DefaultRequestHeaders.Add("X-YarnTrade-Development-Client", "192.168.1.22");
            Assert.Equal(HttpStatusCode.Unauthorized, (await host.Client.GetAsync("/api/user-access")).StatusCode);
        }
    }

    [Fact]
    public async Task Production_has_no_development_session_and_development_rejects_forwarded_requests() {
        await using (var production = await CreateApp()) Assert.Equal(HttpStatusCode.NotFound, (await production.Client.GetAsync("/api/auth/development-session")).StatusCode);
        await using var host = await CreateApp(new() { ["AllowedHosts"] = "localhost", ["Cors:Origins:0"] = "http://localhost:5173", ["Security:PublicAppOrigin"] = "http://localhost:5173", ["Security:DevelopmentAutoLogin:Enabled"] = "true" }, environment: "Development");
        await CreateUser(host.App, "admin@yarntrade.local", "Administrator");
        host.Client.DefaultRequestHeaders.Add("X-Forwarded-For", "127.0.0.1");
        Assert.Equal(HttpStatusCode.Forbidden, (await host.Client.GetAsync("/api/auth/development-session")).StatusCode);
    }

    private static string Cookies(HttpResponseMessage response) => string.Join("; ", response.Headers.GetValues("Set-Cookie").Select(cookie => cookie.Split(';')[0]));
    private static IConfiguration Configuration(Dictionary<string, string?>? changes = null)
    {
        var values = new Dictionary<string, string?>
        {
            ["AllowedHosts"] = "api.example.test", ["Cors:Origins:0"] = "https://app.example.test",
            ["ConnectionStrings:DefaultConnection"] = "Server=db.example.test;Database=SecuritySmoke;Encrypt=True;TrustServerCertificate=False",
            ["Database:AutoMigrate"] = "false", ["Seed:Enabled"] = "false",
            ["Security:PublicAppOrigin"] = "https://app.example.test",
            ["AuthenticationEmail:Host"] = "smtp.example.test", ["AuthenticationEmail:Port"] = "587",
            ["AuthenticationEmail:UserName"] = "test-only", ["AuthenticationEmail:Password"] = "fake-test-only",
            ["AuthenticationEmail:FromAddress"] = "auth@example.test", ["AuthenticationEmail:EnableSsl"] = "true"
        };
        if (changes is not null) foreach (var change in changes) values[change.Key] = change.Value;
        return new ConfigurationBuilder().AddInMemoryCollection(values).Build();
    }

    private static async Task<TestApp> CreateApp(Dictionary<string, string?>? changes = null, string remoteIp = "127.0.0.1", string environment = "Production", string? sqlConnection = null, Microsoft.EntityFrameworkCore.Diagnostics.IInterceptor? sqlInterceptor = null, bool sqlRetries = false, IAttachmentScanner? attachmentScanner = null)
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = environment });
        builder.Configuration.Sources.Clear();
        builder.Configuration.AddConfiguration(Configuration(changes));
        builder.WebHost.UseTestServer();
        var logs = new SafeLogCapture();
        builder.Logging.ClearProviders();
        builder.Logging.AddProvider(logs);
        // Keep test token/CSRF cryptography isolated from the machine's Windows key store.
        builder.Services.AddDataProtection().UseEphemeralDataProtectionProvider();
        var databaseName = Guid.NewGuid().ToString();
        builder.Services.AddDbContext<AppDbContext>(options => {
            if (sqlConnection is null) options.UseInMemoryDatabase(databaseName);
            else options.UseSqlServer(sqlConnection, sql => { if (sqlRetries) sql.EnableRetryOnFailure(); });
            if (sqlInterceptor is not null) options.AddInterceptors(sqlInterceptor);
        });
        builder.AddInternetSecurity().AddEntityFrameworkStores<AppDbContext>();
        var mail = new TestEmailSender(); var clock = new TestClock();
        builder.Services.AddSingleton<IAuthenticationEmailSender>(mail);
        builder.Services.AddSingleton<TimeProvider>(clock);
        builder.Services.AddPermissionAuthorization();
        builder.Services.AddScoped<UserPresenceService>();
        builder.Services.AddScoped<PostingService>();
        builder.Services.AddScoped<PersonAccountService>();
        builder.Services.AddScoped<XlsxPurchaseImporter>();
        builder.Services.AddAttachmentSecurity();
        if (attachmentScanner is not null) builder.Services.AddSingleton<IAttachmentScanner>(attachmentScanner);
        builder.Services.AddControllers(options => options.Filters.Add<ConcurrencyExceptionFilter>()).AddApplicationPart(typeof(PresenceController).Assembly);
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
        authentication.MapAuthenticationSecurity();
        app.MapControllers();
        app.MapGet("/test/error", IResult () => throw new InvalidOperationException("sensitive-test-marker")).AllowAnonymous().WithMetadata(new TestEndpointMarker());
        app.MapGet("/test/problem", () => Results.Problem(detail: "sensitive-test-marker", statusCode: 500, extensions: new Dictionary<string, object?> { ["debug"] = "sensitive-test-marker" })).AllowAnonymous().WithMetadata(new TestEndpointMarker());
        app.MapGet("/test/network", (HttpContext context) => Results.Ok(new { context.Request.Scheme, ip = context.Connection.RemoteIpAddress!.ToString(), host = context.Request.Host.Value })).AllowAnonymous().WithMetadata(new TestEndpointMarker());
        app.MapPost("/test/logout", async (ClaimsPrincipal principal, AppSignInManager signIn) => { await signIn.RevokeSessionsAsync(principal); return Results.NoContent(); }).RequireAuthenticatedAccess("Test own-session logout.").WithMetadata(new TestEndpointMarker());
        app.MapPost("/test/uploads", () => Results.Ok()).RequireAuthenticatedAccess("Test rate-limit partition for an authenticated session.").WithMetadata(new TestEndpointMarker()).RequireRateLimiting(InternetSecurity.Uploads);
        app.MapPost("/test/reports", () => Results.Ok()).RequireAuthenticatedAccess("Test rate-limit partition for an authenticated session.").WithMetadata(new TestEndpointMarker()).RequireRateLimiting(InternetSecurity.Reports);
        app.MapPost("/test/backups", () => Results.Ok()).RequireAuthenticatedAccess("Test rate-limit partition for an authenticated session.").WithMetadata(new TestEndpointMarker()).RequireRateLimiting(InternetSecurity.Backups);
        app.MapGet("/health", () => Results.Ok(new { status = "healthy" })).AllowAnonymous();
        MapAuthorizationProbes(app);
        await app.StartAsync();
        using (var scope = app.Services.CreateScope()) {
            var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
            foreach (var name in new[] { "Administrator", "Manager", "Customer", "Partner" })
                if (!await roles.RoleExistsAsync(name)) Assert.True((await roles.CreateAsync(new IdentityRole<Guid>(name))).Succeeded);
        }
        var client = app.GetTestClient();
        client.BaseAddress = new Uri(environment == "Development" ? "http://localhost" : "https://api.example.test");
        return new TestApp(app, client, logs, mail, clock);
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

    private static async Task<TokenResponse> Login(TestApp host, string email) {
        host.Client.DefaultRequestHeaders.Authorization = null;
        var response = await host.Client.PostAsJsonAsync("/api/auth/login", new { email, password = Password });
        if (response.StatusCode == HttpStatusCode.Accepted) {
            var challenge = (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("challenge").GetString();
            response = await host.Client.PostAsJsonAsync("/api/auth/verify-email", new { challenge, code = host.Mail.Code });
        }
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<TokenResponse>())!;
    }
    private sealed record TokenResponse(string AccessToken, string RefreshToken, int ExpiresIn);
    private sealed record TestApp(WebApplication App, HttpClient Client, SafeLogCapture Logs, TestEmailSender Mail, TestClock Clock) : IAsyncDisposable {
        public async ValueTask DisposeAsync() { Client.Dispose(); await App.DisposeAsync(); }
    }
    private sealed class TestClock : TimeProvider {
        private DateTimeOffset now = DateTimeOffset.UtcNow;
        public override DateTimeOffset GetUtcNow() => now;
        public void Advance(TimeSpan duration) => now += duration;
    }
    private sealed class TestEmailSender : IAuthenticationEmailSender {
        public bool IsAvailable { get; set; } = true;
        public bool FailDelivery { get; set; }
        public List<(string Email, string Subject, string Body)> Messages { get; } = [];
        public string Code => Messages.Last(x => x.Subject.Contains("verification code")).Body.Split(':')[1].Trim().Split('\n')[0];
        public string LinkToken => Uri.UnescapeDataString(Messages.Last().Body.Split('=', 2)[1]);
        public Task SendAsync(string registeredEmail, string subject, string text, CancellationToken ct) {
            if (!IsAvailable || FailDelivery) throw new AuthenticationEmailUnavailableException();
            Messages.Add((registeredEmail, subject, text)); return Task.CompletedTask;
        }
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
