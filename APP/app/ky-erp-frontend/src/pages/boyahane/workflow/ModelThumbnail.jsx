import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { assetUrl } from "../../desen/DesenWorkflowShared";

export default function ModelThumbnail({
  src,
  alt = "Desen görseli",
  size = "small",
  className = "",
  previewable = true,
}) {
  const resolved = assetUrl(src);
  const [failed, setFailed] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => setFailed(false), [resolved]);
  useEffect(() => {
    if (!previewOpen) return undefined;
    const close = (event) => {
      if (event.key === "Escape") setPreviewOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [previewOpen]);

  const canPreview = Boolean(previewable && resolved && !failed && size !== "small");

  function openPreview(event) {
    if (!canPreview) return;
    event.preventDefault();
    event.stopPropagation();
    setPreviewOpen(true);
  }

  const preview = previewOpen && typeof document !== "undefined"
    ? createPortal(
        <div
          className="bh-image-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`${alt} büyük ön izleme`}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (event.target === event.currentTarget) setPreviewOpen(false);
          }}
        >
          <div className="bh-image-lightbox-card" onMouseDown={(event) => event.stopPropagation()}>
            <div className="bh-image-lightbox-head">
              <strong>{alt}</strong>
              <button
                type="button"
                className="bh-btn"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setPreviewOpen(false);
                }}
              >
                Kapat
              </button>
            </div>
            <img src={resolved} alt={alt} />
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <span
        className={`bh-model-thumbnail ${size} ${canPreview ? "previewable" : ""} ${className}`.trim()}
        title={canPreview ? "Görseli büyüt" : undefined}
        onClick={openPreview}
      >
        {resolved && !failed ? (
          <img src={resolved} alt={alt} onError={() => setFailed(true)} />
        ) : (
          <span>Görsel yok</span>
        )}
        {canPreview ? <em className="bh-image-zoom-hint">Büyüt</em> : null}
      </span>
      {preview}
    </>
  );
}
