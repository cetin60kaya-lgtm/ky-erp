export const currentAccountingMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

export const validAccountingMonth = (month) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(month || ""));

export function managementOverviewValues(data = {}) {
  const totals = data.totals || {};
  const amount = (...candidates) => {
    const chosen = candidates.find((value) => value !== null && value !== undefined && value !== "");
    if (chosen === undefined) return null;
    const n = Number(chosen);
    return Number.isFinite(n) ? n : null;
  };
  return {
    receivable: amount(data.toplamAlacak, data.tahsilatBekleyen, totals.receivable),
    payable: amount(data.toplamBorc, data.odemeBekleyen, totals.payable),
    incoming: amount(data.buAyGelenFatura, data.buAyAlisGider),
    outgoing: amount(data.buAyKesilenFatura, data.buAySatis),
    upcomingChecks: amount(data.yaklasanCekToplami, data.cekOzet?.yaklasanCekTutari),
    incomingVat: amount(data.gelenKdv),
    outgoingVat: amount(data.gidenKdv),
  };
}
