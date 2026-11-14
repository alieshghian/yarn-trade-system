# انتخاب از فرم مرجع در آزمایشگاه

مرجع اجرا: `base-form.system-lookup` و `SystemLookup`؛ قرارداد قابل صدور: `systemLookupContract` در manifest خروجی JSON.

قالب فهرست‌های تلفن، موبایل، آدرس و عنوان از `NumberControl` مشترک است و `contactListContract` در manifest صادر می‌شود: تیک پیش‌فرض برای ردیف‌های موجود و جدید، یک پیش‌فرض، ویرایش و حذف با رعایت مجوزها، حذف ردیف ثبت‌نشده، متن خوانا و دکمه‌های فشرده با ثبت سبز F3. انتقال فهرست به لایهٔ شناور نباید این سبک و امکانات را حذف کند. تنها ورودی‌های تلفنی پیش‌شماره دارند؛ تنظیمات ظاهری مجاز هر فهرست حفظ می‌شوند.

- پنجرهٔ فرم مرجع پس از آماده‌شدن خود فرم ظاهر می‌شود؛ هنگام بارگیری کد فرم، قاب سفید خالی نمایش داده نمی‌شود. در حالت نمایش و با ردیف انتخاب‌شده، Enter همان عمل دکمهٔ «انتخاب» را انجام می‌دهد؛ هنگام تایپ در جستجو، ورود یا ویرایش، Enter رفتار همان کنترل را حفظ می‌کند.

- طراح، فرم منبع را در «تنظیمات کامپوننت در این فرم ← فرم منبع اطلاعات» انتخاب می‌کند. `lookupSettings.sourceId` در سند ذخیره می‌شود؛ اتصال به URL دلخواه یا ذخیرهٔ متن آزاد مجاز نیست.
- مقدار، شناسهٔ پایدار رکورد منبع است؛ نمایش، کد و نام در یک فیلد با ارتفاع معمولی است. جستجو صفحه‌بندی‌شده و از منبع اصلی انجام می‌شود.
- اولین نتیجه پس از رسیدن پاسخ جستجو نشانگر انتخاب دارد؛ بالا/پایین نشانگر را جابه‌جا می‌کند و یک Enter انتخاب می‌کند. تمرکز تایپ در جستجو باقی می‌ماند. دکمهٔ ایجاد با عنوان Insert داخل فهرست، حتی در حالت بدون نتیجه، با رعایت مجوز ایجاد نمایش داده می‌شود.
- گزینهٔ خالی، بدون ارتباط است؛ هیچ رکورد ساختگی با نام «بدون برند» ایجاد نمی‌شود.
- فشردن Insert به‌تنهایی و بدون تکرار با مجوز ایجاد، خود فرم منبع را در حالت ایجاد باز می‌کند. Shift به‌تنهایی یا همراه کلیدهای دیگر فرمان ایجاد نیست. Insert فقط متعلق به کامپوننت فعال است و فرمان ویرایش فرم میزبان را اجرا نمی‌کند. در فرم برند، F3 فقط ثبت می‌کند؛ پنجره و جدول باز می‌مانند و ردیف ذخیره‌شده انتخاب می‌شود. ویرایش، ثبت مجدد و مرور رکوردها در دسترس‌اند. دکمهٔ مستقل «انتخاب» فقط در حالت نمایش، رکورد انتخاب‌شده را به میزبان برمی‌گرداند؛ اطلاعات ذخیره‌نشدهٔ میزبان محفوظ می‌ماند. انصراف انتخاب قبلی را حفظ می‌کند.
- F3 در پنجرهٔ فرم منبع، فقط دکمهٔ ثبت همان پنجره را اجرا می‌کند؛ فرم میزبان یا تب غیرفعال فرمان را دریافت نمی‌کنند. بازگشت، شخص را ثبت یا از حالت ورود خارج نمی‌کند و فوکوس را به فیلد بعدی می‌برد. یک درخواست ثبت در هر لحظه مجاز است. جدول عادی برندها از ابتدا بارگیری می‌شود، بدون بازنویسی ورودی کاربر؛ کنترل نهایی تکراری‌بودن با API است.
- در فرم اشخاص، برند پیش‌فرض نمایش داده می‌شود؛ انتخاب برند جدید، ارتباط‌های قبلی را حذف نمی‌کند. انتخاب صریح خالی، ارتباط برندهای شخص را پاک می‌کند. خود تعریف برند حذف نمی‌شود.
- برند می‌تواند به هیچ شخصی اختصاص نداشته باشد؛ تخصیص یک برند به دو شخص مجاز نیست. API مالکیت را کنترل می‌کند و شاخص یکتای SQL، رقابت همزمان را متوقف می‌کند. انتخاب برند در خرید از فروشندهٔ دیگر مستقل از مالکیت شخص است.
- مهاجرت `20261109000000_UniqueBrandOwner` در صورت تعارض قبلی متوقف می‌شود؛ هیچ تخصیصی را خودکار حذف یا جابه‌جا نمی‌کند.

آزمون مرورگری: `frontend/tests/person-brand-lookup.browser.mjs` (فرم‌های واقعی اشخاص و برند، پاسخ‌های ساختگی، پروفایل مستقل). آزمون‌های SQL مالکیت فقط دیتابیس موقت با پیشوند `YarnTrade_A4_Test_` را استفاده می‌کنند.

## Linked operational forms and stable search (2026-11-13)

System lookup contract v8 uses the physical Insert key (including key/code fallback), with no Shift/Ctrl/Alt combination or repeated submission. The registered operational form is reused in Create mode. Its tree CSS applies equally in the main route and the document dialog; inherited column geometry must never become search/input height. Browsing preloads the source module. Search keeps a stable viewport, typing focus, cancellation and latest-response ownership; pending results cannot be selected. Source Save/Review/Select and return/cancel preserve the parent draft. A focused composite uses one yellow fill across its input, add and arrow controls.

Numeric suggestions use NumericFieldInput: nonempty prefix, same-field persisted values, unique results capped at 20, explicit Enter/pointer selection, no automatic replacement or record creation. Operational Yarn requests the permission-checked read-only definition-number-options API; Laboratory uses temporary runtime records only. Codes keep their separate approved code rules. The numericSuggestionContract is included in behavior manifests and new JSON exports.

Regression: npm run test:yarn-linked-path:browser (actual Yarn → Product Group source dialog, physical Insert, cancellation, input/search geometry, uniform fill, numeric choice, delayed response ordering and stable popup focus/size).

## Owner correction — 2026-11-14

Insert supports a release-only keyboard driver as well as keydown. A handled press must not run again on release; permissions and popup ownership still apply. Tree entry suggestions include existing siblings instead of hiding the very record a duplicate warning asks the user to select. Selecting one finishes entry, hides Save, restores the selected node focus and performs no create request. Reusing a name from another branch still requires explicit F3 under the current parent. Pending batch entries are retained and must be saved/cancelled before selecting an existing sibling. No build or tests were run for this correction, at the owner's explicit request.

Batch color/value pattern suggestions preserve the digit script of the last entered numeric run: ۱۱۰۰، ۱۲۰۰، ۱۳۰۰ → ۱۴۰۰; 1100, 1200, 1300 → 1400. Prefix, suffix and zero padding remain intact; normalization is only for computation and duplicate comparison. This shared rule is exported as batchValuePatternContract. No build or test execution was requested or performed for this change.

Persian typing mode maps the physical Backslash key to پ; English mode keeps Backslash as \. This applies through the shared fieldTypingLanguage handler to ordinary fields, component entries and searches. Existing stored text is not rewritten. No build or test execution was performed for this correction.

Product Group lookup closed captions show only the root name, without its code or descendants. Hover shows the full selected path; the search list retains code/path context. The selected descendant technical ID and all database bindings remain unchanged. The same rule applies to Laboratory previews using the Product Group source. No build or tests were run, per owner instruction.

### دسترسی واقعی و دکمه‌های مدیریت فهرست
- دکمه‌های ویرایش و حذف هر مورد باید در حالت مشاهده/انتخاب نیز برای نقش مجاز نمایش داده شوند؛ کلیک صریح، مدیریت پیش‌نویس را آغاز می‌کند و نباید هم‌زمان مورد را انتخاب کرده یا پنجره را ببندد.
- مجوز افزودن، ویرایش، حذف و پیش‌فرض مستقل است. افزودن مجاز به معنای حذف مجاز نیست. موارد استفاده‌شده همچنان با کنترل سرور محافظت می‌شوند.
- ذخیره با F3 و انصراف بدون اعمال تغییر؛ همین قرارداد در خروجی JSON با contactListContract نسخه ۲ ثبت می‌شود.
- «فقط مدیر» در کنترل مشترک و مرجع تعریف نخ شامل Administrator و Manager است؛ کاربر عادی همچنان تابع مجوز اختصاصی هر عملیات است.

### ورود عدد و پیشنهاد مقادیر قبلی
- کنترل عددی باید تایپ و چسباندن رقم فارسی، عربی و انگلیسی را بپذیرد؛ پیش از پردازش ورودی عددی مرورگر، رقم‌ها و ممیز عربی به قالب عددی استاندارد تبدیل شوند، بدون از دست دادن مکان نشانگر یا انتخاب متن.
- پیشنهادها هنگام تایپ از مقادیر ذخیره‌شده همان فیلد خوانده شوند؛ انتخاب با Enter یا موس، بدون جایگزینی خودکار متن. دکمه‌های افزایش/کاهش جای تایپ مستقیم را نمی‌گیرند. این قرارداد برای محیط عملیاتی و ورود آزمایشی مشترک است و با numericSuggestionContract نسخه ۲ صادر می‌شود.

- خطاهای سرور با محتوای application/problem+json نیز باید خوانده شوند؛ خطای اعتبارسنجی نباید به پیام عمومی 400 Bad Request تبدیل شود. اگر پاسخ نام فیلد را مشخص کرد، همان فیلد مشخص و پس از فعال‌شدن مجدد کنترل‌ها فوکوس شود. عدد اختیاری نباید به‌صورت null برای ویژگی عددی غیرقابل‌خالی سرور ارسال شود؛ پیش‌فرض قراردادی آن حفظ شود.
