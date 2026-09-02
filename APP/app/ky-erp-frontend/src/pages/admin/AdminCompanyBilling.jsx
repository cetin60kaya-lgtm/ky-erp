import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPost, apiPut } from "../../utils/api";
import "./AdminManagement.css";

const STATUS_OPTIONS = [
  ["TRIAL", "Deneme"],
  ["ACTIVE", "Aktif"],
  ["PAUSED", "Duraklatıldı"],
  ["CANCELLED", "İptal"],
];

function unwrap(value) {
  return value && typeof value === "object" && value.ok === true && Object.prototype.hasOwnProperty.call(value, "data") ? value.data : value;
}
function rowsOf(value) {
  const data = unwrap(value);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}
function num(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function tokenText(value) { return Math.max(0, Math.round(num(value))).toLocaleString("tr-TR"); }
function moneyText(minor, currency = "TRY") {
  try { return new Intl.NumberFormat("tr-TR", { style: "currency", currency: currency || "TRY" }).format(num(minor) / 100); }
  catch { return `${(num(minor) / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ${currency || "TRY"}`; }
}
function amountToMinor(value) {
  const normalized = String(value ?? "").trim().replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}
function minorToInput(value) {
  if (value === null || value === undefined || value === "") return "";
  return (num(value) / 100).toFixed(2).replace(".", ",");
}
function dateInput(value) { return value ? String(value).slice(0, 10) : ""; }
function dateText(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("tr-TR");
}
function statusLabel(value) { return STATUS_OPTIONS.find(([key]) => key === value)?.[1] || value || "-"; }
function badgeClass(value) { return value === "ACTIVE" ? "ok" : value === "TRIAL" ? "warn" : "bad"; }
function formOf(row = {}) {
  return {
    packageCode: row.packageCode || "CUSTOM",
    status: row.status || "ACTIVE",
    includedTokens: row.includedTokens ?? 0,
    monthlyTokenLimit: row.monthlyTokenLimit ?? 0,
    baseMonthlyPrice: minorToInput(row.baseMonthlyPriceMinor ?? 0),
    customMonthlyPrice: row.customMonthlyPriceMinor === null || row.customMonthlyPriceMinor === undefined ? "" : minorToInput(row.customMonthlyPriceMinor),
    overagePricePerMillion: minorToInput(row.overagePricePerMillionMinor ?? 0),
    currency: row.currency || "TRY",
    periodStart: dateInput(row.periodStart),
    periodEnd: dateInput(row.periodEnd),
    nextRenewalAt: dateInput(row.nextRenewalAt),
    note: row.note || "",
  };
}

export default function AdminCompanyBilling({ activeMainCompany }) {
  const [companies, setCompanies] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(formOf());
  const [credit, setCredit] = useState({ tokens: "", note: "" });
  const [fee, setFee] = useState({ amount: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Firma paket ve AI kullanım bilgileri yükleniyor...");

  const loadList = useCallback(async () => {
    setBusy(true);
    try {
      const list = rowsOf(await apiGet("/admin/company-billing", { _ts: Date.now() }));
      setCompanies(list);
      setSelectedId((current) => list.some((row) => row.mainCompanyId === current)
        ? current
        : (activeMainCompany?.id && list.some((row) => row.mainCompanyId === activeMainCompany.id) ? activeMainCompany.id : list[0]?.mainCompanyId || ""));
      setMessage("Firma paket, token kullanımı ve ücret bilgileri güncel.");
    } catch (error) {
      setCompanies([]);
      setMessage(`Hata: ${error?.message || "Firma ücretlendirme bilgileri alınamadı."}`);
    } finally { setBusy(false); }
  }, [activeMainCompany?.id]);

  const loadDetail = useCallback(async (id) => {
    if (!id) { setDetail(null); return; }
    try {
      const value = unwrap(await apiGet(`/admin/company-billing/${encodeURIComponent(id)}`, { _ts: Date.now() }));
      setDetail(value || null);
      setForm(formOf(value || {}));
    } catch (error) {
      setDetail(null);
      setMessage(`Hata: ${error?.message || "Firma paket detayı alınamadı."}`);
    }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { loadDetail(selectedId); }, [selectedId, loadDetail]);

  const selected = useMemo(() => companies.find((row) => row.mainCompanyId === selectedId) || detail, [companies, selectedId, detail]);
  const usage = detail?.usage || selected?.usage || {};

  async function savePlan(event) {
    event?.preventDefault();
    if (!selectedId || busy) return;
    setBusy(true);
    try {
      const payload = {
        packageCode: String(form.packageCode || "CUSTOM").trim(),
        status: form.status,
        includedTokens: Math.max(0, Math.round(num(form.includedTokens))),
        monthlyTokenLimit: Math.max(0, Math.round(num(form.monthlyTokenLimit))),
        baseMonthlyPriceMinor: amountToMinor(form.baseMonthlyPrice),
        customMonthlyPriceMinor: String(form.customMonthlyPrice).trim() === "" ? null : amountToMinor(form.customMonthlyPrice),
        overagePricePerMillionMinor: amountToMinor(form.overagePricePerMillion),
        currency: String(form.currency || "TRY").toUpperCase().slice(0, 3),
        periodStart: form.periodStart,
        periodEnd: form.periodEnd,
        nextRenewalAt: form.nextRenewalAt,
        note: form.note,
      };
      await apiPut(`/admin/company-billing/${encodeURIComponent(selectedId)}`, payload);
      await Promise.all([loadList(), loadDetail(selectedId)]);
      setMessage("Firma paket, limit ve ücret ayarları kaydedildi. Kullanım geçmişi değiştirilmedi.");
    } catch (error) { setMessage(`Hata: ${error?.message || "Paket ayarları kaydedilemedi."}`); }
    finally { setBusy(false); }
  }

  async function addCredit(event) {
    event?.preventDefault();
    if (!selectedId || busy) return;
    const tokens = Math.round(num(credit.tokens));
    if (!tokens || !credit.note.trim()) return setMessage("Ek token/kredi hareketinde miktar ve açıklama zorunludur.");
    setBusy(true);
    try {
      await apiPost(`/admin/company-billing/${encodeURIComponent(selectedId)}/credit`, { tokens, note: credit.note.trim() });
      setCredit({ tokens: "", note: "" });
      await Promise.all([loadList(), loadDetail(selectedId)]);
      setMessage(`${tokens > 0 ? "Ek token/kredi" : "Token düzeltmesi"} hareketi geçmişe işlendi.`);
    } catch (error) { setMessage(`Hata: ${error?.message || "Token/kredi hareketi eklenemedi."}`); }
    finally { setBusy(false); }
  }

  async function addFee(event) {
    event?.preventDefault();
    if (!selectedId || busy) return;
    const amountMinor = amountToMinor(fee.amount);
    if (!amountMinor || !fee.note.trim()) return setMessage("Ücret düzeltmesinde tutar ve açıklama zorunludur.");
    setBusy(true);
    try {
      await apiPost(`/admin/company-billing/${encodeURIComponent(selectedId)}/fee-adjustment`, { amountMinor, note: fee.note.trim() });
      setFee({ amount: "", note: "" });
      await Promise.all([loadList(), loadDetail(selectedId)]);
      setMessage("Ücret düzeltmesi silinmez hareket olarak geçmişe işlendi.");
    } catch (error) { setMessage(`Hata: ${error?.message || "Ücret düzeltmesi eklenemedi."}`); }
    finally { setBusy(false); }
  }

  return <div className="admpro-page">
    <header className="admpro-head">
      <div><span className="admpro-kicker">YÖNETİM / FİRMA PAKET & KULLANIM</span><h2>Firma Ücretlendirme ve AI Token Kullanımı</h2><p>Firma paketi, aylık token limiti, gerçek Workers AI kullanımı, ek kredi ve dönem ücretleri tek merkezde.</p></div>
      <div className="admpro-actions"><button type="button" className="primary" onClick={loadList} disabled={busy}>Yenile</button></div>
    </header>
    <div className={`admpro-notice ${message.startsWith("Hata") ? "error" : "success"}`}>{message}</div>

    <section className="admpro-grid-2">
      <div className="admpro-card">
        <div className="admpro-card-head"><div><h3>Ana Firmalar</h3><p>Yalnız Uygulama Sahibi paket/fiyat yönetebilir.</p></div><span className="admpro-badge">{companies.length} firma</span></div>
        <div className="admpro-company-list">{companies.map((row) => <div key={row.mainCompanyId} className={`admpro-company-row ${row.mainCompanyId === selectedId ? "active" : ""}`}>
          <div role="button" tabIndex={0} onClick={() => setSelectedId(row.mainCompanyId)} onKeyDown={(event) => { if (event.key === "Enter") setSelectedId(row.mainCompanyId); }}>
            <strong>{row.companyName}</strong><small>{row.mainCompanySlug} · {row.packageCode} · {statusLabel(row.status)}</small>
          </div>
          <span className={`admpro-badge ${badgeClass(row.status)}`}>{tokenText(row.usage?.totalTokens)} token</span>
        </div>)}{!companies.length ? <div className="admpro-empty">Firma ücretlendirme kaydı bulunamadı.</div> : null}</div>
      </div>

      <div className="admpro-card">
        <div className="admpro-card-head"><div><h3>{selected?.companyName || "Firma"} · Dönem Özeti</h3><p>{detail ? `${dateInput(detail.periodStart)} → ${dateInput(detail.periodEnd)}` : "Firma seçin"}</p></div>{detail ? <span className={`admpro-badge ${badgeClass(detail.status)}`}>{statusLabel(detail.status)}</span> : null}</div>
        <div className="admpro-stats">
          <div className="admpro-stat"><span>Toplam Token</span><strong>{tokenText(usage.totalTokens)}</strong><small>Input {tokenText(usage.inputTokens)} · Output {tokenText(usage.outputTokens)}</small></div>
          <div className="admpro-stat"><span>Kalan Dahil Token</span><strong>{tokenText(usage.remainingTokens)}</strong><small>Ek kredi dahil: {tokenText(usage.availableTokens)}</small></div>
          <div className="admpro-stat"><span>Aşım Tokenı</span><strong>{tokenText(usage.overageTokens)}</strong><small>Aşım: {moneyText(usage.overageAmountMinor, detail?.currency)}</small></div>
          <div className="admpro-stat"><span>Dönem Tutarı</span><strong>{moneyText(usage.invoiceAmountMinor, detail?.currency)}</strong><small>{tokenText(usage.aiRequests)} AI isteği</small></div>
        </div>
        <div className="admpro-notice warn" style={{ marginTop: 10 }}>Aylık limit <b>0</b> ise sınırsızdır. AI kullanım satırları yalnız sunucunun gerçek provider <b>usage</b> bilgisinden oluşur; kullanıcı ekranından değiştirilemez veya silinemez.</div>
      </div>
    </section>

    {detail ? <form className="admpro-card" onSubmit={savePlan}>
      <div className="admpro-card-head"><div><h3>Paket, Limit ve Fiyat</h3><p>Firma özel fiyatı boşsa temel aylık fiyat uygulanır.</p></div><span className="admpro-badge">{detail.mainCompanySlug}</span></div>
      <div className="admpro-form-grid three">
        <label>Paket Kodu<input value={form.packageCode} onChange={(e) => setForm((old) => ({ ...old, packageCode: e.target.value }))} /></label>
        <label>Durum<select value={form.status} onChange={(e) => setForm((old) => ({ ...old, status: e.target.value }))}>{STATUS_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>Para Birimi<input maxLength={3} value={form.currency} onChange={(e) => setForm((old) => ({ ...old, currency: e.target.value.toUpperCase() }))} /></label>
        <label>Pakete Dahil Token<input type="number" min="0" step="1" value={form.includedTokens} onChange={(e) => setForm((old) => ({ ...old, includedTokens: e.target.value }))} /></label>
        <label>Aylık Sert Limit<input type="number" min="0" step="1" value={form.monthlyTokenLimit} onChange={(e) => setForm((old) => ({ ...old, monthlyTokenLimit: e.target.value }))} /></label>
        <label>1 Milyon Aşım Token Fiyatı<input inputMode="decimal" value={form.overagePricePerMillion} onChange={(e) => setForm((old) => ({ ...old, overagePricePerMillion: e.target.value }))} /></label>
        <label>Temel Aylık Fiyat<input inputMode="decimal" value={form.baseMonthlyPrice} onChange={(e) => setForm((old) => ({ ...old, baseMonthlyPrice: e.target.value }))} /></label>
        <label>Firma Özel Aylık Fiyat<input inputMode="decimal" placeholder="Boş = temel fiyat" value={form.customMonthlyPrice} onChange={(e) => setForm((old) => ({ ...old, customMonthlyPrice: e.target.value }))} /></label>
        <label>Sonraki Yenileme<input type="date" value={form.nextRenewalAt} onChange={(e) => setForm((old) => ({ ...old, nextRenewalAt: e.target.value }))} /></label>
        <label>Dönem Başlangıç<input type="date" value={form.periodStart} onChange={(e) => setForm((old) => ({ ...old, periodStart: e.target.value }))} /></label>
        <label>Dönem Bitiş<input type="date" value={form.periodEnd} onChange={(e) => setForm((old) => ({ ...old, periodEnd: e.target.value }))} /></label>
        <label className="wide">Not<textarea value={form.note} onChange={(e) => setForm((old) => ({ ...old, note: e.target.value }))} /></label>
      </div>
      <div className="admpro-actions" style={{ justifyContent: "flex-start", marginTop: 12 }}><button className="primary" type="submit" disabled={busy}>Paket Ayarlarını Kaydet</button></div>
    </form> : null}

    {detail ? <section className="admpro-grid-2">
      <form className="admpro-card" onSubmit={addCredit}><div className="admpro-card-head"><div><h3>Ek Token / Kredi</h3><p>Pozitif ek kredi, negatif kontrollü token düzeltmesidir.</p></div></div><div className="admpro-form-grid"><label>Token Miktarı<input type="number" step="1" value={credit.tokens} onChange={(e) => setCredit((old) => ({ ...old, tokens: e.target.value }))} /></label><label>Açıklama<input value={credit.note} onChange={(e) => setCredit((old) => ({ ...old, note: e.target.value }))} /></label></div><div className="admpro-actions" style={{ justifyContent: "flex-start", marginTop: 10 }}><button type="submit" className="primary" disabled={busy}>Harekete Ekle</button></div></form>
      <form className="admpro-card" onSubmit={addFee}><div className="admpro-card-head"><div><h3>Ücret Düzeltmesi</h3><p>Pozitif ek ücret, negatif indirim/düzeltme olarak dönem toplamına yansır.</p></div></div><div className="admpro-form-grid"><label>Tutar ({detail.currency})<input inputMode="decimal" value={fee.amount} onChange={(e) => setFee((old) => ({ ...old, amount: e.target.value }))} /></label><label>Açıklama<input value={fee.note} onChange={(e) => setFee((old) => ({ ...old, note: e.target.value }))} /></label></div><div className="admpro-actions" style={{ justifyContent: "flex-start", marginTop: 10 }}><button type="submit" className="primary" disabled={busy}>Harekete Ekle</button></div></form>
    </section> : null}

    {detail ? <section className="admpro-card"><div className="admpro-card-head"><div><h3>Kullanım / Kredi / Ücret Hareketleri</h3><p>Audit mantığında eklemeli geçmiş. Düzenleme ve silme endpointi yoktur.</p></div><span className="admpro-badge">{detail.movements?.length || 0} hareket</span></div><div className="admpro-table"><table><thead><tr><th>Tarih</th><th>Tip</th><th>Kaynak</th><th>Input</th><th>Output</th><th>Toplam</th><th>Kredi</th><th>Tutar</th><th>Açıklama</th></tr></thead><tbody>{(detail.movements || []).map((row) => <tr key={row.id}><td>{dateText(row.createdAt)}</td><td>{row.movementType}</td><td>{row.source}<small>{row.model || row.sourceRef || ""}</small></td><td>{tokenText(row.inputTokens)}</td><td>{tokenText(row.outputTokens)}</td><td>{tokenText(row.totalTokens)}</td><td>{num(row.creditTokensDelta).toLocaleString("tr-TR")}</td><td>{moneyText(row.amountMinor, detail.currency)}</td><td>{row.note || "-"}</td></tr>)}{!detail.movements?.length ? <tr><td colSpan="9">Henüz kullanım veya düzeltme hareketi yok.</td></tr> : null}</tbody></table></div></section> : null}

    {detail ? <section className="admpro-card"><div className="admpro-card-head"><div><h3>Aylık Kullanım Özeti</h3><p>Son 12 ayın gerçek AI token hareketleri.</p></div></div><div className="admpro-table"><table><thead><tr><th>Dönem</th><th>İstek</th><th>Input</th><th>Output</th><th>Toplam</th><th>Ek Kredi</th><th>Ücret Düzeltmesi</th></tr></thead><tbody>{(detail.monthlyUsage || []).map((row) => <tr key={row.periodKey}><td>{row.periodKey}</td><td>{tokenText(row.aiRequests)}</td><td>{tokenText(row.inputTokens)}</td><td>{tokenText(row.outputTokens)}</td><td>{tokenText(row.totalTokens)}</td><td>{num(row.creditTokensDelta).toLocaleString("tr-TR")}</td><td>{moneyText(row.feeAdjustmentMinor, detail.currency)}</td></tr>)}{!detail.monthlyUsage?.length ? <tr><td colSpan="7">Aylık kullanım hareketi henüz oluşmadı.</td></tr> : null}</tbody></table></div></section> : null}
  </div>;
}
