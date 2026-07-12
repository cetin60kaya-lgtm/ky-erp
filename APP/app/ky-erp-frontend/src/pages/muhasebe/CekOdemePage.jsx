import { useEffect, useMemo, useState } from "react";
import { getCekOdemeler } from "../../services/muhasebeApi";
import { DataTable, Status, asArray, field, formatMoney } from "./_MuhasebeShared";

const emptyRows = [];

export default function CekOdemePage({ activeMainCompany }) {
  const [rows, setRows] = useState(emptyRows);
  const [selectedId, setSelectedId] = useState("c1");
  useEffect(() => {
    getCekOdemeler(activeMainCompany || {})
      .then((payload) => {
        const next = asArray(payload);
        setRows(next.length ? next : emptyRows);
      })
      .catch(() => setRows(emptyRows));
  }, [activeMainCompany?.slug, activeMainCompany?.id]);

  const counts = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return rows.reduce((acc, row) => {
      const due = String(field(row, ["vade", "dueDate"], ""));
      if (due === today) acc.bugun += 1;
      else if (due && due < today) acc.gecmis += 1;
      else acc.yaklasan += 1;
      return acc;
    }, { yaklasan: 0, bugun: 0, gecmis: 0 });
  }, [rows]);
  const selected = rows.find((row) => String(row?.id) === selectedId) || rows[0] || {};

  return (
    <div className="mh-layout-main-right">
      <section className="mh-card">
        <div className="mh-card-head"><h2>Çek / Ödeme Listesi</h2></div>
        <div className="mh-card-body">
          <div className="mh-badge-row">
            <Status>Yaklaşan: {counts.yaklasan}</Status>
            <Status>Bugün: {counts.bugun}</Status>
            <Status tone="red">Vadesi geçmiş: {counts.gecmis}</Status>
          </div>
          <DataTable rows={rows} columns={[
            { key: "firma", label: "Firma", render: (r) => field(r, ["firma", "companyName", "firmName"]) },
            { key: "bagliBelge", label: "Bağlı Belge", render: (r) => field(r, ["bagliBelge", "documentNo", "relatedDocumentNo"]) },
            { key: "cekNo", label: "Çek No", render: (r) => field(r, ["cekNo", "checkNo"]) },
            { key: "banka", label: "Banka", render: (r) => field(r, ["banka", "bankName"]) },
            { key: "odemeTipi", label: "Ödeme Tipi", render: (r) => field(r, ["odemeTipi", "paymentType"]) },
            { key: "vade", label: "Vade", render: (r) => field(r, ["vade", "dueDate"]) },
            { key: "tutar", label: "Tutar", render: (r) => formatMoney(field(r, ["tutar", "amount"], 0)) },
            { key: "resmiGayri", label: "Resmi/Gayri", render: (r) => field(r, ["resmiGayri", "workType"], "RESMI") },
            { key: "durum", label: "Durum", render: (r) => <Status tone="green">{field(r, ["durum", "status"])}</Status> },
            { key: "islem", label: "İşlem", render: (r) => <button className="mh-btn" onClick={() => setSelectedId(String(r.id))}>Detay</button> },
          ]} />
        </div>
      </section>
      <aside className="mh-card">
        <div className="mh-card-head"><h2>Görseller / Durum</h2></div>
        <div className="mh-card-body mh-side-lines">
          <div className="mh-image-box">Ön görsel</div>
          <div className="mh-image-box">Arka görsel</div>
          <Line label="Durum" value={field(selected, ["durum", "status"], "Yaklaşan")} />
          <button className="mh-btn primary" onClick={() => window.print()}>Çek listesi yazdır</button>
        </div>
      </aside>
    </div>
  );
}
function Line({ label, value }) {
  return <div className="mh-side-line"><span>{label}</span><b>{value}</b></div>;
}
