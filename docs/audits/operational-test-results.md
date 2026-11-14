# نتایج آزمون ممیزی هستهٔ عملیاتی

**تاریخ:** 2026-11-15 · **شاخه:** `review/br-01b-form-template` · **روش:** بدون اتصال برنامه به DB، بدون migration/seed/posting روی YarnTrade اصلی.

## خلاصهٔ اجرای این نوبت

| مورد | نتیجه | تفسیر |
|---|---|---|
| بررسی ایستا و مسیر کد | انجام شد | کدهای purchase/sale/finance/contract، model، Form Laboratory registry و گزارش‌های معماری خوانده شدند؛ رفتار runtime را ثابت نمی‌کند. |
| SQL واقعی خرید تا فروش روی disposable DB | **اجرا نشد** | `YARN_TRADE_SQL_TEST_CONNECTION` تنظیم نبود. تست harness صریحاً اتصال به `master` می‌خواهد تا DB با نام تصادفی `YarnTrade_A4_Test_<guid>` بسازد؛ بدون اتصال امن و قابل تأیید تست ایجاد نمی‌شود. |
| تلاش build/test هدفمند عادی | **ناموفق/متوقف** | `dotnet test ... --no-restore --filter FullyQualifiedName~BusinessCalculationsTests` به NU1900 در دسترسی NuGet رسید و هنگام کپی `YarnTrade.Api.dll` به دلیل استفادهٔ پردازه‌ای دیگر retry کرد؛ پیش از نتیجه متوقف شد. هیچ pass از این اجرا ادعا نمی‌شود. |
| تلاش اجرای no-build | **ناموفق/متوقف** | بدون roll-forward، testhost گفت .NET 8 نصب نیست (فقط .NET 10 نصب بود). با `DOTNET_ROLL_FORWARD=Major`، testhost تا 90 ثانیه وصل نشد و VSTest لغو شد. نتیجهٔ تست موجود نیست. |
| UI baseline و permission | اجرا نشد | برای اجتناب از اجرای API در پیکربندی Development که می‌تواند auto-migrate/seed داشته باشد، هیچ app process/صفحه‌ای بالا نیامد. |
| مهاجرت یا query زندهٔ SQL در این نوبت | اجرا نشد | هیچ DB write انجام نشد. آخرین شواهد SQL، گزارش قبلی است و باید برای هر تغییر واقعی روی clone بازتأیید شود. |

## ایمنی محیط آزمون

- `src/YarnTrade.Api/Program.cs` در صورت فعال بودن `Database:AutoMigrate` migration را اجرا و در صورت `Seed:Enabled` seed می‌کند؛ `appsettings.Development.json` در گزارش قبلی چنین پیکربندی risk را ثبت کرده است. اجرای برنامه برای smoke test، بدون connection override مستقل و کنترل‌شده، ایمن نبود.
- `A4SqlDatabase` در `tests/YarnTrade.Tests/RowVersionConcurrencyTests.cs` حفاظت مفیدی دارد: connection ورودی باید `InitialCatalog=master` باشد، DB تصادفی می‌سازد، نام پاک‌سازی regex می‌شود، سپس DB اختصاصی را در Dispose حذف می‌کند. متغیر credential-bearing در این نشست نبود؛ مقدار آن هرگز چاپ نشد.
- بنابراین هیچ تستی به `DESKTOP-GPMG5JH / YarnTrade` وصل نشد؛ این DB در گزارش قبلی صرفاً با queryهای read-only بررسی شده بود.

## پوشش سناریوهای خواسته‌شده

| سناریو | وضعیت | مانع/شاهد لازم برای قبولی |
|---|---|---|
| خرید Day 1، نرخ/ارز، supplier/yarn، جمع invoice | Unverified | تست SQL با API واقعی؛ مسیر invoice مستقل از PO وجود دارد ولی قابل اجرا در این نشست نبود. |
| کانتینر و B/L و هزینهٔ چین/ایران | Unverified | ورودی‌های مجزا و مسئول هزینه در موجودیت‌ها هستند؛ posting و allocation روی SQL واقعی نیازمند تست است. |
| receipt واقعی Day 10 و مقدار/انبار | Blocked by implementation | مدل فعلی receipt date/quantity جدا ندارد؛ posting فعلی مقدار invoice را به layer می‌برد. |
| partial/discrepancy و جلوگیری duplicate | Blocked/unverified | workflow مستقل رسید در مدل/کد جاری احراز نشد؛ duplicate posting و idempotency برای receipt وجود قابل آزمون ندارد. |
| Sale Day 15 و منع مصرف receipt روز 20 | **مانع قطعی در سورس** | query inventory layer فروش تاریخ `SaleDate` را به eligibility قید نمی‌کند؛ روی زمان `ReceivedAtUtc` مرتب است. تست SQL مناسب هنوز اجرا نشده. |
| FIFO، cost/profit، concurrency، reversal | Partially implemented, unverified here | allocation و قفل/reversal در `PostingService` و تست‌های A6 موجودند، ولی نیازمند SQL Server disposable است؛ در این نوبت run نشده‌اند. |
| هزینه بعد از receipt/sale | Blocked/unverified | هزینه‌های موجود در posting لحاظ می‌شوند؛ correction/version flow برای هزینهٔ دیررس و sold portion احراز نشد. |
| contract effective date | Source-supported, data-unverified | `ResolveForDateAsync` آخرین نسخهٔ مؤثر را می‌گیرد؛ گزارش زندهٔ قبل zero contract نشان داده است. Gapها و version snapshot باید fixture واقعی داشته باشند. |
| سرمایهٔ شریک، claim، FX و دریافت | Needs owner decisions + test | سندها و ledger پایه هستند؛ قواعد F/DB-06 و Section 12 بازند؛ هیچ عدد مالی نباید فرض شود. |
| Form baseline/approved designs | Static only | inventory و registry خوانده شدند؛ screenshot/runtime/API permission acceptance در این نوبت اجرا نشد. |

## شواهد تست موجود در repository که اجرای تازه نیست

- `tests/YarnTrade.Tests/InventoryConcurrencyTests.cs`, `SalePostingAuthorityTests.cs`, `BusinessCalculationsTests.cs`, `IntegratedStabilizationTests.cs` پوشش‌های موجود برای فروش/cost/concurrency را نشان می‌دهند.
- `tests/YarnTrade.Tests/YarnApprovedDefinitionTests.cs`, `WarehouseDefinitionTests.cs`, `ProductGroupIntegrationTests.cs`, `PersonsFormTests.cs` و `frontend/tests/` بخشی از regressionهای فرم‌های مرجع‌اند.
- وجود/نام تست یا نتایج ثبت‌شدهٔ قدیمی در Master، pass در تاریخ این ممیزی محسوب نمی‌شود.

## پیش‌شرط اجرای دور بعد

1. مالک/اپراتور secret، connection صریح به SQL Server `master` روی instance آزمایش disposable را از طریق محیط محافظت‌شده `YARN_TRADE_SQL_TEST_CONNECTION` فراهم کند؛ target hostname/instance و دسترسی CREATE/DROP از قبل تأیید شود. مقدار secret در log/گزارش چاپ نشود.
2. harness را ابتدا با تست smoke ایجاد DB تصادفی و cleanup اثبات کنید؛ سپس تست‌های خرید/فروش synthetic اضافه/اجرا شوند. در صورت احتمال برخورد نام، از SQL Server آزمایشی جدا استفاده شود.
3. API را فقط با connection همین DB، `Database:AutoMigrate` صریحاً کنترل‌شده برای disposable و seed خاموش/مصنوعی اجرا کنید؛ هیچ environment fallback به User Secrets YarnTrade مجاز نباشد.
4. تا وقتی actual receipt/FIFO اصلاح نشده، سناریوهای Day 10/15/20 را به‌عنوان تست منفی blocker نگه دارید، نه اینکه با timestamp دستکاری‌شده سبز اعلام کنید.
