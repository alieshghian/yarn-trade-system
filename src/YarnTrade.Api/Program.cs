using System.Globalization;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Localization;
using Microsoft.EntityFrameworkCore;
using Microsoft.OpenApi.Models;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;
using YarnTrade.Api.Services;
using YarnTrade.Api.Security;

// Always load appsettings.json from the published/build output directory.
// Visual Studio, the generated .exe and `dotnet run` may use different working
// directories; configuration must not depend on that external process setting.
var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    ContentRootPath = AppContext.BaseDirectory
});
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
var autoMigrate = builder.Configuration.GetValue<bool>("Database:AutoMigrate");
var seedEnabled = builder.Configuration.GetValue<bool>("Seed:Enabled");
builder.AddInternetSecurity().AddEntityFrameworkStores<AppDbContext>();
builder.Services.AddLocalization(options => options.ResourcesPath = "Resources");
builder.Services.AddControllers().AddJsonOptions(options => options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo { Title = "Yarn Trade API", Version = "v1", Description = "Focused bilingual yarn partnership trading API" });
    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme { Type = SecuritySchemeType.Http, Scheme = "bearer", BearerFormat = "opaque", In = ParameterLocation.Header });
});
builder.Services.AddDbContext<AppDbContext>(options => options.UseSqlServer(connectionString, sql => sql.EnableRetryOnFailure()));
builder.Services.AddAuthorization();
builder.Services.AddScoped<PostingService>();
builder.Services.AddScoped<XlsxPurchaseImporter>();
builder.Services.AddScoped<DemoDataSeeder>();
builder.Services.AddScoped<PersonAccountService>();
builder.Services.AddScoped<PermissionService>();
builder.Services.AddScoped<UserPresenceService>();

var app = builder.Build();
app.UseInternetSecurity();
if (app.Environment.IsDevelopment()) { app.UseSwagger(); app.UseSwaggerUI(); }
app.UseRequestLocalization(new RequestLocalizationOptions
{
    DefaultRequestCulture = new RequestCulture("fa-IR"),
    SupportedCultures = [new CultureInfo("fa-IR"), new CultureInfo("en-US")],
    SupportedUICultures = [new CultureInfo("fa-IR"), new CultureInfo("en-US")]
});
app.UseRouting();
app.UseCors("frontend");
app.UseAuthentication();
app.UseRateLimiter();
app.UseMiddleware<AuthenticationSessionMiddleware>();
app.UseMiddleware<UserPresenceMiddleware>();
app.UseMiddleware<PermissionGuardMiddleware>();
app.UseAuthorization();
var authentication = app.MapGroup("/api/auth").RequireRateLimiting(InternetSecurity.Authentication);
authentication.MapAuthenticationSecurity();
app.MapControllers();
app.MapGet("/health", () => Results.Ok(new { status = "healthy", utc = DateTime.UtcNow })).AllowAnonymous();

if (autoMigrate)
{
    await using var scope = app.Services.CreateAsyncScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.MigrateAsync();
    if (seedEnabled) await scope.ServiceProvider.GetRequiredService<DemoDataSeeder>().SeedAsync();
}

await app.RunAsync();

public partial class Program;
