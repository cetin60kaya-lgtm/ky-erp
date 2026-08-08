export async function printHtmlDocument(options = {}, legacyTitle = "KY ERP") {
  let title = "KY ERP";
  let html = "";
  let css = "";

  if (typeof options === "string") {
    const source = options;
    title = legacyTitle || "KY ERP";
    const styles = Array.from(source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)).map((match) => match[1]);
    css = styles.join("\n");
    const bodyMatch = source.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    html = bodyMatch ? bodyMatch[1] : source;
  } else {
    title = options?.title || "KY ERP";
    html = options?.html || "";
    css = options?.css || "";
  }

  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.left = "-10000px";
  frame.style.top = "0";
  frame.style.width = "210mm";
  frame.style.height = "297mm";
  frame.style.border = "0";
  frame.style.opacity = "0.001";
  frame.setAttribute("aria-hidden", "true");
  document.body.appendChild(frame);

  const markup = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>html,body{background:#fff!important}${css}</style></head><body>${html}</body></html>`;
  const loaded = new Promise((resolve) => {
    frame.onload = () => resolve();
    window.setTimeout(resolve, 1000);
  });
  frame.srcdoc = markup;
  await loaded;

  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    frame.remove();
    throw new Error("Yazdirma penceresi olusturulamadi.");
  }

  if (doc.fonts?.ready) await doc.fonts.ready;
  await Promise.all(Array.from(doc.images || []).map((img) => (
    img.complete
      ? Promise.resolve()
      : new Promise((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
      })
  )));
  await new Promise((resolve) => win.requestAnimationFrame(() => win.requestAnimationFrame(resolve)));

  const cleanup = () => window.setTimeout(() => frame.remove(), 500);
  win.addEventListener("afterprint", cleanup, { once: true });
  win.focus();
  win.print();
  window.setTimeout(cleanup, 10000);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
