const money = (value) => Number(value || 0).toLocaleString("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 });

export function reviewDraft(row, draft, period) {
  const status = draft.status || "WAITING";
  const raw = String(draft.counterpartyBalance ?? "").trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return { error: "Geçerli bir mutabakat dönemi seçin." };
  if (!["WAITING", "MATCHED", "DIFFERENCE"].includes(status)) return { error: "Geçersiz mutabakat durumu." };
  if (raw && (!Number.isFinite(Number(raw)) || !/^-?\d+(\.\d{1,2})?$/.test(raw))) {
    return { error: "Karşı bakiye geçerli ve en fazla iki ondalık haneli olmalıdır." };
  }
  if (status !== "WAITING" && !raw) return { error: "Mutabık veya fark var durumunda karşı bakiye zorunludur." };
  const erpBalance = Number(row.erp_balance || 0);
  const counterpartyBalance = raw ? Number(raw) : null;
  const difference = counterpartyBalance === null ? null : Math.round((counterpartyBalance - erpBalance) * 100) / 100;
  if (status === "MATCHED" && Math.abs(difference) > 0.005) {
    return { error: `Karşı bakiye ile ERP bakiyesi farklı (${money(difference)}). "Mutabık" yerine "Fark Var" seçin veya bakiyeyi doğrulayın.` };
  }
  if (status === "DIFFERENCE" && Math.abs(difference) < 0.005) {
    return { error: "Bakiyeler aynı. 'Fark Var' yerine 'Mutabık' seçin veya karşı bakiyeyi düzeltin." };
  }
  return {
    companyId: row.company_id,
    companyName: row.company_name,
    period,
    erpBalance,
    counterpartyBalance: counterpartyBalance === null ? "" : counterpartyBalance,
    difference,
    status,
    note: String(draft.note || "").trim(),
  };
}

