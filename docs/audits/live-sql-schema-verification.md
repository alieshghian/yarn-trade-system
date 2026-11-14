# راستی‌آزمایی زندهٔ SQL Server — Yarn Trade

**تاریخ بررسی:** 2026-11-15
**شاخه:** `review/br-01b-form-template`
**مبنای گزارش‌های قبلی:** `f5e2144a5cb831a5ff1f784d46b8e6c334dfd273`
**مرجع نیازها:** [`YARN_TRADE_CODEX_MASTER.md`](../../YARN_TRADE_CODEX_MASTER.md)
**روش:** فقط اتصال خواندنی و queryهای `SELECT` روی کاتالوگ SQL و شمارش‌های تجمیعی؛ بدون `INSERT`, `UPDATE`, `DELETE`, DDL، migration یا posting.

## خلاصه

اتصال واقعی از User Secrets پروژه (بدون چاپ یا ثبت رشته اتصال) به SQL Server محلی تأیید شد: **host/server `DESKTOP-GPMG5JH` (default instance)، database `YarnTrade`، نسخهٔ SQL `16.0.1000.6`**. تاریخچهٔ DB شامل ۳۰ migration و تا آخرین migration موجود در branch یعنی `20261113000000_YarnApprovedDefinition` است.

مجموعهٔ نام جداول و ستون‌های برنامه در SQL با snapshot جاری EF یکی است: ۶۲ جدول برنامه و ۶۸۸ ستون؛ جدول `__EFMigrationsHistory` جداگانه وجود دارد. اختلاف type در سه ستون قدیمی نخ مشاهده شد: مدل EF اندازهٔ محدود می‌خواهد، ولی SQL همچنان `nvarchar(max)` دارد. ۵۱ FK فعال و مورداعتماد، ۱۰ check constraint فعال و مورداعتماد و ۲۳ ستون `rowversion` وجود دارد. قیدهای یکتای کلیدی بررسی‌شده فعال‌اند و duplicate group در همان کلیدها پیدا نشد.

اما این DB هنوز baseline عملیاتی تاریخچه نیست: هر سه فاکتور خرید و هر سه فروش Draft هستند، هیچ layer یا movement موجودی، هیچ ثبت دفتر شریک و هیچ نسخهٔ قرارداد وجود ندارد. به همین دلیل دادهٔ تاریخی هنوز در DB ثبت/تطبیق نشده و posting خرید/فروش با قواعد فعلی عملیاتی نمی‌شود. یک فاکتور Draft نیز در جمع header و line در چهار معیار مغایرت دارد.

## هویت و روش اتصال

- هدف اتصال از تنظیم محلی برنامه خوانده شد؛ credential یا رشته اتصال در خروجی یا این گزارش درج نشده است.
- SQL Server برگشتی از خود سرور و database برگشتی از `DB_NAME()` با هدف برنامه تطبیق داشتند.
- queryهای metadata از `sys.*` و شمارش‌های تجمیعی استفاده کردند. دادهٔ نام/شمارهٔ اشخاص، حساب بانکی، چک، فایل پیوست یا محتوای فاکتورها استخراج نشد.
- در اجرای Development، تنظیمات پروژه `Database:AutoMigrate=true` و `Seed:Enabled=true` دارند. API را برای این ممیزی اجرا/راه‌اندازی نکردم تا auto-migrate یا seed احتمالی اجرا نشود.

## Migration و تطبیق EF با SQL

| کنترل | نتیجهٔ زنده |
|---|---|
| تعداد migrationهای سورس در `src/YarnTrade.Api/Data/Migrations` | ۳۰ |
| تعداد رکوردهای `dbo.__EFMigrationsHistory` | ۳۰ |
| اولین / آخرین migration | `20260714111802_InitialCreate` / `20261113000000_YarnApprovedDefinition` |
| EF ProductVersion در history | `8.0.28` برای رکوردهای بررسی‌شده |
| جداول | ۶۲ جدول در snapshot و ۶۲ جدول برنامه در SQL؛ به‌علاوهٔ جدول migration history |
| نام ستون‌ها | ۶۸۸ property ستون‌دار در snapshot و ۶۸۸ ستون SQL؛ ۰ ستون مفقود و ۰ ستون اضافه |
| SQL objectهای دیگر | ۰ view و ۰ stored procedure غیرسیستمی در DB |

**مقایسهٔ type/length:** مقایسهٔ `HasColumnType(...)` در model snapshot با `sys.columns/sys.types` تطبیق کامل ۶۸۵ ستون از ۶۸۸ ستون را نشان داد. سه مورد اختلاف، همگی در `YarnItems` هستند:

| ستون | snapshot/model EF | SQL زنده | دادهٔ موجود در اندازهٔ مدل جا می‌شود؟ |
|---|---|---|---|
| `Code` | `nvarchar(50)` | `nvarchar(max)` | بله؛ ۲ ردیف، بیشترین طول ۱۳، هیچ مورد بالای ۵۰ نیست |
| `NameFa` | `nvarchar(200)` | `nvarchar(max)` | بله؛ بیشترین طول ۲۰، هیچ مورد بالای ۲۰۰ نیست |
| `NameEn` | `nvarchar(200)` | `nvarchar(max)` | بله؛ بیشترین طول ۲۷، هیچ مورد بالای ۲۰۰ نیست |

این اختلاف به معنی دادهٔ فعلی خراب نیست؛ SQL از مدل محدودتر است. محتمل‌ترین توضیح این است که migration تأیید نخ فقط فیلدهای جدید/تغییریافتهٔ دیگر را تبدیل کرده و این سه ستون legacy را محدود نکرده است. پیش از اصلاح، migration history و مقادیر واقعی دوباره اندازه‌گیری شوند؛ `nvarchar(max)` ممکن است intentional backward-compatibility باشد. هیچ migration یا تغییر schema در این نوبت اعمال نشد.

### کلیدها، indexها، نوع‌ها و قیود

- **Foreign key:** تعداد ۵۱؛ هیچ‌کدام disabled یا untrusted نبود. ۱۲ رابطه `CASCADE` (برای childهای owned و Identity)، ۳۹ رابطه `NO_ACTION` (رفتار Restrict در EF) ثبت شده‌اند.
- **Unique index:** ۱۰۴ مورد با احتساب primary keyها. بررسی indexهای business identifier نشان داد unique enforcement در SQL حاضر است: کد شخص و برند، کد/نام نخ، شماره فاکتور داخلی، شماره سفارش، شماره فروش، شماره سند مالی، کد انبار، نسخهٔ قرارداد و کلیدهای تنظیم‌شدهٔ دیگر.
- **Duplicate groups:** در `InternalNumber`, شمارهٔ فاکتور خارجی، `OrderNumber`, `SaleNumber`, `DocumentNumber`, `YarnItems.Code`, `YarnTypes.Code` و `Warehouses.Code` هیچ duplicate group نبود. این نتیجه فقط دربارهٔ کلیدهای فهرست‌شده است.
- **RowVersion:** ۲۳ ستون SQL نوع `timestamp` دارد؛ یک ستون در هر جدول audited شامل اسناد خرید/فروش، هزینه، master data، قرارداد، انبار و نسخه/تعریف نخ.
- **Check constraint:** ۱۰؛ همه فعال و مورداعتماد، شامل محدودیت طبقهٔ انبار، location، عمق گروه کالا، مثبت‌بودن CBM و ارز investor balance.
- **Precision/typeهای پرتکرار:** `decimal(12,8)` برای درصدها (۱۳ ستون)، `decimal(20,2)` (۲۹ ستون)، `decimal(20,6)` (۵۹ ستون)، `date` (۲۶ ستون)، `datetime2(27,7)` (۶۶ ستون). این نمونه‌ها با قاعدهٔ mapping در `AppDbContext` سازگارند.

**تفاوت معنایی مهم، نه drift تصادفی:** `PersonBrands` دارای unique index روی `BrandId` است؛ بنابراین یک برند فقط به یک Person نسبت داده می‌شود. این با متن Master دربارهٔ رابطهٔ چندبه‌چند Persons/Brands ناسازگار است. در DB فعلی `PersonBrands` صفر رکورد دارد، پس conflict داده‌ای موجود مشاهده نشد؛ قاعدهٔ کسب‌وکار مالک باید پیش از تغییر index تأیید شود.

## حجم داده و وضعیت واقعی اسناد

فقط count و وضعیت سند گزارش می‌شود؛ هیچ رکورد فردی در خروجی نگه‌داری نشده است.

| جدول/محدوده | تعداد / وضعیت مشاهده‌شده |
|---|---:|
| Persons / Brands / PersonBrands | ۱۱ / ۸ / ۰ |
| ProductGroups / YarnItems | ۲۸۹ / ۲ |
| Warehouses / WarehouseZones | ۵ / ۵ |
| PurchaseOrders / PurchaseOrderItems | ۲ / ۲؛ هر دو سفارش `InCommerce` |
| PurchaseInvoices / PurchaseInvoiceItems | ۳ / ۳؛ هر ۳ فاکتور `Draft` |
| PurchaseContainers / PurchaseItemContainers | ۳ / ۰ allocation؛ lineها نیز `ContainerId` ندارند |
| PurchaseCosts / PurchaseCostAllocations | ۰ / ۰ |
| InventoryLayers / InventoryMovements | ۰ / ۰ |
| Sales / SaleItems / SalePaymentSchedules | ۳ / ۳ / ۴؛ هر ۳ فروش `Draft` |
| SaleCostAllocations | ۰ |
| MoneyDocuments / MoneyDocumentLines | ۲ / ۳؛ یکی Receipt و یکی Payment، هر دو `Draft` |
| Checks / CheckOperations | ۱ چک `Received` / ۰ عملیات تاریخچه |
| PartnerLedgerEntries / ShareRules | ۰ / ۳ |
| PartnerSettlements / allocations / advance allocations | ۱ `Draft` / ۰ / ۰ |
| BusinessContractVersions / Investors / InvestorBalances / ExchangeRates | ۰ / ۰ / ۰ / ۰ |
| PriceLists / PriceListItems / CreditRateRules / Attachments | ۱ / ۱ / ۴ / ۱ |

سه purchase invoice همگی Draft هستند؛ یک مورد در header در برابر جمع lineها، برای GoodsTotal، net/gross weight و تعداد بسته مغایرت دارد. اختلاف قدرمطلق GoodsTotal آن **113,893.43 USD** است. این مورد پیش از هرگونه posting باید ریشه‌یابی شود؛ چون سند Draft است، اثر ثبت قطعی/موجودی مشاهده نشد. جمع GrandTotal در برابر `GoodsTotal + InternationalFreight + OtherForeignCosts` برای همهٔ فاکتورها مغایرت نداشت.

همهٔ checkهای منطقی orphan که قابل اجرا بودند صفر بودند: invoice line بدون parent، referenceهای دارای مقدار به Yarn، layer→invoice line، movement→warehouse/yarn، sale allocation→line/layer، schedule/money line/check/sale/settlement، check→sale، settlement allocation→ledger و partner-ledger source. این نتیجه در DB فعلی با تعداد زیاد جداول خالی تفسیر شود؛ قید واقعی FKهای فعال نیز رابطه‌های declarative را محافظت می‌کند.

## تطبیق مستقیم با پنج گزارش ممیزی

| گزارش پیشین | نتیجهٔ زنده |
|---|---|
| `yarn-trade-master-gap-audit.md` | M2/M3 و تاریخ receipt/FIFO همچنان شکاف معماری‌اند. نبود Shipment/Receipt/OriginLot در SQL فعلی تأیید شد. |
| `legacy-database-assessment.md` | اسکلت invoice-centric و FK/RowVersion موجود تأیید شد؛ DB history تا migration نخ sync است. تفاوت واقعی typeهای سه ستون Yarn اضافه شد. |
| `operational-forms-inventory.md` | ProductGroups و YarnItems به‌طور واقعی در DB وجود دارند؛ این فقط اثبات schema/data count است، نه تأیید بصری runtime یا تطبیق کامل فرم با design JSON. |
| `historical-data-readiness.md` | مشکل تاریخ رسید و مقدار actual فقط فرض سورس نبود: schema هیچ تاریخ/جدول receipt مستقلی ندارد؛ DB نیز هیچ layer/movement ثبت‌شده ندارد. BusinessContractVersions صفر است، پس سرویس posting بدون نسخهٔ قرارداد مؤثر exception می‌دهد. |
| `cleanup-candidates.md` | فایل‌ها بررسی/حذف نشدند؛ این وظیفه صرفاً DB بود. فایل SQL یا backup محلی اجرا/بازخوانی نشد. |

## آمادگی ورود دو سال تاریخچه

| نیاز | وضعیت تأییدشده | نتیجه برای استفاده |
|---|---|---|
| ثبت backdated invoice | `PurchaseInvoices.InvoiceDate` نوع SQL `date` دارد و مسیر خرید بدون PO وجود دارد | تاریخ فاکتور را می‌توان مدل کرد؛ ولی این به معنی حفظ تاریخ receipt در FIFO نیست. |
| Actual dated warehouse receipt | جدول/ستون receipt جداگانه در schema نیست | **مانع تأییدشده**؛ دریافت واقعی و تاریخ آن مدل نشده است. |
| Partial receipt/discrepancy | PO line فاقد received quantity است، invoice line به PO item/shipment line وصل نیست؛ `PurchaseItemContainers` خالی است | **مانع تأییدشده برای مدل فعلی**؛ workflow receipt کسری/مرحله‌ای مستقل وجود ندارد. |
| Chronological FIFO | لایه از `ReceivedAtUtc datetime2` مرتب می‌شود؛ در posting جاری سورس آن زمان ثبت است | **مانع تأییدشده در کد و schema** برای ورود دیرهنگام تاریخچه؛ timestamp فنی واقعی دریافت نیست. |
| هزینه دیررس/landed-cost adjustment | `PurchaseCosts.CostDate` و allocation tables وجود دارند؛ داده‌ای در آن‌ها نیست؛ Master endpoint مستقل برای تغییر PurchaseCost را نفی می‌کند | مدل مقدار هزینه دارد، ولی اثر append-only/بازگشایی بر layer و فروش‌های قبلی از رفتار زنده اثبات نشده؛ قبل از استفاده نیازمند طرح اصلاح است. |
| انتخاب نسخهٔ قرارداد تاریخی | `BusinessContractVersions.EffectiveFrom date`, FK سند به نسخه و unique version index وجود دارد | کد انتخاب نسخه بر تاریخ را پشتیبانی می‌کند، اما **در DB صفر نسخه است**؛ سرویس `ResolveForDateAsync` در نبود قرارداد صریحاً posting را متوقف می‌کند. |
| Partner capital/claim | دفتر شریک/تسویه و قواعد share schema موجود است | در DB ledger صفر و contract صفر؛ claim lifecycle کامل در schema نیست؛ reconciliation تاریخی انجام‌پذیر فرض نشود. |
| فروش تاریخی | `Sales.SaleDate` و line/schedule وجود دارند | هر سه فروش Draft و موجودی صفر است؛ posting تاریخی فعلاً قابل اتکا نیست. |
| دریافت/چک تاریخی | money documents، lines و check/status وجود دارند | دو سند وجه Draft، یک چک بدون عملیات؛ oldest-first invoice allocation به شکل مستقل اثبات نشد. |
| Duplicate posting | سندها status دارند؛ posting در سورس Draft-only، transaction/retry و concurrency کنترل می‌شود؛ unique شماره سند در DB حاضر است | نقطهٔ قوت معماری؛ ولی real posting روی DB فعلی عمداً اجرا نشد. |
| Opening/closing reconciliation | layer/movement/ledger صفرند | موجودی افتتاحیه یا ماندهٔ تاریخچه‌ای ثبت‌شده‌ای مشاهده نشد؛ مسیر آغاز موجودی/تطبیق باید جداگانه طراحی/تأیید شود. |

## نقاط قوتی که باید حفظ شوند

1. جدول‌های invoice-centric فعلی و روابطشان دست‌نخورده بمانند؛ ۵۱ FK حاضر همگی معتبرند.
2. indexهای FIFO با کلید `(WarehouseId,YarnItemId,ReceivedAtUtc)` و movement با `(WarehouseId,YarnItemId,MovementDateUtc)` حفظ و با execution plan واقعی workload دوباره ارزیابی شوند.
3. Unique indexهای شماره سند/کالا/انبار و RowVersionهای SQL حفظ شوند؛ tokenها در صورت توسعهٔ aggregate همچنان مرز stale-write باشند.
4. Cascade فقط برای اجزای owned (items, lines, schedules, allocations) و Restrict برای ارجاع‌های مستر/سند حفظ شود؛ cascadeهای دقیق قبل از migration دوباره فهرست شوند.
5. Check constraints فعال، گروه کالای version/request uniqueness، محدودهٔ طبقه، مثبت‌بودن CBM و indexهای reference نخ بخشی از حفاظت‌های مفید schema هستند.
6. transaction و retry در posting، لاگ ledger/reversal و lineage `SaleCostAllocation` را حذف یا با update مستقیم داده جایگزین نکنید.

## اصلاح افزایشی پیشنهادی

1. **قبل از اولین دادهٔ واقعی:** یک snapshot backup قابل restore در محیط آزمایشی و baseline عددی/کنترلی ایجاد کنید. گزارش فعلی فقط خواندنی است و backup اجرا نکرده است.
2. **پاک‌سازی دادهٔ Draft:** فاکتور مغایر 113,893.43 USD را با سند منبع تطبیق دهید؛ هیچ رکوردی را خودکار اصلاح/حذف نکنید. همهٔ Draftهای موجود را با مالک مشخص کنید که نمونه، تمرین یا سند واقعی‌اند.
3. **قرارداد و نرخ‌ها:** نسخه‌های قرارداد تاریخی، طرف‌ها/سرمایه، FX و قواعد قیمت/اعتبار را از اسناد مالک تعیین و قبل از posting پوشش تاریخ‌ها را بررسی کنید. اکنون contract و ExchangeRates صفر است.
4. **مدل receipt افزایشی:** رسید جدا از invoice با `ReceivedDate` (تاریخ کسب‌وکار)، ثبت فنی، انبار، line، مقدار واقعی، وضعیت و سند اختلاف اضافه شود؛ امکان چند receipt برای یک invoice و رابطه به lot/layer حفظ شود.
5. **Chronology و catch-up staging:** تاریخ واقعی رسید باید مبنای FIFO باشد؛ ابتدا dry-run chronological import روی clone و گزارش مقایسهٔ موجودی/فروش/هزینه بسازید. replay یا backfill نباید زمان فنی `PostedAtUtc` را دستکاری کند.
6. **Landed cost:** هزینهٔ دیررس با ثبت تغییرات قابل ردیابی، allocation نسخه‌دار و اثر روشن بر layer باقی‌مانده و فروش مصرف‌کننده طراحی شود؛ final/reopen مطابق Master و سناریوهای مالک باشد.
7. **Partner/receipts:** ابتدا تصمیم‌های عددی Master، سپس تفکیک سرمایه از claim و تخصیص receipt/check به فاکتور/مانده (oldest-first default) بسازید.
8. **Yarn type drift:** migration جداگانه فقط پس از بررسی طول و قرارداد API/UI؛ داده‌های فعلی در حد طول هدف‌اند، اما source data set کوچک است. پایداری backward compatibility را بررسی کنید.
9. **Pilot و go/no-go:** چند تراکنش نماینده (کسری receipt، هزینهٔ دیررس، فروش، دریافت نقد/چک، برگشت) در DB disposable/clone اجرا و تراز موجودی/مالی با مرجع مالک تطبیق شود. در این ممیزی هیچ posting test روی DB واقعی انجام نشد.

## محدودیت‌ها

- queryهای انجام‌شده فقط SELECT بودند؛ migration/update/insert/delete/backup/restore/repair اجرا نشد.
- comparison خودکار name/column/type با snapshot شد؛ تطبیق مستقل تمام nullable/default/collation/computed semantics تک‌تک ۶۸۸ ستون گزارش نشده است. اختلاف‌های یافت‌شده را می‌توان با metadata schema تکمیل کرد.
- شمارش‌ها snapshot همان لحظه‌اند و ممکن است با تغییر برنامه/کاربر عوض شوند.
- بررسی orphanهای polymorphic فقط برای نوع‌های شناخته‌شدهٔ موجود در جدول‌های خالی/کم‌داده انجام شد؛ از صفر بودن orphan، صحت دادهٔ تاریخی خارج از DB نتیجه نمی‌شود.
- تست posting، API و runtime UI اجرا نشد. نتیجهٔ نبود قرارداد برای توقف posting بر سورس `BusinessContractService.ResolveForDateAsync` و count صفر زنده تکیه دارد.
- پیکربندی backup/restore production و دسترسی‌های عملیاتی راستی‌آزمایی نشد.
