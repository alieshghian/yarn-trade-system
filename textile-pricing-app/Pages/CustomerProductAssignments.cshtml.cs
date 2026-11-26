using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using TextilePricingApp.Services;

namespace TextilePricingApp.Pages;

public class CustomerProductAssignmentsModel(CustomerProductAssignmentRepository assignments,
    CustomerRepository customers, CustomerPriceReportService prices, RubikaAccountService account,
    RubikaDispatchRepository dispatches, SettingsRepository settings, PageAccessService access,
    RubikaBotService bot, RubikaBotConnectionRepository connections) : PageModel
{
    public DateTime? LastSent { get; private set; }
    public IReadOnlyList<AssignmentChoice> Products { get; private set; } = [];
    public IReadOnlyList<AssignmentChoice> Customers { get; private set; } = [];
    public AssignmentCounts Counts { get; private set; } = new(new Dictionary<int, int>(), new Dictionary<int, int>());

    public void OnGet()
    {
        Products = assignments.Products();
        Customers = assignments.Customers();
        Counts = assignments.Counts();
        LastSent = dispatches.LastSent();
    }

    public IActionResult OnGetDispatchStatus()
    {
        var status = dispatches.Status();
        return new JsonResult(new { status = status is null ? null : new {
            status.Id, status.Status, status.Sent, status.Failed, status.Remaining,
            items = status.Items.Select(i => new { i.Id, i.Phone, i.Name, i.Status, i.Error })
        }, lastSent = RubikaDispatchRepository.DisplayDateTime(dispatches.LastSent()) });
    }

    public IActionResult OnGetPricePdf(string id, long itemId)
    {
        if (!access.CanEdit("CustomerProductAssignments")) return Forbid();
        var item = dispatches.Status(id)?.Items.FirstOrDefault(i => i.Id == itemId);
        if (item?.Pdf is null) return NotFound();
        Response.Headers.CacheControl = "no-store";
        return File(item.Pdf, "application/pdf", $"price-list-{item.Id}.pdf");
    }
    public async Task<IActionResult> OnPostPrepareSendAsync()
    {
        try
        {
            var botState = bot.State();
            if (!botState.Connected) return BadRequest(new { error = "ابتدا توکن ربات روبیکا را در تنظیمات ثبت کنید." });
            if (!account.Installed) return BadRequest(new { error = "محیط تولید PDF نصب نیست؛ راهنمای RubikaBridge/README.md را اجرا کنید." });
            if (dispatches.Active()) return new ObjectResult(new { error = "یک ارسال در حال انجام است؛ تا پایان آن صبر کنید." }) { StatusCode = 409 };
            var company = settings.Get().CompanyName.Trim();
            if (company.Length == 0) return BadRequest(new { error = "ابتدا نام شرکت را در صفحهٔ تنظیمات ثبت کنید." });
            var products = assignments.Products().ToDictionary(p => p.Id);
            var recipients = customers.GetAll().Where(c => assignments.RelatedIds("customer", c.Id).Count > 0).ToList();
            var targets = recipients.ToDictionary(c => c.Id, c => connections.Get(c.Id, botState.BotId).ChatId);
            var skipped = recipients.Where(c => targets[c.Id].Length == 0).Select(c => c.Name).ToList();
            var valid = recipients.Where(c => targets[c.Id].Length > 0).ToList();
            if (valid.GroupBy(c => targets[c.Id]).Any(g => g.Count() > 1))
                return BadRequest(new { error = "شناسهٔ چت تکراری است؛ اتصال مشتریان را بررسی کنید." });
            var messages = new List<RubikaMessage>();
            foreach (var customer in valid)
            {
                var codes = assignments.RelatedIds("customer", customer.Id).Select(id => products[id].Code).ToList();
                var rows = prices.BuildAssigned(customer, codes);
                if (rows.Count != codes.Count) throw new InvalidOperationException("قیمت بعضی کالاها در دسترس نیست؛ صفحه را تازه کنید.");
                var previous = dispatches.PreviousPrices(customer.Id);
                var lines = rows.OrderBy(r => r.ProductCode).Select(row => new RubikaPriceLine(row.ProductCode, row.ProductName, row.CustomerPrice,
                    previous.TryGetValue(row.ProductCode, out var old) && old > 0 ? decimal.Round((row.CustomerPrice - old) / old * 100m, 2, MidpointRounding.AwayFromZero) : null)).ToList();
                var date = RubikaDispatchRepository.DisplayDateTime(DateTime.UtcNow).Split(' ')[0];
                var document = new RubikaPriceDocument(customer.Id, company, customer.Name, date, customer.IsVatExempt, lines);
                var pdf = await account.RenderPdfAsync(document, HttpContext.RequestAborted);
                var caption = $"{company}\nفهرست قیمت - {date}";
                messages.Add(new(MobileNumber.Normalize(customer.MobileNumber), customer.Name, caption, pdf, document, targets[customer.Id]));
            }
            if (messages.Count == 0) return BadRequest(new { error = "هیچ مشتری دارای کالا و اتصال تأییدشده به ربات نیست؛ اتصال را در صفحهٔ مشتریان انجام دهید." });
            var id = dispatches.Prepare(messages, botState.Sender);
            return new JsonResult(new { id, customers = valid.Count, messages = dispatches.Status(id)!.Items.Select(item => new {
                item.Name, item.Phone, item.Text, item.ChatId,
                pdfUrl = Url.Page("/CustomerProductAssignments", "PricePdf", new { id, itemId = item.Id })
            }), skipped });
        }
        catch (InvalidOperationException e) { return BadRequest(new { error = e.Message }); }
    }
    public async Task<IActionResult> OnPostConfirmSendAsync(string id, bool confirmed)
    {
        await bot.ControlGate.WaitAsync(HttpContext.RequestAborted);
        try
        {
            if (!confirmed || string.IsNullOrWhiteSpace(id)) return BadRequest();
            var state = bot.State();
            if (!state.Connected) return BadRequest(new { error = "ربات روبیکا متصل نیست." });
            var preview = dispatches.Status(id);
            if (preview is null || preview.Items.Any(i => i.ChatId.Length == 0 || connections.Get(i.CustomerId, state.BotId).ChatId != i.ChatId))
                return BadRequest(new { error = "اتصال مشتریان تغییر کرده است؛ دوباره پیش‌نمایش بگیرید." });
            if (!dispatches.Confirm(id, state.Sender)) return new ObjectResult(new { error = "تأیید ارسال منقضی یا قبلاً ثبت شده است، یا ارسال دیگری در حال انجام است. دوباره پیش‌نمایش بگیرید." }) { StatusCode = 409 };
            return new JsonResult(new { started = true });
        }
        catch (InvalidOperationException e) { return BadRequest(new { error = e.Message }); }
        finally { bot.ControlGate.Release(); }
    }

    public IActionResult OnGetRelations(string side, int id)
    {
        if (side is not ("product" or "customer") || id <= 0) return BadRequest();
        return new JsonResult(new { ids = assignments.RelatedIds(side, id) });
    }

    public IActionResult OnPostSave(string side, int id, List<int> relatedIds)
    {
        if (side is not ("product" or "customer") || id <= 0) return BadRequest();
        if (!assignments.Save(side, id, relatedIds))
            return BadRequest(new { error = "کالا یا مشتری حذف شده است؛ صفحه را تازه کنید." });
        return new JsonResult(new { saved = true, counts = assignments.Counts() });
    }
}
