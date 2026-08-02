/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useMemo, useState } from "react";
import {
  getRegisteredColor,
  listRegisteredColors,
} from "../../../services/boyahaneWorkflowApi";
import {
  RECIPE_STATUS,
  formatDate,
  formatKg,
  safeArray,
  statusTone,
} from "./boyahaneFormat";
import ModelThumbnail from "./ModelThumbnail";

export default function KayitliRenklerWorkspace({
  activeMainCompany,
  openModule,
  moduleActionContext,
}) {
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [paintType, setPaintType] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    listRegisteredColors(activeMainCompany)
      .then(async (data) => {
        if (!live) return;
        const safe = safeArray(data);
        setRows(safe);
        const requested = moduleActionContext?.registeredColorId;
        if (requested) {
          const row = safe.find((item) => item.id === requested);
          if (row) setSelected(await getRegisteredColor(activeMainCompany, row.id));
        }
      })
      .catch((requestError) => live && setError(requestError.message))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [activeMainCompany?.slug, moduleActionContext?.nonce]);

  const cards = useMemo(
    () => rows.flatMap((row) => {
      const types = safeArray(row.paintTypes).length
        ? safeArray(row.paintTypes)
        : [row.dyeType || row.paintType || "GENEL"];
      return types.map((type) => ({ ...row, cardPaintType: type }));
    }),
    [rows],
  );
  const paintTypes = useMemo(
    () => [...new Set(cards.map((row) => row.cardPaintType).filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr-TR")),
    [cards],
  );
  const filtered = cards.filter((row) => {
    const text = `${row.pantone || ""} ${row.colorName || ""} ${row.customerColorCode || ""} ${row.cardPaintType || ""}`.toLocaleLowerCase("tr-TR");
    return (!query || text.includes(query.toLocaleLowerCase("tr-TR"))) && (!paintType || row.cardPaintType === paintType) && (!status || row.status === status);
  });

  async function open(row) {
    setError("");
    try { setSelected(await getRegisteredColor(activeMainCompany, row.id)); }
    catch (requestError) { setError(requestError.message); }
  }

  const recipes = safeArray(selected?.recipes).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const productions = safeArray(selected?.productions);
  const activeRecipe = recipes.find((row) => row.status === "ACTIVE") || recipes[0];

  return (
    <div className="bh-colors-hub">
      <section className="bh-operation-intro">
        <div>
          <small>KAYITLI RENKLER</small>
          <h2>Renk ve Reçete Hafızası</h2>
          <p>Ana renk kartı Pantone/renk kodu + boya türüdür. V1, V2 ve V3 aynı kartın altında geçmiş olarak tutulur.</p>
        </div>
        <button type="button" className="bh-btn primary" onClick={() => openModule?.("boyahane", { tabKey: "receteler" })}>+ Numuneden Yeni Renk</button>
      </section>

      <section className="bh-report-filters">
        <label><span>Pantone veya renk ara</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="18-1663, kırmızı, müşteri kodu…" /></label>
        <label><span>Boya türü</span><select value={paintType} onChange={(event) => setPaintType(event.target.value)}><option value="">Tümü</option>{paintTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span>Durum</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Tümü</option><option value="ACTIVE">Aktif</option><option value="PASSIVE">Pasif</option></select></label>
        <button type="button" className="bh-btn" onClick={() => { setQuery(""); setPaintType(""); setStatus(""); }}>Filtreyi Temizle</button>
      </section>

      {error ? <div className="bh-notice danger">{error}</div> : null}
      {loading ? <div className="bh-empty large">Kayıtlı renkler yükleniyor…</div> : null}

      <section className="bh-color-card-grid">
        {filtered.map((row) => (
          <button type="button" className="bh-color-card" key={`${row.id}-${row.cardPaintType}`} onClick={() => open(row)}>
            <div className="bh-color-card-swatch" style={{ background: row.colorHex || "#cbd5e1" }} />
            <div className="bh-color-card-copy">
              <span className={`bh-status ${statusTone(row.status)}`}>{row.status || "ACTIVE"}</span>
              <h3>{row.pantone || row.customerColorCode || "Renk kodu yok"}</h3>
              <p>{row.colorName || "Türkçe renk adı yok"}</p>
              <div className="bh-color-card-meta">
                <span>Boya türü <b>{row.cardPaintType || "-"}</b></span>
                <span>Son versiyon <b>{row.activeVersion || "V1"}</b></span>
                <span>Son model <b>{row.lastModelName || row.lastUsedModel || "-"}</b></span>
                <span>Kullanım <b>{row.usageCount || 0}</b></span>
              </div>
            </div>
          </button>
        ))}
        {!filtered.length && !loading ? <div className="bh-empty large">Filtreye uygun kayıtlı renk bulunamadı.</div> : null}
      </section>

      {selected ? (
        <aside className="bh-color-detail-panel" role="dialog" aria-modal="true">
          <div className="bh-color-detail-toolbar">
            <div><small>RENK DETAYI</small><strong>{selected.pantone || selected.customerColorCode || "Renk"}</strong></div>
            <button type="button" className="bh-btn" onClick={() => setSelected(null)}>Kapat</button>
          </div>
          <div className="bh-color-detail-hero">
            <i style={{ background: selected.colorHex || "#cbd5e1" }} />
            <div>
              <span className={`bh-status ${statusTone(selected.status)}`}>{selected.status || "ACTIVE"}</span>
              <h2>{selected.pantone || "-"} · {selected.colorName || "-"}</h2>
              <p>Müşteri / şirket içi kodu: {selected.customerColorCode || "-"}</p>
              <p>Toplam hazırlanan: <strong>{formatKg(productions.reduce((sum, row) => sum + Number(row.productionTotalKg || 0), 0))}</strong></p>
              <p>Son onaylı reçete: <strong>{activeRecipe ? `${activeRecipe.dyeType || activeRecipe.paintType} / ${activeRecipe.version}` : "Yok"}</strong></p>
            </div>
          </div>
          <div className="bh-color-detail-actions">
            <button type="button" className="bh-btn" onClick={() => openModule?.("boyahane", { tabKey: "receteler", actionContext: { registeredColorId: selected.id } })}>Numuneye Çek</button>
            <button type="button" className="bh-btn primary" onClick={() => openModule?.("boyahane", { tabKey: "uretim-gecmisi", actionContext: { registeredColorId: selected.id } })}>İmalat Hazırla</button>
          </div>

          <section className="bh-card"><div className="bh-card-head"><div><h2>Onaylı Reçete</h2><small>Taslak reçete stok düşürmez.</small></div></div><div className="bh-card-body">{activeRecipe ? <div className="bh-table-wrap"><table><thead><tr><th>Ürün</th><th>Referans GR</th><th>Yüzde</th></tr></thead><tbody>{safeArray(activeRecipe.lines).map((line) => <tr key={line.id}><td>{line.productName || "-"}</td><td>{Number(line.referenceGram || line.totalGr || 0).toFixed(2)}</td><td>{Number(activeRecipe.totalGr || 0) ? (Number(line.referenceGram || line.totalGr || 0) / Number(activeRecipe.totalGr) * 100).toFixed(2) : "0.00"}%</td></tr>)}</tbody></table></div> : <div className="bh-empty">Onaylı reçete bulunmuyor.</div>}</div></section>

          <section className="bh-card"><div className="bh-card-head"><div><h2>Versiyon Geçmişi</h2><small>Eski kayıtların üzerine yazılmaz.</small></div></div><div className="bh-card-body"><div className="bh-table-wrap"><table><thead><tr><th>Boya türü</th><th>Versiyon</th><th>Durum</th><th>Ürün</th><th>Oluşturma</th></tr></thead><tbody>{recipes.map((recipe) => <tr key={recipe.id}><td>{recipe.dyeType || recipe.paintType || "-"}</td><td><strong>{recipe.version}</strong></td><td>{RECIPE_STATUS[recipe.status] || recipe.status}</td><td>{safeArray(recipe.lines).length}</td><td>{formatDate(recipe.createdAt)}</td></tr>)}</tbody></table></div></div></section>

          <section className="bh-card"><div className="bh-card-head"><div><h2>Kullanıldığı Modeller</h2><small>Aynı Pantone birden çok kanalda ayrı kullanım kaydı tutar.</small></div></div><div className="bh-card-body"><div className="bh-table-wrap"><table><thead><tr><th>Görsel</th><th>Tarih</th><th>Model</th><th>Firma</th><th>Kanal / Baskı</th><th>Versiyon</th><th>KG</th><th>İş türü</th></tr></thead><tbody>{productions.map((item) => <tr key={item.id}><td><ModelThumbnail src={item.imageUrl} alt={item.modelSnapshot} /></td><td>{formatDate(item.createdAt)}</td><td>{item.modelSnapshot || item.modelName || "-"}</td><td>{item.companySnapshot || "-"}</td><td>{item.channelName || item.printRegionSnapshot || "-"}</td><td>{item.versionSnapshot || "-"}</td><td>{formatKg(item.productionTotalKg)}</td><td>{item.jobType || "PRODUCTION"}</td></tr>)}</tbody></table></div></div></section>
        </aside>
      ) : null}
    </div>
  );
}
