import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Droplets,
  Palette,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import {
  listBoyahaneJobs,
  listBoyahaneLots,
  listBoyahaneProducts,
  patchBoyahaneJobColor,
} from "../../../services/boyahaneWorkflowApi";
import {
  confirmBoyahaneColorSuggestion,
  suggestBoyahaneColor,
} from "../../../services/boyahaneColorAssistantApi";
import BoyahaneProductionSerialPage from "./BoyahaneProductionSerialPage";
import { formatKg, safeArray } from "./boyahaneFormat";
import { loadModuleData, moduleLoadMessage } from "../../../utils/resilientDataLoader";
import "../boyahaneProductionIntelligence.css";

const OPEN_LOTS = new Set(["AVAILABLE", "ACTIVE"]);

function txt(value) {
  return String(value ?? "").trim();
}

function norm(value) {
  return txt(value)
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .replace(/[^A-Z0-9ÇĞÖŞÜ#]+/g, "");
}

function normalizeHex(value) {
  const raw = txt(value).replace(/^#/, "");
  return /^[0-9a-f]{6}$/i.test(raw) ? `#${raw.toUpperCase()}` : "";
}

function isProduction(row) {
  return !["SAMPLE", "TRIAL"].includes(
    txt(row?.jobType || row?.workflowType || row?.type).toUpperCase(),
  );
}

function colorsOf(job) {
  return safeArray(job?.colors).filter(
    (row) => txt(row?.status).toUpperCase() !== "CANCELLED",
  );
}

function productFor(line, products) {
  const requested = txt(line?.productId || line?.inventoryId);
  return (
    products.find((row) => txt(row.id) === requested) ||
    products.find((row) => norm(row.productName) === norm(line?.productName)) ||
    null
  );
}

function openLotsFor(productId, lots) {
  return lots.filter(
    (row) =>
      txt(row.inventoryId || row.productId) === txt(productId) &&
      OPEN_LOTS.has(txt(row.status).toUpperCase()),
  );
}

function preferredLot(productId, lots) {
  const rows = openLotsFor(productId, lots);
  return rows.find((row) => row.isDefault) || rows[0] || null;
}

function draftRows(recipe, products, lots) {
  return safeArray(recipe?.lines).map((line, index) => {
    const product = productFor(line, products);
    const productId = product?.id || line.productId || line.inventoryId || "";
    const lot = preferredLot(productId, lots);
    return {
      key: `ai-${Date.now()}-${index}`,
      productId,
      productName: product?.productName || line.productName || "",
      referenceGram: Number(line.referenceGram || 0),
      lotId: lot?.id || "",
      fixed:
        index < 2 &&
        ["S10", "S20"].some((key) =>
          norm(product?.productName || line.productName).includes(key),
        ),
      label: index === 0 ? "AI 1" : index === 1 ? "AI 2" : "",
    };
  });
}

function stockState(candidate, products, lots) {
  const lines = safeArray(candidate?.recipe?.lines);
  return lines.map((line) => {
    const product = productFor(line, products);
    const productId = product?.id || line.productId || line.inventoryId || "";
    const lot = preferredLot(productId, lots);
    return {
      key: line.id || `${productId}-${line.productName}`,
      product,
      productId,
      productName: product?.productName || line.productName || "Ürün",
      referenceGram: Number(line.referenceGram || 0),
      lot,
      remainingKg: Number(
        lot?.remainingKg ?? lot?.remainingQuantity ?? lot?.quantity ?? 0,
      ),
    };
  });
}

function confidenceClass(level) {
  if (["ÇOK YÜKSEK", "YÜKSEK"].includes(level)) return "good";
  if (level === "ORTA") return "medium";
  return "weak";
}

function ColorAssistantDock({
  activeMainCompany,
  moduleActionContext,
  openModule,
  onDraftApplied,
}) {
  const [open, setOpen] = useState(true);
  const [loadingData, setLoadingData] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [products, setProducts] = useState([]);
  const [lots, setLots] = useState([]);
  const [jobId, setJobId] = useState(moduleActionContext?.boyahaneJobId || "");
  const [colorId, setColorId] = useState("");
  const [hex, setHex] = useState("");
  const [pantoneQuery, setPantoneQuery] = useState("");
  const [result, setResult] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoadingData(true);
    setError("");
    try {
      const tenant = activeMainCompany?.slug || activeMainCompany?.id || "main";
      const loadResult = await loadModuleData({
        scope: `boyahane:${tenant}:renk-asistani`,
        sources: {
          jobs: { critical: true, load: () => listBoyahaneJobs(activeMainCompany) },
          products: { fallback: [], load: () => listBoyahaneProducts(activeMainCompany) },
          lots: { fallback: [], load: () => listBoyahaneLots(activeMainCompany) },
        },
      });
      if (loadResult.states.jobs.status !== "error") {
        const productionJobs = safeArray(loadResult.data.jobs).filter(isProduction);
        setJobs(productionJobs);
        setJobId((current) => {
          if (current && productionJobs.some((row) => txt(row.id) === txt(current))) return current;
          const preferred = moduleActionContext?.boyahaneJobId;
          if (preferred && productionJobs.some((row) => txt(row.id) === txt(preferred))) return preferred;
          return productionJobs.find((row) => txt(row.status).toUpperCase() !== "COMPLETED")?.id || productionJobs[0]?.id || "";
        });
      }
      if (loadResult.states.products.status !== "error") setProducts(safeArray(loadResult.data.products));
      if (loadResult.states.lots.status !== "error") setLots(safeArray(loadResult.data.lots));
      setError(moduleLoadMessage(loadResult, "Boyahane iş ana listesi alınamadı; son başarılı işler korunuyor.", "Ürün veya lot bilgisi yenilenemedi; iş listesi kullanılabilir."));
    } catch (requestError) {
      setError(requestError?.message || "Renk asistanı verileri yüklenemedi.");
    } finally {
      setLoadingData(false);
    }
  }, [activeMainCompany, moduleActionContext?.boyahaneJobId]);

  useEffect(() => {
    load();
  }, [load]);

  const job = useMemo(
    () => jobs.find((row) => txt(row.id) === txt(jobId)) || null,
    [jobId, jobs],
  );
  const colors = useMemo(() => colorsOf(job), [job]);
  const color = useMemo(
    () =>
      colors.find((row) => txt(row.id) === txt(colorId)) || colors[0] || null,
    [colorId, colors],
  );

  useEffect(() => {
    if (!colors.length) {
      setColorId("");
      return;
    }
    if (!colors.some((row) => txt(row.id) === txt(colorId))) {
      setColorId(colors[0].id);
    }
  }, [colors, colorId]);

  useEffect(() => {
    setHex(normalizeHex(color?.colorHex || color?.hex || color?.preview));
    setPantoneQuery(txt(color?.pantone));
    setResult(null);
    setSelectedIndex(0);
    setNotice("");
    setError("");
  }, [color]);

  const suggestions = safeArray(result?.suggestions);
  const selected = suggestions[selectedIndex] || suggestions[0] || null;
  const stock = useMemo(
    () => stockState(selected, products, lots),
    [selected, products, lots],
  );
  const missingLotCount = stock.filter((row) => !row.lot).length;

  async function analyze() {
    const validHex = normalizeHex(hex);
    const pantone = txt(pantoneQuery);
    if (!validHex && !pantone) {
      setError("Renk analizi için HEX veya Pantone kodu gir.");
      return;
    }
    setAnalyzing(true);
    setError("");
    setNotice("");
    try {
      const payload = await suggestBoyahaneColor(activeMainCompany, {
        colorHex: validHex,
        pantone,
        paintType: color?.paintType || color?.dyeType || "SUBAZLI",
        colorName: color?.colorName || "",
        modelName: job?.modelName || "",
        limit: 5,
      });
      setResult(payload || null);
      setSelectedIndex(0);
      if (!safeArray(payload?.suggestions).length) {
        setNotice(
          "Bu renk için HEX ile karşılaştırılabilir geçmiş eşleşme bulunmadı. Yeni doğrulamalar yapıldıkça sistem otomatik genişleyecek.",
        );
      }
    } catch (requestError) {
      setError(requestError?.message || "Renk analizi tamamlanamadı.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function applySuggestion() {
    if (!job || !color || !selected) return;
    const chosenHex = normalizeHex(hex) || selected.colorHex || "";
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const rows = draftRows(selected.recipe, products, lots);
      const nextColorName = color.colorName || selected.colorName || "Yeni Renk";
      const patch = {
        registeredColorId:
          selected.registeredColorId || color.registeredColorId || "",
        pantone: selected.pantone || color.pantone || "",
        colorHex: chosenHex,
        colorName: nextColorName,
        paintType:
          color.paintType || color.dyeType || selected.paintType || "SUBAZLI",
        sourceType: selected.pantone
          ? "PANTONE"
          : color.sourceType || color.colorSource || "VISUAL",
        colorSource: selected.pantone
          ? "PANTONE"
          : color.colorSource || color.sourceType || "VISUAL",
        aiColorSuggestion: {
          method: result?.method,
          deltaE: selected.deltaE,
          score: selected.score,
          confidence: selected.confidence,
          confirmedAt: new Date().toISOString(),
        },
      };
      if (rows.length) {
        patch.productionDraft = {
          paintType: patch.paintType,
          pantone: patch.pantone,
          colorName: patch.colorName,
          colorHex: chosenHex,
          targetKg: Number(color.plannedKg || 0),
          rows,
          aiSuggested: true,
          aiSourceColorId: selected.registeredColorId || "",
          aiRecipeId: selected.recipe?.id || "",
          savedAt: new Date().toISOString(),
        };
      }
      await patchBoyahaneJobColor(activeMainCompany, color.id, patch);
      await confirmBoyahaneColorSuggestion(activeMainCompany, {
        colorHex: chosenHex,
        pantone: patch.pantone,
        paintType: patch.paintType,
        colorName: patch.colorName,
        registeredColorId: selected.registeredColorId,
        recipeId: selected.recipe?.id,
        modelName: job.modelName,
        jobId: job.id,
        jobColorId: color.id,
        deltaE: selected.deltaE,
      });
      setNotice(
        rows.length
          ? `Eşleşme doğrulandı ve ${selected.recipe?.version || "reçete"} gerçek lot kontrolüyle imalat taslağına aktarıldı${missingLotCount ? `; ${missingLotCount} satırda lot seçimi gerekiyor` : ""}.`
          : "Pantone/HEX eşleşmesi doğrulandı. Bu renkte geçmiş reçete olmadığı için formül otomatik yazılmadı.",
      );
      onDraftApplied?.({ jobId: job.id, colorId: color.id });
      await load();
    } catch (requestError) {
      setError(
        requestError?.message || "AI önerisi çalışma taslağına aktarılamadı.",
      );
    } finally {
      setSaving(false);
    }
  }

  function askAi() {
    if (!openModule || !job || !color) return;
    const candidates = suggestions
      .slice(0, 3)
      .map(
        (row) =>
          `${row.pantone || "Pantone yok"} / ${row.colorName || "Renk"} / ΔE ${row.deltaE ?? "-"} / güven ${row.score}% / ${row.recipe?.version || "reçete yok"}`,
      )
      .join("; ");
    const stockText = selected?.recipe
      ? stock
          .map(
            (row) =>
              `${row.productName}: ${
                row.lot
                  ? `${row.lot.lotNo || "lot"} ${formatKg(row.remainingKg)}`
                  : "aktif lot yok"
              }`,
          )
          .join("; ")
      : "Önerilen reçete yok";
    openModule("asistan", {
      tabKey: "sohbet",
      actionContext: {
        sourceModule: "boyahane",
        sourceRoute: "/boyahane/uretim-gecmisi",
        message: `Boyahane renk asistanı analizi yap. Model: ${job.modelName}. Renk: ${color.colorName || "-"}. Hedef HEX: ${normalizeHex(hex) || "-"}. Girilen Pantone: ${pantoneQuery || "-"}. Boya türü: ${color.paintType || color.dyeType || "SUBAZLI"}. En yakın canlı KY ERP adayları: ${candidates || "henüz analiz yapılmadı"}. Seçili aday lot durumu: ${stockText}. Mevcut reçete ve stok geçmişine göre hangisini başlangıç referansı olarak kullanmam gerektiğini, riskleri ve numune kontrolünü kısa ve operasyonel biçimde yorumla. Otomatik stok sarfı veya üretim kaydı yapma; write gerekiyorsa onay kartı oluştur.`,
      },
    });
  }

  return (
    <section className={`bh-ai-center ${open ? "open" : "closed"}`}>
      <header className="bh-ai-head">
        <div className="bh-ai-title">
          <span className="bh-ai-icon">
            <Sparkles size={20} />
          </span>
          <div>
            <small>CANLI RENK BİLİMİ + REÇETE GEÇMİŞİ + KY ERP AI</small>
            <h2>Akıllı Renk & Pantone Merkezi</h2>
            <p>
              HEX’e göre en yakın kayıtlı Pantone ve reçeteyi bulur; gerçek
              lotu kontrol eder. Yeni doğrulamalar sistemi kalıcı olarak
              geliştirir.
            </p>
          </div>
        </div>
        <div className="bh-ai-head-actions">
          {result?.catalogStats ? (
            <span className="bh-ai-stat">
              {result.catalogStats.pantones} Pantone · {result.catalogStats.recipes}{" "}
              reçete
            </span>
          ) : null}
          <button
            type="button"
            className="bh-ai-button ghost"
            onClick={load}
            disabled={loadingData}
          >
            <RefreshCw size={15} /> Güncelle
          </button>
          <button
            type="button"
            className="bh-ai-button"
            onClick={() => setOpen((current) => !current)}
          >
            {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            {open ? "Daralt" : "Aç"}
          </button>
        </div>
      </header>

      {open ? (
        <div className="bh-ai-body">
          <section className="bh-ai-control">
            <div className="bh-ai-section-title">
              <Palette size={17} />
              <div>
                <b>1. Model ve hedef renk</b>
                <span>Canlı Boyahane işinden seç veya yeni HEX gir.</span>
              </div>
            </div>
            <label>
              <span>Model</span>
              <select
                value={jobId}
                disabled={loadingData}
                onChange={(event) => {
                  setJobId(event.target.value);
                  setColorId("");
                }}
              >
                <option value="">Model seç</option>
                {jobs.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.modelName || "Model"} · {row.companyName || "-"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Model rengi</span>
              <select
                value={color?.id || ""}
                disabled={!job}
                onChange={(event) => setColorId(event.target.value)}
              >
                <option value="">Renk seç</option>
                {colors.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.colorName || "Renk"} · {row.pantone || row.colorHex || "kod yok"}
                  </option>
                ))}
              </select>
            </label>
            <div className="bh-ai-color-row">
              <input
                className="bh-ai-picker"
                type="color"
                value={normalizeHex(hex) || "#808080"}
                onChange={(event) => setHex(event.target.value.toUpperCase())}
                aria-label="Renk seç"
              />
              <label>
                <span>HEX</span>
                <input
                  value={hex}
                  placeholder="#173B77"
                  onChange={(event) => setHex(event.target.value.toUpperCase())}
                />
              </label>
              <label>
                <span>Pantone (opsiyonel)</span>
                <input
                  value={pantoneQuery}
                  placeholder="19-4151"
                  onChange={(event) =>
                    setPantoneQuery(event.target.value.toUpperCase())
                  }
                />
              </label>
            </div>
            <button
              type="button"
              className="bh-ai-button primary wide"
              onClick={analyze}
              disabled={analyzing || !color}
            >
              {analyzing ? (
                <RefreshCw className="spin" size={16} />
              ) : (
                <Sparkles size={16} />
              )}
              {analyzing
                ? "Canlı kayıtlar taranıyor…"
                : "Tüm Kayıtlı Renkleri Tara"}
            </button>
            {result?.catalogStats ? (
              <div className="bh-ai-catalog">
                <span>
                  <b>{result.catalogStats.registeredColors}</b>Kayıtlı renk
                </span>
                <span>
                  <b>{result.catalogStats.hexMappedPantones}</b>HEX eşlemeli
                  Pantone
                </span>
                <span>
                  <b>{result.catalogStats.confirmedMappings}</b>Onaylanmış eşleşme
                </span>
                <span>
                  <b>{result.catalogStats.productions}</b>Üretim geçmişi
                </span>
              </div>
            ) : null}
          </section>

          <section className="bh-ai-suggestions">
            <div className="bh-ai-section-title">
              <Sparkles size={17} />
              <div>
                <b>2. En yakın Pantone / reçete</b>
                <span>CIEDE2000 renk mesafesi + canlı geçmiş sıralaması.</span>
              </div>
            </div>
            {suggestions.length ? (
              <div className="bh-ai-candidate-list">
                {suggestions.map((row, index) => (
                  <button
                    key={`${row.pantone}-${row.colorHex}-${index}`}
                    type="button"
                    className={`bh-ai-candidate ${
                      selectedIndex === index ? "selected" : ""
                    }`}
                    onClick={() => setSelectedIndex(index)}
                  >
                    <i style={{ background: row.colorHex || "#D9E2EC" }} />
                    <span className="bh-ai-candidate-main">
                      <b>
                        {row.pantone || "Pantone yok"} · {row.colorName || "Renk"}
                      </b>
                      <small>
                        {row.colorHex || "HEX kaydı yok"} · {row.paintType}
                      </small>
                    </span>
                    <span
                      className={`bh-ai-confidence ${confidenceClass(
                        row.confidence,
                      )}`}
                    >
                      <b>%{row.score}</b>
                      <small>
                        {row.deltaE === null
                          ? "kod eşleşmesi"
                          : `ΔE ${row.deltaE}`}
                      </small>
                    </span>
                    <span className="bh-ai-recipe">
                      {row.recipe
                        ? `${row.recipe.version} · ${row.recipe.lines.length} bileşen`
                        : "Reçete yok"}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="bh-ai-empty">
                {analyzing
                  ? "Renkler karşılaştırılıyor…"
                  : "Model rengini seçip analizi çalıştır."}
              </div>
            )}
          </section>

          <section className="bh-ai-stock">
            <div className="bh-ai-section-title">
              <Droplets size={17} />
              <div>
                <b>3. Reçete ve gerçek lot</b>
                <span>Öneri stok düşmeden önce lot yeterliliğini gösterir.</span>
              </div>
            </div>
            {selected ? (
              <>
                <div className="bh-ai-selected">
                  <i style={{ background: selected.colorHex || "#D9E2EC" }} />
                  <div>
                    <b>
                      {selected.pantone} · {selected.colorName || "Renk"}
                    </b>
                    <span>
                      {selected.confirmed
                        ? "Daha önce kullanıcı tarafından doğrulanmış"
                        : selected.hexOrigin === "MODEL_COLOR"
                          ? "Model renk geçmişinden"
                          : "Kayıtlı renk kartından"}
                    </span>
                  </div>
                </div>
                {stock.length ? (
                  <div className="bh-ai-stock-list">
                    {stock.map((row) => (
                      <div key={row.key} className={row.lot ? "ok" : "missing"}>
                        {row.lot ? (
                          <CheckCircle2 size={15} />
                        ) : (
                          <AlertTriangle size={15} />
                        )}
                        <span>
                          <b>{row.productName}</b>
                          <small>
                            {row.referenceGram.toFixed(2)} g ·{" "}
                            {row.lot
                              ? `${row.lot.lotNo || "Lot"} · ${formatKg(
                                  row.remainingKg,
                                )}`
                              : "Aktif lot bulunamadı"}
                          </small>
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bh-ai-empty">
                    Bu Pantone için bileşenli reçete geçmişi yok.
                  </div>
                )}
                <div className="bh-ai-actions">
                  <button
                    type="button"
                    className="bh-ai-button ghost"
                    onClick={askAi}
                    disabled={!openModule}
                  >
                    <Bot size={16} /> KY ERP AI ile Yorumla
                  </button>
                  <button
                    type="button"
                    className="bh-ai-button primary"
                    onClick={applySuggestion}
                    disabled={saving}
                  >
                    {saving
                      ? "Kaydediliyor…"
                      : selected.recipe
                        ? "Onayla + Taslağa Aktar"
                        : "Eşleşmeyi Onayla"}
                  </button>
                </div>
              </>
            ) : (
              <div className="bh-ai-empty">Önce bir Pantone adayı seç.</div>
            )}
          </section>
        </div>
      ) : null}

      {notice ? <div className="bh-ai-message ok">{notice}</div> : null}
      {error ? <div className="bh-ai-message bad">{error}</div> : null}
      <footer className="bh-ai-foot">
        Pantone/HEX ekran karşılığı bir renk yakınlığıdır; fiziksel boya sonucu
        kumaş, baz, ürün ve prosesle değişebilir. Sistem formülü gizlice üretime
        yazmaz: öneri → kullanıcı onayı → taslak → gerçek lot kontrolü → üretim.
      </footer>
    </section>
  );
}

export default function BoyahaneProductionIntelligencePage({
  activeMainCompany,
  moduleActionContext,
  openModule,
}) {
  const [serialContext, setSerialContext] = useState(moduleActionContext || {});
  const [serialKey, setSerialKey] = useState(0);

  useEffect(() => {
    setSerialContext(moduleActionContext || {});
  }, [moduleActionContext]);

  return (
    <div className="bh-production-intelligence">
      <ColorAssistantDock
        activeMainCompany={activeMainCompany}
        moduleActionContext={serialContext}
        openModule={openModule}
        onDraftApplied={({ jobId }) => {
          setSerialContext((current) => ({
            ...current,
            boyahaneJobId: jobId,
            nonce: String(Date.now()),
          }));
          setSerialKey((current) => current + 1);
        }}
      />
      <BoyahaneProductionSerialPage
        key={serialKey}
        activeMainCompany={activeMainCompany}
        moduleActionContext={serialContext}
      />
    </div>
  );
}
