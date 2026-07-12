import { useEffect, useMemo, useState } from "react";
import { getMailEkstre } from "../../services/muhasebeApi";
import { DataTable, Status, asArray, field, formatMoney } from "./_MuhasebeShared";

const emptyRows = [];

export default function MailEkstrePage({ activeMainCompany, openTab }) {
  const [rows, setRows] = useState(emptyRows);
  const [selectedId, setSelectedId] = useState("m1");
  useEffect(() => {
    getMailEkstre(activeMainCompany || {})
      .then((payload) => {
        const next = asArray(payload);
        setRows(next.length ? next : emptyRows);
      })
      .catch(() => setRows(emptyRows));
  }, [activeMainCompany?.slug, activeMainCompany?.id]);

  const selected = rows.find((row) => String(row?.id) === selectedId) || rows[0] || {};
  const counters = useMemo(() => rows.reduce((acc, row) => {
    const status = String(field(row, ["eksikKontrol", "status"], "")).toLocaleLowerCase("tr-TR");
    if (status.includes("eksik")) acc.aliciEksik += 1;
    else if (status.includes("gönderildi")) acc.gonderildi += 1;
    else acc.gonderilecek += 1;
    if (String(field(row, ["ekstre"], "")).toLocaleLowerCase("tr-TR").includes("var")) acc.ekstredeVar += 1;
    return acc;
  }, { gonderilecek: 0, gonderildi: 0, aliciEksik: 0, ekstredeVar: 0 }), [rows]);

  return (
    <div className="mh-layout-3">
      <section className="mh-card">
        <div className="mh-card-head"><h2>Mail / Ekstre</h2></div>
        <div className="mh-card-body mh-side-lines">
          <Line label="Gönderilecek" value={counters.gonderilecek} />
          <Line label="Gönderildi" value={counters.gonderildi} />
          <Line label="Alıcı eksik" value={counters.aliciEksik} />
          <Line label="Ekstrede var" value={counters.ekstredeVar} />
        </div>
      </section>
      <section className="mh-card">
        <div className="mh-card-head"><h2>Mail / Ekstre Takip Listesi</h2></div>
        <div className="mh-card-body">
          <DataTable rows={rows} columns={[
            { key: "firma", label: "Firma", render: (r) => field(r, ["firma", "companyName", "firmName"]) },
            { key: "model", label: "Model" },
            { key: "faturaNo", label: "Fatura No", render: (r) => field(r, ["faturaNo", "invoiceNo"]) },
            { key: "irsaliyeNo", label: "İrsaliye No", render: (r) => field(r, ["irsaliyeNo", "dispatchNo"]) },
            { key: "tutar", label: "Tutar", render: (r) => formatMoney(field(r, ["tutar", "amount"], 0)) },
            { key: "aliciKarari", label: "Mail Alıcı Kararı", render: (r) => field(r, ["aliciKarari", "recipientDecision"]) },
            { key: "to", label: "TO", render: (r) => field(r, ["to", "toJson"], "-") },
            { key: "cc", label: "CC", render: (r) => field(r, ["cc", "ccJson"], "-") },
            { key: "eksikKontrol", label: "Eksik Kontrol", render: (r) => <Status tone={String(field(r, ["eksikKontrol"], "")).includes("eksik") ? "red" : "green"}>{field(r, ["eksikKontrol", "status"], "Hazır")}</Status> },
            { key: "ekstre", label: "Ekstre", render: (r) => field(r, ["ekstre", "statementStatus"]) },
            { key: "islem", label: "İşlem", render: (r) => <button className="mh-btn" onClick={() => setSelectedId(String(r.id))}>Aç</button> },
          ]} />
        </div>
      </section>
      <aside className="mh-card">
        <div className="mh-card-head"><h2>Alıcı Kararı</h2></div>
        <div className="mh-card-body mh-side-lines">
          <Line label="TO" value={field(selected, ["to", "toJson"], "-")} />
          <Line label="CC" value={field(selected, ["cc", "ccJson"], "-")} />
          <Line label="Genel muhasebe CC" value={field(selected, ["generalCc"], "-")} />
          <h3 className="mh-subtitle">Ekstre Karşılaştırma</h3>
          <Line label="Ödemeye giren" value={field(selected, ["paidMatched"], 0)} />
          <Line label="Ödemeye girmeyen" value={field(selected, ["paidMissing"], 0)} />
          <Line label="Tutar farkı olan" value={field(selected, ["amountDiff"], 0)} />
          <button className="mh-btn primary">Mail taslağı hazırla</button>
          <button className="mh-btn" onClick={() => openTab?.("firma")}>Firma yetkilerini aç</button>
          <small className="mh-note">Alıcı kararı: model özel kişi, model sorumlusu, belge tipine göre yetkili ve genel muhasebe CC sırasıyla uygulanır.</small>
        </div>
      </aside>
    </div>
  );
}
function Line({ label, value }) {
  return <div className="mh-side-line"><span>{label}</span><b>{value}</b></div>;
}
