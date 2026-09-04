export const DISPLAY_STORAGE_KEY = "kyerp.display.preferences.v1";

export const DISPLAY_MODES = Object.freeze(["auto", "pc", "tablet", "phone"]);
export const DISPLAY_SCALES = Object.freeze(["auto", 80, 90, 100, 110, 125]);

export function sanitizeDisplayPreferences(value = {}) {
  const mode = DISPLAY_MODES.includes(value?.mode) ? value.mode : "auto";
  const rawScale = value?.scale === "auto" ? "auto" : Number(value?.scale);
  const scale = DISPLAY_SCALES.includes(rawScale) ? rawScale : "auto";
  return { mode, scale };
}

export function detectRecommendedMode(snapshot = {}) {
  const width = Number(snapshot.width || 0);
  const height = Number(snapshot.height || 0);
  const coarsePointer = Boolean(snapshot.coarsePointer);
  const maxTouchPoints = Number(snapshot.maxTouchPoints || 0);
  const mobileHint = Boolean(snapshot.mobileHint);
  const shortSide = Math.min(width || Infinity, height || Infinity);
  const longSide = Math.max(width, height);

  if (mobileHint || width <= 640 || (coarsePointer && shortSide <= 520 && longSide <= 980)) {
    return "phone";
  }

  if (
    width <= 1024 ||
    (coarsePointer && maxTouchPoints > 0 && width <= 1400) ||
    (maxTouchPoints > 1 && shortSide <= 900 && longSide <= 1400)
  ) {
    return "tablet";
  }

  return "pc";
}

export function detectRecommendedScale(snapshot = {}, mode = "pc") {
  const width = Number(snapshot.width || 0);
  const dpr = Math.max(1, Number(snapshot.devicePixelRatio || 1));

  if (mode !== "pc") return 100;
  if (dpr <= 1.1 && width >= 3600) return 125;
  return 100;
}

export function resolveDisplayState(preferences = {}, snapshot = {}) {
  const safe = sanitizeDisplayPreferences(preferences);
  const recommendedMode = detectRecommendedMode(snapshot);
  const effectiveMode = safe.mode === "auto" ? recommendedMode : safe.mode;
  const recommendedScale = detectRecommendedScale(snapshot, effectiveMode);
  const effectiveScale = safe.scale === "auto" ? recommendedScale : Number(safe.scale);
  return {
    preferences: safe,
    recommendedMode,
    effectiveMode,
    recommendedScale,
    effectiveScale,
  };
}

export function displayModeLabel(mode) {
  if (mode === "pc") return "PC";
  if (mode === "tablet") return "Tablet";
  if (mode === "phone") return "Telefon";
  return "Otomatik";
}
