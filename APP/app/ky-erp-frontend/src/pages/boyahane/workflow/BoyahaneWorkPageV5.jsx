/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useMemo, useState } from "react";
import { createManualBoyahaneJob } from "../../../services/boyahaneManualApi";
import { getRegisteredColor } from "../../../services/boyahaneWorkflowApi";
import BoyahaneWorkPageV4 from "./BoyahaneWorkPageV4";
import { safeArray } from "./boyahaneFormat";

function sourceTypeOf(row) {
  return row?.sourceType || row?.colorSource || (row?.pantone ? "PANTONE" : "VISUAL");
}

function sourceLabel(row) {
  const sourceType = sourceTypeOf(row);
  if (sourceType === "REFERENCE") return "Renk referansına göre";
  if (sourceType === "VISUAL") return "Görsel / RGB’ye göre";
  return "Pantoneye göre";
}

export default function BoyahaneWorkPageV5({
  mode = "production",
  activeMainCompany,
  moduleActionContext,
}) {
  const requestedColorId = moduleActionContext?.registeredColorId || "";
  const [registeredColor, setRegisteredColor] = useState(null);
  const [loadingColor, setLoadingColor] = useState(false);
  const [localContext, setLocalContext] = useState(moduleActionContext || {});
  const [dismissedNonce, setDismissedNonce] = useState("");
  const [form, setForm] = useState({
    modelName: "",
    companyName: "",
    orderNo: "",
    printRegion: "Tüm baskı bölgeleri",
    plannedKg: mode === "sample" ? "0.25" : "",
    plannedQuantity: "",
    priority: "NORMAL",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setLocalContext(moduleActionContext || {});
  }, [moduleActionContext?.nonce, moduleActionContext?.boyahaneJobId, requestedColorId]);

  useEffect(() => {
    let live = true;
    if (!requestedColorId) {
      setRegisteredColor(null);
      return () => { live = false; };
    }
    setLoadingColor(true);
    setError("");
    getRegisteredColor(activeMainCompany, requestedColorId)
      .then((row) => {
        if (!live) return;
        setRegisteredColor(row);
      })
      .catch((requestError) => live && setError(requestError.message))
      .finally(() => live && setLoadingColor(false));
    return () => { live = false; };
  }, [requestedColorId, activeMainCompany?.slug, moduleActionContext?.nonce]);

  const activeRecipe = useMemo(() => {
    const recipes = safeArray(registeredColor?.recipes);
    return recipes.find((row) => row.status === "ACTIVE") || recipes[0] || null;
  }, [registeredColor]);

  const requestNonce = String(moduleActionContext?.nonce || requestedColorId || "");
  const shouldOpenStarter = Boolean(
    requestedColorId &&
    registeredColor &&
    !localContext?.boyahaneJobId &&
    dismissedNonce !== requestNonce,
  );

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  async function startFromRegistered(event) {
    event.preventDefault();
    if (!registeredColor?.id) return;
    setBusy(true);
    setError("");
    try {
      const sourceType = sourceTypeOf(registeredColor);
      const created = await createManualBoyahaneJob(activeMainCompany, {
        ...form,
        jobType: mode === "sample" ? "SAMPLE" : "PRODUCTION",
        channelCount: 1,
        uniqueColorCount: 1,
        plannedKg: Number(form.plannedKg || 0),
        plannedQuantity: Number(form.plannedQuantity || 0),
        registeredColorId: registeredColor.id,
        colorName: registeredColor.colorName,
        paintType: activeRecipe?.dyeType || activeRecipe?.paintType || registeredColor.dyeType || registeredColor.paintType || "SUBAZLI",
        sourceType,
        colorSource: sourceType,
        pantone: registeredColor.pantone || registeredColor.basePantone || "",
        basePantone: registeredColor.basePantone || registeredColor.pantone || "",
        referenceName: registeredColor.referenceName || "",
        referenceCode: registeredColor.referenceCode || "",
        referenceNote: registeredColor.referenceNote || "",
        referenceImageUrl: registeredColor.referenceImageUrl || "",
        colorHex: registeredColor.colorHex || "",
        colorFamily: registeredColor.colorFamily || "",
      });
      setLocalContext({
        boyahaneJobId: created.id,
        registeredColorId: registeredColor.id,
        nonce: Date.now(),
      });
      setDismissedNonce(requestNonce);
    } catch (requestError) {
      setError(requestError?.message || "Kayıtlı renkten iş açılamadı.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <BoyahaneWorkPageV4
        mode={mode}
        activeMainCompany={activeMainCompany}
        moduleActionContext={localContext}
      />

      {loadingColor ? <div className="bh-modal"><div className="bh-modal-card"><div className="bh-empty compact">Kayıtlı renk hazırlanıyor…</div></div></div> : null}

      {shouldOpenStarter ? (
        <div className="bh-modal" role="dialog" aria-modal="true">
          <form className="bh-modal-card bh-registered-color-starter" onSubmit={startFromRegistered}>
            <button type="button" className="bh-modal-close" disabled={busy} onClick={() => setDismissedNonce(requestNonce)}>Kapat</button>
            <div className="bh-registered-starter-head">
              <i style={{ background: registeredColor.colorHex || "#cbd5e1" }} />
              <div>
                <small>{sourceLabel(registeredColor)}</small>
                <h2>{registeredColor.displayCode || registeredColor.pantone || registeredColor.referenceName || registeredColor.colorHex} · {registeredColor.colorName}</h2>
                <p>{activeRecipe ? `${activeRecipe.dyeType || activeRecipe.paintType} · ${activeRecipe.version} · ${safeArray(activeRecipe.lines).length} bileşen` : "Onaylı reçete bulunmuyor; yeni reçete açılacak."}</p>
              </div>
            </div>

            {sourceTypeOf(registeredColor) === "REFERENCE" ? <div className="bh-notice warning">Bu renk Pantone standardına göre değil, <strong>{registeredColor.referenceName || registeredColor.referenceCode}</strong> renk referansına göre kullanılacaktır.</div> : null}
            {error ? <div className="bh-notice danger">{error}</div> : null}

            <div className="bh-form-grid three">
              <label className="bh-field"><span>Model / desen adı</span><input required autoFocus value={form.modelName} onChange={(event) => set("modelName", event.target.value)} /></label>
              <label className="bh-field"><span>Firma</span><input value={form.companyName} onChange={(event) => set("companyName", event.target.value)} /></label>
              <label className="bh-field"><span>Sipariş no</span><input value={form.orderNo} onChange={(event) => set("orderNo", event.target.value)} /></label>
              <label className="bh-field"><span>Baskı bölgesi</span><input value={form.printRegion} onChange={(event) => set("printRegion", event.target.value)} /></label>
              <label className="bh-field"><span>{mode === "sample" ? "Numune planı KG" : "Planlanan boya KG"}</span><input type="number" min="0" step="0.001" value={form.plannedKg} onChange={(event) => set("plannedKg", event.target.value)} /></label>
              <label className="bh-field"><span>Planlanan adet</span><input type="number" min="0" step="1" value={form.plannedQuantity} onChange={(event) => set("plannedQuantity", event.target.value)} /></label>
              <label className="bh-field"><span>Öncelik</span><select value={form.priority} onChange={(event) => set("priority", event.target.value)}><option value="NORMAL">Normal</option><option value="HIGH">Öncelikli</option><option value="URGENT">Acil</option><option value="LOW">Düşük</option></select></label>
            </div>

            <div className="bh-notice success">İş açıldığında seçili kayıtlı renk ve son gramajlı reçetesi otomatik çalışma ekranına gelecektir.</div>
            <div className="bh-modal-actions"><button type="button" className="bh-btn" disabled={busy} onClick={() => setDismissedNonce(requestNonce)}>Vazgeç</button><button className="bh-btn primary" disabled={busy}>{busy ? "İş açılıyor…" : mode === "sample" ? "Kayıtlı Gramajla Numune Aç" : "Kayıtlı Gramajla İmalat Aç"}</button></div>
          </form>
        </div>
      ) : null}
    </>
  );
}
