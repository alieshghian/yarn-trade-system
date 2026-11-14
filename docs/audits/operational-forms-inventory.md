# فهرست فرم‌های عملیاتی و Form Laboratory

**مبنای سورس:** `009e0f28e71d835e97d8ab94e0c3e6e87d3fee0f`
**تاریخ:** 2026-11-15

## قرارداد آزمایشگاه با اجرای عملیاتی

`frontend/src/FormLaboratoryPage.tsx` و اجزای `frontend/src/components/base-form/` طراح و پیش‌نمایش فراهم می‌کنند. `form-integration-handoff.md` قرارداد receipt را با `formId`, `releaseId`, `digest`, `route` شرح می‌دهد. وجود طرح ذخیره‌شده در آزمایشگاه به‌تنهایی به معنی renderer/API عملیاتی یا فعال‌شدن خودکار فرم نیست؛ برای اتصال، باید طراحی نسخه‌دار، پیاده‌سازی route/API/DB و تست پذیرش داشته باشد.

`frontend/src/components/base-form/formIntegrationRegistry.ts` شاهد ثبت رسیدهای صریح است. در snapshot بررسی‌شده برای yarn و productGroups ورودی‌های نسخه‌دار قابل مشاهده‌اند. Catalog (`operationalFormCatalog.ts`) شناسنامهٔ آزمایشگاه است، نه الزاماً فهرست دقیق fieldهای runtime. به‌خصوص `purchases` در خود Catalog با وضعیت `partial` و مسیر مستقلی که صفحهٔ کامل نداشته باشد ثبت شده است.

## فرم‌ها

| فرم | Route/کامپوننت | API/entity | طرح صاحب‌تأییدشده/رسید | ارزیابی و ریسک |
|---|---|---|---|---|
| اشخاص | منوی `persons`؛ `frontend/src/PersonsPage.tsx` | `/api/master-data/persons`, parameters, brands؛ `Person`, ارتباط برند | `frontend/src/components/base-form/specs/persons.golden.v1.json` مرجع UI طلایی است؛ در رسید registry همانند yarn/product group، مدرک انتشار مستقل این ممیزی ندید. | operational است؛ فیلدهای شخص، موبایل، عنوان/نقش، برندها؛ رابطهٔ برند را با قید unique مالکیت تطبیق دهید. تست‌های API/component موجودند؛ کل suite اجرا نشد. |
| گروه کالا | `frontend/src/forms/ProductGroupOperationalPage.tsx` | `/api/master-data/product-groups`; ProductGroup و رده‌ها | receipt در registry: `form.new.8e77aae6-9477-41f9-b473-9d52511535a1`, release `71bde8e8-51d2-4d93-b73a-a8bab7f687cc`؛ طرح در `frontend/src/forms/product-group-design.json` | اتصال عملیاتی/تست handoff موجود است؛ ساختار گروه در دادهٔ واقعی master به کار می‌رود. محدودیت ویرایش/حذف گروه‌های دارای گردش طبق catalog ثبت شده. |
| برند | `frontend/src/BrandsPage.tsx` با انتخاب view طراحی‌شده | `/api/master-data/brands`; Brand, PersonBrand | `frontend/src/forms/brand-design.json`, id `form.redesign.805deb77-bec5-41fa-af97-77b7007ca3a4`; `docs/brand-operational-integration.md` آن را مرجع کپی‌شده از خروجی مالک معرفی می‌کند. | طرح عملیاتی فعلی سه فیلد code/name/description را نشان می‌دهد، در حالی که `address` در داده/API وجود دارد و ممکن است در view پنهان باشد. `brand-form-redesign-review-fa.md` قدیمی‌تر می‌گوید هنوز متصل نیست؛ این با integration doc و کد جدیدتر تعارض زمانی دارد. Snapshot قدیمی `docs/brand-form-design-snapshot.json` مرجع فعال تلقی نشود. |
| نخ | `frontend/src/ApprovedYarnsPage.tsx` از مسیر منوی yarns به‌جای YarnsPage قدیمی | `/api/yarns`; YarnItem و group/color/reference/packaging coefficient | `artifacts/yarn-operational-integration/approved-design.json` (id `form.redesign.f743b7d0-d9f9-49e0-a7a8-bb05a00ddde1`, release `a348e3e7-ae39-4ff6-b701-7dc55c3201c5`, digest در receipt); code companion `frontend/src/forms/yarn-approved-design.json`; `yarn-operational-acceptance.json` | قوي‌ترین سند تأیید طراحی و release در repo است؛ migration `20261113000000_YarnApprovedDefinition` حاوی جدول‌های وابسته. Master data API/runtime و تست‌های تعریف نخ وجود دارند. artifactهای آزمایشی کنار approved JSON را فعال ندانید. |
| انبار و ناحیه | `frontend/src/WarehousesPage.tsx`, `frontend/src/WarehouseZones.tsx` | `/api/warehouses`, `/api/warehouses/grid`; Warehouse, Zone, Floor و ساختار نگهدارنده | `frontend/src/forms/warehouse-design.json`, `warehouse-zone-design.json`; رسید صریح مثل yarn در registry احراز نشد. | route/API عملیاتی و تست‌های zone/batch/grid در سورس/آرشیو موجود است؛ وضعیت هم‌ارزی بصری دقیق با نسخهٔ مالک از خود فایل schema به‌تنهایی قطعی نیست. انتقال موجودی/receipt را این فرم پیاده نمی‌کند. |
| قرارداد کسب‌وکار | `frontend/src/BusinessContractPage.tsx` | `/api/business-contracts`; BusinessContractVersion و قواعد | فرم React/API عملیاتی است؛ receipt آزمایشگاه مجزا مشاهده نشد. | نسخه‌بندی تاریخ مؤثر و قفل/اصلاحیه وجود دارد. قواعد مالی و تاریخچهٔ قرارداد حساس‌اند و قبل از دادهٔ تاریخی باید gapها و تصمیم‌های مالک تکمیل شود. |
| خرید/فاکتور | `frontend/src/CommercePage.tsx`; Catalog هم مسیر commerce را operational می‌نامد | `/api/commerce/*`, `/api/purchases`, attachments؛ `PurchaseOrder`, `PurchaseInvoice`, line, container, cost | طراحی approved منفصل با handoff/route خرید در registry مشاهده نشد. Catalog برای `purchases` می‌گوید `partial`; CommercePage منبع خرید فعلی است. | فرم فعلی با طرح lab یکسان نیست مگر اتصال مشخص جداگانه طراحی شود. API خرید مستقل موجود است، ولی UI مستقل کامل ندارد. بازطراحی فرم به معنی تغییر ناخواستهٔ posting/API نباشد. |

## تناقض مستندات و تصمیم تشخیصی

- `docs/brand-form-redesign-review-fa.md` را باید به عنوان بررسی قدیمی نگه داشت، نه مدرک وضعیت runtime امروز؛ `docs/brand-operational-integration.md` و کد BrandsPage شواهد جدیدتری از استفادهٔ عملیاتی می‌دهند.
- در Master آمده اولین فرم عملیاتی تأییدشده باید مرجع UX شود (H3). Receipt/acceptance برای yarn یا product group، خودبه‌خود معماری generic-renderer برای تمام فرم‌ها ایجاد نکرده است.
- طرحی که در ابزار پیش‌نمایش می‌شود ممکن است فاقد API/entity عملیاتی یا به‌روزترین نسخه باشد. برای بازطراحی خرید: ابتدا از source fields/API و business rules یک contract مصوب استخراج، نسخهٔ طرح را ثبت، سپس پیاده‌سازی UI/API را جدا و با digest/route واقعی تأیید کنید.

## طبقه‌بندی حفاظت

- **حتماً نگه دارید:** فرم/route/API/entity فعال، migrationهای وابسته، design JSON با digest/receipt معتبر، handoff قرارداد، golden spec، تست‌های route/API/persistence و acceptance.
- **مرجع فعال:** Yarn approved design+acceptance و ProductGroup receipt؛ Brand operational design و schemaهای عملیاتی باید همراه کد runtime نگه داشته شوند.
- **تاریخی، نه قابل حذف خودکار:** snapshotها، review قدیمی، exportهای owner و `artifacts/*` که provenance یا recovery دارند. تفصیل در `cleanup-candidates.md`.

## حد راستی‌آزمایی

مسیرها، رجیستری، کد صفحه، JSONها و تست‌های موجود بررسی شدند. UI در runtime باز نشد، database migrations اجرا نشد و screenshotهای artifact به‌عنوان وضعیت جاری بصری دوباره مقایسه نشدند. «هم‌ارزی کامل با نسخهٔ مالک» فقط با نسخهٔ مرجع، runtime و تست پذیرش ثابت می‌شود.
