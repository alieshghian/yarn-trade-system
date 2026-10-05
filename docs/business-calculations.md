# محاسبات کسب‌وکار

## قیمت اعتباری

محاسبه خطی و روزشمار است. برای هر بازه:

`PartialRate = PeriodRatePercent × UsedDays / PeriodDays`

`CreditUnitPrice = CashUnitPrice × (1 + TotalRate / 100)`

- 45 روز: `4% + 3% × 15/30 = 5.5%`
- 75 روز: `4% + 3% + 3% × 15/30 = 8.5%`

در حالت قیمت توافقی، قیمت واردشده مرجع است و درصد فقط تحلیل می‌شود.

## سررسید وزنی

`WeightedDueDays = Σ(AmountIRR × DaysFromSale) / Σ(AmountIRR)`

مبالغ USD ابتدا با نرخ ثبت‌شده همان سند به مبنای IRR تبدیل می‌شوند. روز قرارداد، روز وزنی برنامه و روز واقعی وصول مستقل‌اند.

## تخصیص هزینه

`AllocatedCost = TotalApplicableCost × ItemNetWeight / TotalApplicableNetWeight`

آخرین ردیف اختلاف اعشاری با جمع سند را جذب می‌کند. override دستی فقط با audit مجاز است.

## بهای تمام‌شده

- FIFO: قدیمی‌ترین لایه ابتدا مصرف می‌شود.
- LIFO: جدیدترین لایه ابتدا مصرف می‌شود.
- Weighted Average: میانگین وزنی قابل‌بازتولید در زمان posting ذخیره می‌شود.

`UnitTotalUSD = UnitPurchaseUSD + UnitInternationalFreightUSD + UnitIranianImportCostUSD`

`CostIRR = TotalCostUSD × SaleDateExchangeRate`

## سود و سهم شریک

`CashEquivalent = Quantity × CashUnitPrice`

`CreditIncrease = CreditSale - CashEquivalent`

`CashProfitOrLoss = CashEquivalent - CostOfGoodsSoldIRR`

سود نقدی و افزایش اعتبار جداگانه با قواعد نسخه‌دار تقسیم می‌شوند. درصد دو شریک الزاماً 100 است.

## تسویه

هر ارز دفتر مستقل دارد. تبدیل اعتبار IRR به USD فقط با سند تسویه و نرخ همان روز انجام می‌شود. پرداخت بیشتر از استحقاق، مانده بدهکار USD و advance ایجاد می‌کند و صفر نمی‌شود.

