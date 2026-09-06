import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, CalendarRange, CheckSquare2, CircleDollarSign, RefreshCw, Save, WalletCards } from "lucide-react";
import { createOdemeCek, getOdemeCekOzeti } from "../../../services/cekOdemeApi";
import { apiGet, apiPatch, apiPost } from "../../../utils/api";
import "./quickAccountingBar.css";

const unwrap = (payload) => payload?.data?.data ?? payload?.data ?? payload ?? {};
const rowsOf = (payload) => {
  const value = unwrap(payload);
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.rows)) return value.rows;
  if (Array.isArray(value?.items)) return value.items;
  return [];
};
const objectOf = (payload) => {
  const value = unwrap(payload);
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
};
const today = () => new Date().toISOString().slice(0, 10);
const money = (value) => Number(value || 0).toLocaleString("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 });
const numberValue = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value || "").replace(/[₺\s]/g, "");
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

function paramsOf(activeMainCompany) {
  return {
    ...(activeMainCompany?.slug ? { mainCompanySlug: activeMainCompany.slug } : {}),
    ...(activeMainCompany?.id ? { mainCompanyId: activeMainCompany.id } : {}),
  };
}

function defaultTransactionType(firm = {}) {
  if (firm.customerReceivableTracking && !firm.supplierDebtTracking) return "COLLECTION";
  return "PAYMENT";
}

function defaultCheckDirection(firm = {}) {
  if (firm.customerReceivableTracking && !firm.supplierDebtTracking) return "RECEIVED";
  return "GIVEN";
}

function emptyPayment(companyId = "", firm = {}) {
  return {
    companyId,
    transactionType: defaultTransactionType(firm),
    date: today(),
    amount: "",
    paymentMethod: "TRANSFER",
    recordType: "RESMI",
    description: "",
  };
}

function emptyCheck(companyId = "", firm = {}) {
  return {
    firmId: companyId,
    issueDate: today(),
    dueDate: today(),
    bankName: "",
    accountNo: "",
    checkNo: "",
    amount: "",
    checkOwnership: "CUSTOMER_CHECK",
    checkDirection: defaultCheckDirection(firm),
    workType: "OFFICIAL",
    note: "",
    applyCariNow: true,
  };
}

function emptyFibe(company = {}) {
  return {
    fibeEnabled: Boolean(company.fibeEnabled),
    fibeRate: company.fibeRate ?? 0,
    fibeStartDate: company.fibeStartDate || today(),
    fibeOpeningAccrual: company.fibeOpeningAccrual ?? 0,
    fibeOpeningPaid: company.fibeOpeningPaid ?? 0,
    fibeNote: company.fibeNote || "",
  };
}

function labelOfMovement(row) {
  if (row.source === "FIBE") return row.transactionType === "PAYMENT" ? "FİBE ödeme" : "FİBE hareket";
  if (row.transactionType === "PAYMENT") return "Ödeme";
  if (row.transactionType === "COLLECTION") return "Tahsilat";
  if (row.transactionType === "DEBIT") return "Borç";
  if (row.transactionType === "CREDIT") return "Alacak";
  return row.movementType || "Cari";
}

export default function QuickAccountingBar({ activeMainCompany, refreshKey = 0, reloadAll }) {
  const params = useMemo(() => paramsOf(activeMainCompany), [activeMainCompany]);
  const [mode, setMode] = useState("WEEK");
  const [firms, setFirms] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [week, setWeek] = useState({ summary: {}, debts: [], receivables: [], movements: [] });
  const [checks, setChecks] = useState([]);
  const [fibe, setFibe] = useState({ summary: {}, movements: [] });
  const [payment, setPayment] = useState(emptyPayment());
  const [checkForm, setCheckForm] = useState(emptyCheck());
  const [fibeDraft, setFibeDraft] = useState(emptyFibe());
  const [fibePayment, setFibePayment] = useState({ date: today(), amount: "", paymentMethod: "CASH", description: "" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const selected = useMemo(() => firms.find((row) => String(row.id) === String(selectedId)) || null, [firms, selectedId]);

  const loadFirms = useCallback(async () => {
    const [firmPayload, profilePayload] = await Promise.all([
      apiGet("/muhasebe/firmalar", { ...params, limit: 10000, _ts: Date.now() }),
      apiGet("/muhasebe/firma-profilleri", { ...params, _ts: Date.now() }),
    ]);
    const profileById = new Map(rowsOf(profilePayload).map((row) => [String(row.id), row]));
    const merged = rowsOf(firmPayload).map((row) => ({ ...row, ...(profileById.get(String(row.id)) || {}) }));
    setFirms(merged);
    setSelectedId((current) => current && merged.some((row) => String(row.id) === String(current)) ? current : "");
  }, [params]);

  const loadWeek = useCallback(async () => {
    const payload = await apiGet("/muhasebe/hizli-cari/hafta", { ...params, _ts: Date.now() });
    setWeek(objectOf(payload));
  }, [params]);

  const loadChecks = useCallback(async () => {
    const payload = await getOdemeCekOzeti({ ...params, _ts: Date.now() });
    setChecks(Array.isArray(payload?.rows) ? payload.rows : []);
  }, [params]);

  const loadFibe = useCallback(async (companyId) => {
    if (!companyId) {
      setFibe({ summary: {}, movements: [] });
      return;
    }
    const payload = objectOf(await apiGet(`/muhasebe/fibe/${companyId}`, { ...params, limit: 300, _ts: Date.now() }));
    setFibe(payload);
  }, [params]);

  const refresh = useCallback(async () => {
    try {
      await Promise.all([loadFirms(), loadWeek(), loadChecks()]);
      if (selectedId) await loadFibe(selectedId);
    } catch (error) {
      setNotice(error?.message || "Hızlı muhasebe verileri yenilenemedi.");
    }
  }, [loadChecks, loadFibe, loadFirms, loadWeek, selectedId]);

  useEffect(() => { refresh(); }, [refresh, refreshKey]);

  useEffect(() => {
    setPayment(emptyPayment(selectedId, selected || {}));
    setCheckForm(emptyCheck(selectedId, selected || {}));
    if (selected) setFibeDraft(emptyFibe(selected));
    loadFibe(selectedId).catch(() => {});
  }, [loadFibe, selected, selectedId]);

  const savePayment = async () => {
    if (!selectedId || numberValue(payment.amount) <= 0) return setNotice("Firma ve tutar zorunludur.");
    setBusy(true);
    setNotice("");
    try {
      await apiPost("/muhasebe/hizli-cari/hareket", { ...params, ...payment, companyId: selectedId, amount: numberValue(payment.amount) });
      setPayment(emptyPayment(selectedId, selected || {}));
      setNotice(payment.transactionType === "COLLECTION" ? "Tahsilat cariye işlendi." : "Ödeme cariye işlendi.");
      await refresh();
      reloadAll?.();
    } catch (error) {
      setNotice(error?.message || "Cari işlem kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const saveCheck = async () => {
    if (!selectedId || !checkForm.checkNo.trim() || !checkForm.bankName.trim() || numberValue(checkForm.amount) <= 0) {
      return setNotice("Çek için firma, banka, çek no ve tutar zorunludur.");
    }
    setBusy(true);
    setNotice("");
    try {
      const created = await createOdemeCek({ ...params, ...checkForm, firmId: selectedId, amount: numberValue(checkForm.amount) });
      const checkId = created?.id;
      if (checkId && checkForm.applyCariNow) {
        await apiPost(`/muhasebe/hizli-cari/cek/${checkId}/mahsup`, {
          ...params,
          companyId: selectedId,
          checkDirection: checkForm.checkDirection,
          amount: numberValue(checkForm.amount),
          workType: checkForm.workType,
          stage: "ENTRY",
          issueDate: checkForm.issueDate,
          note: checkForm.note,
        });
      }
      setCheckForm(emptyCheck(selectedId, selected || {}));
      setNotice(checkForm.applyCariNow ? "Çek kaydedildi ve cari tek sefer mahsup edildi." : "Çek açık olarak kaydedildi; cari henüz değişmedi.");
      await refresh();
      reloadAll?.();
    } catch (error) {
      setNotice(error?.message || "Çek kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const closeCheck = async (row) => {
    setBusy(true);
    setNotice("");
    try {
      await apiPost(`/muhasebe/hizli-cari/cek/${row.id}/kapat`, {
        ...params,
        companyId: row.firmId || row.companyId,
        checkDirection: row.checkDirection,
        amount: row.amount,
        workType: row.workType,
        date: today(),
      });
      setNotice("Çek kapatıldı. Daha önce cari mahsup varsa ikinci kez düşülmedi.");
      await refresh();
      reloadAll?.();
    } catch (error) {
      setNotice(error?.message || "Çek kapatılamadı.");
    } finally {
      setBusy(false);
    }
  };

  const saveFibeSettings = async () => {
    if (!selectedId) return setNotice("Önce firma seçin.");
    setBusy(true);
    setNotice("");
    try {
      await apiPatch(`/muhasebe/firma-profilleri/${selectedId}`, { ...params, ...fibeDraft });
      setNotice("FİBE firma ayarı ve başlangıç bakiyesi kaydedildi.");
      await refresh();
      await loadFibe(selectedId);
      reloadAll?.();
    } catch (error) {
      setNotice(error?.message || "FİBE ayarı kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const saveFibePayment = async () => {
    if (!selectedId || numberValue(fibePayment.amount) <= 0) return setNotice("FİBE ödeme tutarı zorunludur.");
    setBusy(true);
    setNotice("");
    try {
      await apiPost(`/muhasebe/fibe/${selectedId}/hareketler`, {
        ...params,
        movementType: "PAYMENT",
        date: fibePayment.date,
        amount: numberValue(fibePayment.amount),
        paymentMethod: fibePayment.paymentMethod,
        description: fibePayment.description,
      });
      setFibePayment({ date: today(), amount: "", paymentMethod: "CASH", description: "" });
      setNotice("FİBE ödemesi ayrı FİBE hesabına işlendi; normal cari değişmedi.");
      await refresh();
      await loadFibe(selectedId);
      reloadAll?.();
    } catch (error) {
      setNotice(error?.message || "FİBE ödemesi kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const selectedChecks = useMemo(() => checks.filter((row) => !selectedId || String(row.firmId || row.companyId) === String(selectedId)), [checks, selectedId]);

  return (
    <section className="qab-root">
      <header className="qab-head">
        <div>
          <span>Hızlı Muhasebe</span>
          <strong>Günlük giriş ve haftalık kontrol</strong>
        </div>
        <div className="qab-actions">
          <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
            <option value="">Firma seç</option>
            {firms.map((firm) => <option key={firm.id} value={firm.id}>{firm.companyName || firm.firmaAdi || firm.name}</option>)}
          </select>
          <button type="button" onClick={refresh}><RefreshCw size={15} /> Yenile</button>
        </div>
      </header>

      {selected ? (
        <div className="qab-company-line">
          <strong>{selected.companyName || selected.firmaAdi || selected.name}</strong>
          <span>Normal cari: <b className={Number(selected.currentBalance || 0) < 0 ? "negative" : "positive"}>{money(selected.currentBalance)}</b></span>
          <span>{selected.fibeEnabled ? `FİBE açık · %${Number(selected.fibeRate || 0)}` : "FİBE kapalı"}</span>
        </div>
      ) : null}

      <nav className="qab-tabs">
        <button type="button" className={mode === "WEEK" ? "active" : ""} onClick={() => setMode("WEEK")}><CalendarRange size={16} /> Bu Hafta</button>
        <button type="button" className={mode === "PAYMENT" ? "active" : ""} onClick={() => setMode("PAYMENT")}><Banknote size={16} /> Ödeme / Tahsilat</button>
        <button type="button" className={mode === "CHECK" ? "active" : ""} onClick={() => setMode("CHECK")}><CheckSquare2 size={16} /> Hızlı Çek</button>
        <button type="button" className={mode === "FIBE" ? "active" : ""} onClick={() => setMode("FIBE")}><CircleDollarSign size={16} /> FİBE</button>
      </nav>

      {notice ? <div className="qab-notice">{notice}</div> : null}

      {mode === "WEEK" ? (
        <div className="qab-panel">
          <div className="qab-summary">
            <div><span>Toplam normal borç</span><strong>{money(week.summary?.normalPayable)}</strong></div>
            <div><span>Toplam normal alacak</span><strong>{money(week.summary?.normalReceivable)}</strong></div>
            <div><span>Bu hafta gelen</span><strong>{money(week.summary?.incoming)}</strong></div>
            <div><span>Bu hafta giden</span><strong>{money(week.summary?.outgoing)}</strong></div>
            <div><span>Elden çıkan</span><strong>{money(week.summary?.cashOutgoing)}</strong></div>
            <div><span>FİBE kalan</span><strong>{money(week.summary?.fibeRemaining)}</strong></div>
          </div>
          <div className="qab-week-grid">
            <div className="qab-list"><h4>Ödenecek cariler</h4>{(week.debts || []).slice(0, 8).map((row) => <div key={row.id}><span>{row.name}</span><b>{money(Math.abs(row.balance))}</b></div>)}</div>
            <div className="qab-list"><h4>Son hareketler</h4>{(week.movements || []).slice(0, 10).map((row) => <div key={`${row.source}-${row.id}`}><span>{row.date} · {row.companyName} · {labelOfMovement(row)}{row.paymentMethod ? ` · ${row.paymentMethod === "CASH" ? "Elden" : row.paymentMethod}` : ""}</span><b>{money(row.amount)}</b></div>)}</div>
          </div>
        </div>
      ) : null}

      {mode === "PAYMENT" ? (
        <div className="qab-panel qab-form-grid">
          <label>İşlem<select value={payment.transactionType} onChange={(e) => setPayment((v) => ({ ...v, transactionType: e.target.value }))}>{!selected || selected.supplierDebtTracking ? <option value="PAYMENT">Firmaya ödeme</option> : null}{!selected || selected.customerReceivableTracking ? <option value="COLLECTION">Firmadan tahsilat</option> : null}</select></label>
          <label>Tarih<input type="date" value={payment.date} onChange={(e) => setPayment((v) => ({ ...v, date: e.target.value }))} /></label>
          <label>Tutar<input value={payment.amount} onChange={(e) => setPayment((v) => ({ ...v, amount: e.target.value }))} placeholder="0,00" /></label>
          <label>Ödeme şekli<select value={payment.paymentMethod} onChange={(e) => setPayment((v) => ({ ...v, paymentMethod: e.target.value }))}><option value="TRANSFER">Banka / Havale</option><option value="CASH">Elden</option><option value="CARD">Kart</option><option value="CHECK">Çek</option><option value="OTHER">Diğer</option></select></label>
          <label>Kayıt<select value={payment.recordType} onChange={(e) => setPayment((v) => ({ ...v, recordType: e.target.value }))}><option value="RESMI">Resmî</option><option value="GAYRI_RESMI">İç kayıt</option></select></label>
          <label className="wide">Açıklama<input value={payment.description} onChange={(e) => setPayment((v) => ({ ...v, description: e.target.value }))} /></label>
          <div className="qab-submit"><button type="button" disabled={busy || !selectedId} onClick={savePayment}><Save size={15} /> Cari İşlemi Kaydet</button></div>
        </div>
      ) : null}

      {mode === "CHECK" ? (
        <div className="qab-panel">
          <div className="qab-form-grid">
            <label>Çek yönü<select value={checkForm.checkDirection} onChange={(e) => setCheckForm((v) => ({ ...v, checkDirection: e.target.value }))}>{!selected || selected.supplierDebtTracking ? <option value="GIVEN">Verilen çek</option> : null}{!selected || selected.customerReceivableTracking ? <option value="RECEIVED">Alınan çek</option> : null}</select></label>
            <label>Çek no<input value={checkForm.checkNo} onChange={(e) => setCheckForm((v) => ({ ...v, checkNo: e.target.value }))} /></label>
            <label>Banka<input value={checkForm.bankName} onChange={(e) => setCheckForm((v) => ({ ...v, bankName: e.target.value }))} /></label>
            <label>Hesap no<input value={checkForm.accountNo} onChange={(e) => setCheckForm((v) => ({ ...v, accountNo: e.target.value }))} /></label>
            <label>Çek tarihi<input type="date" value={checkForm.issueDate} onChange={(e) => setCheckForm((v) => ({ ...v, issueDate: e.target.value }))} /></label>
            <label>Vade<input type="date" value={checkForm.dueDate} onChange={(e) => setCheckForm((v) => ({ ...v, dueDate: e.target.value }))} /></label>
            <label>Tutar<input value={checkForm.amount} onChange={(e) => setCheckForm((v) => ({ ...v, amount: e.target.value }))} /></label>
            <label>Kayıt<select value={checkForm.workType} onChange={(e) => setCheckForm((v) => ({ ...v, workType: e.target.value }))}><option value="OFFICIAL">Resmî</option><option value="UNOFFICIAL">İç kayıt</option></select></label>
            <label className="wide">Not<input value={checkForm.note} onChange={(e) => setCheckForm((v) => ({ ...v, note: e.target.value }))} /></label>
            <label className="wide qab-check"><input type="checkbox" checked={checkForm.applyCariNow} onChange={(e) => setCheckForm((v) => ({ ...v, applyCariNow: e.target.checked }))} /> Çeki kaydederken normal cariyi de şimdi mahsup et</label>
            <div className="qab-submit"><button type="button" disabled={busy || !selectedId} onClick={saveCheck}><CheckSquare2 size={15} /> Çeki Kaydet</button></div>
          </div>
          <div className="qab-list qab-check-list"><h4>Açık çekler</h4>{selectedChecks.filter((row) => row.open !== false).slice(0, 12).map((row) => <div key={row.id}><span>{row.dueDate} · {row.firmaAdi || "Firma"} · {row.checkNo} · {row.bankName}</span><b>{money(row.amount)}</b><button type="button" disabled={busy} onClick={() => closeCheck(row)}>{row.checkDirection === "RECEIVED" ? "Tahsil edildi" : "Ödendi"}</button></div>)}</div>
        </div>
      ) : null}

      {mode === "FIBE" ? (
        <div className="qab-panel">
          {!selected ? <div className="qab-empty">FİBE için firma seçin.</div> : (
            <>
              <div className="qab-form-grid">
                <label className="wide qab-check"><input type="checkbox" checked={fibeDraft.fibeEnabled} onChange={(e) => setFibeDraft((v) => ({ ...v, fibeEnabled: e.target.checked }))} /> Bu firmada FİBE takibini aç</label>
                <label>FİBE oranı %<input type="number" min="0" max="100" step="0.01" value={fibeDraft.fibeRate} onChange={(e) => setFibeDraft((v) => ({ ...v, fibeRate: e.target.value }))} /></label>
                <label>FİBE başlangıç tarihi<input type="date" value={fibeDraft.fibeStartDate} onChange={(e) => setFibeDraft((v) => ({ ...v, fibeStartDate: e.target.value }))} /></label>
                <label>Başlangıç hakedişi<input value={fibeDraft.fibeOpeningAccrual} onChange={(e) => setFibeDraft((v) => ({ ...v, fibeOpeningAccrual: e.target.value }))} /></label>
                <label>Başlangıç ödenen<input value={fibeDraft.fibeOpeningPaid} onChange={(e) => setFibeDraft((v) => ({ ...v, fibeOpeningPaid: e.target.value }))} /></label>
                <label className="wide">FİBE notu<input value={fibeDraft.fibeNote} onChange={(e) => setFibeDraft((v) => ({ ...v, fibeNote: e.target.value }))} /></label>
                <div className="qab-submit"><button type="button" disabled={busy} onClick={saveFibeSettings}><Save size={15} /> Firma FİBE Ayarını Kaydet</button></div>
              </div>
              {fibe.summary?.enabled ? (
                <>
                  <div className="qab-summary fibe">
                    <div><span>Gelen KDV referansı</span><strong>{money(fibe.summary.incomingVatTotal)}</strong></div>
                    <div><span>Otomatik FİBE</span><strong>{money(fibe.summary.automaticAccrual)}</strong></div>
                    <div><span>Toplam hakediş</span><strong>{money(fibe.summary.totalAccrual)}</strong></div>
                    <div><span>Toplam ödenen</span><strong>{money(fibe.summary.totalPaid)}</strong></div>
                    <div><span>FİBE kalan</span><strong>{money(fibe.summary.remainingBalance)}</strong></div>
                  </div>
                  <div className="qab-form-grid fibe-pay">
                    <label>Ödeme tarihi<input type="date" value={fibePayment.date} onChange={(e) => setFibePayment((v) => ({ ...v, date: e.target.value }))} /></label>
                    <label>Tutar<input value={fibePayment.amount} onChange={(e) => setFibePayment((v) => ({ ...v, amount: e.target.value }))} /></label>
                    <label>Ödeme şekli<select value={fibePayment.paymentMethod} onChange={(e) => setFibePayment((v) => ({ ...v, paymentMethod: e.target.value }))}><option value="CASH">Elden</option><option value="TRANSFER">Banka / Havale</option><option value="CHECK">Çek</option><option value="OTHER">Diğer</option></select></label>
                    <label>Açıklama<input value={fibePayment.description} onChange={(e) => setFibePayment((v) => ({ ...v, description: e.target.value }))} /></label>
                    <div className="qab-submit"><button type="button" disabled={busy} onClick={saveFibePayment}><WalletCards size={15} /> FİBE Ödemesi Kaydet</button></div>
                  </div>
                </>
              ) : <div className="qab-empty">FİBE kapalı. Yalnız bu firmada kullanmak için yukarıdan açıp kaydedin.</div>}
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
