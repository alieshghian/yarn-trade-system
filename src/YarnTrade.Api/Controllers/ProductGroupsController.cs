using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;
using YarnTrade.Api.Security;

namespace YarnTrade.Api.Controllers;

public sealed record ProductGroupCreate(string Name, Guid? ParentId, Guid RequestId);
public sealed record ProductGroupCopyBranch(Guid SourceParentId, Guid TargetParentId, Guid[] SelectedIds, Dictionary<Guid,string> Versions);
public sealed record ProductGroupBatchCreate(ProductGroupCreate[] Items);
public sealed record ProductGroupRename(string Name);
public sealed record ProductGroupDepthInput(int MaxSubgroups, string RowVersion);
public sealed record ProductGroupCopyTarget(Guid TargetParentId, Guid[] SourceChildIds);
public sealed record ProductGroupCopyChildren(Guid SourceParentId, Guid TargetParentId = default, ProductGroupCopyTarget[]? Targets = null, bool PoolSiblingSources = false, bool PoolLevelSources = false);
public sealed record ProductGroupView(Guid Id, Guid? ParentId, string Name, string Code, string HierarchyCode, int Depth, byte[] RowVersion, int? LockedDepth = null, bool IsProtected = false)
{
    public static ProductGroupView From(ProductGroup node) => new(node.Id, node.ParentId, node.Name, node.RootCode, node.HierarchyCode, node.Depth, node.RowVersion, node.LockedDepth);
}

[ApiController, Route("api/master-data/product-groups"), Authorize]
public sealed class ProductGroupsController(AppDbContext db) : ControllerBase
{
    public static string NormalizeName(string value)
    {
        var text = value.Normalize(NormalizationForm.FormKC).Replace('ي', 'ی').Replace('ى', 'ی').Replace('ك', 'ک').Replace('\u200c', ' ');
        text = Regex.Replace(text, "[\u064B-\u065F\u0670ـ]", "");
        text = string.Concat(text.Select(c => c is >= '۰' and <= '۹' ? (char)('0' + c - '۰') : c is >= '٠' and <= '٩' ? (char)('0' + c - '٠') : c));
        return Regex.Replace(text.Trim(), @"\s+", " ").ToLowerInvariant();
    }
    private static string Clean(string value) => Regex.Replace(value.Trim(), @"\s+", " ");
    private static bool Valid(string? name) => name is not null && name.Length <= 120 && NormalizeName(name).Length is > 0 and <= 240 && !name.Any(char.IsControl);

    [HttpGet, RequirePermission("productGroups.view")]
    public async Task<object> List(CancellationToken ct)
    {
        var used = await (from item in db.YarnItems join groupNode in db.ProductGroups on item.ProductGroupId equals (Guid?)groupNode.Id
                          group groupNode by groupNode.RootCode into root
                          select new { Code = root.Key, Depth = root.Max(x => x.Depth) }).ToDictionaryAsync(x => x.Code, x => x.Depth, ct);
        var nodes = await db.ProductGroups.AsNoTracking().Where(x => !x.IsDeleted).OrderBy(x => x.HierarchyCode).ToListAsync(ct);
        var referenced = await db.YarnItems.Where(x => x.ProductGroupId != null).Select(x => x.ProductGroupId!.Value).Distinct().ToListAsync(ct);
        var protectedIds = new HashSet<Guid>();var byId = nodes.ToDictionary(x => x.Id);
        foreach (var id in referenced) {
            var current=id;var seen=new HashSet<Guid>();
            while(seen.Add(current) && byId.TryGetValue(current,out var node)) {
                protectedIds.Add(current);if(node.ParentId is not Guid parent) break;current=parent;
            }
        }
        return new { items = nodes.Select(node => ProductGroupView.From(node) with { IsProtected = protectedIds.Contains(node.Id), LockedDepth = node.ParentId is null && used.TryGetValue(node.RootCode, out var depth) ? depth : null }) };
    }

    [HttpGet("{id:guid}/assignment"), RequirePermission("productGroups.view")]
    public async Task<ActionResult> Assignment(Guid id, CancellationToken ct)
    {
        var resolution = await ProductGroupAssignment.Resolve(db, id, ct);
        return resolution is null ? NotFound() : Ok(new { selectable = resolution.Selectable, terminalDepth = resolution.Depth, requiresConfirmation = !resolution.InUse, message = resolution.Message });
    }

    [HttpGet("policy"), RequirePermission("productGroups.view")]
    public async Task<object> Policy(CancellationToken ct)
    {
        var policy = await db.ProductGroupPolicies.AsNoTracking().SingleOrDefaultAsync(ct);
        return new { maxSubgroups = policy?.MaxSubgroups ?? 4, rowVersion = policy?.RowVersion ?? [] };
    }

    [HttpPut("policy"), Authorize(Roles = "Administrator"), RequirePermission("productGroups.configure")]
    public Task<ActionResult> Configure(ProductGroupDepthInput input, CancellationToken ct) => Mutate(async () => {
        if (input.MaxSubgroups is < 0 or > 4) return BadRequest(new { error = "تعداد زیرگروه‌ها باید بین صفر و چهار باشد." });
        var policy = await db.ProductGroupPolicies.SingleOrDefaultAsync(ct);
        if (policy is null) return Conflict(new { error = "مهاجرت تنظیمات گروه‌ها اجرا نشده است." });
        if (AggregateConcurrency.Apply(db, policy, input.RowVersion) is { } conflict) return conflict;
        // Never hide existing operational records by silently reducing the depth.
        if (await db.ProductGroups.AnyAsync(x => !x.IsDeleted && x.Depth > input.MaxSubgroups, ct)) return Conflict(new { error = "در سطوح پایین‌تر گروه ثبت شده است؛ کاهش سطح مجاز نیست." });
        policy.MaxSubgroups = input.MaxSubgroups;
        await db.SaveChangesAsync(ct);
        return Ok(new { policy.MaxSubgroups, policy.RowVersion });
    }, ct);

    [HttpPost, RequirePermission("productGroups.create")]
    public Task<ActionResult> Create(ProductGroupCreate input, CancellationToken ct) => Mutate(() => CreateCore(input, ct), ct);

    [HttpPost("batch"), RequirePermission("productGroups.create")]
    public Task<ActionResult> CreateBatch(ProductGroupBatchCreate input, CancellationToken ct) => Mutate(async () => {
        if (input.Items is not { Length: > 0 and <= 100 } || input.Items.Select(x => x.ParentId).Distinct().Count() != 1 || input.Items.Any(x => !Valid(x.Name) || x.RequestId == Guid.Empty) || input.Items.Select(x => x.RequestId).Distinct().Count() != input.Items.Length || input.Items.Select(x => NormalizeName(x.Name).Replace(" ", "")).Distinct().Count() != input.Items.Length)
            return BadRequest(new { error = "حداکثر صد نام یکتا زیر یک والد مجاز است." });
        var created = new List<ProductGroupView>();
        foreach (var item in input.Items) {
            var result = await CreateCore(item, ct);
            if (result is not ObjectResult { StatusCode: >= 200 and < 300, Value: ProductGroupView node }) return result;
            created.Add(node);
        }
        return Ok(new { items = created });
    }, ct);

    private async Task<ActionResult> CreateCore(ProductGroupCreate input, CancellationToken ct) {
        if (!Valid(input.Name) || input.RequestId == Guid.Empty) return BadRequest(new { error = "نام گروه و شناسهٔ درخواست معتبر الزامی است." });
        var name = Clean(input.Name); var normalized = NormalizeName(name);
        var prior = await db.ProductGroups.SingleOrDefaultAsync(x => x.RequestId == input.RequestId, ct);
        if (prior is not null)
        {
            if (prior.ParentId != input.ParentId || prior.NormalizedName != normalized) return Conflict(new { code = "REQUEST_REUSED", error = "شناسه درخواست برای اطلاعات دیگری استفاده شده است." });
            return prior.IsDeleted ? StatusCode(410, new { error = "گروه این درخواست قبلاً حذف شده است." }) : Ok(ProductGroupView.From(prior));
        }
        var parent = input.ParentId is Guid id ? await db.ProductGroups.SingleOrDefaultAsync(x => x.Id == id && !x.IsDeleted, ct) : null;
        if (input.ParentId is not null && parent is null) return BadRequest(new { error = "گروه بالادستی موجود نیست." });
        if (parent is not null && await HasMovements(parent, ct)) return ProtectedResult();
        var depth = parent is null ? 0 : parent.Depth + 1;
        if (parent is not null && await ProductGroupAssignment.LockedDepth(db, parent.RootCode, ct) is int lockedDepth && depth > lockedDepth)
            return Conflict(new { code = "GROUP_DEPTH_LOCKED", error = "آخرین سطح این گروه به دلیل استفادهٔ فعلی در کالا قفل است؛ افزودن سطح عمیق‌تر مجاز نیست." });
        var maximum = await db.ProductGroupPolicies.Select(x => (int?)x.MaxSubgroups).SingleOrDefaultAsync(ct) ?? 4;
        if (depth > maximum) return BadRequest(new { error = "حداکثر سطح مجاز تکمیل شده است." });
        if (await Duplicate(input.ParentId, normalized, null, ct)) return DuplicateResult();
        var scope = input.ParentId ?? Guid.Empty;
        var counter = await db.ProductGroupCounters.SingleOrDefaultAsync(x => x.Id == scope, ct);
        if (counter is null) { counter = new() { Id = scope }; db.ProductGroupCounters.Add(counter); }
        var ordinal = checked(++counter.LastValue).ToString("D3", CultureInfo.InvariantCulture);
        var node = new ProductGroup { ParentId = input.ParentId, Name = name, NormalizedName = normalized, RootCode = parent?.RootCode ?? ordinal, HierarchyCode = parent is null ? ordinal : parent.HierarchyCode + "." + ordinal, Depth = depth, RequestId = input.RequestId };
        db.ProductGroups.Add(node); await db.SaveChangesAsync(ct);
        return StatusCode(201, ProductGroupView.From(node));
    }
    [HttpPut("{id:guid}"), RequirePermission("productGroups.edit")]
    public Task<ActionResult> Rename(Guid id, ProductGroupRename input, [FromQuery] string? rowVersion, CancellationToken ct) => Mutate(async () => {
        var node = await db.ProductGroups.SingleOrDefaultAsync(x => x.Id == id && !x.IsDeleted, ct);
        if (node is null) return NotFound();
        if (await HasMovements(node, ct)) return ProtectedResult();
        if (await HasReferences(node, ct)) return Conflict(new { code = "GROUP_REFERENCED", error = "این گروه یا زیرگروه آن در کالا استفاده شده است؛ تغییر نام یا حذف مجاز نیست." });
        if (AggregateConcurrency.Apply(db, node, rowVersion) is { } conflict) return conflict;
        if (!Valid(input.Name)) return BadRequest(new { error = "نام گروه معتبر الزامی است." });
        var normalized = NormalizeName(input.Name);
        if (await Duplicate(node.ParentId, normalized, id, ct)) return DuplicateResult();
        node.Name = Clean(input.Name); node.NormalizedName = normalized;
        await db.SaveChangesAsync(ct);
        return Ok(ProductGroupView.From(node) with { LockedDepth = node.ParentId is null ? await ProductGroupAssignment.LockedDepth(db, node.RootCode, ct) : null });
    }, ct);

    [HttpDelete("{id:guid}"), RequirePermission("productGroups.delete")]
    public Task<ActionResult> Delete(Guid id, [FromQuery] string? rowVersion, CancellationToken ct) => Mutate(()=>DeleteCore(id,rowVersion,ct),ct);

    [HttpPost("bulk-delete"), RequirePermission("productGroups.delete")]
    public Task<IActionResult> DeleteMany(DefinitionBulkDeleteInput input,CancellationToken ct) =>
        DefinitionBulkDelete.Run(db,input,async(row,token)=>await DeleteCore(row.Id,row.RowVersion,token),ct);

    private async Task<ActionResult> DeleteCore(Guid id,string? rowVersion,CancellationToken ct) {
        var node = await db.ProductGroups.SingleOrDefaultAsync(x => x.Id == id && !x.IsDeleted, ct);
        if (node is null) return NotFound();
        if (await HasMovements(node, ct)) return ProtectedResult();
        if (await db.YarnItems.AnyAsync(x => x.ProductGroupId == id, ct)) return Conflict(new { code = "GROUP_REFERENCED", error = "این گروه به کالا متصل است و قابل حذف نیست." });
        if (AggregateConcurrency.Apply(db, node, rowVersion) is { } conflict) return conflict;
        if (await db.ProductGroups.AnyAsync(x => x.ParentId == id && !x.IsDeleted, ct)) return Conflict(new { code = "GROUP_HAS_CHILDREN", error = "گروه دارای زیرگروه قابل حذف نیست." });
        node.IsDeleted = true; await db.SaveChangesAsync(ct); return NoContent();
    }
    [HttpPost("copy-children"), RequirePermission("productGroups.create"), RequirePermission("productGroups.view")]
    public Task<ActionResult> CopyChildren(ProductGroupCopyChildren input, CancellationToken ct) => Mutate(async () => {
        var source = await db.ProductGroups.SingleOrDefaultAsync(x => x.Id == input.SourceParentId && !x.IsDeleted, ct);
        if (source is null) return BadRequest(new { error = "گروه مبدأ معتبر نیست." });
        var sourceParents = db.ProductGroups.Where(x => !x.IsDeleted && x.ParentId == source.ParentId && x.Id != source.Id).Select(x => x.Id);
        var children = await db.ProductGroups.AsNoTracking().Where(x => !x.IsDeleted && (input.PoolLevelSources ? x.RootCode == source.RootCode && x.Depth == source.Depth + 1 && x.ParentId != source.Id : input.PoolSiblingSources ? x.ParentId.HasValue && sourceParents.Contains(x.ParentId.Value) : x.ParentId == source.Id)).OrderBy(x => x.HierarchyCode).ToListAsync(ct);
        if ((input.PoolSiblingSources || input.PoolLevelSources) && (input.Targets is not { Length: 1 } || input.Targets[0].TargetParentId != source.Id)) return BadRequest(new { error = "مقصد کپی باید گروه جاری باشد." });
        var requests = input.Targets ?? [new ProductGroupCopyTarget(input.TargetParentId, children.Select(x => x.Id).ToArray())];
        if (requests.Length == 0 || requests.Length > 100 || requests.Select(x=>x.TargetParentId).Distinct().Count()!=requests.Length || requests.Any(x=>x.SourceChildIds is null || x.SourceChildIds.Length==0 || x.SourceChildIds.Any(id=>!children.Any(child=>child.Id==id)))) return BadRequest(new { error = "مقصدها و موارد انتخابی معتبر لازم است." });
        var maximum = await db.ProductGroupPolicies.Select(x => (int?)x.MaxSubgroups).SingleOrDefaultAsync(ct) ?? 4;
        var plans = new List<(ProductGroup Target, List<ProductGroup> Existing, List<ProductGroup> Missing)>();
        // Validate every destination before allocating or writing anything.
        foreach (var request in requests) {
            var target = await db.ProductGroups.SingleOrDefaultAsync(x => x.Id == request.TargetParentId && !x.IsDeleted, ct);
            if (target is null || (!input.PoolSiblingSources && !input.PoolLevelSources && target.Id == source.Id) || source.Depth != target.Depth) return BadRequest(new { error = "مبدأ و مقصد باید متفاوت، معتبر و هم‌سطح باشند." });
            if (await ProductGroupAssignment.LockedDepth(db, target.RootCode, ct) is int lockedDepth && target.Depth + 1 > lockedDepth)
                return Conflict(new { code = "GROUP_DEPTH_LOCKED", error = "آخرین سطح این گروه قفل شده است؛ کپی در سطح عمیق‌تر مجاز نیست." });
            if (target.Depth >= maximum) return BadRequest(new { error = "حداکثر سطح مجاز تکمیل شده است." });
            if (await HasMovements(target, ct)) return ProtectedResult();
            var existing = await db.ProductGroups.Where(x => x.ParentId == target.Id && !x.IsDeleted).ToListAsync(ct);
            var names = existing.Select(x => NormalizeName(x.Name).Replace(" ", "")).ToHashSet();
            var missing = children.Where(x => request.SourceChildIds.Contains(x.Id) && names.Add(NormalizeName(x.Name).Replace(" ", ""))).ToList();
            plans.Add((target, existing, missing));
        }
        foreach (var (target, existing, missing) in plans) {
            if (missing.Count == 0) continue;
            var counter = await db.ProductGroupCounters.SingleOrDefaultAsync(x => x.Id == target.Id, ct);
            if (counter is null) { counter = new() { Id = target.Id }; db.ProductGroupCounters.Add(counter); }
            foreach (var child in missing) {
                var ordinal = checked(++counter.LastValue).ToString("D3", CultureInfo.InvariantCulture);
                var node = new ProductGroup { ParentId = target.Id, Name = child.Name, NormalizedName = NormalizeName(child.Name), RootCode = target.RootCode, HierarchyCode = target.HierarchyCode + "." + ordinal, Depth = target.Depth + 1, RequestId = Guid.NewGuid() };
                db.ProductGroups.Add(node); existing.Add(node);
            }
        }
        await db.SaveChangesAsync(ct);
        return Ok(new { items = plans.SelectMany(x=>x.Existing).Select(ProductGroupView.From), created = plans.Sum(x=>x.Missing.Count) });
    }, ct);

    [HttpPost("copy-branch"), RequirePermission("productGroups.create"), RequirePermission("productGroups.view")]
    public Task<ActionResult> CopyBranch(ProductGroupCopyBranch input, CancellationToken ct) => Mutate(async () => {
        if (input.SelectedIds is null || input.Versions is null || input.SelectedIds.Length is 0 or > 5000 || input.SelectedIds.Distinct().Count() != input.SelectedIds.Length)
            return BadRequest(new { error = "زیرشاخه‌های معتبر را انتخاب کنید." });
        var all = await db.ProductGroups.Where(x => !x.IsDeleted).ToListAsync(ct);
        var byId = all.ToDictionary(x => x.Id);
        if (!byId.TryGetValue(input.SourceParentId, out var source) || !byId.TryGetValue(input.TargetParentId, out var target) || source.Id == target.Id || source.Depth != target.Depth)
            return BadRequest(new { error = "مبدأ و مقصد باید متفاوت و هم‌سطح باشند." });
        var selected = input.SelectedIds.ToHashSet();
        foreach (var id in selected.Append(source.Id).Append(target.Id)) {
            if (!byId.TryGetValue(id, out var node) || !input.Versions.TryGetValue(id, out var version) || version != Convert.ToBase64String(node.RowVersion))
                return Conflict(new { code = "COPY_PREVIEW_STALE", error = "اطلاعات شاخه تغییر کرده است؛ تازه‌سازی و انتخاب مجدد لازم است." });
            if (selected.Contains(id) && (!node.HierarchyCode.StartsWith(source.HierarchyCode + ".", StringComparison.Ordinal) || node.ParentId != source.Id && (!node.ParentId.HasValue || !selected.Contains(node.ParentId.Value))))
                return BadRequest(new { error = "هر زیرشاخه باید همراه والد انتخاب شود." });
        }
        var maximum = await db.ProductGroupPolicies.Select(x => (int?)x.MaxSubgroups).SingleOrDefaultAsync(ct) ?? 4;
        var locked = await ProductGroupAssignment.LockedDepth(db, target.RootCode, ct);
        if (selected.Any(id => byId[id].Depth > maximum || byId[id].Depth > (locked ?? 4)))
            return Conflict(new { code = "GROUP_DEPTH_LOCKED", error = "عمق انتخاب‌شده برای مقصد مجاز نیست." });
        if (await HasMovements(target, ct)) return ProtectedResult();
        var mapped = new Dictionary<Guid,ProductGroup> { [source.Id] = target };
        var created = 0;
        foreach (var child in selected.Select(id => byId[id]).OrderBy(x => x.Depth).ThenBy(x => x.HierarchyCode, StringComparer.Ordinal)) {
            var parent = mapped[child.ParentId!.Value];
            var key = NormalizeName(child.Name).Replace(" ", "");
            var matches = all.Where(x => x.ParentId == parent.Id && NormalizeName(x.Name).Replace(" ", "") == key).ToArray();
            if (matches.Length > 1) return Conflict(new { error = "نام‌های مبهم در مقصد؛ ثبت انجام نشد." });
            ProductGroup copy;
            if (matches.Length == 1) copy = matches[0];
            else {
                var counter = await db.ProductGroupCounters.FindAsync([parent.Id], ct);
                if (counter is null) { counter = new() { Id = parent.Id }; db.ProductGroupCounters.Add(counter); }
                var ordinal = checked(++counter.LastValue).ToString("D3", CultureInfo.InvariantCulture);
                copy = new() { ParentId = parent.Id, Name = child.Name, NormalizedName = NormalizeName(child.Name), RootCode = target.RootCode, HierarchyCode = parent.HierarchyCode + "." + ordinal, Depth = parent.Depth + 1, RequestId = Guid.NewGuid() };
                db.ProductGroups.Add(copy); all.Add(copy); created++;
            }
            mapped.Add(child.Id, copy);
        }
        await db.SaveChangesAsync(ct);
        return Ok(new { items = mapped.Where(x => x.Key != source.Id).Select(x => ProductGroupView.From(x.Value)), processedSourceIds = mapped.Keys.Where(id => id != source.Id), created, existing = selected.Count - created });
    }, ct);

    private Task<bool> Duplicate(Guid? parent, string name, Guid? except, CancellationToken ct) => db.ProductGroups.AnyAsync(x => !x.IsDeleted && x.ParentId == parent && x.NormalizedName.Replace(" ", "") == name.Replace(" ", "") && x.Id != except, ct);
    private Task<bool> HasReferences(ProductGroup node, CancellationToken ct) {
        var subtree=db.ProductGroups.Where(g=>g.Id==node.Id || g.HierarchyCode.StartsWith(node.HierarchyCode+".")).Select(g=>g.Id);
        return db.YarnItems.AnyAsync(x=>x.ProductGroupId.HasValue && subtree.Contains(x.ProductGroupId.Value),ct);
    }
    private Task<bool> HasMovements(ProductGroup node, CancellationToken ct)
    {
        // InventoryMovements are posted ledger records (drafts have no movements).
        // Include history even after reversal: recorded inventory must remain attributable.
        var subtree = db.ProductGroups.Where(g => g.Id == node.Id || g.HierarchyCode.StartsWith(node.HierarchyCode + ".")).Select(g => g.Id);
        return (from yarn in db.YarnItems
                join movement in db.InventoryMovements on yarn.Id equals movement.YarnItemId
                where yarn.ProductGroupId.HasValue && subtree.Contains(yarn.ProductGroupId.Value)
                select movement.Id).AnyAsync(ct);
    }
    private static ConflictObjectResult ProtectedResult() => new(new { code = "GROUP_HAS_INVENTORY_HISTORY", error = "این گروه یا زیرگروه آن گردش ثبت‌شدهٔ انبار دارد؛ تغییر ساختار، نام یا حذف مجاز نیست." });
    private static ConflictObjectResult DuplicateResult() => new(new { code = "DUPLICATE_GROUP_NAME", error = "این نام زیر همین گروه قبلاً ثبت شده است." });
    // One transaction lock covers creation, deletion, rename and depth changes, including retries.
    // Unique indexes also protect against concurrent writes outside this API.
    private Task<ActionResult> Mutate(Func<Task<ActionResult>> operation, CancellationToken ct)
    {
        var attempt = 0;
        return db.Database.CreateExecutionStrategy().ExecuteAsync(async () => {
            if (attempt++ > 0) db.ChangeTracker.Clear();
            await using var transaction = db.Database.IsSqlServer() ? await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct) : null;
            try {
                if (transaction is not null) await db.Database.ExecuteSqlRawAsync("DECLARE @result int; EXEC @result = sys.sp_getapplock @Resource=N'yarn-trade.product-groups.write.v1', @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=10000; IF @result < 0 THROW 51000, 'Product group write lock unavailable', 1;", ct);
                var result = await operation();
                if (transaction is not null && result is ObjectResult { StatusCode: >= 200 and < 300 } or NoContentResult) await transaction.CommitAsync(ct);
                return result;
            }
            catch (DbUpdateConcurrencyException) { return AggregateConcurrency.Conflict(); }
            catch (DbUpdateException e) when (e.InnerException is Microsoft.Data.SqlClient.SqlException { Number: 2601 or 2627 }) { return DuplicateResult(); }
            catch (Microsoft.Data.SqlClient.SqlException e) when (e.Number == 51000) { return StatusCode(503, new { error = "ثبت همزمان در حال انجام است؛ دوباره تلاش کنید." }); }
        });
    }
}
