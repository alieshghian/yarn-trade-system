# خط مبنای فرم‌های تأییدشده و عملیاتی

**تاریخ:** 2026-11-15 · **منابع:** `docs/audits/operational-forms-inventory.md`, `frontend/src/components/base-form/formIntegrationRegistry.ts`, `operationalFormCatalog.ts`, assets و صفحات runtime. این سند inventory حفاظتی است؛ UI زنده در این turn دوباره بازبینی نشد.

## اصل محافظت

طرح آزمایشگاه، JSON export، catalog placeholder و operational screen مفاهیم جدا هستند. فقط receipt توسعه‌دهنده برای ترکیب دقیق `formId + releaseId + digest + route` به همراه acceptance می‌تواند handoff را به runtime route وصل کند. طرح جدید یا placeholder نباید فرم صاحب‌تأییدشده، receipt قبلی، API، تست، مجوز یا backup آن را overwrite کند. قبل از هر redesign، نسخهٔ فعال از registry/digest و فایل acceptance استخراج و در PR به‌صورت immutable baseline ثبت شود.

## فرم‌ها و دارایی‌های حفاظتی

| حوزه | latest/مرجع شناخته‌شده در repo | runtime/API | وضع و ریسک |
|---|---|---|---|
| **اشخاص** | `frontend/src/components/base-form/specs/persons.golden.v1.json`; tests: `frontend/src/components/base-form/personsGolden.test.mjs` | `frontend/src/PersonsPage.tsx`; `/api/master-data/persons`, parameters, brands | فرم عملیاتی و Golden Reference. Receipt مستقل در registry در inventory قبلی احراز نشد. Golden را read-only نگه دارید؛ در آزمون هم person data واقعی وارد specification نشود. |
| **برند** | `frontend/src/forms/brand-design.json`; ID `form.redesign.805deb77-bec5-41fa-af97-77b7007ca3a4`; `docs/brand-operational-integration.md` | `frontend/src/BrandsPage.tsx`; `/api/master-data/brands` | runtime عملیاتی دارد. طرح view ممکن است `address` را پنهان کند با وجود وجود آن در API؛ review قدیمی `brand-form-redesign-review-fa.md` با integration doc جدیدتر تعارض زمانی دارد؛ digest/مالکیت را پیش از تغییر تأیید کنید. |
| **گروه کالا** | `frontend/src/forms/product-group-design.json`; form `form.new.8e77aae6-9477-41f9-b473-9d52511535a1`, release `71bde8e8-51d2-4d93-b73a-a8bab7f687cc` | `frontend/src/forms/ProductGroupOperationalPage.tsx`; `/api/master-data/product-groups` | receipt دقیق در `formIntegrationRegistry.ts`; operational. Catalog/endpoint/API regression و row-version را حفظ کنید. |
| **تعریف نخ** | approved `artifacts/yarn-operational-integration/approved-design.json`; form `form.redesign.f743b7d0-d9f9-49e0-a7a8-bb05a00ddde1`; release `a348e3e7-ae39-4ff6-b701-7dc55c3201c5`; companion `frontend/src/forms/yarn-approved-design.json`; `yarn-operational-acceptance.json` | `frontend/src/ApprovedYarnsPage.tsx`; `/api/yarns`; migration `20261113000000_YarnApprovedDefinition` | بالاترین سطح شاهد طراحی + receipt + acceptance در snapshot. artifactهای backup/review کنار آن‌ها نسخهٔ فعال محسوب نشوند. هیچ overwrite/deletion انجام نشود. |
| **انبار** | `frontend/src/forms/warehouse-design.json` | `frontend/src/WarehousesPage.tsx`; `/api/warehouses`, `/api/warehouses/grid` | عملیاتی؛ receipt versioned هم‌سطح Yarn احراز نشده. آزمون SQL/zone و constraints در سورس وجود دارد؛ اجرای تازه انجام نشد. |
| **ناحیه/زون انبار** | `frontend/src/forms/warehouse-zone-design.json` | `frontend/src/WarehouseZones.tsx`; API زیر `/api/warehouses` | operational route/کد وجود دارد؛ lineage approval/receipt جدا بررسی شود. انتقال کالا یا رسید واقعی را انجام نمی‌دهد. |
| **قرارداد کسب‌وکار** | form React فعلی، نه Lab receipt مشخص | `frontend/src/BusinessContractPage.tsx`; `/api/business-contract` | versioned operational form. تعریف/اصلاح نسخه، partner identities و historical effective dates مالی‌اند؛ قبل از ثبت اسناد باید نسخه‌ها پوشش تاریخ را داشته باشند. |
| **Form Laboratory/shared components** | `frontend/src/FormLaboratoryPage.tsx`; `frontend/src/components/base-form/formSchema.ts`, `BaseFormShell.tsx`, `BaseFormSection.tsx`, `BaseFormGridBoundary.tsx`, `formIntegrationRegistry.ts` | synthetic design preview + draft/release/handoff | خود Lab ابزار authoring/preview است، نه business API. Shared components را در فرم عملیاتی با acceptance regression استفاده کنید. |
| **خرید/فاکتور** | approved standalone form + receipt مربوط به route خرید در registry، در اسناد/registry بررسی‌شده احراز نشد | `frontend/src/CommercePage.tsx`; `/api/purchases`, `/api/commerce/*` | CommercePage مسیر مشترک سفارش/بازرگانی است؛ Catalog خرید standalone را `partial` نشان می‌دهد. Placeholder آزمایشگاه را operational اعلام یا جایگزین Commerce نکنید. نیاز به طراحی تأییدشدهٔ جدا و اجرای route/API واقعی دارد. |

## فایل‌ها و تست‌هایی که نباید پاک/overwrite شوند

- `frontend/src/components/base-form/specs/persons.golden.v1.json` و regressionهای Golden.
- `frontend/src/forms/product-group-design.json`, `frontend/src/forms/yarn-approved-design.json`, `frontend/src/forms/brand-design.json`, warehouse/zone design JSON.
- `artifacts/yarn-operational-integration/approved-design.json`, `yarn-operational-acceptance.json`, `rollback-manifest.json` و نسخهٔ companion/receipt دقیق؛ فقط با provenance و lifecycle خودشان.
- `frontend/src/components/base-form/formIntegrationRegistry.ts`, `formSchema.ts`, `laboratoryFormDraftState.ts`, `form-integration-handoff.md` و tests `frontend/tests/`/base-form.
- `docs/brand-operational-integration.md`, `docs/brand-form-redesign-review-fa.md`, review snapshots و recovery artifacts: اسناد قدیمی را حذف نکنید؛ تعارض زمانی را با مرجع فعال/تاریخ حل کنید.

## وضعیت runtime/design

| دسته | فرم‌ها |
|---|---|
| Runtime operational با اتصال API | Persons, Brands, Product Groups, Yarn, Warehouses/Zones, Business Contract (سطح پذیرش متفاوت) |
| دارای receipt release دقیق از Lab | Product Groups، Yarn (Yarn همراه acceptance/replacement evidence) |
| Runtime موجود اما Lab receipt مستقل احرازنشده | Persons, Brands, Warehouses/Zones, Business Contract |
| Partial/design-only برای مسیر مستقل | Purchase invoice/receipt |
| Synthetic-only | preview/data sets داخل Form Laboratory |

### گیت پذیرش فرم جدید

1. baseline فعلی و آخرین asset approved را با hash در PR ثبت کنید.
2. schema شامل field/table IDs و API contracts باشد؛ Catalog جای source of truth runtime نیست.
3. route واقعی، permission، persistence، validation سمت سرور، error/conflict و audit را پیاده و با تست API/UI بپذیرید.
4. regression فرم‌های محافظت‌شده و shared base form اجرا شود.
5. پس از پذیرش، registry receipt دقیق digest/release/route و replacement rollback reference ثبت شود. قبل از آن وضعیت صرفاً design-only است.
