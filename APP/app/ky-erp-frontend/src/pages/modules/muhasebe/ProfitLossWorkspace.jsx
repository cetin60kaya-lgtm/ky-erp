import { useCallback, useEffect, useMemo, useState } from "react";
import { CirclePlus, RefreshCcw, Search, X } from "lucide-react";
import { apiGet, apiPost } from "../../../utils/api";
import "./profitLossWorkspace.css";

const CATEGORIES = [
  "Boya",
  "Tiner",
  "Gaz",
  "Sprey",
  "Sim",
  "Kumaş / Yardımcı Malzeme",
  "Dış Hizmet",
  "Personel",
  "Yemek",
  "Kira",
  "Elektrik",
  "Su",
  "İnternet",
  "Araç",
  "Muhasebe",
  "Banka Masrafı",
  "Diğer",
];

const unwrap = (payload) => payload?.data?.data ?? payload?.data ?? payload ?? {};
const money = (value) =>
  Number(value || 0).toLocaleString("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  });
const dateText = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value).slice(0, 10) : parsed.toLocaleDateString("tr-TR");
};
const iso = (date) => date.toISOString().slice(0, 10);

function defaultPeriod() {
  const now = new Date();
  return {
    startDate: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
    endDate: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

function emptyForm() {
  return {
    date: new Date().toISOString().slice(0, 10),
    companyName: "",
    category: "Diğer",
    amount: "",
    vatAmount: "",
    recordType: "RESMI",
    description: "",
    recurring: false,
  };
}

function typeLabel(value) {
  return value === "INCOME" ? "Gelir" : "Gider";
}

export default function ProfitLossWorkspace({ activeMainCompany, refreshKey }) {
  const [period, setPeriod] = useState(defaultPeriod);
  const [state, setState] = useState({ loading: true, error: "", data: {} });
  const [query, setQuery] = useState("");
  const [type, setType] = useState("ALL");
  const [recordType, setRecordType] = useState("ALL");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const params = useMemo(
    () => ({
      mainCompanySlug: activeMainCompany?.slug,
      mainCompanyId: activeMainCompany?.id,
      ...period,
    }),
    [activeMainCompany?.id, activeMainCompany?.slug, period],
  );

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const response = await apiGet("/muhasebe/accounting/reports/records", {
        ...params,
        _ts: Date.now(),
      });
      setState({ loading: false, error: "", data: unwrap(response) });
    } catch (error) {
      setState({
        loading: false,
        error: error?.message || "Gelir ve gider kayıtları alınamadı.",
        data: {},
      });
    }
  }, [params]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const records = useMemo(() => {
    const source = Array.isArray(state.data?.records) ? state.data.records : [];
    const term = query.trim().toLocaleLowerCase("tr-TR");
    return source.filter((row) => {
      if (row.reportIncluded === false || row.reportStatus === "HARIC" || row.sourceType === "CURRENT_ACCOUNT") return false;
      if (type !== "ALL" && row.type !== type) return false;
      if (recordType !== "ALL" && String(row.recordType || "RESMI").toUpperCase() !== recordType) return false;
      if (!term) return true;
      return `${row.companyName || ""} ${row.documentNo || ""} ${row.category || ""} ${row.description || ""}`
        .toLocaleLowerCase("tr-TR")
        .includes(term);
    });
  }, [query, recordType, state.data, type]);

  const grouped = useMemo(() => {
    const map = new Map();
    records.forEach((row) => {
      const key = row.category || (row.type === "INCOME" ? "Baskı Geliri" : "Diğer");
      const current = map.get(key) || { category: key, type: row.type, total: 0, rows: [] };
      current.total += Number(row.amount || 0);
      current.rows.push(row);
      map.set(key, current);
    });
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [records]);

  const summary = state.data?.summary || {};
  const templates = Array.isArray(state.data?.fixedExpenseTemplates) ? state.data.fixedExpenseTemplates : [];

  const saveExpense = async () => {
    if (!form.date || !form.category || Number(form.amount || 0) <= 0) {
      setNotice("Tarih, kategori ve sıfırdan büyük tutar zorunludur.");
      return;
    }
    setSaving(true);
    setNotice("");
    try {
      const payload = {
        ...params,
        ...form,
        amount: Number(form.amount || 0),
        vatAmount: Number(form.vatAmount || 0),
        type: "EXPENSE",
      };
      if (form.recurring) {
        await apiPost("/muhasebe/accounting/fixed-expenses", {
          ...payload,
          name: form.description || form.category,
          active: true,
        });
        setNotice("Sabit gider şablonu kaydedildi. Şablon tek başına muhasebe toplamına yazılmaz.");
      } else {
        await apiPost("/muhasebe/accounting/manual-expenses", payload);
        setNotice("Gider kaydı döneme işlendi.");
      }
      setDrawerOpen(false);
      setForm(emptyForm());
      await load();
    } catch (error) {
      setNotice(error?.message || "Gider kaydı oluşturulamadı.");
    } finally {
      setSaving(false);
    }
  };

  if (state.loading) {
    return <div className="accounting-list-skeleton"><span /><span /><span /><span /><span /></div>;
  }

  if (state.error) {
    return (
      <section className="accounting-controlled-state">
        <strong>Gelir / gider görünümü yüklenemedi.</strong>
        <span>{state.error}</span>
        <button type="button" onClick={load}>Tekrar dene</button>
      </section>
    );
  }

  return (
    <div className="plw-root">
      <header className="plw-toolbar">
        <label>Başlangıç<input type="date" value={period.startDate} onChange={(event) => setPeriod((current) => ({ ...current, startDate: event.target.value }))} /></label>
        <label>Bitiş<input type="date" value={period.endDate} onChange={(event) => setPeriod((current) => ({ ...current, endDate: event.target.value }))} /></label>
        <button type="button" onClick={load}><RefreshCcw size={16} /> Güncelle</button>
        <button type="button" className="primary" onClick={() => setDrawerOpen(true)}><CirclePlus size={16} /> Gider kaydı</button>
      </header>

      {notice ? <div className="plw-notice" role="status">{notice}</div> : null}

      <section className="plw-summary">
        <div><span>Toplam gelir</span><strong>{money(summary.totalIncome)}</strong></div>
        <div><span>Toplam gider</span><strong>{money(summary.totalExpense)}</strong></div>
        <div><span>Brüt sonuç</span><strong>{money(summary.grossProfit)}</strong></div>
        <div className={Number(summary.netResult || 0) >= 0 ? "success" : "danger"}>
          <span>Net kâr / zarar</span><strong>{money(summary.netResult)}</strong>
        </div>
      </section>

      <section className="plw-filterbar">
        <label className="plw-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Firma, belge veya kategori ara" /></label>
        <select value={type} onChange={(event) => setType(event.target.value)}>
          <option value="ALL">Gelir ve gider</option>
          <option value="INCOME">Yalnız gelir</option>
          <option value="EXPENSE">Yalnız gider</option>
        </select>
        <select value={recordType} onChange={(event) => setRecordType(event.target.value)}>
          <option value="ALL">Resmî ve gayri</option>
          <option value="RESMI">Resmî</option>
          <option value="GAYRI_RESMI">Gayri resmî</option>
        </select>
        <span>{records.length} kayıt</span>
      </section>

      {!records.length ? (
        <section className="plw-empty">
          <strong>Bu dönem için işlenmiş gelir veya gider kaydı bulunamadı.</strong>
          <span>Faturalar işlendiğinde gelir ve giderler otomatik görünür. Faturasız giderler “Gider kaydı” ile eklenebilir.</span>
        </section>
      ) : (
        <section className="plw-groups">
          {grouped.map((group) => (
            <details key={`${group.type}-${group.category}`} open>
              <summary>
                <div><span>{typeLabel(group.type)}</span><strong>{group.category}</strong></div>
                <div><span>{group.rows.length} kayıt</span><strong>{money(group.total)}</strong></div>
              </summary>
              <div className="plw-table-wrap">
                <table>
                  <thead><tr><th>Tarih</th><th>Firma</th><th>Belge No</th><th>Tür</th><th>Kategori</th><th>Tutar</th><th>KDV</th><th>Kayıt</th></tr></thead>
                  <tbody>
                    {group.rows.map((row) => (
                      <tr key={row.id}>
                        <td>{dateText(row.date)}</td>
                        <td><strong>{row.companyName || "-"}</strong></td>
                        <td>{row.documentNo || "-"}</td>
                        <td>{typeLabel(row.type)}</td>
                        <td>{row.category || "-"}</td>
                        <td><strong>{money(row.amount)}</strong></td>
                        <td>{money(row.vatAmount)}</td>
                        <td>{String(row.recordType || "RESMI").toUpperCase() === "GAYRI_RESMI" ? "Gayri resmî" : "Resmî"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
        </section>
      )}

      <details className="plw-templates">
        <summary>Sabit gider şablonları <span>{templates.length} tanım</span></summary>
        <div>
          {templates.length ? templates.map((item) => (
            <article key={item.id || item.fileName}>
              <div><strong>{item.name || item.category || "Sabit gider"}</strong><span>{item.category || "Diğer"}</span></div>
              <strong>{money(item.amount)}</strong>
            </article>
          )) : <div className="plw-template-empty">Sabit gider şablonu tanımlanmamış.</div>}
        </div>
      </details>

      {drawerOpen ? (
        <div className="plw-drawer-layer" role="presentation" onMouseDown={() => setDrawerOpen(false)}>
          <aside className="plw-drawer" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div><h2>Gider kaydı</h2><p>Faturasız veya genel giderleri döneme kaydedin.</p></div>
              <button type="button" onClick={() => setDrawerOpen(false)} aria-label="Kapat"><X size={20} /></button>
            </header>
            <div className="plw-form">
              <label>Tarih<input type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} /></label>
              <label>Firma / Açıklama<input value={form.companyName} onChange={(event) => setForm((current) => ({ ...current, companyName: event.target.value }))} placeholder="Firma veya ödeme yeri" /></label>
              <label>Kategori<select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
              <label>Tutar<input type="number" min="0" step="0.01" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} /></label>
              <label>KDV<input type="number" min="0" step="0.01" value={form.vatAmount} onChange={(event) => setForm((current) => ({ ...current, vatAmount: event.target.value }))} /></label>
              <label>Kayıt türü<select value={form.recordType} onChange={(event) => setForm((current) => ({ ...current, recordType: event.target.value }))}><option value="RESMI">Resmî</option><option value="GAYRI_RESMI">Gayri resmî</option></select></label>
              <label className="wide">Not<textarea rows="4" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></label>
              <label className="plw-checkbox wide"><input type="checkbox" checked={form.recurring} onChange={(event) => setForm((current) => ({ ...current, recurring: event.target.checked }))} /> Bunu sabit gider şablonu olarak kaydet</label>
              <div className="plw-form-note wide">Sabit gider şablonu yalnız tanım oluşturur; gerçek döneme yazılması için ayrıca gider kaydı gerekir.</div>
            </div>
            <footer>
              <button type="button" onClick={() => setDrawerOpen(false)}>Vazgeç</button>
              <button type="button" className="primary" disabled={saving} onClick={saveExpense}>Kaydet</button>
            </footer>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
