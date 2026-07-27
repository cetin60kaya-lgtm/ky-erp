import { useState } from "react";
import { Field, InfoLine, Panel, Status, VisualBox } from "./BoyahaneShared";
import { colorUsageRows, registeredColors } from "./boyahaneData";

export default function KayitliRenklerPage() {
  const [selected, setSelected] = useState(registeredColors[1]);

  return (
    <div className="bh-grid-3">
      <Panel title="Renk Arama" sub="Pantone, boya türü ve versiyon">
        <div className="bh-form-grid">
          <Field label="Renk / Pantone arama"><input defaultValue="18-1663" /></Field>
          <Field label="Boya türü filtresi"><select><option>Tümü</option><option>SUBAZLI</option><option>PIGMENT</option><option>GENEL</option></select></Field>
          <Field label="Versiyon filtresi"><select><option>Tümü</option><option>v1</option><option>v2</option></select></Field>
        </div>
        <h3 className="bh-section-title">Hızlı Renk Listesi</h3>
        <div className="bh-list">
          {registeredColors.map((color) => (
            <button key={color.id} type="button" className={selected.id === color.id ? "active" : ""} onClick={() => setSelected(color)}>
              <strong>{color.pantone || color.customerColorCode} {color.name}</strong>
              <span>{color.dyeType} / {color.version} / {color.modelCount} kullanım</span>
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="Kayıtlı Renkler" sub="Versiyon ve ürün kombinasyonu kartları">
        <div className="bh-color-grid">
          {registeredColors.map((color) => (
            <button key={color.id} type="button" className={`bh-color-card ${selected.id === color.id ? "active" : ""}`} onClick={() => setSelected(color)}>
              <span className="bh-swatch" style={{ background: color.color }} />
              <span>
                <strong>{color.pantone || color.customerColorCode} {color.name}</strong>
                <span>{color.dyeType} / {color.version}</span>
                <span>{color.combination}</span>
                <span>Model: {color.modelCount} kullanım</span>
              </span>
            </button>
          ))}
        </div>
        <div className="bh-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Model</th>
                <th>Renk</th>
                <th>Pantone</th>
                <th>Müşteri Renk Kodu</th>
                <th>Boya Türü</th>
                <th>Versiyon</th>
                <th>Ürün Kombinasyonu</th>
                <th>Son Kullanım</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {colorUsageRows.map((row) => (
                <tr key={`${row?.model}-${row?.version}`}>
                  <td>{row?.model}</td>
                  <td>{row?.color}</td>
                  <td>{row?.pantone}</td>
                  <td>{row?.customerColorCode}</td>
                  <td>{row?.dyeType}</td>
                  <td>{row?.version}</td>
                  <td>{row?.combination}</td>
                  <td>{row?.lastUse}</td>
                  <td><Status tone="green">{row?.status}</Status></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Renk Geçmişi" sub="Seçili kart özeti">
        <VisualBox label={`${selected.pantone || selected.customerColorCode} ${selected.name}`} large color={selected.color} />
        <InfoLine label="Pantone" value={selected.pantone} />
        <InfoLine label="Müşteri renk kodu" value={selected.customerColorCode || "-"} />
        <InfoLine label="Renk adı" value={selected.name} />
        <InfoLine label="Boya türü" value={selected.dyeType} />
        <InfoLine label="Versiyon" value={selected.version} />
        <InfoLine label="Son model" value={selected.lastModel} />
        <InfoLine label="Versiyon sayısı" value="3" />
        <InfoLine label="Kullanılan model sayısı" value={selected.modelCount} />
        <div className="bh-action-stack">
          <button className="bh-btn primary" type="button">Bu Reçeteyi Aç</button>
          <button className="bh-btn" type="button">Bu Reçeteyi Kullan</button>
          <button className="bh-btn" type="button">Yeni Versiyon Oluştur</button>
          <button className="bh-btn" type="button">Renk Geçmişi Yazdır</button>
        </div>
      </Panel>
    </div>
  );
}
