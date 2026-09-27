let installed = false;

function isAndroidDevice() {
  return /Android/i.test(String(navigator.userAgent || ""));
}

function isTouchLayout() {
  return Boolean(
    navigator.maxTouchPoints > 0 ||
    window.matchMedia?.("(pointer: coarse)")?.matches
  );
}

function isStandalone() {
  return Boolean(
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    navigator.standalone === true
  );
}

function setViewportVars() {
  const viewport = window.visualViewport;
  const height = Math.round(viewport?.height || window.innerHeight || 0);
  const width = Math.round(viewport?.width || window.innerWidth || 0);
  const offsetTop = Math.round(viewport?.offsetTop || 0);
  const layoutHeight = Math.round(window.innerHeight || height);
  const keyboardHeight = Math.max(0, layoutHeight - height - offsetTop);

  const root = document.documentElement;
  root.style.setProperty("--ky-visual-height", `${height}px`);
  root.style.setProperty("--ky-visual-width", `${width}px`);
  root.style.setProperty("--ky-visual-offset-top", `${offsetTop}px`);
  root.style.setProperty("--ky-keyboard-height", `${keyboardHeight}px`);
  root.toggleAttribute("data-ky-keyboard-open", keyboardHeight > 120);
}

function syncDeviceFlags() {
  const root = document.documentElement;
  root.toggleAttribute("data-ky-touch", isTouchLayout());
  root.toggleAttribute("data-ky-android", isAndroidDevice());
  root.toggleAttribute("data-ky-standalone", isStandalone());
}

function keepFocusedControlVisible(event) {
  if (!isTouchLayout()) return;
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (!target.matches("input,select,textarea,[contenteditable='true']")) return;

  window.setTimeout(() => {
    try {
      target.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    } catch {
      target.scrollIntoView();
    }
  }, 160);
}

export function installAndroidRuntimeBridge() {
  if (installed || typeof window === "undefined" || typeof document === "undefined") return;
  installed = true;

  syncDeviceFlags();
  setViewportVars();

  const viewport = window.visualViewport;
  viewport?.addEventListener?.("resize", setViewportVars, { passive: true });
  viewport?.addEventListener?.("scroll", setViewportVars, { passive: true });
  window.addEventListener("resize", setViewportVars, { passive: true });
  window.addEventListener("orientationchange", () => {
    syncDeviceFlags();
    window.setTimeout(setViewportVars, 80);
  }, { passive: true });
  window.addEventListener("appinstalled", syncDeviceFlags);
  window.addEventListener("pageshow", () => {
    syncDeviceFlags();
    setViewportVars();
  }, { passive: true });
  document.addEventListener("focusin", keepFocusedControlVisible, true);
}
