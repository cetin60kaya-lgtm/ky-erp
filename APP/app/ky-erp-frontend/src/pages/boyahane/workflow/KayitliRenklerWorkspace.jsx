/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useMemo, useState } from "react";
import {
  getRegisteredColor,
  listRegisteredColors,
} from "../../../services/boyahaneWorkflowApi";
import { updateRegisteredColorIdentity } from "../../../services/boyahaneColorIdentityApi";
import {
  RECIPE_STATUS,
  formatDate,
  formatKg,
  safeArray,
  statusTone,
} from "./boyahaneFormat";
import ModelThumbnail from "./ModelThumbnail";

const SOURCE_LABELS = {
  PANTONE: "Pantoneye göre",
  REFERENCE: "Renk referansına göre",
  VISUAL: "Görsel / RGB’ye göre",
};
const COLOR_FAMILIES = ["KIRMIZI", "SARI", "MAVİ", "YEŞİL", "TURUNCU", "MOR", "PEMBE", "TURKUAZ", "BEYAZ", "SİYAH", "GRİ", "DİĞER"];

function sourceTypeOf(row) {
  return row?.sourceType || row?.colorSource || (row?.pantone ? "PANTONE" : "VISUAL");
}

function displayCode(row) {
  const sourceType = sourceTypeOf(row);
  if (sourceType === "REFERENCE") return row.referenceCode || row.referenceName || row.basePantone || row.pantone || "REFERANS";
  if (sourceType === "VISUAL") return row.colorHex || row.colorName || "RGB";
  return row.pantone || "Pantone yok";
}

function catalogFormulaOf(row) {
  const formula = row?.catalogFormula;
  return formula && safeArray(formula.lines).length ? formula : null;
}

function gramText(value) {
  const number = Number(value || 0);
  return Number.isInteger(number) ? String(number) : number.toFixed(number < 10 ? 2 : 1).replace(/.0+$/, "");
}

function editDraft(row) {
  return {
    sourceType: sourceTypeOf(row),
    colorName: row.colorName || "",
    pantone: row.pantone || row.basePantone || "",
    basePantone: row.basePantone || row.pantone || "",
    referenceName: row.referenceName || "",
    referenceCode: row.referenceCode || row.customerColorCode || "",
    referenceNote: row.referenceNote || "",
    referenceImageUrl: row.referenceImageUrl || "",
    colorHex: row.colorHex || "#cbd5e1",
    colorFamily: row.colorFamily || "DİĞER",
  };
}

export default function KayitliRenklerWorkspace({
  activeMainCompany,
  openModule,
  moduleActionContext,
}) {
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [paintType, setPaintType] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [colorFamily, setColorFamily] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const safe = safeArray(await listRegisteredColors(activeMainCompany));
      setRows(safe);
      const requested = moduleActionContext?.registeredColorId;
      if (requested) {
        const detail = await getRegisteredColor(activeMainCompany, requested);
        setSelected(detail);
        setDraft(editDraft(detail));
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [activeMainCompany?.slug, moduleActionContext?.nonce]);

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
  const families = useMemo(
    () => [...new Set([...COLOR_FAMILIES, ...cards.map((row) => row.colorFamily).filter(Boolean)])],
    [cards],
  );

  const filtered = cards.filter((row) => {
    const text = [
      row.pantone,
      row.basePantone,
      row.colorName,
      row.customerColorCode,
      row.referenceName,
      row.referenceCode,
      row.referenceNote,
      row.colorHex,
      row.colorFamily,
      row.sourceLabel,
      row.cardPaintType,
      ...safeArray(row.catalogFormula?.lines).map((line) => line.productName),
    ].join(" ").toLocaleLowerCase("tr-TR");
    return (
      (!query || text.includes(query.toLocaleLowerCase("tr-TR"))) &&
      (!paintType || row.cardPaintType === paintType) &&
      (!sourceType || sourceTypeOf(row) === sourceType) &&
      (!colorFamily || row.colorFamily === colorFamily) &&
      (!status || row.status === status)
    );
  });

  async function open(row) {
    setError("");
    setMessage("");
    setEditing(false);
    try {
      const detail = await getRegisteredColor(activeMainCompany, row.id);
      setSelected(detail);
      setDraft(editDraft(detail));
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function saveIdentity() {
    if (!selected?.id || !draft) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const saved = await updateRegisteredColorIdentity(activeMainCompany, selected.id, {
        ...draft,
        basePantone: draft.sourceType === "REFERENCE" ? draft.pantone : "",
        pantone: draft.sourceType === "VISUAL" ? "" : draft.pantone,
        isPantoneExact: draft.sourceType === "PANTONE",
      });
      const detail = await getRegisteredColor(activeMainCompany, saved.id);
      setSelected(detail);
      setDraft(editDraft(detail));
      setEditing(false);
      setMessage("Renk kaynağı ve kimliği güncellendi. Reçete versiyonları korunmuştur.");
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  const recipes = safeArray(selected?.recipes).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const productions = safeArray(selected?.productions);
  const activeRecipe = recipes.find((row) => row.status === "ACTIVE") || recipes[0];
  const catalogFormula = catalogFormulaOf(selected);
  const selectedSource = sourceTypeOf(selected);

  return (
    <div className="bh-colors-hub bh-color-memory-v2">
      <section className="bh-operation-intro">
        <div>
          <small>KAYITLI RENKLER</small>
          <h2>Renk ve Reçete Hafızası</h2>
          <p>Pantone, kumaş/renk referansı ve görsel RGB kayıtları birbirine karışmadan ayrı tutulur.</p>
        </div>
        <button type="button" className="bh-btn primary" onClick={() => openModule?.("boyahane", { tabKey: "receteler" })}>+ Numuneden Yeni Renk</button>
      </section>

      <section className="bh-report-filters bh-color-memory-filters">
        <label><span>Renk ara</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="19-4151, saks, referans, mavi, #173b77…" /></label>
        <label><span>Renk kaynağı</span><select value={sourceType} onChange={(event) => setSourceType(event.target.value)}><option value="">Tümü</option>{Object.entries(SOURCE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label><span>Renk ailesi</span><select value={colorFamily} onChange={(event) => setColorFamily(event.target.value)}><option value="">Tümü</option>{families.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span>Boya türü</span><select value={paintType} onChange={(event) => setPaintType(event.target.value)}><option value="">Tümü</option>{paintTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span>Durum</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Tümü</option><option value="ACTIVE">Aktif</option><option value="PASSIVE">Pasif</option></select></label>
        <button type="button" className="bh-btn" onClick={() => { setQuery(""); setPaintType(""); setSourceType(""); setColorFamily(""); setStatus(""); }}>Temizle</button>
      </section>

      <div className="bh-color-family-shortcuts">
        {COLOR_FAMILIES.slice(0, 11).map((item) => <button type="button" key={item} className={colorFamily === item ? "active" : ""} onClick={() => setColorFamily(colorFamily === item ? "" : item)}>{item}</button>)}
      </div>

      {message ? <div className="bh-notice success">{message}</div> : null}
      {error ? <div className="bh-notice danger">{error}</div> : null}
      {loading ? <div className="bh-empty large">Kayıtlı renkler yükleniyor…</div> : null}

      <section className="bh-color-card-grid bh-color-card-grid-v2">
        {filtered.map((row) => {
          const source = sourceTypeOf(row);
          return (
            <button type="button" className={`bh-color-card source-${source.toLowerCase()}`} key={`${row.id}-${row.cardPaintType}`} onClick={() => open(row)}>
              <div className="bh-color-card-swatch" style={{ background: row.colorHex || "#cbd5e1" }} />
              <div className="bh-color-card-copy">
                <div className="bh-color-card-badges"><span className={`bh-color-source-badge ${source.toLowerCase()}`}>{SOURCE_LABELS[source]}</span><span className={`bh-status ${statusTone(row.status)}`}>{row.status || "ACTIVE"}</span></div>
                <h3>{displayCode(row)}</h3>
                <p>{row.colorName || "Renk adı yok"}</p>
                {source === "REFERENCE" ? <small>{row.basePantone ? `Baz Pantone: ${row.basePantone}` : "Pantone dışı referans"} · {row.referenceName || row.referenceCode || "Referans"}</small> : null}
                {source === "VISUAL" ? <small>{row.colorHex || "RGB yok"} · {row.colorFamily || "Renk ailesi yok"}</small> : null}
                <div className="bh-color-card-meta">
                  <span>Boya türü <b>{row.cardPaintType || "-"}</b></span>
                  <span>Son versiyon <b>{row.activeVersion || "V1"}</b></span>
                  <span>Son model <b>{row.lastModelName || row.lastUsedModel || "-"}</b></span>
                  <span>Reçete <b>{row.recipeCount || 0}</b></span>
                </div>
                {catalogFormulaOf(row) ? (
                  <small><b>Bileşenler:</b> {safeArray(row.catalogFormula.lines).slice(0, 5).map((line) => (line.productName || "-") + " " + gramText(line.referenceGram) + " gr").join(" · ")}{safeArray(row.catalogFormula.lines).length > 5 ? " · +" + (safeArray(row.catalogFormula.lines).length - 5) : ""}</small>
                ) : <small>Bileşen kaydı yok.</small>}
              </div>
            </button>
          );
        })}
        {!filtered.length && !loading ? <div className="bh-empty large">Filtreye uygun kayıtlı renk bulunamadı.</div> : null}
      </section>

      {selected ? (
        <aside className="bh-color-detail-panel" role="dialog" aria-modal="true">
          <div className="bh-color-detail-toolbar">
            <div><small>RENK DETAYI</small><strong>{displayCode(selected)} · {selected.colorName || "Renk"}</strong></div>
            <div className="bh-row-actions"><button type="button" className="bh-btn" onClick={() => setEditing((value) => !value)}>{editing ? "Düzenlemeyi Kapat" : "Kimliği Düzenle"}</button><button type="button" className="bh-btn" onClick={() => setSelected(null)}>Kapat</button></div>
          </div>

          <div className="bh-color-detail-hero">
            <i style={{ background: selected.colorHex || "#cbd5e1" }} />
            <div>
              <span className={`bh-color-source-badge ${selectedSource.toLowerCase()}`}>{SOURCE_LABELS[selectedSource]}</span>
              <h2>{displayCode(selected)} · {selected.colorName || "-"}</h2>
              {selectedSource === "PANTONE" ? <p>Standart Pantone hedefi: <strong>{selected.pantone}</strong></p> : null}
              {selectedSource === "REFERENCE" ? <><p>Baz Pantone: <strong>{selected.basePantone || selected.pantone || "Yok"}</strong></p><p>Referans: <strong>{selected.referenceName || selected.referenceCode || "-"}</strong></p><p className="bh-reference-warning">Bu reçete Pantone standardına göre değil, müşteri/kumaş renk referansına göre hazırlanmıştır.</p></> : null}
              {selectedSource === "VISUAL" ? <p>Görsel renk: <strong>{selected.colorHex || "-"}</strong> · {selected.colorFamily || "-"}</p> : null}
              <p>Toplam hazırlanan: <strong>{formatKg(productions.reduce((sum, row) => sum + Number(row.productionTotalKg || 0), 0))}</strong></p>
              <p>Son onaylı reçete: <strong>{activeRecipe ? `${activeRecipe.dyeType || activeRecipe.paintType} / ${activeRecipe.version}` : "Yok"}</strong></p>
            </div>
          </div>

          {editing && draft ? (
            <section className="bh-card bh-color-identity-editor">
              <div className="bh-card-head"><div><h2>Renk Kimliğini Düzenle</h2><small>Reçete ve kullanım geçmişi silinmez.</small></div></div>
              <div className="bh-card-body">
                <div className="bh-form-grid three">
                  <label className="bh-field"><span>Renk kaynağı</span><select value={draft.sourceType} onChange={(event) => setDraft((current) => ({ ...current, sourceType: event.target.value }))}>{Object.entries(SOURCE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
                  <label className="bh-field"><span>Renk adı</span><input value={draft.colorName} onChange={(event) => setDraft((current) => ({ ...current, colorName: event.target.value }))} /></label>
                  <label className="bh-field"><span>Renk ailesi</span><select value={draft.colorFamily} onChange={(event) => setDraft((current) => ({ ...current, colorFamily: event.target.value }))}>{COLOR_FAMILIES.map((item) => <option key={item}>{item}</option>)}</select></label>
                  {draft.sourceType !== "VISUAL" ? <label className="bh-field"><span>{draft.sourceType === "REFERENCE" ? "Baz Pantone" : "Pantone"}</span><input value={draft.pantone} onChange={(event) => setDraft((current) => ({ ...current, pantone: event.target.value }))} /></label> : null}
                  {draft.sourceType === "REFERENCE" ? <><label className="bh-field"><span>Referans adı</span><input value={draft.referenceName} onChange={(event) => setDraft((current) => ({ ...current, referenceName: event.target.value }))} /></label><label className="bh-field"><span>Referans kodu</span><input value={draft.referenceCode} onChange={(event) => setDraft((current) => ({ ...current, referenceCode: event.target.value }))} /></label><label className="bh-field wide"><span>Referans notu</span><input value={draft.referenceNote} onChange={(event) => setDraft((current) => ({ ...current, referenceNote: event.target.value }))} /></label></> : null}
                  {draft.sourceType !== "PANTONE" ? <label className="bh-field bh-color-picker-field"><span>Renk kutusu</span><div><input type="color" value={draft.colorHex || "#cbd5e1"} onChange={(event) => setDraft((current) => ({ ...current, colorHex: event.target.value }))} /><input value={draft.colorHex} onChange={(event) => setDraft((current) => ({ ...current, colorHex: event.target.value }))} /></div></label> : null}
                </div>
                <div className="bh-work-actions"><button type="button" className="bh-btn primary" disabled={busy} onClick={saveIdentity}>Kimliği Kaydet</button></div>
              </div>
            </section>
          ) : null}

          <div className="bh-color-detail-actions">
            <button type="button" className="bh-btn" onClick={() => openModule?.("boyahane", { tabKey: "receteler", actionContext: { registeredColorId: selected.id } })}>Kayıtlı Gramajla Numuneye Çek</button>
            <button type="button" className="bh-btn primary" onClick={() => openModule?.("boyahane", { tabKey: "uretim-gecmisi", actionContext: { registeredColorId: selected.id } })}>Kayıtlı Gramajla İmalat Hazırla</button>
          </div>

          <section className="bh-card"><div className="bh-card-head"><div><h2>Arşiv Bileşen Formülü</h2><small>Eski PANTONE FORMUL kaydından temizlenmiştir; üretimde gerçek ürün ve lot tekrar doğrulanır.</small></div></div><div className="bh-card-body">{catalogFormula ? <div className="bh-table-wrap"><table><thead><tr><th>Bileşen</th><th>GR</th><th>Oran</th></tr></thead><tbody>{safeArray(catalogFormula.lines).map((line) => <tr key={line.id || line.productName}><td><strong>{line.productName || "-"}</strong></td><td>{gramText(line.referenceGram)}</td><td>{Number(line.percentage || (Number(catalogFormula.totalGr || 0) ? Number(line.referenceGram || 0) / Number(catalogFormula.totalGr) * 100 : 0)).toFixed(2)}%</td></tr>)}</tbody><tfoot><tr><th>Toplam</th><th>{gramText(catalogFormula.totalGr)} gr</th><th>100%</th></tr></tfoot></table></div> : <div className="bh-empty">Bu temiz renk kartında arşiv bileşen kaydı bulunmuyor.</div>}</div></section>

          <section className="bh-card"><div className="bh-card-head"><div><h2>Onaylı Reçete</h2><small>{SOURCE_LABELS[selectedSource]} · ürünler ve gramajlar aynen kullanılır.</small></div></div><div className="bh-card-body">{activeRecipe ? <div className="bh-table-wrap"><table><thead><tr><th>Ürün / Bileşen</th><th>Referans GR</th><th>Yüzde</th></tr></thead><tbody>{safeArray(activeRecipe.lines).map((line) => <tr key={line.id}><td>{line.productName || "-"}</td><td>{Number(line.referenceGram || line.totalGr || 0).toFixed(2)}</td><td>{Number(activeRecipe.totalGr || 0) ? (Number(line.referenceGram || line.totalGr || 0) / Number(activeRecipe.totalGr) * 100).toFixed(2) : "0.00"}%</td></tr>)}</tbody></table></div> : <div className="bh-empty">Onaylı reçete bulunmuyor.</div>}</div></section>

          <section className="bh-card"><div className="bh-card-head"><div><h2>Versiyon Geçmişi</h2><small>Aynı renk kaynağı içindeki V1, V2 ve V3 kayıtlarıdır.</small></div></div><div className="bh-card-body"><div className="bh-table-wrap"><table><thead><tr><th>Boya türü</th><th>Versiyon</th><th>Durum</th><th>Bileşen</th><th>Oluşturma</th></tr></thead><tbody>{recipes.map((recipe) => <tr key={recipe.id}><td>{recipe.dyeType || recipe.paintType || "-"}</td><td><strong>{recipe.version}</strong></td><td>{RECIPE_STATUS[recipe.status] || recipe.status}</td><td>{safeArray(recipe.lines).length}</td><td>{formatDate(recipe.createdAt)}</td></tr>)}</tbody></table></div></div></section>

          <section className="bh-card"><div className="bh-card-head"><div><h2>Kullanıldığı Modeller</h2><small>Pantone, referans veya görsel kimliğiyle ayrı kullanım geçmişi tutulur.</small></div></div><div className="bh-card-body"><div className="bh-table-wrap"><table><thead><tr><th>Görsel</th><th>Tarih</th><th>Model</th><th>Firma</th><th>Kanal / Baskı</th><th>Versiyon</th><th>KG</th><th>İş türü</th></tr></thead><tbody>{productions.map((item) => <tr key={item.id}><td><ModelThumbnail src={item.imageUrl} alt={item.modelSnapshot} /></td><td>{formatDate(item.createdAt)}</td><td>{item.modelSnapshot || item.modelName || "-"}</td><td>{item.companySnapshot || "-"}</td><td>{item.channelName || item.printRegionSnapshot || "-"}</td><td>{item.versionSnapshot || "-"}</td><td>{formatKg(item.productionTotalKg)}</td><td>{item.jobType || "PRODUCTION"}</td></tr>)}</tbody></table></div></div></section>
        </aside>
      ) : null}
    </div>
  );
}
