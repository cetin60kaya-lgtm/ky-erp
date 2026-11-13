// Bir dönem bordrosunun çalışan tarafından görülecek tek gösterim hesabı.
// Bu fonksiyon yalnız görüntü hesaplar; D1, kart, geçmiş ve ödeme durumuna yazmaz.
const cents = (value) => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.round(number * 100) : 0;
};
const amount = (value) => value / 100;

export function payrollPresentation(row = {}) {
  const salary = cents(row.salary);
  const road = cents(row.road);
  const extra = cents(row.extra);
  const overtime = cents(row.overtime);
  const advance = cents(row.advance);
  const deduction = cents(row.deduction);
  const garnishment = cents(row.garnishment);
  const gross = salary + road + extra + overtime;
  const totalDeductions = advance + deduction + garnishment;
  const calculatedNet = Math.max(0, gross - totalDeductions);
  const net = Math.max(0, cents(row.net));
  const bank = Math.max(0, cents(row.bank));
  const cash = Math.max(0, cents(row.cash));
  // EK kuponu net ödeme tutarının bir parçasıdır; ikinci kez eklenmez.
  // Ödeme kaynağı (banka/elden) korunur; kupon önce elden tutardan ayrılır.
  const coupon = Math.min(Math.max(extra, 0), net);
  const extraCash = Math.min(cash, coupon);
  const extraBank = coupon - extraCash;
  const mainNet = net - coupon;
  const mainBank = bank - extraBank;
  const mainCash = cash - extraCash;

  return {
    salary: amount(salary),
    road: amount(road),
    extra: amount(extra),
    overtime: amount(overtime),
    advance: amount(advance),
    deduction: amount(deduction),
    garnishment: amount(garnishment),
    gross: amount(gross),
    totalDeductions: amount(totalDeductions),
    calculatedNet: amount(calculatedNet),
    fullNet: amount(net),
    bank: amount(bank),
    cash: amount(cash),
    extraCoupon: amount(coupon),
    couponBank: amount(extraBank),
    couponCash: amount(extraCash),
    mainNet: amount(mainNet),
    mainBank: amount(mainBank),
    mainCash: amount(mainCash),
    // Yanlış bir kaydı görselde gizleyerek 'dengeli' göstermeyiz.
    reconciled: calculatedNet === net && bank + cash === net && mainBank >= 0 && mainCash >= 0,
  };
}
