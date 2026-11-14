namespace YarnTrade.Api.Domain;

public sealed class ProductGroup : AuditedEntity
{
    public Guid? ParentId { get; set; }
    public ProductGroup? Parent { get; set; }
    public string Name { get; set; } = "";
    public string NormalizedName { get; set; } = "";
    public string RootCode { get; set; } = "";
    public string HierarchyCode { get; set; } = "";
    public int Depth { get; set; }
    public Guid RequestId { get; set; }
    public bool IsDeleted { get; set; }
    // Last confirmed root terminal depth; current product references determine whether the lock is active.
    public int? LockedDepth { get; set; }
}

// A counter survives deletions. Guid.Empty is the root sequence; other IDs are parent IDs.
public sealed class ProductGroupCounter
{
    public Guid Id { get; set; }
    public long LastValue { get; set; }
}

public sealed class ProductGroupPolicy : AuditedEntity
{
    public static readonly Guid SingletonId = Guid.Parse("831b871c-f08d-4cb9-bfdd-4cf538172208");
    public int MaxSubgroups { get; set; } = 4;
}
