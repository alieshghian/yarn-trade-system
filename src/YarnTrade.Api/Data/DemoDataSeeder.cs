using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Domain;

namespace YarnTrade.Api.Data;

public sealed class DemoDataSeeder(AppDbContext db, UserManager<AppUser> users, RoleManager<IdentityRole<Guid>> roles, IConfiguration configuration)
{
    public async Task SeedAsync(CancellationToken ct = default)
    {
        var email = configuration["Seed:AdminEmail"] ?? "admin@yarntrade.local";
        var adminPassword = configuration["Seed:AdminPassword"];
        if (string.IsNullOrWhiteSpace(adminPassword) && await users.FindByEmailAsync(email) is null)
            throw new InvalidOperationException("Seed:AdminPassword must be configured before creating the development administrator.");

        foreach (var roleName in new[] { "Administrator", "Customer", "Seller", "Supplier", "Partner", "Manager", "Orders", "Commerce", "WarehouseOperator", "FinanceOperator", "Other", "PurchaseOperator", "SalesOperator", "ReportViewer" })
            if (!await roles.RoleExistsAsync(roleName)) await roles.CreateAsync(new IdentityRole<Guid>(roleName));

        if (await users.FindByEmailAsync(email) is null)
        {
            var user = new AppUser { Id = Guid.NewGuid(), UserName = email, Email = email, EmailConfirmed = true, DisplayName = "System Administrator", PreferredLanguage = "fa" };
            var result = await users.CreateAsync(user, adminPassword!);
            if (result.Succeeded) await users.AddToRoleAsync(user, "Administrator");
        }

        if (!await db.RoleTaskSettings.AnyAsync(ct))
        {
            db.RoleTaskSettings.AddRange(
                new RoleTaskSetting { RoleName = "Commerce", TaskCategory = "CommerceOrder", SlaHours = 12 },
                new RoleTaskSetting { RoleName = "WarehouseOperator", TaskCategory = "WarehouseReceipt", SlaHours = 12 },
                new RoleTaskSetting { RoleName = "Manager", TaskCategory = "CommerceOrder", SlaHours = 48 },
                new RoleTaskSetting { RoleName = "Manager", TaskCategory = "WarehouseReceipt", SlaHours = 48 });
            await db.SaveChangesAsync(ct);
        }

        if (await db.Warehouses.AnyAsync(ct)) return;
        var supplier = new Person { PersonCode = "SUP-HUAYU", DisplayName = "Zhejiang Huayu Import and Export Co., Ltd", LastName = "Zhejiang Huayu Import and Export Co., Ltd", PersonType = PersonType.Company, AccountingCode = "SUP-HUAYU", PreferredLanguage = "en" };
        var customer = new Person { PersonCode = "CUS-001", DisplayName = "مشتری نمونه", FirstName = "مشتری", LastName = "نمونه", PersonType = PersonType.Individual, AccountingCode = "CUS-001", CreditLimitIRR = 2_000_000_000m };
        var seller = new Person { PersonCode = "SEL-001", DisplayName = "فروشنده نمونه", FirstName = "فروشنده", LastName = "نمونه", PersonType = PersonType.Individual, AccountingCode = "SEL-001" };
        db.Persons.AddRange(supplier, customer, seller);
        db.PersonRoles.AddRange(new PersonRole { PersonId = supplier.Id, Role = "ForeignSupplier" }, new PersonRole { PersonId = customer.Id, Role = "Customer" }, new PersonRole { PersonId = seller.Id, Role = "InternalSeller" });
        var warehouse = new Warehouse { Code = "WH-01", NameFa = "انبار مرکزی", NameEn = "Main Warehouse", CustodianPersonId = seller.Id };
        db.Warehouses.Add(warehouse);
        var type = new YarnType { Code = "CHENILLE", NameFa = "نخ شنل", NameEn = "Chenille Yarn" };
        db.YarnTypes.Add(type);
        var yarn = new YarnItem { YarnTypeId = type.Id, Code = "DUBE-3NM-1400", NameFa = "شنل دابی ۳NM کد ۱۴۰۰", NameEn = "Dube Dyed Chenille 3NM 1400", Property1NameFa = "نمره", Property1NameEn = "Count", Property1Value = "3NM", Property2NameFa = "کد رنگ", Property2NameEn = "Color Code", Property2Value = "1400", SearchText = "dube dyed chenille 3nm 1400 شنل دابی" };
        db.YarnItems.Add(yarn);
        db.PartnerShareRules.AddRange(
            new PartnerShareRule { ValidFrom = new DateOnly(2024, 1, 1), ResultType = PartnerResultType.CashProfit, IranianPartnerPercent = 50, ChinesePartnerPercent = 50 },
            new PartnerShareRule { ValidFrom = new DateOnly(2024, 1, 1), ResultType = PartnerResultType.CashLoss, IranianPartnerPercent = 50, ChinesePartnerPercent = 50 },
            new PartnerShareRule { ValidFrom = new DateOnly(2024, 1, 1), ResultType = PartnerResultType.CreditIncrease, IranianPartnerPercent = 50, ChinesePartnerPercent = 50 });
        var priceList = new PriceList { NameFa = "قیمت پایه", NameEn = "Base Cash Price", ValidFrom = new DateOnly(2024, 1, 1) };
        priceList.Items.Add(new PriceListItem { YarnItemId = yarn.Id, CashUnitPriceIRR = 4_300_000m });
        db.PriceLists.Add(priceList);
        var invoice = new PurchaseInvoice
        {
            InternalNumber = "PUR-2024-001", ExternalInvoiceNumber = "2024LCS022", InvoiceDate = new DateOnly(2024, 9, 29), SupplierId = supplier.Id,
            BuyerName = "SHIVA NASSAJ YAZD COMPANY", BillOfLadingNumber = "HDM1546WNHS8711", OriginPort = "SHANGHAI, CHINA", DestinationPort = "BANDAR ABBAS, IRAN",
            DeliveryTerms = "CNF", PaymentTerms = "T/T", ShipmentMethod = "By Sea", GoodsTotal = 120_431.034m, InternationalFreight = 7_500m,
            GrandTotal = 127_931.034m, TotalNetWeight = 52_035.9m, TotalGrossWeight = 54_058m, TotalPackages = 2156, Status = DocumentStatus.Draft,
            Notes = "Sample imported from 7edited.Dube dyed chenille(2024.9.29).xlsx; raw source must be attached before posting."
        };
        invoice.Items.Add(new PurchaseInvoiceItem { PurchaseInvoiceId = invoice.Id, LineNumber = 3, YarnItemId = yarn.Id, OriginalDescription = "DUBE DYED CHENILLE YARN(3NM)", OriginalSpecification = "1400", NetWeight = 2880m, GrossWeight = 3000m, PackageCount = 120, UnitPriceUSD = 2.27m, GoodsAmountUSD = 6537.6m });
        invoice.Containers.AddRange([
            new PurchaseContainer { PurchaseInvoiceId = invoice.Id, ContainerNumber = "CICU4783180", BillOfLadingNumber = invoice.BillOfLadingNumber },
            new PurchaseContainer { PurchaseInvoiceId = invoice.Id, ContainerNumber = "MIOU5138470", BillOfLadingNumber = invoice.BillOfLadingNumber },
            new PurchaseContainer { PurchaseInvoiceId = invoice.Id, ContainerNumber = "SLLU5186399", BillOfLadingNumber = invoice.BillOfLadingNumber }]);
        db.PurchaseInvoices.Add(invoice);

        var cashSale = new Sale
        {
            SaleNumber = "SAL-2025-001", SaleDate = new DateOnly(2025, 1, 10), CustomerId = customer.Id, SellerId = seller.Id, WarehouseId = warehouse.Id,
            SaleMode = SaleMode.Cash, CreditPricingMode = CreditPricingMode.None, PaymentArrangementType = "Cash", Status = DocumentStatus.Draft,
            TotalCashEquivalentIRR = 430_000_000m, TotalCreditSaleIRR = 430_000_000m
        };
        cashSale.Items.Add(new SaleItem { SaleId = cashSale.Id, YarnItemId = yarn.Id, Quantity = 100m, CashPriceListItemId = priceList.Items[0].Id, CashUnitPriceSnapshotIRR = 4_300_000m, CashTotalIRR = 430_000_000m, CreditUnitPriceIRR = 4_300_000m, CreditTotalIRR = 430_000_000m });

        var creditA = new Sale
        {
            SaleNumber = "SAL-2025-002", SaleDate = new DateOnly(2025, 1, 15), CustomerId = customer.Id, SellerId = seller.Id, WarehouseId = warehouse.Id,
            SaleMode = SaleMode.Credit, CreditPricingMode = CreditPricingMode.SystemCalculatedFromCreditDays, PaymentArrangementType = "Mixed", ContractCreditDays = 45,
            ContractDueDate = new DateOnly(2025, 3, 1), TotalCashEquivalentIRR = 430_000_000m, TotalCreditSaleIRR = 453_650_000m, TotalCreditIncreaseIRR = 23_650_000m, Status = DocumentStatus.Draft
        };
        creditA.Items.Add(new SaleItem { SaleId = creditA.Id, YarnItemId = yarn.Id, Quantity = 100m, CashPriceListItemId = priceList.Items[0].Id, CashUnitPriceSnapshotIRR = 4_300_000m, CashTotalIRR = 430_000_000m, CreditUnitPriceIRR = 4_536_500m, CreditTotalIRR = 453_650_000m, CreditIncreaseIRR = 23_650_000m, CalculatedCreditPercent = 5.5m, CreditRuleVersion = 1 });
        var sampleCheck = new Check { CheckNumber = "123456", SayadNumber = "1000000000000000", OwnerName = customer.DisplayName, BankName = "Sample Bank", AmountIRR = 153_650_000m, ReceivedDate = creditA.SaleDate, DueDate = creditA.SaleDate.AddDays(30), CustomerId = customer.Id, RelatedSaleId = creditA.Id, CurrentStatus = CheckStatus.Received };
        creditA.PaymentSchedules.AddRange([
            new SalePaymentSchedule { SaleId = creditA.Id, Sequence = 1, PaymentType = PaymentMethod.Cash, AmountIRR = 100_000_000m, DueDate = creditA.SaleDate, DueDaysFromSale = 0 },
            new SalePaymentSchedule { SaleId = creditA.Id, Sequence = 2, PaymentType = PaymentMethod.Check, AmountIRR = 153_650_000m, DueDate = sampleCheck.DueDate, DueDaysFromSale = 30, CheckId = sampleCheck.Id },
            new SalePaymentSchedule { SaleId = creditA.Id, Sequence = 3, PaymentType = PaymentMethod.BankTransfer, AmountIRR = 200_000_000m, DueDate = creditA.SaleDate.AddDays(90), DueDaysFromSale = 90 }]);

        var creditB = new Sale
        {
            SaleNumber = "SAL-2025-003", SaleDate = new DateOnly(2025, 2, 1), CustomerId = customer.Id, SellerId = seller.Id, WarehouseId = warehouse.Id,
            SaleMode = SaleMode.Credit, CreditPricingMode = CreditPricingMode.UserEnteredCreditPriceAndDueDate, PaymentArrangementType = "SinglePayment", ContractCreditDays = 60,
            ContractDueDate = new DateOnly(2025, 4, 2), TotalCashEquivalentIRR = 215_000_000m, TotalCreditSaleIRR = 230_000_000m, TotalCreditIncreaseIRR = 15_000_000m, Status = DocumentStatus.Draft
        };
        creditB.Items.Add(new SaleItem { SaleId = creditB.Id, YarnItemId = yarn.Id, Quantity = 50m, CashPriceListItemId = priceList.Items[0].Id, CashUnitPriceSnapshotIRR = 4_300_000m, CashTotalIRR = 215_000_000m, CreditUnitPriceIRR = 4_600_000m, CreditTotalIRR = 230_000_000m, CreditIncreaseIRR = 15_000_000m, CalculatedCreditPercent = 6.97674419m });
        creditB.PaymentSchedules.Add(new SalePaymentSchedule { SaleId = creditB.Id, Sequence = 1, PaymentType = PaymentMethod.BankTransfer, AmountIRR = 230_000_000m, DueDate = creditB.ContractDueDate.Value, DueDaysFromSale = 60 });
        db.Sales.AddRange(cashSale, creditA, creditB);
        db.Checks.Add(sampleCheck);

        db.MoneyDocuments.AddRange(
            new MoneyDocument { DocumentNumber = "REC-2025-001", DocumentType = MoneyDocumentType.Receipt, DocumentDate = new DateOnly(2025, 1, 15), PersonId = customer.Id, Subject = "Sample receipt", Description = "Mixed cash/check sample", TotalIRR = 253_650_000m, Status = DocumentStatus.Draft, Lines = [new MoneyDocumentLine { PaymentMethod = PaymentMethod.Cash, AmountIRR = 100_000_000m, SaleId = creditA.Id }, new MoneyDocumentLine { PaymentMethod = PaymentMethod.Check, AmountIRR = 153_650_000m, CheckId = sampleCheck.Id, SaleId = creditA.Id }] },
            new MoneyDocument { DocumentNumber = "PAY-2025-001", DocumentType = MoneyDocumentType.Payment, DocumentDate = new DateOnly(2025, 1, 20), PersonId = seller.Id, Subject = "Sample payment", Description = "Seller payment sample", TotalIRR = 50_000_000m, Status = DocumentStatus.Draft, Lines = [new MoneyDocumentLine { PaymentMethod = PaymentMethod.BankTransfer, AmountIRR = 50_000_000m, CashOrBankAccount = "Main bank" }] });

        db.PartnerSettlements.Add(new PartnerSettlement { SettlementNumber = "SET-2025-001", PartnerId = Guid.Parse("22222222-2222-2222-2222-222222222222"), SettlementDate = new DateOnly(2025, 3, 1), PaidUSD = 10_000m, ExchangeRate = 920_000m, EquivalentIRR = 9_200_000_000m, SourceBankAccount = "Sample USD account", Description = "Draft sample settlement", Status = DocumentStatus.Draft });
        await db.SaveChangesAsync(ct);
    }
}
