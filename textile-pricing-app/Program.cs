using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Mvc.ModelBinding.Metadata;
using Microsoft.AspNetCore.WebUtilities;
using System.Security.Claims;
using TextilePricingApp.Services;

var setupAdmin = args is ["--setup-admin"];
var builder = WebApplication.CreateBuilder(setupAdmin ? [] : args);
if (setupAdmin)
{
    Environment.ExitCode = InitialAdminSetup.Run(builder.Environment);
    return;
}

builder.Logging.ClearProviders();
builder.Logging.AddConsole();
builder.Logging.AddDebug();

// Add services to the container.
var dataProtectionKeysPath = Path.Combine(builder.Environment.ContentRootPath, "App_Data", "Keys");
Directory.CreateDirectory(dataProtectionKeysPath);
builder.Services.AddDataProtection()
    .SetApplicationName("TextilePricingApp")
    .PersistKeysToFileSystem(new DirectoryInfo(dataProtectionKeysPath));
builder.Services.AddHttpContextAccessor();
builder.Services.AddSession(options =>
{
    options.IdleTimeout = TimeSpan.FromMinutes(20);
    options.Cookie.HttpOnly = true;
    options.Cookie.IsEssential = true;
});
builder.Services.AddMemoryCache();
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.LoginPath = "/Login";
        options.LogoutPath = "/Logout";
        options.AccessDeniedPath = "/Home";
        options.ExpireTimeSpan = TimeSpan.FromHours(8);
        options.SlidingExpiration = true;
    });
builder.Services.AddRazorPages(options =>
    {
        options.Conventions.AddPageRoute("/Index", "/QuickPrice");
    })
    .AddMvcOptions(options =>
    {
        options.Filters.Add<PermissionPageFilter>();
        options.Filters.Add<ProtectedOperationPageFilter>();
        ConfigurePersianModelBindingMessages(options.ModelBindingMessageProvider);
    });
builder.Services.AddSingleton<TextilePricingApp.Services.AuditLogRepository>();
builder.Services.AddSingleton<TextilePricingApp.Services.AuthRepository>();
builder.Services.AddScoped<TextilePricingApp.Services.PermissionPageFilter>();
builder.Services.AddScoped<TextilePricingApp.Services.PageAccessService>();
builder.Services.AddSingleton<TextilePricingApp.Services.MaterialRepository>();
builder.Services.AddSingleton<TextilePricingApp.Services.ProfitTierRepository>();
builder.Services.AddSingleton<TextilePricingApp.Services.WasteTierRepository>();
builder.Services.AddSingleton<TextilePricingApp.Services.ProductGroupRepository>();
builder.Services.AddSingleton<TextilePricingApp.Services.SettingsRepository>();
builder.Services.AddSingleton<TextilePricingApp.Services.AnalysisRepository>();
builder.Services.AddSingleton<TextilePricingApp.Services.ProductAnalysisRuleEngine>();
builder.Services.AddSingleton<TextilePricingApp.Services.MaterialSuggestionService>();
builder.Services.AddSingleton<TextilePricingApp.Services.FactoryPriceRepository>();
builder.Services.AddSingleton<TextilePricingApp.Services.CustomerRepository>();
builder.Services.AddSingleton<TextilePricingApp.Services.CustomerProductAssignmentRepository>();
builder.Services.AddSingleton<RubikaAccountService>();
builder.Services.AddSingleton<MaterialsPdfService>();
builder.Services.AddSingleton<RubikaBotService>();
builder.Services.AddSingleton<RubikaBotConnectionRepository>();
builder.Services.AddSingleton<RubikaBotUpdatesWorker>();
builder.Services.AddHostedService(provider => provider.GetRequiredService<RubikaBotUpdatesWorker>());
builder.Services.AddSingleton<RubikaDispatchRepository>();
builder.Services.AddHostedService<RubikaDispatchWorker>();
builder.Services.AddSingleton<TextilePricingApp.Services.CustomerPriceRepository>();
builder.Services.AddSingleton<TextilePricingApp.Services.CustomerPriceReportService>();
builder.Services.AddSingleton<TextilePricingApp.Services.PriceSnapshotRepository>();
builder.Services.AddSingleton<TextilePricingApp.Services.PriceSnapshotService>();
builder.Services.AddSingleton<TextilePricingApp.Services.PricingService>();
builder.Services.AddSingleton<TextilePricingApp.Services.SemiFinishedMaterialService>();
builder.Services.AddSingleton<TextilePricingApp.Services.PriceFreshnessService>();
builder.Services.AddSingleton<TextilePricingApp.Services.HardwareFingerprintService>();
builder.Services.AddSingleton<TextilePricingApp.Services.LicenseService>();
builder.Services.AddSingleton<TextilePricingApp.Services.IntegrityService>();
builder.Services.AddScoped<TextilePricingApp.Services.ProtectedOperationPageFilter>();

var app = builder.Build();
var bypassAuthInDevelopment = app.Environment.IsDevelopment() &&
    app.Configuration.GetValue<bool>("Auth:BypassInDevelopment");

// Configure the HTTP request pipeline.
app.UseExceptionHandler("/Error");
app.UseStatusCodePagesWithReExecute("/Error", "?statusCode={0}");
app.UseStaticFiles();

app.UseRouting();

app.Use(async (context, next) =>
{
    var integrity = context.RequestServices.GetRequiredService<TextilePricingApp.Services.IntegrityService>();
    if (integrity.EnforcementEnabled)
    {
        var path = context.Request.Path.Value ?? "";
        var allowed = path.StartsWith("/Error", StringComparison.OrdinalIgnoreCase) ||
            path.StartsWith("/css/", StringComparison.OrdinalIgnoreCase) ||
            path.StartsWith("/js/", StringComparison.OrdinalIgnoreCase) ||
            path.StartsWith("/lib/", StringComparison.OrdinalIgnoreCase) ||
            path.StartsWith("/images/", StringComparison.OrdinalIgnoreCase) ||
            path.StartsWith("/favicon", StringComparison.OrdinalIgnoreCase);

        if (!allowed && !integrity.GetStatus().IsValid)
        {
            context.Response.Redirect("/Error?statusCode=503");
            return;
        }
    }

    await next();
});

app.Use(async (context, next) =>
{
    var license = context.RequestServices.GetRequiredService<TextilePricingApp.Services.LicenseService>();
    if (license.EnforcementEnabled)
    {
        var path = context.Request.Path.Value ?? "";
        var allowed = path.StartsWith("/License", StringComparison.OrdinalIgnoreCase) ||
            path.StartsWith("/Error", StringComparison.OrdinalIgnoreCase) ||
            path.StartsWith("/css/", StringComparison.OrdinalIgnoreCase) ||
            path.StartsWith("/js/", StringComparison.OrdinalIgnoreCase) ||
            path.StartsWith("/lib/", StringComparison.OrdinalIgnoreCase) ||
            path.StartsWith("/images/", StringComparison.OrdinalIgnoreCase) ||
            path.StartsWith("/favicon", StringComparison.OrdinalIgnoreCase);

        if (!allowed && !license.GetStatus().IsValid)
        {
            context.Response.Redirect("/License");
            return;
        }
    }

    await next();
});

app.UseSession();
app.UseAuthentication();
if (bypassAuthInDevelopment)
{
    app.Use(async (context, next) =>
    {
        if (context.User.Identity?.IsAuthenticated != true)
        {
            var claims = new List<Claim>
            {
                new(ClaimTypes.NameIdentifier, "0"),
                new(ClaimTypes.Name, "dev-admin"),
                new("DisplayName", "تست بدون لاگین"),
                new("IsAdmin", "true")
            };
            context.User = new ClaimsPrincipal(new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme));
        }

        await next();
    });
}
app.UseAuthorization();

app.Use(async (context, next) =>
{
    var keepEmbedded = IsEmbeddedRequest(context.Request);
    if (keepEmbedded)
    {
        context.Response.OnStarting(() =>
        {
            if (context.Response.StatusCode is < 300 or >= 400 ||
                !context.Response.Headers.TryGetValue("Location", out var locationValues))
            {
                return Task.CompletedTask;
            }

            var location = locationValues.ToString();
            var embeddedLocation = AddEmbeddedToLocalRedirect(context.Request, location);
            if (!string.IsNullOrWhiteSpace(embeddedLocation))
            {
                context.Response.Headers.Location = embeddedLocation;
            }

            return Task.CompletedTask;
        });
    }

    await next();
});

app.MapRazorPages();

app.Run();

static bool IsEmbeddedRequest(HttpRequest request)
{
    if (request.Query.ContainsKey("embedded"))
    {
        return true;
    }

    return request.HasFormContentType && request.Form.ContainsKey("embedded");
}

static string? AddEmbeddedToLocalRedirect(HttpRequest request, string location)
{
    if (string.IsNullOrWhiteSpace(location))
    {
        return null;
    }

    var isAbsolute = Uri.TryCreate(location, UriKind.Absolute, out var absoluteUri);
    if (isAbsolute &&
        (!string.Equals(absoluteUri!.Scheme, request.Scheme, StringComparison.OrdinalIgnoreCase) ||
         !string.Equals(absoluteUri.Host, request.Host.Host, StringComparison.OrdinalIgnoreCase) ||
         absoluteUri.Port != request.Host.Port.GetValueOrDefault(absoluteUri.Port)))
    {
        return null;
    }

    var pathAndQuery = isAbsolute ? absoluteUri!.PathAndQuery : location;
    if (!pathAndQuery.StartsWith("/", StringComparison.Ordinal))
    {
        return null;
    }

    var path = pathAndQuery.Split('?', '#')[0];
    if (path.StartsWith("/Login", StringComparison.OrdinalIgnoreCase) ||
        path.StartsWith("/Logout", StringComparison.OrdinalIgnoreCase) ||
        path.StartsWith("/License", StringComparison.OrdinalIgnoreCase))
    {
        return null;
    }

    return QueryHelpers.AddQueryString(location, "embedded", "1");
}

static void ConfigurePersianModelBindingMessages(DefaultModelBindingMessageProvider messages)
{
    messages.SetAttemptedValueIsInvalidAccessor((value, fieldName) => $"مقدار واردشده برای «{fieldName}» معتبر نیست.");
    messages.SetMissingBindRequiredValueAccessor(fieldName => $"وارد کردن «{fieldName}» الزامی است.");
    messages.SetMissingKeyOrValueAccessor(() => "اطلاعات ارسالی کامل نیست.");
    messages.SetMissingRequestBodyRequiredValueAccessor(() => "بدنه درخواست خالی است.");
    messages.SetNonPropertyAttemptedValueIsInvalidAccessor(value => "مقدار واردشده معتبر نیست.");
    messages.SetNonPropertyUnknownValueIsInvalidAccessor(() => "مقدار واردشده قابل شناسایی نیست.");
    messages.SetNonPropertyValueMustBeANumberAccessor(() => "مقدار باید عددی باشد.");
    messages.SetUnknownValueIsInvalidAccessor(fieldName => $"مقدار «{fieldName}» قابل شناسایی نیست.");
    messages.SetValueIsInvalidAccessor(value => "مقدار واردشده معتبر نیست.");
    messages.SetValueMustBeANumberAccessor(fieldName => $"«{fieldName}» باید عددی باشد.");
    messages.SetValueMustNotBeNullAccessor(value => "وارد کردن این مقدار الزامی است.");
}
