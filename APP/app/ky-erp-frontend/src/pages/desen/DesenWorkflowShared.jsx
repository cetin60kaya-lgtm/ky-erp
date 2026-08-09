import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  FileImage,
  Layers3,
  Link2,
  Maximize2,
  Palette,
  Plus,
  RotateCw,
  Save,
  Search,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { apiUrl } from "../../utils/api";
import {
  createDesignOperation,
  createDesignModel,
  deleteDesignOperation,
  getDesignModel,
  getRegisteredDesignColors,
  linkDesignRegisteredColor,
  parseDesignChannels,
  processDesignInbox,
  replaceDesignChannels,
  updateDesignModel,
  updateDesignOperation,
} from "../../services/desenWorkflowApi";

export const PRINT_AREAS = [
  ["FRONT", "Ön"],
  ["BACK", "Arka"],
  ["NECK", "Ense"],
  ["NECK_LABEL", "Ense Etiket"],
  ["LEFT_SLEEVE", "Sol Kol"],
  ["RIGHT_SLEEVE", "Sağ Kol"],
  ["LEFT_LEG", "Sol Paça"],
  ["RIGHT_LEG", "Sağ Paça"],
  ["POCKET", "Cep"],
  ["COLLAR", "Yaka"],
  ["FRONT_HEM", "Ön Etek"],
  ["BACK_HEM", "Arka Etek"],
  ["HOOD", "Kapüşon"],
  ["SIDE_PANEL", "Yan Panel"],
  ["STRIP", "Şerit"],
  ["OTHER", "Diğer"],
];

export const CHANNEL_TYPES = [
  ["TRANSPARENT", "Şeffaf"],
  ["WHITE_BASE", "Beyaz Fon"],
  ["WHITE", "Beyaz"],
  ["PANTONE", "Pantone"],
  ["BLACK", "Siyah"],
  ["STANDARD_COLOR", "Standart Renk"],
  ["GLITTER", "Sim"],
  ["PUFF", "Kabaran"],
  ["FOIL_BASE", "Varak Zemini"],
  ["FLOCK_BASE", "Flock Zemini"],
  ["SPECIAL_EFFECT", "Özel Efekt"],
  ["OTHER", "Diğer"],
];

export const MODEL_STATUSES = [
  ["NEW_ARRIVAL", "Yeni Geldi"],
  ["MODEL_INFO_MISSING", "Model Bilgisi Eksik"],
  ["CHANNEL_IMAGE_MISSING", "Kanal Görseli Eksik"],
  ["CHANNEL_REVIEW_PENDING", "Kanal Kontrolü Bekliyor"],
  ["COLOR_MATCH_MISSING", "Renk Eşleşmesi Eksik"],
  ["PLACEMENT_WAITING", "Yerleşim Bekliyor"],
  ["DYEHOUSE_READY", "Boyahaneye Hazır"],
  ["PRODUCTION_READY", "Üretime Hazır"],
  ["REVISION_PENDING", "Revize Bekliyor"],
  ["PASSIVE", "Pasif"],
  ["ARCHIVE", "Arşiv"],
];

export function statusLabel(value) {
  return MODEL_STATUSES.find(([code]) => code === value)?.[1] || value || "-";
}

export function statusTone(value) {
  if (["PRODUCTION_READY", "READY"].includes(value)) return "green";
  if (["DYEHOUSE_READY"].includes(value)) return "teal";
  if (["PLACEMENT_WAITING", "WAITING"].includes(value)) return "orange";
  if (["CHANNEL_REVIEW_PENDING", "NEW_ARRIVAL"].includes(value)) return "blue";
  if (["COLOR_MATCH_MISSING", "UNRESOLVED"].includes(value)) return "yellow";
  if (["ERROR", "UNSUPPORTED"].includes(value)) return "red";
  return "gray";
}

export function assetUrl(value) {
  const url = String(value || "").trim();
  if (!url) return "";
  if (/^(blob:|data:|https?:\/\/)/i.test(url)) return url;
  return apiUrl(url);
}

export function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("tr-TR");
}

export function StatusBadge({ value, children }) {
  return (
    <span className={`dsg-status ${statusTone(value)}`}>
      {children || statusLabel(value)}
    </span>
  );
}

export function EmptyState({ icon: Icon = FileImage, title, text, action }) {
  return (
    <div className="dsg-empty">
      <Icon size={34} />
      <strong>{title}</strong>
      <span>{text}</span>
      {action}
    </div>
  );
}

export function WideModal({
  title,
  subtitle,
  children,
  footer,
  onClose,
  onSave,
  dirty = false,
  size = "wide",
}) {
  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === "Escape") {
        if (
          !dirty ||
          window.confirm("Kaydedilmemiş değişiklikler var. Kapatılsın mı?")
        )
          onClose?.();
      }
      if (event.ctrlKey && event.key === "Enter") {
        event.preventDefault();
        onSave?.();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [dirty, onClose, onSave]);

  const close = () => {
    if (
      !dirty ||
      window.confirm("Kaydedilmemiş değişiklikler var. Kapatılsın mı?")
    )
      onClose?.();
  };

  return (
    <div
      className="dsg-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <section
        className={`dsg-modal ${size}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="dsg-modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            type="button"
            className="dsg-icon-btn"
            onClick={close}
            aria-label="Kapat"
          >
            <X size={20} />
          </button>
        </header>
        <div className="dsg-modal-body">{children}</div>
        {footer && <footer className="dsg-modal-foot">{footer}</footer>}
      </section>
    </div>
  );
}

export function ImagePreview({ src, alt = "Desen önizleme", className = "" }) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  if (!src)
    return (
      <div className={`dsg-image-empty ${className}`}>
        <FileImage size={32} />
        <span>Görsel yok</span>
      </div>
    );
  const content = (
    <div
      className={`dsg-image-preview ${className} ${fullscreen ? "fullscreen" : ""}`}
    >
      <div className="dsg-image-tools">
        <button
          type="button"
          onClick={() => setZoom((value) => Math.min(3, value + 0.2))}
        >
          <ZoomIn size={16} />
        </button>
        <button
          type="button"
          onClick={() => setZoom((value) => Math.max(0.4, value - 0.2))}
        >
          <ZoomOut size={16} />
        </button>
        <button
          type="button"
          onClick={() => setRotation((value) => value + 90)}
        >
          <RotateCw size={16} />
        </button>
        <button
          type="button"
          onClick={() => {
            setZoom(1);
            setRotation(0);
          }}
        >
          <Check size={16} />
        </button>
        <button type="button" onClick={() => setFullscreen((value) => !value)}>
          <Maximize2 size={16} />
        </button>
      </div>
      <div className="dsg-image-stage">
        <img
          src={assetUrl(src)}
          alt={alt}
          style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
        />
      </div>
    </div>
  );
  return fullscreen ? (
    <div className="dsg-preview-fullscreen">{content}</div>
  ) : (
    content
  );
}

function draftOperation(operation = {}, sequence = 1) {
  const code = operation.printAreaCode || "FRONT";
  return {
    ...operation,
    printAreaCode: code,
    printAreaName:
      operation.printAreaName ||
      PRINT_AREAS.find(([item]) => item === code)?.[1] ||
      "Ön",
    sequence: operation.sequence || sequence,
    moldType: operation.moldType || "UNDEFINED",
    placementStatus: operation.placementStatus || "WAITING",
    dyehouseStatus: operation.dyehouseStatus || "WAITING",
    productionReady: Boolean(operation.productionReady),
    channels: (operation.channels || []).map((channel, index) => ({
      ...channel,
      sequence: channel.sequence || index + 1,
      included: channel.included !== false,
      groupKey:
        channel.groupKey ||
        operation.colorGroups?.find(
          (group) => group.id === channel.colorGroupId,
        )?.groupKey ||
        "",
    })),
  };
}

function inferDraftChannel(item, index) {
  return {
    ...item,
    id: item.id || `draft-${Date.now()}-${index}`,
    sequence: index + 1,
    included: item.included !== false,
    rawName: item.rawName || item.name || `Kanal ${index + 1}`,
    normalizedName:
      item.normalizedName || item.rawName || item.name || `Kanal ${index + 1}`,
    channelType: item.channelType || "OTHER",
    colorCode: item.colorCode || "",
    groupKey: item.groupKey || "",
  };
}

export function ModelEditorModal({
  activeMainCompany,
  companies,
  model,
  inboxGroup,
  onClose,
  onSaved,
}) {
  const isInbox = Boolean(inboxGroup);
  const isExisting = Boolean(model?.id);
  const initialFiles = inboxGroup?.files || [];
  const [tab, setTab] = useState("model");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false);
  const [quickEntry, setQuickEntry] = useState(false);
  const [colorPicker, setColorPicker] = useState(null);
  const [draft, setDraft] = useState(() => ({
    companyId: model?.companyId || "",
    companyName: model?.companyName || "",
    modelCode: model?.modelCode || inboxGroup?.modelName || "",
    modelName: model?.modelName || inboxGroup?.modelName || "",
    designName: model?.designName || "",
    groundColor: model?.groundColor || "",
    status:
      model?.status || (isInbox ? "CHANNEL_REVIEW_PENDING" : "NEW_ARRIVAL"),
    sourceType:
      model?.sourceType || (isInbox ? "FOLDER_SCAN" : "MANUAL_UPLOAD"),
    notes: model?.notes || "",
    operations: (model?.operations?.length
      ? model.operations
      : [{ printAreaCode: "FRONT", printAreaName: "Ön" }]
    ).map(draftOperation),
    files: initialFiles.map((file) => ({
      queueId: file.id,
      role: file.suggestedRole || "OTHER",
      printAreaCode: "FRONT",
      ...file,
    })),
  }));
  const [activeOperationIndex, setActiveOperationIndex] = useState(0);
  const operation =
    draft.operations[activeOperationIndex] || draft.operations[0];

  const update = (patch) => {
    setDraft((current) => ({ ...current, ...patch }));
    setDirty(true);
  };
  const updateOperation = (patch, index = activeOperationIndex) => {
    setDraft((current) => ({
      ...current,
      operations: current.operations.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    }));
    setDirty(true);
  };
  const updateChannel = (index, patch) =>
    updateOperation({
      channels: operation.channels.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    });

  const addArea = (code) => {
    if (draft.operations.some((item) => item.printAreaCode === code)) return;
    const name = PRINT_AREAS.find(([item]) => item === code)?.[1] || "Diğer";
    update({
      operations: [
        ...draft.operations,
        draftOperation(
          { printAreaCode: code, printAreaName: name },
          draft.operations.length + 1,
        ),
      ],
    });
    setActiveOperationIndex(draft.operations.length);
  };

  const removeArea = (index) => {
    if (draft.operations.length === 1)
      return setMessage("En az bir baskı bölgesi kalmalıdır.");
    update({
      operations: draft.operations.filter(
        (_, itemIndex) => itemIndex !== index,
      ),
    });
    setActiveOperationIndex(0);
  };

  const applyQuickCombination = (codes) => {
    update({
      operations: codes.map((code, index) =>
        draftOperation(
          draft.operations.find((item) => item.printAreaCode === code) || {
            printAreaCode: code,
            printAreaName: PRINT_AREAS.find(([item]) => item === code)?.[1],
          },
          index + 1,
        ),
      ),
    });
    setActiveOperationIndex(0);
  };

  const validation = useMemo(() => {
    const checks = [
      ["Firma seçildi", Boolean(draft.companyId)],
      ["Model adı var", Boolean(draft.modelName.trim())],
      ["En az bir baskı bölgesi var", draft.operations.length > 0],
      [
        "Kanal listeleri girildi",
        draft.operations.every(
          (item) =>
            item.channels?.filter((channel) => channel.included).length > 0,
        ),
      ],
      [
        "Aktif kanallar renk grubuna bağlı",
        draft.operations.every((item) =>
          item.channels
            ?.filter((channel) => channel.included)
            .every((channel) => channel.colorGroupId || channel.groupKey),
        ),
      ],
    ];
    return { checks, missing: checks.filter(([, ok]) => !ok).length };
  }, [draft]);

  const totals = useMemo(
    () =>
      draft.operations.reduce(
        (sum, item) => {
          const active = (item.channels || []).filter(
            (channel) => channel.included,
          );
          const groups = new Set(
            active
              .map((channel) => channel.colorGroupId || channel.groupKey)
              .filter(Boolean),
          );
          return {
            areas: sum.areas + 1,
            channels: sum.channels + active.length,
            molds: sum.molds + active.length,
            colors: sum.colors + groups.size,
          };
        },
        { areas: 0, channels: 0, molds: 0, colors: 0 },
      ),
    [draft.operations],
  );

  const save = async (readyForDyehouse = false) => {
    if (!draft.modelName.trim()) return setMessage("Model adı zorunludur.");
    if (readyForDyehouse && validation.missing)
      return setMessage(
        "Boyahaneye hazırlamak için eksik alanları tamamlayın.",
      );
    setBusy(true);
    setMessage("");
    try {
      let saved;
      const payload = {
        companyId: draft.companyId,
        companyName:
          companies.find((item) => String(item.id) === String(draft.companyId))
            ?.name || draft.companyName,
        modelCode: draft.modelCode,
        modelName: draft.modelName,
        designName: draft.designName,
        groundColor: draft.groundColor,
        status: readyForDyehouse ? "DYEHOUSE_READY" : draft.status,
        sourceType: draft.sourceType,
        notes: draft.notes,
        operations: draft.operations,
      };
      if (isInbox) {
        saved = await processDesignInbox(activeMainCompany, {
          ...payload,
          queueIds: draft.files.map((file) => file.queueId),
          files: draft.files,
        });
      } else if (!isExisting) {
        saved = await createDesignModel(activeMainCompany, payload);
      } else {
        await updateDesignModel(activeMainCompany, model.id, payload);
        const incomingIds = new Set(
          draft.operations.map((item) => item.id).filter(Boolean),
        );
        for (const old of model.operations || [])
          if (!incomingIds.has(old.id))
            await deleteDesignOperation(activeMainCompany, old.id);
        for (const item of draft.operations) {
          let persisted = item;
          if (item.id)
            await updateDesignOperation(activeMainCompany, item.id, item);
          else {
            const response = await createDesignOperation(
              activeMainCompany,
              model.id,
              item,
            );
            persisted =
              response.operations.find(
                (candidate) => candidate.printAreaCode === item.printAreaCode,
              ) || item;
          }
          if (persisted.id)
            await replaceDesignChannels(
              activeMainCompany,
              persisted.id,
              item.channels || [],
            );
        }
        saved = await getDesignModel(activeMainCompany, model.id);
      }
      setDirty(false);
      onSaved?.(saved, readyForDyehouse);
    } catch (error) {
      setMessage(error?.message || "Kayıt tamamlanamadı.");
    } finally {
      setBusy(false);
    }
  };

  const tabs = [
    ["model", "Model Bilgisi"],
    ["areas", "Baskı Bölgeleri"],
    ["channels", "Kanal Listesi"],
    ["colors", "Renk Eşleşmeleri"],
    ["files", "Dosyalar"],
    ["review", "Son Kontrol"],
  ];

  const mainImage =
    draft.files.find((file) => file.role === "MODEL_IMAGE")?.previewUrl ||
    model?.mainImage?.previewUrl;

  return (
    <WideModal
      title={
        isExisting
          ? `${draft.modelName} modelini düzenle`
          : "Model ve Kanal Kontrolü"
      }
      subtitle="Model, baskı bölgesi, kanal ve renk bilgilerini tek akışta tamamlayın."
      onClose={onClose}
      onSave={() => save(false)}
      dirty={dirty}
      footer={
        <>
          <div className="dsg-foot-message">
            {message && (
              <span className="error">
                <AlertTriangle size={16} /> {message}
              </span>
            )}
            <small>Ctrl+Enter ile kaydedebilirsiniz.</small>
          </div>
          <button className="dsg-btn ghost" onClick={onClose}>
            Vazgeç
          </button>
          <button
            className="dsg-btn"
            disabled={busy}
            onClick={() => save(false)}
          >
            <Save size={16} /> Taslak Kaydet
          </button>
          <button
            className="dsg-btn primary"
            disabled={busy || validation.missing > 0}
            onClick={() => save(true)}
          >
            <Check size={16} /> Kaydet ve Boyahaneye Hazırla
          </button>
        </>
      }
    >
      <div className="dsg-editor-summary">
        <div className="dsg-summary-image">
          {mainImage ? (
            <img src={assetUrl(mainImage)} alt="Model" />
          ) : (
            <FileImage size={28} />
          )}
        </div>
        <div>
          <span>Firma</span>
          <strong>
            {companies.find(
              (item) => String(item.id) === String(draft.companyId),
            )?.name || "Seçilmedi"}
          </strong>
        </div>
        <div>
          <span>Model</span>
          <strong>{draft.modelName || "Adsız model"}</strong>
        </div>
        <div>
          <span>Baskı Bölgesi</span>
          <strong>{totals.areas}</strong>
        </div>
        <div>
          <span>Toplam Kanal / Kalıp</span>
          <strong>
            {totals.channels} / {totals.molds}
          </strong>
        </div>
        <div>
          <span>Benzersiz Boya</span>
          <strong>{totals.colors}</strong>
        </div>
        <div>
          <span>Eksik Bilgi</span>
          <strong className={validation.missing ? "danger" : "success"}>
            {validation.missing}
          </strong>
        </div>
        <StatusBadge value={draft.status} />
      </div>
      <nav className="dsg-modal-tabs">
        {tabs.map(([key, label]) => (
          <button
            type="button"
            key={key}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "model" && (
        <div className="dsg-tab-grid model-info">
          <ImagePreview src={mainImage} />
          <div className="dsg-form-grid two">
            <label>
              Firma
              <select
                value={draft.companyId}
                onChange={(event) => update({ companyId: event.target.value })}
              >
                <option value="">Firma seçin</option>
                {companies.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Model kodu
              <input
                value={draft.modelCode}
                onChange={(event) => update({ modelCode: event.target.value })}
              />
            </label>
            <label>
              Model adı
              <input
                value={draft.modelName}
                onChange={(event) => update({ modelName: event.target.value })}
              />
            </label>
            <label>
              Desen adı
              <input
                value={draft.designName}
                onChange={(event) => update({ designName: event.target.value })}
              />
            </label>
            <label>
              Zemin
              <input
                value={draft.groundColor}
                onChange={(event) =>
                  update({ groundColor: event.target.value })
                }
              />
            </label>
            <label>
              Kaynak
              <select
                value={draft.sourceType}
                onChange={(event) => update({ sourceType: event.target.value })}
              >
                <option value="FOLDER_SCAN">Klasör Taraması</option>
                <option value="MANUAL_UPLOAD">Manuel Yükleme</option>
                <option value="PHOTOSHOP_UXP" disabled>
                  Photoshop UXP (hazır altyapı)
                </option>
              </select>
            </label>
            <label>
              Durum
              <select
                value={draft.status}
                onChange={(event) => update({ status: event.target.value })}
              >
                {MODEL_STATUSES.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="span-2">
              Açıklama
              <textarea
                value={draft.notes}
                onChange={(event) => update({ notes: event.target.value })}
              />
            </label>
          </div>
        </div>
      )}

      {tab === "areas" && (
        <div className="dsg-area-workspace">
          <div className="dsg-quick-combos">
            <span>Hızlı kombinasyon:</span>
            <button onClick={() => applyQuickCombination(["FRONT"])}>
              Yalnız Ön
            </button>
            <button onClick={() => applyQuickCombination(["FRONT", "NECK"])}>
              Ön + Ense
            </button>
            <button onClick={() => applyQuickCombination(["FRONT", "BACK"])}>
              Ön + Arka
            </button>
            <button
              onClick={() =>
                applyQuickCombination(["FRONT", "LEFT_SLEEVE", "RIGHT_SLEEVE"])
              }
            >
              Ön + İki Kol
            </button>
            <select
              value=""
              onChange={(event) =>
                event.target.value && addArea(event.target.value)
              }
            >
              <option value="">Bölge ekle…</option>
              {PRINT_AREAS.filter(
                ([code]) =>
                  !draft.operations.some((item) => item.printAreaCode === code),
              ).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="dsg-area-cards">
            {draft.operations.map((item, index) => (
              <article
                key={item.id || item.printAreaCode}
                className={activeOperationIndex === index ? "active" : ""}
                onClick={() => setActiveOperationIndex(index)}
              >
                <div className="dsg-area-card-head">
                  <div>
                    <StatusBadge value={item.placementStatus}>
                      {item.printAreaName}
                    </StatusBadge>
                    <h3>{item.printAreaName}</h3>
                  </div>
                  <button
                    className="dsg-icon-btn danger"
                    onClick={(event) => {
                      event.stopPropagation();
                      removeArea(index);
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="dsg-metrics mini">
                  <span>
                    Kanal
                    <strong>
                      {item.channels?.filter((channel) => channel.included)
                        .length || 0}
                    </strong>
                  </span>
                  <span>
                    Kalıp
                    <strong>
                      {item.channels?.filter((channel) => channel.included)
                        .length || 0}
                    </strong>
                  </span>
                  <span>
                    Boya
                    <strong>
                      {
                        new Set(
                          (item.channels || [])
                            .filter((channel) => channel.included)
                            .map(
                              (channel) =>
                                channel.colorGroupId || channel.groupKey,
                            )
                            .filter(Boolean),
                        ).size
                      }
                    </strong>
                  </span>
                </div>
                <div className="dsg-form-grid two">
                  <label>
                    Kalıp tipi
                    <select
                      value={item.moldType}
                      onChange={(event) =>
                        updateOperation({ moldType: event.target.value }, index)
                      }
                    >
                      <option value="UNDEFINED">Belirsiz</option>
                      <option value="K_BOY">K-Boy</option>
                      <option value="B_BOY">B-Boy</option>
                      <option value="SPECIAL">Özel</option>
                    </select>
                  </label>
                  <label>
                    Yerleşim
                    <select
                      value={item.placementStatus}
                      onChange={(event) =>
                        updateOperation(
                          { placementStatus: event.target.value },
                          index,
                        )
                      }
                    >
                      <option value="WAITING">Bekliyor</option>
                      <option value="READY">Hazır</option>
                      <option value="REVISION_PENDING">Revize</option>
                    </select>
                  </label>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {tab === "channels" && operation && (
        <div className="dsg-channel-layout">
          <div className="dsg-channel-visual">
            <div className="dsg-operation-switch">
              {draft.operations.map((item, index) => (
                <button
                  className={index === activeOperationIndex ? "active" : ""}
                  onClick={() => setActiveOperationIndex(index)}
                  key={item.id || item.printAreaCode}
                >
                  {item.printAreaName}
                </button>
              ))}
            </div>
            <ImagePreview
              src={
                draft.files.find(
                  (file) =>
                    file.role === "CHANNEL_IMAGE" &&
                    (!file.printAreaCode ||
                      file.printAreaCode === operation.printAreaCode),
                )?.previewUrl ||
                model?.files?.find(
                  (file) => file.id === operation.channelImageFileId,
                )?.previewUrl
              }
            />
          </div>
          <div className="dsg-channel-table-panel">
            <div className="dsg-panel-tools">
              <div>
                <h3>{operation.printAreaName} kanal listesi</h3>
                <small>
                  Her aktif kanal bir kalıptır; boya sayısı renk grubuna göre
                  hesaplanır.
                </small>
              </div>
              <button className="dsg-btn" onClick={() => setQuickEntry(true)}>
                <Plus size={16} /> Kanal Listesini Hızlı Gir
              </button>
            </div>
            {operation.channels?.length ? (
              <div className="dsg-table-wrap">
                <table className="dsg-table channels">
                  <thead>
                    <tr>
                      <th>Sıra</th>
                      <th>Aktif</th>
                      <th>Ham Kanal</th>
                      <th>Düzeltilmiş Ad</th>
                      <th>Kanal Tipi</th>
                      <th>Renk / Pantone</th>
                      <th>Renk Grubu</th>
                      <th>Durum</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {operation.channels.map((channel, index) => (
                      <tr key={channel.id || index}>
                        <td>
                          <input
                            className="tiny"
                            type="number"
                            value={channel.sequence}
                            onChange={(event) =>
                              updateChannel(index, {
                                sequence: Number(event.target.value),
                              })
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            checked={channel.included}
                            onChange={(event) =>
                              updateChannel(index, {
                                included: event.target.checked,
                              })
                            }
                          />
                        </td>
                        <td>
                          <input
                            value={channel.rawName}
                            onChange={(event) =>
                              updateChannel(index, {
                                rawName: event.target.value,
                              })
                            }
                          />
                        </td>
                        <td>
                          <input
                            value={channel.normalizedName}
                            onChange={(event) =>
                              updateChannel(index, {
                                normalizedName: event.target.value,
                              })
                            }
                          />
                        </td>
                        <td>
                          <select
                            value={channel.channelType}
                            onChange={(event) =>
                              updateChannel(index, {
                                channelType: event.target.value,
                              })
                            }
                          >
                            {CHANNEL_TYPES.map(([code, label]) => (
                              <option key={code} value={code}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            value={channel.colorCode || ""}
                            onChange={(event) =>
                              updateChannel(index, {
                                colorCode: event.target.value,
                              })
                            }
                          />
                        </td>
                        <td>
                          <input
                            value={channel.groupKey || ""}
                            onChange={(event) =>
                              updateChannel(index, {
                                groupKey: event.target.value,
                              })
                            }
                            placeholder="WHITE"
                          />
                        </td>
                        <td>
                          <StatusBadge
                            value={
                              channel.registeredColorId ? "READY" : "UNRESOLVED"
                            }
                          >
                            {channel.registeredColorId ? "Eşleşti" : "Bekliyor"}
                          </StatusBadge>
                        </td>
                        <td>
                          <button
                            className="dsg-icon-btn danger"
                            onClick={() =>
                              updateOperation({
                                channels: operation.channels
                                  .filter((_, itemIndex) => itemIndex !== index)
                                  .map((item, itemIndex) => ({
                                    ...item,
                                    sequence: itemIndex + 1,
                                  })),
                              })
                            }
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={Layers3}
                title="Kanal listesi henüz girilmedi"
                text="Kanal görselini kontrol edip hızlı giriş ile sıralı liste oluşturun."
                action={
                  <button
                    className="dsg-btn primary"
                    onClick={() => setQuickEntry(true)}
                  >
                    Kanal Listesini Hızlı Gir
                  </button>
                }
              />
            )}
          </div>
        </div>
      )}

      {tab === "colors" && (
        <ColorMatches
          activeMainCompany={activeMainCompany}
          operations={draft.operations}
          model={model}
          onPick={(value) => setColorPicker(value)}
        />
      )}

      {tab === "files" && (
        <div className="dsg-files-grid">
          {(draft.files.length ? draft.files : model?.files || []).map(
            (file, index) => (
              <article key={file.id || file.queueId || index}>
                <ImagePreview src={file.previewUrl} />
                <div>
                  <strong>{file.originalFileName || file.fileName}</strong>
                  <span>
                    {file.fileSize
                      ? `${(file.fileSize / 1024).toFixed(1)} KB`
                      : ""}
                  </span>
                  <label>
                    Dosya rolü
                    <select
                      value={file.role || file.fileRole || "OTHER"}
                      onChange={(event) =>
                        update({
                          files: draft.files.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, role: event.target.value }
                              : item,
                          ),
                        })
                      }
                    >
                      <option value="MODEL_IMAGE">Model Görseli</option>
                      <option value="CHANNEL_IMAGE">Kanal Görseli</option>
                      <option value="PLACEMENT_IMAGE">Yerleşim Görseli</option>
                      <option value="TECHNICAL_IMAGE">Teknik Görsel</option>
                      <option value="OTHER">Diğer</option>
                    </select>
                  </label>
                  {file.fileHash && <code>{file.fileHash.slice(0, 18)}…</code>}
                </div>
              </article>
            ),
          )}
        </div>
      )}

      {tab === "review" && (
        <div className="dsg-review-layout">
          <section>
            <h3>Kayıt öncesi kontrol</h3>
            {validation.checks.map(([label, ok]) => (
              <div
                className={`dsg-check-row ${ok ? "ok" : "missing"}`}
                key={label}
              >
                {ok ? <Check size={18} /> : <AlertTriangle size={18} />}
                <span>{label}</span>
                <strong>{ok ? "Tamam" : "Eksik"}</strong>
              </div>
            ))}
          </section>
          <section className="dsg-review-summary">
            <h3>Model özeti</h3>
            <div className="dsg-metrics">
              <span>
                Baskı Bölgesi<strong>{totals.areas}</strong>
              </span>
              <span>
                Toplam Kanal<strong>{totals.channels}</strong>
              </span>
              <span>
                Toplam Kalıp<strong>{totals.molds}</strong>
              </span>
              <span>
                Benzersiz Boya<strong>{totals.colors}</strong>
              </span>
              <span>
                Eksik Alan<strong>{validation.missing}</strong>
              </span>
            </div>
            <p>
              Boyahaneye hazır kayıt için bütün aktif kanalların renk grubuna
              bağlanması gerekir. Reçete ve gramaj Boyahane tarafında yönetilir.
            </p>
          </section>
        </div>
      )}

      {quickEntry && (
        <QuickChannelModal
          activeMainCompany={activeMainCompany}
          operationId={operation?.id || "draft"}
          onClose={() => setQuickEntry(false)}
          onApply={(channels) => {
            updateOperation({ channels: channels.map(inferDraftChannel) });
            setQuickEntry(false);
          }}
        />
      )}
      {colorPicker && (
        <RegisteredColorModal
          activeMainCompany={activeMainCompany}
          target={colorPicker}
          onClose={() => setColorPicker(null)}
          onLinked={() => {
            setColorPicker(null);
            onSaved?.();
          }}
        />
      )}
    </WideModal>
  );
}

function QuickChannelModal({
  activeMainCompany,
  operationId,
  onClose,
  onApply,
}) {
  const [text, setText] = useState(
    "1 şeffaf\n2 beyaz fon\n3 beyaz\n4 14-4320\n5 18-4037\n6 siyah",
  );
  const [preview, setPreview] = useState([]);
  const [message, setMessage] = useState("");
  const parse = async () => {
    try {
      const result = await parseDesignChannels(
        activeMainCompany,
        operationId,
        text,
      );
      setPreview(result.channels || []);
    } catch (error) {
      setMessage(error?.message || "Liste ayrıştırılamadı.");
    }
  };
  return (
    <WideModal
      size="medium"
      title="Kanal Listesini Hızlı Gir"
      subtitle="Satır sonu, virgül, noktalı virgül ve tab ayracı desteklenir."
      onClose={onClose}
      footer={
        <>
          <span className="dsg-foot-message">{message}</span>
          <button className="dsg-btn ghost" onClick={onClose}>
            Vazgeç
          </button>
          <button className="dsg-btn" onClick={parse}>
            Ayrıştır
          </button>
          <button
            className="dsg-btn primary"
            disabled={!preview.length}
            onClick={() => onApply(preview)}
          >
            Listeyi Kullan
          </button>
        </>
      }
    >
      <div className="dsg-quick-entry">
        <label>
          Kanal metni
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        {preview.length > 0 && (
          <div className="dsg-table-wrap">
            <table className="dsg-table">
              <thead>
                <tr>
                  <th>Sıra</th>
                  <th>Kanal</th>
                  <th>Tip</th>
                  <th>Renk</th>
                  <th>Grup</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((item) => (
                  <tr key={item.sequence}>
                    <td>{item.sequence}</td>
                    <td>{item.rawName}</td>
                    <td>{item.channelType}</td>
                    <td>{item.colorCode || "-"}</td>
                    <td>{item.groupKey}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </WideModal>
  );
}

function ColorMatches({ operations, model, onPick }) {
  const cards = operations.flatMap((operation) => {
    const groups = new Map();
    (operation.channels || [])
      .filter((channel) => channel.included)
      .forEach((channel) => {
        const key =
          channel.colorGroupId || channel.groupKey || `MISSING-${channel.id}`;
        const current = groups.get(key) || {
          id: channel.colorGroupId,
          groupKey: channel.groupKey,
          operationId: operation.id,
          operationName: operation.printAreaName,
          displayName: channel.groupKey || channel.colorCode || "Grupsuz",
          colorCode: channel.colorCode,
          channels: [],
          registeredColorId: channel.registeredColorId,
        };
        current.channels.push(channel);
        if (channel.registeredColorId)
          current.registeredColorId = channel.registeredColorId;
        groups.set(key, current);
      });
    return [...groups.values()];
  }, []);
  return (
    <div className="dsg-color-grid">
      {cards.map((group, index) => (
        <article
          key={`${group.operationId}-${group.id || group.groupKey}-${index}`}
        >
          <div
            className="dsg-color-swatch"
            style={{
              background: /^#[0-9a-f]{6}$/i.test(group.colorCode || "")
                ? group.colorCode
                : undefined,
            }}
          >
            <Palette size={22} />
          </div>
          <div>
            <small>{group.operationName}</small>
            <h3>{group.displayName}</h3>
            <p>
              {group.channels
                .map((channel) => channel.normalizedName)
                .join(", ")}
            </p>
            <strong>{group.channels.length} kalıp / 1 boya</strong>
          </div>
          <StatusBadge value={group.registeredColorId ? "READY" : "UNRESOLVED"}>
            {group.registeredColorId ? "Kayıtlı Renk Bulundu" : "Kayıtlı Değil"}
          </StatusBadge>
          {onPick && model?.id && group.id && (
            <button className="dsg-btn" onClick={() => onPick(group)}>
              <Search size={15} /> Kayıtlı Renkte Ara
            </button>
          )}
        </article>
      ))}
    </div>
  );
}

function RegisteredColorModal({
  activeMainCompany,
  target,
  onClose,
  onLinked,
}) {
  const [q, setQ] = useState(target.colorCode || target.displayName || "");
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const search = useCallback(async () => {
    setBusy(true);
    try {
      setRows(await getRegisteredDesignColors(activeMainCompany, q));
    } finally {
      setBusy(false);
    }
  }, [activeMainCompany, q]);
  useEffect(() => {
    search();
  }, [search]);
  const link = async (color) => {
    await linkDesignRegisteredColor(activeMainCompany, target.id, color.id);
    onLinked?.(color);
  };
  return (
    <WideModal
      size="medium"
      title="Kayıtlı Boyahane Rengiyle Eşleştir"
      subtitle={`${target.displayName} renk grubu için kayıtlı renk arayın.`}
      onClose={onClose}
      footer={
        <>
          <span />
          <button className="dsg-btn ghost" onClick={onClose}>
            Vazgeç
          </button>
        </>
      }
    >
      <div className="dsg-color-search">
        <div className="dsg-search-row">
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && search()}
          />
          <button className="dsg-btn primary" onClick={search} disabled={busy}>
            <Search size={16} /> Ara
          </button>
        </div>
        {rows.map((color) => (
          <button
            key={color.id}
            className="dsg-registered-color"
            onClick={() => link(color)}
          >
            <span
              className="dsg-color-dot"
              style={{ background: color.hex || "#e2e8f0" }}
            />
            <div>
              <strong>{color.colorName}</strong>
              <small>
                {color.colorCode || "Kod yok"} · {color.recipeCount} reçete
              </small>
            </div>
            <Link2 size={18} />
          </button>
        ))}
      </div>
    </WideModal>
  );
}

export function ModelDetailModal({
  model,
  onClose,
  onEdit,
  onArchive,
  onDyehouse,
}) {
  const [tab, setTab] = useState("general");
  const tabs = [
    ["general", "Genel"],
    ["areas", "Baskı Bölgeleri"],
    ["channels", "Kanallar"],
    ["colors", "Renk Grupları"],
    ["files", "Dosyalar"],
    ["dyehouse", "Boyahane Durumu"],
    ["logs", "İşlem Logları"],
  ];
  return (
    <WideModal
      title={`${model.modelName} model detayı`}
      subtitle={`${model.companyName} · ${model.operations.length} baskı bölgesi`}
      onClose={onClose}
      footer={
        <>
          <button className="dsg-btn danger" onClick={onArchive}>
            <Archive size={16} /> Arşivle
          </button>
          <span className="dsg-foot-spacer" />
          <button className="dsg-btn" onClick={onEdit}>
            Düzenle
          </button>
          <button className="dsg-btn primary" onClick={onDyehouse}>
            <Palette size={16} /> Boyahaneye Hazırla
          </button>
        </>
      }
    >
      <div className="dsg-editor-summary">
        <div className="dsg-summary-image">
          {model.mainImage ? (
            <img src={assetUrl(model.mainImage.previewUrl)} alt="Model" />
          ) : (
            <FileImage />
          )}
        </div>
        <div>
          <span>Firma</span>
          <strong>{model.companyName}</strong>
        </div>
        <div>
          <span>Model</span>
          <strong>{model.modelName}</strong>
        </div>
        <div>
          <span>Kanal / Kalıp</span>
          <strong>
            {model.totals.activeChannelCount} / {model.totals.totalMoldCount}
          </strong>
        </div>
        <div>
          <span>Benzersiz Boya</span>
          <strong>{model.totals.uniqueColorCount}</strong>
        </div>
        <div>
          <span>Eksik Renk</span>
          <strong>{model.totals.unresolvedColorCount}</strong>
        </div>
        <StatusBadge value={model.status} />
      </div>
      <nav className="dsg-modal-tabs">
        {tabs.map(([key, label]) => (
          <button
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
            key={key}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === "general" && (
        <div className="dsg-detail-general">
          <ImagePreview src={model.mainImage?.previewUrl} />
          <dl>
            <dt>Model kodu</dt>
            <dd>{model.modelCode || "-"}</dd>
            <dt>Desen adı</dt>
            <dd>{model.designName || "-"}</dd>
            <dt>Zemin</dt>
            <dd>{model.groundColor || "-"}</dd>
            <dt>Kaynak</dt>
            <dd>{model.sourceType}</dd>
            <dt>Son güncelleme</dt>
            <dd>{formatDate(model.updatedAt)}</dd>
            <dt>Açıklama</dt>
            <dd>{model.metadata?.analysis?.summary || model.notes || "-"}</dd>
            <dt>Pantone kodları</dt>
            <dd>
              {model.metadata?.analysis?.pantoneCodes?.join(", ") || "-"}
            </dd>
            <dt>Tema / karakter</dt>
            <dd>
              {[
                ...(model.metadata?.analysis?.characters || []),
                ...(model.metadata?.analysis?.themes || []),
                ...(model.metadata?.analysis?.shapes || []),
              ]
                .filter(Boolean)
                .join(", ") || "-"}
            </dd>
            <dt>Görünen yazılar</dt>
            <dd>
              {model.metadata?.analysis?.writtenText?.join(", ") || "-"}
            </dd>
            <dt>Algılanan renkler</dt>
            <dd>{model.metadata?.analysis?.colors?.join(", ") || "-"}</dd>
            <dt>Akıllı tarama</dt>
            <dd>
              {model.metadata?.analysis?.analyzedAt
                ? `${formatDate(model.metadata.analysis.analyzedAt)} · OCR ${model.metadata.analysis.ocrStatus}${model.metadata.analysis.visionStatus ? ` · Görsel ${model.metadata.analysis.visionStatus}` : ""}`
                : "Henüz taranmadı"}
            </dd>
          </dl>
        </div>
      )}
      {tab === "areas" && (
        <div className="dsg-area-cards">
          {model.operations.map((operation) => (
            <article key={operation.id}>
              <h3>{operation.printAreaName}</h3>
              <StatusBadge value={operation.placementStatus}>
                {operation.placementStatus}
              </StatusBadge>
              <div className="dsg-metrics mini">
                <span>
                  Kanal<strong>{operation.totals.activeChannelCount}</strong>
                </span>
                <span>
                  Kalıp<strong>{operation.totals.totalMoldCount}</strong>
                </span>
                <span>
                  Boya<strong>{operation.totals.uniqueColorCount}</strong>
                </span>
              </div>
              <p>Kalıp tipi: {operation.moldType || "Belirsiz"}</p>
            </article>
          ))}
        </div>
      )}
      {tab === "channels" && (
        <div className="dsg-table-wrap">
          <table className="dsg-table">
            <thead>
              <tr>
                <th>Bölge</th>
                <th>Sıra</th>
                <th>Kanal</th>
                <th>Tip</th>
                <th>Renk</th>
                <th>Grup</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {model.operations.flatMap((operation) =>
                operation.channels.map((channel) => (
                  <tr key={channel.id}>
                    <td>{operation.printAreaName}</td>
                    <td>{channel.sequence}</td>
                    <td>{channel.normalizedName}</td>
                    <td>{channel.channelType}</td>
                    <td>{channel.colorCode || "-"}</td>
                    <td>
                      {operation.colorGroups.find(
                        (group) => group.id === channel.colorGroupId,
                      )?.displayName || "-"}
                    </td>
                    <td>
                      <StatusBadge
                        value={
                          channel.registeredColorId ? "READY" : "UNRESOLVED"
                        }
                      >
                        {channel.registeredColorId ? "Eşleşti" : "Bekliyor"}
                      </StatusBadge>
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      )}
      {tab === "colors" && (
        <ColorMatches operations={model.operations} model={model} />
      )}
      {tab === "files" && (
        <div className="dsg-files-grid">
          {model.files.map((file) => (
            <article key={file.id}>
              <ImagePreview src={file.previewUrl} />
              <div>
                <strong>{file.originalFileName || file.fileName}</strong>
                <span>{file.fileRole}</span>
                <code>{file.fileHash?.slice(0, 18)}…</code>
                <a
                  className="dsg-btn"
                  href={assetUrl(file.previewUrl)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Download size={15} /> Aç
                </a>
              </div>
            </article>
          ))}
        </div>
      )}
      {tab === "dyehouse" && (
        <div className="dsg-review-layout">
          <section>
            <h3>Boyahane aktarım durumu</h3>
            {model.operations.map((operation) => (
              <div className="dsg-check-row" key={operation.id}>
                <Palette size={18} />
                <span>{operation.printAreaName}</span>
                <StatusBadge value={operation.dyehouseStatus}>
                  {operation.dyehouseStatus}
                </StatusBadge>
              </div>
            ))}
          </section>
          <section className="dsg-review-summary">
            <p>
              Desen modülü kanal sırası, kalıp ve renk grubu bilgisini hazırlar.
              Reçete, gramaj, lot ve üretim onayı Boyahane modülünde korunur.
            </p>
          </section>
        </div>
      )}
      {tab === "logs" && (
        <div className="dsg-log-list">
          {model.logs.map((log) => (
            <div key={log.id}>
              <span>{formatDate(log.createdAt)}</span>
              <strong>{log.action}</strong>
              <p>{log.description}</p>
            </div>
          ))}
        </div>
      )}
    </WideModal>
  );
}

export function Pager({ index, count, onPrevious, onNext }) {
  return (
    <div className="dsg-pager">
      <button
        className="dsg-icon-btn"
        onClick={onPrevious}
        disabled={index <= 0}
      >
        <ChevronLeft />
      </button>
      <span>
        {count ? index + 1 : 0} / {count}
      </span>
      <button
        className="dsg-icon-btn"
        onClick={onNext}
        disabled={index >= count - 1}
      >
        <ChevronRight />
      </button>
    </div>
  );
}
