import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DISPLAY_STORAGE_KEY,
  resolveDisplayState,
  sanitizeDisplayPreferences,
} from "../utils/displayPreferences";

function readPreferences() {
  if (typeof window === "undefined") return { mode: "auto", scale: "auto" };
  try {
    const raw = window.localStorage.getItem(DISPLAY_STORAGE_KEY);
    return sanitizeDisplayPreferences(raw ? JSON.parse(raw) : {});
  } catch {
    return { mode: "auto", scale: "auto" };
  }
}

function readViewportSnapshot() {
  if (typeof window === "undefined") {
    return {
      width: 1440,
      height: 900,
      screenWidth: 1440,
      screenHeight: 900,
      devicePixelRatio: 1,
      coarsePointer: false,
      maxTouchPoints: 0,
      mobileHint: false,
    };
  }

  const nav = window.navigator || {};
  const userAgent = String(nav.userAgent || "");
  const mobileHint =
    Boolean(nav.userAgentData?.mobile) ||
    /Android.*Mobile|iPhone|iPod|Windows Phone/i.test(userAgent);

  return {
    width: Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1),
    height: Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1),
    screenWidth: Number(window.screen?.width || window.innerWidth || 1),
    screenHeight: Number(window.screen?.height || window.innerHeight || 1),
    devicePixelRatio: Math.max(1, Number(window.devicePixelRatio || 1)),
    coarsePointer: Boolean(window.matchMedia?.("(pointer: coarse)")?.matches),
    maxTouchPoints: Number(nav.maxTouchPoints || 0),
    mobileHint,
  };
}

export function useDisplayPreferences() {
  const [preferences, setPreferencesState] = useState(readPreferences);
  const [viewport, setViewport] = useState(readViewportSnapshot);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setViewport(readViewportSnapshot());
      });
    };

    const pointer = window.matchMedia?.("(pointer: coarse)");
    window.addEventListener("resize", update, { passive: true });
    window.addEventListener("orientationchange", update, { passive: true });
    pointer?.addEventListener?.("change", update);

    update();
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      pointer?.removeEventListener?.("change", update);
    };
  }, []);

  const state = useMemo(
    () => resolveDisplayState(preferences, viewport),
    [preferences, viewport],
  );

  const setPreferences = useCallback((next) => {
    setPreferencesState((current) => {
      const candidate = typeof next === "function" ? next(current) : next;
      const safe = sanitizeDisplayPreferences(candidate);
      try {
        window.localStorage.setItem(DISPLAY_STORAGE_KEY, JSON.stringify(safe));
      } catch {
        // Gizli sekme / kisitli depolama durumunda ayar sadece oturumda kalir.
      }
      return safe;
    });
  }, []);

  const setMode = useCallback(
    (mode) => setPreferences((current) => ({ ...current, mode })),
    [setPreferences],
  );

  const setScale = useCallback(
    (scale) => setPreferences((current) => ({ ...current, scale })),
    [setPreferences],
  );

  const reset = useCallback(
    () => setPreferences({ mode: "auto", scale: "auto" }),
    [setPreferences],
  );

  const physicalWidth = Math.round(viewport.screenWidth * viewport.devicePixelRatio);
  const physicalHeight = Math.round(viewport.screenHeight * viewport.devicePixelRatio);

  return {
    ...state,
    viewport,
    physicalWidth,
    physicalHeight,
    setMode,
    setScale,
    reset,
  };
}
