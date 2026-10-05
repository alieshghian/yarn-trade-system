using Microsoft.AspNetCore.Identity;

namespace YarnTrade.Api.Domain;

public enum DocumentStatus { Draft, Posted, Reversed }
public enum PersonType { Individual, Company }
public enum PartnerKind { None, Iranian, Chinese }
public enum SaleMode { Cash, Credit }
public enum CreditPricingMode { None, SystemCalculatedFromCreditDays, UserEnteredCreditPriceAndDueDate }
public enum CostingMethod { FIFO, LIFO, WeightedAverage }
public enum MovementType { PurchaseReceipt, WarehouseTransferOut, WarehouseTransferIn, SaleIssue, ReturnIn, ReturnOut, ControlledAdjustment }
public enum Currency { IRR, USD, CNY, EUR }
public enum MoneyDocumentType { Receipt, Payment }
public enum PaymentMethod { Cash, BankTransfer, Check, ThirdPartyCheck, USD, Mixed }
public enum CheckStatus { Received, InCashbox, Deposited, Collected, Bounced, TransferredToThirdParty, Returned, Replaced, Cancelled }
public enum PartnerResultType { CashProfit, CashLoss, CreditIncrease, CreditAdjustment }
public enum ParameterType { Job, Title, Nationality }
public enum PurchaseOrderStatus { Draft, SubmittedToCommerce, InCommerce, Completed, Cancelled }
public enum PurchaseOrderPriority { Normal, Urgent }

public abstract class Entity { public Guid Id { get; set; } = Guid.NewGuid(); }
public abstract class AuditedEntity : Entity
{
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAtUtc { get; set; }
    public byte[] RowVersion { get; set; } = [];
}

public sealed class AppUser : IdentityUser<Guid>
{
    public string DisplayName { get; set; } = string.Empty;
    public string PreferredLanguage { get; set; } = "fa";
    public int SessionTimeoutMinutes { get; set; } = 30;
    public string Theme { get; set; } = "system";
    public bool CompactMode { get; set; }
    public string FontFamily { get; set; } = "vazirmatn";
    public string FontSize { get; set; } = "normal";
    public Guid? PersonId { get; set; }
    public Person? Person { get; set; }
    public bool IsActive { get; set; } = true;
    public List<UserPermission> Permissions { get; set; } = [];
}

public sealed class UserTaskState : Entity
{
    public Guid UserId { get; set; }
    public AppUser User { get; set; } = null!;
    public required string WorkItemKey { get; set; }
    public DateTime? ViewedAtUtc { get; set; }
    public DateTime? ActionStartedAtUtc { get; set; }
}

public sealed class UserSession : Entity
{
    public Guid UserId { get; set; }
    public AppUser User { get; set; } = null!;
    public DateTime LastSeenAtUtc { get; set; } = DateTime.UtcNow;
    public bool IsOnline { get; set; } = true;
}

public sealed class MaintenanceNotice : Entity
{
    public Guid RequestedByUserId { get; set; }
    public required string RequesterName { get; set; }
    public required string RequesterRoles { get; set; }
    public required string Operation { get; set; }
    public required string Reason { get; set; }
    public int EstimatedMinutes { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAtUtc { get; set; }
}

public sealed class RoleTaskSetting : Entity
{
    public required string RoleName { get; set; }
    public required string TaskCategory { get; set; }
    public int SlaHours { get; set; } = 24;
}

public sealed class UserPermission : Entity
{
    public Guid UserId { get; set; }
    public AppUser User { get; set; } = null!;
    public required string PermissionKey { get; set; }
    public bool IsGranted { get; set; }
}

public sealed class Person : AuditedEntity
{
    public required string PersonCode { get; set; }
    public PersonType PersonType { get; set; }
    public string? CompanyName { get; set; }
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
    public required string DisplayName { get; set; }
    public string? Phone { get; set; }
    public string? Mobile { get; set; }
    public string? Address { get; set; }
    public string? AccountingCode { get; set; }
    public Guid? JobId { get; set; }
    public ParameterValue? Job { get; set; }
    public Guid? TitleId { get; set; }
    public ParameterValue? Title { get; set; }
    public Guid? NationalityId { get; set; }
    public ParameterValue? Nationality { get; set; }
    public string PreferredLanguage { get; set; } = "fa";
    public decimal CreditLimitIRR { get; set; }
    public string? Notes { get; set; }
    public bool IsActive { get; set; } = true;
    public PartnerKind PartnerKind { get; set; }
    public List<PersonRole> Roles { get; set; } = [];
}

public sealed class ParameterValue : AuditedEntity
{
    public ParameterType ParameterType { get; set; }
    public required string Code { get; set; }
    public required string NameFa { get; set; }
    public required string NameEn { get; set; }
    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;
}

public sealed class PersonRole : Entity
{
    public Guid PersonId { get; set; }
    public Person Person { get; set; } = null!;
    public required string Role { get; set; }
}

public sealed class YarnType : AuditedEntity
{
    public required string Code { get; set; }
    public required string NameFa { get; set; }
    public required string NameEn { get; set; }
    public string BaseUnit { get; set; } = "KG";
    public bool IsActive { get; set; } = true;
}

public sealed class YarnItem : AuditedEntity
{
    public Guid YarnTypeId { get; set; }
    public YarnType YarnType { get; set; } = null!;
    public required string Code { get; set; }
    public required string NameFa { get; set; }
    public required string NameEn { get; set; }
    public string ComprehensiveName { get; set; } = string.Empty;
    public string? YarnGroup { get; set; }
    public string? Luster { get; set; }
    public string UnitOfMeasure { get; set; } = "KG";
    public string? FixStatus { get; set; }
    public string? Material { get; set; }
    public string? SpinType { get; set; }
    public decimal? FilamentNumber { get; set; }
    public string? SpinningMethod { get; set; }
    public string? ContinuityType { get; set; }
    public decimal? CountValue { get; set; }
    public string? CountType { get; set; }
    public decimal? TwistAmount { get; set; }
    public string? TwistType { get; set; }
    public byte PlyCount { get; set; }
    public string? Notes { get; set; }
    public string? Property1NameFa { get; set; }
    public string? Property1NameEn { get; set; }
    public string? Property1Value { get; set; }
    public string? Property2NameFa { get; set; }
    public string? Property2NameEn { get; set; }
    public string? Property2Value { get; set; }
    public string SearchText { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
}

public sealed class Warehouse : AuditedEntity
{
    public required string Code { get; set; }
    public required string NameFa { get; set; }
    public required string NameEn { get; set; }
    public Guid? OwnerPersonId { get; set; }
    public Guid? CustodianPersonId { get; set; }
    public string? Address { get; set; }
    public bool IsActive { get; set; } = true;
}

public sealed class ExchangeRate : AuditedEntity
{
    public DateOnly RateDate { get; set; }
    public Currency FromCurrency { get; set; }
    public Currency ToCurrency { get; set; }
    public decimal Rate { get; set; }
    public string? Source { get; set; }
    public bool IsFinal { get; set; }
}

public sealed class PurchaseInvoice : AuditedEntity
{
    public Guid? PurchaseOrderId { get; set; }
    public required string InternalNumber { get; set; }
    public string? ExternalInvoiceNumber { get; set; }
    public DateOnly InvoiceDate { get; set; }
    public Guid SupplierId { get; set; }
    public string? BuyerName { get; set; }
    public string? OrderNumber { get; set; }
    public string? BillOfLadingNumber { get; set; }
    public string? OriginPort { get; set; }
    public string? DestinationPort { get; set; }
    public string? DeliveryTerms { get; set; }
    public string? PaymentTerms { get; set; }
    public string? ShipmentMethod { get; set; }
    public Currency Currency { get; set; } = Currency.USD;
    public decimal GoodsTotal { get; set; }
    public decimal InternationalFreight { get; set; }
    public decimal OtherForeignCosts { get; set; }
    public decimal GrandTotal { get; set; }
    public decimal TotalNetWeight { get; set; }
    public decimal TotalGrossWeight { get; set; }
    public int TotalPackages { get; set; }
    public DocumentStatus Status { get; set; }
    public string? Notes { get; set; }
    public Guid? OriginalFileAttachmentId { get; set; }
    public DateTime? PostedAtUtc { get; set; }
    public List<PurchaseInvoiceItem> Items { get; set; } = [];
    public List<PurchaseContainer> Containers { get; set; } = [];
    public List<PurchaseCost> Costs { get; set; } = [];
}

public sealed class PurchaseOrder : AuditedEntity
{
    public required string OrderNumber { get; set; }
    public DateOnly OrderDate { get; set; }
    public DateOnly? RequiredByDate { get; set; }
    public PurchaseOrderPriority Priority { get; set; }
    public Currency Currency { get; set; } = Currency.USD;
    public Guid? PreferredSupplierId { get; set; }
    public Guid RequestedByUserId { get; set; }
    public PurchaseOrderStatus Status { get; set; }
    public string? Notes { get; set; }
    public DateTime? SubmittedAtUtc { get; set; }
    public DateTime? CommerceStartedAtUtc { get; set; }
    public DateTime? CompletedAtUtc { get; set; }
    public List<PurchaseOrderItem> Items { get; set; } = [];
}

public sealed class PurchaseOrderItem : Entity
{
    public Guid PurchaseOrderId { get; set; }
    public int LineNumber { get; set; }
    public Guid YarnItemId { get; set; }
    public required string DescriptionSnapshot { get; set; }
    public decimal Quantity { get; set; }
    public string Unit { get; set; } = "KG";
    public decimal? EstimatedUnitPrice { get; set; }
    public decimal? EstimatedAmount { get; set; }
    public string? RequiredSpecifications { get; set; }
    public string? Notes { get; set; }
}

public sealed class PurchaseInvoiceItem : Entity
{
    public Guid PurchaseInvoiceId { get; set; }
    public int LineNumber { get; set; }
    public Guid? YarnItemId { get; set; }
    public required string OriginalDescription { get; set; }
    public string? OriginalSpecification { get; set; }
    public string Unit { get; set; } = "KG";
    public decimal NetWeight { get; set; }
    public decimal GrossWeight { get; set; }
    public int PackageCount { get; set; }
    public decimal UnitPriceUSD { get; set; }
    public decimal GoodsAmountUSD { get; set; }
    public Guid? ContainerId { get; set; }
    public string? Notes { get; set; }
}

public sealed class PurchaseContainer : Entity
{
    public Guid PurchaseInvoiceId { get; set; }
    public required string ContainerNumber { get; set; }
    public string? SealNumber { get; set; }
    public string? ContainerType { get; set; }
    public string? BillOfLadingNumber { get; set; }
    public decimal NetWeight { get; set; }
    public decimal GrossWeight { get; set; }
    public int PackageCount { get; set; }
    public string? Notes { get; set; }
}

public sealed class PurchaseItemContainer : Entity
{
    public Guid PurchaseInvoiceItemId { get; set; }
    public Guid PurchaseContainerId { get; set; }
    public decimal NetWeight { get; set; }
    public decimal GrossWeight { get; set; }
    public int PackageCount { get; set; }
}

public sealed class PurchaseCost : AuditedEntity
{
    public Guid PurchaseInvoiceId { get; set; }
    public Guid? PurchaseContainerId { get; set; }
    public Guid? PurchaseInvoiceItemId { get; set; }
    public required string CostType { get; set; }
    public string? Description { get; set; }
    public DateOnly CostDate { get; set; }
    public Currency OriginalCurrency { get; set; }
    public decimal OriginalAmount { get; set; }
    public decimal ExchangeRate { get; set; }
    public decimal AmountIRR { get; set; }
    public decimal AmountUSD { get; set; }
    public PartnerKind ResponsiblePartner { get; set; }
    public string AllocationScope { get; set; } = "Invoice";
    public string AllocationMethod { get; set; } = "Weight";
    public bool IsReasonableImportCost { get; set; } = true;
    public Guid? AttachmentId { get; set; }
    public bool IsPosted { get; set; }
    public string? Notes { get; set; }
}

public sealed class PurchaseCostAllocation : Entity
{
    public Guid PurchaseCostId { get; set; }
    public Guid PurchaseInvoiceItemId { get; set; }
    public decimal ApplicableWeight { get; set; }
    public decimal AllocatedIRR { get; set; }
    public decimal AllocatedUSD { get; set; }
    public bool IsManualOverride { get; set; }
}

public sealed class InventoryMovement : Entity
{
    public DateTime MovementDateUtc { get; set; }
    public MovementType MovementType { get; set; }
    public Guid WarehouseId { get; set; }
    public Guid YarnItemId { get; set; }
    public decimal Quantity { get; set; }
    public required string SourceDocumentType { get; set; }
    public Guid SourceDocumentId { get; set; }
    public Guid? PurchaseInvoiceItemId { get; set; }
    public Guid? SaleItemId { get; set; }
    public decimal UnitCostUSD { get; set; }
    public decimal UnitCostIRR { get; set; }
    public string? Notes { get; set; }
    public DateTime PostedAtUtc { get; set; }
}

public sealed class InventoryLayer : Entity
{
    public Guid WarehouseId { get; set; }
    public Guid YarnItemId { get; set; }
    public Guid PurchaseInvoiceItemId { get; set; }
    public DateTime ReceivedAtUtc { get; set; }
    public decimal OriginalQuantity { get; set; }
    public decimal RemainingQuantity { get; set; }
    public decimal UnitPurchaseUSD { get; set; }
    public decimal UnitInternationalFreightUSD { get; set; }
    public decimal UnitIranianImportCostUSD { get; set; }
}

public sealed class PriceList : AuditedEntity
{
    public required string NameFa { get; set; }
    public required string NameEn { get; set; }
    public DateOnly ValidFrom { get; set; }
    public DateOnly? ValidTo { get; set; }
    public bool IsActive { get; set; } = true;
    public string? Notes { get; set; }
    public List<PriceListItem> Items { get; set; } = [];
}

public sealed class PriceListItem : Entity
{
    public Guid PriceListId { get; set; }
    public Guid YarnItemId { get; set; }
    public decimal CashUnitPriceIRR { get; set; }
    public Guid? WarehouseId { get; set; }
    public Guid? SellerId { get; set; }
}

public sealed class CreditRateRule : AuditedEntity
{
    public int Version { get; set; }
    public DateOnly ValidFrom { get; set; }
    public DateOnly? ValidTo { get; set; }
    public int FromDay { get; set; }
    public int? ToDay { get; set; }
    public int PeriodDays { get; set; } = 30;
    public decimal PeriodRatePercent { get; set; }
    public Guid? YarnItemId { get; set; }
    public Guid? SellerId { get; set; }
    public bool IsActive { get; set; } = true;
}

public sealed class Sale : AuditedEntity
{
    public required string SaleNumber { get; set; }
    public DateOnly SaleDate { get; set; }
    public Guid CustomerId { get; set; }
    public Guid SellerId { get; set; }
    public Guid WarehouseId { get; set; }
    public SaleMode SaleMode { get; set; }
    public CreditPricingMode CreditPricingMode { get; set; }
    public string PaymentArrangementType { get; set; } = "SinglePayment";
    public DateOnly? ContractDueDate { get; set; }
    public int ContractCreditDays { get; set; }
    public DateOnly? WeightedDueDate { get; set; }
    public decimal WeightedCreditDays { get; set; }
    public decimal TotalCashEquivalentIRR { get; set; }
    public decimal TotalCreditSaleIRR { get; set; }
    public decimal TotalCreditIncreaseIRR { get; set; }
    public DocumentStatus Status { get; set; }
    public string? Notes { get; set; }
    public DateTime? PostedAtUtc { get; set; }
    public List<SaleItem> Items { get; set; } = [];
    public List<SalePaymentSchedule> PaymentSchedules { get; set; } = [];
}

public sealed class SaleItem : Entity
{
    public Guid SaleId { get; set; }
    public Guid YarnItemId { get; set; }
    public decimal Quantity { get; set; }
    public Guid? CashPriceListItemId { get; set; }
    public decimal CashUnitPriceSnapshotIRR { get; set; }
    public decimal CashTotalIRR { get; set; }
    public decimal CreditUnitPriceIRR { get; set; }
    public decimal CreditTotalIRR { get; set; }
    public decimal CreditIncreaseIRR { get; set; }
    public decimal CalculatedCreditPercent { get; set; }
    public int CreditRuleVersion { get; set; }
    public CostingMethod CostingMethodSnapshot { get; set; }
    public decimal CostUSD { get; set; }
    public decimal ExchangeRateSnapshot { get; set; }
    public decimal CostIRR { get; set; }
    public decimal CashProfitOrLossIRR { get; set; }
    public string? Notes { get; set; }
}

public sealed class SalePaymentSchedule : Entity
{
    public Guid SaleId { get; set; }
    public int Sequence { get; set; }
    public PaymentMethod PaymentType { get; set; }
    public decimal AmountIRR { get; set; }
    public decimal AmountUSD { get; set; }
    public decimal? ExchangeRate { get; set; }
    public DateOnly DueDate { get; set; }
    public int DueDaysFromSale { get; set; }
    public Guid? CheckId { get; set; }
    public decimal ReceivedAmountIRR { get; set; }
    public decimal ReceivedAmountUSD { get; set; }
    public DateOnly? ActualReceivedDate { get; set; }
    public string Status { get; set; } = "Open";
    public string? Notes { get; set; }
}

public sealed class SaleCostAllocation : Entity
{
    public Guid SaleItemId { get; set; }
    public Guid InventoryLayerId { get; set; }
    public decimal Quantity { get; set; }
    public decimal UnitPurchaseUSD { get; set; }
    public decimal UnitInternationalFreightUSD { get; set; }
    public decimal UnitIranianImportCostUSD { get; set; }
    public decimal UnitTotalCostUSD { get; set; }
    public decimal ExchangeRateAtSale { get; set; }
    public decimal UnitTotalCostIRR { get; set; }
    public decimal TotalCostUSD { get; set; }
    public decimal TotalCostIRR { get; set; }
}

public sealed class MoneyDocument : AuditedEntity
{
    public required string DocumentNumber { get; set; }
    public MoneyDocumentType DocumentType { get; set; }
    public DateOnly DocumentDate { get; set; }
    public Guid PersonId { get; set; }
    public string? Subject { get; set; }
    public string? Description { get; set; }
    public decimal TotalIRR { get; set; }
    public decimal TotalUSD { get; set; }
    public DocumentStatus Status { get; set; }
    public int AttachmentCount { get; set; }
    public Guid CreatedBy { get; set; }
    public DateTime? PostedAtUtc { get; set; }
    public List<MoneyDocumentLine> Lines { get; set; } = [];
}

public sealed class MoneyDocumentLine : Entity
{
    public Guid MoneyDocumentId { get; set; }
    public PaymentMethod PaymentMethod { get; set; }
    public decimal AmountIRR { get; set; }
    public decimal AmountUSD { get; set; }
    public decimal ExchangeRate { get; set; }
    public string? CashOrBankAccount { get; set; }
    public Guid? CheckId { get; set; }
    public DateOnly? DueDate { get; set; }
    public Guid? SaleId { get; set; }
    public Guid? PartnerSettlementId { get; set; }
    public string? Description { get; set; }
}

public sealed class Check : AuditedEntity
{
    public required string CheckNumber { get; set; }
    public string? SayadNumber { get; set; }
    public required string OwnerName { get; set; }
    public required string BankName { get; set; }
    public string? BranchName { get; set; }
    public string? AccountNumber { get; set; }
    public decimal AmountIRR { get; set; }
    public DateOnly ReceivedDate { get; set; }
    public DateOnly DueDate { get; set; }
    public Guid CustomerId { get; set; }
    public Guid? RelatedSaleId { get; set; }
    public CheckStatus CurrentStatus { get; set; }
    public string? Notes { get; set; }
    public Guid? FrontImageAttachmentId { get; set; }
    public Guid? BackImageAttachmentId { get; set; }
}

public sealed class CheckOperation : Entity
{
    public Guid CheckId { get; set; }
    public DateTime OperationDateUtc { get; set; }
    public required string OperationType { get; set; }
    public CheckStatus FromStatus { get; set; }
    public CheckStatus ToStatus { get; set; }
    public Guid? RelatedPersonId { get; set; }
    public Guid? RelatedMoneyDocumentId { get; set; }
    public string? Description { get; set; }
    public Guid CreatedBy { get; set; }
}

public sealed class PartnerShareRule : AuditedEntity
{
    public DateOnly ValidFrom { get; set; }
    public DateOnly? ValidTo { get; set; }
    public PartnerResultType ResultType { get; set; }
    public decimal IranianPartnerPercent { get; set; }
    public decimal ChinesePartnerPercent { get; set; }
    public Guid? YarnItemId { get; set; }
    public Guid? SellerId { get; set; }
    public bool IsActive { get; set; } = true;
}

public sealed class PartnerLedgerEntry : Entity
{
    public Guid PartnerId { get; set; }
    public DateOnly EntryDate { get; set; }
    public required string EntryType { get; set; }
    public required string DescriptionFa { get; set; }
    public required string DescriptionEn { get; set; }
    public decimal DebitIRR { get; set; }
    public decimal CreditIRR { get; set; }
    public decimal DebitUSD { get; set; }
    public decimal CreditUSD { get; set; }
    public decimal? ExchangeRate { get; set; }
    public required string SourceDocumentType { get; set; }
    public Guid SourceDocumentId { get; set; }
    public bool IsPosted { get; set; }
    public Guid? ReversalOfEntryId { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class PartnerSettlement : AuditedEntity
{
    public required string SettlementNumber { get; set; }
    public Guid PartnerId { get; set; }
    public DateOnly SettlementDate { get; set; }
    public decimal PaidUSD { get; set; }
    public decimal ExchangeRate { get; set; }
    public decimal EquivalentIRR { get; set; }
    public string? SourceBankAccount { get; set; }
    public string? Description { get; set; }
    public DocumentStatus Status { get; set; }
    public Guid? AttachmentId { get; set; }
    public List<PartnerSettlementAllocation> Allocations { get; set; } = [];
}

public sealed class PartnerSettlementAllocation : Entity
{
    public Guid PartnerSettlementId { get; set; }
    public Guid PartnerLedgerEntryId { get; set; }
    public decimal AllocatedIRR { get; set; }
    public decimal ConvertedUSD { get; set; }
    public decimal ExchangeRate { get; set; }
}

public sealed class PartnerAdvanceAllocation : Entity
{
    public Guid PartnerSettlementId { get; set; }
    public Guid SaleId { get; set; }
    public DateOnly AllocationDate { get; set; }
    public int OriginalCreditDays { get; set; }
    public int AdjustedCreditDays { get; set; }
    public int AdjustmentDays { get; set; }
    public decimal OriginalCreditIncreaseIRR { get; set; }
    public decimal AdjustedCreditIncreaseIRR { get; set; }
    public decimal DifferenceIRR { get; set; }
    public string? Notes { get; set; }
}

public sealed class Attachment : Entity
{
    public required string EntityType { get; set; }
    public Guid EntityId { get; set; }
    public required string DocumentType { get; set; }
    public string? DocumentNumber { get; set; }
    public DateOnly? DocumentDate { get; set; }
    public required string OriginalFileName { get; set; }
    public required string StoredFileName { get; set; }
    public required string ContentType { get; set; }
    public long FileSize { get; set; }
    public required string FileHash { get; set; }
    public string? Description { get; set; }
    public bool IsMissingPhysicalDocument { get; set; }
    public DateTime UploadedAtUtc { get; set; } = DateTime.UtcNow;
    public Guid UploadedBy { get; set; }
}

public sealed class AuditLog : Entity
{
    public Guid? UserId { get; set; }
    public DateTime TimestampUtc { get; set; } = DateTime.UtcNow;
    public required string Action { get; set; }
    public required string EntityName { get; set; }
    public string? EntityId { get; set; }
    public string? PreviousValueJson { get; set; }
    public string? NewValueJson { get; set; }
}

public sealed class SystemSetting : Entity
{
    public required string Key { get; set; }
    public required string Value { get; set; }
    public DateOnly ValidFrom { get; set; }
}
