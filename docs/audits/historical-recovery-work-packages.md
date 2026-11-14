# بسته‌های کاری بازیابی تاریخچهٔ خرید تا فروش

**مبنای برنامه:** [`historical-recovery-architecture.md`](historical-recovery-architecture.md)، Master، و گزارش read-only پایگاه داده. این سند برآورد برنامه‌ریزی است؛ تأیید بودجه یا اجازهٔ تغییر برنامه/داده نیست. هیچ پیاده‌سازی یا آزمونی در این مرحله انجام نشده است.

## ترتیب وابستگی

```text
WP-00 تصمیم‌های مالک و خط مبنا
  ├─ WP-01 کلون امن، تطبیق اسناد و manifest تاریخچه
  └─ WP-02 طرح migration افزایشی و قرارداد سازگاری
       ├─ WP-03 فاکتور و رسید واقعی انبار
       │    └─ WP-04 FIFO تاریخ‌محور و replay مرحله‌ای
       ├─ WP-05 هزینهٔ تمام‌شده و نسخه‌بندی
       ├─ WP-06 UI مستقل خرید و آزمایشگاه فرم
       ├─ WP-07 دریافت وجه/چک و تخصیص فروش
       └─ WP-08 سرمایه و claim شریک (گیت تصمیم‌های F)
WP-03..08 → WP-09 تمرین مهاجرت، تطبیق و cutover
```

کارهای WP-03 تا WP-08 پس از WP-00/01 می‌توانند در محیط‌های جدا توسعه یابند، اما ادغام و انتشار تا سازگاری مدل و API در WP-02 متوقف می‌ماند. WP-08 هیچ کد مالی ندارد تا تصمیم‌ها و مثال‌های عددی مالک امضا شوند.

## مقیاس برآورد

روز کاری توسعه‌دهندهٔ تمام‌وقت شامل پیاده‌سازی و بازبینی فنی است؛ شامل انتظار برای تصمیم‌های مالک، فراهم‌کردن backup، تطبیق اسناد واقعی، استقرار/هماهنگی و اصلاحات ناشناخته نیست. این بازه‌ها تخمینی‌اند و باید پس از WP-00 و مشاهدهٔ نمونه‌داده بازبرآورد شوند.

| اندازه | بازهٔ راهنما |
|---|---:|
| S | 1–2 روز |
| M | 3–5 روز |
| L | 6–10 روز |
| XL | 11–20+ روز |

مجموع اولیهٔ مسیر بدون WP-08 حدود **42–75 روز توسعه** (بازهٔ تخمینی) است؛ WP-08 حدود **8–15+ روز** پس از تصویب Owner Decisions و سناریوها. زمان کل تقویمی از این اعداد قابل استنتاج نیست و عمدتاً به آماده‌شدن تاریخچهٔ مستند و تصمیم‌های مالی وابسته است.

## WP-00 — تصمیم‌های مالک و خط مبنای پذیرش

**اندازه:** M، 3–5 روز تسهیل و تحلیل (زمان پاسخ مالک جداست). **وابسته به:** هیچ. **خروجی:** decision log نسخه‌دار، قواعد تاریخ، جدول سناریوهای خروجی مورد انتظار، تعریف opening balances و معیار go/no-go.

- تعیین تاریخ فاکتور، رسید، فروش، پرداخت، تسعیر و timestamp فنی؛ ترتیب same-day و منطقهٔ زمانی.
- ثبت تصمیم‌های Master §12 دربارهٔ ریسک FX، بدهکار کمیسیون، مرز اسناد حسابداری، مهلت claim، کسری/ضایعه، مشارکت شریک/پرداخت تأمین‌کننده، زمان شناسایی حواله، تاریخ شروع و موجودی افتتاحیه، delivery-order/invoice و TDE.
- تعیین variance tolerance، approver، late-cost treatment، مبنای وزن/CBM و rounding/override.
- تهیهٔ پاسخ مالک برای سناریوهای cash/credit/check/bounce، تغییر FX و خرید ارز، return، تخفیف بدهی، over-remittance.

**پذیرش:** هیچ قاعدهٔ با اثر مالی به فرض تبدیل نشده باشد؛ موارد باز دارای مالک/موعد و گیت صریح باشند. اگر تصمیم لازم باز است، بستهٔ متناظر در حالت Blocked بماند.

## WP-01 — clone ایمن و پاک‌سازی/تطبیق تاریخچه

**اندازه:** L، 6–10 روز پس از آماده‌شدن اسناد. **وابسته به:** WP-00. **خروجی:** backup restore-verified غیرعملیاتی، manifest idempotent، گزارش exception و totals امضاشده.

- backup واقعی تهیه و restore روی SQL instance مجزای disposable اثبات شود؛ برنامهٔ rollback و دسترسی محدود ثبت گردد.
- سه فاکتور Draft موجود، خصوصاً مغایرت GoodsTotal/وزن/بسته با اختلاف گزارش‌شدهٔ 113,893.43 USD، فقط با سند مبدأ دسته‌بندی شوند؛ بدون repair حدسی.
- فهرست سطرمحور فاکتور/رسید/هزینه/فروش/پرداخت از منبع کاغذی یا فایل مالک با کلید منبع پایدار، hash و مقدار کنترل ایجاد شود.
- duplicate، شناسهٔ مفقود، ارز/تاریخ بدون مدرک، وزن خالص/ناخالص ناسازگار و خط زمانی ناممکن به exception queue برود.
- totals شمارشی و مقداری بر حسب سند، ارز، نخ، partner و بازهٔ تاریخ قبل از import تأیید شوند.

**پذیرش:** هر ورودی منشأ، کلید یکتا، وضعیت بررسی و جمع کنترلی داشته باشد؛ restore موفق و دسترسی DB عملیاتی از ابزار rehearsal غیرممکن باشد.

## WP-02 — مدل افزایشی و سازگاری مسیر قدیمی

**اندازه:** M تا L، 4–8 روز. **وابسته به:** WP-00، WP-01. **خروجی:** migration design review، data mapping، قرارداد API/status و برنامهٔ rollout/rollback.

- طراحی additive برای WarehouseReceipt/Line، OriginLot، تاریخ مؤثر FIFO و cost-version؛ FK/index/check و رفتار حذف/RowVersion مستند شود.
- روشن شود Posted قدیمی یعنی posting خرید+موجودی+partner به‌صورت ترکیبی؛ state جدید receipt معنای قدیمی را بی‌صدا تغییر ندهد.
- legacy endpoint تا مهاجرت کنترل‌شده رفتار فعلی را حفظ کند؛ API جدید receipt با idempotency key و replay-safe transaction مستقل باشد.
- برای layer قدیمی منبع تاریخ نامعلوم علامت‌گذاری شود؛ `ReceivedAtUtc` به‌عنوان تاریخ واقعی بازتفسیر نشود.
- طراحی backfill، nullable دورهٔ گذار، unique constraints و ترتیب deployment شامل نسخهٔ قدیمی/جدید API بررسی شود.

**پذیرش:** review معماری و mapping تأیید شود؛ روی clone هیچ داده‌ای دور ریخته یا بازنویسی نشود؛ مسیر rollback و feature gate روشن باشد.

## WP-03 — capture فاکتور و ثبت receipt واقعی

**اندازه:** L، 7–11 روز. **وابسته به:** WP-02؛ قواعد receipt از WP-00. **خروجی:** API/serviceهای Draft فاکتور مستقل از PO و receiptهای چندمرحله‌ای.

- invoice lineهای فعلی و import XLSX را حفظ کن؛ خرید تاریخی بدون PurchaseOrder مجاز باشد.
- رسید با invoice و invoice item، انبار، تاریخ واقعی، مقدار خالص/ناخالص/بسته، کانتینر اختیاری، اختلاف و دلیل به شکل append-oriented ثبت شود.
- دریافت جزئی چندباره، کم‌رسیدی/بیش‌رسیدی و تأیید variance با actor/reason و RowVersion پوشش یابد؛ invoice اصلی تغییر نکند.
- posting هر receipt idempotent باشد؛ inventory movement و layer فقط برای مقدار واقعاً تحویل‌شده تولید شوند.
- attachment allowlist/authorization برای receipt اضافه شود؛ مالکیت فایل و دسترسی بررسی شوند.

**پذیرش:** invariant مقدار کل رسید، کنترل بیش‌رسیدی طبق تصمیم، race دو posting، retry و rollback transaction آزمایش شوند؛ invoice مستقل از PO ساخته و رسیدهای چندگانه به آن وصل شوند.

## WP-04 — FIFO تاریخ‌محور، lineage و replay

**اندازه:** XL، 11–18 روز. **وابسته به:** WP-03 و WP-02؛ ترتیب same-day از WP-00. **خروجی:** قاعدهٔ FIFO قطعی، query و index امن، ابزار replay محدود به staging.

- لایه فقط وقتی واجد شرایط فروش است که تاریخ مؤثر دریافت حداکثر تاریخ فروش باشد؛ ترتیب تاریخ، sequence ثبت‌شده و شناسه قطعی باشد.
- SQL locking موجود `UPDLOCK/HOLDLOCK/ROWLOCK`، ترتیب acquisition، transaction، execution retry، RowVersion و منع موجودی منفی حفظ شود.
- index و query plan جدید روی نسخهٔ واقعی SQL Server و دادهٔ نماینده benchmark شود؛ احتمال scan/deadlock بررسی شود.
- SaleCostAllocation lineage را حفظ کند؛ backdated receipt که روی فروش ثبت‌شده اثر دارد در production رد/ارجاع شود، نه auto-reallocate.
- replay فقط روی staging با watermark/idempotency، dry-run summary، resume و audit قابل اجرا باشد.

**پذیرش:** فروش پیش از رسید از آن مصرف نکند؛ فروش بعد از دو receipt partial به ترتیب قطعی allocate شود؛ دو فروش همزمان oversell نکنند؛ replay تکراری نتیجهٔ تکراری نسازد؛ سناریوی backdated dependency به‌درستی متوقف شود.

## WP-05 — هزینهٔ واردشده، تخصیص و بازگشایی نسخه‌دار

**اندازه:** L، 7–12 روز. **وابسته به:** WP-02/03 و تصمیم‌های WP-00. **خروجی:** cost allocation versions و نمایش هزینهٔ provisional/final.

- PurchaseCostهای اصل را حفظ و هر نسخهٔ تخصیص را به هزینه، receipt/OriginLot، نرخ/منبع FX، روش، مبنا، گردکردن و actor متصل کن.
- هزینه‌های وزن‌محور/حجم‌محور طبق تصمیم؛ manual override تنها با دلیل و authority.
- هزینهٔ دیررس نسخهٔ تازه بسازد؛ snapshot فروخته‌شدهٔ `SaleCostAllocation` immutable بماند و adjustment فروخته‌شده مسیر حسابرسی مستقل داشته باشد.
- مقادیر باقی‌ماندهٔ layer با نسخهٔ مورد استفاده در valuation traceable باشند؛ finalize/reopen فقط با permission و audit.

**پذیرش:** تخصیص مجموع را با rounding قاعده‌مند reconcile کند؛ تکرار posting duplicate نسازد؛ هزینهٔ بعد از فروش snapshot قبلی را عوض نکند؛ گزارش unsold/sold adjustment تراز باشد.

## WP-06 — UI خرید مستقل و Form Laboratory handoff

**اندازه:** L، 6–10 روز. **وابسته به:** قرارداد API WP-03/05 و WP-02. **خروجی:** فهرست/ویرایش فاکتور مستقل از PO، ورود رسید مستقل، دو تعریف Lab نسخه‌دار.

- مسیر standalone `purchases` برای جستجو، invoice header/lines، هزینه‌ها، containers و پیوست؛ CommercePage سفارش‌محور حفظ شود.
- receipt form تاریخ واقعی، انبار، مقدار باقی‌مانده، چند receipt، discrepancy و تأیید variance را جدا نشان دهد.
- BaseFormShell/OperationalFormFrame/BaseFormGridBoundary، lookup/date/keyboard و F3/RowVersion/conflict patterns را رعایت کند.
- Lab definition صرفاً تا وقتی route، API، مجوز، گزارش و پذیرش واقعی وجود ندارد طرح محسوب شود؛ registry فقط receipt واقعی انتشار را بپذیرد.

**پذیرش:** تست قراردادی UI/API، keyboard، RTL، permission، conflict و responsive اجرا شود؛ فرم قدیمی سفارش regress نشود؛ Lab به endpoint واقعی متصل باشد.

## WP-07 — دریافت‌های فروش، schedule و چک

**اندازه:** L، 7–12 روز. **وابسته به:** WP-00 سناریوهای فروش/چک، WP-02. **خروجی:** allocation صریح MoneyDocumentLine به فروش/schedule و گردش وضعیت چک.

- identity چک و CheckOperation حفظ شود؛ دریافت وجه به یک یا چند schedule با مبلغ و تاریخ ثبت شود.
- oldest-first تنها policy پیش‌فرض قابل پیکربندی پس از تصویب؛ overpayment به credit/customer balance با قواعد روشن برود.
- bounced check reversal/audit و اثر آن بر مانده و سررسید طبق سناریوی owner؛ جمع حساب اشخاص به‌تنهایی allocation تلقی نشود.
- عملیات retry-safe و همزمانی سند/چک پوشش داده شود.

**پذیرش:** cash، credit، چند receipt، پرداخت جزئی، overpayment، bounce و resume/import تراز مبلغ/مانده را طبق خروجی امضاشده بدهند.

## WP-08 — سرمایه، claim و ریسک FX شریک (گیت‌شده)

**اندازهٔ اولیه:** XL، 8–15+ روز برای طراحی/پیاده‌سازی پس از تصویب؛ برآورد ناپایدار تا حل تصمیم‌های Master §12. **وابسته به:** WP-00، WP-05، WP-07 و نسخه‌های مؤثر قرارداد. **وضعیت فعلی:** Blocked by owner decisions; development forbidden until approved.

- مدل unsold inventory capital را از sold claim principal/profit/premium جدا کن؛ identity شریک و snapshot قرارداد مؤثر را traceable نگه دار.
- FX risk، نرخ خرید/ارسال، حوالهٔ ارسال‌شده/تأییدشده، برگشت کالا، تخفیف بدهی، مهلت claim و ترتیب تسویه با مثال‌های امضاشده مدل شود.
- هیچ GUID ثابت partner، InvestorBalance خام یا محاسبهٔ حاشیه‌ای را منبع حقیقت نکن.

**پذیرش:** همهٔ سناریوهای عددی Master DB-06 و تصمیم‌های باز با expected output امضا شده؛ ledger مستقل و قابل بازسازی باشد؛ بدون این گیت WP-08 شروع نشود.

## WP-09 — تمرین import، تطبیق کل و cutover

**اندازه:** L تا XL، 8–14+ روز برای چند rehearsal. **وابسته به:** WP-01 و WP-03 تا WP-07؛ WP-08 فقط اگر دامنهٔ مالی شریک در go-live است. **خروجی:** rehearsal report، exception closure، برنامه و نتیجهٔ go/no-go.

- import را روی backup-clone با manifest تکرارپذیر و کلیدهای منبع ثابت انجام بده؛ pause/resume بعد از قطع کنترل شود.
- تطبیق مقدار: invoice/receipt/موجودی به تفکیک نخ/انبار/OriginLot و تاریخ؛ مبلغ: خرید/هزینه/فروش/دریافت به تفکیک ارز؛ partner: فقط مدل مصوب.
- opening balances با اسناد منبع و تاریخ شروع تطبیق و تأیید شود؛ تفاوت با explainable adjustment و actor ثبت شود، نه اصلاح مستقیم.
- cutover window، read-only freeze، backup، rollback criterion، مسئول تصمیم و smoke acceptance تعیین شود.

**پذیرش:** دو rehearsal مستقل با نتیجهٔ یکسان؛ exceptionهای حیاتی صفر یا waiver امضاشده؛ restore rollback اثبات شود؛ تصمیم go/no-go مستند باشد. هیچ تمرین روی DB عملیاتی اجرا نشود.

## ماتریس آزمون و پذیرش (مشخصات، نه اجرا)

| حوزه | نمونه‌های حداقلی | شرط قبول |
|---|---|---|
| Invoice/receipt | بدون PO؛ یک invoice با دو رسید جزئی؛ کسری/اضافه؛ retry همان کلید | header فاکتور تغییر نکند؛ مقدار receipt و movement یکتا و قابل ردیابی باشد. |
| تاریخ/FIFO | receipt روز 10، sale روز 9 و 15؛ دو receipt هم‌روز؛ receipt دیرهنگام پیش از sale قطعی | فروش روز 9 موجودی آینده نبیند؛ ترتیب tie قطعی باشد؛ مورد backdated به replay کنترل‌شده ارجاع شود. |
| همزمانی | دو sale برای یک layer؛ دو اپراتور برای همان invoice/receipt | oversell/duplicate posting رخ ندهد؛ conflict قابل فهم گزارش شود. |
| هزینه | هزینهٔ freight و IRR، rounding، manual override، late cost پس از فروش | allocation با اصل هزینه reconcile؛ sold snapshot immutable و adjustment مجزا. |
| دریافت/چک | cash، credit، check، split receipt، bounced check، overpayment | sale schedule، person account و check ledger مطابق سناریوی مصوب reconcile شوند. |
| شریک/FX | خرید ارز پس از sale، remittance، return پیش/پس از FX، discounting | اجرای این دسته فقط پس از WP-08 approval؛ خروجی با worksheet امضاشده برابر. |
| import/cutover | اجرای مجدد، توقف میانه، recovery، totals قبل/بعد | idempotent، قابل resume/rollback و totals تکرارپذیر باشد. |

## گیت‌های توقف و کاهش هزینه

- **قبل از توسعهٔ مالی:** WP-00 تصمیم‌های لازم و خروجی‌های عددی را ببندد؛ اگر مالک خروجی ندارد، فقط مستندسازی و ابزار تطبیق غیرمخرب جلو برود.
- **قبل از schema migration:** WP-01 منبع تاریخچه و restore قابل اثبات فراهم کند؛ WP-02 legacy/new semantics و rollback را تصویب فنی کند.
- **قبل از هر آزمون DB:** فقط SQL clone/disposable با نام/هویت ثبت‌شده؛ YarnTrade عملیاتی برای posting/replay استفاده نشود.
- **قبل از اعلان فرم:** route، API، auth، audit، پذیرش و Lab release واقعی موجود باشند.
- **قبل از cutover:** WP-09 تراز quantity/value/FX/partner (در صورت تصویب) را امضا بگیرد.

## خارج از این برنامهٔ اولیه

PO/proforma و برنامه‌ریزی کامل shipment/loading، carrier workflows، barcode/bale scanning، warehouse transfer، پیام‌رسانی، full general ledger و auto-replay روی فروش‌های قطعی‌شده خارج از مسیر catch-up اولیه‌اند. هرکدام باید پس از تثبیت رسید/هزینه/FIFO و با نیاز کسب‌وکار مستقل برنامه‌ریزی شوند.
