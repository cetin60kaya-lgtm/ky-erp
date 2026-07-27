export async function printHtmlDocument({ title = "KY ERP", html = "", css = "" }) {
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.setAttribute("aria-hidden", "true");
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    throw new Error("Yazdirma cercevesi olusturulamadi.");
  }

  doc.open();
  doc.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${css}</style></head><body>${html}</body></html>`);
  doc.close();

  await new Promise((resolve) => {
    frame.onload = () => resolve();
    window.setTimeout(resolve, 700);
  });

  if (doc.fonts?.ready) await doc.fonts.ready;
  await Promise.all(Array.from(doc.images || []).map((img) => (
    img.complete
      ? Promise.resolve()
      : new Promise((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
      })
  )));

  const win = frame.contentWindow;
  if (!win) {
    frame.remove();
    throw new Error("Yazdirma penceresi acilamadi.");
  }

  const cleanup = () => window.setTimeout(() => frame.remove(), 300);
  win.addEventListener("afterprint", cleanup, { once: true });
  win.focus();
  win.print();
  window.setTimeout(cleanup, 4000);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
