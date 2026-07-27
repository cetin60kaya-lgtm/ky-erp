import { useState } from "react";
import { Field, InfoLine, Panel, Status, formatKg } from "./BoyahaneShared";
import { products } from "./boyahaneData";

const lotRows = products.flatMap((product) =>
  product.lots.map((lot) => ({
    productCode: product.code,
    productName: product.name,
    dyeType: product.type,
    supplier: product.supplier,
    default: lot.isDefault ? "Evet" : "Hayır",
    remainingKg: Number(lot.entryKg || 0) - Number(lot.usedKg || 0),
    ...lot,
  })),
);

function tone(status) {
  if (status === "Aktif") return "green";
  if (status === "Kritik") return "orange";
  return "gray";
}

export default function HammaddeLotPage() {
  const [selected, setSelected] = useState(lotRows[0]);

  return (
    <div className="bh-grid-3">
      <Panel title="Ürün ve Lot Filtreleri" sub="Güncel stok takibi">
        <div className="bh-form-grid">
          <Field label="Ürün ara"><input defaultValue="S 10" /></Field>
          <Field label="Lot durumu filtresi"><select><option>Tümü</option><option>Varsayılan</option><option>Aktif</option><option>Kritik</option><option>Biten</option><option>Pasif</option></select></Field>
          <Field label="Tedarikçi filtresi"><select><option>Tümü</option><option>URAS</option><option>KIMYA GRUP</option><option>ECOFLEX</option></select></Field>
        </div>
        <h3 className="bh-section-title">Kritik / pasif lot listesi</h3>
        <div className="bh-list">
          {lotRows.filter((row) => row?.status !== "Aktif").map((row) => (
            <button key={`${row?.productName}-${row?.lot}`} type="button" className={selected.lot === row?.lot ? "active" : ""} onClick={() => setSelected(row)}>
              <strong>{row?.productName}</strong>
              <span>{row?.lot} / {row?.status} / Kalan {formatKg(row?.remainingKg)}</span>
            </button>
          ))}
        </div>
      </Panel>

      <Panel
        title="Hammadde / Lot"
        sub="Lot, stok ve fatura bağlantısı"
        actions={<button className="bh-btn primary" type="button">+ Lot</button>}
      >
        <div className="bh-table-wrap wide">
          <table>
            <thead>
              <tr>
                <th>Ürün Kodu</th>
                <th>Ürün Adı</th>
                <th>Boya Türü</th>
                <th>Lot</th>
                <th>Varsayılan</th>
                <th>Tedarikçi</th>
                <th>Fatura No</th>
                <th>Giriş KG</th>
                <th>Kullanılan KG</th>
                <th>Kalan KG</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {lotRows.map((row) => (
                <tr key={`${row?.productName}-${row?.lot}`} onClick={() => setSelected(row)}>
                  <td>{row?.productCode}</td>
                  <td>{row?.productName}</td>
                  <td>{row?.dyeType}</td>
                  <td>{row?.lot}</td>
                  <td>{row?.default}</td>
                  <td>{row?.supplier}</td>
                  <td>{row?.invoiceNo}</td>
                  <td>{formatKg(row?.entryKg)}</td>
                  <td>{formatKg(row?.usedKg)}</td>
                  <td>{formatKg(row?.remainingKg)}</td>
                  <td><Status tone={tone(row?.status)}>{row?.note || row?.status}</Status></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Lot Kartı" sub="Seçili ürün stok özeti">
        <InfoLine label="Ürün" value={selected.productName} />
        <InfoLine label="Varsayılan Lot" value={selected.default === "Evet" ? selected.lot : "-"} />
        <InfoLine label="Pasif Lot" value={selected.status === "Pasif" ? selected.lot : "-"} />
        <InfoLine label="Giriş KG" value={formatKg(selected.entryKg)} />
        <InfoLine label="Kullanılan KG" value={formatKg(selected.usedKg)} />
        <InfoLine label="Kalan KG" value={formatKg(selected.remainingKg)} />
        <InfoLine label="Fatura bağlantısı" value={selected.invoiceNo} />
        <div className="bh-action-stack">
          <button className="bh-btn" type="button">Lot Hareketi Aç</button>
          <button className="bh-btn primary" type="button">Varsayılan Yap</button>
          <button className="bh-btn danger" type="button">Pasife Al</button>
          <button className="bh-btn" type="button">Stok Güncelle</button>
        </div>
      </Panel>
    </div>
  );
}
