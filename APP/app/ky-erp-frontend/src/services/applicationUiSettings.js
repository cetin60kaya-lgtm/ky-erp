import { getSettings, saveSetting } from "./adminApi";

const PLATFORM_UI_SLUG = "__platform_ui__";
const LEFT_CLICK_SETTING_ID = "left-click-menu-v1";
const LEFT_CLICK_SETTING_KEY = "LEFT_CLICK_MENU_V1";
const LEFT_CLICK_CACHE_KEY = "kyerp.ui.leftClickMenu.v1";
export const LEFT_CLICK_SETTINGS_EVENT = "kyerp:left-click-menu-settings";

export const DEFAULT_LEFT_CLICK_MENU_SETTINGS = Object.freeze({
  version: 1,
  enabled: true,
  blankAreaOnly: true,
  includeActiveModuleTabs: true,
  activeModuleTabLimit: 4,
  maxItems: 12,
  showIcons: true,
  compact: true,
  items: [
    "shell:module-home",
    "shell:quick",
    "shell:search",
    "shell:back",
    "shell:copy-link",
    "shell:print",
    "shell:refresh",
    "route:asistan:sohbet",
  ],
});

function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function uniqueIds(value) {
  if (!Array.isArray(value)) return [...DEFAULT_LEFT_CLICK_MENU_SETTINGS.items];
  const seen = new Set();
  return value
    .map((item) => String(item || "").trim())
    .filter((item) => item && item.length <= 180 && !seen.has(item) && seen.add(item))
    .slice(0, 40);
}

export function normalizeLeftClickMenuSettings(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    version: 1,
    enabled: source.enabled !== false,
    blankAreaOnly: source.blankAreaOnly !== false,
    includeActiveModuleTabs: source.includeActiveModuleTabs !== false,
    activeModuleTabLimit: clamp(source.activeModuleTabLimit, 1, 8, DEFAULT_LEFT_CLICK_MENU_SETTINGS.activeModuleTabLimit),
    maxItems: clamp(source.maxItems, 5, 24, DEFAULT_LEFT_CLICK_MENU_SETTINGS.maxItems),
    showIcons: source.showIcons !== false,
    compact: source.compact !== false,
    items: uniqueIds(source.items),
  };
}

function readCache() {
  try {
    if (typeof window === "undefined") return normalizeLeftClickMenuSettings();
    const raw = window.localStorage.getItem(LEFT_CLICK_CACHE_KEY);
    return raw ? normalizeLeftClickMenuSettings(JSON.parse(raw)) : normalizeLeftClickMenuSettings();
  } catch {
    return normalizeLeftClickMenuSettings();
  }
}

function writeCache(settings) {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(LEFT_CLICK_CACHE_KEY, JSON.stringify(settings));
  } catch {
    // Cache yalnız hızlandırma/fallback içindir; API kaydı ana kaynaktır.
  }
}

function rowsOf(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function valueOf(row) {
  if (!row || typeof row !== "object") return null;
  if (row.value && typeof row.value === "object") return row.value;
  if (typeof row.value === "string") {
    try { return JSON.parse(row.value); } catch { return null; }
  }
  if (row.settings && typeof row.settings === "object") return row.settings;
  return null;
}

export function getCachedLeftClickMenuSettings() {
  return readCache();
}

export async function loadLeftClickMenuSettings() {
  const cached = readCache();
  try {
    const result = await getSettings({ mainCompanySlug: PLATFORM_UI_SLUG, _ts: Date.now() });
    const row = rowsOf(result).find((item) =>
      String(item?.id || "") === LEFT_CLICK_SETTING_ID || String(item?.key || "") === LEFT_CLICK_SETTING_KEY,
    );
    if (!row) return cached;
    const settings = normalizeLeftClickMenuSettings(valueOf(row) || row);
    writeCache(settings);
    return settings;
  } catch {
    return cached;
  }
}

export async function saveLeftClickMenuSettings(nextValue) {
  const settings = normalizeLeftClickMenuSettings(nextValue);
  const saved = await saveSetting({
    id: LEFT_CLICK_SETTING_ID,
    key: LEFT_CLICK_SETTING_KEY,
    scope: "PLATFORM_UI",
    mainCompanySlug: PLATFORM_UI_SLUG,
    value: settings,
  });
  const normalized = normalizeLeftClickMenuSettings(valueOf(saved) || saved?.value || settings);
  writeCache(normalized);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(LEFT_CLICK_SETTINGS_EVENT, { detail: normalized }));
  }
  return normalized;
}

export function resetLeftClickMenuSettings() {
  return normalizeLeftClickMenuSettings(DEFAULT_LEFT_CLICK_MENU_SETTINGS);
}
