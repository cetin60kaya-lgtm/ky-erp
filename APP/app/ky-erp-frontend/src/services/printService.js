export async function printHtmlDocument(optionsOrHtml, legacyTitle = "KY ERP", legacyCss = "") {
  const options = normalizePrintOptions(optionsOrHtml, legacyTitle, legacyCss);
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "1px";
  frame.style.height = "1px";
  frame.style.opacity = "0";
  frame.style.pointerEvents = "none";
  frame.style.border = "0";
  frame.setAttribute("aria-hidden", "true");
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    throw new Error("Yazdırma çerçevesi oluşturulamadı.");
  }

  doc.open();
  doc.write(buildPrintableDocument(options));
  doc.close();

  await waitForPrintableDocument(frame, doc);

  const win = frame.contentWindow;
  if (!win) {
    frame.remove();
    throw new Error("Yazdırma penceresi açılamadı.");
  }

  const cleanup = () => window.setTimeout(() => {
    if (frame.isConnected) frame.remove();
  }, 500);

  win.addEventListener("afterprint", cleanup, { once: true });
  win.focus();

  try {
    win.print();
  } catch (error) {
    cleanup();
    throw new Error(error?.message || "Yazdırma işlemi başlatılamadı.");
  }

  window.setTimeout(cleanup, 15000);
  return { ok: true, title: options.title };
}

export function normalizePrintOptions(optionsOrHtml, legacyTitle = "KY ERP", legacyCss = "") {
  if (optionsOrHtml && typeof optionsOrHtml === "object" && !Array.isArray(optionsOrHtml)) {
    return {
      title: String(optionsOrHtml.title || "KY ERP"),
      html: String(optionsOrHtml.html || ""),
      css: String(optionsOrHtml.css || ""),
    };
  }
  return {
    title: String(legacyTitle || "KY ERP"),
    html: String(optionsOrHtml || ""),
    css: String(legacyCss || ""),
  };
}

export function buildPrintableDocument({ title = "KY ERP", html = "", css = "" } = {}) {
  const source = String(html || "").trim();
  const fullDocument = /^<!doctype\s+html|^<html[\s>]/i.test(source);

  if (fullDocument) {
    let output = source;
    if (!/<title[\s>]/i.test(output)) {
      output = output.replace(/<head([^>]*)>/i, `<head$1><title>${escapeHtml(title)}</title>`);
    }
    if (css) {
      output = output.replace(/<\/head>/i, `<style>${css}</style></head>`);
    }
    return output;
  }

  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${css}</style></head><body>${source}</body></html>`;
}

async function waitForPrintableDocument(frame, doc) {
  await new Promise((resolve) => {
    if (doc.readyState === "complete") {
      resolve();
      return;
    }
    const timer = window.setTimeout(resolve, 900);
    frame.addEventListener("load", () => {
      window.clearTimeout(timer);
      resolve();
    }, { once: true });
  });

  if (doc.fonts?.ready) {
    try { await doc.fonts.ready; } catch { /* Font bekleme hatası yazdırmayı bloklamaz. */ }
  }

  await Promise.all(Array.from(doc.images || []).map((img) => (
    img.complete
      ? Promise.resolve()
      : new Promise((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
        window.setTimeout(resolve, 1500);
      })
  )));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
