import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleDollarSign, RefreshCw, Save } from "lucide-react";
import { apiGet, apiPatch, apiPost } from "../../../utils/api";

const unwrap = (payload) => payload?.data?.data ?? payload?.data ?? payload ?? {};
const objectOf = (payload) => {
  const value = unwrap(payload);
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
};
const money = (value) => Number(value || 0).toLocaleString("tr-TR", {
  style: "currency",
  currency: "TRY",
  maximumFractionDigits: 2,
});
const today = () => new Date().toISOString().slice(0, 10);

function paramsOf(activeMainCompany) {
  return {
    ...(activeMainCompany?.slug ? { mainCompanySlug: activeMainCompany.slug } : {}),
    ...(activeMainCompany?.id ? { mainCompanyId: activeMainCompany.id } : {}),
  };
}

function draftOf(company = {}) {
  return {
    fibeEnabled: Boolean(company.fibeEnabled),
    fibeRate: company.fibeRate ?? 0,
    fibeStartDate: company.fibeStartDate || today(),
    fibeOpeningAccrual: company.fibeOpeningAccrual ?? 0,
    fibeOpeningPaid: company.fibeOpeningPaid ?? 0,
    fibeNote: company.fibeNote || "",
  };
}

function movementLabel(type) {
  switch (String(type || "").toUpperCase()) {
    case "PAYMENT": return "FİBE ödemesi";
    case "PAYMENT_REVERSAL": return "Ödeme düzeltmesi";
    case "ACCRUAL": return "Ek hakediş";
    case "ACCRUAL_REVERSAL": return "Hakediş düzeltmesi";
    default: return "FİBE hareketi";
  }
}

export default function CompanyFibeSection({ activeMainCompany, company, onChanged }) {
  const params = useMemo(() => paramsOf(activeMainCompany), [activeMainCompany]);
  const [draft, setDraft] = useState(() => draftOf(company));
  const [data, setData] = useState({ summary: {}, movements: [] });
  const [payment, setPayment] = useState({ date: today(), amount: "", paymentMethod: "CASH", description: "" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => setDraft(draftOf(company)), [company]);

  const load = useCallback(async () => {
    if (!company?.id) return;
    try {
      const payload = objectOf(await apiGet(`/muhasebe/fibe/${company.id}`, { ...params, limit: 300, _ts: Date.now() }));
      setData(payload);
    } catch (error) {
      setNotice(error?.message || "FİBE bilgileri alınamadı.");
    }
  }, [company?.id, params]);

  useEffect(() => { load(); }, [load]);

  const saveSettings = async () => {
    if (!company?.id) return;
    const rate = Number(draft.fibeRate || 0);
    const openingAccrual = Number(draft.fibeOpeningAccrual || 0);
    const openingPaid = Number(draft.fibeOpeningPaid || 0);
    if (rate < 0 || rate > 100) return setNotice("FİBE oranı 0 ile 100 arasında olmalıdır.");
    if (openingAccrual < 0 || openingPaid < 0) return setNotice("FİBE başlangıç değerleri negatif olamaz.");
    setBusy(true);
    setNotice("");
    try {
      await apiPatch(`/muhasebe/firma-profilleri/${company.id}`, {
        ...params,
        ...draft,
        fibeRate: rate,
        fibeOpeningAccrual: openingAccrual,
        fibeOpeningPaid: openingPaid,
      });
      setNotice("FİBE ayarı ve başlangıç bakiyesi kaydedildi.");
      await load();
      await onChanged?.();
    } catch (error) {
      setNotice(error?.message || "FİBE ayarı kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const savePayment = async () => {
    const amount = Number(payment.amount || 0);
    if (!(amount > 0)) return setNotice("FİBE ödeme tutarı sıfırdan büyük olmalıdır.");
    setBusy(true);
    setNotice("");
    try {
      await apiPost(`/muhasebe/fibe/${company.id}/hareketler`, {
        ...params,
        movementType: "PAYMENT",
        date: payment.date,
        amount,
        paymentMethod: payment.paymentMethod,
        description: payment.description,
      });
      setPayment({ date: today(), amount: "", paymentMethod: "CASH", description: "" });
      setNotice("FİBE ödemesi kaydedildi. Normal cari bakiyesi değişmedi.");
      await load();
      await onChanged?.();
    } catch (error) {
      setNotice(error?.message || "FİBE ödemesi kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const summary = data.summary || {};
  const movements = Array.isArray(data.movements) ? data.movements : [];

  return (
    <section className="ccw-section">
      <header>
        <div>
          <h3><CircleDollarSign size={17} /> FİBE Takibi</h3>
          <span>Normal cariden tamamen ayrı firma bazlı ek ödeme hesabı</span>
        </div>
        <button type="button" disabled={busy} onClick={load}><RefreshCw size={15} /> Yenile</button>
      </header>

      {notice ? <div className="ccw-notice" role="status">{notice}</div> : null}

      <div className="ccw-check-row">
        <label>
          <input
            type="checkbox"
            checked={draft.fibeEnabled}
            onChange={(event) => setDraft((current) => ({ ...current, fibeEnabled: event.target.checked }))}
          />
          Bu firma için FİBE takibini aç
        </label>
      </div>

      {draft.fibeEnabled ? (
        <>
          <div className="ccw-profile-grid">
            <label>FİBE oranı (%)
              <input type="number" min="0" max="100" step="0.01" value={draft.fibeRate} onChange={(event) => setDraft((current) => ({ ...current, fibeRate: event.target.value }))} />
            </label>
            <label>FİBE başlangıç tarihi
              <input type="date" value={draft.fibeStartDate} onChange={(event) => setDraft((current) => ({ ...current, fibeStartDate: event.target.value }))} />
            </label>
            <label>Başlangıç hakedişi
              <input type="number" min="0" step="0.01" value={draft.fibeOpeningAccrual} onChange={(event) => setDraft((current) => ({ ...current, fibeOpeningAccrual: event.target.value }))} />
            </label>
            <label>Başlangıç ödenen
              <input type="number" min="0" step="0.01" value={draft.fibeOpeningPaid} onChange={(event) => setDraft((current) => ({ ...current, fibeOpeningPaid: event.target.value }))} />
            </label>
            <label className="wide">FİBE notu
              <input value={draft.fibeNote} onChange={(event) => setDraft((current) => ({ ...current, fibeNote: event.target.value }))} placeholder="Firma anlaşması / açıklama" />
            </label>
          </div>
          <div className="ccw-drawer-actions">
            <button type="button" className="primary" disabled={busy} onClick={saveSettings}><Save size={15} /> FİBE Ayarını Kaydet</button>
          </div>

          <div className="ccw-detail-summary">
            <div><span>Referans gelen KDV</span><strong>{money(summary.incomingVatTotal)}</strong></div>
            <div><span>Otomatik hakediş</span><strong>{money(summary.automaticAccrual)}</strong></div>
            <div><span>Toplam FİBE</span><strong>{money(summary.totalAccrual)}</strong></div>
            <div><span>Toplam ödenen</span><strong>{money(summary.totalPaid)}</strong></div>
            <div><span>FİBE kalan</span><strong>{money(summary.remainingBalance)}</strong></div>
            <div><span>Başlangıç bakiye</span><strong>{money(summary.openingBalance)}</strong></div>
          </div>

          <div className="ccw-transaction">
            <header><h3>FİBE ödeme girişi</h3></header>
            <div>
              <label>Tarih<input type="date" value={payment.date} onChange={(event) => setPayment((current) => ({ ...current, date: event.target.value }))} /></label>
              <label>Tutar<input type="number" min="0" step="0.01" value={payment.amount} onChange={(event) => setPayment((current) => ({ ...current, amount: event.target.value }))} /></label>
              <label>Ödeme şekli
                <select value={payment.paymentMethod} onChange={(event) => setPayment((current) => ({ ...current, paymentMethod: event.target.value }))}>
                  <option value="CASH">Elden / Nakit</option>
                  <option value="TRANSFER">Banka / Havale</option>
                  <option value="CHECK">Çek</option>
                  <option value="CARD">Kart</option>
                  <option value="OTHER">Diğer</option>
                </select>
              </label>
              <label className="wide">Açıklama<input value={payment.description} onChange={(event) => setPayment((current) => ({ ...current, description: event.target.value }))} /></label>
            </div>
            <footer><button type="button" disabled={busy} onClick={savePayment}>FİBE Ödemesini Kaydet</button></footer>
          </div>

          <div className="ccw-table-wrap compact">
            <table>
              <thead><tr><th>Tarih</th><th>İşlem</th><th>Tutar</th><th>Ödeme şekli</th><th>Açıklama</th></tr></thead>
              <tbody>
                {movements.length ? movements.map((row) => (
                  <tr key={row.id}>
                    <td>{String(row.movement_date || "").slice(0, 10) || "-"}</td>
                    <td>{movementLabel(row.movement_type)}</td>
                    <td>{money(row.amount)}</td>
                    <td>{row.payment_method || "-"}</td>
                    <td>{row.description || "-"}</td>
                  </tr>
                )) : <tr><td colSpan="5">Henüz FİBE hareketi yok.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="ccw-mini-empty">Bu firmada FİBE kapalıdır. Açınca başlangıç tarihi, oran ve mevcut FİBE bakiyesi girilebilir.</div>
      )}
    </section>
  );
}
