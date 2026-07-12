import { useState } from "react";
import { Field, InfoLine, Panel, Status } from "./BoyahaneShared";
import { documents } from "./boyahaneData";

function tone(status) {
  return status === "Onaylı" ? "green" : "red";
}

export default function EvrakDenetimPage() {
  const [selected, setSelected] = useState(documents[0]);

  return (
    <div className="bh-grid-3">
      <Panel title="Evrak Filtreleri" sub="Ürün, tür ve durum">
        <div className="bh-form-grid">
          <Field label="Ürün"><input defaultValue="S 10" /></Field>
          <Field label="Evrak türü"><select><option>Tümü</option><option>ZDHC</option><option>MSDS</option><option>TDS</option><option>LCW Onay / Deklarasyon</option><option>CAS Uygunluk</option><option>Ekolojik denetim belgesi</option></select></Field>
          <Field label="Durum"><select><option>Tümü</option><option>Onaylı</option><option>Eksik</option><option>Yenileme</option></select></Field>
        </div>
        <div className="bh-notice orange">
          ZDHC / MSDS / TDS / LCW Onay / Ekolojik Evrak buraya bırakılır.
        </div>
      </Panel>

      <Panel title="Evraklar / Denetim" sub="Kimyasal evrak ve denetim kayıtları">
        <div className="bh-table-wrap wide">
          <table>
            <thead>
              <tr>
                <th>Ürün</th>
                <th>Tedarikçi</th>
                <th>Evrak Türü</th>
                <th>CAS / Belge No</th>
                <th>Geçerlilik</th>
                <th>Yükleme Tarihi</th>
                <th>Bağlı Lot</th>
                <th>Denetim</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((row) => (
                <tr key={`${row?.product}-${row?.type}`} onClick={() => setSelected(row)}>
                  <td>{row?.product}</td>
                  <td>{row?.supplier}</td>
                  <td>{row?.type}</td>
                  <td>{row?.no}</td>
                  <td>{row?.validUntil}</td>
                  <td>{row?.uploadDate}</td>
                  <td>{row?.lot}</td>
                  <td>{row?.audit}</td>
                  <td><Status tone={tone(row?.status)}>{row?.status}</Status></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Evrak Detayı" sub="Seçili belge">
        <InfoLine label="Ürün" value={selected.product} />
        <InfoLine label="Evrak türü" value={selected.type} />
        <InfoLine label="Belge no" value={selected.no} />
        <InfoLine label="Geçerlilik" value={selected.validUntil} />
        <InfoLine label="Denetim türü" value={selected.audit} />
        <div className="bh-action-stack">
          <button className="bh-btn" type="button">Evrakı Aç</button>
          <button className="bh-btn primary" type="button">Onayla</button>
          <button className="bh-btn" type="button">Yenileme Hatırlat</button>
        </div>
      </Panel>
    </div>
  );
}
