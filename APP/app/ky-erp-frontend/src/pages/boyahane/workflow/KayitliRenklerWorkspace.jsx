/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useMemo, useState } from "react";
import { getRegisteredColor, listRegisteredColors } from "../../../services/boyahaneWorkflowApi";
import { RECIPE_STATUS, formatDate, formatKg, safeArray, statusTone } from "./boyahaneFormat";
import ModelThumbnail from "./ModelThumbnail";

export default function KayitliRenklerWorkspace({ activeMainCompany, recipesOnly = false }) {
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [paintType, setPaintType] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true; setLoading(true); setError("");
    listRegisteredColors(activeMainCompany).then((data) => live && setRows(safeArray(data))).catch((requestError) => live && setError(requestError.message)).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [activeMainCompany?.slug]);

  const paintTypes = useMemo(() => [...new Set(rows.flatMap((row) => safeArray(row.paintTypes)).filter(Boolean))], [rows]);
  const filtered = rows.filter((row) => {
    const text = `${row.pantone || ""} ${row.colorName || ""} ${row.customerColorCode || ""}`.toLocaleLowerCase("tr-TR");
    return (!query || text.includes(query.toLocaleLowerCase("tr-TR"))) && (!paintType || safeArray(row.paintTypes).includes(paintType)) && (!status || row.status === status);
  });

  async function open(row) {
    setError("");
    try { setSelected(await getRegisteredColor(activeMainCompany, row.id)); }
    catch (requestError) { setError(requestError.message); }
  }

  return <div className="bh-data-layout">
    <aside className="bh-card"><div className="bh-card-head"><div><h2>Filtreler</h2><small>Gerçek renk kartları</small></div></div><div className="bh-card-body bh-form-grid">
      <label className="bh-field"><span>Pantone veya renk ara</span><input value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <label className="bh-field"><span>Boya türü</span><select value={paintType} onChange={(event) => setPaintType(event.target.value)}><option value="">Tümü</option>{paintTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="bh-field"><span>Durum</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Tümü</option><option value="ACTIVE">Aktif</option><option value="PASSIVE">Pasif</option></select></label>
    </div></aside>
    <section className="bh-card"><div className="bh-card-head"><div><h2>{recipesOnly ? "Reçeteler" : "Kayıtlı Renkler"}</h2><small>{filtered.length} kart</small></div></div><div className="bh-card-body">
      {error ? <div className="bh-notice danger">{error}</div> : null}{loading ? <div className="bh-empty">Yükleniyor…</div> : null}
      <div className="bh-table-wrap wide"><table><thead><tr><th>Renk</th><th>Pantone</th><th>Renk adı</th><th>Müşteri kodu</th><th>Boya türleri</th><th>Versiyon sayısı</th><th>Aktif versiyon</th><th>Son kullanım</th><th>Kullanım</th><th>Durum</th><th>İşlem</th></tr></thead><tbody>{filtered.map((row) => <tr key={row.id}><td><i className="bh-swatch tiny" style={{ background: row.colorHex || "#cbd5e1" }} /></td><td>{row.pantone || "-"}</td><td>{row.colorName || "-"}</td><td>{row.customerColorCode || "-"}</td><td>{safeArray(row.paintTypes).join(", ") || "-"}</td><td>{row.versionCount || 0}</td><td>{row.activeVersion || "-"}</td><td>{formatDate(row.lastUsedAt)}</td><td>{row.usageCount || 0}</td><td><span className={`bh-status ${statusTone(row.status)}`}>{row.status}</span></td><td><button className="bh-btn mini primary" onClick={() => open(row)}>Aç</button></td></tr>)}</tbody></table></div>
    </div></section>
    {selected ? <div className="bh-modal" role="dialog" aria-modal="true"><div className="bh-modal-card bh-color-detail"><button className="bh-modal-close" onClick={() => setSelected(null)}>Kapat</button><div className="bh-color-detail-head"><i className="bh-swatch large" style={{ background: selected.colorHex || "#cbd5e1" }} /><div><h2>{selected.pantone || "-"} / {selected.colorName || "-"}</h2><p>Müşteri kodu: {selected.customerColorCode || "-"}</p><p>Toplam hazırlanan: {formatKg(safeArray(selected.productions).reduce((sum, row) => sum + Number(row.productionTotalKg || 0), 0))}</p></div></div>
      <h3 className="bh-section-title">Boya Türleri ve Versiyonlar</h3><div className="bh-table-wrap"><table><thead><tr><th>Boya türü</th><th>Versiyon</th><th>Durum</th><th>Ürün sayısı</th><th>Oluşturma</th></tr></thead><tbody>{safeArray(selected.recipes).map((recipe) => <tr key={recipe.id}><td>{recipe.dyeType}</td><td>{recipe.version}</td><td>{RECIPE_STATUS[recipe.status] || recipe.status}</td><td>{safeArray(recipe.lines).length}</td><td>{formatDate(recipe.createdAt)}</td></tr>)}</tbody></table></div>
      <h3 className="bh-section-title">Kullanıldığı Modeller</h3><div className="bh-table-wrap"><table><thead><tr><th>Görsel</th><th>Tarih</th><th>Model</th><th>Firma</th><th>Baskı</th><th>Versiyon</th><th>KG</th></tr></thead><tbody>{safeArray(selected.productions).map((item) => <tr key={item.id}><td><ModelThumbnail src={item.imageUrl} alt={item.modelSnapshot} /></td><td>{formatDate(item.createdAt)}</td><td>{item.modelSnapshot}</td><td>{item.companySnapshot || "-"}</td><td>{item.printRegionSnapshot || "-"}</td><td>{item.versionSnapshot}</td><td>{formatKg(item.productionTotalKg)}</td></tr>)}</tbody></table></div>
    </div></div> : null}
  </div>;
}
