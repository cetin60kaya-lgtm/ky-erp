import { installIsnetSourceIntakeBridge } from "./installIsnetSourceIntakeBridge";
import { installIsnetSourceWorkbench } from "./installIsnetSourceWorkbench";

const STORAGE_PREFIX = "ky-erp:modal-size:v1:";
const MIN_WIDTH = 360;
const MIN_HEIGHT = 240;
const VIEWPORT_GAP = 20;

const PANEL_SELECTOR = [
  ".kyik-modal",
  ".ik-modal",
  ".modal-bg > .modal",
  ".hr-modal-overlay > .hr-modal",
  ".iw-modal-backdrop > .iw-modal-box",
  ".sales-modal-backdrop > .sales-modal",
  ".dw-drawer-backdrop > .dw-drawer",
  ".isnet-document-modal-backdrop > .isnet-document-modal",
  ".bim-modal-bg > .bim-modal-panel",
  ".co-modal-back > .co-modal",
  ".mgi-modal-overlay > .mgi-modal-card",
  ".mrw-modal-bg > .mrw-modal",
  ".plw-modal-backdrop > .plw-modal",
  ".ecw-sync-backdrop > .ecw-sync-modal",
  ".bh-modal > .bh-modal-card",
  ".dw-region-modal",
  ".ik-fast-modal-shell",
  ".mfm-modal-card",
  ".ky-isnet-source-modal",
  ".ky-isnet-pool-modal",
].join(",");

const TRANSIENT_CLASSES = new Set([
  "active",
  "day",
  "night",
  "open",
  "show",
  "visible",
  "ky-persistent-modal",
]);

function normalizeKeyPart(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/\d+/g, "#")
    .replace(/[^a-z0-9çğıöşü#_-]+/gi, "-")
    .replace(/-+/g, "-")
    .slice(0, 90);
}

function modalStorageKey(panel) {
  const explicit = panel.dataset.modalSizeKey;
  if (explicit) return `${STORAGE_PREFIX}${normalizeKeyPart(explicit)}`;
  if (panel.classList.contains("isnet-document-modal")) {
    return `${STORAGE_PREFIX}isnet-modal`;
  }

  const classes = [...panel.classList]
    .filter((name) => !TRANSIENT_CLASSES.has(name))
    .join(".");
  const owner = panel.closest("[aria-label]")?.getAttribute("aria-label") || "";
  const title = panel.querySelector("h1,h2,h3,.modal-title,.modal-head strong,[class*='modal-head'] strong")?.textContent || "";
  return `${STORAGE_PREFIX}${normalizeKeyPart(classes)}:${normalizeKeyPart(owner || title || "genel")}`;
}

function viewportBounds() {
  return {
    width: Math.max(MIN_WIDTH, window.innerWidth - VIEWPORT_GAP * 2),
    height: Math.max(MIN_HEIGHT, window.innerHeight - VIEWPORT_GAP * 2),
  };
}

function clampSize(width, height) {
  const bounds = viewportBounds();
  return {
    width: Math.min(bounds.width, Math.max(MIN_WIDTH, Number(width) || MIN_WIDTH)),
    height: Math.min(bounds.height, Math.max(MIN_HEIGHT, Number(height) || MIN_HEIGHT)),
  };
}

function readSize(key) {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "null");
    if (!parsed?.width || !parsed?.height) return null;
    return clampSize(parsed.width, parsed.height);
  } catch {
    return null;
  }
}

function writeSize(key, width, height) {
  try {
    window.localStorage.setItem(key, JSON.stringify(clampSize(width, height)));
  } catch {
    // Tarayıcı depolaması kapalıysa pencere yine elle boyutlandırılabilir.
  }
}

function makeResizable(panel) {
  if (!(panel instanceof HTMLElement) || panel.dataset.kyModalResizable === "true") return;
  if (window.matchMedia("(max-width: 700px), (pointer: coarse)").matches) return;

  panel.dataset.kyModalResizable = "true";
  panel.classList.add("ky-persistent-modal");
  panel.title ||= "Pencereyi sağ alt köşeden boyutlandırabilirsiniz";

  const key = modalStorageKey(panel);
  const saved = readSize(key);
  if (saved) {
    panel.style.width = `${saved.width}px`;
    panel.style.height = `${saved.height}px`;
  }

  let saveTimer = 0;
  const resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[entries.length - 1];
    if (!entry || !panel.isConnected) return;
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      const rect = panel.getBoundingClientRect();
      writeSize(key, Math.round(rect.width), Math.round(rect.height));
    }, 180);
  });
  resizeObserver.observe(panel);
  panel.__kyModalResizeCleanup = () => {
    window.clearTimeout(saveTimer);
    resizeObserver.disconnect();
  };
}

function collectPanels(root) {
  const panels = new Set();
  if (!(root instanceof Element || root instanceof Document)) return panels;
  if (root instanceof Element && root.matches(PANEL_SELECTOR)) panels.add(root);
  root.querySelectorAll?.(PANEL_SELECTOR).forEach((panel) => panels.add(panel));

  const dialogs = [];
  if (root instanceof Element && root.matches("[role='dialog'][aria-modal='true']")) dialogs.push(root);
  root.querySelectorAll?.("[role='dialog'][aria-modal='true']").forEach((dialog) => dialogs.push(dialog));
  dialogs.forEach((dialog) => {
    const childPanel = dialog.querySelector(PANEL_SELECTOR);
    if (childPanel) panels.delete(dialog);
    panels.add(childPanel || dialog);
  });
  return panels;
}

export function installPersistentModalSizing() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.__kyPersistentModalSizingInstalled) return;
  window.__kyPersistentModalSizingInstalled = true;

  installIsnetSourceIntakeBridge();
  installIsnetSourceWorkbench();

  const scan = (root) => collectPanels(root).forEach(makeResizable);
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
      const rect = panel.getBoundingClientRect();
      const next = clampSize(rect.width, rect.height);
      if (next.width !== Math.round(rect.width)) panel.style.width = `${next.width}px`;
      if (next.height !== Math.round(rect.height)) panel.style.height = `${next.height}px`;
    });
  });
}
