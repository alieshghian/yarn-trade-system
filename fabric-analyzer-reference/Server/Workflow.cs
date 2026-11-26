using Microsoft.EntityFrameworkCore;

namespace FabricAnalyzer;

public sealed class Workflow(Store db)
{
    public async Task<Analysis> Get(int id) => await db.Versions().SingleOrDefaultAsync(a => a.Id == id)
        ?? throw new InvalidData("آنالیز پیدا نشد.");

    private async Task<Theory> StoredPreview(AnalysisInput input) =>
        Calc.Calculate(input, await db.TexFor(input), input.Beams is null ? input.SampleM : 1, input.FabricCm, input.StartPick);

    public async Task<Theory> Preview(AnalysisInput input) =>
        await StoredPreview(TextileRules.Normalize(input, await CurrentSettings()));

    public async Task<SettingsSnapshot> CurrentSettings()
    {
        var settings = await db.Settings.AsNoTracking().SingleAsync(s => s.Id == 1);
        var revision = await db.SettingRevisions.AsNoTracking().OrderByDescending(s => s.Id).FirstOrDefaultAsync();
        return new(settings.MaxWeftCycleSlots, settings.Tolerance, revision?.Id, revision?.At);
    }

    public async Task<object> Save(int? id, AnalysisInput input, string user) => await db.Write<object>(async () => {
        input = TextileRules.Normalize(input, await CurrentSettings());
        var theory = await StoredPreview(input);
        input = input with { Code = input.Code.Trim(), Description = input.Description.Trim() };
        Analysis row;
        if (id.HasValue)
        {
            row = await Get(id.Value);
            row.Match(input.RowVersion);
            Calc.Require(row.Status == AnalysisStatus.Draft && row.Version == input.Version &&
                row.Fabric.Code == input.Code && Calc.Text(input.Reason, 1000),
                "ویرایش فقط در پیش‌نویس، با همان کد و نسخه و ثبت علت اصلاح مجاز است.");
            var before = row.Input();
            Calc.Require(before.Beams?.Length != 2 || input.Beams!.Length == 2,
                "برای تبدیل دو چله به یک چله نسخه جدید ایجاد کنید. نسخه قبلی حفظ می‌شود.");
            await Audit(row, "Edit", user, input.Reason, Payload.Write(before));
        }
        else
        {
            var fabric = await db.Fabrics.SingleOrDefaultAsync(f => f.Code == input.Code);
            if (fabric is not null)
            {
                var latest = await db.FabricAnalysisVersions.Where(a => a.FabricId == fabric.Id).MaxAsync(a => a.Version);
                Calc.Require(input.Version > latest, $"شماره نسخه جدید باید از {latest} بزرگ‌تر باشد.");
                input = input with { Code = fabric.Code };
            }
            row = new Analysis { Fabric = fabric ?? new Fabric { Code = input.Code }, Version = input.Version };
            db.Add(row);
        }
        row.SetInput(input);
        row.Touch(user);
        await db.SaveChangesAsync();
        if (!id.HasValue) await Audit(row, "Create", user);
        return new { row.Id, row.Status, row.RowVersion, theory };
    });

    public async Task<object> Ready(int id, VersionCommand command, string user) => await db.Write<object>(async () => {
        var row = await Get(id);
        row.Match(command.RowVersion);
        var input = row.Input();
        if (input.Beams is not null) TextileRules.ValidateCapacity(input, (await CurrentSettings()).MaxWeftCycleSlots);
        var theory = await StoredPreview(input);
        Calc.Require(row.Status == AnalysisStatus.Draft, "تنها پیش‌نویس می‌تواند آماده آزمایش شود.");
        row.Status = AnalysisStatus.Ready;
        row.Touch(user);
        await Audit(row, "Ready", user);
        await db.SaveChangesAsync();
        return new { row.Id, row.Status, row.RowVersion, theory };
    });

    private async Task Audit(Analysis row, string action, string user, string? reason = null, string? data = null)
    {
        db.ApprovalHistory.Add(new History {
            AnalysisId = row.Id, Action = action, User = user, At = DateTimeOffset.UtcNow, Reason = reason?.Trim(), Data = data
        });
        await Task.CompletedTask;
    }

    public async Task<object> SaveTrial(int id, TrialInput input, string user, bool preparation) =>
        await db.Write<object>(async () => {
            var row = await Get(id);
            row.Match(input.RowVersion);
            Calc.Require(row.Status is AnalysisStatus.Ready or AnalysisStatus.Review,
                "وزن‌کشی و آزمایش فقط برای نسخه آماده آزمایش یا نیازمند بررسی مجاز است.");
            Calc.Require(Calc.Text(input.Number, 80) && input.Date != default && Calc.Text(input.Machine) &&
                Calc.Text(input.Operator), "شماره آزمایش، تاریخ، دستگاه و اپراتور الزامی‌اند.");
            input = input with { Number = input.Number.Trim() };
            Calc.Require(input.Weighings is { Length: > 0 } && input.Weighings.All(w => w is not null), "ردیف‌های توزین معتبر نیستند.");
            var a = row.Input();
            var tex = await db.TexFor(a);
            var trials = await db.Tests(id).ToListAsync();
            var same = trials.Where(t => string.Equals(t.Number, input.Number, StringComparison.OrdinalIgnoreCase)).ToArray();
            var current = Effective(same).SingleOrDefault();
            var previous = input.ReplacesId.HasValue ? current : null;
            var prep = same.SingleOrDefault(t => t.Id == input.PreparationId && t.Preparation);
            if (preparation)
            {
                Calc.Require(same.Length == 0 && input.ReplacesId is null && input.PreparationId is null,
                    "این شماره آزمایش قبلاً ثبت شده است.");
                Calc.Require(input.Weighings is { Length: > 0 } && input.Weighings.All(w => w.RemainingG is null),
                    "برای مرحله آماده‌سازی، فقط وزن اولیه را وارد کنید.");
                Calc.ValidateWeighings(Calc.Calculate(a, tex, a.SampleM, a.FabricCm, input.StartPick), input.Weighings);
            }
            else if (input.ReplacesId.HasValue)
            {
                Calc.Require(previous?.Id == input.ReplacesId && Calc.Text(input.Reason, 1000),
                    "فقط آخرین ثبت آزمایش با علت مستند قابل اصلاح است.");
                input = input with { PreparationId = previous!.PreparationId };
            }
            else if (input.PreparationId.HasValue)
            {
                Calc.Require(prep is not null && current is null, "وزن‌کشی اولیه پیدا نشد یا آزمایش قبلاً نهایی شده است.");
                Calc.Require(InitialMatches(prep!.Input().Weighings, input.Weighings) || Calc.Text(input.Reason, 1000),
                    "بسته‌ها و وزن‌های اولیه باید با مرحله آماده‌سازی یکسان باشند. اصلاح را با علت مستند ثبت کنید.");
            }
            else Calc.Require(same.Length == 0, "این شماره آزمایش قبلاً ثبت شده است.");

            if (a.Beams is not null)
            {
                var keys = input.Weighings.Select(w => w.Package?.Trim().ToUpperInvariant()).ToArray();
                Calc.Require(keys.Distinct().Count() == keys.Length, "شناسه بسته تکراری است.");
                var usedElsewhere = await db.Set<Weighing>()
                    .Join(db.ProductionTests, w => w.TrialId, t => t.Id, (w, t) => new { w.Package, t.AnalysisId, t.Number })
                    .AnyAsync(x => (x.AnalysisId != id || x.Number != input.Number) && keys.Contains(x.Package.ToUpper()));
                Calc.Require(!usedElsewhere, "شناسه بسته به آزمایش دیگری تخصیص یافته است.");
                if (!preparation) TextileRules.ValidateNewTrial(a, input);
            }
            TrialResult? result = null;
            if (!preparation)
            {
                var theory = Calc.Calculate(a, tex, input.LengthM, input.WidthCm, input.StartPick);
                var settings = await CurrentSettings();
                var tolerance = settings.Tolerance;
                result = Calc.ValidateTrial(theory, input, tolerance) with { ValidationSettings = settings };
                row.Status = Calc.NeedsReview(result) ||
                    Effective(trials).Where(t => t.Id != input.ReplacesId).Any(t => Calc.NeedsReview(Recheck(a, tex, t, tolerance)))
                    ? AnalysisStatus.Review : AnalysisStatus.Ready;
            }
            var trial = new Trial {
                AnalysisId = id, Number = input.Number, Preparation = preparation, PreparationId = input.PreparationId,
                ReplacesId = input.ReplacesId, User = user, At = DateTimeOffset.UtcNow,
                Data = Payload.Write(input with { Weighings = [], RowVersion = null }),
                Weighings = input.Weighings.Select(Weighing.From).ToList(),
                Validation = result is null ? null : new SavedValidation { Data = Payload.Write(result) }
            };
            db.Add(trial);
            row.Touch(user);
            await db.SaveChangesAsync();
            await Audit(row, preparation ? "Prepare" : previous is null ? "Trial" : "CorrectTrial", user, input.Reason, Payload.Write(trial.Id));
            return new { trial.Id, row.Status, row.RowVersion, result };
        });

    private static bool InitialMatches(WeighInput[] baseline, WeighInput[] candidate) => candidate is not null &&
        baseline.Length == candidate.Length &&
        baseline.All(a => candidate.Any(b => a.Axis == b.Axis && a.YarnId == b.YarnId && a.Beam == b.Beam &&
            a.Package == b.Package?.Trim() && a.InitialG == b.InitialG && a.Gross == b.Gross && a.InitialTareG == b.InitialTareG));

    private static TrialResult Recheck(AnalysisInput a, IReadOnlyDictionary<int, decimal> tex, Trial trial, decimal tolerance)
    {
        var input = trial.Input();
        return Calc.ValidateTrial(Calc.Calculate(a, tex, input.LengthM, input.WidthCm, input.StartPick), input, tolerance);
    }
    public static TrialResult Read(Trial trial) => Payload.Read<TrialResult>(trial.Validation!.Data);
    public static IEnumerable<Trial> Effective(IEnumerable<Trial> trials)
    {
        var rows = trials.ToArray();
        var replaced = rows.Select(t => t.ReplacesId).ToHashSet();
        return rows.Where(t => !t.Preparation && !replaced.Contains(t.Id));
    }

    public async Task<object> Approve(int id, VersionCommand command, string user) => await db.Write<object>(async () => {
        var row = await Get(id);
        row.Match(command.RowVersion);
        Calc.Require(row.Status is AnalysisStatus.Ready or AnalysisStatus.Review, "وضعیت نسخه برای تأیید معتبر نیست.");
        var a = row.Input();
        var tex = await db.TexFor(a);
        var settings = await CurrentSettings();
        if (a.Beams is not null) TextileRules.ValidateCapacity(a, settings.MaxWeftCycleSlots);
        var tolerance = settings.Tolerance;
        var trials = await db.Tests(id).ToListAsync();
        var effective = Effective(trials).ToArray();
        Calc.Require(trials.Where(t => t.Preparation).All(p => effective.Any(t => t.PreparationId == p.Id)),
            "یک آزمایش دارای توزین اولیه هنوز تکمیل نشده است.");
        var currentChecks = effective.Select(t => new ApprovedTrial(t.Id, Recheck(a, tex, t, tolerance) with { ValidationSettings = settings })).ToArray();
        Calc.Approval(true, currentChecks.Select(x => x.Result), command.Reason);
        var active = await db.FabricAnalysisVersions.SingleOrDefaultAsync(x =>
            x.FabricId == row.FabricId && x.Status == AnalysisStatus.Approved);
        if (active is not null)
        {
            Calc.Require(active.Version < row.Version, "نسخه‌ای جدیدتر برای این کالا تأیید شده است.");
            active.Status = AnalysisStatus.Obsolete;
            active.Touch(user);
            await Audit(active, "Obsolete", user, $"جایگزین با نسخه {row.Version}");
            await db.SaveChangesAsync();
        }
        row.Status = AnalysisStatus.Approved;
        row.Touch(user);
        await Audit(row, "Approve", user, command.Reason, Payload.Write(currentChecks));
        await db.SaveChangesAsync();
        return new { row.Id, row.Status, row.RowVersion };
    });

    public async Task<object> Detail(int id, bool report)
    {
        var a = await Get(id);
        Calc.Require(!report || a.Status == AnalysisStatus.Approved, "گزارش تنها برای نسخه فعال و تأییدشده در دسترس است.");
        var input = a.Input();
        var theory = await StoredPreview(input);
        var trials = await db.Tests(id).AsNoTracking().OrderBy(t => t.Id).ToListAsync();
        var audit = await db.ApprovalHistory.AsNoTracking().Where(h => h.AnalysisId == id).OrderBy(h => h.Id).ToListAsync();
        var approved = audit.LastOrDefault(h => h.Action == "Approve");
        var snapshots = approved?.Data is string data ? Payload.Read<ApprovedTrial[]>(data).ToDictionary(x => x.Id, x => x.Result) : [];
        var yarnIds = theory.Yarns.Select(y => y.YarnId).Distinct().ToArray();
        var yarns = (await db.Yarns.Where(y => yarnIds.Contains(y.Id)).ToListAsync())
            .Select(y => new { y.Id, y.Input().Name, y.Input().Color, tex = Calc.Tex(y.Input()) });
        if (report)
        {
            var approvedTrials = trials.Where(t => snapshots.ContainsKey(t.Id)).Select(t => new {
                t.Id, t.Number, t.Input().Date, t.Input().Weights, result = snapshots[t.Id]
            }).ToArray();
            return new { a.Id, a.Status, input, theory, yarns, trials = approvedTrials,
                approved = approved is null ? null : new { approved.User, approved.At, approved.Reason } };
        }
        var replaced = trials.Select(t => t.ReplacesId).ToHashSet();
        var prepared = trials.Select(t => t.PreparationId).ToHashSet();
        return new { a.Id, a.Status, a.RowVersion, input, theory, yarns,
            trials = trials.Select(t => new { t.Id, t.Preparation, t.At, t.User, t.ReplacesId,
                superseded = replaced.Contains(t.Id) || (t.Preparation && prepared.Contains(t.Id)),
                input = t.Input(), packageUse = t.Input().Weighings.Select(w => w.RemainingG.HasValue ?
                    (decimal?)(w.InitialG - w.InitialTareG - (w.RemainingG.Value - w.RemainingTareG)) : null),
                result = snapshots.GetValueOrDefault(t.Id) ?? (t.Validation is null ? null : Read(t)) }),
            audit = audit.Select(h => new { h.Id, h.Action, h.User, h.At, h.Reason,
                previous = h.Action == "Edit" && h.Data is string draft ? Payload.Read<AnalysisInput>(draft) : null }),
            approved = approved is null ? null : new { approved.User, approved.At, approved.Reason }
        };
    }
}
public record ApprovedTrial(int Id, TrialResult Result);
