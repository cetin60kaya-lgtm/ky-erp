// Monthly payroll payment planning: the entered bank amount is the source;
// cash is always the remainder, never a second independently typed total.
// This does not mark any bank transfer as executed or the payroll as PAID.
export function splitManualBankPayment(netAmount, enteredBank, sgkFollow) {
  const net = Number(netAmount);
  const bank = enteredBank === "" || enteredBank === null || enteredBank === undefined ? NaN : Number(enteredBank);
  if (!Number.isFinite(net) || net < 0 || !Number.isFinite(bank)) {
    return { valid: false, code: "BANK_AMOUNT_REQUIRED", message: "Bu ay bankaya ayrılan tutarı girin. Ödeme yapılmış sayılmaz." };
  }
  const netCents = Math.round(net * 100);
  const bankCents = Math.round(bank * 100);
  if (bankCents < 0 || bankCents > netCents) {
    return { valid: false, code: "BANK_AMOUNT_OUT_OF_RANGE", message: "Banka tutarı sıfırdan küçük veya net ödemeden büyük olamaz." };
  }
  if (sgkFollow === false && bankCents > 0) {
    return { valid: false, code: "SGK_DISI_BANK_PAYMENT", message: "SGK dışı personelin banka tutarı bu ödeme planında sıfır olmalıdır." };
  }
  const cashCents = netCents - bankCents;
  return {
    valid: true,
    bank: bankCents / 100,
    cash: cashCents / 100,
    paymentType: bankCents === 0 ? "Elden" : cashCents === 0 ? "Banka" : "BANKA_ELDEN",
  };
}
