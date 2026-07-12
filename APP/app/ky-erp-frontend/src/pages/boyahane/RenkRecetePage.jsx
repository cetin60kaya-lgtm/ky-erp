import { useEffect, useMemo, useState } from "react";
import { Field, InfoLine, Panel, Status, VisualBox, formatGr } from "./BoyahaneShared";
import { approvedInventory, initialRecipeRows, modelPool, products } from "./boyahaneData";
import { fetchMuhasebeModels } from "../../services/muhasebeService";
import { activePrintRegions } from "../../services/modelPrintRegionService";

function productByEntry(value) {
  const normalized = String(value || "").toLocaleLowerCase("tr-TR").trim();
  return products.find((product) => {
    const labels = [product.name, product.shortName, product.code, product.commercialCode].filter(Boolean);
    return labels.some((label) => String(label).toLocaleLowerCase("tr-TR") === normalized);
  });
}

function productByName(name) {
  return products.find((product) => product.name === name || product.shortName === name || product.commercialCode === name);
}

function productOptions(dyeType) {
  const normalizedType = String(dyeType || "").toLocaleUpperCase("tr-TR");
  const allowed =
    normalizedType === "SUBAZLI"
       ? ["SUBAZLI", "PIGMENT", "GENEL"]
      : normalizedType === "ECOPLAST"
         ? ["ECOPLAST", "PIGMENT", "GENEL"]
        : normalizedType === "PIGMENT"
           ? ["PIGMENT", "GENEL"]
          : normalizedType === "GENEL"
             ? ["GENEL", "SUBAZLI"]
            : [normalizedType, "GENEL", "PIGMENT", "SUBAZLI"];
  return products.filter((product) => allowed.includes(product.type)).map((product) => ({
    value: product.name,
    label: `${product.shortName || product.code} / ${product.name}`,
  }));
}

function rowStatus(row) {
  if (!row?.productName && !row?.lot) return { label: "Boş", tone: "gray" };
  if (!row?.lot) return { label: "Lot Yok", tone: "red" };
  const product = productByName(row?.productName);
  const lot = product.lots.find((item) => item.lot === row?.lot);
  if (lot.status === "Pasif" || lot.note === "Biten") return { label: "Pasif Lot", tone: "red" };
  if (lot.status === "Kritik") return { label: "Kritik Lot", tone: "orange" };
  if (Number(row?.productionGr || 0) !== Number(row?.trial1 || 0) + Number(row?.trial2 || 0) + Number(row?.trial3 || 0)) {
    return { label: "Kontrol", tone: "orange" };
  }
  return { label: "Tamam", tone: "green" };
}

function statusTone(status) {
  if (status === "Hazır" || status === "Tamam") return "green";
  if (["Reçete bekliyor", "Reçete oluştur", "Gramaj eksik", "Lot kontrol", "Tanımla", "Kayıtlı renk yok"].includes(status)) return "orange";
  return "blue";
}

function emptyLine() {
  return {
    id: Date.now(),
    productName: "",
    trial1: 0,
    trial2: 0,
    trial3: 0,
    productionGr: 0,
    lot: "",
    dyeType: "",
  };
}

function emptyLines(count = 5) {
  return Array.from({ length: count }, (_, index) => ({ ...emptyLine(), id: Date.now() + index }));
}

export default function RenkRecetePage({ activeMainCompany }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Tümü");
  const [selectedModelId, setSelectedModelId] = useState(modelPool[0].id || "");
  const [selectedColorId, setSelectedColorId] = useState(modelPool[0].colors[1].id || modelPool[0].colors[0].id || "");
  const [recipeRowsByColor, setRecipeRowsByColor] = useState({ "a150-kirmizi": initialRecipeRows });
  const [convertedColors, setConvertedColors] = useState({});
  const [showImageModal, setShowImageModal] = useState(false);
  const [sharedModels, setSharedModels] = useState([]);

  useEffect(() => {
    let alive = true;
    fetchMuhasebeModels(activeMainCompany)
      .then((rows) => {
        if (alive) setSharedModels(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (alive) setSharedModels([]);
      });
    return () => {
      alive = false;
    };
  }, [activeMainCompany?.id, activeMainCompany?.slug]);

  const models = useMemo(() => {
    const common = new Map(
      sharedModels.map((model) => [
        String(model?.modelName || model?.modelAdi || model?.name || "").toLocaleUpperCase("tr-TR"),
        model,
      ]),
    );
    return modelPool.map((model) => {
      const shared = common.get(String(model?.modelName || "").toLocaleUpperCase("tr-TR"));
      const regions = shared ? activePrintRegions(shared) : [];
      return regions.length
         ? { ...model, printStructure: regions.map((region) => region.regionName).join(" + ") }
        : model;
    });
  }, [sharedModels]);

  const selectedModel = models.find((model) => model.id === selectedModelId) || null;
  const baseColor = selectedModel?.colors.find((color) => color.id === selectedColorId) || selectedModel?.colors[0] || null;
  const selectedColor = baseColor ? { ...baseColor, ...convertedColors[baseColor.id] } : null;
  const rows = selectedColor ? recipeRowsByColor[selectedColor.id] || initialRecipeRows : [];

  const filteredModels = models.filter((model) => {
    const haystack = `${model?.modelName} ${model?.company} ${model?.orderNo} ${model?.dispatchNo}`.toLocaleLowerCase("tr-TR");
    const matchesQuery = !query.trim() || haystack.includes(query.trim().toLocaleLowerCase("tr-TR"));
    const matchesFilter =
      filter === "Tümü" ||
      (filter === "Reçete bekleyen" && model.status === "Reçete bekliyor") ||
      (filter === "Gramaj eksik" && model?.colors.some((color) => color.status === "Gramaj eksik")) ||
      (filter === "Lot kontrol" && model?.colors.some((color) => color.status === "Lot kontrol")) ||
      (filter === "Hazır" && model.status === "Hazır");
    return matchesQuery && matchesFilter;
  });

  const enrichedRows = useMemo(
    () =>
      rows.map((row) => {
        const trialTotal = Number(row?.trial1 || 0) + Number(row?.trial2 || 0) + Number(row?.trial3 || 0);
        const totalGr = Number(row?.productionGr || 0) || trialTotal;
        return { ...row, trialTotal, totalGr, status: rowStatus(row) };
      }),
    [rows],
  );

  const totalGr = enrichedRows.reduce((sum, row) => sum + row?.totalGr, 0);
  const trialTotal = enrichedRows.reduce((sum, row) => sum + row?.trialTotal, 0);
  const productionTotal = enrichedRows.reduce((sum, row) => sum + Number(row?.productionGr || 0), 0);
  const multipliedGr = productionTotal * Number(selectedColor.multiplier || 1);
  const lotWarnings = enrichedRows.filter((row) => row?.status.label === "Lot Yok" || row?.status.label === "Pasif Lot").length;
  const undefinedColors = selectedModel?.colors.filter((color) => !(convertedColors[color.id].saved ?? color.saved)) || [];
  const suggestedProductOptions = productOptions(selectedColor.dyeType);

  const canSave =
    Boolean(selectedModel?.id) &&
    Boolean(selectedModel?.modelName) &&
    Boolean(selectedModel?.modelOrderId || selectedModel?.orderNo) &&
    Boolean(selectedColor.id) &&
    Boolean(selectedColor.colorName) &&
    Boolean(selectedColor.pantone || selectedColor.customerColorCode) &&
    Boolean(selectedColor.dyeType) &&
    Boolean(selectedColor.version) &&
    rows.some((row) => row?.productName);

  const warningList = [
    !selectedModel ? "Model seçilmedi" : "",
    !selectedColor ? "Renk seçilmedi" : "",
    enrichedRows.some((row) => row?.productName && row?.status.label === "Lot Yok") ? "Lot eksik" : "",
    enrichedRows.some((row) => row?.status.label === "Pasif Lot") ? "Pasif lot seçili" : "",
    selectedColor && !selectedColor.saved ? "Kayıtlı renk yok" : "",
    selectedColor.status === "Gramaj eksik" ? "Gramaj eksik" : "",
  ].filter(Boolean);

  function setRowsForColor(nextRows) {
    if (!selectedColor) return;
    setRecipeRowsByColor((current) => ({ ...current, [selectedColor.id]: nextRows }));
  }

  function updateRow(id, key, value) {
    if (!selectedColor) return;
    setRowsForColor(
      rows.map((row) => {
        if (row?.id !== id) return row;
        if (key === "productName") {
          const product = productByEntry(value) || productByName(value);
          return {
            ...row,
            productName: product.name || value,
            dyeType: product.type || row?.dyeType,
            lot: product.defaultLot || row?.lot,
          };
        }
        return { ...row, [key]: ["trial1", "trial2", "trial3", "productionGr"].includes(key) ? Number(value || 0) : value };
      }),
    );
  }

  function addLine() {
    setRowsForColor([...rows, { ...emptyLine(), id: Date.now() + rows.length }]);
  }

  function removeLine(id) {
    setRowsForColor(rows.filter((row) => row?.id !== id));
  }

  function selectModel(model) {
    setSelectedModelId(model?.id);
    const colorId = model?.colors[0].id || "";
    setSelectedColorId(colorId);
    const firstColor = model?.colors[0];
    if (firstColor && !firstColor.saved && !recipeRowsByColor[firstColor.id]) {
      setRecipeRowsByColor((current) => ({ ...current, [firstColor.id]: emptyLines(5) }));
    }
  }

  function openColor(color) {
    setSelectedColorId(color.id);
    if (!color.saved && !recipeRowsByColor[color.id]) {
      setRecipeRowsByColor((current) => ({ ...current, [color.id]: emptyLines(5) }));
    }
  }

  function updateSelectedColor(key, value) {
    if (!selectedColor) return;
    setConvertedColors((current) => ({
      ...current,
      [selectedColor.id]: {
        ...current[selectedColor.id],
        [key]: value,
      },
    }));
  }

  function convertUndefinedColor() {
    if (!selectedColor) return;
    setConvertedColors((current) => ({
      ...current,
      [selectedColor.id]: {
        ...current[selectedColor.id],
        saved: true,
        colorName: selectedColor.colorName,
        customerColorCode: selectedColor.customerColorCode,
        pantone: selectedColor.pantone,
        dyeType: selectedColor.dyeType,
        preview: selectedColor.preview,
        version: selectedColor.version || "v1",
        status: "Hazır",
        lotStatus: "Tamam",
      },
    }));
  }

  return (
    <div className="bh-grid-3">
      <Panel title="Model Havuzu" sub="Desen, muhasebe irsaliyesi ve manuel işler">
        <div className="bh-form-grid">
          <Field label="Model / firma / sipariş / irsaliye ara">
            <input value={query} onChange={(event) => setQuery(event?.target.value)} placeholder="A-150, TAHA, TIA..." />
          </Field>
          <Field label="Filtre">
            <select value={filter} onChange={(event) => setFilter(event?.target.value)}>
              <option>Reçete bekleyen</option>
              <option>Gramaj eksik</option>
              <option>Lot kontrol</option>
              <option>Hazır</option>
              <option>Tümü</option>
            </select>
          </Field>
        </div>
        <div className="bh-list">
          {filteredModels.map((model) => (
            <button key={model?.id} type="button" className={selectedModel.id === model?.id ? "active" : ""} onClick={() => selectModel(model)}>
              <strong>{model?.modelName}</strong>
              <span>Firma: {model?.company}</span>
              <span>Sipariş: {model?.orderNo}</span>
              <span>İrsaliye: {model?.dispatchNo}</span>
              <span>Adet: {model?.incomingQty.toLocaleString("tr-TR")}</span>
              <span>Baskı: {model?.printStructure}</span>
              <span>Renk: {model?.colorCount} / Tanımsız: {model?.undefinedColorCount}</span>
              <Status tone={statusTone(model?.status)}>{model?.status}</Status>
            </button>
          ))}
        </div>
      </Panel>

      <Panel
        title="Model Renkleri ve Gramaj"
        sub="Model seçimi, renk kartları ve seçili renk reçetesi"
        actions={<button className="bh-btn primary" type="button" disabled={!canSave}>Reçeteyi Kaydet</button>}
      >
        {selectedModel ? (
          <>
            <button className="bh-model-card as-button" type="button" onClick={() => setShowImageModal(true)}>
              <VisualBox label="Model / Desen Görseli" />
              <div>
                <h3>{selectedModel?.modelName}</h3>
                <div className="bh-form-grid four">
                  <InfoLine label="Firma" value={selectedModel?.company} />
                  <InfoLine label="Sipariş no" value={selectedModel?.orderNo} />
                  <InfoLine label="Müşteri irsaliye no" value={selectedModel?.dispatchNo} />
                  <InfoLine label="Gelen adet" value={selectedModel?.incomingQty.toLocaleString("tr-TR")} />
                  <InfoLine label="Baskı yapısı" value={selectedModel?.printStructure} />
                  <InfoLine label="Model sorumlusu" value={selectedModel?.owner} />
                  <InfoLine label="Desen durumu" value={selectedModel?.designStatus} />
                  <InfoLine label="Boyahane durumu" value={selectedModel?.dyehouseStatus} />
                </div>
              </div>
            </button>

            <div className="bh-kpi-row compact">
              <div className="bh-kpi"><span>Gelen adet</span><strong>{selectedModel?.incomingQty.toLocaleString("tr-TR")}</strong></div>
              <div className="bh-kpi"><span>Baskı bölgesi sayısı</span><strong>{selectedModel?.printStructure.split("+").length}</strong></div>
              <div className="bh-kpi"><span>Renk adedi</span><strong>{selectedModel?.colorCount}</strong></div>
              <div className="bh-kpi"><span>Reçetesi tamamlanan renk</span><strong>{selectedModel?.completedColors}</strong></div>
              <div className="bh-kpi"><span>Tanımsız renk</span><strong>{undefinedColors.length}</strong></div>
              <div className="bh-kpi"><span>Hazır renk</span><strong>{selectedModel?.readyColors}</strong></div>
            </div>

            <h3 className="bh-section-title">Model Renkleri</h3>
            <div className="bh-model-colors">
              {selectedModel.colors.map((rawColor) => {
                const color = { ...rawColor, ...convertedColors[rawColor.id] };
                const isUndefined = !color.saved;
                return (
                  <button key={color.id} type="button" className={`bh-model-color ${selectedColor.id === color.id ? "active" : ""} ${isUndefined ? "undefined" : ""}`} onClick={() => openColor(color)}>
                    <span className="bh-swatch" style={{ background: color.preview }} />
                    <strong>{color.label}</strong>
                    <span>{color.pantone ? `Pantone: ${color.pantone}` : `Müşteri Kod: ${color.customerColorCode || "-"}`}</span>
                    <span>Boya Türü: {color.dyeType}</span>
                    <span>Kayıtlı renk: {color.saved ? "Var" : "Yok"}</span>
                    <span>Versiyon: {color.version}</span>
                    <Status tone={isUndefined ? "gray" : statusTone(color.status)}>{isUndefined ? "Tanımla" : color.status}</Status>
                  </button>
                );
              })}
              <button type="button" className="bh-model-color add">+ Renk Ekle</button>
            </div>

          </>
        ) : (
          <div className="bh-notice orange">Reçete kaydı için önce model havuzundan bir model seçin.</div>
        )}

        <h3 className="bh-section-title">Modele Hızlı Boya Gideri Kaydı</h3>
        <div className="bh-form-grid five">
          <Field label="Ürün"><input list="approved-product-options" defaultValue="S 10 ŞEFFAF" /></Field>
          <Field label="Miktar KG"><input type="number" defaultValue="12" /></Field>
          <Field label="Lot"><select><option>LOT-24</option><option>LOT-31</option><option>LOT-56</option><option>BF-11</option></select></Field>
          <Field label="Tarih / Saat"><input type="datetime-local" defaultValue="2026-05-23T11:30" /></Field>
          <Field label="Açıklama"><input defaultValue="Model genel boya gideri" /></Field>
          <button className="bh-btn primary" type="button">Gider Kaydet</button>
        </div>

        <h3 className="bh-section-title">Seçili Renk Gramaj / Reçete Tablosu</h3>
        {selectedColor ? (
          <div className={`bh-selected-color-line ${selectedColor.saved ? "" : "undefined"}`}>
            <input className="bh-inline-color" type="color" value={selectedColor.preview || "#94a3b8"} onChange={(event) => updateSelectedColor("preview", event?.target.value)} />
            <strong>Model: {selectedModel?.modelName}</strong>
            <span>Renk: <input value={selectedColor.colorName || ""} onChange={(event) => updateSelectedColor("colorName", event?.target.value)} /></span>
            <span>Müşteri Kod: <input value={selectedColor.customerColorCode || ""} onChange={(event) => updateSelectedColor("customerColorCode", event?.target.value)} /></span>
            <span>Pantone: <input value={selectedColor.pantone || ""} onChange={(event) => updateSelectedColor("pantone", event?.target.value)} placeholder="Boş olabilir" /></span>
            <span>Boya Türü: <select value={selectedColor.dyeType || "SUBAZLI"} onChange={(event) => updateSelectedColor("dyeType", event?.target.value)}>{["SUBAZLI", "PIGMENT", "ECOPLAST", "SİLİKON", "AŞINDIRMA", "FİKSATÖR", "UV", "AÇILIM BOYA", "GENEL", "DİĞER"].map((type) => <option key={type}>{type}</option>)}</select></span>
            <span>Versiyon: <input value={selectedColor.version || "v1"} onChange={(event) => updateSelectedColor("version", event?.target.value)} /></span>
            <span>Kat Sayısı: {selectedColor.multiplier}</span>
            <span>Kayıtlı Renk: {selectedColor.saved ? "Var" : "Yok"}</span>
            {!selectedColor.saved ? <Status tone="orange">Kayıtlı renk yok</Status> : null}
          </div>
        ) : null}

        <datalist id="approved-product-options">
          {suggestedProductOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          {approvedInventory.filter((item) => suggestedProductOptions.some((option) => option.value === item?.name)).map((item) => <option key={item?.code} value={item?.shortName}>{item?.name}</option>)}
        </datalist>

        <div className="bh-table-wrap recipe">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Ürün Adı</th>
                <th>Toplam GR</th>
                <th>Deneme 1</th>
                <th>Deneme 2</th>
                <th>Deneme 3</th>
                <th>Deneme Toplamı</th>
                <th>İmalat GR</th>
                <th>%</th>
                <th>Lot</th>
                <th>Boya Türü</th>
                <th>Durum</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {selectedColor && enrichedRows.map((row, index) => {
                const product = productByName(row?.productName);
                return (
                  <tr key={row?.id}>
                    <td>{index + 1}</td>
                    <td><input list="approved-product-options" value={row?.productName} onChange={(event) => updateRow(row?.id, "productName", event?.target.value)} onBlur={(event) => updateRow(row?.id, "productName", event?.target.value)} /></td>
                    <td>{formatGr(row?.totalGr)}</td>
                    <td><input type="number" value={row?.trial1} onChange={(event) => updateRow(row?.id, "trial1", event?.target.value)} /></td>
                    <td><input type="number" value={row?.trial2} onChange={(event) => updateRow(row?.id, "trial2", event?.target.value)} /></td>
                    <td><input type="number" value={row?.trial3} onChange={(event) => updateRow(row?.id, "trial3", event?.target.value)} /></td>
                    <td>{formatGr(row?.trialTotal)}</td>
                    <td><input type="number" value={row?.productionGr} onChange={(event) => updateRow(row?.id, "productionGr", event?.target.value)} /></td>
                    <td>{totalGr ? `${((row?.totalGr / totalGr) * 100).toFixed(1)}%` : "0%"}</td>
                    <td>
                      <select value={row?.lot} onChange={(event) => updateRow(row?.id, "lot", event?.target.value)}>
                        <option value="">Lot seç</option>
                        {product.lots.map((lot) => <option key={lot.lot} value={lot.lot}>{lot.lot} / {lot.status}{lot.note ? ` / ${lot.note}` : ""}</option>)}
                      </select>
                    </td>
                    <td>{row?.dyeType}</td>
                    <td><Status tone={row?.status.tone}>{row?.status.label}</Status></td>
                    <td><button className="bh-btn danger mini" type="button" onClick={() => removeLine(row?.id)}>Sil</button></td>
                  </tr>
                );
              })}
              {!selectedColor ? <tr><td colSpan={13}>Renk seçilmeden gramaj satırı açılamaz.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <button className="bh-btn" type="button" onClick={addLine} disabled={!selectedColor}>+ Ürün Ekle</button>
      </Panel>

      <Panel title="Model + Renk Kontrol" sub="Bağlantı ve kayıt uygunluğu">
        <VisualBox label="Model Görseli" large />
        <InfoLine label="Model adı" value={selectedModel?.modelName || "-"} />
        <InfoLine label="Firma" value={selectedModel?.company || "-"} />
        <InfoLine label="Sipariş no" value={selectedModel?.orderNo || "-"} />
        <InfoLine label="Gelen adet" value={selectedModel?.incomingQty.toLocaleString("tr-TR") || "-"} />
        <InfoLine label="Baskı yapısı" value={selectedModel?.printStructure || "-"} />
        <InfoLine label="Renk adedi" value={selectedModel?.colorCount || "-"} />
        <h3 className="bh-section-title">Seçili renk</h3>
        <InfoLine label="Renk" value={selectedColor.colorName || "-"} />
        <InfoLine label="Pantone" value={selectedColor.pantone || "-"} />
        <InfoLine label="Müşteri renk kodu" value={selectedColor.customerColorCode || "-"} />
        <InfoLine label="Boya Türü" value={selectedColor.dyeType || "-"} />
        <InfoLine label="Versiyon" value={selectedColor.version || "-"} />
        <InfoLine label="Kat Sayısı" value={selectedColor.multiplier || "-"} />
        <InfoLine label="Deneme Toplamı" value={formatGr(trialTotal)} />
        <InfoLine label="İmalat Toplam GR" value={formatGr(productionTotal)} />
        <InfoLine label="Katlı Toplam GR" value={formatGr(multipliedGr)} />
        <InfoLine label="Katlı Toplam KG" value={`${(multipliedGr / 1000).toLocaleString("tr-TR")} KG`} />
        <InfoLine label="Lot Eksik / Pasif" value={lotWarnings} />
        {warningList.length ? <div className="bh-notice orange">{warningList.map((warning) => <div key={warning}>{warning}</div>)}</div> : <div className="bh-notice">Model, renk, gramaj ve lot bağlantıları kayda hazır.</div>}
        <div className="bh-action-stack">
          <button className="bh-btn" type="button">Veri Varsa Çek</button>
          <button className="bh-btn primary" type="button" disabled={!canSave} onClick={() => { if (selectedColor && !selectedColor.saved) convertUndefinedColor(); }}>Reçeteyi Kaydet</button>
          <button className="bh-btn" type="button" disabled={!canSave}>Güncelle</button>
          <button className="bh-btn" type="button" disabled={!selectedColor || selectedColor.saved} onClick={convertUndefinedColor}>Rengi Kayıtlı Hale Getir</button>
          <button className="bh-btn" type="button">Yeni Versiyon Oluştur</button>
          <button className="bh-btn" type="button">Reçete Yazdır</button>
          <button className="bh-btn" type="button">Model Kartını Aç</button>
        </div>
      </Panel>

      {showImageModal && selectedModel ? (
        <div className="bh-modal" role="dialog" aria-modal="true">
          <div className="bh-modal-card">
            <button className="bh-modal-close" type="button" onClick={() => setShowImageModal(false)}>Kapat</button>
            <VisualBox label="Büyük Model / Desen Görseli" large />
            <InfoLine label="Model adı" value={selectedModel?.modelName} />
            <InfoLine label="Firma" value={selectedModel?.company} />
            <InfoLine label="Sipariş" value={selectedModel?.orderNo} />
            <InfoLine label="Baskı yapısı" value={selectedModel?.printStructure} />
            <InfoLine label="Renk adedi" value={selectedModel?.colorCount} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
