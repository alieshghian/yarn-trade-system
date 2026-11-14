# آمادگی ورود تاریخچهٔ خرید و فروش

**نتیجهٔ اولیه:** در وضعیت فعلی ورود واقعی و گستردهٔ دو سال داده به posting عملیاتی، برای موجودی و FIFO تاریخی ایمن نیست. ابتدا باید receipt/date/quantity و روش تطبیق مشخص و پیاده شود.

## مسیر هدف مالک و پشتیبانی فعلی

| گام مورد نظر | وضعیت فعلی در کد | مانع/توضیح |
|---|---|---|
| خرید تاریخی بدون سفارش | API `POST /api/purchases` و ویرایش/ورود فایل در `PurchasesController` موجود؛ `PurchaseOrderId` اختیاری است | مسیر API مستقل وجود دارد؛ Catalog آن را partial می‌داند و UI مستقل کامل نیست. دسترسی و نتیجهٔ واقعی در runtime بررسی نشد. |
| هزینهٔ خرید/ترخیص | `PurchaseCost` با تاریخ، نرخ، ارز، شریک مسئول، تخصیص و فایل اختیاری به invoice تعلق دارد | در posting فعلی هزینه‌های موجود اعمال می‌شود. Master می‌گوید برای PurchaseCost endpoint تغییر مستقل وجود ندارد؛ lifecycle provisional/final/reopen و ثبت هزینهٔ پس از posting فعلی نیست. |
| رسید واقعی انبار | posting خرید `warehouseId` می‌گیرد و layer/movement می‌سازد | سند رسید جدا، تاریخ رسید کسب‌وکار و مقدار actual مستقل مشاهده نشد. `NetWeight` فاکتور به‌عنوان مقدار موجودی مصرف می‌شود. اختلاف دریافت مستقل از مقایسهٔ PO ثابت نشده است. |
| landed cost و FIFO | `InventoryLayer` و FIFO فروش موجودند | هزینه در لحظهٔ purchase posting به layer وارد می‌شود؛ chronology layer بر `ReceivedAtUtc` جاری است. هزینهٔ دیررس و اصلاح layer فروخته‌شده مسیر مستند ندارد. |
| سهم سرمایه/طلب شریک | ledger، share rules و settlement وجود دارند | PartnerLedgerEntry موجودی ورود/اعتبار است، اما claim lifecycle کامل و جدا از capital مطابق F3 در دادهٔ جاری احراز نشد؛ تصمیم‌های عددی Master باز هستند. |
| فروش تاریخی | `/api/sales` و posting فروش موجود، تخصیص لایه و snapshot هزینه دارد | نیازمند layerهای درست قبل از آن است. `SaleDate` قرارداد/محاسبات را انتخاب می‌کند ولی زمان مصرف layer به ترتیب ثبت/ReceivedAtUtc وابسته است. |
| وجه و چک | money document، Check identity/status/history و posting/transition موجود است | `MoneyDocumentLine.SaleId` اختیاری است؛ مدل تخصیص چندفاکتوری oldest-first و credit اضافه روشن نیست. دریافت تاریخی صرفاً با سند وجه لزوماً ماندهٔ فروش را تخصیص نمی‌دهد. |
| reconciliation/import جمعی | XLSX import در مسیر خرید مستند است | batch catch-up یکپارچه با dry-run، cross-document reconciliation و rollback در شواهد بررسی‌شده یافت نشد. |

## مانع P0: chronology اشتباه برای خرید backdated

`PurchaseInvoice.InvoiceDate` یک `DateOnly` است و برای `BusinessContractService.ResolveForDateAsync` و `PartnerLedgerEntry.EntryDate` استفاده می‌شود. ولی در `PostPurchaseCoreAsync` هر layer مقدار `ReceivedAtUtc = DateTime.UtcNow` و هر movement مقدار `MovementDateUtc = DateTime.UtcNow` و `PostedAtUtc = DateTime.UtcNow` می‌گیرد. در فروش، layerها براساس `ReceivedAtUtc ASC, Id ASC` (یا ترتیب معکوس LIFO) مصرف می‌شوند.

پس اگر خریدی از دو سال قبل امروز وارد شود، از دید FIFO امروز رسیده است؛ ثبت فروش تاریخی به تاریخ `SaleDate`، layerهای آتیِ ثبت‌شده/قدیمی را به عقب برنمی‌گرداند و replay chronological خودکار دیده نشد. قفل همزمانی A6 این مشکل را حل نمی‌کند؛ آن برای رقابت همزمان روی stock است.

## مانع P0: فاکتور برابر receipt فرض شده

قبل از posting، سیستم lineهای دارای کالای map‌شده و `NetWeight > 0` و جمع آن‌ها برابر `TotalNetWeight` می‌خواهد. هر layer و حرکت خرید به همان `item.NetWeight` ساخته می‌شود. در این ورودی مقدار واقعی رسید جداگانه وجود ندارد. کم‌رسیدن، اضافه‌رسیدن، رسید چندمرحله‌ای یا اختلاف وزن invoice/warehouse را نمی‌توان به‌عنوان واقعیت مستقل مدل کرد (تأیید اختلاف در workbench سفارش، جایگزین رسید واقعی تاریخ‌دار برای خرید مستقل نیست).

## سایر کنترل‌های ضروری

- **هزینه پس از ثبت:** در posting، unit cost از هزینه‌های موجود ساخته می‌شود. Master فهرست endpointها می‌گوید تغییر مستقل PurchaseCost ندارد. مسیر برگشت/اصلاح هزینهٔ post شده با فروش‌های وابسته، طبق سورس بررسی‌شده ثابت نشد؛ هزینه‌ها را قبل از ثبت قطعی کامل دانستن، دادهٔ تاریخی را تحریف می‌کند.
- **قرارداد تاریخی:** پیش از posting هر سند، نسخهٔ مؤثر برای تاریخ سند لازم است. همهٔ نسخه‌ها و ownership/share rules تاریخی را باید از اسناد مرجع بازسازی و پوشش تاریخ‌ها را بررسی کرد؛ از قرارداد امروز برای دو سال گذشته استفاده نکنید مگر مالک صریحاً تصویب کند.
- **سرمایه در برابر claim:** کد ledger رویدادهای خرید/فروش/تسویه دارد، اما مفهوم principal→scheduled→payable→converted/settled در Master هدف آتی است. بدون سناریوهای عددی مصوب، جمع ماندهٔ شریک را خروجی قطعی تلقی نکنید.
- **وجه/چک:** شناسه و transition چک مزیت حفظی‌اند. اما oldest-first allocation و excess customer credit نیاز Master است؛ اتصال یک line به یک sale نباید معادل تخصیص کامل حساب دریافتنی فرض شود.
- **Reversal:** status/transaction/token مانع posting مضاعف معمول است. reversal، حرکت جدید و آثار دفتر ایجاد می‌کند؛ اما replay خودکار همهٔ تراکنش‌های بعدی یا بازسازی chronology تاریخی در سورس مشاهده‌شده نیست.
- **Import و کنترل:** ورود فایل به تنهایی کنترل تکراری‌ها، کامل‌بودن خط/پیوست، mapping، هزینه، receipt، شریک، فروش بعدی و جمع افتتاحیه را ثابت نمی‌کند. ابتدا dry-run و گزارش خطا/جمع کنترل لازم است.

## برنامهٔ پایلوت امن

1. backup را در محیط غیرتولیدی restore و نتیجه را ثبت کنید؛ مالکیت داده/حساسیت و حذف فایل موقت را جداگانه کنترل کنید.
2. یک بستهٔ نمونهٔ ساختگی اما نماینده انتخاب کنید: invoice قدیمی، دو هزینه با تاریخ‌های متفاوت، receipt کسری/چندمرحله‌ای، فروش با تاریخ بعدی، دریافت cash/check، یک برگشت.
3. قبل از ورود real data، قراردادهای تاریخی/نرخ‌ها، تعداد اسناد، جمع مقدار/ارز و گزارش reconciliation مرجع تهیه شود.
4. خروجی فعلی را به‌عنوان baseline نگه دارید؛ باگ chronology را مستند کنید، نه اینکه با backdate کردن timestamp یا ویرایش DB دور بزنید.
5. طراحی افزایشی: actual receipt dated events → lot/layer lineage → landed cost state and corrections → partner claim/capital mapping → oldest-first receipt allocation → batch import/reconciliation. در هر مرحله تست واقعی SQL و موازنهٔ قبل/بعد لازم است.
6. Cutover فقط پس از مطابقت invoice totals, received quantity, closing stock/cost, FIFO lineage, sales receivable, receipts/check custody and partner balances با مرجع مالک انجام شود.

## آنچه امروز می‌توان/نمی‌توان کرد

- **قابل استفاده با احتیاط برای sandbox:** CRUD فاکتور مستقل API، mapping نخ، ثبت Draft، هزینه‌های invoice، posting اتمیکی که inventory layer/ledger می‌سازد، فروش و چک برای داده‌های غیرتاریخی با workflow فعلی.
- **غیرقابل اتکا برای catch-up واقعی تا اصلاح/تعیین رویه:** backdating receipt/FIFO، اختلاف مقدار، چند receipt به یک invoice، افزودن هزینه پس از posting، claim/capital reconciliation، receipt allocation oldest-first، rollback/replay تاریخچه.
- از روی UI یا وجود endpoint به‌تنهایی نمی‌توان سلامت دادهٔ واقعی، مجوز کاربر یا تنظیمات SQL را نتیجه گرفت.

## تصمیمات لازم پیش از ورود واقعی

تاریخ رسید در برابر فاکتور؛ مقدار مرجع موجودی و تلورانس؛ روش ثبت کسر/اضافه؛ نرخ FX هر هزینه؛ تاریخ قرارداد و وضعیت اسناد گذشته؛ هزینهٔ دیررس و reopen؛ قواعد نقد/اعتباری/چک و زمان استحقاق شریک؛ تعریف capital در برابر claim؛ نحوهٔ تخصیص دریافت و اضافه‌پرداخت؛ opening stock و عددهای reconciliation. برای Phase F، Master تصویب سناریوی عددی را شرط شروع کد می‌داند.
