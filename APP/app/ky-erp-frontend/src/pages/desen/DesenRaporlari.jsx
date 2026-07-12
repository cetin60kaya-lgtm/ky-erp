import { useState } from "react";
import { desenJobs } from "./desenData";
import { Field, Status } from "./DesenShared";

export default function DesenRaporlari() {
  const [status, setStatus] = useState("");
  const rows = status ? desenJobs.filter((job) => job.durum === status) : desenJobs;

  return (
    <div className="dw-grid-2">
      <aside className="dw-card">
        <div className="dw-card-head"><h2>Filtre</h2></div>
        <div className="dw-card-body">
          <Field label="Tarih başlangıç"><input type="date" defaultValue="2026-05-01" /></Field>
          <Field label="Tarih bitiş"><input type="date" defaultValue="2026-05-23" /></Field>
          <Field label="Durum"><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Tümü</option><option>Eksik Bilgi</option><option>Yerleşim Bekliyor</option><option>Üretime Hazır</option></select></Field>
          <button className="dw-btn primary full">Raporla</button>
        </div>
      </aside>
      <main className="dw-card">
        <div className="dw-card-head"><h2>Desen Raporu</h2><button className="dw-btn">Excel</button></div>
        <div className="dw-card-body">
          <div className="dw-table-wrap">
            <table>
              <thead><tr><th>Model</th><th>Firma</th><th>Desen</th><th>Baskı</th><th>Kaç renk</th><th>Kanal adet</th><th>Kalıp</th><th>Durum</th></tr></thead>
              <tbody>{rows.map((job) => <tr key={job.id}><td>{job.model}</td><td>{job.firma}</td><td>{job.desenAdi}</td><td>{job.bolge}</td><td>{job.kacRenk}</td><td>{job.kanalAdet}</td><td>{job.kalip}</td><td><Status tone={job.tone}>{job.durum}</Status></td></tr>)}</tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
