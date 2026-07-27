import { Field, Panel, Status } from "./BoyahaneShared";
import { reportRows } from "./boyahaneData";

const reportTypes = [
  "Model Renk Reçete Raporu",
  "Lot Hareket Raporu",
  "Onaylı Envanter Raporu",
  "Eksik Evrak Raporu",
  "Renk Versiyon Geçmişi",
  "Model Boya Gideri Raporu",
];

export default function BoyahaneRaporlari() {
  return (
    <div className="bh-grid-3">
      <Panel title="Rapor Filtreleri" sub="Okunabilir rapor seçimi">
        <div className="bh-form-grid">
          <Field label="Rapor tipi"><select>{reportTypes.map((type) => <option key={type}>{type}</option>)}</select></Field>
          <Field label="Tarih başlangıç"><input type="date" defaultValue="2026-05-01" /></Field>
          <Field label="Tarih bitiş"><input type="date" defaultValue="2026-05-23" /></Field>
          <Field label="Durum"><select><option>Tümü</option><option>Hazır</option><option>Kontrol</option><option>Eksik</option></select></Field>
        </div>
      </Panel>

      <Panel title="Boyahane Raporları" sub="Tablo önizleme">
        <div className="bh-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Rapor</th>
                <th>Kayıt</th>
                <th>Tarih</th>
                <th>Sorumlu</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {reportRows.map((row) => (
                <tr key={`${row?.type}-${row?.record}`}>
                  <td>{row?.type}</td>
                  <td>{row?.record}</td>
                  <td>{row?.date}</td>
                  <td>{row?.owner}</td>
                  <td><Status tone={row.status === "Hazır" ? "green" : row.status === "Eksik" ? "red" : "orange"}>{row?.status}</Status></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Rapor Önizleme" sub="Dışa aktarma">
        <div className="bh-notice">
          Seçili rapor kart ve tablo olarak hazırlanır; ham veri gösterilmez.
        </div>
        <div className="bh-action-stack">
          <button className="bh-btn primary" type="button">Yazdır</button>
          <button className="bh-btn" type="button">PDF al</button>
          <button className="bh-btn" type="button">Excel al</button>
        </div>
      </Panel>
    </div>
  );
}
