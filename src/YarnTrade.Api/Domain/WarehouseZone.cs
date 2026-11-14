namespace YarnTrade.Api.Domain;

public sealed class WarehouseZone : AuditedEntity
{
    public Guid WarehouseId { get; set; }
    public int FloorNumber { get; set; } = 1;
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public string NormalizedCode { get; set; } = "";
    public string NormalizedName { get; set; } = "";
    public string? Description { get; set; }
    public bool IsDefaultReceiving { get; set; }
    public bool IsActive { get; set; } = true;
}

public sealed class WarehouseCustodianPeriod : Entity
{
    public Guid WarehouseId { get; set; }
    public Guid PersonId { get; set; }
    public DateTime StartedAtUtc { get; set; }
    public DateTime? EndedAtUtc { get; set; }
    public Guid? ChangedByUserId { get; set; }
    public string? Reason { get; set; }
}
