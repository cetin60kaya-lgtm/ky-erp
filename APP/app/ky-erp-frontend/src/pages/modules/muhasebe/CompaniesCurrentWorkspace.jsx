import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CircleAlert,
  CirclePlus,
  RefreshCcw,
  Search,
  X,
} from "lucide-react";
import { apiGet, apiPost } from "../../../utils/api";
import "./companiesCurrentWorkspace.css";

const ACCOUNTING_RESET_MARKER = "[[ACC_RESET_2026_08]]";
const unwrap = (payload) => payload?.data?.data ?? payload?.data ?? payload ?? {};
const listOf = (payload) => {
  const value = unwrap(payload);
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.rows)) return value.rows;
  return [];
};
const money = (value) =>
  Number(value || 0).toLocaleString("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  });
const dateText = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? String(value).slice(0, 10)
    : parsed.toLocaleDateString("tr-TR");
};
const normalize = (value) => String(value || "").trim().toLocaleUpperCase("tr-TR");

function roleLabel(row) {
  const value = normalize(`${row.type || ""} ${row.companyType || ""}`);
  if (/BOTH|CUSTOMER.*SUPPLIER|SUPPLIER.*CUSTOMER|HER IKISI/.test(value)) return "Müşteri ve tedarikçi";
  if (/SUPPLIER|TEDARIK|SATICI|VENDOR/.test(value)) return "Tedarikçi";
  return "Müşteri";
}

function movementTypeLabel(value) {
  const key = normalize(value);
  if (/TAHSIL/.test(key)) return "Tahsilat";
  if (/ODEME/.test(key)) return "Ödeme";
  if (/FATURA/.test(key)) return "Fatura";
  if (/BORC/.test(key)) return "Borç";
  if (/ALACAK/.test(key)) return "Alacak";
  return value || "Cari işlem";
}

function emptyTransaction() {
  return {
    date: new Date().toISOString().slice(0, 10),
    transactionType: "DEBIT",
    amount: "",
    recordType: "RESMI",
    description: "",
  };
}

export default function CompaniesCurrentWorkspace({ activeMainCompany, refreshKey = 0 }) {
  const [firms, setFirms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("ALL");
  const [balanceFilter, setBalanceFilter] = useState("ALL");
  const [selected, setSelected] = useState(null);
  const [movements, setMovements] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [transactionOpen, setTransactionOpen] = useState(false);
  const [transaction, setTransaction] = useState(emptyTransaction);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const params = useMemo(
    () => ({
      mainCompanySlug: activeMainCompany?.slug,
      mainCompanyId: activeMainCompany?.id,
    }),
    [activeMainCompany?.id, activeMainCompany?.slug],
  );

  const loadFirms = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await apiGet("/muhasebe/firmalar", {
        ...params,
        search: query,
        limit: 10000,
        _ts: Date.now(),
      });
      setFirms(listOf(payload));
    } catch (requestError) {
      setFirms([]);
      setError(requestError?.message || "Firma ve cari listesi alınamadı.");
    } finally {
      setLoading(false);
    }
  }, [params, query]);

  useEffect(() => {
    const timer = window.setTimeout(loadFirms, 160);
    return () => window.clearTimeout(timer);
  }, [loadFirms, refreshKey]);

  const visibleFirms = useMemo(
    () =>
      firms.filter((firm) => {
        if (String(firm.note || "").includes(ACCOUNTING_RESET_MARKER)) return false;
        const firmRole = roleLabel(firm);
        const balance = Number(firm.currentBalance || 0);
        if (role === "CUSTOMER" && !/Müşteri/.test(firmRole)) return false;
        if (role === "SUPPLIER" && !/tedarikçi/i.test(firmRole)) return false;
        if (role === "CHEMICAL" && !firm.isChemicalSupplier) return false;
        if (balanceFilter === "RECEIVABLE" && balance <= 0) return false;
        if (balanceFilter === "PAYABLE" && balance >= 0) return false;
        if (balanceFilter === "ZERO" && balance !== 0) return false;
        return true;
      }),
    [balanceFilter, firms, role],
  );

  const totals = useMemo(() => {
    const receivable = visibleFirms
      .filter((firm) => Number(firm.currentBalance || 0) > 0)
      .reduce((sum, firm) => sum + Number(firm.currentBalance || 0), 0);
    const payable = visibleFirms
      .filter((firm) => Number(firm.currentBalance || 0) < 0)
      .reduce((sum, firm) => sum + Math.abs(Number(firm.currentBalance || 0)), 0);
    return { receivable, payable, balance: receivable - payable };
  }, [visibleFirms]);

  const loadMovements = useCallback(
    async (firm) => {
      setSelected(firm);
      setDetailLoading(true);
      setMovements([]);
      setNotice("");
      try {
        const payload = await apiGet("/muhasebe/cari-hareketler", {
          ...params,
          companyId: firm.id,
          limit: 500,
          _ts: Date.now(),
        });
        setMovements(listOf(payload));
      } catch (requestError) {
        setNotice(requestError?.message || "Cari hareketler alınamadı.");
      } finally {
        setDetailLoading(false);
      }
    },
    [params],
  );

  const saveTransaction = async () => {
    if (!selected?.id || Number(transaction.amount || 0) <= 0) {
      setNotice("Sıfırdan büyük işlem tutarı zorunludur.");
      return;
    }
    setSaving(true);
    setNotice("");
    try {
      await apiPost("/muhasebe/cari-hareketler", {
        ...params,
        companyId: selected.id,
        date: transaction.date,
        transactionType: transaction.transactionType,
        amount: Number(transaction.amount || 0),
        recordType: transaction.recordType,
        description: transaction.description,
      });
      setTransaction(emptyTransaction());
      setTransactionOpen(false);
      setNotice("Cari işlem kaydedildi ve firma bakiyesi güncellendi.");
      await Promise.all([loadFirms(), loadMovements(selected)]);
    } catch (requestError) {
      setNotice(requestError?.message || "Cari işlem kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="ccw-root">
      <header className="ccw-toolbar">
        <label className="ccw-search">
          <Search size={17} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Firma adı veya vergi no ara" />
        </label>
        <select value={role} onChange={(event) => setRole(event.target.value)}>
          <option value="ALL">Tüm firma türleri</option>
          <option value="CUSTOMER">Müşteriler</option>
          <option value="SUPPLIER">Tedarikçiler</option>
          <option value="CHEMICAL">Boya / kimyasal tedarikçileri</option>
        </select>
        <select value={balanceFilter} onChange={(event) => setBalanceFilter(event.target.value)}>
          <option value="ALL">Tüm bakiyeler</option>
          <option value="RECEIVABLE">Alacak bakiyesi</option>
          <option value="PAYABLE">Borç bakiyesi</option>
          <option value="ZERO">Sıfır bakiye</option>
        </select>
        <button type="button" onClick={loadFirms}><RefreshCcw size={16} /> Yenile</button>
      </header>

      <section className="ccw-summary">
        <div><span>Firma</span><strong>{visibleFirms.length}</strong></div>
        <div><span>Toplam alacak</span><strong>{money(totals.receivable)}</strong></div>
        <div><span>Toplam borç</span><strong>{money(totals.payable)}</strong></div>
        <div className={totals.balance >= 0 ? "success" : "danger"}><span>Net bakiye</span><strong>{money(totals.balance)}</strong></div>
      </section>

      {error ? <div className="ccw-error"><CircleAlert size={18} /> {error}</div> : null}

      <section className="ccw-table-card">
        {loading ? (
          <div className="ccw-empty">Firmalar yükleniyor…</div>
        ) : visibleFirms.length ? (
          <div className="ccw-table-wrap">
            <table>
              <thead><tr><th>Firma</th><th>Tür</th><th>Vergi No</th><th>Telefon</th><th>Mail</th><th>Bakiye</th><th>Kayıt</th><th>Durum</th></tr></thead>
              <tbody>
                {visibleFirms.map((firm) => (
                  <tr key={firm.id} onClick={() => loadMovements(firm)} tabIndex={0}>
                    <td><strong>{firm.firmaAdi || firm.name || "-"}</strong>{firm.isChemicalSupplier ? <small>Boya / kimyasal</small> : null}</td>
                    <td>{roleLabel(firm)}</td>
                    <td>{firm.taxNo || "-"}</td>
                    <td>{firm.phone || "-"}</td>
                    <td>{firm.email || "-"}</td>
                    <td><strong className={Number(firm.currentBalance || 0) >= 0 ? "positive" : "negative"}>{money(firm.currentBalance)}</strong></td>
                    <td>{normalize(firm.defaultRecordType).includes("UNOFFICIAL") || normalize(firm.defaultRecordType).includes("GAYRI") ? "Gayri resmî" : "Resmî"}</td>
                    <td>{firm.isActive === false ? "Pasif" : "Aktif"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="ccw-empty">
            <strong>Ağustos 2026 temiz başlangıç hazır.</strong>
            <span>Yeni firma, fatura, irsaliye veya cari hareket girdikçe ilgili firma burada yeniden görünecek.</span>
          </div>
        )}
      </section>

      {selected ? (
        <div className="ccw-drawer-layer" role="presentation" onMouseDown={() => setSelected(null)}>
          <aside className="ccw-drawer" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div><h2>{selected.firmaAdi || selected.name}</h2><p>{roleLabel(selected)} · {selected.taxNo || "Vergi no yok"}</p></div>
              <div className="ccw-drawer-actions">
                <button type="button" className="primary" onClick={() => setTransactionOpen((value) => !value)}><CirclePlus size={16} /> İşlem</button>
                <button type="button" className="icon" onClick={() => setSelected(null)} aria-label="Kapat"><X size={20} /></button>
              </div>
            </header>
            <div className="ccw-drawer-body">
              {notice ? <div className="ccw-notice" role="status">{notice}</div> : null}
              <section className="ccw-detail-summary">
                <div><span>Bakiye</span><strong>{money(selected.currentBalance)}</strong></div>
                <div><span>Açılış bakiyesi</span><strong>{money(selected.openingBalance)}</strong></div>
                <div><span>Telefon</span><strong>{selected.phone || "-"}</strong></div>
                <div><span>Mail</span><strong>{selected.email || "-"}</strong></div>
                <div><span>Adres</span><strong>{selected.address || "-"}</strong></div>
                <div><span>Lot takibi</span><strong>{selected.isChemicalSupplier ? "Aktif" : "Yok"}</strong></div>
              </section>

              {transactionOpen ? (
                <section className="ccw-transaction">
                  <header><h3>Yeni cari işlem</h3><button type="button" onClick={() => setTransactionOpen(false)}><X size={16} /></button></header>
                  <div>
                    <label>Tarih<input type="date" value={transaction.date} onChange={(event) => setTransaction((current) => ({ ...current, date: event.target.value }))} /></label>
                    <label>İşlem<select value={transaction.transactionType} onChange={(event) => setTransaction((current) => ({ ...current, transactionType: event.target.value }))}><option value="DEBIT">Borç ekle</option><option value="CREDIT">Alacak ekle</option><option value="PAYMENT">Ödeme</option><option value="COLLECTION">Tahsilat</option></select></label>
                    <label>Tutar<input type="number" min="0" step="0.01" value={transaction.amount} onChange={(event) => setTransaction((current) => ({ ...current, amount: event.target.value }))} /></label>
                    <label>Kayıt türü<select value={transaction.recordType} onChange={(event) => setTransaction((current) => ({ ...current, recordType: event.target.value }))}><option value="RESMI">Resmî</option><option value="GAYRI_RESMI">Gayri resmî</option></select></label>
                    <label className="wide">Açıklama<input value={transaction.description} onChange={(event) => setTransaction((current) => ({ ...current, description: event.target.value }))} /></label>
                  </div>
                  <footer><button type="button" disabled={saving} onClick={saveTransaction}>Kaydet</button></footer>
                </section>
              ) : null}

              <section className="ccw-section">
                <header><h3>Cari hareketler</h3><span>{movements.length} kayıt</span></header>
                {detailLoading ? <div className="ccw-empty">Hareketler yükleniyor…</div> : movements.length ? (
                  <div className="ccw-table-wrap compact"><table><thead><tr><th>Tarih</th><th>İşlem</th><th>Belge No</th><th>Açıklama</th><th>Borç</th><th>Alacak</th><th>Bakiye</th><th>Kayıt</th></tr></thead><tbody>{movements.map((movement) => <tr key={movement.id}><td>{dateText(movement.movement_date || movement.date)}</td><td>{movementTypeLabel(movement.movement_type || movement.type)}</td><td>{movement.document_no || "-"}</td><td>{movement.description || "-"}</td><td>{money(movement.debit)}</td><td>{money(movement.credit)}</td><td><strong>{money(movement.balance_after)}</strong></td><td>{normalize(movement.record_type).includes("GAYRI") ? "Gayri resmî" : "Resmî"}</td></tr>)}</tbody></table></div>
                ) : <div className="ccw-empty">Bu firma için cari hareket bulunamadı.</div>}
              </section>
            </div>
          </aside>
        </div>
      ) : null}
    </section>
  );
}
