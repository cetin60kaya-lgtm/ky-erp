import { useEffect, useMemo, useState } from "react";
import { getRaporlar, getYonetimOzeti } from "../../services/muhasebeApi";
import { DataTable, Kpi, emptyRows, field, formatMoney, normalizeSummary, reportTypes } from "./_MuhasebeShared";

const slugMap = Object.fromEntries(
  reportTypes.map((name) => [
    name,
    name
      .toLocaleLowerCase("tr-TR")
      .replace(/ğ/g, "g")
      .replace(/ü/g, "u")
      .replace(/ş/g, "s")
      .replace(/ı/g, "i")
      .replace(/ö/g, "o")
      .replace(/ç/g, "c")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, ""),
  ]),
);

export default function MuhasebeRaporPage({ activeMainCompany }) {
  const [selected, setSelected] = useState(reportTypes[0]);
  const [summaryData, setSummaryData] = useState({ summary: normalizeSummary({}), ...emptyRows });
  const [types, setTypes] = useState(reportTypes);

  useEffect(() => {
    getRaporlar(activeMainCompany || {})
      .then((payload) => {
        const incoming = Array.isArray(payload?.types) ? payload?.types : Array.isArray(payload) ? payload : [];
        if (incoming.length) setTypes(incoming.map((item) => item?.label || item?.name || String(item)));
      })
      .catch(() => setTypes(reportTypes));
    getYonetimOzeti(activeMainCompany || {})
      .then((payload) => setSummaryData({ summary: normalizeSummary(payload), ...emptyRows, ...payload }))
      .catch(() => setSummaryData({ summary: normalizeSummary({}), ...emptyRows }));
  }, [activeMainCompany?.slug, activeMainCompany?.id]);

  const summary = useMemo(() => normalizeSummary(summaryData), [summaryData]);
  const rows = selected.includes("Gelen") ? summaryData.gelenFaturalar : selected.includes("Yapılan") ? summaryData.yapilanIsler : summaryData.kesilenFaturalar;

  return (
    <div className="mh-layout-main-right">
      <section className="mh-card">
        <div className="mh-card-head"><h2>Rapor Tipleri</h2><small>Raw JSON yok; formatlı rapor önizleme var.</small></div>
        <div className="mh-card-body">
          <div className="mh-report-grid">
            {types.map((type) => (
              <button key={type} type="button" className={type === selected ? "active" : ""} onClick={() => setSelected(type)}>
                {type}
              </button>
            ))}
          </div>
        </div>
      </section>
      <aside className="mh-card print-area">
        <div className="mh-card-head">
          <h2>Rapor Önizleme</h2>
          <div className="mh-inline-actions">
            <button className="mh-btn primary" onClick={() => window.print()}>Yazdır</button>
            <button className="mh-btn">PDF al</button>
            <button className="mh-btn">Excel al</button>
          </div>
        </div>
        <div className="mh-card-body">
          <h3 className="mh-report-title">{selected}</h3>
          <div className="mh-kpi-grid four">
            <Kpi label="Kesilen Fatura" value={summary.kesilenFaturaToplami} />
            <Kpi label="Gelen Fatura" value={summary.gelenFaturaToplami} tone="green" />
            <Kpi label="Tahmini Kar" value={summary.tahminiKar} tone="purple" />
            <Kpi label="Net KDV" value={summary.netKdv} tone="dark" />
          </div>
          <DataTable rows={rows} columns={[
            { key: "tarih", label: "Tarih", render: (r) => field(r, ["tarih", "date"]) },
            { key: "belgeNo", label: "Belge No", render: (r) => field(r, ["belgeNo", "documentNo", "siparisNo"]) },
            { key: "firma", label: "Firma", render: (r) => field(r, ["firma", "companyName"]) },
            { key: "model", label: "Model" },
            { key: "tutar", label: "Tutar", render: (r) => formatMoney(field(r, ["tutar", "amount", "toplam"], 0)) },
            { key: "durum", label: "Durum", render: (r) => field(r, ["durum", "status", "mailDurumu"], "-") },
          ]} />
          <small className="mh-note">Rapor anahtarı: {slugMap[selected] || selected}. Önizleme alanı alan adlarını JSON olarak basmaz.</small>
        </div>
      </aside>
    </div>
  );
}
