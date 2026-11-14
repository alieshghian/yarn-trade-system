using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Data;
using YarnTrade.Api.Security;

namespace YarnTrade.Api.Controllers;

// Sources are explicit permission-checked endpoints, never arbitrary URLs supplied by a document.
[ApiController, Route("api/system-lookups"), Authorize]
public sealed class SystemLookupsController(AppDbContext db) : ControllerBase
{
    public sealed record Item { public Guid Id { get; init; } public string Code { get; init; } = ""; public string Name { get; init; } = ""; }

    [HttpGet("persons"), RequirePermission("persons.view")]
    public Task<object> Persons(string? q, string? fields, int page = 1, CancellationToken ct = default) =>
        Search(db.Persons.AsNoTracking().Where(x => x.IsActive).Select(x => new Item { Id = x.Id, Code = x.PersonCode, Name = x.DisplayName }), q, fields, page, ct);

    [HttpGet("brands"), RequirePermission("brands.view")]
    public Task<object> Brands(string? q, string? fields, int page = 1, CancellationToken ct = default, Guid? ownerPersonId = null) =>
        Search(db.Brands.AsNoTracking().Where(x => ownerPersonId == null || !db.PersonBrands.Any(link => link.BrandId == x.Id && link.PersonId != ownerPersonId))
            .Select(x => new Item { Id = x.Id, Code = x.BrandCode, Name = x.BrandName }), q, fields, page, ct);

    // This source exposes all saved nodes. Assignment restrictions belong to the consuming operational write.
    private IQueryable<Item> ProductGroupItems() {
        var active=db.ProductGroups.AsNoTracking().Where(x=>!x.IsDeleted);
        return active
          .Select(n=>new Item{Id=n.Id,Code=n.RootCode,Name=n.Depth==0?n.Name:n.Depth==1?n.Parent!.Name+" / "+n.Name:n.Depth==2?n.Parent!.Parent!.Name+" / "+n.Parent.Name+" / "+n.Name:n.Depth==3?n.Parent!.Parent!.Parent!.Name+" / "+n.Parent.Parent.Name+" / "+n.Parent.Name+" / "+n.Name:n.Parent!.Parent!.Parent!.Parent!.Name+" / "+n.Parent.Parent.Parent.Name+" / "+n.Parent.Parent.Name+" / "+n.Parent.Name+" / "+n.Name});
    }
    [HttpGet("productGroups"),RequirePermission("productGroups.view")]
    public Task<object> ProductGroups(string? q,string? fields,int page=1,CancellationToken ct=default)=>Search(ProductGroupItems(),q,fields,page,ct);
    [HttpGet("productGroups/{id:guid}"),RequirePermission("productGroups.view")]
    public async Task<IActionResult> ProductGroup(Guid id,CancellationToken ct=default)=>await ProductGroupItems().SingleOrDefaultAsync(x=>x.Id==id,ct) is {} item?Ok(item):NotFound();
    private IQueryable<Item> WarehouseItems()=>db.Warehouses.AsNoTracking().Where(x=>x.IsActive).Select(x=>new Item{Id=x.Id,Code=x.Code,Name=x.NameFa});
    [HttpGet("warehouses"),RequirePermission("warehouses.view")]
    public Task<object> Warehouses(string? q,string? fields,int page=1,CancellationToken ct=default)=>Search(WarehouseItems(),q,fields,page,ct);
    [HttpGet("warehouses/{id:guid}"),RequirePermission("warehouses.view")]
    public async Task<IActionResult> Warehouse(Guid id,CancellationToken ct=default)=>await WarehouseItems().SingleOrDefaultAsync(x=>x.Id==id,ct) is {} item?Ok(item):NotFound();

    private static async Task<object> Search(IQueryable<Item> query, string? text, string? fields, int page, CancellationToken ct)
    {
        var columns = (fields ?? "code,name").Split(',', StringSplitOptions.RemoveEmptyEntries).ToHashSet(StringComparer.Ordinal);
        if (!columns.Overlaps(["code", "name"])) columns.UnionWith(["code", "name"]);
        var code = columns.Contains("code"); var name = columns.Contains("name");
        var normalized = (text ?? "").Normalize(System.Text.NormalizationForm.FormKC).Replace('ي', 'ی').Replace('ى', 'ی').Replace('ك', 'ک').Replace("\u200c", "").ToLowerInvariant();
        for (var i = 0; i < 10; i++) normalized = normalized.Replace((char)('۰' + i), (char)('0' + i)).Replace((char)('٠' + i), (char)('0' + i));
        foreach (var term in normalized.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries).Take(12))
        {
            // Keep normalization inside SQL, so only a bounded page crosses the network.
            const string from = "يىك۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", to = "ییک01234567890123456789";
            query = query.Where(x =>
                code && AppDbContext.TranslateLookupCharacters(x.Code.ToLower().Replace("\u200c", ""), from, to).Contains(term) ||
                name && AppDbContext.TranslateLookupCharacters(x.Name.ToLower().Replace("\u200c", ""), from, to).Contains(term));
        }
        page = Math.Clamp(page, 1, 100000);
        var total = await query.CountAsync(ct);
        var items = await query.OrderBy(x => x.Code).ThenBy(x => x.Id).Skip((page - 1) * 40).Take(40).ToListAsync(ct);
        return new { items, total, page, pageSize = 40 };
    }
}
