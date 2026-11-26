using System.Text.Json.Serialization;

namespace FabricAnalyzer;

public enum YarnKind { Chenille, Filament, Spun, Other }
public enum CountSystem { Denier, Dtex, Tex, Nm, NeCotton }
public enum CountBasis { Single, Finished }
public enum Axis { Warp, Weft }
public enum FabricBasis { Meter, Kilogram }
public enum Beam { Single, Upper, Lower }
public record WarpStep(int YarnId, int Repeat, decimal Extra = 0);
public record WarpBeam(Beam Beam, int Ends, WarpStep[] Steps);
public record SettingsSnapshot(int MaxWeftCycleSlots, decimal Tolerance, int? Revision, DateTimeOffset? EffectiveAt);
public record FabricWeights(decimal? RollGrossG, decimal? RollTareG, decimal? SampleG, bool? SampleInRoll, decimal? YarnWasteG, decimal? FabricWasteG, decimal? FabricWasteM);
public enum AnalysisStatus { Draft, Ready, Review, Approved, Obsolete }
public enum CheckState { Pass, Fail, Missing }
public enum Role { Production, Manager, Sales, Pricing, Administrator }

public record YarnInput(string Name, YarnKind Kind, string Color, CountSystem? System, decimal Count,
    int Plies, CountBasis? Basis, decimal? MeasureM, decimal? MeasureG, string? MeasureSource, bool UseMeasured, string? Notes,
    string? Code = null, string? Material = null, DateOnly? MeasureDate = null);
public record WarpInput(int YarnId, int? Ends, decimal Extra, Beam? Beam = null);
public record WeftInput(int YarnId, int Picks, decimal? MeasuredPickCm);
public record AnalysisInput(string Code, string Description, int Version, DateOnly Date, string Responsible,
    string Machine, decimal ReedCm, decimal FabricCm, decimal WarpDensity, decimal WeftDensity, decimal SampleM,
    decimal WarpExtra, decimal WeftExtra, decimal? WarpBasisCm, int StartPick, string? Notes,
    WarpInput[] Warp, WeftInput[] Weft, string? RowVersion = null, string? Reason = null, FabricBasis Basis = FabricBasis.Meter,
    WarpBeam[]? Beams = null, int[]? WeftColors = null, SettingsSnapshot? Settings = null, string? WeftLengthSource = null);
public record WeighInput(Axis Axis, int YarnId, string Package, decimal InitialG, decimal? RemainingG,
    bool Gross, decimal InitialTareG, decimal RemainingTareG, decimal? WasteG, string? Notes, Beam? Beam = null);
public record TrialInput(string Number, DateOnly Date, string Machine, string Operator, decimal LengthM,
    decimal WidthCm, decimal ClothG, int StartPick, int? ObservedNextPick, WeighInput[] Weighings,
    string? Notes, int? ReplacesId = null, string? Reason = null, string? RowVersion = null, int? PreparationId = null,
    bool LengthEstimated = false, FabricWeights? Weights = null);
public record VersionCommand(string RowVersion, string? Reason = null);
public record LoginInput(string User, string Password);
public record UserInput(string User, string Name, string Password, Role Role, bool Enabled = true);
public record SettingInput(decimal Tolerance, int? MaxWeftCycleSlots = null, string? Reason = null);
public record YarnUse(Axis Axis, int YarnId, int? Ends, int CyclePicks, decimal? SharePercent, decimal? PicksPerCm,
    long? Picks, long? PicksInOneMeter, decimal Meters, decimal Grams, decimal GramsPerMeter, decimal WeightSharePercent, Beam? Beam = null);
public record WarpUse(int Position, int YarnId, int Ends, bool Estimated, decimal Meters, decimal GramsPerMeter, Beam? Beam = null);
public record Theory(decimal LengthM, int CyclePicks, long TotalPicks, int StartPick, int NextPick,
    bool EstimatedWarp, int ExpectedEnds, int TotalEnds, decimal WarpG, decimal WeftG, decimal TotalG,
    decimal WarpGPerM, decimal WeftGPerM, decimal TotalGPerM, decimal Gsm, IReadOnlyList<YarnUse> Yarns, IReadOnlyList<WarpUse> WarpGroups,
    FabricBasis Basis = FabricBasis.Meter, decimal? WarpDensityActual = null, decimal? WarpReferenceCm = null);
public record Validation(string Check, CheckState State, decimal? Expected, decimal? Actual, decimal? Difference,
    Axis? Axis = null, int? YarnId = null, Beam? Beam = null, bool Advisory = false);
public record TrialResult(Theory Theory, IReadOnlyList<Validation> Checks, decimal? ConsumedG, decimal? WasteG,
    decimal ClothG, decimal ClothGPerM, decimal? BalanceG, decimal Tolerance, CheckState State,
    bool LengthEstimated = false, decimal? ActualGsm = null, decimal? ActualRate = null, IReadOnlyList<UseRate>? Rates = null,
    SettingsSnapshot? ValidationSettings = null);
public record UseRate(Axis Axis, int YarnId, Beam? Beam, decimal? Actual, decimal? Estimate);

public sealed class InvalidData(string message) : Exception(message);
public sealed class Conflict(string message) : Exception(message);
public static class Calc
{
    public static void Require(bool ok, string error)
    {
        if (!ok) throw new InvalidData(error);
    }
    public static bool Text(string? text, int max = 200) => !string.IsNullOrWhiteSpace(text) && text.Trim().Length <= max;
    public static bool Positive(decimal x, decimal max = 1_000_000) => x >= 0.000001m && x <= max;
    public static bool Precision(decimal x) => decimal.Round(x, 10) == x;
    public static bool Percent(decimal x) => x is >= 0 and <= 100;
    public static int Rounded(decimal x) => checked((int)decimal.Round(x, 0, MidpointRounding.AwayFromZero));
    public static decimal Tex(YarnInput yarn)
    {
        Require(Text(yarn.Name) && Text(yarn.Color) && Enum.IsDefined(yarn.Kind), "نام، نوع و رنگ نخ را مشخص کنید.");
        Require(yarn.System.HasValue && Enum.IsDefined(yarn.System.Value) &&
            yarn.Basis.HasValue && Enum.IsDefined(yarn.Basis.Value),
            "سیستم نمره‌گذاری و مبنای نمره (تک‌لا یا نهایی) برای هر نخ، از جمله شانل، اجباری است.");
        Require(Positive(yarn.Count) && yarn.Plies is >= 1 and <= 100, "نمره نخ یا تعداد لا معتبر نیست.");
        var nominal = yarn.System switch {
            CountSystem.Denier => yarn.Count / 9, CountSystem.Dtex => yarn.Count / 10,
            CountSystem.Tex => yarn.Count, CountSystem.Nm => 1000 / yarn.Count,
            CountSystem.NeCotton => 590.541247m / yarn.Count,
            _ => throw new InvalidData("سیستم نمره نخ معتبر نیست.")
        };
        if (yarn.Basis == CountBasis.Single) nominal *= yarn.Plies;
        if (yarn.UseMeasured || yarn.MeasureM.HasValue || yarn.MeasureG.HasValue || Text(yarn.MeasureSource))
            Require(Positive(yarn.MeasureM ?? 0) && Positive(yarn.MeasureG ?? 0) && Text(yarn.MeasureSource, 500),
                "برای Tex اندازه‌گیری‌شده، طول، وزن و منبع اندازه‌گیری را کامل کنید.");
        return yarn.UseMeasured ? yarn.MeasureG!.Value * 1000 / yarn.MeasureM!.Value : nominal;
    }

    public static void ValidateAnalysis(AnalysisInput a, IReadOnlyDictionary<int, decimal> tex)
    {
        Require(Text(a.Code, 80) && Text(a.Description) && a.Version > 0 && a.Date != default &&
            Text(a.Responsible) && Text(a.Machine), "کد، شرح، نسخه، تاریخ، مسئول و دستگاه الزامی‌اند.");
        Require(Positive(a.ReedCm, 2000) && Positive(a.FabricCm, 2000) &&
            Positive(a.WarpDensity, 2000) && Positive(a.WeftDensity, 2000) && Positive(a.SampleM, 10000) &&
            (a.WarpBasisCm is null || Positive(a.WarpBasisCm.Value, 2000)) &&
            Percent(a.WarpExtra) && Percent(a.WeftExtra), "ابعاد، تراکم و درصدهای آنالیز خارج از دامنه معتبرند.");
        if (a.Beams is not null) Require(a.FabricCm <= a.ReedCm, "عرض خام نباید از عرض شانه بیشتر باشد.");
        Require(a.Warp is { Length: > 0 and <= 500 } && a.Weft is { Length: > 0 and <= 500 },
            "حداقل یک گروه تار و یک مرحله پود وارد کنید (حداکثر 500 ردیف در هر جدول).");
        Require(a.Warp.All(w => w is not null && tex.ContainsKey(w.YarnId) && (w.Ends is null or (> 0 and <= 4_000_000)) && Percent(w.Extra) && Precision(w.Extra)),
            "نخ، تعداد سرنخ یا درصد اضافه‌طول یکی از گروه‌های تار نامعتبر است.");
        Require(a.Weft.All(w => w is not null && tex.ContainsKey(w.YarnId) && w.Picks is > 0 and <= 500 &&
            (w.MeasuredPickCm is null || (Positive(w.MeasuredPickCm.Value, 5000) && Precision(w.MeasuredPickCm.Value)))), "نخ، تعداد یا طول واقعی یکی از مراحل پود نامعتبر است.");
        int cycle = a.Weft.Sum(w => w.Picks);
        Require(cycle <= 500 && a.StartPick >= 1 && a.StartPick <= cycle, "سیکل باید حداکثر 500 پود داشته باشد و نقطه شروع در محدوده آن باشد.");
        Require(a.Warp.Count(w => w.Ends is null) <= 1, "برای تخمین، تعداد سرنخ حداکثر یک گروه تار می‌تواند خالی باشد.");
    }

    public static Theory Calculate(AnalysisInput a, IReadOnlyDictionary<int, decimal> tex, decimal length, decimal width, int start)
    {
        if (a.Beams is not null) a = a with { Warp = TextileRules.Allocate(a.Beams) };
        ValidateAnalysis(a, tex);
        Require(Positive(length, 10000) && Positive(width, 2000), "طول یا عرض نمونه خارج از دامنه معتبر است.");
        int[] cycle = a.Weft.SelectMany((step, index) => Enumerable.Repeat(index, step.Picks)).ToArray();
        Require(start >= 1 && start <= cycle.Length, "شماره شروع سیکل خارج از محدوده است.");
        var expectedEnds = Rounded(a.WarpDensity * (a.WarpBasisCm ?? a.ReedCm));
        var knownEnds = a.Warp.Sum(w => w.Ends ?? 0);
        Require(expectedEnds > 0 && (a.Warp.All(w => w.Ends.HasValue) || expectedEnds > knownEnds),
            "تخمین سرنخ گروه تار باید مثبت باشد. عرض مبنا، تراکم و تعداد سرنخ‌های معلوم را بررسی کنید.");

        long picks = Rounded(a.WeftDensity * length * 100);
        long oneMeterPicks = Rounded(a.WeftDensity * 100);
        long[] Counts(long count)
        {
            var result = a.Weft.Select(w => (count / cycle.Length) * w.Picks).ToArray();
            for (int i = 0; i < count % cycle.Length; i++) result[cycle[(start - 1 + i) % cycle.Length]]++;
            return result;
        }
        var counts = Counts(picks);
        var oneMeterCounts = Counts(oneMeterPicks);
        var warpGroups = a.Warp.Select((w, index) => {
            int ends = w.Ends ?? expectedEnds - knownEnds;
            decimal groupMeters = ends * length * (1 + (a.WarpExtra + w.Extra) / 100);
            return new WarpUse(index + 1, w.YarnId, ends, w.Ends is null || (a.Beams is null && a.WarpBasisCm is null),
                groupMeters, groupMeters * tex[w.YarnId] / 1000 / length, w.Beam);
        }).ToArray();
        var warp = warpGroups.GroupBy(w => (w.YarnId, w.Beam)).Select(group => {
            decimal meters = group.Sum(w => w.Meters);
            return new YarnUse(Axis.Warp, group.Key.YarnId, group.Sum(w => w.Ends),
                0, null, null, null, null, meters, meters * tex[group.Key.YarnId] / 1000,
                meters * tex[group.Key.YarnId] / 1000 / length, 0, group.Key.Beam);
        });
        var weft = a.Weft.Select((step, i) => new {
            step.YarnId, step.Picks, Total = counts[i], One = oneMeterCounts[i],
            PickM = (step.MeasuredPickCm ?? (a.ReedCm * (1 + a.WeftExtra / 100))) / 100
        }).GroupBy(w => w.YarnId).Select(group => {
            int cyclePicks = group.Sum(w => w.Picks);
            decimal share = (decimal)cyclePicks / cycle.Length;
            decimal meters = group.Sum(w => w.Total * w.PickM);
            decimal metersOne = group.Sum(w => w.One * w.PickM);
            return new YarnUse(Axis.Weft, group.Key, null, cyclePicks, share * 100,
                a.WeftDensity * share, group.Sum(w => w.Total), group.Sum(w => w.One), meters,
                meters * tex[group.Key] / 1000, metersOne * tex[group.Key] / 1000, 0);
        });
        var usage = warp.Concat(weft).ToArray();
        decimal warpG = usage.Where(u => u.Axis == Axis.Warp).Sum(u => u.Grams);
        decimal weftG = usage.Where(u => u.Axis == Axis.Weft).Sum(u => u.Grams);
        decimal total = warpG + weftG;
        decimal warpPerM = usage.Where(u => u.Axis == Axis.Warp).Sum(u => u.GramsPerMeter);
        decimal weftPerM = usage.Where(u => u.Axis == Axis.Weft).Sum(u => u.GramsPerMeter);
        return new(length, cycle.Length, picks, start, (int)((start - 1 + picks) % cycle.Length) + 1,
            (a.Beams is null && a.WarpBasisCm is null) || a.Warp.Any(w => w.Ends is null), expectedEnds,
            a.Warp.Sum(w => w.Ends ?? expectedEnds - knownEnds), warpG, weftG, total, warpPerM, weftPerM,
            warpPerM + weftPerM, total / (length * width / 100),
            usage.Select(u => u with { WeightSharePercent = total == 0 ? 0 : 100 * u.Grams / total }).ToArray(), warpGroups, a.Basis,
            warpGroups.Sum(w => w.Ends) / (a.WarpBasisCm ?? a.ReedCm), a.WarpBasisCm ?? a.ReedCm);
    }

    public static decimal Net(decimal weight, decimal tare, bool gross)
    {
        Require(weight is >= 0 and <= 100_000_000 && tare >= 0 && Precision(weight) && Precision(tare) && (gross ? tare <= weight : tare == 0),
            "وزن یا وزن ظرف نامعتبر است. برای وزن خالص، وزن ظرف باید صفر باشد.");
        return weight - tare;
    }

    public static Validation Compare(string name, decimal? expected, decimal? actual, decimal tolerance,
        Axis? axis = null, int? yarn = null)
    {
        decimal? difference = expected is > 0 && actual.HasValue ? 100 * (actual - expected) / expected : null;
        return new(name, difference is null ? CheckState.Missing : Math.Abs(difference.Value) <= tolerance
            ? CheckState.Pass : CheckState.Fail, expected, actual, difference, axis, yarn);
    }

    public static void ValidateWeighings(Theory theory, WeighInput[] rows)
    {
        Require(rows is { Length: > 0 and <= 1000 }, "حداقل یک بسته توزین وارد کنید (حداکثر 1000 بسته).");
        var expected = theory.Yarns.Select(y => (y.Axis, y.YarnId, y.Beam)).ToHashSet();
        Require(rows.All(w => w is not null && expected.Contains((w.Axis, w.YarnId, w.Beam)) && Text(w.Package, 100)),
            "شناسه بسته و تطبیق نخ با گروه تار یا پود آنالیز را بررسی کنید.");
        Require(rows.Select(w => (w.Axis, w.YarnId, w.Package.Trim().ToUpperInvariant())).Distinct().Count() == rows.Length,
            "شماره بسته برای همین نخ و جهت تکراری است.");
        foreach (var w in rows)
        {
            var initial = Net(w.InitialG, w.InitialTareG, w.Gross);
            Require(initial > 0, "وزن اولیه خالص بسته باید مثبت باشد.");
            if (w.RemainingG is decimal remaining)
            {
                var consumed = initial - Net(remaining, w.RemainingTareG, w.Gross);
                Require(consumed >= 0, $"وزن باقی‌مانده بسته «{w.Package}» بیشتر از وزن اولیه است. مبنای توزین را اصلاح کنید.");
                Require(w.WasteG is null || (w.WasteG >= 0 && w.WasteG <= consumed && Precision(w.WasteG.Value)),
                    $"ضایعات بسته «{w.Package}» خارج از محدوده مصرف واقعی است.");
            }
            else Require(w.WasteG is null && w.RemainingTareG == 0, "برای ثبت ضایعات یا ظرف باقی‌مانده، وزن باقی‌مانده لازم است.");
        }
    }

    public static TrialResult ValidateTrial(Theory theory, TrialInput trial, decimal tolerance)
    {
        Require(Text(trial.Number, 80) && Text(trial.Machine) && Text(trial.Operator) && trial.Date != default &&
            Positive(trial.ClothG, 100_000_000), "شماره، دستگاه، تاریخ، اپراتور و وزن مثبت پارچه آزمایشی الزامی‌اند.");
        Require(trial.ObservedNextPick is null || (trial.ObservedNextPick >= 1 && trial.ObservedNextPick <= theory.CyclePicks),
            "موقعیت مشاهده‌شده بعد از پایان نمونه خارج از سیکل است.");
        ValidateWeighings(theory, trial.Weighings);
        var groups = trial.Weighings.ToLookup(w => (w.Axis, w.YarnId, w.Beam));
        decimal? Consumed(IEnumerable<WeighInput> group) => group.Any() && group.All(w => w.RemainingG.HasValue)
            ? group.Sum(w => Net(w.InitialG, w.InitialTareG, w.Gross) - Net(w.RemainingG!.Value, w.RemainingTareG, w.Gross)) : null;
        Validation Exact(string key, int expected, int? actual) => new(key, actual is null ? CheckState.Missing :
            expected == actual ? CheckState.Pass : CheckState.Fail, expected, actual, null);
        var perYarn = theory.Yarns.Select(u => Compare("yarn", u.Grams,
            Consumed(groups[(u.Axis, u.YarnId, u.Beam)]), tolerance, u.Axis, u.YarnId) with { Beam = u.Beam }).ToArray();
        decimal? Sum(Axis axis) => perYarn.Where(v => v.Axis == axis).All(v => v.Actual.HasValue)
            ? perYarn.Where(v => v.Axis == axis).Sum(v => v.Actual) : null;
        decimal? warp = Sum(Axis.Warp), weft = Sum(Axis.Weft);
        decimal? consumed = warp + weft;
        decimal? waste = trial.Weighings.All(w => w.WasteG.HasValue) ? trial.Weighings.Sum(w => w.WasteG) : null;
        if (trial.Weights is not null) return TextileRules.Assess(theory, trial, tolerance, perYarn, warp, weft, waste);
        var checks = new List<Validation> {
            new("tex", CheckState.Pass, null, null, null),
            Exact("cycle", theory.NextPick, trial.ObservedNextPick),
            Exact("ends", theory.ExpectedEnds, theory.EstimatedWarp ? null : theory.TotalEnds),
            Compare("warp", theory.WarpG, warp, tolerance),
            Compare("weft", theory.WeftG, weft, tolerance),
            Compare("balance", consumed, trial.ClothG + waste, tolerance),
            Compare("meter", theory.TotalG / theory.LengthM, consumed / theory.LengthM, tolerance),
            Compare("clothMeter", (theory.TotalG - waste) / theory.LengthM, trial.ClothG / trial.LengthM, tolerance)
        };
        checks.AddRange(perYarn);
        var state = checks.Any(v => v.State == CheckState.Missing) ? CheckState.Missing :
            checks.Any(v => v.State == CheckState.Fail) ? CheckState.Fail : CheckState.Pass;
        return new(theory, checks, consumed, waste, trial.ClothG, trial.ClothG / trial.LengthM,
            consumed - (trial.ClothG + waste), tolerance, state);
    }

    public static bool NeedsReview(TrialResult result) => result.State != CheckState.Pass || result.LengthEstimated ||
        result.Checks.Any(check => !check.Advisory && check.Difference.HasValue && Math.Abs(check.Difference.Value) > 5);

    public static void Approval(bool manager, IEnumerable<TrialResult> results, string? reason)
    {
        Require(manager, "فقط مدیر تولید مجاز به تأیید است.");
        var trials = results.ToArray();
        Require(trials.Length > 0 && trials.All(t => t.State != CheckState.Missing), "تأیید ممکن نیست. داده‌های کنترل یا آزمایش کامل نیستند.");
        Require(trials.All(t => !NeedsReview(t)) || Text(reason, 1000),
            "کنترل خارج از حدود مجاز است. برای تأیید مستند، علت بررسی مدیر را وارد کنید.");
    }
}
