using System.Linq.Expressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;
using YarnTrade.Api.Security;

namespace YarnTrade.Api.Controllers;

[ApiController, Route("api/master-data/persons/grid"), Authorize]
public sealed class PersonsGridController(AppDbContext db) : ControllerBase
{
    [HttpPost, RequirePermission("persons.view")]
    public async Task<ActionResult<ServerGridPage<PersonView>>> Query([FromBody] PersonsGridRequest request, CancellationToken ct)
    {
        var page = Math.Max(1, request.Page);
        var pageSize = Math.Clamp(request.PageSize, 1, 500);
        var language = request.Language == "fa" ? "fa" : "en";
        var query = BaseQuery();
        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var term = request.Search.Trim();
            query = query.Where(person => person.PersonCode.Contains(term) || person.DisplayName.Contains(term)
                || (person.Mobile != null && person.Mobile.Contains(term)) || (person.Phone != null && person.Phone.Contains(term))
                || (person.Job != null && (person.Job.NameFa.Contains(term) || person.Job.NameEn.Contains(term)))
                || (person.Nationality != null && (person.Nationality.NameFa.Contains(term) || person.Nationality.NameEn.Contains(term))));
        }

        var filters = request.Filters ?? new Dictionary<string, GridColumnFilterRequest>();
        if (!string.IsNullOrWhiteSpace(request.OptionsColumn))
        {
            var optionQuery = ApplyFilters(query, filters.Where(pair => pair.Key != request.OptionsColumn), language);
            var filterValues = await GetFilterValues(optionQuery, request.OptionsColumn, request.OptionsSearch, language, ct);
            var colors = request.OptionsColumn == "isActive" ? await optionQuery.Select(person => person.IsActive).Distinct().ToListAsync(ct)
                : [];
            var colorValues = colors.Select(active => active ? "#e4f2ec" : "#eeeeee").Distinct().Cast<string?>().ToArray();
            return Ok(new ServerGridPage<PersonView>([], 0, page, pageSize, filterValues, colorValues));
        }

        query = ApplyFilters(query, filters, language);
        var total = await query.CountAsync(ct);
        IQueryable<Person> sorted = query;
        var first = true;
        foreach (var criterion in request.Sort ?? [])
        {
            if (!IsSupportedColumn(criterion.Id)) continue;
            sorted = ApplySort(sorted, criterion, language, first);
            first = false;
        }
        if (first) sorted = sorted.OrderBy(person => person.PersonCode).ThenBy(person => person.Id);
        sorted = ((IOrderedQueryable<Person>)sorted).ThenBy(person => person.PersonCode).ThenBy(person => person.Id);
        var entities = await sorted.Skip((page - 1) * pageSize).Take(pageSize).Include(person => person.Job).Include(person => person.Title)
            .Include(person => person.Nationality).Include(person => person.Roles).Include(person => person.BrandLinks).ToListAsync(ct);
        var ids = entities.Select(person => person.Id).ToArray();
        var linked = await db.BusinessContractVersions.Where(x => x.PartnerPersonId.HasValue && ids.Contains(x.PartnerPersonId.Value))
            .Select(x => x.PartnerPersonId!.Value).Distinct().ToListAsync(ct);
        return Ok(new ServerGridPage<PersonView>(entities.Select(person => PersonView.From(person, linked.Contains(person.Id))).ToArray(), total, page, pageSize));
    }

    private IQueryable<Person> BaseQuery() => db.Persons.AsNoTracking();

    private static IQueryable<Person> ApplyFilters(IQueryable<Person> query, IEnumerable<KeyValuePair<string, GridColumnFilterRequest>> filters, string language)
    {
        foreach (var (column, filter) in filters)
        {
            if (!IsSupportedColumn(column)) continue;
            if (filter.SelectedValues is { } selected)
            {
                if (column == "isActive")
                {
                    var values = selected.Where(key => key.StartsWith("boolean:", StringComparison.Ordinal)).Select(key => bool.TryParse(key[8..], out var value) && value).Distinct().ToArray();
                    query = filter.SelectionMode == "exclude" ? query.Where(person => !values.Contains(person.IsActive)) : query.Where(person => values.Contains(person.IsActive));
                }
                else
                {
                    var values = selected.Select(DecodeTextKey).Distinct().ToArray();
                    var selector = TextSelector(column, language);
                    query = WhereTextValues(query, selector, values, filter.SelectionMode == "exclude");
                }
            }
            if (filter.Custom is { } custom) query = ApplyCustom(query, column, custom, language);
            if (filter.Colors is { } colors && column == "isActive")
            {
                var active = colors.Contains("#e4f2ec", StringComparer.OrdinalIgnoreCase);
                var inactive = colors.Contains("#eeeeee", StringComparer.OrdinalIgnoreCase);
                query = query.Where(person => active && person.IsActive || inactive && !person.IsActive);
            }
        }
        return query;
    }

    private static IQueryable<Person> WhereTextValues(IQueryable<Person> query, Expression<Func<Person, string>> selector, string[] values, bool exclude)
    {
        var parameter = selector.Parameters[0];
        var contains = Expression.Call(typeof(Enumerable), nameof(Enumerable.Contains), [typeof(string)], Expression.Constant(values), selector.Body);
        Expression body = exclude ? Expression.Not(contains) : contains;
        return query.Where(Expression.Lambda<Func<Person, bool>>(body, parameter));
    }

    private static IQueryable<Person> ApplyCustom(IQueryable<Person> query, string column, GridCustomFilterRequest custom, string language)
    {
        if (column == "isActive")
        {
            var first = BoolCondition(custom.First);
            if (first is null) return query;
            var second = custom.Second is null ? null : BoolCondition(custom.Second);
            if (second is null) return query.Where(person => person.IsActive == first.Value);
            return custom.Logic == "or"
                ? query.Where(person => person.IsActive == first.Value || person.IsActive == second.Value)
                : query.Where(person => person.IsActive == first.Value && person.IsActive == second.Value);
        }
        var selector = TextSelector(column, language);
        var firstText = TextCondition(selector, custom.First);
        if (custom.Second is null) return query.Where(firstText);
        var secondText = TextCondition(selector, custom.Second);
        var body = custom.Logic == "or" ? Expression.OrElse(firstText.Body, secondText.Body) : Expression.AndAlso(firstText.Body, secondText.Body);
        var combined = Expression.Lambda<Func<Person, bool>>(body, firstText.Parameters[0]);
        return query.Where(combined);
    }

    private static bool? BoolCondition(GridConditionRequest condition)
    {
        if (!bool.TryParse(condition.Value, out var value)) return null;
        return condition.Operator == "notEquals" ? !value : value;
    }

    private static Expression<Func<Person, bool>> TextCondition(Expression<Func<Person, string>> selector, GridConditionRequest condition)
    {
        var parameter = selector.Parameters[0];
        var value = Expression.Constant(condition.Value.Trim());
        var method = condition.Operator switch
        {
            "contains" or "notContains" => nameof(string.Contains),
            "beginsWith" => nameof(string.StartsWith),
            "endsWith" => nameof(string.EndsWith), _ => string.Empty
        };
        Expression body;
        if (condition.Operator == "equals" || condition.Operator == "on") body = Expression.Equal(selector.Body, value);
        else if (condition.Operator == "notEquals") body = Expression.NotEqual(selector.Body, value);
        else if (method.Length > 0) body = Expression.Call(selector.Body, typeof(string).GetMethod(method, [typeof(string)])!, value);
        else body = Expression.Constant(true);
        if (condition.Operator == "notContains") body = Expression.Not(body);
        return Expression.Lambda<Func<Person, bool>>(body, parameter);
    }

    private static async Task<object?[]> GetFilterValues(IQueryable<Person> query, string column, string? search, string language, CancellationToken ct)
    {
        if (!IsSupportedColumn(column)) return [];
        if (column == "isActive") return await query.Select(person => person.IsActive).Distinct().OrderBy(value => value).Cast<object?>().ToArrayAsync(ct);
        var selector = TextSelector(column, language);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var parameter = selector.Parameters[0];
            var body = Expression.Call(selector.Body, typeof(string).GetMethod(nameof(string.Contains), [typeof(string)])!, Expression.Constant(search.Trim()));
            query = query.Where(Expression.Lambda<Func<Person, bool>>(body, parameter));
        }
        var values = await query.Select(selector).Distinct().OrderBy(value => value).Take(500).ToListAsync(ct);
        return values.Cast<object?>().ToArray();
    }

    private static IQueryable<Person> ApplySort(IQueryable<Person> source, GridSortRequest sort, string language, bool first)
    {
        var descending = sort.Direction == "desc";
        if (sort.Id == "isActive")
        {
            if (sort.ByColor) descending = sort.Direction == "asc";
            if (first) return descending ? source.OrderByDescending(person => person.IsActive) : source.OrderBy(person => person.IsActive);
            var ordered = (IOrderedQueryable<Person>)source;
            return descending ? ordered.ThenByDescending(person => person.IsActive) : ordered.ThenBy(person => person.IsActive);
        }
        var selector = TextSelector(sort.Id, language);
        var parameter = selector.Parameters[0];
        var key = Expression.Lambda<Func<Person, string>>(selector.Body, parameter);
        if (first) return descending ? source.OrderByDescending(key) : source.OrderBy(key);
        var prior = (IOrderedQueryable<Person>)source;
        return descending ? prior.ThenByDescending(key) : prior.ThenBy(key);
    }

    private static Expression<Func<Person, string>> TextSelector(string column, string language) => column switch
    {
        "personCode" => person => person.PersonCode,
        "displayName" => person => person.DisplayName,
        "job" => person => person.Job == null ? "" : language == "fa" ? person.Job.NameFa : person.Job.NameEn,
        "nationality" => person => person.Nationality == null ? "" : language == "fa" ? person.Nationality.NameFa : person.Nationality.NameEn,
        "mobile" => person => person.Mobile ?? "",
        "phone" => person => person.Phone ?? "",
        _ => person => person.PersonCode
    };

    private static string DecodeTextKey(string key) => key == "\0blank" ? "" : key.StartsWith("string:", StringComparison.Ordinal) ? key[7..] : key;
    private static bool IsSupportedColumn(string column) => column is "personCode" or "displayName" or "job" or "nationality" or "mobile" or "phone" or "isActive";
}

public sealed record PersonsGridRequest(int Page = 1, int PageSize = 100, string Search = "", string Language = "fa",
    Dictionary<string, GridColumnFilterRequest>? Filters = null, List<GridSortRequest>? Sort = null, string? OptionsColumn = null, string? OptionsSearch = null);
