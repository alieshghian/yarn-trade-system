using System.Linq.Expressions;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Data;
using YarnTrade.Api.Security;

namespace YarnTrade.Api.Controllers;

public sealed record ProductGroupGridRequest(int Page = 1, int PageSize = 100, string Search = "", string? SearchMode = "startsWith", bool ReverseSearch = false,
    Dictionary<string, GridColumnFilterRequest>? Filters = null, List<GridSortRequest>? Sort = null, string? OptionsColumn = null, string? OptionsSearch = null);
public sealed record ProductGroupReportView {
    public Guid Id {get;init;}
    public string Code {get;init;} = "";
    public string Level0 {get;init;} = "";
    public string Level1 {get;init;} = "";
    public string Level2 {get;init;} = "";
    public string Level3 {get;init;} = "";
    public string Level4 {get;init;} = "";
    [JsonIgnore] public string Search0 {get;init;} = "";
    [JsonIgnore] public string Search1 {get;init;} = "";
    [JsonIgnore] public string Search2 {get;init;} = "";
    [JsonIgnore] public string Search3 {get;init;} = "";
    [JsonIgnore] public string Search4 {get;init;} = "";
}

/// <summary>SQL projection of leaf paths, including incomplete branches. No Laboratory records or in-memory full dataset.</summary>
[ApiController, Route("api/master-data/product-groups/grid"), Authorize]
public sealed class ProductGroupGridController(AppDbContext db) : ControllerBase
{
    private IQueryable<ProductGroupReportView> ReportQuery() {
        var active = db.ProductGroups.AsNoTracking().Where(x => !x.IsDeleted);
        return from n in active
               where !active.Any(child => child.ParentId == n.Id)
               select new ProductGroupReportView {Id=n.Id, Code=n.RootCode,
                   Level0=n.Depth == 0 ? n.Name : n.Depth == 1 ? n.Parent!.Name : n.Depth == 2 ? n.Parent!.Parent!.Name : n.Depth == 3 ? n.Parent!.Parent!.Parent!.Name : n.Parent!.Parent!.Parent!.Parent!.Name,
                   Level1=n.Depth < 1 ? "" : n.Depth == 1 ? n.Name : n.Depth == 2 ? n.Parent!.Name : n.Depth == 3 ? n.Parent!.Parent!.Name : n.Parent!.Parent!.Parent!.Name,
                   Level2=n.Depth < 2 ? "" : n.Depth == 2 ? n.Name : n.Depth == 3 ? n.Parent!.Name : n.Parent!.Parent!.Name,
                   Level3=n.Depth < 3 ? "" : n.Depth == 3 ? n.Name : n.Parent!.Name,
                   Level4=n.Depth < 4 ? "" : n.Name,
                   Search0=n.Depth == 0 ? n.NormalizedName : n.Depth == 1 ? n.Parent!.NormalizedName : n.Depth == 2 ? n.Parent!.Parent!.NormalizedName : n.Depth == 3 ? n.Parent!.Parent!.Parent!.NormalizedName : n.Parent!.Parent!.Parent!.Parent!.NormalizedName,
                   Search1=n.Depth < 1 ? "" : n.Depth == 1 ? n.NormalizedName : n.Depth == 2 ? n.Parent!.NormalizedName : n.Depth == 3 ? n.Parent!.Parent!.NormalizedName : n.Parent!.Parent!.Parent!.NormalizedName,
                   Search2=n.Depth < 2 ? "" : n.Depth == 2 ? n.NormalizedName : n.Depth == 3 ? n.Parent!.NormalizedName : n.Parent!.Parent!.NormalizedName,
                   Search3=n.Depth < 3 ? "" : n.Depth == 3 ? n.NormalizedName : n.Parent!.NormalizedName,
                   Search4=n.Depth < 4 ? "" : n.NormalizedName};
    }

    [HttpPost, RequirePermission("productGroups.view")]
    public async Task<ActionResult<ServerGridPage<ProductGroupReportView>>> Query(ProductGroupGridRequest request, CancellationToken ct) {
        var page = Math.Clamp(request.Page, 1, 1000000); var size = Math.Clamp(request.PageSize, 1, 500);
        var query = ReportQuery();
        if (!string.IsNullOrWhiteSpace(request.Search)) {
            var parameter = Expression.Parameter(typeof(ProductGroupReportView), "row");
            Expression match = Expression.Constant(true);
            var normalized=ProductGroupsController.NormalizeName(request.Search);
            foreach (var term in request.SearchMode=="exact" ? new[]{normalized} : normalized.Split(' ', StringSplitOptions.RemoveEmptyEntries)) {
                Expression any = Expression.Constant(false);
                foreach (var column in Columns) {
                    var text = Expression.Property(parameter, column=="Code" ? column : column.Replace("Level","Search"));
                    var value = Expression.Constant(term);
                    Expression condition = request.SearchMode == "exact" ? Expression.Equal(text, value)
                        : request.SearchMode == "contains" ? Expression.Call(text, nameof(string.Contains), Type.EmptyTypes, value)
                        : Expression.OrElse(Expression.Call(text, nameof(string.StartsWith), Type.EmptyTypes, value), Expression.Call(text, nameof(string.Contains), Type.EmptyTypes, Expression.Constant(" " + term)));
                    any = Expression.OrElse(any, condition);
                }
                match = Expression.AndAlso(match, any);
            }
            if (request.ReverseSearch) match = Expression.Not(match);
            query = query.Where(Expression.Lambda<Func<ProductGroupReportView, bool>>(match, parameter));
        }
        foreach (var (id, filter) in request.Filters ?? []) {
            var column = Column(id); if (column is null || id == request.OptionsColumn) continue;
            var selector = Selector(column); var text = selector.Body;
            Expression body = Expression.Constant(true);
            if (filter.SelectedValues is {} selected) {
                var values = selected.Select(key => key == "\0blank" ? "" : key.StartsWith("string:") ? key[7..] : key).ToArray();
                body = Expression.Call(typeof(Enumerable), nameof(Enumerable.Contains), [typeof(string)], Expression.Constant(values), text);
                if (filter.SelectionMode == "exclude") body = Expression.Not(body);
            }
            if (filter.Custom is {} custom) {
                if (!ValidOperator(custom.First.Operator) || custom.Second is {} other && !ValidOperator(other.Operator)) return BadRequest(new {error="عملگر فیلتر معتبر نیست."});
                var condition = Condition(text, custom.First);
                if (custom.Second is {} second) condition = custom.Logic == "or" ? Expression.OrElse(condition, Condition(text, second)) : Expression.AndAlso(condition, Condition(text, second));
                body = Expression.AndAlso(body, condition);
            }
            query = query.Where(Expression.Lambda<Func<ProductGroupReportView, bool>>(body, selector.Parameters));
        }
        if (request.OptionsColumn is {} option) {
            var column = Column(option); if (column is null) return BadRequest(new {error="ستون گزارش معتبر نیست."});
            var values = query.Select(Selector(column)).Distinct();
            if (!string.IsNullOrWhiteSpace(request.OptionsSearch)) values = values.Where(x => x.Contains(request.OptionsSearch.Trim()));
            return Ok(new ServerGridPage<ProductGroupReportView>([], 0, page, size, (await values.OrderBy(x=>x).Take(500).ToArrayAsync(ct)).Cast<object?>().ToArray()));
        }
        var total = await query.CountAsync(ct);
        var offset = (page - 1) * size;
        if (offset >= total) return Ok(new ServerGridPage<ProductGroupReportView>([], total, page, size));
        IOrderedQueryable<ProductGroupReportView>? sorted = null;
        foreach (var sort in request.Sort ?? []) {
            var column = Column(sort.Id); if (column is null) continue;
            var selector = Selector(column);
            sorted = sorted is null ? sort.Direction == "desc" ? query.OrderByDescending(selector) : query.OrderBy(selector)
                : sort.Direction == "desc" ? sorted.ThenByDescending(selector) : sorted.ThenBy(selector);
        }
        sorted = (sorted ?? query.OrderBy(x=>x.Code)).ThenBy(x=>x.Id);
        if (page == 1 && total <= size)
        {
            // With a sparse match, SQL Server's OFFSET/FETCH row goal can scan
            // millions of joined rows trying to fill a page that cannot be filled.
            // Bound the reader as well: records may be inserted after CountAsync.
            var items = new List<ProductGroupReportView>(total);
            await foreach (var row in sorted.AsAsyncEnumerable().WithCancellation(ct))
            {
                items.Add(row);
                if (items.Count == size) break;
            }
            return Ok(new ServerGridPage<ProductGroupReportView>(items.ToArray(), total, page, size));
        }
        return Ok(new ServerGridPage<ProductGroupReportView>(await sorted.Skip(offset).Take(size).ToArrayAsync(ct), total, page, size));
    }
    private static readonly string[] Columns = ["Code", "Level0", "Level1", "Level2", "Level3", "Level4"];
    private static bool ValidOperator(string op) => op is "equals" or "on" or "notEquals" or "contains" or "notContains" or "beginsWith" or "endsWith";
    private static string? Column(string id) => id == "product-group.cascading-tree.code" ? "Code" : Enumerable.Range(0,5).Where(i=>id=="product-group.cascading-tree.level."+i).Select(i=>"Level"+i).FirstOrDefault();
    private static Expression<Func<ProductGroupReportView,string>> Selector(string column) {
        var p=Expression.Parameter(typeof(ProductGroupReportView),"row"); return Expression.Lambda<Func<ProductGroupReportView,string>>(Expression.Property(p,column),p);
    }
    private static Expression Condition(Expression text, GridConditionRequest c) {
        var value=Expression.Constant(c.Value.Trim());
        Expression result=c.Operator switch {
            "equals" or "on" => Expression.Equal(text,value), "notEquals" => Expression.NotEqual(text,value),
            "contains" or "notContains" => Expression.Call(text,nameof(string.Contains),Type.EmptyTypes,value),
            "beginsWith" => Expression.Call(text,nameof(string.StartsWith),Type.EmptyTypes,value),
            "endsWith" => Expression.Call(text,nameof(string.EndsWith),Type.EmptyTypes,value),
            _ => throw new ArgumentException("Unsupported report filter")
        };
        return c.Operator=="notContains" ? Expression.Not(result) : result;
    }
}
