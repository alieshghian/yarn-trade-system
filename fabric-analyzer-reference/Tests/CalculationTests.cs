using FabricAnalyzer;
using Xunit;

public class CalculationTests
{
    private static readonly YarnInput Yarn = new("Test", YarnKind.Chenille, "01", CountSystem.NeCotton,
        2, 1, CountBasis.Finished, null, null, null, false, null);
    private static readonly Dictionary<int, decimal> Tex = new() { [1] = 100, [2] = 50, [3] = 25 };
    private static readonly AnalysisInput Analysis = new("F", "Fixture", 1, new(2026, 11, 25), "A", "L", 100, 90,
        1, 0.1m, 1, 0, 10, 100, 1, null, [new(1, 100, 0)], [new(2, 2, null), new(3, 1, null)]);
    private static Theory Theory(decimal length = 1, int start = 1) => Calc.Calculate(Analysis, Tex, length, 90, start);

    [Theory]
    [InlineData(CountSystem.NeCotton, 2, 295.2706235)]
    [InlineData(CountSystem.Nm, 20, 50)]
    [InlineData(CountSystem.Denier, 150, 16.6666666667)]
    [InlineData(CountSystem.Dtex, 180, 18)]
    [InlineData(CountSystem.Tex, 42, 42)]
    public void ConvertsCount(CountSystem system, double count, double expected) =>
        Assert.Equal((decimal)expected, Calc.Tex(Yarn with { System = system, Count = (decimal)count }), 8);

    [Fact]
    public void MultipliesSingleButKeepsFinishedCount()
    {
        Assert.Equal(100, Calc.Tex(Yarn with { System = CountSystem.Nm, Count = 20, Plies = 2, Basis = CountBasis.Single }));
        Assert.Equal(50, Calc.Tex(Yarn with { System = CountSystem.Nm, Count = 20, Plies = 2 }));
        Assert.Throws<InvalidData>(() => Calc.Tex(Yarn with { Plies = 2, Basis = null }));
    }

    [Fact]
    public void MeasurementRequiresSourceAndOverridesNominal()
    {
        var measured = Yarn with { MeasureG = 2, MeasureM = 10, UseMeasured = true };
        Assert.Throws<InvalidData>(() => Calc.Tex(measured));
        Assert.Equal(200, Calc.Tex(measured with { MeasureSource = "Scale 31" }));
    }

    [Fact]
    public void UnknownChenilleCountIsRejected() => Assert.Throws<InvalidData>(() => Calc.Tex(Yarn with { System = null }));

    [Fact]
    public void CountsTwoPlusOneAndRollRemainder()
    {
        var t = Theory();
        Assert.Equal(3, t.CyclePicks);
        Assert.Equal(10, t.TotalPicks);
        Assert.Equal(7, t.Yarns.Single(y => y.YarnId == 2).Picks);
        Assert.Equal(3, t.Yarns.Single(y => y.YarnId == 3).Picks);
        Assert.Equal(2, t.NextPick);
        Assert.Equal(1, Theory(.95m, 3).NextPick);
    }

    [Fact]
    public void HandlesRepeatedYarnAndRotatedPartialCycle()
    {
        var a = Analysis with { Weft = [new(2, 2, null), new(3, 1, null), new(2, 1, null), new(3, 3, null)] };
        var t = Calc.Calculate(a, Tex, .2m, 90, 3);
        var yarn = t.Yarns.Single(y => y.YarnId == 2);
        Assert.Equal(3, yarn.CyclePicks);
        Assert.Equal(1, yarn.Picks);
        Assert.Equal(5, t.NextPick);
        Assert.Equal(2, t.TotalPicks);
    }

    [Fact]
    public void ComputesWarpWeightAndFlagsEstimates()
    {
        var a = Analysis with { WarpExtra = 5, Warp = [new(1, null, 5)] };
        var t = Calc.Calculate(a, Tex, 2, 90, 1);
        Assert.Equal(22, t.WarpG);
        Assert.Equal(11, t.WarpGPerM);
        Assert.Equal(100, t.TotalEnds);
        Assert.True(t.EstimatedWarp);
    }

    [Fact]
    public void MeasuredPickLengthReplacesAllowance()
    {
        var a = Analysis with { Weft = [new(2, 2, 200), new(3, 1, null)] };
        var t = Calc.Calculate(a, Tex, 1, 90, 1);
        Assert.Equal(.7825m, t.WeftG);
        Assert.Equal(14, t.Yarns.Single(y => y.YarnId == 2).Meters);
        Assert.Equal(t.TotalG / .9m, t.Gsm);
    }

    private static TrialInput ValidTrial(Theory t, decimal warpFactor = 1)
    {
        var rows = t.Yarns.Select(y => {
            var consumed = y.Grams * (y.Axis == Axis.Warp ? warpFactor : 1);
            return new WeighInput(y.Axis, y.YarnId, "Bobbin", 200, 190 - consumed, true, 20, 10, 0, null);
        }).ToArray();
        decimal cloth = t.WarpG * warpFactor + t.WeftG;
        return new("T", new(2026, 11, 25), "L", "A", t.LengthM, 90, cloth, t.StartPick, t.NextPick, rows, null);
    }

    [Fact]
    public void CalculatesNetWeightAndPassesAtThreshold()
    {
        var theory = Theory();
        var result = Calc.ValidateTrial(theory, ValidTrial(theory, 1.05m), 5);
        Assert.Equal(10.5m + theory.WeftG, result.ConsumedG);
        Assert.Equal(5, result.Checks.Single(c => c.Check == "warp").Difference);
        Assert.Equal(CheckState.Pass, result.State);
        Calc.Approval(true, [result], null);
    }

    [Fact]
    public void OverToleranceBlocksUndocumentedApproval()
    {
        var theory = Theory();
        var result = Calc.ValidateTrial(theory, ValidTrial(theory, 1.08m), 5);
        Assert.Equal(CheckState.Fail, result.State);
        Assert.Throws<InvalidData>(() => Calc.Approval(true, [result], null));
        Calc.Approval(true, [result], "Verified difference");
    }

    [Fact]
    public void RejectsRemainingGreaterThanInitial()
    {
        var theory = Theory();
        var trial = ValidTrial(theory);
        trial.Weighings[0] = trial.Weighings[0] with { RemainingG = 191 };
        Assert.Throws<InvalidData>(() => Calc.ValidateTrial(theory, trial, 5));
    }

    [Fact]
    public void MissingOrZeroTheoryIsNotApprovable()
    {
        var theory = Theory();
        var trial = ValidTrial(theory);
        trial.Weighings[1] = trial.Weighings[1] with { RemainingG = null, WasteG = null, RemainingTareG = 0 };
        var result = Calc.ValidateTrial(theory, trial, 5);
        Assert.Equal(CheckState.Missing, result.State);
        Assert.Null(Calc.Compare("yarn", 0, 1, 5).Difference);
        Assert.Throws<InvalidData>(() => Calc.Approval(true, [result], "manager reason"));
    }

    [Fact]
    public void NonManagerCannotApprove()
    {
        var theory = Theory();
        var result = Calc.ValidateTrial(theory, ValidTrial(theory), 5);
        Assert.Throws<InvalidData>(() => Calc.Approval(false, [result], "manager reason"));
    }

    [Fact]
    public void RequiresDocumentationAboveFiveEvenWithHigherConfiguredTolerance()
    {
        var theory = Theory();
        var result = Calc.ValidateTrial(theory, ValidTrial(theory, 1.08m), 10);
        Assert.Equal(CheckState.Pass, result.State);
        Assert.True(Calc.NeedsReview(result));
        Assert.Throws<InvalidData>(() => Calc.Approval(true, [result], null));
    }
}