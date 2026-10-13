using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Globalization;
using System.Collections.Concurrent;
using System.Text;
using YarnTrade.Api.Security;

namespace YarnTrade.Api.Controllers;

[ApiController, Route("api/form-laboratory"), Authorize]
public sealed class FormLaboratoryGridController : ControllerBase
{
    private static readonly string[] Names = ["آرمان رضایی", "سارا کریمی", "شرکت نخ آریا", "مهدی احمدی", "لیلا محمدی", "بازرگانی سپهر"];
    private static readonly string[] Jobs = ["مشتری", "فروشنده", "تأمین‌کننده", "شریک"];
    private static readonly ConcurrentDictionary<int, Lazy<SyntheticGridPerson[]>> Datasets = new();
    private static readonly ConcurrentDictionary<int, Lazy<string[][]>> SearchIndexes = new();

    [HttpPost("synthetic-grid"), RequirePermission("formLaboratory.view")]
    public ActionResult<ServerGridPage<SyntheticGridPerson>> Query([FromBody] SyntheticGridRequest request, CancellationToken cancellationToken = default)
    {
        var count = Math.Clamp(request.DatasetSize, 1, 100_000);
        var page = Math.Max(1, request.Page);
        var pageSize = Math.Clamp(request.PageSize, 1, 500);
        var dataset = Datasets.GetOrAdd(count, size => new Lazy<SyntheticGridPerson[]>(() => Enumerable.Range(1, size).Select(number => new SyntheticGridPerson(
            $"synthetic-person-{number}", $"LAB-{number:000000}", Names[(number - 1) % Names.Length], Jobs[(number - 1) % Jobs.Length],
            number % 5 == 1 ? "چینی" : "ایرانی", $"0912{(1_000_000 + number - 1) % 10_000_000:0000000}",
            $"021{(1_000_000 + number - 1) % 10_000_000:0000000}", $"نشانی مصنوعی شماره {number}",
            number % 3 == 1 ? "نمونهٔ خطای نمایشی ندارد." : "رکورد مصنوعی آزمایشگاه", number % 9 != 1)).ToArray(), LazyThreadSafetyMode.ExecutionAndPublication)).Value;
        var searchIndex = SearchIndexes.GetOrAdd(count, _ => new Lazy<string[][]>(() => dataset.Select(SearchableValues).ToArray(), LazyThreadSafetyMode.ExecutionAndPublication)).Value;
        var normalizedSearch = NormalizeSearchText(request.Search ?? "");
        var filters = request.Filters ?? [];
        IEnumerable<SyntheticGridPerson> rows = SearchRows(dataset, searchIndex, normalizedSearch, request.SearchMode, request.ReverseSearch, cancellationToken);

        if (!string.IsNullOrWhiteSpace(request.OptionsColumn))
        {
            var optionRows = ApplyFilters(rows, filters.Where(pair => pair.Key != request.OptionsColumn));
            var needle = request.OptionsSearch?.Trim();
            var orderedValues = new SortedSet<string?>(Comparer<string?>.Create(StringComparer.CurrentCulture.Compare));
            var totalRows = 0;
            foreach (var row in optionRows)
            {
                if ((totalRows & 1023) == 0) cancellationToken.ThrowIfCancellationRequested();
                totalRows++;
                var value = Value(row, request.OptionsColumn!);
                if (needle is not null && value?.Contains(needle, StringComparison.CurrentCultureIgnoreCase) != true) continue;
                orderedValues.Add(value);
                if (orderedValues.Count > 500) orderedValues.Remove(orderedValues.Max);
            }
            return Ok(new ServerGridPage<SyntheticGridPerson>([], totalRows, page, pageSize, orderedValues.Cast<object?>().ToArray()));
        }

        rows = ApplyFilters(rows, filters);
        if (request.Sort is { Count: > 0 })
        {
            IOrderedEnumerable<SyntheticGridPerson>? ordered = null;
            foreach (var criterion in request.Sort)
            {
                if (!Columns.Contains(criterion.Id)) continue;
                Func<SyntheticGridPerson, string?> key = row => Value(row, criterion.Id);
                ordered = ordered is null
                    ? criterion.Direction == "desc" ? rows.OrderByDescending(key, StringComparer.CurrentCulture) : rows.OrderBy(key, StringComparer.CurrentCulture)
                    : criterion.Direction == "desc" ? ordered.ThenByDescending(key, StringComparer.CurrentCulture) : ordered.ThenBy(key, StringComparer.CurrentCulture);
            }
            if (ordered is not null) rows = ordered;
        }
        var offset = (page - 1) * pageSize;
        var pageItems = new List<SyntheticGridPerson>(pageSize);
        var total = 0;
        foreach (var row in rows)
        {
            if ((total & 1023) == 0) cancellationToken.ThrowIfCancellationRequested();
            if (total >= offset && pageItems.Count < pageSize) pageItems.Add(row);
            total++;
        }
        return Ok(new ServerGridPage<SyntheticGridPerson>(pageItems, total, page, pageSize));
    }

    private static readonly string[] Columns = ["personCode", "displayName", "job", "nationality", "mobile", "address"];
    private static IEnumerable<SyntheticGridPerson> ApplyFilters(IEnumerable<SyntheticGridPerson> rows, IEnumerable<KeyValuePair<string, GridColumnFilterRequest>> filters) => rows.Where(row => filters.All(pair => Matches(Value(row, pair.Key), pair.Value)));
    private static bool Matches(string? value, GridColumnFilterRequest filter)
    {
        var key = string.IsNullOrEmpty(value) ? "\0blank" : $"string:{value}";
        if (filter.SelectedValues is { } selected)
        {
            var contains = selected.Contains(key, StringComparer.Ordinal);
            if (filter.SelectionMode == "exclude" ? contains : !contains) return false;
        }
        if (filter.Custom is { First.Value.Length: > 0 } custom)
        {
            var first = MatchesCondition(value ?? "", custom.First);
            var second = custom.Second is { Value.Length: > 0 } condition && MatchesCondition(value ?? "", condition);
            if (custom.Second is { Value.Length: > 0 } && (custom.Logic == "or" ? !first && !second : !first || !second)) return false;
            if (custom.Second is not { Value.Length: > 0 } && !first) return false;
        }
        return true;
    }
    private static bool MatchesCondition(string value, GridConditionRequest condition)
    {
        var a = value.Trim(); var b = condition.Value.Trim();
        return condition.Operator switch
        {
            "equals" => string.Equals(a, b, StringComparison.CurrentCultureIgnoreCase),
            "notEquals" => !string.Equals(a, b, StringComparison.CurrentCultureIgnoreCase),
            "contains" => a.Contains(b, StringComparison.CurrentCultureIgnoreCase),
            "notContains" => !a.Contains(b, StringComparison.CurrentCultureIgnoreCase),
            "beginsWith" => a.StartsWith(b, StringComparison.CurrentCultureIgnoreCase),
            "endsWith" => a.EndsWith(b, StringComparison.CurrentCultureIgnoreCase),
            _ => true
        };
    }
    private static string? Value(SyntheticGridPerson row, string column) => column switch
    {
        "personCode" => row.PersonCode, "displayName" => row.DisplayName, "job" => row.Job,
        "nationality" => row.Nationality, "mobile" => row.Mobile, "address" => row.Address, _ => null
    };
    private static string[] SearchableValues(SyntheticGridPerson row) => new[] { row.PersonCode, row.DisplayName, row.Job, row.Nationality, row.Mobile, row.Address }.Select(NormalizeSearchText).ToArray();
    private static IEnumerable<SyntheticGridPerson> SearchRows(SyntheticGridPerson[] rows, string[][] index, string query, string? mode, bool reverse, CancellationToken cancellationToken)
    {
        var terms = query.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var hasQuery = terms.Length > 0;
        var searchMode = mode is "contains" or "exact" ? mode : "startsWith";
        for (var i = 0; i < rows.Length; i++)
        {
            if ((i & 1023) == 0) cancellationToken.ThrowIfCancellationRequested();
            var matches = !hasQuery || SearchMatches(index[i], query, terms, searchMode);
            if (reverse && hasQuery) matches = !matches;
            if (matches) yield return rows[i];
        }
    }
    private static bool SearchMatches(string[] fields, string query, string[] terms, string mode)
    {
        if (mode == "exact") return fields.Any(field => string.Equals(field, query, StringComparison.Ordinal));
        return terms.All(term => fields.Any(field => mode == "contains"
            ? field.Contains(term, StringComparison.Ordinal)
            : StartsWithWord(field, term)));
    }
    private static bool StartsWithWord(string value, string term)
    {
        var offset = 0;
        while (offset <= value.Length - term.Length)
        {
            var found = value.IndexOf(term, offset, StringComparison.Ordinal);
            if (found < 0) return false;
            if (found == 0 || !char.IsLetterOrDigit(value, found - 1)) return true;
            offset = found + 1;
        }
        return false;
    }
    private static string NormalizeSearchText(string value)
    {
        var text = new StringBuilder(value.Length);
        foreach (var original in value.Normalize(NormalizationForm.FormKC))
        {
            var character = original switch
            {
                '\u064A' or '\u0649' => 'ی',
                '\u0643' => 'ک',
                '\u0622' or '\u0623' or '\u0625' or '\u0671' => 'ا',
                '\u200C' or '\u200D' => ' ',
                '\u0640' => '\0',
                _ => original
            };
            if (character is >= '\u06F0' and <= '\u06F9') character = (char)('0' + character - '\u06F0');
            else if (character is >= '\u0660' and <= '\u0669') character = (char)('0' + character - '\u0660');
            if (character == '\0' || character is '\u200E' or '\u200F' or '\u061C') continue;
            if (char.GetUnicodeCategory(character) == UnicodeCategory.Format) continue;
            text.Append(char.ToUpperInvariant(character));
        }
        return string.Join(' ', text.ToString().Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
    }
}

public sealed record SyntheticGridRequest(int DatasetSize = 100, int Page = 1, int PageSize = 100, string Search = "", string? SearchMode = "startsWith", bool ReverseSearch = false,
    Dictionary<string, GridColumnFilterRequest>? Filters = null, List<GridSortRequest>? Sort = null, string? OptionsColumn = null, string? OptionsSearch = null);
public sealed record GridColumnFilterRequest(string[]? SelectedValues = null, string? SelectionMode = null, GridCustomFilterRequest? Custom = null, string[]? Colors = null);
public sealed record GridCustomFilterRequest(string Logic, GridConditionRequest First, GridConditionRequest? Second = null);
public sealed record GridConditionRequest(string Operator, string Value, string? SecondValue = null);
public sealed record GridSortRequest(string Id, string Direction, bool ByColor = false);
public sealed record SyntheticGridPerson(string Id, string PersonCode, string DisplayName, string Job, string Nationality, string Mobile, string Phone, string Address, string Notes, bool IsActive);
public sealed record ServerGridPage<T>(IReadOnlyList<T> Items, int Total, int Page, int PageSize, IReadOnlyList<object?>? FilterValues = null, IReadOnlyList<string?>? ColorValues = null);
