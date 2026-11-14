# موجودی فایل‌ها و نامزدهای پاکسازی

**اصل ممیزی:** در این کار هیچ فایل حذف، جابه‌جا یا تغییرنام داده نشده است. فایل‌های untracked/ignored، backupها و خروجی‌ها دست‌نخورده می‌مانند تا مالکیت و ارزش recovery روشن شود.

## A. وابستگی‌های عملیاتی — حتماً نگه‌داری شوند

| مسیر/خانواده | دلیل وابستگی |
|---|---|
| `frontend/src/` routeها، API client، صفحات و اجزای Form Laboratory | runtime عملیاتی یا مسیر طراحی/اتصال فرم‌ها. |
| `src/YarnTrade.Api/` شامل Domain, Controllers, Services, Data | قرارداد API، entity، posting، امنیت و EF mapping. |
| `src/YarnTrade.Api/Data/Migrations/` و `AppDbContextModelSnapshot.cs` | تاریخچهٔ schema و مدل EF؛ پاکسازی آن‌ها migration را از زنجیره خارج می‌کند. |
| `tests/` و workflowهای `.github/` | تست‌های محافظ و مسیر CI. |
| `frontend/src/forms/brand-design.json`, `yarn-approved-design.json`, `product-group-design.json`, `warehouse-design.json`, `warehouse-zone-design.json` | مرجع/همراه فرم عملیاتی و design schema که کد به آن ارجاع می‌دهد. وضعیت هر کدام در [inventory](operational-forms-inventory.md). |
| `docs/form-integration-handoff.md`, `form-laboratory-*-contract.md`, `transport-loading-contract.md`, `yarn-operational-integration.md`, `brand-operational-integration.md`, `product-group-laboratory-handoff.md` | قرارداد، provenance/receipt، و قیود طراحی/عملیاتی. |
| `frontend/src/components/base-form/specs/persons.golden.v1.json` | مرجع طلایی UX اشخاص، نه لزوماً schema ذخیره‌شدهٔ عملیاتی. |

## B. آخرین طرح/رسیدهای تأییدشده — حتماً نگه‌داری شوند

- `artifacts/yarn-operational-integration/approved-design.json` و receiptهای مرتبط (`yarn-operational-acceptance.json`, `operational-acceptance.json`): شواهد id/release/digest نسخهٔ تأییدشدهٔ نخ.
- `frontend/src/forms/yarn-approved-design.json`: companion مورد استفادهٔ runtime.
- `frontend/src/forms/product-group-design.json` و ثبت receipt در `formIntegrationRegistry.ts`: طرح گروه کالا.
- `frontend/src/forms/brand-design.json` همراه `docs/brand-operational-integration.md`: طرح مورد استفاده و provenance برند.
- فایل‌های انبار در بخش A تا تعیین اینکه آیا artifact مستقلی به‌عنوان آخرین تأیید مالک وجود دارد.

«آخرین» بر مبنای ارتباط کد/registry/doc و شناسهٔ نسخه است، نه filesystem timestamp.

## C. قراردادهای ادغام و تست‌های محافظ — حتماً نگه‌داری شوند

- `frontend/src/components/base-form/formIntegrationRegistry.ts` و فرم‌های contract/schema مرتبط.
- `docs/form-integration-handoff.md`, `docs/form-laboratory-geometry-contract.md`, `form-laboratory-layout-preview-contract.md`, `form-laboratory-toolbar-contract.md`, `laboratory-form-builder.md`, `laboratory-label-translation.md`, `laboratory-system-lookup.md`.
- تست‌های `tests/YarnTrade.Tests` و تست‌های frontend مربوط به persistence, migration/handoff, route, geometry, import/export و regression.
- SQL migrations و مستندات هزینه/حمل/محاسبات.

## D. تاریخی و مناسب آرشیو پس از تعیین سیاست — فعلاً نگه‌دارید

| مسیر نمونه | چرا تاریخی/مناسب آرشیو است | شرط تصمیم |
|---|---|---|
| `docs/brand-form-design-snapshot.json` | snapshot بزرگ طراحی/بازیابی است؛ کد اجرایی به آن نیاز مستقیم نشان نداد، ولی ممکن است مرجع تاریخی مالک باشد. | بررسی provenance و تأیید مالک. |
| `docs/brand-form-redesign-review-fa.md`, `docs/project-assessment.md` | گزارش‌های تاریخ‌دار که ممکن است با کد جدیدتر ناسازگار باشند؛ حذفشان شواهد تصمیم قبلی را از بین می‌برد. | علامت‌گذاری status/تاریخ یا انتقال به آرشیو با تأیید. |
| `artifacts/*before-*`, `*-review-*`, snapshots, ZIP/PNG/JSON | evidence از iterations و تأیید بصری/مالک، گاهی فقط recovery. | تثبیت دسترسی، backup و تعیین ماندگاری. |
| `backups/` و فایل‌های migration/DB محلی | ممکن است دادهٔ واقعی یا قابلیت بازیابی داشته باشند. | صاحب داده، سلامت backup و retention معلوم شود. |

## E. خروجی تکرارپذیر — نامزد پاکسازی در آینده، نه الان

در این working tree تعداد زیادی untracked log، browser preview، `bin/obj`, `test-bin`, build/test results، screenshot و temporary output دیده می‌شود. نمونه‌ها: root `*-validation.log`; `frontend/review-*.log`; `artifacts/*-validation.log`; `artifacts/*/bin/`; `frontend/form-lab-export.html`; `frontend/form-lab-repair.html`; stdout/stderrهای `*-local.log`.

برخی خروجی‌ها می‌توانند شاهد آخرین run یا diagnostic باشند و بعضی قابل بازتولیدند. تا قبل از حذف باید مشخص شود آیا هنوز process از آن‌ها استفاده می‌کند، evidence تستِ مورد نیاز باقی می‌ماند، فایل contain secret/data دارد، و نسخهٔ پاک/backup امن وجود دارد. هیچ موردی در این گزارش حذف یا stage نشده است.

## F. مبهم — حذف/انتقال ممنوع تا بررسی مالک

- `CON` در ریشه: نام رزرو شدهٔ Windows؛ محتوا/مقصدش در این ممیزی بازخوانی نشد.
- `artifacts/apply-brand-owner.sql`: احتمالاً SQL اعمال تغییر مالک است؛ اجرای ناخواسته می‌تواند مخرب باشد. فعلاً فقط محافظت شود.
- `artifacts/GlobalTrade-ChatGPT-Review-20261108.zip` و `review-artifacts/`: ممکن است شامل سورس، داده یا اسناد حساس باشند.
- `artifacts/yarn-operational-integration/*`, `artifacts/product-group-*`, `artifacts/warehouse-*`: ترکیبی از طرح پذیرفته، گزارش validation، لاگ و فایل آزمایشی است؛ پاکسازی بر اساس الگوی نام/پسوند امن نیست.
- `api-local.*`, `frontend/*local.*`, startup logs: محتوا ممکن است connection string، token یا log دادهٔ کاربر داشته باشد؛ در این ممیزی برای stage باز نشده‌اند.
- تمام فایل‌های خارج از git status tracked source و ignore-list: پیش از پاکسازی باید مالکیت، حجم، محتوای حساس، و نیاز recovery تعیین شود.

## نتیجهٔ housekeeping

این working tree دارای انبوه untracked/ignored محلی است و نباید با `git add .` یا `git clean` مدیریت شود. برای ثبت این ممیزی فقط پنج فایل جدید `docs/audits/*.md` را stage کنید. هیچ فایلی از موارد فهرست بالا در گزارش‌ها commit نمی‌شود. فهرست دقیق اسامی محلی را در `git status --short` نگه دارید؛ تعدادها ممکن است بعداً تغییر کند.
