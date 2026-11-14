# معماری بازیابی تاریخچهٔ خرید تا فروش

**وضعیت:** طرح فنی برای بازبینی مالک؛ هیچ بخشی از این سند پیاده‌سازی یا مجوز migration نیست.
**مبنای بررسی:** `review/br-01b-form-template`, commit `a64db627a2160ae03342cc25b4f4335295c7af70`; گزارش زندهٔ DB در [`live-sql-schema-verification.md`](live-sql-schema-verification.md).
**نیاز مرجع:** [`YARN_TRADE_CODEX_MASTER.md`](../../YARN_TRADE_CODEX_MASTER.md)، به‌ویژه DB-01 تا DB-07، فازهای B تا F و بخش تصمیم‌های مالک.

## 1. تصمیم معماری پیشنهادی

برای catch-up اولیه، **بازپخش مرتب‌شده روی نسخهٔ staging از backup** کم‌ریسک‌تر از ورود backdated به DB عملیاتی و محاسبهٔ مجدد تدریجی است. فاکتورهای خرید و هزینه‌ها ابتدا گردآوری و تطبیق شوند؛ receiptها با تاریخ واقعی ثبت و به ترتیب دریافت مرتب شوند؛ سپس فروش‌ها به ترتیب تاریخ سند قطعی شوند. در posting فروش، فقط receiptهایی مجازند که تاریخ مؤثر دریافتشان حداکثر برابر تاریخ فروش باشد. بعد از پذیرش ترازها، انتقال staged data به محیط عملیاتی با روش cutover تأییدشده انجام شود.

بازمحاسبهٔ افزایشی و بی‌صدای sale allocationهای قبلی پیشنهاد نمی‌شود: `SaleCostAllocation` هم مقدار فیزیکی مصرف‌شده و هم snapshot هزینه را نگه می‌دارد و reversal فعلی به همان lineage نیاز دارد. ورود بعداً یک receipt backdated که به فروش قطعی‌شده وابسته است، باید رد و برای بازپخش کنترل‌شده/اصلاحیهٔ حسابرسی‌پذیر ارجاع شود؛ نباید `SaleCostAllocation` یا `InventoryLayer.RemainingQuantity` گذشته مستقیم rewrite شود.

## 2. وضع موجود و آنچه قابل استفاده است

### اجزای ارزشمند قابل reuse

| موجودیت/سرویس/صفحه | استفادهٔ مجدد | حد فعلی |
|---|---|---|
| `PurchaseInvoice`, `PurchaseInvoiceItem` | مرجع فاکتور مستقل از سفارش؛ `PurchaseOrderId` nullable؛ شماره، تاریخ فاکتور، تأمین‌کننده، شرح اصلی، نخ، وزن، قیمت، ارز و جمع | `PurchasesController.Create/Update` نگهداری Draft را می‌دهد؛ posting فعلی فاکتور و receipt را یکی می‌کند. |
| `PurchaseContainer`, `PurchaseItemContainer`; `BillOfLadingNumber`; `Attachment` | شماره/پلمب کانتینر، وزن و بسته؛ B/L؛ پیوست اسناد خرید | Container زیر فاکتور است؛ B/L در header است؛ تخصیص item-container در DB حاضر صفر است. Attachment A7 فقط parentهای مجاز PurchaseOrder/PurchaseInvoice را پشتیبانی می‌کند؛ receipt نیازمند allowlist و کنترل دسترسی صریح خواهد بود. |
| `PurchaseCost`, `PurchaseCostAllocation` | اصل هزینه، تاریخ هزینه، ارز/مبلغ/نرخ، مسئول شریک، دامنه و روش تخصیص، پیوست و ساختار تخصیص موجود | هزینه در DB زنده صفر است؛ endpoint مستقل برای اصلاح هزینهٔ قطعی‌شده نداریم؛ `PostPurchaseCoreAsync` تخصیص هزینه را در حافظه محاسبه می‌کند و جدول allocation در posting فعلی پر نمی‌شود. |
| `PostingService.PostPurchaseAsync` | transaction، execution-strategy retry، RowVersion و ثبت audit برای مسیر فعلی | `PostPurchaseCoreAsync` هزینه‌ها، PartnerLedgerEntry، InventoryLayer/Movement و Posted status را یک‌جا می‌نویسد؛ مقدار layer را وزن invoice می‌گیرد و `ReceivedAtUtc=UtcNow` می‌گذارد. برای receipt تاریخی نباید همان عملیات بدون تفکیک فراخوانی شود. |
| `InventoryLayer`, `InventoryMovement`, `SaleCostAllocation` | لایهٔ فیزیکی، دفتر حرکت، lineage هزینهٔ sale، reversal و گزارش Kardex | layer فعلی فقط به invoice item وصل است؛ OriginLot/receipt line ندارد. movement منبع عمومی دارد. تاریخ FIFO با posting time پر می‌شود. |
| `PostingService.PostSaleAsync` و قفل A6/A6R | authority سمت سرور، RowVersion، retry، `UPDLOCK/HOLDLOCK/ROWLOCK`, ترتیب قفل کالا، کنترل موجودی منفی، allocation و reversal lineage | قفل و oversell concurrency باید حفظ شود. query فعلی بر `(WarehouseId,YarnItemId,ReceivedAtUtc,Id)` قفل می‌گیرد و `SaleDate` را شرط eligibility لایه نمی‌کند. |
| `BusinessContractService.ResolveForDateAsync` | انتخاب آخرین نسخهٔ مؤثر در تاریخ سند و ثبت reference روی purchase/sale/money doc/settlement | جدول قرارداد در DB زنده صفر ردیف دارد؛ بدون نسخهٔ مؤثر posting خرید، فروش و سند وجه متوقف می‌شود. |
| `PartnerShareRule`, `PartnerLedgerEntry`, `PartnerSettlement*`, `Investor`, `InvestorBalance` | قواعد تاریخ‌دار، دفتر append-oriented، تسویه و identity/balance boundary | DB زنده: ۳ share rule و صفر contract/investor/balance/ledger. Claim lifecycle وجود ندارد؛ `InvestorBalance` گردش مالی را خودکار ثبت نمی‌کند. current sale shares هنوز GUIDهای ثابت شرکا را استفاده می‌کنند. |
| `MoneyDocument`, `MoneyDocumentLine`, `Check`, `CheckOperation`, `SalePaymentSchedule` | سند وجه، روش پرداخت، چک با شناسهٔ واحد و history وضعیت، schedule فروش | `FinanceController.PostDocument` قرارداد را resolve و account را lock می‌کند؛ `PersonAccountService` فقط جمع کل receipt/payment را در ماندهٔ شخص لحاظ می‌کند. تخصیص دریافت به چند schedule یا oldest-first انجام نمی‌دهد؛ `SalePaymentSchedule` جای ledger چنددریافتی نیست. |
| `XlsxPurchaseImporter` و `CommercePage` | parser/import و تجربهٔ UI موجود برای دادهٔ خرید؛ reference برای فیلدهای فاکتور | `CommercePage` workbench سفارش/بازرگانی است. Catalog خرید مستقل را `partial` می‌داند؛ `catalogSchema` برای route `purchases` قرارداد commerce را به‌عنوان baseline صفحهٔ مستقل reuse می‌کند، اما آن مسیر runtime مستقل کامل ندارد. |

### واقعیت DB که design باید با آن شروع شود

گزارش زندهٔ 2026-11-15 هویت DB را `DESKTOP-GPMG5JH / YarnTrade` ثبت کرده است. تاریخچه با ۳۰ migration موجود همگام است. شمارش‌ها: PurchaseInvoice=3 (هر سه Draft)، PurchaseOrder=2، Sale=3 (هر سه Draft)، InventoryLayer/Movement=0، PurchaseCost/Allocation=0، PartnerLedgerEntry=0، BusinessContractVersion=0، Investor/Balance=0 و ExchangeRate=0. یک فاکتور Draft در GoodsTotal/وزن خالص/ناخالص/بسته با lineها مغایر است؛ اختلاف قدرمطلق مبلغ GoodsTotal برابر 113,893.43 USD است. این سند را نه اصلاح کنید نه حذف کنید؛ با فاکتور مبدأ تطبیق و مالک باید نوع رکوردها را مشخص کند.

## 3. هدف گردش حداقلی

```text
فاکتور خرید Draft
  → بررسی/تأیید تجاری فاکتور و اقلام (بدون نیاز به PO)
  → ثبت کانتینر/B-L/پیوست و هزینه‌های مستند
  → receipt واقعی انبار (یک یا چند receipt با تاریخ/مقدار مستقل)
  → OriginLot و layerهای receipt-date
  → snapshot تخصیص هزینه؛ provisional/final مطابق تصمیم مالک
  → فروش‌های تاریخی به ترتیب SaleDate و FIFO فقط از stock واجد تاریخ
  → دریافت‌ها/چک‌ها با تخصیص به مطالبات
  → گزارش reconciliation موجودی، هزینه، مطالبات و شریک
```

سفارش خرید در کل مسیر اختیاری می‌ماند. `PurchaseOrderId` فعلی nullable باقی می‌ماند؛ هیچ endpoint، فرم یا receipt جدید نباید PO را شرط ثبت کند. PO، Proforma و Shipment آینده خارج از scope این کار هستند. Container/B-L موجود فقط سند/منشأ را ثبت می‌کند؛ این طرح workflow کامل Shipment/loading را اضافه نمی‌کند.

## 4. مدل دادهٔ افزایشی پیشنهادی

نام‌ها و ستون‌های زیر design proposal هستند و تا تصویب مالک/DDL review نهایی نیستند.

### Receipt مستقل

**`WarehouseReceipt`** به‌عنوان root audited/RowVersion:

- `Id`, شمارهٔ داخلی یکتا، `PurchaseInvoiceId`، `WarehouseId`, `ReceiptDate` از نوع SQL `date`، `Status` (Draft/Posted/Reversed)، `CreatedAtUtc`, `PostedAtUtc`, `CreatedBy`, `PostedBy`, reason/notes و RowVersion.
- انتخاب warehouse از `Warehouses` فعال؛ اگر catch-up فعلی فقط انبار یزد را مجاز می‌داند، آن را با شناسهٔ داده‌ای/دسترسی انتخاب کنید، نه ID hardcode.
- `ReceiptDate` تاریخ کسب‌وکار تحویل واقعی است. `CreatedAtUtc` و `PostedAtUtc` زمان فنی ثبت‌اند؛ یکی جای دیگری را نمی‌گیرد.

**`WarehouseReceiptLine`** به‌عنوان child غیرقابل تغییر پس از posting:

- `Id`, `WarehouseReceiptId`, `PurchaseInvoiceItemId`, optional `PurchaseContainerId` یا association به `PurchaseItemContainer`, کالا snapshot/ارجاع، `ReceivedNetWeight`, `ReceivedGrossWeight`, `ReceivedPackageCount`, line number، و مقدار/سبب discrepancy.
- یک invoice item می‌تواند در چند receipt line/چند receipt تحویل شود. مقدار received تجمعی با مقدار فاکتور مقایسه شود. over-receipt یا under-receipt نیازمند اختلاف مستند، تأیید actor مجاز و audit باشد؛ مقدار invoice تغییر نکند.
- index/FK: `(PurchaseInvoiceId, ReceiptDate, Status)` از طریق root؛ `(WarehouseId, ReceiptDate)`؛ FKهای Restrict به warehouse/invoice line/container؛ unique شماره receipt. تنها draft lines قابل تغییر/حذف باشند.

### خرید تفکیک‌شده و idempotency

- برای جلوگیری از استفادهٔ تصادفی هر دو posting، مسیر invoice باید mode/status صریح داشته باشد (مثلاً `LegacyCombined` در برابر `DatedReceipt`). مقدار قدیمی روی تمام اسناد موجود به `LegacyCombined` تعبیر شود. برای mode جدید، invoice-confirm operation و receipt-post operation جدا باشند؛ `PurchasesController.Post` و Commerce route فعلی باید mode را چک کنند و دومین مسیر را رد کنند.
- تصمیم دقیق اینکه `PurchaseInvoice.Status=Posted` از این پس فقط «فاکتور تجاری تأیید شده» معنا دهد یا برای مسیر جدید فیلد state جدا اضافه شود، **جزئیات migration/API blocker** است. نباید بدون mode/state migration معنای Status را عوض کرد؛ کد فعلی آن را نمایندهٔ posting stock/partner هم می‌داند.
- receipt posting در transaction واحد، root RowVersion را بررسی، وضعیت Draft را به Posted منتقل، lineهای معتبر را قفل، layer/movementهای هر line را بسازد، audit را ثبت و commit کند. Retry همان operation نباید اثر دوم بسازد.
- روی `InventoryLayer` و `InventoryMovement` یک source reference nullable به `WarehouseReceiptLineId` اضافه و unique filtered index روی receipt line در هر جدول قرار دهید (اگر یک line چند layer می‌سازد، کلید idempotency شامل line+lot/warehouse است). idempotency operation و status/RowVersion هر دو لازم‌اند.
- reversal receipt تنها اگر هیچ مقدار وابسته مصرف نشده و هیچ event بعدی روی lineage وجود ندارد مجاز باشد؛ در غیر این صورت reversal/controlled adjustment فرایند جدا با approval و audit می‌خواهد. cascade حذف به inventory/ledger ممنوع.

### OriginLot و layerهای تاریخ‌پذیر

- مطابق Master DB-01، `OriginLot` هویت منشأ تجاری پایدار باشد؛ لایه هویت warehouse/receipt است و چند layer می‌تواند یک OriginLot داشته باشد.
- برای این دامنهٔ بدون Shipment، منشأ legacy از `PurchaseInvoiceItem` به‌علاوه association موجود `PurchaseItemContainer`/کانتینر اختیاری ساخته شود. در آینده link به ShipmentContainerLine اضافه شود؛ دادهٔ invoice/container فعلی حذف نشود. اگر یک invoice line چند container دارد، یک lot کور که container provenance را محو کند نسازید.
- `InventoryLayer` حداقل `OriginLotId`, `WarehouseReceiptLineId`, مقدار original/remaining و snapshot اجزای هزینه را داشته باشد. هر receipt line با مقدار مثبت یک layer یا تعداد لایهٔ deterministic مورد نیاز allocation ایجاد کند.
- تاریخ مؤثر FIFO برای layer از `WarehouseReceipt.ReceiptDate` باشد. `ReceivedAtUtc` قدیمی را بی‌صدا بازمعنا نکنید: در migration برای لایه‌های قدیمی، مقدار قبلی فقط proxyِ `LegacyPostingTimestamp` است، نه اثبات تاریخ receipt. ستون `FifoEffectiveDate`/`ReceiptDate` و منشأ تاریخ باید شفاف و قابل index/query باشد.
- FIFO query/قفل A6 باید با کلید جدید `(WarehouseId,YarnItemId,FifoEffectiveDate,FifoSequence,Id)` (یا معادل تأییدشده) seek/order کند؛ Index و SQL hint فعلی را با migration و تست واقعی بازطراحی کنید، نه اینکه صرفاً مرتب‌سازی LINQ عوض شود. برای تاریخ یکسان، `FifoSequence`/زمان معتبر سند با قاعدهٔ ثابت؛ در نبود زمان دقیق، sequence ثبت‌شدهٔ receipt پایدار و tie-breaker `Id` به‌کار رود.
- در posting Sale با `SaleDate`, تنها layerهایی وارد precheck/allocation شوند که `FifoEffectiveDate <= SaleDate`. لایهٔ آینده در همان انبار/کالا نباید برای فروش backdated قابل مصرف باشد. اگر فروش تاریخی به ساعت دقیق نیاز دارد، مالک باید منبع و timezone/time-of-day را مشخص کند؛ تاریخ به‌تنهایی ترتیب intra-day را ثابت نمی‌کند.

### هزینه و بهای تمام‌شده

- `PurchaseCost` را برای واقعیت هزینهٔ خام reuse کنید: نوع، تاریخ هزینه، ارز/مبلغ اصل، FX، IRR/USD، مسئول هزینه، container/item، پیوست. اصل هزینه را بعد از قطعی‌شدن ویرایش نکنید؛ برای هزینهٔ تازه، رکورد تازه بسازید.
- از `PurchaseCostAllocation` برای allocationهای ثبت‌شده استفاده کنید؛ به هر تخصیص یک `LandedCostVersionId`/revision و مبنای وزن/CBM/override reason اضافه شود تا نسخه‌های قبلی قابل بازسازی بمانند.
- **`LandedCostVersion`** پیشنهاد می‌شود: root per invoice/receipt/lots با `Version`, `Status` (Open/Provisional/Finalized/Reopened), تهیه‌کننده/تأییدکننده، زمان و reason. فقط هزینه‌هایی که در این نسخه منظور شده‌اند به allocations immutable map شوند. Provisional/Final/Reopen مطابق DB-05 باشد.
- هزینهٔ شناخته‌شده پیش از فروش در ارزش layer قرار گیرد. اگر late cost پس از فروش رسید: layer cost و SaleCostAllocation/PartnerLedgerEntry قبلی overwrite نشود. در نسخهٔ جدید، سهم موجودی باقی‌مانده و سهم فروخته‌شده جدا محاسبه شوند؛ adjustment برای COGS/profit/partner claim با source/version جدید ثبت شود. فرمول/زمان recognition تا approval عددی مالک کدنویسی نشود.
- وزن و CBM و manual override با reason از Master C5؛ وزن برای allocated costs فعلی baseline موجود است. تصمیم واقعی اینکه کدام cost type با weight، CBM یا ترکیب تخصیص یابد و rounding residual به کدام line برسد باید روی مثال عددی مالک تأیید شود.
- برای نرخ FX از `ExchangeRate` موجود استفاده کنید، اما rate ID/quote direction/source/date و مقدار snapshot را روی هزینه نگه دارید؛ نرخ approved و immutable منبع محاسبه باشد. Master می‌گوید هزینهٔ IRR شرکت به USD با نرخ approved تاریخ پرداخت، و تبدیل خرید CNY→USD هنگام partner invoice event فریز شود. DB فعلی نرخ ندارد؛ هیچ نرخ تاریخی را از امروز تعمیم ندهید.
- چون purchase invoice، هزینهٔ carrier، invoice تأمین‌کننده، پرداخت هزینه و receipt انبار تاریخ‌های متفاوت دارند، حداقل تاریخ invoice، تاریخ هزینه/پرداخت (در صورت تفاوت)، تاریخ رسید و timestamp ثبت مجزا باشند.

### Partner capital، claims و received cash

- **موجود/قابل استفاده:** `BusinessContractVersion` تاریخ اعتبار و درصد/سیاست‌ها را ذخیره و سند به نسخه FK دارد؛ `PartnerShareRule` تاریخ‌دار است؛ `PartnerLedgerEntry` source/reversal ref دارد؛ `PartnerSettlementAllocation` مانده را به ledger entry link می‌کند.
- **عدم‌کفایت فعلی:** قرارداد/Investor/Balance/Ledger در DB live صفرند؛ investorها فقط identity و balance storage‌اند؛ sale posting rule را تاریخ‌دار resolve می‌کند ولی ledger line به ShareRule id/value snapshot وصل نیست؛ current partner identity ثابت GUID است. هیچ `PartnerClaim` با principal/profit/credit premium maturity lifecycle وجود ندارد.
- Capital را طبق DB-06 به‌صورت view محاسباتی از سهم سرمایهٔ مالک در موجودی **فروش‌نرفته** به هزینهٔ تاریخی واقعی گزارش کنید؛ با payable/claim مخلوط نکنید.
- Claim برای کالای فروخته‌شده را بعد از تأیید مدل عددی مالک به lifecycle جدا (Created→Scheduled→Payable→Converted/Settled, reversal) تبدیل کنید، با snapshot contract/share rule/costing/source sale/receipt allocations. `PartnerLedgerEntry` برای ثبت رویدادهای حسابرسی‌پذیر بماند، نه جای state قابل‌پرداخت claim.
- پیش از claim coding، `BusinessContractVersion`‌های تاریخی و investor identities را از مالک دریافت و دوره‌ها را بدون gap/هم‌پوشانی بررسی کنید. سند فقط با version مؤثر در business date قطعی شود؛ تغییر قرارداد تاریخچه را rewrite نکند.
- `MoneyDocumentLine.SaleId` یک link اختیاری دارد، ولی `PersonAccountService` صرفاً جمع کل money docs را در balance شخص می‌آورد. برای دریافت چندمرحله‌ای، طراحی `SaleReceiptAllocation(MoneyDocumentLineId, SalePaymentScheduleId/SaleId, AmountIRR/USD, FX snapshot, allocation date)` یا استفاده/توسعهٔ صریح schedule لازم است؛ جمع allocationها نباید از وجه قابل تخصیص تجاوز کند. oldest-first فقط default مصوب Master باشد، نه قانون hardcoded غیرقابل override. excess به customer credit صرفاً پس از تصمیم و مدل مصوب.
- هر `Check` یک identity و `CheckOperation` append-style دارد؛ allocation باید شناسهٔ چک را یکتا حفظ کند. در برگشت/ضمانت، event history را پاک نکنید.

## 5. API و سرویس‌های لازم

APIهای زیر طرح نام‌گذاری‌اند:

1. `POST/PUT /api/purchases` فعلی برای Draft invoice مستقل باقی بماند؛ PO nullable. فیلدهای آزاد client-side را server-authoritative کنید؛ totals، supplier، active yarn، costs و currency/rate در validation کنترل شوند.
2. `POST /api/purchases/{id}/confirm-invoice` با RowVersion: قواعد completeness/contract reference، snapshot نسخهٔ مؤثر، یخ‌کردن invoice header/lines؛ هیچ stock mutation.
3. `GET/POST /api/purchases/{id}/receipts`; `GET/PUT /api/warehouse-receipts/{id}` فقط Draft؛ `POST /api/warehouse-receipts/{id}/post`; `POST .../reverse` فقط با شرط عدم وابستگی مصرف.
4. `POST /api/purchases/{id}/costs` برای افزودن cost fact کنترل‌شده؛ `POST .../landed-cost/finalize`; `POST .../reopen` با مجوز ویژه، actor, reason, RowVersion و revision. هزینهٔ جدید به نسخهٔ جدید برود.
5. `GET /api/purchases/{id}/history-readiness` یا preview validate: invoice/line/receipt/cost totals, duplicate, contract/rate gaps, overreceipt, date dependency, posting mode. Preview فقط advisory؛ قفل و validation نهایی داخل transaction.
6. `POST /api/sales/{id}/post` فعلی با rowVersion/transaction/retry باقی بماند، ولی layer query واجد `FifoEffectiveDate <= SaleDate` و existing lock/index semantics جدید باشد. Sale reversal نباید adjustment تاریخی را silently بازنویسی کند.
7. دریافت وجه/چک: endpoint/command allocation چندسندی به payment schedules با rowversion/account lock و total invariant؛ `MoneyDocument` existing post و check state transition حفظ شود.
8. فایل‌ها: attachment parent allowlist، permission، existing ownership checks و A7 validation برای WarehouseReceipt توسعه یابد؛ فایل را با لیست API حمل نکنید.
9. مجوزهای جدا یا review‌شده: `purchases.create/edit/post`, `warehouseReceipts.view/create/edit/post/reverse`, `landedCosts.finalize/reopen`, `sales.post`, finance/check permissions. هیچ bypass از controller فعلی یا permission-based row scope حدسی انجام نشود.

`PostingService` را به application serviceهای transaction-bound (invoice confirmation, receipt posting, cost version, sale posting) تفکیک دهید؛ اما API فعلی `PostPurchaseAsync` را در adapter سازگاری نگه دارید تا callerهای `PurchasesController`/`CommerceController` و تصمیم future PO ناگهان تغییر رفتار ندهند. adapter باید mode را بررسی کند و دقیقاً یک receipt با تاریخ عملیاتی جاری/مقدار قبلی بسازد، یا تا migration consumerها رفتار legacy داشته باشد؛ تاریخ invoice را به‌عنوان receipt فرض نکند.

## 6. دو روش تاریخچه و علت انتخاب

| معیار | A. بازپخش chronological در staging | B. ثبت incremental و recalculation کنترل‌شده |
|---|---|---|
| الگوریتم | invoice/receipt/costها را با تاریخ business import کنید؛ ابتدا همهٔ ورودی‌ها reconcile، بعد فروش‌ها به ترتیب تاریخ؛ هر sale فقط از stock واجد تاریخ مصرف کند؛ خروجی snapshotها مقایسه شود. | هر سند هنگام کشف وارد محیط زنده شود؛ اگر receipt عقب‌تر از فروش قطعی است، lineage و تمام sale/cost/partner dependentها را trace، reverse و دوباره post یا adjustment کنید. |
| حفاظت sale allocations | allocationها روی clone ساخته می‌شوند؛ نتیجهٔ نهایی تا cutover از دادهٔ عملیاتی جداست. | خطر تغییر allocation فروش‌های قطعی و اثرهای PartnerLedger/claims زیاد؛ به event graph و replay versioned نیاز دارد. |
| پیچیدگی/rollback | pipeline/reconciliation جدا، اما یک‌بار؛ در صورت شکست clone حذف/اصلاح و از ابتدا replay می‌شود؛ production دست‌نخورده. | نیازمند reversal compensation چندaggregate، نسخه‌بندی valuation، lock گسترده، ordering، conflict/idempotency و rollback پیچیدهٔ مالی. |
| Fit برای DB حاضر | مناسب: inventory/movement/partner ledger/contract نسخه‌دار صفر و purchase/saleها Draft هستند. | نامناسب تا وقتی وابستگی‌های گذشته در حجم واقعی و numeric claims روشن نشده‌اند. |

**انتخاب:** روش A برای catch-up اولیه. دادهٔ فعلی target DB صفر posting دارد، اما Draftها و یک invoice مغایر باید قبل از استفاده طبقه‌بندی/تطبیق شوند. staging باید clone قابل‌بازیابی باشد، نه DB واقعی یا یک database تازهٔ بدون lineage. Method B فقط برای operational future: permit safe forward-date transactions; backdate that crosses dependent posted sales is blocked until a separately designed audited replay/adjustment capability is approved.

## 7. Backup، staging، migration و rollback

1. مالک/DBA از DB واقعی backup امن و verified تهیه کند؛ restore drill به disposable SQL DB انجام دهد و schema/data counts و login boundaries کنترل شوند. backupهای قبلی proof of restore نیستند؛ A8 در Master هنوز deferred است.
2. baseline پس از restore بگیرید: migration history، counts/statusها، invoice header/line totals، stock/layers/movements، posted sales, costs, partner balances, check/money totals و duplicate/orphan report. یک anomaly invoice به‌طور خودکار اصلاح نشود.
3. Migrationها additive و forward-only تا حد ممکن: receipt/line، OriginLot، effective FIFO date/source، source link/idempotency index، cost version/allocation, contract/rate references. existing PurchaseInvoice/PurchaseContainer/Layer/Movement و attachment حذف یا rename نشوند.
4. Data bridge: برای هر layer قدیمی، `FifoEffectiveDate` را از actual evidence تعیین کنید؛ اگر فقط `ReceivedAtUtc` موجود است، آن را با source marker `LegacyPostingTimestamp` نگه دارید و به‌عنوان تاریخ واقعی جا نزنید. orphan/نامعلوم در quarantine/review قرار گیرد، نه مقدار حدسی.
5. از rollback schema پیش از ورود دادهٔ immutable مالی استفاده کنید. بعد از posting، rollback عملیاتی با reversal/replay و reconciliation است؛ migration Down نباید receipt/ledger/lot را drop کند. backup بازگردانی جایگزین compensating journal پس از cutover نیست.
6. هر SQL integration test روی DB یکتا و disposable تحت guard prefix/GUID مشابه harness فعلی باشد؛ owner DB `YarnTrade` هیچ‌گاه target تست، migration، reset یا cleanup قرار نگیرد.
7. promotion از staging با manifest، mapping IDها، totals/checksums، exception list و approvals انجام شود. واردسازی باید idempotent باشد (external source key یا batch/source checksum یکتا). cutover فقط یک بار با transaction boundaries تعریف‌شده و امکان resume بررسی‌شده.

## 8. سناریوهای عددی برای تصویب (اعداد صرفاً ورودی نمونه‌اند)

برای هر ردیف مالک باید مبلغ capital، claim، COGS، payable/receivable، FX gain/loss و موجودی نهایی مورد انتظار را امضا کند. هیچ خروجی فرمولی در این سند از پیش فرض نشده است.

| سناریو | ورودی نمونه | تصمیم/نتیجه‌ای که مالک باید صریحاً مشخص کند |
|---|---|---|
| خرید، دو receipt، فروش میان‌مرحله‌ای | فاکتور 10,000 kg، قیمت 2.00 USD/kg، Receipt A=6,000 kg در 1403/01/10، Receipt B=4,000 kg در 1403/01/20؛ فروش 2,000 kg در 1403/01/15 و 5,000 kg در 1403/01/25 | کدام لایه‌ها مجازند؛ تاریخ مؤثر، ترتیب same-day و باقی‌مانده؛ کسر/اضافهٔ receipt، liability تأمین‌کننده و مسئول کسری. |
| کرایه/ترخیص با تاریخ پرداخت متفاوت | freight=1,200 USD (مسئول پیشنهادی Chinese; paid 1403/01/25)، clearance=300,000,000 IRR (paid 1403/02/02، نرخ مستند نمونه 500,000 IRR/USD) روی دو receipt بالا | allocation به وزن/CBM/ترکیب، نرخ قابل استفاده، آیا هزینه پس از فروش به saleهای 15 و 25 فروردین adjustment می‌دهد، چه مقدار در stock مانده و چه مقدار claim/capital است. |
| دریافت کمتر از فاکتور | فاکتور 10,000 kg؛ receipt واقعی 9,800 kg؛ 200 kg اختلاف؛ بدون PO | آیا invoice payable همان 10,000 است یا receipt variance آن را تغییر می‌دهد؛ supplier claim/credit note، مجوز تأیید، status و deadline پیگیری. |
| نقد در برابر اعتباری | از یک lot، 300 kg cash با قیمت 3.00 USD equivalent/kg و 200 kg credit با قیمت توافقی 3.30، schedule 60 روزه و یک چک؛ هزینهٔ پایهٔ lot 2.00 USD/kg | principal، share از سود، credit premium، زمان entitlement و زمان payable (sale, collection, due date یا settlement)، مسئول برگشت چک. |
| چک برگشتی و فروش برگشتی | از فروش اعتباری 200kg، بعد 60 روز چک bounce شود؛ 50kg کالا قبل از خرید ارز شریک برگردد و 20kg بعد از تبدیل ارز برگردد | موجودی و Original FIFO cost، بازگشت principal/profit/premium، مسئول زیان/ریسک پس از grace، تفاوت قبل/بعد از FX purchase. |
| خرید ارز و حواله با نرخ متغیر | claim نمونه 1,000,000,000 IRR؛ خرید 2,000 USD با نرخ 500,000 IRR/USD؛ حواله 1,500 USD در تاریخ بعد و نرخ بازار نمونه 520,000 | مقدار claim تبدیل‌شده در event خرید ارز، ماندهٔ IRR/USD کیف پول، مسئول FX risk، recognition حواله در sent/confirmed/قاعدهٔ دیگر، و اضافه/کسری. |
| هزینه بعد از مصرف کامل lot | بعد از فروش تمام 1,000kg یک lot، هزینهٔ گمرک 100,000,000 IRR با رسید مدرک دیررس ثبت شود | این هزینه به چه دوره/طرف/سندی نسبت می‌گیرد؛ sale/partner claim چگونه تعدیل می‌شود؛ دوره reopen می‌شود یا adjustment current-period؟ |
| اضافه‌حواله | claim payable=1,000 USD؛ partner settlement=1,100 USD؛ allocationهای تسویهٔ اصلی کامل‌اند | 100 USD به current account/credit partner یا refund/claim جدید؟ Master پیشنهاد carry-over را ثبت کرده، اما owner باید سناریوی دقیق را تأیید کند. |

این نمونه‌ها تمام تصمیم‌های عددی DB-06 را جایگزین نمی‌کنند: cash sale، credit/check sale، bounced check، خرید USD پس از تغییر FX، return قبل/بعد از خرید ارز، discounting، over-remittance. کدنویسی F1-F7 تا تصویب هر خروجی متوقف بماند.

## 9. UI حداقلی با Form Laboratory

فقط دو صفحه/حالت در مسیر خرید تعریف شود؛ فرم‌های اشخاص، برند، نخ، گروه کالا، انبار، قرارداد و Lab فعلی تغییر نکنند.

### فاکتور خرید

- فهرست paginated جستجو بر شماره داخلی/خارجی، تاریخ فاکتور، تأمین‌کننده، وضعیت capture، بدون شرط PO.
- editor header: شماره داخلی/خارجی، تاریخ فاکتور، تأمین‌کننده (lookup `/api/system-lookups/persons` با constraint supplier)، برند در صورت نیاز، currency, buyer/order/B-L, ports/terms, notes و پیوست فاکتور.
- detail grid: line no, شرح سند مبدأ, Yarn lookup، specification/unit، invoice net/gross/package، unit price و total. همهٔ جمع‌ها سرور محاسبه و با سند منبع نمایش داده شوند.
- container/B-L grid از `PurchaseContainer` و associationهای موجود، و هزینه‌های مستند با تاریخ، ارز، نرخ و مسئول؛ نشانگر «هزینهٔ نهایی/موقت» بعد از تأیید policy.
- اقدامات مرحله‌ای: ذخیرهٔ Draft، بررسی مغایرت، تأیید فاکتور، نمایش receiptهای linked، گزارش balance. F3/RowVersion/پیام conflict از استاندارد فعلی.

### رسید واقعی انبار

- create از فاکتور تأییدشده؛ warehouse lookup فقط فعال؛ تاریخ receipt مستقل از invoice date؛ شماره رسید/مرجع برگهٔ ورود.
- detail line: invoice qty, previously received, current actual qty, remaining expected, actual gross/package, container, discrepancy reason/attachment. quantity edit is permitted only in Draft; variance confirms with actor/reason.
- live preview shows date-correct FIFO eligibility and available-to-sale effect; receipt posting no implied supplier invoice edit.
- receipt list tied to invoice, status Draft/Posted/Reversed, technical created/posted times, actor and audit. Reverse action unavailable after dependent sale allocations.

هر صفحه با `frontend/src/components/base-form/BaseFormShell`, `OperationalFormFrame`, `BaseFormGridBoundary`, shared lookup/date/keyboard standards ساخته شود؛ از مسیر standalone `purchases` و contract موجود در `operationalFormCatalog.ts` شروع شود، اما schema design جای backend API و rule validation را نگیرد. دو فرم/نسخهٔ design در Lab جدا نسخه‌بندی و فقط پس از actual route/API implementation، test acceptance و receipt `{formId,releaseId,digest,route}` در registry عملیاتی تلقی شوند. Route فعلی CommercePage برای سفارش حفظ بماند.

## 10. طبقه‌بندی الزامات

### الزام‌های قطعی از Master و درخواست مالک

- Invoice, receipt, sales date, FX/cost date و technical timestamps جدا باشند؛ PO برای ثبت تاریخچه لازم نیست.
- Actual receipt quantity/date و partial/discrepancy مستقل از supplier invoice باشد.
- Origin lot, append-only movement/reversal, deterministic date-aware FIFO و no negative stock؛ فروش از receipt آینده مصرف نکند.
- Cost snapshots/approval/reopen و audit؛ claim و capital جدا؛ contract effective-date immutable reference.
- حفظ purchase invoice data، attachments/legacy tables، posting transaction/RowVersion/retry/FIFO locks، فرم‌های تأییدشده و مسیر آیندهٔ PO/shipment.
- هیچ replay/backfill یا اصلاح مالی بی‌ردپا؛ POs/proforma/full shipment خارج از مرحلهٔ اول.

### موارد نیازمند تأیید مالک قبل از کد

- کدام تاریخ روی اصل رسید معتبر است و timezone/ساعت receipt؛ ترتیب چند تحویل یک روز.
- معیار over/under receipt، تلورانس، مسئول کمبود/ضایعات و وضعیت credit note/payable.
- CostType→weight/CBM allocation، کسر/rounding، حد اختیار manual override، cost receipt/cutoff و late-cost financial period.
- همهٔ تصمیم‌های Section 12 مرتبط: FX risk، commission debtor، accounting boundary، maximum claim wait، loss/damage bearer، supplier payment vs shipment partner participation، remittance recognition point، go-live/opening sources، تفکیک delivery order/invoice. TDE نیز در go-live/production باید تصمیم شود.
- عددهای مورد انتظار هر سناریوی جدول و نسخه‌های historical contract/share rules/Investor identities.
- same-day order when document has no time, and exact operator right to confirm variances/finalize/reopen.
- workflow status split/compatibility: field/migration semantics بین legacy combined purchase و dated receipt.

### بهبودهای اختیاری قابل تعویق

- Shipment/proforma/container loading workbench کامل، carrier/multistage route planning و form مرجع ظرفیت بار طبق قرارداد transport-loading.
- بارکد package/bale، scan flow، transfer two-step، sales-center commission workflow، notification channels، XML/import engine عمومی، automatic ML anomalies و full GL.
- incremental automatic replay across already posted sales; تا تصویب جداگانه نباید شروع شود.

## 11. ریسک‌ها و معیار پذیرش سطح معماری

- **P0 — تاریخ FIFO:** فیلتر تاریخ و index/SQL lock ممکن است A6 query/index plan را خراب کند؛ باید روی SQL واقعی و RCSI OFF/ON با concurrent writer/regression پوشش یابد.
- **P0 — double posting/status semantics:** legacy endpoint، receipt posting، sale reversal و retries نباید movement/ledger duplicate بسازند.
- **P0 — financial ambiguity:** قرارداد و investorهای DB صفرند و Master فاز F را تا approval منع می‌کند.
- **P1 — legacy date inference:** `ReceivedAtUtc` موجود تاریخ عملیاتی قابل اثبات نیست؛ علامت‌گذاری proxy، گزارش exception و عدم جعل تاریخ لازم است.
- **P1 — cost after sale:** هزینهٔ دیررس، layer باقی‌مانده و COGS/claim فروخته‌شده را جدا می‌کند؛ sale snapshots immutable بمانند.
- **P1 — data quality:** invoice مغایر 113,893.43 USD و Draftهای ناشناخته؛ پیش‌نیاز ورود/تصمیم owner است.
- **P1 — attachment/security:** allowlist، permission و parent ownership برای receipt؛ new endpointها RowVersion و actor authenticated.
- **P2 — reference UI:** design Lab بدون API/DB acceptance نباید operational اعلام شود.

پیش از پذیرش پیاده‌سازی: هر migration روی clone/disposable، exact SQL concurrency test و query plan، purchase-vs-receipt idempotency، partial/over/under receipt validation، chronological sale examples، backdated dependency rejection، late cost version/immutability، duplicate import resume، check receipt allocation, financial numeric examples owner-signed، and full reconciliation of quantity/USD/IRR/partner balances.
