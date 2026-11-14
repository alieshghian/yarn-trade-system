# ارزیابی پایگاه داده و معماری موروثی

**مبنا:** `009e0f28e71d835e97d8ab94e0c3e6e87d3fee0f`، شاخه `review/br-01b-form-template`
**مرجع نیازها:** `YARN_TRADE_CODEX_MASTER.md`
**دامنه:** بررسی سورس entity/mapping/migrations و مستندات؛ بدون اتصال به SQL زنده.

## معماری قابل مشاهده

Backend در `src/YarnTrade.Api` از ASP.NET Core و EF Core استفاده می‌کند؛ `AppDbContext` ماژول‌های اشخاص/کالا، خرید، سفارش، انبار، فروش، مالی، چک، قرارداد، audit و فرم‌های تعریف را نگاشت می‌کند. UI React/TypeScript در `frontend`. شواهد با monolith ماژولار سازگار است؛ سرویس/DBهای مستقل برای هر ماژول در این بررسی دیده نشد.

## مواردی که باید حفظ شوند

| قابلیت | شواهد | علت حفظ |
|---|---|---|
| ثبت سند در transaction | `Services/PostingService.cs` و `Controllers/FinanceController.cs` | posting سند و آثار مالی/موجودی در یک مرز تراکنش قرار می‌گیرند. |
| retry با execution strategy | `PostPurchaseAsync`, `PostSaleAsync` و posting سند مالی | retry باید با token/قفل‌های فعلی هماهنگ بماند؛ posting دوباره نباید اثر مضاعف تولید کند. |
| RowVersion برای aggregateها | `AppDbContext` و migration `20261006141731_FixSqlRowVersionConcurrency` | کنترل stale update را در اسناد mutable اعمال می‌کند؛ Master قرارداد 400/409 و token 8 بایتی را تشریح می‌کند. |
| قفل و ترتیب تخصیص موجودی | `PostSaleCoreAsync` در PostingService؛ تست‌های `tests/YarnTrade.Tests` | قفل SQL روی کلید انبار/کالا، ترتیب تاریخ/شناسه و lineage تخصیص هزینه؛ تغییرات را با تست real SQL اثبات کنید. |
| دفتر حرکت و تخصیص | `InventoryMovement`, `InventoryLayer`, `SaleCostAllocation` | سابقهٔ موجود برای Kardex و برگشت ارزشمند است؛ OriginLot باید پل افزایشی باشد. |
| قرارداد مؤثر به تاریخ | `BusinessContractVersion`, `BusinessContractService` | برای تاریخچه لازم است قراردادها قبل از ثبت سند پوشش زمانی کامل داشته باشند. |
| ساختار موجودیت‌های خرید | `PurchaseInvoice`, `PurchaseInvoiceItem`, `PurchaseCost`, `PurchaseContainer` | دادهٔ invoice-centric را حفظ و با receipt/shipment توسعه دهید؛ حذف/بازنویسی مانع مهاجرت امن می‌شود. |

## مدل خرید و inventory فعلی

- `PurchaseInvoice` تاریخ فاکتور، تأمین‌کننده، PO اختیاری، مسیر/شرایط، ارز، جمع و وضعیت Draft/Posted/Reversed را نگه می‌دارد.
- `PurchaseInvoiceItem` به فاکتور تعلق دارد و کالا، وزن خالص/ناخالص، تعداد بسته و قیمت را دارد. اتصال اختیاری آن به `ContainerId` است؛ اتصال مستقیم به `PurchaseOrderItem` یا Shipment line در مدل مشاهده‌شده نیست.
- `PurchaseCost` با فاکتور و به‌صورت اختیاری کانتینر/ردیف فاکتور مرتبط است؛ نوع، تاریخ هزینه، ارز/نرخ، مبلغ تبدیل‌شده، مسئول و روش تخصیص دارد. `PurchaseCostAllocation` نیز وجود دارد.
- `PurchaseContainer` زیر فاکتور است. موجودیت‌های Shipment، ShipmentContainer و ContainerLine یا OriginLot در سورس جاریِ بررسی‌شده پیدا نشدند.
- `InventoryLayer` به `PurchaseInvoiceItemId` متصل است؛ `ReceivedAtUtc`, `OriginalQuantity`, `RemainingQuantity` و هزینهٔ واحد را نگه می‌دارد. receipt تاریخ/مقدار مستقل ندارد.
- `InventoryMovement` منبع سند/ردیف، تاریخ فنی، مقدار، هزینه و نوع حرکت دارد؛ insert خرید فعلی در posting ایجاد می‌شود.

## Migrationها و قیود

Migration پایه `20260714111802_InitialCreate` مدل invoice-centric و جداول عملیاتی را می‌سازد؛ `20260727120000_AddPurchaseOrders` سفارش خرید را اضافه و `PurchaseOrderId` nullable را برای فاکتور برقرار می‌کند. این الگوی additive را حفظ کنید؛ Master در DB-02 صریحاً bridge دادهٔ قدیم به Shipment را می‌خواهد، نه حذف داده‌های invoice/container.

قواعد mapping در `Data/AppDbContext.cs` شامل precision اعشاری (معمولاً scale=6 و برای مقادیر IRR scale=2)، FKهای عمدتاً Restrict، و rowversion برای `AuditedEntity` است. ایندکس‌های موجود مسیرهای کالا/انبار/تاریخ layer و حرکت و برخی کلیدهای یکتا را پوشش می‌دهند؛ Master فهرست هدف و ایندکس FIFO را توضیح می‌دهد. فهرست دقیق تمام ایندکس‌های schema زنده در این ممیزی استخراج نشده است.

**ریسک مدل سفارش:** `PurchaseOrder.PreferredSupplierId` nullable است، نه supplier اجباری؛ `PurchaseOrderItem` fulfillment quantity ندارد؛ invoice به PO nullable است و شناسهٔ ردیف سفارش ندارد. کنترل برنامه ممکن است workflow یک فاکتور برای سفارش را اعمال کند، اما قید یکتای DB و مدل چندفاکتوری/partial از mapping بررسی‌شده اثبات نشد. برای partial shipment این دامنه باید توسعه یابد.

**ریسک رابطهٔ برند:** migration `UniqueBrandOwner`/mapping واسط `PersonBrand` قید unique روی `BrandId` دارد. Master توصیف چندبه‌چند دارد. قبل از حذف قید، تعیین cardinality و تکرارهای واقعی باید انجام شود.

## Posting, تاریخ و rollback

`PostPurchaseCoreAsync` فقط Draft را می‌پذیرد، lineهای unmapped/بدون وزن مثبت را رد می‌کند، جمع وزن lineها را با invoice total تطبیق می‌دهد و در invoice-linked PO تأیید Commerce را لازم می‌داند. سپس قرارداد را براساس `InvoiceDate` resolve می‌کند؛ برای هر line یک layer و movement به مقدار `NetWeight` می‌سازد. timestamp رسید/حرکت `DateTime.UtcNow` است. هزینه‌های موجود همان لحظه در unit cost اعمال می‌شوند. invoice را Posted می‌کند و در صورت PO آن را Completed می‌کند. پس مقدار خالص فاکتور، مقدار receipt فرض شده است.

ایمنی transaction و Draft-only از ثبت مضاعف معمول جلوگیری می‌کند؛ این با **قابلیت بازسازی chronology تاریخی** یکی نیست. برای اصلاح سند قطعی‌شده باید الگوی reversal/adjustment lineage دیده شود؛ ویرایش مستقیم layer یا حذف حرکت ممنوع/غیرقابل‌قبول است.

فروش همزمان زیر قفل موجودی است؛ اما ترتیب FIFO از `InventoryLayer.ReceivedAtUtc` می‌آید. بنابراین قفل concurrency مسئلهٔ فروش همزمان را حل می‌کند، نه ورود backdated. reversal فروش movement جدید تولید و مقدار layer را برمی‌گرداند؛ در شواهد مشاهده‌شده replay کامل تاریخچهٔ بعدی انجام نمی‌شود.

## توصیه برای تغییر کم‌هزینه

1. **بدون حذف یا rename** جداول `PurchaseInvoice*`, `PurchaseCost*`, `InventoryMovement`, `InventoryLayer`, allocations و partner ledger.
2. receipt واقعی را به‌عنوان موجودیت/رویداد افزایشی با تاریخ وقوع کسب‌وکار، زمان ثبت، مقدار واقعی، انبار، منبع و سطرها تعریف کنید؛ سپس layer را به receipt line و در ادامه OriginLot bridge کنید.
3. نگاشت Legacy را برای هر سطر invoice و layer در migration/import ثبت کنید؛ تاریخ و مقدار قبلی را حدس نزنید. رکورد نامعلوم باید صف استثنا بگیرد.
4. برای هزینه، وضعیت محاسباتی provisional/final/reopen و ثبت اصلاحات append-only را طراحی کنید؛ هزینهٔ پس از فروش باید اثر اختلاف بر بهای کالای فروش‌رفته/سود/دفتر شریک را مشخص کند.
5. قبل از migration: duplicateها، nullها، FK orphan، جمع وزن و cost، تاریخ‌های غیرواقعی، brand-owner و یکتایی شماره‌های سند را روی نسخهٔ backup اندازه بگیرید.
6. هر migration با backup، row counts، invariant checks، dry-run/import report، rollback plan و تست disposable SQL اجرا شود. در این ممیزی هیچ schema زنده‌ای دیده نشده؛ بنابراین نمی‌توان گفت migrationها روی DB مالک حاضرند.

## بررسی‌های لازم پیش از طراحی migration

- صحت unique indexها و قیدهای DB در برابر دادهٔ موجود، از جمله supplier/order، شماره‌های داخلی و Brand owner.
- تمام FK/delete behavior، ایندکس واقعی با execution plan، و rowversion column در SQL.
- migration history table در DB، مدل EF فعلی، و snapshot به‌صورت سه‌طرفه.
- duplicate receipt/purchase، مقدار منفی/صفر، وزن کسر/اضافه، اسناد Posted با لایهٔ مفقود، layer بدون movement، حرکت بدون منبع معتبر، هزینه allocation و فروش با lineage ناقص.
- قراردادهای مؤثر، تاریخ‌های تقویمی/UTC، currency precision، نرخ FX و mapping partner identity.

## چیزهایی که نباید از سورس نتیجه‌گیری قطعی کرد

هیچ ادعایی دربارهٔ migration اجراشده روی DB مالک، رکوردهای واقعی، سطح fragmentation یا عملکرد production مطرح نمی‌شود. تست‌های SQL/transaction ثبت‌شده در Master شواهد تاریخچهٔ توسعه‌اند؛ اجرای مجدد در این ممیزی انجام نشد.
