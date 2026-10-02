namespace KYERP.PDKS.Core.Payroll;

public sealed record TurkishPayrollParameters(
    int Year,
    decimal MinimumGrossMonthly,
    decimal MinimumGrossDaily,
    decimal SgkCeilingMonthly,
    decimal EmployeeSgkRate,
    decimal EmployeeUnemploymentRate,
    decimal StampTaxRate);

public sealed record OfficialPayrollInput(
    decimal GrossWage,
    decimal CumulativeIncomeTaxBaseBefore = 0m,
    int WorkedDays = 30);

public sealed record OfficialPayrollResult(
    decimal GrossWage,
    decimal PrimeEarnings,
    decimal EmployeeSgk,
    decimal EmployeeUnemployment,
    decimal IncomeTaxBase,
    decimal IncomeTaxBeforeExemption,
    decimal MinimumWageIncomeTaxExemption,
    decimal IncomeTaxPayable,
    decimal StampTaxBeforeExemption,
    decimal MinimumWageStampTaxExemption,
    decimal StampTaxPayable,
    decimal NetWage,
    decimal CumulativeIncomeTaxBaseAfter);

public static class TurkishPayrollRules
{
    public static TurkishPayrollParameters ForYear(int year) => year switch
    {
        2026 => new(2026, 33_030m, 1_101m, 297_270m, 0.14m, 0.01m, 0.00759m),
        _ => throw new NotSupportedException($"{year} yılı resmî bordro parametreleri tanımlı değil.")
    };
}

public static class TurkishPayrollCalculator
{
    public static OfficialPayrollResult Calculate(OfficialPayrollInput input, TurkishPayrollParameters parameters)
    {
        if (input.GrossWage < 0) throw new ArgumentOutOfRangeException(nameof(input.GrossWage));
        if (input.WorkedDays is < 0 or > 30) throw new ArgumentOutOfRangeException(nameof(input.WorkedDays));
        if (input.CumulativeIncomeTaxBaseBefore < 0) throw new ArgumentOutOfRangeException(nameof(input.CumulativeIncomeTaxBaseBefore));

        var minGross = parameters.MinimumGrossDaily * input.WorkedDays;
        var ceiling = parameters.SgkCeilingMonthly / 30m * input.WorkedDays;
        var primeBase = input.GrossWage <= 0m ? 0m : Math.Clamp(input.GrossWage, minGross, ceiling);

        var sgk = Round(primeBase * parameters.EmployeeSgkRate);
        var unemployment = Round(primeBase * parameters.EmployeeUnemploymentRate);
        var taxBase = Math.Max(0m, input.GrossWage - sgk - unemployment);

        var before = input.CumulativeIncomeTaxBaseBefore;
        var incomeTax = Round(TaxOnCumulative(before + taxBase, parameters.Year) - TaxOnCumulative(before, parameters.Year));

        var minPrime = Math.Min(minGross, ceiling);
        var minSgk = Round(minPrime * parameters.EmployeeSgkRate);
        var minUnemployment = Round(minPrime * parameters.EmployeeUnemploymentRate);
        var minTaxBase = Math.Max(0m, minGross - minSgk - minUnemployment);
        var minTaxExemption = Round(TaxOnCumulative(before + minTaxBase, parameters.Year) - TaxOnCumulative(before, parameters.Year));
        minTaxExemption = Math.Min(incomeTax, minTaxExemption);
        var incomeTaxPayable = Math.Max(0m, Round(incomeTax - minTaxExemption));

        var stampBefore = Round(input.GrossWage * parameters.StampTaxRate);
        var stampExemption = Math.Min(stampBefore, Round(minGross * parameters.StampTaxRate));
        var stampPayable = Math.Max(0m, Round(stampBefore - stampExemption));

        var net = Round(input.GrossWage - sgk - unemployment - incomeTaxPayable - stampPayable);
        return new(
            Round(input.GrossWage), Round(primeBase), sgk, unemployment, Round(taxBase),
            incomeTax, minTaxExemption, incomeTaxPayable,
            stampBefore, stampExemption, stampPayable,
            net, Round(before + taxBase));
    }

    public static decimal GrossForTargetNet(decimal targetNet, int year, decimal cumulativeIncomeTaxBaseBefore = 0m, int workedDays = 30)
    {
        if (targetNet <= 0) return 0m;
        var parameters = TurkishPayrollRules.ForYear(year);
        var statutoryMinGross = parameters.MinimumGrossDaily * workedDays;
        var statutoryMin = Calculate(new OfficialPayrollInput(statutoryMinGross, cumulativeIncomeTaxBaseBefore, workedDays), parameters);
        if (targetNet <= statutoryMin.NetWage) return statutoryMinGross;

        decimal low = statutoryMinGross;
        decimal high = Math.Max(low * 2m, targetNet * 2m);
        while (Calculate(new OfficialPayrollInput(high, cumulativeIncomeTaxBaseBefore, workedDays), parameters).NetWage < targetNet)
        {
            high *= 1.5m;
            if (high > 10_000_000m) throw new InvalidOperationException("Hedef net ücret için brüt ücret çözülemedi.");
        }

        for (var i = 0; i < 80; i++)
        {
            var mid = (low + high) / 2m;
            var result = Calculate(new OfficialPayrollInput(mid, cumulativeIncomeTaxBaseBefore, workedDays), parameters);
            if (result.NetWage < targetNet) low = mid; else high = mid;
        }
        return Round(high);
    }

    static decimal TaxOnCumulative(decimal taxBase, int year)
    {
        if (taxBase <= 0m) return 0m;
        if (year != 2026) throw new NotSupportedException($"{year} gelir vergisi tarifesi tanımlı değil.");

        if (taxBase <= 190_000m) return taxBase * 0.15m;
        if (taxBase <= 400_000m) return 28_500m + (taxBase - 190_000m) * 0.20m;
        if (taxBase <= 1_500_000m) return 70_500m + (taxBase - 400_000m) * 0.27m;
        if (taxBase <= 5_300_000m) return 367_500m + (taxBase - 1_500_000m) * 0.35m;
        return 1_697_500m + (taxBase - 5_300_000m) * 0.40m;
    }

    static decimal Round(decimal value) => decimal.Round(value, 2, MidpointRounding.AwayFromZero);
}
