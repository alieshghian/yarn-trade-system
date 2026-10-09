# Yarn Trade — سامانه بازرگانی نخ امانی

## کارتابل نقش‌ها و پیگیری بازرگانی

- سفارش ثبت‌شده برای خرید نخ در کارتابل کاربران دارای نقش «بازرگانی» نمایش داده می‌شود.
- ستون کارتابل در سمت چپ صفحه باز و بسته می‌شود؛ وجود تسک مشاهده‌نشده، نوار بسته و سرستون باز را قرمز می‌کند.
- هر ردیف زمان و تاریخ ارجاع، خلاصه دوکلمه‌ای، زمان‌سنج سپری‌شده، مهلت نقش، دکمه مشاهده و دکمه اقدام دارد.
- مشاهده، فقط جزئیات تسک را باز و وضعیت آن را برای همان کاربر «دیده‌شده» می‌کند. اقدام، زمان‌سنج را در دیتابیس متوقف و فرم مربوط را در یک Tab باز می‌کند.
- عبور زمان سپری‌شده از SLA تنظیم‌شده برای نقش و نوع تسک، زمان‌سنج را قرمز می‌کند. مقادیر اولیه بازرگانی و انبار ۱۲ ساعت و مدیریت ۴۸ ساعت است.
- مسئول بازرگانی می‌تواند سفارش را بپذیرد، پیش‌نویس فاکتور خرید بسازد، فایل Excel فاکتور را استخراج کند، اطلاعات کالا و بسته‌بندی را اصلاح کند و مدارک PDF، تصویر یا Excel را پیوست کند.
- در مرحله تأیید دریافت، فاکتور قطعی می‌شود، گردش کالا و لایه موجودی ثبت می‌گردد، سفارش تکمیل و اعلان مربوط به انبار ایجاد می‌شود.

## تعریف کاربران و اختیارات

- هر کاربر به یکی از اشخاص فعال سیستم متصل می‌شود و یک ایمیل یکتا، رمز عبور، زبان و وضعیت فعال دارد.
- نقش‌های کاری شامل مشتری، فروشنده، تأمین‌کننده، شریک، مدیریت، سفارشات، بازرگانی، انباردار، مالی و سایر است؛ نقش مدیر سیستم نیز برای راهبری فنی حفظ شده است.
- مجوز مشاهده هر منو و عملیات ایجاد، ویرایش، حذف، ارسال، تأیید، ثبت قطعی، بارگذاری مدرک و تغییر رمز به تفکیک کاربر قابل تنظیم است.
- مجوزها هم در رابط کاربری و هم در API کنترل می‌شوند؛ مخفی‌کردن منو تنها کنترل امنیتی سیستم نیست.
- غیرفعال‌کردن کاربر مانع ادامه دسترسی او می‌شود و رمز عبور از فرم کاربران قابل بازنشانی است.

نسخه اولیه اجرایی یک سامانه متمرکز و دوزبانه برای خرید و واردات نخ، موجودی چندانباره، فروش نقدی/اعتباری، دریافت و پرداخت، چک و حساب شرکا.

## فناوری‌ها

- ASP.NET Core 8 Web API
- Entity Framework Core 8 + SQL Server
- ASP.NET Core Identity و role-based authorization
- React 19 + TypeScript + Vite
- Swagger/OpenAPI

## پیش‌نیازها

- .NET SDK 8
- SQL Server 2019 یا جدیدتر
- Node.js 20 یا جدیدتر و pnpm

## اجرای اولین‌باره

1. رشته اتصال و رمز seed توسعه را خارج از فایل‌های tracked، در .NET User Secrets تنظیم کنید. نمونهٔ زیر از اتصال رمزگذاری‌شده با گواهی معتبر SQL Server استفاده می‌کند:

```powershell
dotnet user-secrets set "ConnectionStrings:DefaultConnection" "Server=.;Database=YarnTrade;Trusted_Connection=True;Encrypt=True;TrustServerCertificate=False;MultipleActiveResultSets=true" --project src/YarnTrade.Api
dotnet user-secrets set "Seed:AdminPassword" "<یک-رمز-محلی-قوی-انتخاب-کنید>" --project src/YarnTrade.Api
```

`appsettings.json` تنظیمات امن پیش‌فرض دارد و seed و migration خودکار در آن خاموش است. `appsettings.Development.json` فقط در محیط Development این دو گزینه را برای اجرای محلی روشن می‌کند؛ بدون `Seed:AdminPassword` برنامه به‌جای ساختن حساب با رمز پیش‌فرض متوقف می‌شود.

2. در ریشه پروژه:

```powershell
dotnet restore
dotnet build --configuration Release
dotnet run --project src/YarnTrade.Api --urls http://localhost:5223
```

در Development، API پس از پیکربندی رشته اتصال، migration را اعمال و داده نمونه را seed می‌کند. Swagger در محیط Development در `http://localhost:5223/swagger` است.

3. در ترمینال دوم:

```powershell
cd frontend
pnpm install
pnpm dev
```

رابط در `http://localhost:5173` اجرا می‌شود. تنظیم proxy توسعه به `VITE_API_PROXY_TARGET` در محیط یا فایل محلی `.env.local` وابسته است؛ پیش‌فرض آن با پروفایل توسعهٔ API برابر است.

حساب توسعه با ایمیل `admin@yarntrade.local` ساخته می‌شود و رمز همان مقداری است که در User Secrets برای `Seed:AdminPassword` تنظیم کرده‌اید. رمز را در فایل تنظیمات یا مخزن قرار ندهید.

## تنظیمات Production

- رشته اتصال را از `ConnectionStrings__DefaultConnection` یا secret store تزریق کنید. برنامه در محیطی غیر از Development، در صورت نبودن رشته اتصال یا اگر SQL `Encrypt=True` و `TrustServerCertificate=False` نداشته باشد، پیش از اجرا متوقف می‌شود.
- `Database__AutoMigrate` و `Seed__Enabled` باید `false` بمانند. migrationها را به‌عنوان گام جداگانه و کنترل‌شدهٔ deployment اجرا کنید؛ برنامه در Production با migration خودکار یا seed روشن بالا نمی‌آید.
- TLS را در reverse proxy یا وب‌سرور با گواهی معتبر خاتمه دهید و رابط و API را فقط از طریق HTTPS منتشر کنید. اتصال SQL نیز باید گواهی سرور قابل‌اعتماد را اعتبارسنجی کند.
- مقدار `AllowedHosts` را به نام‌های دقیق میزبان API، جداشده با `;`، و `Cors__Origins__0` و موارد بعدی را به originهای دقیق HTTPS رابط تنظیم کنید. wildcard، origin دارای مسیر و CORS خالی خارج از Development باعث توقف برنامه می‌شوند. برای استقرار روی یک origin نیز همان origin را صریح تنظیم کنید. دامنه یا نشانی واقعی Production در سورس ذخیره نشده است.
- برنامه خارج از Development درخواست HTTP را با کد 308 به HTTPS پورت 443 هدایت می‌کند و HSTS با مدت ۳۰ روز می‌فرستد؛ زیر‌دامنه‌ها و preload فعال نیستند. وب‌سرور باید HTTPS را با گواهی معتبر ارائه کند و دسترسی مستقیم عمومی به پورت داخلی API را ببندد.
- اگر TLS در پراکسی خاتمه می‌یابد، `Security__ReverseProxy__Enabled=true` و `Security__ReverseProxy__KnownProxies__0` و موارد بعدی را با IPهای دقیق پراکسی‌های مورد اعتماد تنظیم کنید. `ForwardLimit` پیش‌فرض ۱ و بازهٔ مجاز ۱ تا ۵ است. بدون IP صریح برنامه متوقف می‌شود؛ در حالت خاموش هیچ forwarded header پذیرفته نمی‌شود. پراکسی باید Host عمومی را حفظ کند و `X-Forwarded-For` و `X-Forwarded-Proto` را خودش پاک‌سازی و تنظیم کند؛ `X-Forwarded-Host` پذیرفته نمی‌شود. تعداد hopها باید با تنظیمات واقعی مطابقت داشته باشد.
- SQL Server و ذخیره‌سازی پیوست/پشتیبان فقط در شبکهٔ خصوصی قرار گیرند و مجوز دسترسی شبکه فقط به سرویس‌های لازم داده شود. این تنظیمات شبکه و گواهی‌ها باید در استقرار اعمال شوند.
- در build فرانت‌اند، `VITE_API_URL` را به origin امن API تنظیم کنید؛ اگر reverse proxy رابط و `/api` را روی یک origin سرو می‌کند، مقدار را خالی بگذارید. فایل نمونهٔ `frontend/.env.example` فقط شامل مقادیر غیرمحرمانه است. فایل‌های `.env.local` و `.env.production` محلی در Git نادیده گرفته می‌شوند.

برای مشاهده نمای رابط بدون داده و ورود، فقط در محیط محلی از `http://localhost:5173/?demo=1` استفاده کنید. این حالت به API دسترسی مجاز ایجاد نمی‌کند.

### امنیت احراز هویت — A2

احراز هویت همچنان Identity داخلی و توکن opaque است. فرانت‌اند توکن دسترسی را فقط در `sessionStorage` نگه می‌دارد؛ refresh خودکار اضافه نشده است. زمان پیش‌فرض توکن دسترسی و Cookie یک ساعت و refresh بیست‌وچهار ساعت است؛ از `Security:AccessTokenMinutes` و `CookieMinutes` در بازهٔ ۱ تا ۶۰ و `RefreshTokenHours` در بازهٔ ۱ تا ۲۴ می‌توان زمان‌ها را کاهش داد. ایجاد یا تغییر رمز حداقل ۱۲ نویسه و الزامات پیش‌فرض Identity را لازم دارد. پنج تلاش ناموفق حساب را ده دقیقه قفل می‌کند؛ `MaxFailedAccessAttempts` در بازهٔ ۳ تا ۱۰ و `LockoutMinutes` در بازهٔ ۱ تا ۶۰ قابل تنظیم‌اند.

وضعیت فعال بودن، قفل بودن و Security Stamp در هر درخواست احراز هویت‌شده بررسی می‌شود. خروج در مسیر موجود `POST /api/presence/logout` فقط نشست فعال را باطل می‌کند و اعتبار مرورگر را حفظ می‌کند؛ رمز جدید، تغییر نقش/اختیارات/ایمیل، غیرفعال‌سازی و اقدام مدیر برای بازنشانی امنیت همهٔ نشست‌ها و اعتبار مرورگر را باطل می‌کنند. شناسه و مهلت نشست در جدول موجود Identity نگه‌داری می‌شود؛ نشست منقضی هنگام ورود بعدی پاک می‌شود. refresh نشست را تعویض می‌کند و refresh قبلی قابل استفادهٔ مجدد نیست. این بررسی برای refresh نیز اعمال می‌شود. خروج سمت سرور نیازمند رسیدن درخواست به API است؛ فرانت‌اند فعلی در هر صورت دادهٔ نشست محلی را پاک می‌کند.

Cookieهای Identity از `HttpOnly` و `SameSite=Strict` و در Production از `Secure` استفاده می‌کنند و تمدید لغزان ندارند. Cookie موقت MFA/ورود خارجی پنج دقیقه اعتبار دارد. کلاینت اختیاری Cookie باید ابتدا `GET /api/auth/csrf` را با ارسال Cookieها فراخوانی کند، `requestToken` را در هدر `X-CSRF-TOKEN` بفرستد و پس از ورود دوباره توکن CSRF مربوط به کاربر را دریافت کند. ورود با `useCookies=true` یا `useSessionCookies=true` و همهٔ درخواست‌های تغییردهنده با Cookie به CSRF معتبر نیاز دارند. فرانت‌اند Bearer فعلی به این هدر نیاز ندارد. Cookieهای نشست نامعتبر با پاسخ 401 پاک می‌شوند.

| سیاست | پیش‌فرض | تقسیم سهمیه |
| --- | --- | --- |
| `Security:Authentication`؛ همهٔ `/api/auth` شامل ورود، بازیابی و MFA | ۳۰ درخواست در ۶۰ ثانیه | IP واقعی پس از پراکسی مورد اعتماد |
| `Security:Uploads`؛ پیوست و واردکردن Excel خرید/بازرگانی | ۲۰ درخواست در ۶۰ ثانیه | حساب کاربر |
| `Security:Reports`؛ گزارش‌ها | ۶۰ درخواست در ۶۰ ثانیه | حساب کاربر |
| `Security:Backups`؛ export و restore | ۲ درخواست در ۳۰۰ ثانیه | حساب کاربر |

هر سیاست `PermitLimit` مثبت و `WindowSeconds` از ۱ تا ۳۶۰۰ دارد؛ مثلاً `Security__Uploads__PermitLimit`. صف انتظار وجود ندارد؛ پاسخ 429 دارای ProblemDetails و `Retry-After` است. سهمیهٔ ورود برای مقاومت در برابر brute force و سهمیه‌های دیگر برای هزینهٔ I/O و گزارش‌گیری انتخاب شده‌اند و باید با حجم واقعی استفاده تنظیم شوند. سهمیه‌ها در حافظهٔ هر نمونهٔ API نگه‌داری می‌شوند؛ استقرار چند نمونه‌ای به محدودیت هماهنگ در لبه نیاز دارد. heartbeat و عملیات عادی ایجاد/ویرایش تجاری سهمیهٔ جدید ندارند.

**تصمیم نهایی مالک: سامانه خصوصی و دعوتی است.** ثبت‌نام عمومی و تغییر ایمیل توسط خود کاربر حذف شده‌اند؛ تنها Administrator حساب و ایمیل ورود را تعریف می‌کند. مدیر رمز دائمی تعیین نمی‌کند. ایجاد کاربر یک دعوت ایمیلی برای انتخاب رمز می‌فرستد؛ دعوت Data Protection و توکن reset خود Identity دارد، پیش‌فرض ۲۴ ساعت معتبر است و با فعال‌سازی یا صدور مجدد باطل می‌شود. فرم کاربران وضعیت انتظار، ارسال مجدد دعوت و لغو همهٔ نشست‌ها/اعتماد مرورگر را برای مدیر نمایش می‌دهد. کاربران فعال می‌توانند رمز خود را تغییر دهند یا از لینک بازیابی یک‌بارمصرف با اعتبار یک ساعت استفاده کنند. پاسخ بازیابی برای ایمیل ناشناس و شناخته‌شده یکسان است.

ورود همهٔ کاربران عادی با ایمیل و رمز آغاز می‌شود. مرورگر بدون اعتبار، پاسخ 202 حاوی challenge رمزگذاری‌شده دریافت می‌کند؛ کد شش‌رقمی فقط به ایمیل ثبت‌شده ارسال می‌شود. `POST /api/auth/verify-email` با challenge و code توکن عادی و Cookie یادآوری Identity را صادر می‌کند؛ `POST /api/auth/resend-code` challenge جدید می‌دهد. کد با provider ایمیل Identity تولید/بررسی می‌شود؛ کد در بانک یا log ذخیره نمی‌شود. metadata شامل nonce/مهلت/تعداد تلاش و ارسال در جدول موجود `AspNetUserTokens` است. بودجه با ارسال مجدد یا ورود مجدد رمز صفر نمی‌شود. سقف پیش‌فرض OTP ده دقیقه، پنج تلاش، پنج ارسال و فاصلهٔ ارسال ۶۰ ثانیه است (`OtpMinutes`, `OtpMaxAttempts`, `OtpMaxSends`, `OtpResendSeconds` در بخش `Security`). provider ایمیل Identity ممکن است کد را کمی زودتر از سقف ده دقیقه منقضی کند؛ ارسال مجدد برای دریافت کد تازه است و مهلت challenge را افزایش نمی‌دهد. از fingerprint استفاده نمی‌شود. اعتبار مرورگر `HttpOnly`, `SameSite=Strict`, `Secure` در غیر Development و حداکثر ۳۰ روز بدون تمدید لغزان است (`TrustedBrowserDays` قابل کاهش). رابط و API باید در یک site امن مستقر شوند؛ پیشنهاد ساده، یک origin با پراکسی `/api` است. درخواست‌های احراز هویت فرانت‌اند Cookie اعتماد را با `credentials: include` ارسال می‌کنند. Cookie ورود اختیاری علاوه بر مرحلهٔ رمز، برای تأیید OTP هم CSRF معتبر لازم دارد. `GET /api/auth/mfa-status` اجرای روش `email-device` برای همهٔ کاربران را گزارش می‌کند. TOTP انتخاب نشده و Passkey/WebAuthn برای آینده است.

**ارسال ایمیل:** adapter کوچک SMTP با TLS و timeout پانزده ثانیه؛ تنظیمات زیر را فقط از محیط یا تنظیمات محافظت‌شدهٔ استقرار بدهید:

| نام تنظیم محیطی | کاربرد |
| --- | --- |
| `AuthenticationEmail__Host` / `AuthenticationEmail__Port` | میزبان SMTP با STARTTLS؛ پیش‌فرض پورت ۵۸۷ |
| `AuthenticationEmail__UserName` / `AuthenticationEmail__Password` | اعتبار SMTP؛ خارج از سورس |
| `AuthenticationEmail__FromAddress` | فرستندهٔ معتبر |
| `AuthenticationEmail__EnableSsl` | در Production باید `true` باشد |
| `Security__PublicAppOrigin` | origin دقیق HTTPS رابط، عضو `Cors:Origins`؛ مبنای لینک دعوت/بازیابی |

نبود پیکربندی SMTP الزامی در غیر Development مانع شروع برنامه می‌شود. خرابی ارسال کد/دعوت پاسخ امن 503 دارد؛ بازیابی برای جلوگیری از افشای وجود حساب همچنان پاسخ خنثی می‌دهد. لینک‌ها token را در fragment مرورگر دارند؛ رابط fragment را پس از خواندن پاک می‌کند. کلیدهای پایدار Data Protection باید بیرون سورس با دسترسی محدود ذخیره شوند و بین نمونه‌های یک محیط مشترک باشند. application name شامل نام محیط است تا توکن Development در Production معتبر نباشد. تست‌ها sender جعلی دارند و ایمیل واقعی نمی‌فرستند؛ ارسال واقعی SMTP در این محیط آزمایش نشده است.

**ورود خودکار محلی توسعه:** مقدار پایهٔ `Security:DevelopmentAutoLogin:Enabled` برابر false است؛ فایل مخصوص Development آن را صریحاً برای `admin@yarntrade.local` روشن می‌کند. ابتدا SQL محلی و رمز seed قوی را طبق بخش راه‌اندازی در User Secrets تنظیم کنید. `runapp1.bat` محیط Development را روی `localhost:5223` اجرا می‌کند؛ `runapp2.bat` رابط Vite را روی پورت ثابت ۵۱۷۳ اجرا می‌کند. رابط فقط در build توسعه، `GET /api/auth/development-session` را یک بار امتحان می‌کند؛ نشست واقعی حساب مدیر با نقش/اختیارات موجود دریافت می‌شود، بدون رمز، OTP یا SMTP. اگر غیرفعال یا در دسترس نباشد فرم عادی نمایش داده می‌شود؛ خروج باعث ورود خودکار مجدد در همان صفحه نمی‌شود. build تولید هیچ probe خودکاری ندارد.

این امکان به محیط Development، تنظیم صریح، حساب مدیر فعال، اتصال واقعی loopback و Host/Origin محلی محدود است. هدرهای forwarded رد می‌شوند؛ ReverseProxy هم‌زمان با آن قابل فعال‌سازی نیست. پروکسی Vite هدر peer را از socket واقعی بازنویسی می‌کند و مشتری LAN رد می‌شود؛ spoof کردن هدر توسط مرورگر آن را تغییر نمی‌دهد. اعتبار نشست توسعه در هر درخواست دوباره به محلی بودن اتصال وابسته است. روشن بودن flag در هر محیط دیگر startup را متوقف می‌کند و مسیر ورود خودکار در Production پاسخ 404 دارد. fallback تولید یا رمز پنهان وجود ندارد.

خطاهای غیرمنتظره در Production فقط پیام عمومی و `traceId` دارند؛ پیام exception، SQL و مسیر داخلی به کلاینت فرستاده نمی‌شود. رویدادهای ورود، بازیابی، مدیریت MFA و خروج فقط نام عملیات، کد پاسخ و شناسهٔ پیگیری را ثبت می‌کنند. گزارش خطا فقط نوع exception و شناسهٔ پیگیری را ثبت می‌کند. ثبت خام exception/SQL در loggerهای framework مربوط در Production خاموش است. API هدرهای `nosniff` و `no-referrer` و برای مسیرهای `/api` سیاست `no-store` می‌فرستد. در تنظیمات استقرار، ثبت body، Cookie، Authorization و URL/query کامل این مسیرها را در پراکسی یا سامانهٔ پایش روشن نکنید. کلیدهای Data Protection باید با دسترسی محدود خارج از سورس پایدار بمانند؛ حذف آن‌ها توکن‌ها را نامعتبر می‌کند.

## آزمون

```powershell
dotnet test --configuration Release
pnpm --dir frontend build
```

۲۰ آزمون خودکار برای اعتبار 45/75 روز، قیمت توافقی، سررسید وزنی، پرداخت ترکیبی، FIFO/LIFO/میانگین، تخصیص وزن، نرخ ارز، سهم شریک، تسویه و انتقال وضعیت چک وجود دارد.

## واردکردن Excel

`POST /api/purchases/import` فایل `.xlsx` را دریافت می‌کند. فایل اصلی با hash نگه داشته می‌شود، invoice و packing list استخراج می‌شوند، ردیف حمل از موجودی جدا و اختلاف‌های مشکوک به‌صورت warning برگردانده می‌شوند. نگاشت کالا قبل از posting باید توسط اپراتور تأیید شود.

## فرم تعریف اشخاص

منوی «تعریف اشخاص» دارای فرم کامل و گرید جستجو است. کلیدهای `Space`، `Insert`، `Delete`، `F3`، `Esc`، `Home`، `End`، `PgUp`، `PgDn` و جهت‌های بالا/پایین پشتیبانی می‌شوند. نسبت ارتفاع فرم و گرید برای هر کاربر در مرورگر نگه‌داری می‌شود. حذف شخص فقط وقتی مجاز است که هیچ سابقه عملیاتی و هیچ مانده‌ای نداشته باشد. سقف اعتبار شخص هنگام ثبت فروش نسیه کنترل و عبور از آن تنها با تأیید صریح مجاز است.

## قرارداد تاریخ

All business date fields must use the shared SystemDateInput component. Its standard dimensions and behavior must not be overridden per page.

Standard date-entry size is 172 × 33 px, with fixed segment/separator/icon widths. Parent flex/grid layouts must not stretch or compress it. Any future scaling must scale the entire component proportionally, including text, segments, spacing and calendar icon.

همه تاریخ‌های رابط کاربری، مگر فیلدی که صریحاً «میلادی» نام‌گذاری شده باشد، با تقویم شمسی نمایش و ویرایش می‌شوند. تمام فرم‌ها باید از کنترل مشترک `SystemDateInput` استفاده کنند و نوع تقویم را با `calendar="persian"` یا `calendar="gregorian"` مشخص کنند. این کنترل یک فیلد یکپارچه با ترتیب ورود `روز ← ماه ← سال`، پذیرش رقم فارسی/عربی/لاتین، اعتبارسنجی مرحله‌ای، تقویم بازشونده، گزینه امروز و تغییر ماه/سال دارد. اگر کاربر تاریخ پیشنهادی را تغییر نداده باشد یک `Enter` کل تاریخ را تأیید و از آن عبور می‌کند؛ پس از شروع ویرایش، `Enter` هر قسمت را تأیید و به قسمت بعد می‌رود. مقدار تاریخ در API و پایگاه داده همچنان به قالب استاندارد `YYYY-MM-DD` میلادی نگه‌داری می‌شود تا مرتب‌سازی، مقایسه و یکپارچگی داده تغییر نکند.

## Global Trade Form Action Button Standard

### GLOBAL TRADE HARD UI RULE — HARD / NON-NEGOTIABLE UI STANDARD

All form action buttons must remain permanently visible at the bottom of the active form/page.
If form content requires scrolling, only the content area scrolls; the action bar remains fixed/sticky and accessible at all times.
No form may place its primary actions only at the end of scrollable content.
All forms must inherit the shared action-bar implementation; page-specific overrides are prohibited.

Use the shared `shortcut-bar` inside the active `form-tab-pane`. Its sticky positioning, normal-flow space and shared scroll clearance keep the last fields accessible without per-page positioning.

All bottom-form action buttons must follow the Product Definition form visual pattern: the shared `shortcut-bar`, with visible shortcut `<kbd>` above the localized action `<span>`, without per-page button redesigns. Each form displays only the actions valid for its current state. Create/Space uses the standard light-yellow action color (`data-create-action="true"`); Save/F3 uses the standard light-green save color (`primary`, `data-save-action="true"`). Shortcut labels remain untranslated and action typography must remain clearly readable. Display only shortcuts that the action actually supports.

## قرارداد و قواعد کسب‌وکار

قرارداد باید پیش از شروع عملیات تعریف شود و می‌تواند «مالکیت انفرادی» یا «مشارکت یک مالک و یک شریک» باشد. تا پیش از نخستین عملیات، نسخهٔ جاری قابل ویرایش است؛ پس از آن قفل می‌شود و هر تغییر فقط با نسخهٔ اصلاحی و تاریخ اعتبار جدید انجام می‌شود. هر خرید، فروش، سند مالی و تسویهٔ قطعی، شناسهٔ نسخهٔ مؤثر در تاریخ خود را نگه می‌دارد؛ نسخهٔ جدید هیچ محاسبه یا تراکنش تاریخی را تغییر نمی‌دهد. دکمه‌های صفحه بر اساس وضعیت فقط یکی از اقدام‌های معتبر ذخیره، ویرایش یا ایجاد اصلاحیه را نشان می‌دهند.

صفحه از تم و کنترل‌های مشترک استفاده می‌کند. متن‌های آن در سامانهٔ مرکزی زبان برای فارسی، انگلیسی و چینی تعریف شده‌اند؛ فارسی راست‌به‌چپ و دو زبان دیگر چپ‌به‌راست هستند. زبان در حساب هر کاربر ذخیره می‌شود و تنظیم سراسری شرکت نیست. دادهٔ تجاری مانند نام قرارداد یک‌بار ذخیره می‌شود و فقط برچسب‌های رابط ترجمه می‌شوند.

## نکات SQL Server

اتصال SQL در همهٔ محیط‌ها باید رمزگذاری‌شده باشد و گواهی سرور اعتبارسنجی شود. در Production برنامه `Encrypt=True` و `TrustServerCertificate=False` را الزام می‌کند. اگر SQL Server توسعه گواهی قابل‌اعتماد ندارد، ابتدا گواهی/TLS را اصلاح کنید؛ گزینهٔ اعتماد به گواهی نامعتبر را به‌عنوان راه‌حل production فعال نکنید.

## مستندات

- [تحلیل نمونه‌ها](docs/sample-analysis.md)
- [معماری و ERD](docs/architecture.md)
- [محاسبات کسب‌وکار](docs/business-calculations.md)
