import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet } from "../../../utils/api";

const money = (value) => Number(value || 0).toLocaleString("tr-TR", { style: "currency", currency: "TRY" });
const unwrap = (payload) => payload?.data?.data || payload?.data || payload || {};

export default function VatComparisonWorkspace({ activeMainCompany, refreshKey }) {
  const current = new Date().toISOString().slice(0, 7);
  const [month, setMonth] = useState(current);
  const [state, setState] = useState({ loading: true, error: "", data: {} });
  const load = useCallback(async () => {
    setState((old) => ({ ...old, loading: true, error: "" }));
    try { setState({ loading: false, error: "", data: unwrap(await apiGet("/api/vat/summary", { mainCompanySlug: activeMainCompany?.slug, mainCompanyId: activeMainCompany?.id, year: month.slice(0, 4), month: Number(month.slice(5, 7)), _ts: Date.now() })) }); }
    catch (error) { setState({ loading: false, error: error?.message || "KDV verileri alınamadı.", data: {} }); }
  }, [activeMainCompany?.id, activeMainCompany?.slug, month]);
  useEffect(() => { load(); }, [load, refreshKey]);
  const result = useMemo(() => {
    const source = Array.isArray(state.data?.liste) ? state.data.liste : Array.isArray(state.data) ? state.data : [];
    const filtered = source.filter((row) => !row.tarih || String(row.tarih).slice(0, 7) === month);
    const incoming = new Map(); const outgoing = new Map();
    filtered.forEach((row) => { const name = row.firma || row.companyName || "Firma eşleşmesi bekliyor"; const direction = String(row.tur || row.vat_direction || row.direction || "").toLocaleUpperCase("tr-TR"); const incomingValue = Number(row.gelenKdv ?? row.incoming_vat ?? (/GELEN|IN/.test(direction) ? row.kdvTutari : 0) ?? 0); const outgoingValue = Number(row.gidenKdv ?? row.outgoing_vat ?? (/GİDEN|GIDEN|OUT/.test(direction) ? row.kdvTutari : 0) ?? 0); if (incomingValue) incoming.set(name, (incoming.get(name) || 0) + incomingValue); if (outgoingValue) outgoing.set(name, (outgoing.get(name) || 0) + outgoingValue); });
    const toRows = (map) => [...map].map(([firma, tutar]) => ({ firma, tutar })).sort((a, b) => b.tutar - a.tutar);
    return { incoming: toRows(incoming), outgoing: toRows(outgoing) };
  }, [month, state.data]);
  const incomingTotal = result.incoming.reduce((sum, row) => sum + row.tutar, 0); const outgoingTotal = result.outgoing.reduce((sum, row) => sum + row.tutar, 0); const carry = Number(state.data?.devredenKdv || 0); const payable = Math.max(0, outgoingTotal - incomingTotal - carry); const purchaseNeeded = payable > 0 ? payable / 0.2 : 0;
  if (state.loading) return <div className="accounting-list-skeleton"><span /><span /><span /><span /></div>;
  if (state.error) return <section className="accounting-controlled-state"><strong>KDV görünümü yüklenemedi.</strong><span>{state.error}</span><button type="button" onClick={load}>Tekrar dene</button></section>;
  const Side = ({ title, rows, tone }) => <section className="vat-side"><header><h2>{title}</h2><strong>{money(rows.reduce((sum, row) => sum + row.tutar, 0))}</strong></header><div>{rows.map((row) => <article key={row.firma}><span>{row.firma}</span><b className={tone}>{money(row.tutar)}</b></article>)}{!rows.length ? <div className="accounting-table-empty">Bu dönemde kayıt yok.</div> : null}</div></section>;
  return <div className="vat-workspace"><div className="accounting-list-toolbar"><label>Dönem <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label><button type="button" onClick={load}>Güncelle</button></div><div className="vat-summary">{[["Gelen KDV", incomingTotal],["Giden KDV", outgoingTotal],["Devreden KDV", carry],["Ödenecek KDV", payable],["KDV kapatmak için gerekli alım", purchaseNeeded]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{money(value)}</strong></div>)}</div><div className="vat-sides"><Side title="Gelen firmalar" rows={result.incoming} tone="incoming" /><Side title="Giden firmalar" rows={result.outgoing} tone="outgoing" /></div><footer className="vat-totals"><span>Aylık gelen: <b>{money(incomingTotal)}</b></span><span>Aylık giden: <b>{money(outgoingTotal)}</b></span><span>Fark: <b>{money(outgoingTotal - incomingTotal)}</b></span></footer></div>;
}
