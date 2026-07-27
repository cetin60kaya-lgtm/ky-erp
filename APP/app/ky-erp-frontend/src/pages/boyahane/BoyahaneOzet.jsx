import { Panel, Status } from "./BoyahaneShared";

const kpis = [
  ["Aktif Reçete", 18],
  ["Kayıtlı Renk", 42],
  ["Aktif Lot", 27],
  ["Onaylı Ürün", 31],
  ["Eksik Evrak", 3],
  ["Tanımsız Renk", 6],
];

const rows = [
  { area: "Hammadde / Lot", record: "S 20 BEYAZ / LOT-31", missing: "Kritik seviye", status: "Kontrol", action: "Stok Güncelle" },
  { area: "Onaylı Envanter", record: "KIRMIZI KGC", missing: "LCW bekliyor", status: "Eksik", action: "Ürün Kartı" },
  { area: "Evraklar", record: "ORANJ KG / TDS", missing: "Yok", status: "Onaylı", action: "Evrakı Aç" },
  { area: "Renk & Reçete", record: "18-1663 KIRMIZI / v2", missing: "Lot kontrol", status: "Kontrol", action: "Reçeteyi Aç" },
];

export default function BoyahaneOzet() {
  return (
    <div className="bh-grid-2">
      <Panel title="Boyahane Yönetim Özeti" sub="Ayrılmış iş alanları ve günlük kontrol">
        <div className="bh-kpi-row">
          {kpis.map(([label, value]) => (
            <div className="bh-kpi" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        <div className="bh-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Alan</th>
                <th>Kayıt</th>
                <th>Eksik</th>
                <th>Durum</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row?.area}-${row?.record}`}>
                  <td>{row?.area}</td>
                  <td>{row?.record}</td>
                  <td>{row?.missing}</td>
                  <td><Status tone={row.status === "Onaylı" ? "green" : row.status === "Eksik" ? "red" : "orange"}>{row?.status}</Status></td>
                  <td><button className="bh-btn" type="button">{row?.action}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Ekran Ayrımı" sub="Veriler birbirine karışmadan izlenir">
        <div className="bh-notice">
          <strong>Hammadde / Lot:</strong> sadece güncel lot, stok, giriş-çıkış ve fatura bağlantısı.
        </div>
        <div className="bh-notice">
          <strong>Onaylı Envanter:</strong> ürün kullanılabilir mi, boya türü ve onay durumu.
        </div>
        <div className="bh-notice">
          <strong>Evraklar:</strong> ZDHC, MSDS, TDS, LCW ve ekolojik belge yönetimi.
        </div>
      </Panel>
    </div>
  );
}
