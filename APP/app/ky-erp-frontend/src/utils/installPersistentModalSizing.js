import { installIsnetSourceIntakeBridge } from "./installIsnetSourceIntakeBridge";
import { installIsnetSourceWorkbench } from "./installIsnetSourceWorkbench";

const SIZE_STORAGE_PREFIX = "ky-erp:modal-size:v1:";
const GEOMETRY_STORAGE_PREFIX = "ky-erp:modal-geometry:v2:";
const MIN_WIDTH = 360;
const MIN_HEIGHT = 240;
const VIEWPORT_GAP = 12;
const RESIZE_EDGE = 14;

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
  ".ccw-root > .ccw-profile-card", "dialog", "[aria-modal='true']",
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
  return { size: `${SIZE_STORAGE_PREFIX}${suffix}`, geometry: `${GEOMETRY_STORAGE_PREFIX}${suffix}` };
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

function readLegacySize(key) {
  const parsed = readJson(key);
  if (!parsed?.width || !parsed?.height) return null;
  return clampSize(parsed.width, parsed.height);
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

function resizeModeFromPoint(panel, event) {
  const rect = panel.getBoundingClientRect();
  const nearLeft = event.clientX - rect.left <= RESIZE_EDGE;
  const nearRight = rect.right - event.clientX <= RESIZE_EDGE;
  const nearTop = event.clientY - rect.top <= RESIZE_EDGE;
  const nearBottom = rect.bottom - event.clientY <= RESIZE_EDGE;
  if (nearBottom && nearRight) return "se";
  if (nearBottom && nearLeft) return "sw";
  if (nearTop && nearRight) return "ne";
  if (nearTop && nearLeft) return "nw";
  if (nearRight) return "e";
  if (nearLeft) return "w";
  if (nearBottom) return "s";
  if (nearTop) return "n";
  return "";
}

function resizeCursor(mode) {
  if (mode === "e" || mode === "w") return "ew-resize";
  if (mode === "n" || mode === "s") return "ns-resize";
  if (mode === "ne" || mode === "sw") return "nesw-resize";
  if (mode === "nw" || mode === "se") return "nwse-resize";
  return "";
}

function attachResize(panel, key) {
  let pointerId = null;
  let mode = "";
  let startX = 0;
  let startY = 0;
  let start = null;

  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    mode = resizeModeFromPoint(panel, event);
    if (!mode) return;
    const rect = panel.getBoundingClientRect();
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    start = geometryFromRect(rect);
    panel.classList.add("ky-modal-resizing");
    panel.style.cursor = resizeCursor(mode);
    try { panel.setPointerCapture(pointerId); } catch { /* desteklemeyen tarayıcı */ }
    event.preventDefault();
    event.stopPropagation();
  };

  const onPointerMove = (event) => {
    if (pointerId === null || event.pointerId !== pointerId || !start) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    let { left, top, width, height } = start;
    if (mode.includes("e")) width += dx;
    if (mode.includes("s")) height += dy;
    if (mode.includes("w")) { width -= dx; left += dx; }
    if (mode.includes("n")) { height -= dy; top += dy; }
    if (width < MIN_WIDTH) { if (mode.includes("w")) left -= MIN_WIDTH - width; width = MIN_WIDTH; }
    if (height < MIN_HEIGHT) { if (mode.includes("n")) top -= MIN_HEIGHT - height; height = MIN_HEIGHT; }
    applyGeometry(panel, { left, top, width, height });
    event.preventDefault();
  };

  const stopResize = (event) => {
    if (pointerId === null || (event && event.pointerId !== pointerId)) return;
    const activeId = pointerId;
    pointerId = null;
    start = null;
    mode = "";
    panel.classList.remove("ky-modal-resizing");
    panel.style.removeProperty("cursor");
    try { panel.releasePointerCapture(activeId); } catch { /* capture yoksa sorun değil */ }
    writeGeometry(key, geometryFromRect(panel.getBoundingClientRect()));
  };

  const onHoverMove = (event) => {
    if (pointerId !== null) return;
    panel.style.cursor = resizeCursor(resizeModeFromPoint(panel, event));
  };
  const onLeave = () => { if (pointerId === null) panel.style.removeProperty("cursor"); };

  panel.addEventListener("pointerdown", onPointerDown, true);
  panel.addEventListener("pointermove", onPointerMove, true);
  panel.addEventListener("pointerup", stopResize, true);
  panel.addEventListener("pointercancel", stopResize, true);
  panel.addEventListener("pointermove", onHoverMove);
  panel.addEventListener("pointerleave", onLeave);

  return () => {
    panel.removeEventListener("pointerdown", onPointerDown, true);
    panel.removeEventListener("pointermove", onPointerMove, true);
    panel.removeEventListener("pointerup", stopResize, true);
    panel.removeEventListener("pointercancel", stopResize, true);
    panel.removeEventListener("pointermove", onHoverMove);
    panel.removeEventListener("pointerleave", onLeave);
    panel.classList.remove("ky-modal-resizing");
    panel.style.removeProperty("cursor");
  };
}
function makePersistent(panel) {
  if (!(panel instanceof HTMLElement) || panel.dataset.kyModalResizable === "true") return;

  panel.dataset.kyModalResizable = "true";
  panel.classList.add("ky-persistent-modal");
  panel.title ||= "Başlıktan taşıyın; kenarlardan veya köşelerden boyutlandırın. Konum ve boyut kaydedilir.";

  const keys = storageKeys(panel);
  const savedGeometry = readGeometry(keys.geometry);
  const legacySize = readLegacySize(keys.size);
  if (savedGeometry) applyGeometry(panel, savedGeometry);
  else if (legacySize) {
    panel.style.setProperty("--ky-modal-width", `${legacySize.width}px`);
    panel.style.setProperty("--ky-modal-height", `${legacySize.height}px`);
  }

  let resizeTimer = 0;
  let dragCleanup = () => {};
  let resizeCleanup = () => {};

  const freezeAndWire = () => {
    if (!panel.isConnected) return;
    const current = savedGeometry || geometryFromRect(panel.getBoundingClientRect());
    applyGeometry(panel, current);
    if (!savedGeometry) writeGeometry(keys.geometry, current);
    dragCleanup = attachDrag(panel, keys.geometry);
    resizeCleanup = attachResize(panel, keys.geometry);
  };
  window.requestAnimationFrame(freezeAndWire);

  const resizeObserver = new ResizeObserver(() => {
    if (!panel.isConnected || panel.classList.contains("ky-modal-dragging") || panel.classList.contains("ky-modal-resizing")) return;
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      const rect = panel.getBoundingClientRect();
      const next = applyGeometry(panel, geometryFromRect(rect));
      writeGeometry(keys.geometry, next);
      try { window.localStorage.setItem(keys.size, JSON.stringify({ width: next.width, height: next.height })); } catch { /* noop */ }
    }, 180);
  });
  resizeObserver.observe(panel);

  panel.__kyModalResizeCleanup = () => {
    window.clearTimeout(resizeTimer);
    resizeObserver.disconnect();
    dragCleanup();
    resizeCleanup();
  };
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
    const layerLike = [...dialog.classList].some((name) => /(backdrop|overlay|layer|modal-bg)/i.test(name));
    const childPanel = dialog.querySelector(PANEL_SELECTOR) || (layerLike ? dialog.firstElementChild : null);
    if (childPanel) panels.delete(dialog);
    panels.add(childPanel || dialog);
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
      const next = applyGeometry(panel, geometryFromRect(panel.getBoundingClientRect()));
      writeGeometry(keys.geometry, next);
    });
  });
}
