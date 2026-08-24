import { apiUrl } from "./api";

const AUTH_TOKEN_KEY = "kyerp_auth_token";
const INSTALL_KEY = "__kyerpAuthenticatedAssetBridgeInstalled";
const API_MODULE_PREFIXES = [
  "/desen/",
  "/storage/",
  "/boyahane/",
  "/muhasebe/",
  "/isnet/",
  "/models/",
  "/model-takip/",
];

function readToken() {
  try {
    return String(window.sessionStorage.getItem(AUTH_TOKEN_KEY) || "").trim();
  } catch {
    return "";
  }
}

function apiOrigin() {
  try {
    return new URL(apiUrl("/health"), window.location.href).origin;
  } catch {
    return "";
  }
}

function resolveProtectedAssetUrl(value) {
  const raw = String(value || "").trim();
  if (!raw || /^(blob:|data:)/i.test(raw)) return null;

  const origin = apiOrigin();
  if (!origin) return null;

  try {
    if (raw.startsWith("/api/")) return new URL(`${origin}${raw}`);
    if (API_MODULE_PREFIXES.some((prefix) => raw.startsWith(prefix))) {
      return new URL(apiUrl(raw));
    }

    const parsed = new URL(raw, window.location.href);
    if (parsed.origin === origin && parsed.pathname.startsWith("/api/")) {
      return parsed;
    }
    if (
      parsed.origin === window.location.origin &&
      parsed.pathname.startsWith("/api/")
    ) {
      return new URL(`${origin}${parsed.pathname}${parsed.search}${parsed.hash}`);
    }
  } catch {
    return null;
  }

  return null;
}

async function fetchProtectedAsset(url, signal) {
  const token = readToken();
  if (!token) {
    const error = new Error("KY ERP oturumu henüz hazır değil.");
    error.code = "AUTH_NOT_READY";
    throw error;
  }

  const response = await fetch(url.href, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "image/*,application/pdf,application/octet-stream,*/*",
    },
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    const error = new Error(`Güvenli dosya isteği başarısız: ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return response.blob();
}

export function installAuthenticatedAssetBridge() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window[INSTALL_KEY]) return;
  window[INSTALL_KEY] = true;

  const cache = new Map();
  const pending = new WeakMap();
  const retryTimers = new WeakMap();

  const clearRetry = (image) => {
    const timer = retryTimers.get(image);
    if (timer) window.clearTimeout(timer);
    retryTimers.delete(image);
  };

  const releaseImage = (image) => {
    clearRetry(image);
    const cached = cache.get(image);
    if (cached?.objectUrl) URL.revokeObjectURL(cached.objectUrl);
    cache.delete(image);
    pending.get(image)?.abort?.();
    pending.delete(image);
  };

  const scheduleRetry = (image, source) => {
    if (!image?.isConnected || retryTimers.has(image)) return;
    const timer = window.setTimeout(() => {
      retryTimers.delete(image);
      void hydrateImage(image, source);
    }, 350);
    retryTimers.set(image, timer);
  };

  const hydrateImage = async (image, explicitSource = "") => {
    if (!(image instanceof HTMLImageElement) || !image.isConnected) return;

    const source =
      explicitSource ||
      image.dataset.kyerpSecureOriginal ||
      image.getAttribute("src") ||
      "";
    const protectedUrl = resolveProtectedAssetUrl(source);
    if (!protectedUrl) return;

    const href = protectedUrl.href;
    image.dataset.kyerpSecureOriginal = href;

    const cached = cache.get(image);
    if (cached?.source === href && cached.objectUrl) {
      if (image.src !== cached.objectUrl) image.src = cached.objectUrl;
      return;
    }

    if (!readToken()) {
      scheduleRetry(image, href);
      return;
    }

    const currentPending = pending.get(image);
    if (currentPending?.source === href) return;
    currentPending?.abort?.();

    const controller = new AbortController();
    pending.set(image, {
      source: href,
      abort: () => controller.abort(),
    });

    try {
      const blob = await fetchProtectedAsset(protectedUrl, controller.signal);
      if (!image.isConnected) return;

      const objectUrl = URL.createObjectURL(blob);
      const previous = cache.get(image);
      if (previous?.objectUrl) URL.revokeObjectURL(previous.objectUrl);
      cache.set(image, { source: href, objectUrl });
      image.src = objectUrl;
      image.removeAttribute("data-kyerp-secure-error");
    } catch (error) {
      if (error?.name === "AbortError") return;
      image.dataset.kyerpSecureError = String(error?.status || error?.code || "1");
      if (error?.status === 401 || error?.code === "AUTH_NOT_READY") {
        scheduleRetry(image, href);
      }
    } finally {
      const active = pending.get(image);
      if (active?.source === href) pending.delete(image);
    }
  };

  const scanNode = (node) => {
    if (!(node instanceof Element)) return;
    if (node instanceof HTMLImageElement) void hydrateImage(node);
    node.querySelectorAll?.("img[src]").forEach((image) => void hydrateImage(image));
  };

  const cleanupNode = (node) => {
    if (!(node instanceof Element)) return;
    if (node instanceof HTMLImageElement) releaseImage(node);
    node.querySelectorAll?.("img").forEach(releaseImage);
  };

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === "attributes") {
        if (mutation.target instanceof HTMLImageElement) {
          const current = mutation.target.getAttribute("src") || "";
          if (resolveProtectedAssetUrl(current)) void hydrateImage(mutation.target, current);
        }
        return;
      }

      mutation.addedNodes.forEach(scanNode);
      mutation.removedNodes.forEach(cleanupNode);
    });
  });

  const handleImageError = (event) => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement)) return;
    const source =
      image.dataset.kyerpSecureOriginal || image.getAttribute("src") || "";
    if (!resolveProtectedAssetUrl(source)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    void hydrateImage(image, source);
  };

  const handleAnchorClick = async (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    const anchor = event.target?.closest?.("a[href]");
    if (!anchor) return;

    const protectedUrl = resolveProtectedAssetUrl(anchor.getAttribute("href"));
    if (!protectedUrl) return;

    event.preventDefault();
    event.stopPropagation();

    const popup = !anchor.hasAttribute("download")
      ? window.open("about:blank", "_blank", "noopener,noreferrer")
      : null;

    try {
      const blob = await fetchProtectedAsset(protectedUrl);
      const objectUrl = URL.createObjectURL(blob);

      if (anchor.hasAttribute("download")) {
        const download = document.createElement("a");
        download.href = objectUrl;
        download.download = anchor.getAttribute("download") || "kyerp-dosya";
        document.body.appendChild(download);
        download.click();
        download.remove();
      } else if (popup) {
        popup.location.replace(objectUrl);
      } else {
        window.open(objectUrl, "_blank", "noopener,noreferrer");
      }

      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch {
      popup?.close?.();
    }
  };

  document.addEventListener("error", handleImageError, true);
  document.addEventListener("click", handleAnchorClick, true);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src"],
  });
  scanNode(document.documentElement);
}
