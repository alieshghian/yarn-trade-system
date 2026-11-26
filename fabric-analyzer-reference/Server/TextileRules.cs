namespace FabricAnalyzer;

public static class TextileRules
{
    public const int DefaultSlots = 8;
    public const int HardwareMaximum = 12;

    public static void ValidateCapacity(AnalysisInput input, int slots)
    {
        Calc.Require(slots is >= 1 and <= HardwareMaximum, "ظرفیت پود باید بین 1 و 12 باشد.");
        Calc.Require(input.Weft is { Length: > 0 } && input.Weft.Length <= slots &&
            input.Weft.All(w => w is not null && w.YarnId > 0 && w.Picks is > 0 && w.Picks <= slots),
            $"سیکل پود باید مرحله معتبر داشته باشد و از {slots} جایگاه بیشتر نشود.");
        var used = input.Weft.Select(w => w.YarnId).ToHashSet();
        Calc.Require(input.Weft.Sum(w => w.Picks) <= slots && used.Count <= slots,
            $"مجموع تکرار پود یا تعداد رنگ از ظرفیت {slots} جایگاه بیشتر است.");
        Calc.Require(input.WeftColors is { Length: > 0 } && input.WeftColors.Length <= slots &&
            input.WeftColors.Length == used.Count && used.SetEquals(input.WeftColors),
            "همه نخ/رنگ‌های جدول باید یکتا باشند و در سیکل استفاده شوند.");
    }

    public static WarpInput[] Allocate(WarpBeam[] beams)
    {
        Calc.Require(beams.Length is 1 or 2 && beams.All(b => b is not null), "یک یا دو چله وارد کنید.");
        Calc.Require(beams.Length == 1 ? beams[0].Beam == Beam.Single :
            beams.Select(b => b.Beam).ToHashSet().SetEquals([Beam.Upper, Beam.Lower]),
            "در حالت دوچله، چله بالا و پایین باید جدا ثبت شوند.");

        return beams.SelectMany(beam => {
            Calc.Require(beam.Ends is > 0 and <= 4_000_000 &&
                beam.Steps is { Length: > 0 and <= 120 } &&
                beam.Steps.All(s => s is not null && s.YarnId > 0 && s.Repeat is > 0 and <= 4_000_000 &&
                    Calc.Percent(s.Extra) && Calc.Precision(s.Extra)), "تعداد سرنخ، نخ و تکرار مراحل هر چله را کامل کنید.");
            var period = beam.Steps.Sum(s => s.Repeat);
            Calc.Require(period <= beam.Ends, "طول الگوی چله از تعداد سرنخ همان چله بیشتر است.");
            var (loops, remaining) = Math.DivRem(beam.Ends, period);
            return beam.Steps.Select(s => {
                var partial = Math.Min(remaining, s.Repeat);
                remaining -= partial;
                return new WarpInput(s.YarnId, loops * s.Repeat + partial, s.Extra, beam.Beam);
            }).ToArray();
        }).ToArray();
    }

    public static AnalysisInput Normalize(AnalysisInput input, SettingsSnapshot settings)
    {
        Calc.Require(input.Beams is not null, "تعریف مرتب چله یا چله‌ها الزامی است.");
        Calc.Require(Enum.IsDefined(input.Basis), "واحد مبنای پارچه معتبر نیست.");
        ValidateCapacity(input, settings.MaxWeftCycleSlots);
        Calc.Require(!input.Weft.Any(w => w.MeasuredPickCm.HasValue) || Calc.Text(input.WeftLengthSource, 500),
            "منبع اندازه‌گیری طول واقعی پود را وارد کنید.");
        return input with { Warp = Allocate(input.Beams!), SampleM = 1, Settings = settings };
    }

    public static void ValidateNewTrial(AnalysisInput analysis, TrialInput trial)
    {
        Calc.Require(trial.Weights is not null, "توزین رول، نمونه و ضایعات را کامل کنید.");
        Calc.Require(!trial.LengthEstimated || analysis.Basis == FabricBasis.Kilogram,
            "برای پارچه متری، طول نمونه باید اندازه‌گیری شود.");
        Calc.Require(trial.WidthCm <= analysis.ReedCm, "عرض خام نمونه نباید از عرض شانه بیشتر باشد.");
        Calc.Require(trial.Weighings.Select(w => w.Package?.Trim().ToUpperInvariant()).Distinct().Count() == trial.Weighings.Length,
            "هر شناسه بسته فقط یک‌بار در آزمایش قابل ثبت است.");
    }

    public static TrialResult Assess(Theory theory, TrialInput trial, decimal tolerance, Validation[] yarns,
        decimal? warp, decimal? weft, decimal? perPackageWaste)
    {
        var weights = trial.Weights!;
        bool Weight(decimal? value) => value is >= 0 and <= 100_000_000 && Calc.Precision(value.Value);
        Calc.Require(Weight(weights.RollGrossG) && weights.RollGrossG > 0 && Weight(weights.RollTareG) &&
            Weight(weights.SampleG) && weights.SampleInRoll.HasValue && Weight(weights.YarnWasteG) &&
            Weight(weights.FabricWasteG), "وزن ناخالص رول، مغزی، نمونه جداشده، شمول نمونه و هر دو نوع ضایعات الزامی‌اند. برای نبود نمونه یا ضایعات عدد 0 ثبت کنید.");
        Calc.Require(weights.RollTareG < weights.RollGrossG, "وزن مغزی و بسته‌بندی باید از رول ناخالص کمتر باشد.");
        Calc.Require(weights.FabricWasteM is null ||
            (weights.FabricWasteM >= 0 && weights.FabricWasteM <= 10000 && (weights.FabricWasteM == 0 || weights.FabricWasteG > 0)),
            "متراژ ضایعات پارچه معتبر نیست.");
        var netRoll = weights.RollGrossG!.Value - weights.RollTareG!.Value;
        Calc.Require(weights.SampleInRoll != true || weights.SampleG <= netRoll, "نمونهٔ داخل رول نمی‌تواند از وزن خالص رول سنگین‌تر باشد.");
        var expectedHealthy = netRoll + (weights.SampleInRoll == true ? 0 : weights.SampleG!.Value);
        Calc.Require(trial.Weighings.Sum(w => w.WasteG ?? 0) <= weights.YarnWasteG &&
            (!perPackageWaste.HasValue || weights.YarnWasteG == perPackageWaste),
            "ضایعات نخ ثبت‌شده برای بسته‌ها با ضایعات کل نخ مغایرت دارد.");

        var waste = weights.YarnWasteG!.Value + weights.FabricWasteG!.Value;
        decimal? consumed = warp + weft;
        var checks = new List<Validation> {
            new("tex", CheckState.Pass, null, null, null),
            new("cycle", trial.ObservedNextPick is null ? CheckState.Missing :
                theory.NextPick == trial.ObservedNextPick ? CheckState.Pass : CheckState.Fail,
                theory.NextPick, trial.ObservedNextPick, null),
            new("ends", theory.ExpectedEnds == theory.TotalEnds ? CheckState.Pass : CheckState.Fail,
                theory.ExpectedEnds, theory.TotalEnds, null),
            Calc.Compare("warp", theory.WarpG, warp, tolerance),
            Calc.Compare("weft", theory.WeftG, weft, tolerance),
            Calc.Compare("total", theory.TotalG, consumed, tolerance),
            Calc.Compare("roll", expectedHealthy, trial.ClothG, tolerance),
            Calc.Compare("balance", consumed, trial.ClothG + waste, tolerance)
        };
        checks.AddRange(yarns);
        foreach (var beam in yarns.Where(y => y.Beam.HasValue).GroupBy(y => y.Beam))
        {
            decimal? actual = beam.All(y => y.Actual.HasValue) ? beam.Sum(y => y.Actual) : null;
            checks.Add(Calc.Compare("beam", beam.Sum(y => y.Expected), actual, tolerance, Axis.Warp) with { Beam = beam.Key });
        }
        if (!trial.LengthEstimated)
        {
            checks.Add(Calc.Compare("meter", theory.TotalG / theory.LengthM, consumed / theory.LengthM, tolerance));
            checks.Add(Calc.Compare("clothMeter", (theory.TotalG - waste) / theory.LengthM, trial.ClothG / theory.LengthM, tolerance));
        }
        else
        {
            for (var i = 0; i < checks.Count; i++)
            {
                var c = checks[i];
                if (c.Check is "cycle" or "warp" or "weft" or "total" or "yarn" or "beam")
                    checks[i] = c with { State = CheckState.Missing, Advisory = true };
            }
            // Every theoretical comparison is advisory for approximate length, but incomplete package data still blocks approval.
            checks.Add(new("weighing", consumed.HasValue ? CheckState.Pass : CheckState.Missing, null, consumed, null));
        }

        var assessed = checks.Where(c => !c.Advisory).ToArray();
        var state = assessed.Any(v => v.State == CheckState.Missing) ? CheckState.Missing :
            assessed.Any(v => v.State == CheckState.Fail) ? CheckState.Fail : CheckState.Pass;
        var basis = theory.Basis == FabricBasis.Kilogram ? trial.ClothG / 1000 : trial.LengthM;
        var rates = yarns.Select(c => new UseRate(c.Axis!.Value, c.YarnId!.Value, c.Beam, c.Actual / basis,
            c.Expected / basis)).ToArray();
        return new(theory, checks, consumed, waste, trial.ClothG, trial.ClothG / trial.LengthM,
            consumed - (trial.ClothG + waste), tolerance, state, trial.LengthEstimated,
            trial.LengthEstimated ? null : trial.ClothG / (trial.LengthM * trial.WidthCm / 100), consumed / basis, rates);
    }
}
