import { Plus, Trash2 } from "lucide-react";

const emptyRow = () => ({
  id: `row-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  bedenYas: "",
  baskiYeri: "Göğüs Ön Orta",
  ustMesafeCm: "",
  ortaHizalama: "orta",
  baskiEnCm: "",
  baskiBoyCm: "",
  not: "",
});

export default function PlacementSizeTable({ rows, onChange }) {
  const update = (id, field, value) => onChange(rows.map((row) => row.id === id ? { ...row, [field]: value } : row));
  return (
    <section className="placement-table-card">
      <div className="desen-section-heading">
        <strong>Beden / Yaş Yerleşim Tablosu</strong>
        <button type="button" onClick={() => onChange([...rows, emptyRow()])}><Plus size={16} />Satır Ekle</button>
      </div>
      <div className="placement-table-wrap">
        <table>
          <thead>
            <tr><th>Beden / Yaş</th><th>Baskı Yeri</th><th>Üst Mesafe (cm)</th><th>Orta Hizalama</th><th>Baskı En (cm)</th><th>Baskı Boy (cm)</th><th>Not</th><th /></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row?.id}>
                {["bedenYas", "baskiYeri", "ustMesafeCm", "ortaHizalama", "baskiEnCm", "baskiBoyCm", "not"].map((field) => (
                  <td key={field}><input value={row[field] || ""} onChange={(e) => update(row?.id, field, e.target.value)} /></td>
                ))}
                <td><button type="button" title="Sil" onClick={() => onChange(rows.filter((item) => item?.id !== row?.id))}><Trash2 size={15} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

