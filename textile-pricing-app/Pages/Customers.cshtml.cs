using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using System.Globalization;
using TextilePricingApp.Models;
using TextilePricingApp.Services;

namespace TextilePricingApp.Pages;

public class CustomersModel : PageModel
{
    private readonly CustomerRepository _customers;
    private readonly CustomerPriceRepository _customerPrices;
    private readonly FactoryPriceRepository _factoryPrices;
    private readonly PricingService _pricing;
    private readonly RubikaBotService _bot;
    private readonly RubikaBotConnectionRepository _botConnections;
    private readonly RubikaDispatchRepository _dispatches;
    private readonly RubikaBotUpdatesWorker _updates;
    private readonly PageAccessService _access;
    public bool BotConnected => _bot.State().Connected;
    public RubikaBotConnection BotConnection => SelectedCustomer is null ? new("", "", "") : _botConnections.Get(SelectedCustomer.Id, _bot.State().BotId);
    public string? BotInviteUrl { get; private set; }
    public string? BotInviteCommand { get; private set; }
    public string? BotMessage { get; private set; }

    public CustomersModel(
        CustomerRepository customers,
        CustomerPriceRepository customerPrices,
        FactoryPriceRepository factoryPrices,
        PricingService pricing, RubikaBotService bot, RubikaBotConnectionRepository botConnections,
        RubikaDispatchRepository dispatches, RubikaBotUpdatesWorker updates, PageAccessService access)
    {
        _customers = customers;
        _customerPrices = customerPrices;
        _factoryPrices = factoryPrices;
        _pricing = pricing;
        _bot = bot; _botConnections = botConnections; _dispatches = dispatches; _updates = updates;
        _access = access;
    }

    [BindProperty(SupportsGet = true)]
    public string? Query { get; set; }

    [BindProperty(SupportsGet = true)]
    public string? ProductQuery { get; set; }

    [BindProperty(SupportsGet = true)]
    public int? EditId { get; set; }

    [BindProperty(SupportsGet = true)]
    public bool NewCustomer { get; set; }

    [BindProperty]
    public CustomerInput Input { get; set; } = new();

    [BindProperty]
    public CustomerDiscountInput DiscountInput { get; set; } = new();

    [BindProperty]
    public List<CustomerDiscountEditInput> DiscountRowsInput { get; set; } = [];

    public IReadOnlyList<Customer> Customers { get; private set; } = [];
    public IReadOnlyDictionary<int, int> DiscountCounts { get; private set; } = new Dictionary<int, int>();
    public IReadOnlyList<ProductRecipe> ProductChoices { get; private set; } = [];
    public Customer? SelectedCustomer { get; private set; }
    public IReadOnlyList<CustomerDiscountRow> DiscountRows { get; private set; } = [];
    public string FormTitle { get; private set; } = "افزودن مشتری";
    public string? SuccessMessage { get; private set; }
    public decimal CustomerVatRate { get; private set; }

    public void OnGet()
    {
        LoadPage();
    }

    public async Task<IActionResult> OnPostBotConnectionAsync(int customerId, string action, string? expectedChat)
    {
        EditId = customerId;
        NewCustomer = false;
        if (_customers.GetById(customerId) is null) return NotFound();
        if (action == "refresh")
        {
            try
            {
                if (!BotConnected) throw new InvalidOperationException("ابتدا توکن ربات را در تنظیمات ثبت کنید.");
                await _updates.PollAsync(HttpContext.RequestAborted);
                var connection = _botConnections.Get(customerId, _bot.State().BotId);
                BotMessage = connection.PendingChatId.Length > 0 ? "درخواست اتصال دریافت شد؛ مشخصات حساب را بررسی و اتصال را تأیید کنید."
                    : connection.ChatId.Length > 0 ? "این مشتری متصل و تأییدشده است."
                    : "درخواست معتبری برای این مشتری دریافت نشد. کد اتصال را به‌تنهایی در یک پیام عادی برای ربات ارسال کنید؛ باز کردن لینک یا زدن Start کافی نیست. اگر کد نمایش داده نمی‌شود، کد اتصال جدید بسازید.";
            }
            catch (InvalidOperationException e) { BotMessage = e.Message; }
        }
        else
        {
            await _bot.ControlGate.WaitAsync(HttpContext.RequestAborted);
            try
            {
                var state = _bot.State();
                if (!state.Connected) throw new InvalidOperationException("ابتدا توکن ربات را در تنظیمات ثبت کنید.");
                if (_dispatches.Active()) throw new InvalidOperationException("تا پایان ارسال، اتصال مشتری قابل تغییر نیست.");
                switch (action)
                {
                    case "invite":
                        var code = _botConnections.Invite(customerId, state.BotId);
                        BotInviteUrl = state.ShareUrl;
                        BotInviteCommand = code;
                        BotMessage = "کد اتصال خصوصی، یک‌بارمصرف و ۷ روز معتبر است. مشتری کد را به‌تنهایی در پیام عادی به ربات ارسال کند؛ بدون /start.";
                        break;
                    case "approve":
                        if (!_botConnections.Approve(customerId, state.BotId, expectedChat ?? "")) throw new InvalidOperationException("درخواست اتصال تغییر کرده یا چت به مشتری دیگری متصل است؛ صفحه را تازه کنید.");
                        BotMessage = "اتصال مشتری به ربات تأیید شد.";
                        break;
                    case "unlink":
                        _botConnections.Unlink(customerId, state.BotId);
                        BotMessage = "اتصال مشتری و لینک قبلی لغو شد.";
                        break;
                    default: return BadRequest();
                }
            }
            catch (InvalidOperationException e) { BotMessage = e.Message; }
            finally { _bot.ControlGate.Release(); }
        }
        ModelState.Clear(); LoadPage(); return Page();
    }

    public IActionResult OnPostSave()
    {
        ValidateCustomerInput();
        ValidateDuplicateCustomerName();
        if (!ModelState.IsValid)
        {
            LoadPage();
            return Page();
        }

        var saved = Input.Id > 0 ? "updated" : "created";
        var id = _customers.Save(Input);
        return RedirectToPage(new { Query, ProductQuery, EditId = id, saved });
    }

    public IActionResult OnPostDelete(int id)
    {
        _customers.Delete(id);
        return RedirectToPage(new { Query, saved = "deleted" });
    }

    public IActionResult OnPostSaveDiscount()
    {
        ValidateDiscountInput();
        if (!ModelState.IsValid)
        {
            EditId = DiscountInput.CustomerId;
            LoadPage();
            return Page();
        }

        _customerPrices.UpsertMany([
            new CustomerProductDiscountInput(
                DiscountInput.CustomerId,
                DiscountInput.ProductCode,
                DiscountInput.CreditDiscountPercent,
                DiscountInput.CashDiscountPercent)
        ]);

        return RedirectToPage(new { Query, ProductQuery, EditId = DiscountInput.CustomerId, saved = "discount" });
    }

    public IActionResult OnPostSaveDiscountRows(int customerId)
    {
        if (customerId <= 0)
        {
            ModelState.AddModelError("", "ابتدا مشتری را ذخیره کنید.");
            LoadPage();
            return Page();
        }

        var inputs = DiscountRowsInput
            .Where(row => !string.IsNullOrWhiteSpace(row.ProductCode))
            .GroupBy(row => row.ProductCode.Trim(), StringComparer.CurrentCultureIgnoreCase)
            .Select(group => group.Last())
            .Select(row => new CustomerProductDiscountInput(
                customerId,
                row.ProductCode,
                RoundPercent(row.CreditDiscountPercent),
                RoundPercent(row.CashDiscountPercent)))
            .ToList();

        if (inputs.Count > 0)
        {
            _customerPrices.UpsertMany(inputs);
        }

        return RedirectToPage(new { Query, ProductQuery, EditId = customerId, saved = "discount" });
    }

    public IActionResult OnPostDeleteDiscount(int customerId, string productCode)
    {
        _customerPrices.Delete(customerId, productCode);
        return RedirectToPage(new { Query, ProductQuery, EditId = customerId, saved = "discountDeleted" });
    }

    private void LoadPage()
    {
        Customers = _customers.GetAll(Query);
        DiscountCounts = _customerPrices.GetDiscountCountsByCustomer();
        ProductChoices = _pricing.Recipes.OrderBy(product => product.Code).ToList();
        SelectedCustomer = NewCustomer
            ? null
            : EditId is > 0
                ? _customers.GetById(EditId.Value)
                : Customers.FirstOrDefault();

        if (SelectedCustomer is not null && EditId is null && !NewCustomer)
        {
            EditId = SelectedCustomer.Id;
        }

        if (SelectedCustomer is not null)
        {
            var botState = _bot.State();
            if (botState.Connected && _access.CanEdit("Customers"))
            {
                BotInviteUrl = botState.ShareUrl;
                BotInviteCommand = _botConnections.InviteCode(SelectedCustomer.Id, botState.BotId);
            }
            Input = new CustomerInput
            {
                Id = SelectedCustomer.Id,
                Name = SelectedCustomer.Name,
                MobileNumber = SelectedCustomer.MobileNumber,
                IsVatExempt = SelectedCustomer.IsVatExempt
            };
            DiscountInput.CustomerId = SelectedCustomer.Id;
            FormTitle = "ویرایش مشتری";
            CustomerVatRate = SelectedCustomer.IsVatExempt ? 0 : _pricing.Settings.VatRate;
            DiscountRows = BuildDiscountRows(SelectedCustomer.Id);
        }
        else
        {
            FormTitle = "افزودن مشتری";
            CustomerVatRate = 0;
            DiscountRows = [];
        }

        SuccessMessage = Request.Query["saved"].ToString() switch
        {
            "created" => "مشتری جدید با موفقیت ثبت شد.",
            "updated" => "اطلاعات مشتری با موفقیت ویرایش شد.",
            "deleted" => "مشتری با موفقیت حذف شد.",
            "discount" => "تخفیف محصول مشتری ذخیره شد.",
            "discountDeleted" => "ارتباط کالا و تخفیف آن برای مشتری حذف شد.",
            _ => null
        };
    }

    private IReadOnlyList<CustomerDiscountRow> BuildDiscountRows(int customerId)
    {
        var discounts = _customerPrices.GetByCustomer(customerId);
        var factoryPrices = _factoryPrices.GetAll();
        var cashPaymentDiscountPercent = _pricing.Settings.CashPaymentDiscountPercent;
        var selectedCustomer = _customers.GetById(customerId);
        var vatRate = selectedCustomer?.IsVatExempt == true ? 0 : _pricing.Settings.VatRate;
        var productsByCode = _pricing.Recipes
            .GroupBy(product => product.Code, StringComparer.CurrentCultureIgnoreCase)
            .ToDictionary(group => group.Key, group => group.First(), StringComparer.CurrentCultureIgnoreCase);
        var discountedProductCodes = discounts.Keys.AsEnumerable();
        if (!string.IsNullOrWhiteSpace(ProductQuery))
        {
            var productQuery = ProductQuery.Trim();
            discountedProductCodes = discountedProductCodes.Where(code =>
                code.Contains(productQuery, StringComparison.CurrentCultureIgnoreCase) ||
                productsByCode.TryGetValue(code, out var product) &&
                (product.Name.Contains(productQuery, StringComparison.CurrentCultureIgnoreCase) ||
                 product.ProductGroupName.Contains(productQuery, StringComparison.CurrentCultureIgnoreCase)));
        }

        return discountedProductCodes
            .Select(productCode =>
            {
                if (!productsByCode.TryGetValue(productCode, out var product))
                {
                    return null;
                }

                var calculation = _pricing.Calculate(product.Code);
                var systemFactoryPrice = RoundPrice(
                    calculation.Summary.CashCost * (1 + _pricing.Settings.GlobalProfitPercent / 100m));
                var factoryPrice = factoryPrices.TryGetValue(product.Code, out var storedFactoryPrice)
                    ? storedFactoryPrice
                    : systemFactoryPrice;
                var discount = discounts[product.Code];
                var creditDiscountPercent = discount.CreditDiscountPercent;
                var cashDiscountPercent = discount.CashDiscountPercent;
                var roundedFactoryPrice = RoundPrice(factoryPrice);
                var customerCreditPrice = CalculateCustomerPrice(roundedFactoryPrice, creditDiscountPercent);
                var factoryCashPrice = CalculateCustomerPrice(roundedFactoryPrice, cashPaymentDiscountPercent);
                var customerCashPrice = cashDiscountPercent == 0
                    ? factoryCashPrice
                    : CalculateCustomerPrice(factoryCashPrice, cashDiscountPercent);

                return (CustomerDiscountRow?)new CustomerDiscountRow(
                    product.Code,
                    product.Name,
                    product.ProductGroupName,
                    product.ImagePath,
                    roundedFactoryPrice,
                    ApplyVat(roundedFactoryPrice, vatRate),
                    factoryCashPrice,
                    ApplyVat(factoryCashPrice, vatRate),
                    creditDiscountPercent,
                    cashDiscountPercent,
                    ApplyVat(customerCreditPrice, vatRate),
                    ApplyVat(customerCashPrice, vatRate),
                    vatRate,
                    true,
                    discount.LastEditedAt == DateTime.MinValue ? null : discount.LastEditedAt);
            })
            .Where(row => row is not null)
            .Select(row => row!)
            .OrderBy(row => row.ProductCode)
            .ToList();
    }

    private static decimal CalculateCustomerPrice(decimal factoryPrice, decimal discountPercent)
    {
        var result = factoryPrice * (1 - discountPercent / 100m);
        return RoundPrice(result);
    }

    private static decimal ApplyVat(decimal price, decimal vatRate)
    {
        return RoundPrice(price * (1 + vatRate));
    }

    private static decimal RoundPrice(decimal value)
    {
        return decimal.Round(Math.Max(0, value) / 100m, 0, MidpointRounding.AwayFromZero) * 100m;
    }

    private static decimal RoundPercent(decimal value)
    {
        return decimal.Round(value, 2, MidpointRounding.AwayFromZero);
    }

    private void ValidateCustomerInput()
    {
        Input.MobileNumber = MobileNumber.Normalize(Input.MobileNumber);
        if (Input.MobileNumber.Length > 0 && !MobileNumber.IsValid(Input.MobileNumber))
            ModelState.AddModelError("Input.MobileNumber", "شماره موبایل معتبر وارد کنید؛ مانند 09123456789.");
        if (string.IsNullOrWhiteSpace(Input.Name))
        {
            ModelState.AddModelError("Input.Name", "نام مشتری الزامی است.");
        }
    }

    private void ValidateDiscountInput()
    {
        if (DiscountInput.CustomerId <= 0)
        {
            ModelState.AddModelError("DiscountInput.CustomerId", "ابتدا مشتری را ذخیره کنید.");
        }

        if (string.IsNullOrWhiteSpace(DiscountInput.ProductCode))
        {
            ModelState.AddModelError("DiscountInput.ProductCode", "کد محصول الزامی است.");
        }

        if (DiscountInput.CreditDiscountPercent < 0 || DiscountInput.CreditDiscountPercent > 100)
        {
            ModelState.AddModelError("DiscountInput.CreditDiscountPercent", "درصد تخفیف اعتباری باید بین صفر تا صد باشد.");
        }

        if (DiscountInput.CashDiscountPercent < 0 || DiscountInput.CashDiscountPercent > 100)
        {
            ModelState.AddModelError("DiscountInput.CashDiscountPercent", "درصد تخفیف نقدی باید بین صفر تا صد باشد.");
        }
    }

    private void ValidateDuplicateCustomerName()
    {
        if (string.IsNullOrWhiteSpace(Input.Name))
        {
            return;
        }

        var duplicateName = _customers.GetAll()
            .Any(item => item.Id != Input.Id &&
                string.Equals(item.Name.Trim(), Input.Name.Trim(), StringComparison.CurrentCultureIgnoreCase));
        if (duplicateName)
        {
            ModelState.AddModelError("Input.Name", "مشتری دیگری با این نام قبلا ثبت شده است.");
        }
    }

    public static string PersianDate(DateTime? value)
    {
        if (value is null)
        {
            return "-";
        }

        var local = value.Value.Kind == DateTimeKind.Utc ? value.Value.ToLocalTime() : value.Value;
        var calendar = new PersianCalendar();
        return $"{calendar.GetYear(local):0000}/{calendar.GetMonth(local):00}/{calendar.GetDayOfMonth(local):00}";
    }

    public sealed class CustomerDiscountInput
    {
        public int CustomerId { get; set; }
        public string ProductCode { get; set; } = "";
        public decimal CreditDiscountPercent { get; set; }
        public decimal CashDiscountPercent { get; set; }
    }

    public sealed class CustomerDiscountEditInput
    {
        public string ProductCode { get; set; } = "";
        public decimal CashDiscountPercent { get; set; }
        public decimal CreditDiscountPercent { get; set; }
    }

    public sealed record CustomerDiscountRow(
        string ProductCode,
        string ProductName,
        string ProductGroupName,
        string ImagePath,
        decimal FactoryPrice,
        decimal FactoryPriceWithVat,
        decimal FactoryCashPrice,
        decimal FactoryCashPriceWithVat,
        decimal CreditDiscountPercent,
        decimal CashDiscountPercent,
        decimal CustomerCreditPrice,
        decimal CustomerCashPrice,
        decimal VatRate,
        bool HasDiscount,
        DateTime? LastEditedAt);
}
