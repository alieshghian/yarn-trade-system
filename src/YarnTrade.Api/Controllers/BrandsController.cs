using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;
using YarnTrade.Api.Security;
using YarnTrade.Api.Services;

namespace YarnTrade.Api.Controllers;

public sealed record BrandInput(string? BrandCode, string? BrandName, string? Address);
public sealed record BrandView(Guid Id, string BrandCode, string BrandName, string? Address, byte[] RowVersion)
{
    public static BrandView From(Brand brand) => new(brand.Id, brand.BrandCode, brand.BrandName, brand.Address, brand.RowVersion);
}

[ApiController, Route("api/master-data/brands"), Authorize]
public sealed class BrandsController(AppDbContext db) : ControllerBase
{
    [HttpGet, RequirePermission("brands.view")]
    public async Task<object> List([FromQuery] string? q, [FromQuery] int page = 1, [FromQuery] int pageSize = 50, CancellationToken ct = default)
    {
        var query = db.Brands.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(q)) { var term = q.Trim(); query = query.Where(x => x.BrandCode.Contains(term) || x.BrandName.Contains(term) || x.Address != null && x.Address.Contains(term)); }
        var total = await query.CountAsync(ct);
        var size = Math.Clamp(pageSize, 1, 500);
        var items = await query.OrderBy(x => x.BrandCode).Skip((Math.Max(page, 1) - 1) * size).Take(size).ToListAsync(ct);
        return new { items = items.Select(BrandView.From), total, page = Math.Max(page, 1), pageSize = size };
    }

    [HttpGet("{id:guid}"), RequirePermission("brands.view")]
    public async Task<ActionResult<BrandView>> Get(Guid id, CancellationToken ct)
    {
        var brand = await db.Brands.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
        return brand is null ? NotFound() : Ok(BrandView.From(brand));
    }

    [HttpPost, RequirePermission("brands.create")]
    public async Task<ActionResult<BrandView>> Create(BrandInput input, CancellationToken ct)
    {
        if (await Validate(input, null, ct) is { } error) return BadRequest(new { error });
        var brand = new Brand { BrandCode = Code(input), BrandName = input.BrandName!.Trim(), Address = Clean(input.Address) };
        db.Brands.Add(brand);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException e) when (e.InnerException is Microsoft.Data.SqlClient.SqlException { Number: 2601 or 2627 })
        { return Conflict(new { code = "DUPLICATE_BRAND_CODE", error = "کد برند تکراری است." }); }
        return CreatedAtAction(nameof(Get), new { id = brand.Id }, BrandView.From(brand));
    }

    [HttpPut("{id:guid}"), RequirePermission("brands.edit")]
    public async Task<ActionResult<BrandView>> Update(Guid id, BrandInput input, [FromQuery] string? rowVersion, CancellationToken ct)
    {
        var brand = await db.Brands.SingleOrDefaultAsync(x => x.Id == id, ct);
        if (brand is null) return NotFound();
        if (AggregateConcurrency.Apply(db, brand, rowVersion) is { } conflict) return conflict;
        if (await Validate(input, id, ct) is { } error) return BadRequest(new { error });
        brand.BrandCode = Code(input); brand.BrandName = input.BrandName!.Trim(); brand.Address = Clean(input.Address);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { return AggregateConcurrency.Conflict(); }
        catch (DbUpdateException e) when (e.InnerException is Microsoft.Data.SqlClient.SqlException { Number: 2601 or 2627 })
        { return Conflict(new { code = "DUPLICATE_BRAND_CODE", error = "کد برند تکراری است." }); }
        return Ok(BrandView.From(brand));
    }

    [HttpDelete("{id:guid}"), RequirePermission("brands.delete")]
    public async Task<IActionResult> Delete(Guid id, [FromQuery] string? rowVersion, CancellationToken ct)
    {
        var brand = await db.Brands.SingleOrDefaultAsync(x => x.Id == id, ct);
        if (brand is null) return NotFound();
        if (AggregateConcurrency.Apply(db, brand, rowVersion, touch: false) is { } conflict) return conflict;
        if (await db.PersonBrands.AnyAsync(x => x.BrandId == id, ct) || await db.Persons.AnyAsync(x => x.DefaultBrandId == id, ct)
            || await db.PurchaseInvoices.AnyAsync(x => x.BrandId == id, ct)) return Referenced();
        db.Brands.Remove(brand);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { return AggregateConcurrency.Conflict(); }
        catch (DbUpdateException e) when (e.InnerException is Microsoft.Data.SqlClient.SqlException { Number: 547 }) { return Referenced(); }
        return NoContent();
    }

    private async Task<string?> Validate(BrandInput input, Guid? id, CancellationToken ct)
    {
        var code = Code(input);
        if (code.Length is 0 or > 30) return "کد برند الزامی و حداکثر ۳۰ کاراکتر است.";
        if (string.IsNullOrWhiteSpace(input.BrandName) || input.BrandName.Trim().Length > 200) return "نام برند الزامی و حداکثر ۲۰۰ کاراکتر است.";
        if (input.Address?.Trim().Length > 2000) return "آدرس حداکثر ۲۰۰۰ کاراکتر است.";
        return await db.Brands.AnyAsync(x => x.BrandCode == code && x.Id != id, ct) ? "کد برند تکراری است." : null;
    }
    private static string Code(BrandInput input) => input.BrandCode?.Trim().ToUpperInvariant() ?? "";
    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static ConflictObjectResult Referenced() => new(new { code = "BRAND_IN_USE", error = "برند دارای ارتباط یا سابقهٔ خرید قابل حذف نیست." });
}
