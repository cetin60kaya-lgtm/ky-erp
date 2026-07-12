import { useState } from "react";
import { Field, InfoLine, Panel, Status } from "./BoyahaneShared";
import { approvedInventory } from "./boyahaneData";

function statusTone(status) {
  if (status === "Kullanılabilir") return "green";
  if (status === "Kontrol" || status === "Stok kritik") return "orange";
  return "red";
}

export default function OnayliEnvanterPage() {
  const [selected, setSelected] = useState(approvedInventory[0]);

  return (
    <div className="bh-grid-3">
      <Panel title="Envanter Filtreleri" sub="Ürün kullanılabilirlik kontrolü">
        <div className="bh-form-grid">
          <Field label="Ürün ara"><input defaultValue="ECOFLEX" /></Field>
          <Field label="Boya türü"><select><option>Tümü</option><option>SUBAZLI</option><option>PIGMENT</option><option>ECOPLAST</option><option>SİLİKON</option><option>AŞINDIRMA</option><option>FİKSATÖR</option><option>UV</option><option>AÇILIM BOYA</option><option>GENEL</option><option>DİĞER</option></select></Field>
          <Field label="Durum"><select><option>Tümü</option><option>Kullanılabilir</option><option>Kontrol</option><option>Eksik Onay</option></select></Field>
        </div>
      </Panel>

      <Panel title="Onaylı Envanter" sub="Ürün ana kartı ve kullanıma uygunluk">
        <div className="bh-table-wrap wide">
          <table>
            <thead>
              <tr>
                <th>Ürün Ticari Kodu</th>
                <th>Ürün Adı</th>
                <th>Kısa Ad</th>
                <th>Firma</th>
                <th>Boya Türü</th>
                <th>CAS</th>
                <th>LCW</th>
                <th>MSDS</th>
                <th>TDS</th>
                <th>ZDHC</th>
                <th>Aktif Lot</th>
                <th>Reçetede Kullanım</th>
                <th>Durum</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {approvedInventory.map((row) => (
                <tr key={row?.code} onClick={() => setSelected(row)}>
                  <td>{row?.code}</td>
                  <td>{row?.name}</td>
                  <td>{row?.shortName}</td>
                  <td>{row?.company}</td>
                  <td>{row?.type}</td>
                  <td>{row?.cas}</td>
                  <td>{row?.lcw}</td>
                  <td>{row?.msds}</td>
                  <td>{row?.tds}</td>
                  <td>{row?.zdhc}</td>
                  <td>{row?.activeLot}</td>
                  <td>{row?.recipeUsable}</td>
                  <td><Status tone={statusTone(row?.status)}>{row?.status}</Status></td>
                  <td><button className="bh-btn mini" type="button">Aç</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Ürün Onay Kartı" sub="Seçili ürün özeti">
        <InfoLine label="Ürün" value={selected.name} />
        <InfoLine label="Ürün Ticari Kodu" value={selected.code} />
        <InfoLine label="Kısa Ad / Arama Adı" value={selected.shortName} />
        <InfoLine label="Boya türü" value={selected.type} />
        <InfoLine label="Firma" value={selected.company} />
        <InfoLine label="Kullanım Durumu" value={selected.useStatus} />
        <InfoLine label="CAS" value={selected.cas} />
        <InfoLine label="LCW" value={selected.lcw} />
        <InfoLine label="MSDS Durumu" value={selected.msds} />
        <InfoLine label="TDS Durumu" value={selected.tds} />
        <InfoLine label="ZDHC Durumu" value={selected.zdhc} />
        <InfoLine label="Aktif Varsayılan Lot" value={selected.activeLot} />
        <InfoLine label="Reçetede Kullanılabilir mi" value={selected.recipeUsable} />
        <InfoLine label="Durum" value={selected.status} />
        <div className="bh-action-stack">
          <button className="bh-btn primary" type="button">Ürün Kartını Aç</button>
        </div>
      </Panel>
    </div>
  );
}
