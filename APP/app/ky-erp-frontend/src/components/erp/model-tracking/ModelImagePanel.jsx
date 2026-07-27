import { Maximize2, Plus, RefreshCw, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { normalizeModelImages } from "../../../services/modelTrackingService";

function fallbackThumb(index) {
  const list = [
    "linear-gradient(132deg, rgba(148, 163, 184, 0.2) 0 1px, transparent 1px 44%), radial-gradient(circle at 72% 18%, rgba(120, 113, 108, 0.16), transparent 22%), linear-gradient(145deg, #fafaf9, #e7e5e4)",
    "linear-gradient(38deg, transparent 0 42%, rgba(100, 116, 139, 0.22) 43% 44%, transparent 45%), radial-gradient(circle at 24% 82%, rgba(168, 162, 158, 0.18), transparent 24%), linear-gradient(145deg, #f8fafc, #e2e8f0)",
    "linear-gradient(116deg, transparent 0 52%, rgba(120, 113, 108, 0.24) 53% 54%, transparent 55%), radial-gradient(circle at 78% 72%, rgba(87, 83, 78, 0.18), transparent 20%), linear-gradient(145deg, #f5f5f4, #d6d3d1)",
  ];
  return list[index % list.length];
}

export default function ModelImagePanel({ images = [], onUpload, onUpdate }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const fileInputRef = useRef(null);

  const normalized = useMemo(
    () => normalizeModelImages(images),
    [images],
  );

  const selected = normalized[activeIndex] || null;

  function handleFiles(event) {
    const files = event?.target.files;
    if (!files.length) return;
    onUpload?.(files);
    event.target.value = "";
  }

  return (
    <section className="content-card model-image-panel">
      <div className="model-image-panel-head">
        <h4>Seçili Model Görseli</h4>
        <small>Üzerine gelince yakınlaşır</small>
      </div>

      <div
        className="model-image-frame"
        onClick={() => selected && setShowFullscreen(true)}
      >
        {selected.url ? (
          <img src={selected.url} alt={selected.name} />
        ) : (
          <div
            className="model-image-fallback"
            style={{ background: fallbackThumb(0) }}
          />
        )}
        <button
          type="button"
          className="model-image-expand-btn"
          aria-label="Büyüt"
          onClick={(event) => {
            event?.stopPropagation();
            setShowFullscreen(true);
          }}
        >
          <Maximize2 size={16} />
        </button>
      </div>

      <div className="model-image-thumb-row">
        {[0, 1, 2].map((index) => {
          const item = normalized[index];
          return (
            <button
              key={item?.id || `thumb-${index}`}
              type="button"
              className={`model-image-thumb ${activeIndex === index ? "is-active" : ""}`}
              onClick={() => setActiveIndex(index)}
            >
              {item?.url ? (
                <img src={item?.url} alt={item?.name} />
              ) : (
                <div
                  className="model-image-fallback"
                  style={{ background: fallbackThumb(index) }}
                />
              )}
            </button>
          );
        })}
        <button
          type="button"
          className="model-image-add"
          onClick={() => fileInputRef.current.click()}
        >
          <Plus size={14} />
          <span>Görsel Ekle</span>
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={handleFiles}
      />

      <div className="model-image-actions">
        <button
          type="button"
          className="soft-btn"
          onClick={() => fileInputRef.current.click()}
        >
          <Upload size={14} />
          Görsel Yükle
        </button>
        <button type="button" className="primary-btn" onClick={onUpdate}>
          <RefreshCw size={14} />
          Güncelle
        </button>
      </div>

      {showFullscreen ? (
        <div
          className="model-image-modal"
          onClick={() => setShowFullscreen(false)}
        >
          <div className="model-image-modal-body">
            {selected.url ? (
              <img src={selected.url} alt={selected.name} />
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
