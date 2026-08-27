const successfulSourceCache = new Map();

function cacheKey(scope, sourceName) {
  return `${String(scope || "global")}:${sourceName}`;
}

function isAuthorizationError(error) {
  return [401, 403].includes(Number(error?.status || 0));
}

function sourceDefinition(value) {
  if (typeof value === "function") return { load: value, critical: false };
  if (!value || typeof value.load !== "function") {
    throw new TypeError("Her veri kaynağı bir load fonksiyonu tanımlamalıdır.");
  }
  return value;
}

/**
 * Bağımsız ekran GET'lerini birbirinden izole eder.
 *
 * - Başarılı ana veri, yardımcı bir kaynak hata verse de döner.
 * - Aynı oturumdaki son başarılı değer geçici GET hatasında korunur.
 * - İlk yüklemedeki hata, fallback verilse bile `states[name].status === "error"`
 *   olarak kalır; gerçek boş sonuçla karışmaz.
 * - 401/403 hiçbir zaman yutulmaz.
 */
export async function loadModuleData({ scope, sources }) {
  const entries = Object.entries(sources || {}).map(([name, raw]) => [
    name,
    sourceDefinition(raw),
  ]);
  const settled = await Promise.allSettled(
    entries.map(([, definition]) => Promise.resolve().then(definition.load)),
  );

  const authorizationFailure = settled.find(
    (result) => result.status === "rejected" && isAuthorizationError(result.reason),
  );
  if (authorizationFailure) throw authorizationFailure.reason;

  const data = {};
  const states = {};
  const errors = {};

  settled.forEach((result, index) => {
    const [name, definition] = entries[index];
    const key = cacheKey(scope, name);
    if (result.status === "fulfilled") {
      data[name] = result.value;
      successfulSourceCache.set(key, result.value);
      states[name] = { status: "success", critical: Boolean(definition.critical) };
      return;
    }

    const error = result.reason instanceof Error
      ? result.reason
      : new Error(String(result.reason || "Veri kaynağı okunamadı."));
    errors[name] = error;
    if (successfulSourceCache.has(key)) {
      data[name] = successfulSourceCache.get(key);
      states[name] = { status: "stale", critical: Boolean(definition.critical), error };
      return;
    }

    if (Object.prototype.hasOwnProperty.call(definition, "fallback")) {
      data[name] = typeof definition.fallback === "function"
        ? definition.fallback()
        : definition.fallback;
    }
    states[name] = { status: "error", critical: Boolean(definition.critical), error };
  });

  const criticalErrors = Object.entries(states)
    .filter(([, state]) => state.critical && state.status === "error")
    .map(([name]) => ({ name, error: errors[name] }));
  const degradedSources = Object.entries(states)
    .filter(([, state]) => state.status === "error" || state.status === "stale")
    .map(([name, state]) => ({ name, ...state }));

  return {
    data,
    states,
    errors,
    criticalErrors,
    degradedSources,
    hasCriticalError: criticalErrors.length > 0,
    hasDegradedData: degradedSources.length > 0,
  };
}

export function moduleLoadMessage(result, criticalFallback, optionalFallback) {
  if (result?.hasCriticalError) {
    return result.criticalErrors[0]?.error?.message || criticalFallback;
  }
  if (result?.hasDegradedData) {
    return optionalFallback || "Bazı yardımcı bilgiler geçici olarak yenilenemedi; ana veriler korunuyor.";
  }
  return "";
}

export function clearResilientDataCache() {
  successfulSourceCache.clear();
}
