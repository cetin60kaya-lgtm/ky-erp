import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "../../../utils/api";

const unwrap = (payload) => payload?.data?.data || payload?.data || payload || {};
const date = (value) => value ? new Date(value).toLocaleDateString("tr-TR") : "-";

export default function MailTrackingWorkspace({ activeMainCompany, refreshKey }) {
  const [state, setState] = useState({ loading: true, error: "", data: {} });
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");
  useEffect(() => { const timer = window.setTimeout(() => setSearch(query), 300); return () => window.clearTimeout(timer); }, [query]);
  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const response = await apiGet("/api/mail-tracking", { mainCompanySlug: activeMainCompany?.slug, mainCompanyId: activeMainCompany?.id, _ts: Date.now() });
      setState({ loading: false, error: "", data: unwrap(response) });
    } catch (error) {
      setState({ loading: false, error: error?.message || "Ekstre ve mail listesi alınamadı.", data: {} });
    }
  }, [activeMainCompany?.id, activeMainCompany?.slug]);
  useEffect(() => { load(); }, [load, refreshKey]);
  const rows = useMemo(() => {
    const source = Array.isArray(state.data?.liste) ? state.data.liste : [];
    const term = search.trim().toLocaleLowerCase("tr-TR");
    return term ? source.filter((row) => `${row.firma || ""} ${(row.to || []).join(" ")} ${row.status || ""}`.toLocaleLowerCase("tr-TR").includes(term)) : source;
  }, [search, state.data]);
  const prepare = async (row, action) => {
    setBusyId(row.id); setNotice("");
    try {
      const result = unwrap(await apiPost("/api/mail-tracking/create-draft", { id: row.id, firmId: row.firmId, action }));
      setNotice(action === "STATEMENT" ? `${row.firma} için ekstre talebi hazırlandı.` : `${row.firma} için mail taslağı hazırlandı.`);
      if (result?.konu && navigator?.clipboard) await navigator.clipboard.writeText(`${result.konu}\n\n${result.govde || ""}`);
    } catch (error) { setNotice(error?.message || "Mail işlemi hazırlanamadı."); }
    finally { setBusyId(""); }
  };
  const markLocal = (row, action) => {
    const key = `kyerp-mail-tracking:${row.id}`;
    const current = JSON.parse(localStorage.getItem(key) || "{}");
    localStorage.setItem(key, JSON.stringify({ ...current, [action]: new Date().toISOString() }));
    setNotice(action === "sentAt" ? `${row.firma} gönderildi olarak işaretlendi.` : `${row.firma} için hatırlatma kaydedildi.`);
  };
  if (state.loading) return <div className="accounting-list-skeleton">{Array.from({ length: 7 }, (_, index) => <span key={index} />)}</div>;
  if (state.error) return <section className="accounting-controlled-state"><strong>Liste yüklenemedi.</strong><span>{state.error}</span><button type="button" onClick={load}>Tekrar dene</button></section>;
  return <div className="accounting-list-workspace">
    <div className="accounting-list-toolbar"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Firma, alıcı veya durum ara" /><span>{rows.length} firma</span></div>
    {notice ? <div className="accounting-list-notice">{notice}</div> : null}
    <div className="accounting-table-shell"><table><thead><tr><th>Firma</th><th>Son ekstre</th><th>Ekstre bekleniyor</th><th>Son mail</th><th>Mail durumu</th><th>Hatırlatma</th><th>Alıcılar</th><th>İşlem</th></tr></thead>
      <tbody>{rows.map((row) => { const local = JSON.parse(localStorage.getItem(`kyerp-mail-tracking:${row.id}`) || "{}"); return <tr key={row.id}><td><strong>{row.firma || "-"}</strong></td><td>{date(row.sonEkstreTarihi)}</td><td><span className={`accounting-status ${/bekle|kontrol/i.test(row.ekstreKarsilastirma || "") ? "warning" : "neutral"}`}>{row.ekstreKarsilastirma || "Kontrol edilmedi"}</span></td><td>{date(local.sentAt || row.sonMailTarihi)}</td><td>{local.sentAt ? "Gönderildi" : row.status || "Bekliyor"}</td><td>{date(local.reminderAt || row.hatirlatmaTarihi)}</td><td>{(row.to || []).join(", ") || "Alıcı eksik"}</td><td><div className="accounting-row-actions"><button type="button" disabled={busyId === row.id} onClick={() => prepare(row, "STATEMENT")}>Ekstre iste</button><button type="button" disabled={busyId === row.id} onClick={() => prepare(row, "MAIL")}>Mail hazırla</button><button type="button" onClick={() => markLocal(row, "sentAt")}>Gönderildi</button><button type="button" onClick={() => markLocal(row, "reminderAt")}>Hatırlat</button></div></td></tr>; })}
      {!rows.length ? <tr><td colSpan="8"><div className="accounting-table-empty">Takip edilecek firma bulunamadı.</div></td></tr> : null}</tbody></table></div>
  </div>;
}
