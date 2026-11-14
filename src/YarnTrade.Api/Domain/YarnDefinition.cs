namespace YarnTrade.Api.Domain;

// These are live definitions only; no Laboratory test values are seeded.
public sealed class YarnDefinitionState
{
    public Guid YarnId { get; set; }
    public string ReleaseId { get; set; } = "";
    public string ValuesJson { get; set; } = "{}";
    public string NormalizedName { get; set; } = "";
}
public sealed class YarnColor
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid YarnId { get; set; }
    public string Value { get; set; } = "";
    public string NormalizedValue { get; set; } = "";
    public bool IsDefault { get; set; }
}
public sealed class YarnDefinitionReference : AuditedEntity
{
    public string FieldId { get; set; } = "";
    public string Name { get; set; } = "";
    public string NormalizedName { get; set; } = "";
    public bool IsDefault { get; set; }
}
public sealed class YarnPackagingCoefficient
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid YarnId { get; set; }
    public Guid PackagingId { get; set; }
    public decimal CbmPerTon { get; set; }
    public bool IsDefault { get; set; }
}
