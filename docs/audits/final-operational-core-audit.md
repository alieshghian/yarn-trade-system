# ممیزی نهایی هستهٔ عملیاتی Yarn Trade

**تاریخ:** 2026-11-15
**شاخه و سورس بررسی‌شده:** `review/br-01b-form-template`, HEAD پیش از این گزارش `b3a7afeb281dd046820348ef7fbaf47f8f3e7422` (در این نوبت فقط اسناد ممیزی قبلی در commit بود؛ کد تغییری نکرد).
**مرجع نیاز:** [`YARN_TRADE_CODEX_MASTER.md`](../../YARN_TRADE_CODEX_MASTER.md).
**حدود:** ممیزی ایستا، بررسی گزارش read-only SQL قبلی و تلاش محدود تست. هیچ feature، migration، فرم تأییدشده، یا دادهٔ DB تغییر نکرد. هیچ merge به `master` انجام نشد.

## نتیجهٔ اجرایی

سامانه یک هستهٔ عملیاتی واقعی دارد: ثبت Draft خرید/فروش، posting اتمیک با نسخهٔ قرارداد، دفتر حرکت موجودی، layer هزینه، تخصیص FIFO/LIFO/میانگین در فروش، سند مالی/چک و اجزای ledger شریک. تراکنش، retry، RowVersion و قفل SQL فروش از دارایی‌های مهم‌اند و بازنویسی کلی توجیه ندارد.

اما گردش خرید تا فروشِ موردنیاز مالک هنوز به‌صورت یک عملیات پیوسته و تاریخ‌درست قابل اعتماد نیست. posting خرید مقدار فاکتور را همان لحظه به‌عنوان دریافت انبار ثبت می‌کند و `ReceivedAtUtc` و تاریخ حرکت را با زمان جاری می‌سازد. فروش براساس زمان دریافت فنی layerها را قفل و تخصیص می‌دهد، نه براساس تاریخ مؤثر واقعی receipt. در نتیجه backdated sale می‌تواند از موجودی که از نظر تاریخ هنوز دریافت نشده مصرف کند. رسید مستقل، دریافت جزئی/اختلاف، OriginLot، اصلاح نسخه‌دار landed-cost و claim lifecycle کامل در کد/مدل فعلی احراز نشد.

طبق تصمیم قطعی همین درخواست، این مسئله **به سیستم تاریخچهٔ جدا نیاز ندارد**. راهبرد باید همان سندهای روزمره با تاریخ مؤثر واقعی، جریان واحد، ورود زمانی مرتب و ضوابط posting پایدار باشد. در catch-up اولیه مالک نیز کار را به ترتیب خرید/رسید، فروش و تراکنش مالی وارد می‌کند؛ این ترتیب عملیاتی خطر را کم می‌کند ولی جای فیلتر تاریخ در inventory authority را نمی‌گیرد.

## شواهد و اطمینان

- خواندن جریان‌های کد/صفحه/رجیستری با CodeGraph و مسیرهای موجود؛ فایل‌ها در بخش منابع و [ماتریس انطباق](master-compliance-matrix.md) آمده‌اند.
- گزارش SQL زندهٔ قبلی [`live-sql-schema-verification.md`](live-sql-schema-verification.md): SQL Server `DESKTOP-GPMG5JH / YarnTrade`, 30 migration همگام، 62 جدول/688 ستون متناظر با snapshot EF، اختلاف type سه ستون YarnItems، و وضعیت/تعدادهای تجمیعی. آن بررسی روی baseline `f5e2144a5cb831a5ff1f784d46b8e6c334dfd273` بوده؛ در این turn دوباره به DB وصل نشدم، پس آن را راستی‌آزمایی مجدد برای HEAD امروز نمی‌نامم.
- گزارش فرم [`operational-forms-inventory.md`](operational-forms-inventory.md) و گزارش‌های قبلی gap/readiness؛ UI زنده در این turn اجرا/تصویرسنجی نشد.
- هیچ SQL test connection در environment موجود نبود. harness تست SQL متغیر `YARN_TRADE_SQL_TEST_CONNECTION` می‌خواهد و صریحاً فقط connection به `master` را قبول می‌کند تا دیتابیس تصادفی disposable بسازد؛ بنابراین تست posting اجرا نشد.
- تلاش `dotnet test` عادی به قفل فایل `YarnTrade.Api.dll` توسط پردازهٔ دیگری و دسترسی نداشتن به NuGet vulnerability feed رسید. اجرای no-build با .NET 8 runtime موجود نبود؛ با `DOTNET_ROLL_FORWARD=Major` testhost پس از 90 ثانیه handshake نکرد و لغو شد. این تلاش‌ها pass محسوب نمی‌شوند؛ جزئیات در [نتایج آزمون](operational-test-results.md).

## وضعیت جریان عملیاتی

| مرحله | وضع فعلی | مانع/ریسک اثبات‌شده |
|---|---|---|
| فاکتور خرید، مستقل از PO | API در `/api/purchases` و مدل invoice-centric موجود است؛ `PurchaseOrderId` اختیاری است. | صفحهٔ مستقل کامل خرید در Catalog `partial` است؛ تجربهٔ اصلی فعلی `CommercePage` است. |
| کانتینر و B/L | container و تخصیص item/container، B/L و اسناد پیوست وجود دارند. | رابطهٔ shipment/container line عمومی و دریافت‌های واقعی مرحله‌ای احراز نشد. DB گزارش‌شده `PurchaseItemContainers=0` دارد. |
| هزینهٔ چین/ترخیص | `PurchaseCost` تاریخ/ارز/نرخ/مسئول/مبنای تخصیص دارد؛ هزینه‌های حاضر در purchase posting به layer وارد می‌شوند. | allocation فعلی در حافظه محاسبه می‌شود و جدول `PurchaseCostAllocation` در مسیر جاری پر نمی‌شود؛ lifecycle دیررس/finalize/reopen اثبات نشده است. |
| رسید واقعی | posting موجودی موجود است. | سند receipt و تاریخ/مقدار واقعی مجزا وجود ندارد؛ فاکتور مساوی receipt فرض می‌شود. |
| layer و حرکت | `InventoryLayer`, `InventoryMovement`, lineage فروش و گزارش‌ها وجود دارند. | زمان حرکت/رسید خرید زمان جاری است؛ ثبت اختلاف مقدار و چند receipt وجود ندارد. |
| فروش و FIFO | authority سمت سرور، SQL range locks، ترتیب قطعی، snapshot هزینه و reversal lineage وجود دارند. | شرط صلاحیت layer بر اساس `SaleDate` نیست؛ تاریخ layer با زمان فنی ثبت می‌شود. |
| قرارداد و شریک | `BusinessContractVersion`, `PartnerShareRule`, ledger و settlement وجود دارند. | DB قبلی صفر قرارداد/Investor/ledger داشته؛ نسخهٔ مؤثر لازم است. claim lifecycle سرمایه و طلب مستقل و کامل نیست؛ بخشی از قواعد هنوز تصمیم مالک می‌خواهند. |
| وجه/چک | MoneyDocument، Check identity و CheckOperation وجود دارند. | تخصیص چند دریافت به schedule/فروش و oldest-first/credit اضافه احراز نشد؛ جمع ماندهٔ Person به‌تنهایی allocation نیست. |

## تصمیم پیشنهادی برای کمترین هزینهٔ امن

1. مسیر جدید «حالت تاریخی» نسازید. خرید، receipt، فروش و هزینه در یک دامنهٔ واحد با تاریخ سند مؤثر و timestamp فنی جدا مدل شوند.
2. اولین بستهٔ توسعه پس از تصمیم مالک: receipt واقعی مستقل از invoice و اتصال lineage به layer، همراه با تاریخ FIFO. تا آن زمان posting خرید موجود فقط برای جریان فعلی با درک محدودیتش مناسب است و catch-up واقعی را نباید روی آن قطعی کرد.
3. حفظ compatibility endpoint و مدل‌های فعلی: migration افزایشی، نه تغییر معنای خاموش `Posted` یا بازنویسی `ReceivedAtUtc` قدیمی.
4. ابتدا disposable SQL Server و synthetic scenarios؛ سپس reconciliation یک خرید–دو رسید–فروش–هزینه. DB عملیاتی/اصلی هرگز test target نباشد.
5. Partner claim/FX فقط بعد از تصویب خروجی سناریوهای Master DB-06 و تصمیم‌های §12. قواعد مالی حدس زده نشود.

## محدودیت‌ها

به‌علت نبود SQL test connection، واقعیت زندهٔ DB در این گزارش از گزارش قبلی نقل شده و روی HEAD جاری دوباره اجرا نشده است. آزمون‌های posting، migration، runtime/UI، مجوزهای کاربر واقعی، query plan و load concurrency این بار اجرا نشدند. هر یافتهٔ مربوط به این‌ها در گزارش به‌عنوان مانع تأیید، نه pass، ثبت شده است. هیچ اطلاعات شخصی یا credential از DB استخراج/درج نشده است.

## اولین بستهٔ اجرایی پیشنهادی

**WP-00 (تصمیم تاریخ/receipt/کسری و سناریوهای مالک) سپس WP-01 (restore اثبات‌شده روی clone و manifest اسناد)**، و بعد از آن WP-02/WP-03: طراحی افزایشی receipt تاریخ‌دار مستقل از PO/fاکتور و آزمون آن روی disposable SQL. جزئیات وابستگی و معیارها در [اولویت‌بندی](implementation-priority-plan.md) است.

## منابع کد/مستند

- `src/YarnTrade.Api/Services/PostingService.cs`
- `src/YarnTrade.Api/Controllers/PurchasesController.cs`, `CommerceController.cs`, `SalesController.cs`, `FinanceController.cs`
- `src/YarnTrade.Api/Services/BusinessContractService.cs`, `PersonAccountService.cs`, `BusinessCalculations.cs`
- `src/YarnTrade.Api/Domain/Entities.cs`, `src/YarnTrade.Api/Data/AppDbContext.cs`, `src/YarnTrade.Api/Data/Migrations/`
- `frontend/src/CommercePage.tsx`, `frontend/src/components/base-form/operationalFormCatalog.ts`, `frontend/src/components/base-form/formIntegrationRegistry.ts`
- `docs/audits/live-sql-schema-verification.md`, `operational-forms-inventory.md`, `historical-data-readiness.md`, `yarn-trade-master-gap-audit.md`
