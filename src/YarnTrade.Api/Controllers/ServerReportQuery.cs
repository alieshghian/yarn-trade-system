using System.Linq.Expressions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
namespace YarnTrade.Api.Controllers;

// Shared bounded SQL query engine used by warehouse, zones and approved yarn reports.
internal static class ServerReportQuery {
    public static async Task<ActionResult<ServerGridPage<T>>> Run<T>(IQueryable<T> query,WarehouseGridRequest request, CancellationToken ct, string[] searchable, string? recencyColumn=null) where T : class {
        string? Resolve(string id)=>searchable.FirstOrDefault(x=>string.Equals(x,id,StringComparison.OrdinalIgnoreCase));
        var page = Math.Clamp(request.Page, 1, 1000000); var size = Math.Clamp(request.PageSize, 1, 500);
        if (!string.IsNullOrWhiteSpace(request.Search)) {
            var parameter = Expression.Parameter(typeof(T), "row");
            Expression match = Expression.Constant(true);
            var normalized=request.Search.Trim();
            foreach (var term in request.SearchMode=="exact" ? new[]{normalized} : normalized.Split(' ', StringSplitOptions.RemoveEmptyEntries)) {
                Expression any = Expression.Constant(false);
                foreach (var column in searchable) {
                    var text = CellText(Expression.Property(parameter, column));
                    var value = Expression.Constant(term);
                    Expression condition = request.SearchMode == "exact" ? Expression.Equal(text, value)
                        : request.SearchMode == "contains" ? Expression.Call(text, nameof(string.Contains), Type.EmptyTypes, value)
                        : Expression.OrElse(Expression.Call(text, nameof(string.StartsWith), Type.EmptyTypes, value), Expression.Call(text, nameof(string.Contains), Type.EmptyTypes, Expression.Constant(" " + term)));
                    any = Expression.OrElse(any, condition);
                }
                match = Expression.AndAlso(match, any);
            }
            if (request.ReverseSearch) match = Expression.Not(match);
            query = query.Where(Expression.Lambda<Func<T, bool>>(match, parameter));
        }
        var searched=query;
        foreach (var (id, filter) in request.Filters ?? []) {
            var column = Resolve(id); if (column is null || id == request.OptionsColumn) continue;
            var selector = Selector<T>(column); var text = selector.Body;
            var raw=Expression.Property(selector.Parameters[0],column);
            var numeric=raw.Type==typeof(decimal)||raw.Type==typeof(decimal?);
            Expression body = Expression.Constant(true);
            if(filter.ValueRule is {} rule){
                if(!numeric||rule.Kind is not ("top" or "bottom" or "aboveAverage" or "belowAverage"))return new BadRequestObjectResult(new{error="قانون فیلتر عددی معتبر نیست."});
                var numbers=searched.Select(Expression.Lambda<Func<T,decimal?>>(Expression.Convert(raw,typeof(decimal?)),selector.Parameters)).Where(n=>n!=null);
                decimal? threshold=rule.Kind switch{
                    "aboveAverage" or "belowAverage"=>await numbers.AverageAsync(ct),
                    "top"=>await numbers.OrderByDescending(n=>n).Take(Math.Clamp(rule.Count,1,1000000)).MinAsync(ct),
                    _=>await numbers.OrderBy(n=>n).Take(Math.Clamp(rule.Count,1,1000000)).MaxAsync(ct)
                };
                body=threshold is null?Expression.Constant(false):NumericCondition(raw,new(rule.Kind switch{"aboveAverage"=>"greaterThan","belowAverage"=>"lessThan","top"=>"greaterOrEqual",_=>"lessOrEqual"},threshold.Value.ToString(System.Globalization.CultureInfo.InvariantCulture)));
            }
            if (filter.SelectedValues is {} selected) {
                var values = selected.Select(key => key == "\0blank" ? "" : key.StartsWith("string:") ? key[7..] : key.StartsWith("number:")?key[7..]:key).ToArray();
                if(numeric){
                    if(values.Any(v=>v!=""&&!decimal.TryParse(v,System.Globalization.NumberStyles.Number,System.Globalization.CultureInfo.InvariantCulture,out _)))return new BadRequestObjectResult(new{error="مقدار فیلتر عددی معتبر نیست."});
                    var numbers=values.Select(v=>v==""?(decimal?)null:decimal.Parse(v,System.Globalization.CultureInfo.InvariantCulture)).ToArray();
                    Expression selection=Expression.Call(typeof(Enumerable),nameof(Enumerable.Contains),[typeof(decimal?)],Expression.Constant(numbers),Expression.Convert(raw,typeof(decimal?)));
                    body=Expression.AndAlso(body,filter.SelectionMode=="exclude"?Expression.Not(selection):selection);
                }else {Expression selection=Expression.Call(typeof(Enumerable), nameof(Enumerable.Contains), [typeof(string)], Expression.Constant(values), text);body=Expression.AndAlso(body,filter.SelectionMode=="exclude"?Expression.Not(selection):selection);}
            }
            if (filter.Custom is {} custom) {
                if (!ValidOperator(custom.First.Operator,numeric) || custom.Second is {} other && !ValidOperator(other.Operator,numeric)) return new BadRequestObjectResult(new {error="عملگر فیلتر معتبر نیست."});
                if(numeric&&new[]{custom.First,custom.Second}.Where(c=>c is not null).Any(c=>!decimal.TryParse(c!.Value,System.Globalization.NumberStyles.Number,System.Globalization.CultureInfo.InvariantCulture,out _)||c.Operator=="between"&&!decimal.TryParse(c.SecondValue,System.Globalization.NumberStyles.Number,System.Globalization.CultureInfo.InvariantCulture,out _)))return new BadRequestObjectResult(new{error="مقدار فیلتر عددی معتبر نیست."});
                var condition = numeric?NumericCondition(raw,custom.First):Condition(text, custom.First);
                if (custom.Second is {} second){var next=numeric?NumericCondition(raw,second):Condition(text,second);condition = custom.Logic == "or" ? Expression.OrElse(condition,next) : Expression.AndAlso(condition,next);}
                body = Expression.AndAlso(body, condition);
            }
            query = query.Where(Expression.Lambda<Func<T, bool>>(body, selector.Parameters));
        }
        if (request.OptionsColumn is {} option) {
            var column = Resolve(option); if (column is null) return new BadRequestObjectResult(new {error="ستون گزارش معتبر نیست."});
            if (!string.IsNullOrWhiteSpace(request.OptionsSearch)) {var p=Expression.Parameter(typeof(T),"row");query=query.Where(Expression.Lambda<Func<T,bool>>(Expression.Call(CellText(Expression.Property(p,column)),nameof(string.Contains),Type.EmptyTypes,Expression.Constant(request.OptionsSearch.Trim())),p));}
            var values = query.Select(SortSelector<T>(column)).Distinct();
            return new OkObjectResult(new ServerGridPage<T>([], 0, page, size, await values.OrderBy(x=>x).Take(500).ToArrayAsync(ct)));
        }
        var total = await query.CountAsync(ct);
        IOrderedQueryable<T>? sorted = null;
        foreach (var sort in request.Sort ?? []) {
            var column = Resolve(sort.Id); if (column is null) continue;
            var selector = SortSelector<T>(column);
            sorted = sorted is null ? sort.Direction == "desc" ? query.OrderByDescending(selector) : query.OrderBy(selector)
                : sort.Direction == "desc" ? sorted.ThenByDescending(selector) : sorted.ThenBy(selector);
        }
        sorted = (sorted ?? (recencyColumn is null ? query.OrderBy(Selector<T>(searchable[0])) : query.OrderByDescending(SortSelector<T>(recencyColumn)))).ThenBy(IdSelector<T>());
        return new OkObjectResult(new ServerGridPage<T>(await sorted.Skip((page-1)*size).Take(size).ToArrayAsync(ct), total, page, size));
    }
    private static Expression<Func<T,string>> Selector<T>(string column) {
        var p=Expression.Parameter(typeof(T),"row"); return Expression.Lambda<Func<T,string>>(CellText(Expression.Property(p,column)),p);
    }
    private static Expression CellText(Expression value)=>value.Type==typeof(string)?Expression.Coalesce(value,Expression.Constant("")):Expression.Call(value,nameof(ToString),Type.EmptyTypes);
    private static Expression<Func<T,object>> SortSelector<T>(string column){var p=Expression.Parameter(typeof(T),"row");return Expression.Lambda<Func<T,object>>(Expression.Convert(Expression.Property(p,column),typeof(object)),p);}
    private static Expression<Func<T,Guid>> IdSelector<T>() { var p=Expression.Parameter(typeof(T),"row");return Expression.Lambda<Func<T,Guid>>(Expression.Property(p,"Id"),p); }
    private static bool ValidOperator(string op,bool numeric) => numeric?op is "equals" or "notEquals" or "greaterThan" or "greaterOrEqual" or "lessThan" or "lessOrEqual" or "between":op is "equals" or "on" or "notEquals" or "contains" or "notContains" or "beginsWith" or "endsWith";
    private static Expression NumericCondition(Expression raw,GridConditionRequest c){
        if(c.Operator=="between"){
            var a=decimal.Parse(c.Value,System.Globalization.CultureInfo.InvariantCulture);var b=decimal.Parse(c.SecondValue!,System.Globalization.CultureInfo.InvariantCulture);
            return Expression.AndAlso(NumericCondition(raw,new("greaterOrEqual",Math.Min(a,b).ToString(System.Globalization.CultureInfo.InvariantCulture))),NumericCondition(raw,new("lessOrEqual",Math.Max(a,b).ToString(System.Globalization.CultureInfo.InvariantCulture))));
        }
        var left=Expression.Convert(raw,typeof(decimal?));var right=Expression.Convert(Expression.Constant(decimal.Parse(c.Value,System.Globalization.CultureInfo.InvariantCulture)),typeof(decimal?));
        return c.Operator switch {"equals"=>Expression.Equal(left,right),"notEquals"=>Expression.NotEqual(left,right),"greaterThan"=>Expression.GreaterThan(left,right),"greaterOrEqual"=>Expression.GreaterThanOrEqual(left,right),"lessThan"=>Expression.LessThan(left,right),"lessOrEqual"=>Expression.LessThanOrEqual(left,right),_=>throw new ArgumentException("Invalid numeric filter")};
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
