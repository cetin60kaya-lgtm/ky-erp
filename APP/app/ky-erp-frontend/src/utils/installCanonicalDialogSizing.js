import { getDialogLayout, saveDialogLayout } from "../services/dialogLayoutApi";

const MIN_WIDTH = 420;
const MIN_HEIGHT = 280;
const GAP = 20;
const PANEL_SELECTOR = [
  "[data-ky-dialog-key]",
  "dialog",
  "[role='dialog']",
  ".ccw-transaction",
  ".ccw-modal",
  ".gop-dialog",
  ".eb-document-modal",
  ".pc2-drawer",
  ".ikpf-new",
  ".ikpf-main",
  ".compliance-form-card",
  ".capa-form",
  "[class*='modal']",
  "[class*='dialog']",
  "[class*='drawer']",
].join(",");

const BACKDROP_CLASS = /(backdrop|overlay|layer|scrim|modal-bg)/i;
const PART_CLASS = /(body|head|header|footer|tabs?|actions?|wrap)$/i;
const PANEL_CLASS = /(modal|dialog|drawer|panel|popup|transaction|content)/i;
const cache = new Map();
let installed = false;
let observer = null;

function text(value) {
  return String(value || "").trim();
}

function slug(value) {
  return text(value)
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

function moduleKeyOf(element) {
  return element.closest?.(".shell-v3[data-active-module]")?.getAttribute("data-active-module") || "global";
}

function directPanelFromBackdrop(element) {
  const className = text(element.className);
  const looksBackdrop = BACKDROP_CLASS.test(className) || (element.getAttribute("role") === "dialog" && element.children.length === 1);
  if (!looksBackdrop) return element;
  const children = [...element.children];
  return children.find((child) => {
    const childClass = text(child.className);
    return child.matches?.("dialog,[data-ky-dialog-key]") || (PANEL_CLASS.test(childClass) && !BACKDROP_CLASS.test(childClass) && !PART_CLASS.test(childClass));
  }) || element;
}

function isUsablePanel(element) {
  if (!(element instanceof HTMLElement)) return false;
  if (element.classList.contains("ky-modal-resize-handle")) return false;
  const className = text(element.className);
  if (BACKDROP_CLASS.test(className) && !element.hasAttribute("data-ky-dialog-key")) return false;
  if (PART_CLASS.test(className) && !element.hasAttribute("data-ky-dialog-key") && element.getAttribute("role") !== "dialog") return false;
  const rect = element.getBoundingClientRect();
  if (rect.width && rect.width < 220) return false;
  if (rect.height && rect.height < 120) return false;
  return true;
}

function explicitDialogKey(element) {
  const raw = text(
    element.dataset.kyDialogKey
    || element.dataset.modalSizeKey
    || element.dataset.dialogSizeKey
    || element.getAttribute("data-modal-key"),
  );
  if (!raw) return "";
  if (raw.includes(".")) return raw;
  return `${moduleKeyOf(element)}.${slug(raw) || "dialog"}`;
}

function keyOf(element) {
  const explicit = explicitDialogKey(element);
  if (explicit) return explicit;

  const className = text(element.className);
  const moduleKey = moduleKeyOf(element);
  if (/ccw-transaction/.test(className)) return "muhasebe.cari-hareket";
  if (/ccw-modal/.test(className)) return "muhasebe.firma-karti";
  if (/eb-document-modal/.test(className)) return "e-belge.belge-detay";
  if (/pc2-drawer/.test(className)) return `imalat.${element.classList.contains("wide") ? "genis-islem" : "islem"}`;
  if (/ikpf-new/.test(className)) return "ik.yeni-personel";
  if (/ikpf-main/.test(className) && element.closest(".ikpf-editing")) return "ik.personel-duzenle";

  const stableId = text(element.id || element.getAttribute("data-testid") || element.getAttribute("name"));
  if (stableId) return `${moduleKey}.${slug(stableId) || "dialog"}`;

  const parentLabel = element.parentElement?.getAttribute?.("aria-label");
  const label = text(element.getAttribute("aria-label") || parentLabel);
  const title = text(element.querySelector("h1,h2,h3,[class*='title']")?.textContent);
  const classToken = className.split(/\s+/).find((item) => PANEL_CLASS.test(item) && !BACKDROP_CLASS.test(item) && !PART_CLASS.test(item));
  const descriptor = [classToken, label || title].filter(Boolean).join(" ");
  return `${moduleKey}.${slug(descriptor || "dialog")}`;
}

function viewportBounds() {
  return {
    maxWidth: Math.max(280, window.innerWidth - GAP * 2),
    maxHeight: Math.max(220, window.innerHeight - GAP * 2),
  };
}

function clampSize(width, height) {
  const { maxWidth, maxHeight } = viewportBounds();
  const minWidth = Math.min(MIN_WIDTH, maxWidth);
  const minHeight = Math.min(MIN_HEIGHT, maxHeight);
  return {
    width: Math.round(Math.max(minWidth, Math.min(maxWidth, Number(width) || minWidth))),
    height: Math.round(Math.max(minHeight, Math.min(maxHeight, Number(height) || minHeight))),
  };
}

function applySize(element, size) {
  if (!size?.width || !size?.height || !element.isConnected) return;
  const next = clampSize(size.width, size.height);
  const bounds = viewportBounds();
  element.style.setProperty("width", `${next.width}px`, "important");
  element.style.setProperty("height", `${next.height}px`, "important");
  element.style.setProperty("max-width", `${bounds.maxWidth}px`, "important");
  element.style.setProperty("max-height", `${bounds.maxHeight}px`, "important");
}

async function loadSharedSize(key, element) {
  try {
    if (!cache.has(key)) cache.set(key, getDialogLayout(key).catch(() => null));
    const result = await cache.get(key);
    element.dataset.kyDialogCanPersist = result?.canPersist ? "true" : "false";
    if (result?.layout && element.dataset.kyDialogUserResized !== "true") applySize(element, result.layout);
  } catch {
    element.dataset.kyDialogCanPersist = "false";
  }
}

function addHandle(element, key) {
  if (element.querySelector(":scope > .ky-modal-resize-handle")) return;
  if (getComputedStyle(element).position === "static") element.style.position = "relative";
  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "ky-modal-resize-handle";
  handle.setAttribute("aria-label", "Pencere boyutunu değiştir");
  handle.title = "Pencereyi büyüt / küçült";
  handle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 16 16 8M11 8h5v5M8 11v5h5"/></svg>';
  handle.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); });
  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    handle.setPointerCapture?.(event.pointerId);
    element.dataset.kyDialogUserResized = "true";
    const rect = element.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const startWidth = rect.width;
    const startHeight = rect.height;

    const move = (moveEvent) => {
      const next = clampSize(
        startWidth + (moveEvent.clientX - startX),
        startHeight + (moveEvent.clientY - startY),
      );
      applySize(element, next);
    };
    const finish = async () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", finish);
      handle.removeEventListener("pointercancel", finish);
      const rectNow = element.getBoundingClientRect();
      const finalSize = clampSize(rectNow.width, rectNow.height);
      if (element.dataset.kyDialogCanPersist === "false") return;
      try {
        const saved = await saveDialogLayout(key, finalSize);
        if (saved?.layout) cache.set(key, Promise.resolve(saved));
      } catch {
        // Yetkisiz kullanıcı geçici boyutlandırabilir; ortak canonical ölçü değişmez.
      }
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
  });
  element.appendChild(handle);
}

function enhance(rawElement) {
  const element = directPanelFromBackdrop(rawElement);
  if (!isUsablePanel(element) || element.dataset.kyResizableDialog === "true") return;
  const owningDialog = element.parentElement?.closest?.("[data-ky-resizable-dialog='true']");
  const cameFromBackdrop = rawElement !== element;
  if (owningDialog && !cameFromBackdrop) return;
  const key = keyOf(element);
  if (!key || (key.endsWith(".dialog") && moduleKeyOf(element) === "global")) return;
  element.dataset.kyResizableDialog = "true";
  element.dataset.kyDialogKey = key;
  addHandle(element, key);
  void loadSharedSize(key, element);
}

function scan(root = document) {
  if (root instanceof HTMLElement && root.matches(PANEL_SELECTOR)) enhance(root);
  root.querySelectorAll?.(PANEL_SELECTOR).forEach(enhance);
}

function clampOpenDialogs() {
  document.querySelectorAll("[data-ky-resizable-dialog='true']").forEach((element) => {
    const rect = element.getBoundingClientRect();
    if (rect.width && rect.height) applySize(element, { width: rect.width, height: rect.height });
  });
}

export function installCanonicalDialogSizing() {
  if (installed || typeof document === "undefined") return;
  installed = true;
  scan(document);
  observer = new MutationObserver((records) => {
    records.forEach((record) => record.addedNodes.forEach((node) => {
      if (node instanceof HTMLElement) scan(node);
    }));
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("resize", clampOpenDialogs, { passive: true });
}

export function uninstallCanonicalDialogSizingForTests() {
  observer?.disconnect();
  observer = null;
  installed = false;
}
