import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import "./kyRecordDialog.css";

import { dialogSizeBounds, RECORD_START_SIZE } from "./kyRecordDialogSize.js";

const STORAGE_KEY = "kyerp:shared-record-dialog:size:v1";
function viewport() {
  return {
    width: typeof window === "undefined" ? 1440 : window.innerWidth,
    height: typeof window === "undefined" ? 900 : window.innerHeight,
  };
}

function initialSize() {
  if (typeof window === "undefined") return RECORD_START_SIZE;
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    return dialogSizeBounds(stored || RECORD_START_SIZE, viewport());
  } catch {
    return dialogSizeBounds(RECORD_START_SIZE, viewport());
  }
}

/**
 * Tek KY ERP kayıt penceresi. Çerçeve bütün modüllerde ortaktır; form alanları
 * ve ilgili belgenin iş kuralları kendi modülünün sorumluluğunda kalır.
 * Sekmeler içeriği değiştirir, dış en/boy ölçüsünü değiştirmez.
 */
export default function KyRecordDialog({
  title, subtitle, children, footer, onClose, onSave, onSubmit,
  dirty = false, busy = false, className = "", bodyClassName = "",
  headerClassName = "", footerClassName = "", as = "section",
}) {
  const dialogRef = useRef(null);
  const pointer = useRef(null);
  const [size, setSize] = useState(initialSize);
  const Element = as === "form" ? "form" : "section";
  const close = useCallback(() => {
    if (busy) return;
    if (!dirty || window.confirm("Kaydedilmemiş değişiklikler var. Kapatılsın mı?")) onClose?.();
  }, [busy, dirty, onClose]);

  useEffect(() => {
    function keydown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      } else if (event.ctrlKey && event.key === "Enter" && onSave) {
        event.preventDefault();
        onSave();
      }
    }
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [close, onSave]);

  useEffect(() => {
    function onViewportResize() {
      setSize((old) => dialogSizeBounds(old, viewport()));
    }
    window.addEventListener("resize", onViewportResize);
    return () => window.removeEventListener("resize", onViewportResize);
  }, []);

  function remember(next) {
    setSize(next);
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* Oturumda yine çalışır. */ }
  }

  function resizeStart(event) {
    if (event.button !== 0 || window.matchMedia("(max-width: 700px)").matches) return;
    const rect = dialogRef.current?.getBoundingClientRect();
    if (!rect) return;
    event.preventDefault();
    pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY, width: rect.width, height: rect.height };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function resizeMove(event) {
    const started = pointer.current;
    if (!started || started.id !== event.pointerId) return;
    const max = viewport();
    remember(dialogSizeBounds({
      width: started.width + event.clientX - started.x,
      height: started.height + event.clientY - started.y,
    }, max));
  }

  function resizeEnd(event) {
    if (pointer.current?.id !== event.pointerId) return;
    pointer.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function resizeKeyboard(event) {
    const nudge = { ArrowRight: [24, 0], ArrowLeft: [-24, 0], ArrowDown: [0, 24], ArrowUp: [0, -24] }[event.key];
    if (!nudge) return;
    event.preventDefault();
    remember(dialogSizeBounds({ width: size.width + nudge[0], height: size.height + nudge[1] }, viewport()));
  }

  return (
    <div className="ky-record-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <Element
        ref={dialogRef}
        className={`ky-record-modal ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onSubmit={onSubmit}
        style={{ width: size.width, height: size.height }}
      >
        <header className={`ky-record-head ${headerClassName}`}>
          <div><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div>
          <button type="button" className="ky-record-close" aria-label="Kapat" disabled={busy} onClick={close}><X size={19} /></button>
        </header>
        <div className={`ky-record-body ${bodyClassName}`}>{children}</div>
        {footer ? <footer className={`ky-record-foot ${footerClassName}`}>{footer}</footer> : null}
        <button
          className="ky-record-resize" type="button"
          aria-label="Sağ alt köşeden pencere boyutunu ayarla"
          title="Sağ alttan en-boy ayarla; ok tuşlarıyla da ayarlanabilir"
          onPointerDown={resizeStart} onPointerMove={resizeMove}
          onPointerUp={resizeEnd} onPointerCancel={resizeEnd}
          onKeyDown={resizeKeyboard}
        />
      </Element>
    </div>
  );
}
