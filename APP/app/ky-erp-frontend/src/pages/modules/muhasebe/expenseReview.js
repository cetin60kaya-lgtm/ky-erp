export function reviewExpense(form, params = {}) {
  const amount = Number(form.amount);
  const vatAmount = form.vatAmount === "" ? 0 : Number(form.vatAmount);
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(String(form.date || ""))) return { error: "Geçerli bir gider tarihi seçin." };
  if (!String(form.category || "").trim()) return { error: "Gider kategorisi zorunludur." };
  if (String(form.amount ?? "").trim() === "" || !Number.isFinite(amount) || amount <= 0) return { error: "Sıfırdan büyük, geçerli bir gider tutarı girin." };
  if (String(form.vatAmount ?? "").trim() !== "" && (!Number.isFinite(vatAmount) || vatAmount < 0)) return { error: "KDV negatif veya geçersiz olamaz." };
  if (!["RESMI", "GAYRI_RESMI"].includes(form.recordType)) return { error: "Resmî / gayri resmî kayıt türünü seçin." };
  const payload = { ...params, ...form, amount, vatAmount, type: "EXPENSE" };
  return {
    payload,
    templateOnly: Boolean(form.recurring),
    name: String(form.companyName || form.description || "Genel gider").trim(),
  };
}
