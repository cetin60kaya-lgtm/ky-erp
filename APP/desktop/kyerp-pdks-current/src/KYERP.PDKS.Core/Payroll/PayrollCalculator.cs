namespace KYERP.PDKS.Core.Payroll;

public sealed record PayrollInput(
    decimal MonthlySalary, decimal WorkedDays, int Overtime50Minutes, int Overtime100Minutes,
    decimal Earnings, decimal Deductions, decimal Advances, decimal PreviousBalance = 0);

public sealed record PayrollResult(
    decimal DailyRate, decimal HourlyRate, decimal NormalPay, decimal Overtime50Pay,
    decimal Overtime100Pay, decimal GrossPay, decimal TotalDeductions, decimal NetPay);

public static class PayrollCalculator
{
    public static PayrollResult Calculate(PayrollInput input)
    {
        if(input.MonthlySalary<0||input.WorkedDays<0||input.Overtime50Minutes<0||input.Overtime100Minutes<0||input.Earnings<0||input.Deductions<0||input.Advances<0)
            throw new ArgumentException("Puantaj ve bordro değerleri negatif olamaz.");
        var dailyRaw=input.MonthlySalary/30m;var hourlyRaw=dailyRaw/7.5m;
        var daily=Round(dailyRaw);var hourly=Round(hourlyRaw);
        var normal=Round(dailyRaw*input.WorkedDays);
        var overtime50=Round(hourlyRaw*1.5m*input.Overtime50Minutes/60m);
        var overtime100=Round(hourlyRaw*2m*input.Overtime100Minutes/60m);
        var gross=Round(normal+overtime50+overtime100+input.Earnings+input.PreviousBalance);
        var deductions=Round(input.Deductions+input.Advances);
        return new PayrollResult(daily,hourly,normal,overtime50,overtime100,gross,deductions,Round(gross-deductions));
    }
    static decimal Round(decimal value)=>decimal.Round(value,2,MidpointRounding.AwayFromZero);
}
