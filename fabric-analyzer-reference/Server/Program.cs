using System.Globalization;
using System.Net;
using System.Security.Claims;
using System.Text.Json.Serialization;
using FabricAnalyzer;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Data.SqlClient;

bool setupAdmin = args.Contains("--setup-admin");
var builder = WebApplication.CreateBuilder(args.Where(arg => arg != "--setup-admin").ToArray());
bool sample = builder.Configuration.GetValue<bool>("Sample");
string catalog = sample ? "FabricAnalyzerSample" : "FabricAnalyzer";
int port = builder.Configuration.GetValue("FabricPort", 5088);
var sql = new SqlConnectionStringBuilder {
    DataSource = "localhost", InitialCatalog = catalog, IntegratedSecurity = true,
    TrustServerCertificate = true, ApplicationName = "Fabric Analyzer", ConnectTimeout = 8
};
builder.WebHost.ConfigureKestrel(k => k.Listen(IPAddress.Loopback, port));
builder.Services.AddDbContext<Store>(options => options.UseSqlServer(sql.ConnectionString));
builder.Services.AddScoped<Workflow>();
builder.Services.AddSingleton<PasswordHasher<Account>>();
builder.Services.ConfigureHttpJsonOptions(options => options.SerializerOptions.Converters.Add(new JsonStringEnumConverter(allowIntegerValues: false)));
builder.Services.AddAuthorization();
builder.Services.AddRateLimiter(options => {
    options.RejectionStatusCode = 429;
    options.AddFixedWindowLimiter("login", l => { l.PermitLimit = 12; l.Window = TimeSpan.FromMinutes(1); });
});
bool IsLocal(HttpContext c) => c.Connection.RemoteIpAddress is IPAddress ip && IPAddress.IsLoopback(ip)
    && c.Request.Host.Host is "localhost" or "127.0.0.1";
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme).AddCookie(o => {
    o.Cookie.Name = sample ? "FabricAnalyzer.Sample" : "FabricAnalyzer.Session";
    o.Cookie.HttpOnly = true;
    o.Cookie.SameSite = SameSiteMode.Strict;
    o.ExpireTimeSpan = TimeSpan.FromHours(8);
    o.Events.OnValidatePrincipal = async context => {
        if (context.Principal?.FindFirstValue("dev") == "1")
        {
            if (!sample || !IsLocal(context.HttpContext)) context.RejectPrincipal();
            return;
        }
        var key = context.Principal?.FindFirstValue(ClaimTypes.NameIdentifier);
        var db = context.HttpContext.RequestServices.GetRequiredService<Store>();
        if (!int.TryParse(key, out var id) || !await db.Users.AnyAsync(u => u.Id == id && u.Enabled &&
            u.Stamp == context.Principal!.FindFirstValue("stamp"))) context.RejectPrincipal();
    };
    o.Events.OnRedirectToLogin = c => Reply(c.HttpContext, 401, "برای ادامه وارد شوید.");
    o.Events.OnRedirectToAccessDenied = c => Reply(c.HttpContext, 403, "نقش شما مجوز این عملیات را ندارد.");
});
var app = builder.Build();
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<Store>();
    await db.Database.EnsureCreatedAsync();
    await db.Upgrade();
    if (setupAdmin)
    {
        if (sample) throw new InvalidOperationException("Bootstrap applies to the operational database.");
        if (await db.Users.AnyAsync(u => u.Enabled && u.Role == Role.Administrator))
        {
            Console.WriteLine("An active system administrator already exists.");
            return 0;
        }
        var user = (Console.ReadLine() ?? "").Trim();
        string password;
        Account account;
        try
        {
            password = System.Text.Encoding.UTF8.GetString(Convert.FromBase64String(Console.ReadLine() ?? ""));
            Calc.Require(password.Length is >= 12 and <= 200, "Password must contain 12 to 200 characters.");
            account = MakeAccount(new(user, user, password, Role.Administrator));
        }
        catch (Exception e) when (e is InvalidData or FormatException)
        {
            Console.Error.WriteLine(e.Message);
            return 2;
        }
        account.Hash = scope.ServiceProvider.GetRequiredService<PasswordHasher<Account>>().HashPassword(account, password);
        await db.Write(async () => {
            Calc.Require(!await db.Users.AnyAsync(u => u.User == account.User || (u.Enabled && u.Role == Role.Administrator)),
                "نام کاربری یا مدیر فعال از قبل وجود دارد.");
            db.Add(account);
            return true;
        });
        Console.WriteLine("System administrator created.");
        return 0;
    }
}

app.Use(async (c, next) => {
    if (!IsLocal(c)) { await Reply(c, 403, "این نصب فقط روی همین رایانه در دسترس است."); return; }
    if (c.Request.Path.StartsWithSegments("/api") && !HttpMethods.IsGet(c.Request.Method) &&
        !HttpMethods.IsHead(c.Request.Method) && c.Request.Headers["X-Fabric-Request"] != "1")
    { await Reply(c, 403, "درخواست از برنامه معتبر نیست."); return; }
    if (c.Request.Path.StartsWithSegments("/api")) c.Response.Headers.CacheControl = "no-store";
    try { await next(); }
    catch (InvalidData e) { await Reply(c, 422, e.Message); }
    catch (Conflict e) { await Reply(c, 409, e.Message); }
    catch (BadHttpRequestException) { await Reply(c, 400, "ساختار داده ارسالی معتبر نیست."); }
    catch (DbUpdateConcurrencyException) { await Reply(c, 409, "رکورد هم‌زمان تغییر کرده است. دوباره آن را باز کنید."); }
    catch (DbUpdateException e)
    {
        app.Logger.LogError(e, "Database write failed");
        await Reply(c, 409, "ذخیره انجام نشد. شناسه تکراری یا مغایرت داده را بررسی کنید.");
    }
    catch (Exception e) when (!c.Response.HasStarted)
    {
        app.Logger.LogError(e, "Fabric Analyzer request failed");
        await Reply(c, 500, "خطای داخلی یا عدم دسترسی به پایگاه داده. ذخیره انجام نشد.");
    }
});
app.UseDefaultFiles();
app.UseStaticFiles();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
var api = app.MapGroup("/api");
api.MapGet("/health", async (Store db) => await db.Database.CanConnectAsync() ? Results.Ok(new { sample, version = typeof(Calc).Assembly.GetName().Version?.ToString(3) }) : Results.StatusCode(503));
api.MapGet("/session", (HttpContext c) => new { sample, development = sample && IsLocal(c),
    user = c.User.Identity?.Name, role = c.User.FindFirstValue(ClaimTypes.Role), name = c.User.FindFirstValue("display") });
api.MapPost("/login", async (LoginInput input, Store db, HttpContext c, PasswordHasher<Account> hasher) => {
    var key = input.User?.Trim().ToLowerInvariant();
    var account = await db.Users.SingleOrDefaultAsync(u => u.User == key && u.Enabled);
    if (account is null || string.IsNullOrEmpty(input.Password) || input.Password.Length > 200 ||
        hasher.VerifyHashedPassword(account, account.Hash, input.Password) == PasswordVerificationResult.Failed)
        return Results.Json(new { error = "نام کاربری یا رمز عبور معتبر نیست." }, statusCode: 401);
    await Sign(c, account);
    return Results.NoContent();
}).RequireRateLimiting("login");
api.MapPost("/dev/{role}", async (string role, HttpContext c) => {
    if (!sample || !IsLocal(c) || !Enum.TryParse<Role>(role, false, out var r) || r.ToString() != role) return Results.NotFound();
    await Sign(c, new Account { User = "sample-" + role.ToLowerInvariant(), Name = "کاربر آزمایشی", Role = r }, true);
    return Results.NoContent();
});
api.MapPost("/logout", async (HttpContext c) => { await c.SignOutAsync(); return Results.NoContent(); });

var secured = api.MapGroup("").RequireAuthorization();
var production = secured.MapGroup("").RequireAuthorization(p => p.RequireRole("Production", "Manager"));
var manager = secured.MapGroup("").RequireAuthorization(p => p.RequireRole("Manager"));
var admin = secured.MapGroup("").RequireAuthorization(p => p.RequireRole("Administrator"));

production.MapGet("/yarns", async (Store db) => (await db.Yarns.OrderByDescending(y => y.Id).ToListAsync())
    .Select(y => new { y.Id, input = y.Input(), tex = Calc.Tex(y.Input()), y.CreatedAt, y.CreatedBy }));
production.MapPost("/yarns", (YarnInput input, Store db, HttpContext c) => db.Write(async () => {
    var tex = Calc.Tex(input);
    Calc.Require(Calc.Text(input.Code, 80) && Calc.Text(input.Material), "کد یکتای نخ و جنس نخ الزامی‌اند.");
    Calc.Require(input.MeasureM is null || input.MeasureDate is not null && input.MeasureDate != default(DateOnly),
        "تاریخ اندازه‌گیری Tex را وارد کنید.");
    input = input with { Code = input.Code!.Trim().ToUpperInvariant(), Name = input.Name.Trim(), Color = input.Color.Trim(),
        Material = input.Material!.Trim() };
    Calc.Require(!await db.Yarns.AnyAsync(y => y.CatalogCode == input.Code), "کد نخ از قبل ثبت شده است.");
    var existing = (await db.Yarns.AsNoTracking().ToListAsync()).Select(y => y.Input());
    static bool Same(string? a, string? b) => string.Equals(a?.Trim(), b?.Trim(), StringComparison.OrdinalIgnoreCase);
    Calc.Require(!existing.Any(y => Same(y.Name, input.Name) && Same(y.Color, input.Color) && Same(y.Material, input.Material)
        && y.Kind == input.Kind && y.System == input.System && y.Count == input.Count && y.Plies == input.Plies && y.Basis == input.Basis),
        "این مشخصات نخ از قبل ثبت شده‌اند. نخ را از فهرست انتخاب کنید.");
    var yarn = new Yarn { Data = Payload.Write(input), CatalogCode = input.Code, CreatedAt = DateTimeOffset.UtcNow, CreatedBy = Actor(c) };
    db.Add(yarn);
    await db.SaveChangesAsync();
    return Results.Ok(new { yarn.Id, tex, input });
}));
production.MapPost("/yarns/tex", (YarnInput input) => new { tex = Calc.Tex(input) });
production.MapGet("/analyses", async (Store db) => (await db.FabricAnalysisVersions.Include(a => a.Fabric)
    .OrderByDescending(a => a.Id).ToListAsync()).Select(a => Summary(a)));
production.MapGet("/analyses/{id:int}", (int id, Workflow flow) => flow.Detail(id, false));
production.MapPost("/analyses/preview", (AnalysisInput input, Workflow flow) => flow.Preview(input));
production.MapPost("/analyses", (AnalysisInput input, Workflow flow, HttpContext c) => flow.Save(null, input, Actor(c)));
production.MapPut("/analyses/{id:int}", (int id, AnalysisInput input, Workflow flow, HttpContext c) => flow.Save(id, input, Actor(c)));
production.MapPost("/analyses/{id:int}/ready", (int id, VersionCommand command, Workflow flow, HttpContext c) => flow.Ready(id, command, Actor(c)));
production.MapPost("/analyses/{id:int}/preparations", (int id, TrialInput input, Workflow flow, HttpContext c) => flow.SaveTrial(id, input, Actor(c), true));
production.MapPost("/analyses/{id:int}/trials", (int id, TrialInput input, Workflow flow, HttpContext c) => flow.SaveTrial(id, input, Actor(c), false));
manager.MapPost("/analyses/{id:int}/approve", (int id, VersionCommand command, Workflow flow, HttpContext c) => flow.Approve(id, command, Actor(c)));
var reports = secured.MapGroup("/reports").RequireAuthorization(p => p.RequireRole("Sales", "Pricing", "Production", "Manager"));
reports.MapGet("", async (Store db) => (await db.FabricAnalysisVersions.Include(a => a.Fabric)
    .Where(a => a.Status == AnalysisStatus.Approved).OrderBy(a => a.Fabric.Code).ToListAsync()).Select(a => Summary(a)));
reports.MapGet("/{id:int}", (int id, Workflow flow) => flow.Detail(id, true));
production.MapGet("/configuration", (Workflow flow) => flow.CurrentSettings());
admin.MapGet("/settings", (Workflow flow) => flow.CurrentSettings());
admin.MapGet("/settings/history", (Store db) => db.SettingRevisions.AsNoTracking().OrderByDescending(s => s.Id).ToListAsync());
admin.MapPut("/settings", (SettingInput input, Store db, HttpContext c) => db.Write(async () => {
    Calc.Require(Calc.Percent(input.Tolerance) && Calc.Precision(input.Tolerance), "تلورانس باید بین 0 و 100 درصد باشد.");
    var settings = await db.Settings.SingleAsync(s => s.Id == 1);
    var max = input.MaxWeftCycleSlots ?? settings.MaxWeftCycleSlots;
    Calc.Require(max is >= 1 and <= TextileRules.HardwareMaximum, "ظرفیت پود باید بین 1 و 12 باشد.");
    if (settings.Tolerance != input.Tolerance || settings.MaxWeftCycleSlots != max)
    {
        settings.Tolerance = input.Tolerance;
        settings.MaxWeftCycleSlots = max;
        db.SettingRevisions.Add(new SettingRevision { Tolerance = input.Tolerance, MaxWeftCycleSlots = max,
            User = Actor(c), At = DateTimeOffset.UtcNow, Reason = input.Reason?.Trim() ?? "تغییر تنظیمات دستگاه" });
    }
    return Results.NoContent();
}));
admin.MapGet("/users", (Store db) => db.Users.OrderBy(u => u.User).Select(u => new { u.Id, u.User, u.Name, u.Role, u.Enabled }).ToListAsync());
admin.MapPost("/users", (UserInput input, Store db, PasswordHasher<Account> hasher) => db.Write(async () => {
    Calc.Require(input.Password is { Length: >= 12 and <= 200 }, "رمز عبور باید حداقل 12 نویسه داشته باشد.");
    var account = MakeAccount(input);
    Calc.Require(!await db.Users.AnyAsync(u => u.User == account.User), "نام کاربری تکراری است.");
    account.Hash = hasher.HashPassword(account, input.Password);
    db.Add(account);
    return Results.NoContent();
}));
admin.MapPut("/users/{id:int}", (int id, UserInput input, Store db, PasswordHasher<Account> hasher) => db.Write(async () => {
    var row = await db.Users.SingleOrDefaultAsync(u => u.Id == id) ?? throw new InvalidData("کاربر پیدا نشد.");
    var desired = MakeAccount(input);
    Calc.Require(row.User == desired.User, "نام کاربری موجود قابل تغییر نیست.");
    Calc.Require(row.Role != Role.Administrator || (desired.Enabled && desired.Role == Role.Administrator) ||
        await db.Users.AnyAsync(u => u.Id != id && u.Enabled && u.Role == Role.Administrator), "حداقل یک مدیر سیستم باید فعال بماند.");
    if (!string.IsNullOrEmpty(input.Password))
    {
        Calc.Require(input.Password.Length is >= 12 and <= 200, "رمز عبور باید حداقل 12 نویسه داشته باشد.");
        row.Hash = hasher.HashPassword(row, input.Password);
    }
    row.Name = desired.Name;
    row.Role = desired.Role;
    row.Enabled = desired.Enabled;
    row.Stamp = Guid.NewGuid().ToString();
    return Results.NoContent();
}));
secured.MapGet("/date/{year:int}/{month:int}/{day:int}", (int year, int month, int day) => {
    try
    {
        if (year is >= 0 and < 100) year += 1400;
        Calc.Require(year is >= 1300 and <= 1599, "سال هجری شمسی خارج از محدوده است.");
        return Results.Ok(new { date = DateOnly.FromDateTime(new PersianCalendar().ToDateTime(year, month, day, 0, 0, 0, 0)) });
    }
    catch (ArgumentOutOfRangeException) { throw new InvalidData("روز یا ماه در تقویم هجری شمسی معتبر نیست."); }
});
app.Map("/api/{**path}", () => Results.NotFound());
app.MapFallbackToFile("index.html");
await app.RunAsync();
return 0;

static object Summary(Analysis a)
{
    var input = Payload.Read<AnalysisInput>(a.Data);
    return new { a.Id, Code = a.Fabric.Code, a.Version, a.Status, input.Description, input.Date, a.UpdatedAt };
}
static string Actor(HttpContext c) => $"{c.User.FindFirstValue("display")} ({c.User.Identity!.Name})";
static Account MakeAccount(UserInput input)
{
    Calc.Require(Calc.Text(input.User, 80) && Calc.Text(input.Name) && Enum.IsDefined(input.Role)
        && input.User.Trim().All(c => char.IsAsciiLetterOrDigit(c) || c is '.' or '_' or '-'),
        "نام کاربری را با حروف انگلیسی، عدد، نقطه، خط تیره یا زیرخط وارد کنید و نام و نقش را مشخص کنید.");
    return new() { User = input.User.Trim().ToLowerInvariant(), Name = input.Name.Trim(), Role = input.Role, Enabled = input.Enabled };
}
static Task Reply(HttpContext c, int status, string error)
{
    c.Response.StatusCode = status;
    return c.Response.WriteAsJsonAsync(new { error });
}
static Task Sign(HttpContext c, Account a, bool dev = false)
{
    var claims = new List<Claim> {
        new(ClaimTypes.NameIdentifier, a.Id.ToString(CultureInfo.InvariantCulture)), new(ClaimTypes.Name, a.User),
        new(ClaimTypes.Role, a.Role.ToString()), new("display", a.Name), new("stamp", a.Stamp)
    };
    if (dev) claims.Add(new("dev", "1"));
    return c.SignInAsync(new ClaimsPrincipal(new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme)));
}
