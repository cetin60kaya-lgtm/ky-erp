import { installIsnetSourceIntakeBridge } from "./installIsnetSourceIntakeBridge";
import { installIsnetSourceWorkbench } from "./installIsnetSourceWorkbench";

const GEOMETRY_STORAGE_PREFIX = "ky-erp:modal-geometry:v4:";
const MIN_WIDTH = 360;
const MIN_HEIGHT = 240;
const VIEWPORT_GAP = 12;

const PANEL_SELECTOR = [
  ".kyik-modal", ".ik-modal", ".modal-bg > .modal", ".hr-modal-overlay > .hr-modal",
  ".iw-modal-backdrop > .iw-modal-box", ".sales-modal-backdrop > .sales-modal",
  ".dw-drawer-backdrop > .dw-drawer", ".isnet-document-modal-backdrop > .isnet-document-modal",
  ".bim-modal-bg > .bim-modal-panel", ".co-modal-back > .co-modal",
  ".mgi-modal-overlay > .mgi-modal-card", ".mrw-modal-bg > .mrw-modal",
  ".plw-modal-backdrop > .plw-modal", ".ecw-sync-backdrop > .ecw-sync-modal",
  ".bh-modal > .bh-modal-card", ".dw-region-modal", ".ik-fast-modal-shell",
  ".mfm-modal-card", ".ky-isnet-source-modal", ".ky-isnet-pool-modal",
  ".ccw-settings-panel", ".ccw-finance-modal", ".accounting-center-modal",
  "dialog", "[aria-modal='true']",
  "[class~='modal']", "[class$='-modal']", "[class*='modal-card']", "[class*='modal-box']",
  "[class*='modal-panel']", "[class$='-drawer']", "[class*='drawer-panel']", "[class*='drawer-card']",
].join(",");

const DRAG_HANDLE_SELECTOR = [
  "[data-modal-drag-handle]", ".ccw-settings-head", ".ccw-finance-modal-head",
  ".accounting-center-modal-head", ".siw-drawer-header", ".idc-drawer > header",
  "[class*='modal-header']", "[class*='modal-head']", "[class*='drawer-header']",
  "[class*='drawer-head']", ":scope > header",
].join(",");

const TRANSIENT_CLASSES = new Set([
  "active", "day", "night", "open", "show", "visible",
  "ky-persistent-modal", "ky-modal-positioned", "ky-modal-dragging", "ky-modal-resizing",
]);
const INTERACTIVE_SELECTOR = "button,input,select,textarea,a,label,[contenteditable='true'],[role='button']";

function normalizeKeyPart(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/\d+/g, "#")
    .replace(/[^a-z0-9çğıöşü#_-]+/gi, "-")
    .replace(/-+/g, "-")
    .slice(0, 100);
}

function modalKeySuffix(panel) {
  const explicit = panel.dataset.modalPositionKey || panel.dataset.modalSizeKey;
  if (explicit) return normalizeKeyPart(explicit);
  if (panel.classList.contains("isnet-document-modal")) return "isnet-modal";
  const classes = [...panel.classList].filter((name) => !TRANSIENT_CLASSES.has(name)).join(".");
  if (classes) return normalizeKeyPart(classes);
  const owner = panel.closest("[aria-label]")?.getAttribute("aria-label") || "";
  const title = panel.querySelector("h1,h2,h3,.modal-title,[class*='modal-head'] strong")?.textContent || "";
  return normalizeKeyPart(owner || title || panel.getAttribute("role") || "genel");
}

function storageKeys(panel) {
  const suffix = modalKeySuffix(panel);
  return { geometry: `${GEOMETRY_STORAGE_PREFIX}${suffix}` };
}

function viewportBounds() {
  return {
    width: Math.max(220, window.innerWidth - VIEWPORT_GAP * 2),
    height: Math.max(180, window.innerHeight - VIEWPORT_GAP * 2),
  };
}

function clampSize(width, height) {
  const bounds = viewportBounds();
  const minWidth = Math.min(MIN_WIDTH, bounds.width);
  const minHeight = Math.min(MIN_HEIGHT, bounds.height);
  return {
    width: Math.min(bounds.width, Math.max(minWidth, Number(width) || minWidth)),
    height: Math.min(bounds.height, Math.max(minHeight, Number(height) || minHeight)),
  };
}

function clampGeometry(value) {
  const size = clampSize(value?.width, value?.height);
  const maxLeft = Math.max(VIEWPORT_GAP, window.innerWidth - size.width - VIEWPORT_GAP);
  const maxTop = Math.max(VIEWPORT_GAP, window.innerHeight - size.height - VIEWPORT_GAP);
  return {
    width: size.width,
    height: size.height,
    left: Math.min(maxLeft, Math.max(VIEWPORT_GAP, Number(value?.left) || VIEWPORT_GAP)),
    top: Math.min(maxTop, Math.max(VIEWPORT_GAP, Number(value?.top) || VIEWPORT_GAP)),
  };
}

function readJson(key) {
  try { return JSON.parse(window.localStorage.getItem(key) || "null"); } catch { return null; }
}

function readGeometry(key) {
  const parsed = readJson(key);
  if (!parsed?.width || !parsed?.height) return null;
  return clampGeometry(parsed);
}

function writeGeometry(key, geometry) {
  try { window.localStorage.setItem(key, JSON.stringify(clampGeometry(geometry))); } catch { /* storage kapalıysa devam */ }
}

function applyGeometry(panel, geometry) {
  const next = clampGeometry(geometry);
  panel.classList.add("ky-modal-positioned");
  panel.style.setProperty("--ky-modal-left", `${Math.round(next.left)}px`);
  panel.style.setProperty("--ky-modal-top", `${Math.round(next.top)}px`);
  panel.style.setProperty("--ky-modal-width", `${Math.round(next.width)}px`);
  panel.style.setProperty("--ky-modal-height", `${Math.round(next.height)}px`);
  return next;
}

function geometryFromRect(rect) {
  return clampGeometry({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
}

function findDragHandle(panel) {
  try {
    const explicit = panel.querySelector(DRAG_HANDLE_SELECTOR);
    if (explicit) return explicit;
    const title = panel.querySelector("h1,h2,h3");
    if (title instanceof HTMLElement) return title;
    return panel;
  } catch {
    return panel;
  }
}

function attachDrag(panel, key) {
  const handle = findDragHandle(panel);
  if (!(handle instanceof HTMLElement) || handle.dataset.kyModalDragHandle === "true") return () => {};
  handle.dataset.kyModalDragHandle = "true";
  handle.classList.add("ky-modal-drag-handle");

  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  const onPointerMove = (event) => {
    if (pointerId === null || event.pointerId !== pointerId) return;
    const rect = panel.getBoundingClientRect();
    applyGeometry(panel, {
      left: startLeft + event.clientX - startX,
      top: startTop + event.clientY - startY,
      width: rect.width,
      height: rect.height,
    });
  };

  const stopDrag = (event) => {
    if (pointerId === null) return;
    if (event && event.pointerId !== pointerId) return;
    const activeId = pointerId;
    pointerId = null;
    panel.classList.remove("ky-modal-dragging");
    try { handle.releasePointerCapture(activeId); } catch { /* capture yoksa sorun değil */ }
    writeGeometry(key, geometryFromRect(panel.getBoundingClientRect()));
  };

  const onPointerDown = (event) => {
    if (event.button !== 0 || event.target.closest?.(INTERACTIVE_SELECTOR)) return;
    const rect = panel.getBoundingClientRect();
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    startLeft = rect.left;
    startTop = rect.top;
    panel.classList.add("ky-modal-dragging");
    try { handle.setPointerCapture(pointerId); } catch { /* desteklemeyen tarayıcı */ }
    event.preventDefault();
  };

  handle.addEventListener("pointerdown", onPointerDown);
  handle.addEventListener("pointermove", onPointerMove);
  handle.addEventListener("pointerup", stopDrag);
  handle.addEventListener("pointercancel", stopDrag);

  return () => {
    handle.removeEventListener("pointerdown", onPointerDown);
    handle.removeEventListener("pointermove", onPointerMove);
    handle.removeEventListener("pointerup", stopDrag);
    handle.removeEventListener("pointercancel", stopDrag);
    handle.classList.remove("ky-modal-drag-handle");
    delete handle.dataset.kyModalDragHandle;
  };
}

function attachResize(panel, key) {
  const handle = document.createElement("div");
  handle.className = "ky-modal-resize-handle";
  handle.dataset.kyModalResizeHandle = "true";
  handle.setAttribute("aria-label", "Pencere boyutunu sağ alt köşeden değiştir");
  handle.title = "Sağ alt köşeden sürükleyerek en / boy değiştir";

  const computedPosition = window.getComputedStyle(panel).position;
  const originalInlinePosition = panel.style.position;
  if (computedPosition === "static") panel.style.position = "relative";
  panel.appendChild(handle);

  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let start = null;

  const unbindTracking = () => {
    window.removeEventListener("pointermove", onPointerMove, true);
    window.removeEventListener("pointerup", stopResize, true);
    window.removeEventListener("pointercancel", stopResize, true);
  };

  const stopResize = (event) => {
    if (pointerId === null || (event && event.pointerId !== pointerId)) return;
    const activeId = pointerId;
    pointerId = null;
    start = null;
    unbindTracking();
    panel.classList.remove("ky-modal-resizing");
    try { handle.releasePointerCapture(activeId); } catch { /* capture yoksa sorun değil */ }
    writeGeometry(key, geometryFromRect(panel.getBoundingClientRect()));
  };

  const onPointerMove = (event) => {
    if (pointerId === null || event.pointerId !== pointerId || !start) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    const width = Math.max(MIN_WIDTH, start.width + dx);
    const height = Math.max(MIN_HEIGHT, start.height + dy);
    applyGeometry(panel, { left: start.left, top: start.top, width, height });
    event.preventDefault();
  };

  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    const rect = panel.getBoundingClientRect();
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    start = geometryFromRect(rect);
    panel.classList.add("ky-modal-resizing");
    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("pointerup", stopResize, true);
    window.addEventListener("pointercancel", stopResize, true);
    try { handle.setPointerCapture(pointerId); } catch { /* document takibi yedek */ }
    event.preventDefault();
    event.stopPropagation();
  };

  handle.addEventListener("pointerdown", onPointerDown);

  return () => {
    handle.removeEventListener("pointerdown", onPointerDown);
    unbindTracking();
    handle.remove();
    panel.classList.remove("ky-modal-resizing");
    if (computedPosition === "static" && !panel.classList.contains("ky-modal-positioned")) {
      panel.style.position = originalInlinePosition;
    }
  };
}
function makePersistent(panel) {
  if (!(panel instanceof HTMLElement) || panel.dataset.kyModalResizable === "true") return;

  panel.dataset.kyModalResizable = "true";
  panel.classList.add("ky-persistent-modal");
  panel.title ||= "Başlıktan taşıyın; yalnız sol alt köşeden boyutlandırın. Son konum ve ölçü kaydedilir.";

  const keys = storageKeys(panel);
  const savedGeometry = readGeometry(keys.geometry);
  if (savedGeometry) applyGeometry(panel, savedGeometry);

  let dragCleanup = () => {};
  let resizeCleanup = () => {};

  const freezeAndWire = () => {
    if (!panel.isConnected) return;
    if (savedGeometry) applyGeometry(panel, savedGeometry);
    dragCleanup = attachDrag(panel, keys.geometry);
    resizeCleanup = attachResize(panel, keys.geometry);
  };
  window.requestAnimationFrame(freezeAndWire);

  panel.__kyModalResizeCleanup = () => {
    dragCleanup();
    resizeCleanup();
  };
}

function looksLikeBackdrop(dialog) {
  if (!(dialog instanceof HTMLElement) || !dialog.firstElementChild) return false;
  const classHint = [...dialog.classList].some((name) => /(backdrop|overlay|layer|scrim|modal-bg|dialog-bg)/i.test(name));
  if (classHint) return true;
  const rect = dialog.getBoundingClientRect();
  const childRect = dialog.firstElementChild.getBoundingClientRect();
  const viewportLike = rect.width >= window.innerWidth * 0.94 && rect.height >= window.innerHeight * 0.94;
  const childIsSmaller = childRect.width <= rect.width * 0.94 || childRect.height <= rect.height * 0.94;
  const style = window.getComputedStyle(dialog);
  const positionedLayer = ["fixed", "absolute"].includes(style.position) && ["flex", "grid"].includes(style.display);
  return childIsSmaller && (viewportLike || positionedLayer);
}

function resolveDialogPanel(dialog) {
  const explicit = dialog.querySelector(PANEL_SELECTOR);
  if (explicit && explicit !== dialog) return explicit;
  if (looksLikeBackdrop(dialog)) return dialog.firstElementChild;
  return dialog;
}
function collectPanels(root) {
  const panels = new Set();
  if (!(root instanceof Element || root instanceof Document)) return panels;
  if (root instanceof Element && root.matches(PANEL_SELECTOR)) panels.add(root);
  root.querySelectorAll?.(PANEL_SELECTOR).forEach((panel) => panels.add(panel));

  const dialogs = [];
  if (root instanceof Element && root.matches("[role='dialog']")) dialogs.push(root);
  root.querySelectorAll?.("[role='dialog']").forEach((dialog) => dialogs.push(dialog));
  dialogs.forEach((dialog) => {
    const target = resolveDialogPanel(dialog);
    if (target !== dialog) panels.delete(dialog);
    if (target) panels.add(target);
  });
  [...panels].forEach((candidate) => {
    const nested = [...panels].some((other) => other !== candidate && candidate.contains(other));
    if (nested) panels.delete(candidate);
  });
  return panels;
}

export function installPersistentModalSizing() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.__kyPersistentModalSizingInstalled) return;
  window.__kyPersistentModalSizingInstalled = true;

  installIsnetSourceIntakeBridge();
  installIsnetSourceWorkbench();

  const scan = (root) => collectPanels(root).forEach(makePersistent);
  scan(document);

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof Element) scan(node);
      });
      mutation.removedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (node.matches(".ky-persistent-modal")) node.__kyModalResizeCleanup?.();
        node.querySelectorAll?.(".ky-persistent-modal").forEach((panel) => panel.__kyModalResizeCleanup?.());
      });
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener("resize", () => {
    document.querySelectorAll(".ky-persistent-modal").forEach((panel) => {
      const keys = storageKeys(panel);
      const saved = readGeometry(keys.geometry);
      if (saved) applyGeometry(panel, saved);
    });
  });
}
