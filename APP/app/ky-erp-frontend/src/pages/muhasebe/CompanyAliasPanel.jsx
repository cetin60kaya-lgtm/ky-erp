import { useCallback, useEffect, useMemo, useState } from "react";
import { Link2, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { fetchCompanies } from "../../services/muhasebeService";
import {
  createCompanyAlias,
  getCompanyAliases,
  passiveCompanyAlias,
} from "../../services/muhasebeSmartMatchApi";
import "./CompanyAliasPanel.css";

function rowsOf(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.rows)) return value.rows;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.liste)) return value.liste;
  return [];
}

function companyName(row) {
  return row?.firmaAdi || row?.name || row?.firma || row?.companyName || "Firma";
}

function normalize(value) {
  return String(value || "")
    .trim()
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .replace(/İ/g, "I")
    .replace(/Ğ/g, "G")
    .replace(/Ü/g, "U")
    .replace(/Ş/g, "S")
    .replace(/Ö/g, "O")
    .replace(/Ç/g, "C")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

export default function CompanyAliasPanel({ activeMainCompany, refreshKey = 0 }) {
  const [companies, setCompanies] = useState([]);
  const [aliases, setAliases] = useState([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ rawName: "", companyId: "" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    setBusy(true);
    setNotice(null);
    try {
      const [companyResult, aliasResult] = await Promise.all([
        fetchCompanies(activeMainCompany),
        getCompanyAliases(activeMainCompany, { active: "all", limit: 1000 }),
      ]);
      setCompanies(rowsOf(companyResult));
      setAliases(rowsOf(aliasResult));
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Firma alias kayıtları yüklenemedi." });
    } finally {
      setBusy(false);
    }
  }, [activeMainCompany]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const companyById = useMemo(
    () => new Map(companies.map((row) => [String(row.id || row.firmaId), row])),
    [companies],
  );

  const visibleAliases = useMemo(() => {
    const key = normalize(search);
    if (!key) return aliases;
    return aliases.filter((row) => {
      const company = companyById.get(String(row.companyId || row.matchedCompanyId));
      return normalize(
        `${row.rawName || row.alias || ""} ${row.cleanCompanyName || row.companyName || companyName(company)}`,
      ).includes(key);
    });
  }, [aliases, companyById, search]);

  const save = async () => {
    const rawName = form.rawName.trim();
    if (!rawName || !form.companyId) {
      setNotice({ tone: "error", text: "Faturada gelen firma yazımı ve gerçek firma kartı zorunludur." });
      return;
    }
    const duplicate = aliases.find(
      (row) => normalize(row.rawName || row.alias) === normalize(rawName),
    );
    if (duplicate) {
      setNotice({ tone: "error", text: "Bu firma yazımı zaten bir firma kartına bağlı." });
      return;
    }
    setBusy(true);
    try {
      const company = companyById.get(String(form.companyId));
      await createCompanyAlias(activeMainCompany, {
        rawName,
        companyId: form.companyId,
        cleanCompanyName: companyName(company),
        source: "MANUAL_FIRM_CARD",
      });
      setForm({ rawName: "", companyId: "" });
      setNotice({ tone: "success", text: `${rawName}, ${companyName(company)} firmasına bağlandı.` });
      await load();
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Firma aliası kaydedilemedi." });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row) => {
    const label = row.rawName || row.alias || "Bu alias";
    if (!window.confirm(`${label} bağlantısı pasife alınsın mı? Firma kartı ve hareketleri silinmez.`)) return;
    setBusy(true);
    try {
      await passiveCompanyAlias(activeMainCompany, row.id);
      setNotice({ tone: "success", text: "Firma alias bağlantısı pasife alındı." });
      await load();
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Alias pasife alınamadı." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="company-alias-panel">
      <header className="company-alias-head">
        <div>
          <span><Link2 size={15} /> TEK FİRMA KİMLİĞİ</span>
          <h2>Firma Yazım ve Alias Eşleştirme</h2>
          <p>Taha Giyim, Taha Tekstil veya unvan farklılıklarını tek gerçek firma/cari kartına bağlar.</p>
        </div>
        <button type="button" onClick={load} disabled={busy}><RefreshCw size={15} /> Yenile</button>
      </header>

      {notice ? <div className={`company-alias-notice ${notice.tone}`}>{notice.text}</div> : null}

      <div className="company-alias-form">
        <label>
          <span>Belgede / Ekstrede Gelen Yazım</span>
          <input
            value={form.rawName}
            onChange={(event) => setForm((current) => ({ ...current, rawName: event.target.value }))}
            placeholder="Örn. TAHA TEKSTİL"
          />
        </label>
        <label>
          <span>Bağlanacak Gerçek Firma Kartı</span>
          <select
            value={form.companyId}
            onChange={(event) => setForm((current) => ({ ...current, companyId: event.target.value }))}
          >
            <option value="">Firma seçin</option>
            {companies
              .slice()
              .sort((a, b) => companyName(a).localeCompare(companyName(b), "tr-TR"))
              .map((row) => (
                <option key={row.id || row.firmaId} value={row.id || row.firmaId}>
                  {companyName(row)}
                </option>
              ))}
          </select>
        </label>
        <button className="primary" type="button" disabled={busy} onClick={save}>
          <Plus size={16} /> Aliası Bağla
        </button>
      </div>

      <div className="company-alias-toolbar">
        <Search size={15} />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Alias veya gerçek firma ara" />
        <strong>{visibleAliases.length} bağlantı</strong>
      </div>

      <div className="company-alias-table-wrap">
        <table>
          <thead><tr><th>Gelen Yazım</th><th>Gerçek Firma / Cari</th><th>Kaynak</th><th>Durum</th><th>İşlem</th></tr></thead>
          <tbody>
            {visibleAliases.map((row) => {
              const company = companyById.get(String(row.companyId || row.matchedCompanyId));
              return (
                <tr key={row.id}>
                  <td><strong>{row.rawName || row.alias || "-"}</strong></td>
                  <td>{row.cleanCompanyName || row.companyName || companyName(company)}</td>
                  <td>{row.source || "Otomatik öğrenildi"}</td>
                  <td><span className={row.isActive === false ? "passive" : "active"}>{row.isActive === false ? "Pasif" : "Aktif"}</span></td>
                  <td><button className="danger" type="button" disabled={busy || row.isActive === false} onClick={() => remove(row)}><Trash2 size={14} /> Pasife Al</button></td>
                </tr>
              );
            })}
            {!visibleAliases.length ? <tr><td colSpan="5" className="empty">Firma alias kaydı yok.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
