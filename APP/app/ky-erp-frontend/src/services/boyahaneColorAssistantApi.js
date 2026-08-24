import { apiPost } from "../utils/api";

function companyPayload(activeMainCompany, extra = {}) {
  const mainCompanySlug = String(
    activeMainCompany?.slug || activeMainCompany?.mainCompanySlug || "",
  ).trim();
  if (!mainCompanySlug) {
    throw new Error("Ana firma seçmeden renk asistanı çalıştırılamaz.");
  }
  return {
    ...extra,
    mainCompanySlug,
    mainCompanyId:
      activeMainCompany?.id || activeMainCompany?.mainCompanyId || undefined,
  };
}

function unwrap(payload) {
  return payload?.ok === true ? payload.data : payload;
}

export async function suggestBoyahaneColor(activeMainCompany, body) {
  return unwrap(
    await apiPost(
      "/boyahane/color-assistant/suggest",
      companyPayload(activeMainCompany, body),
      { timeoutMs: 60000 },
    ),
  );
}

export async function confirmBoyahaneColorSuggestion(activeMainCompany, body) {
  const colorHex = String(body?.colorHex || body?.hex || "").trim();
  const pantone = String(body?.pantone || "").trim();
  if (!colorHex || !pantone) {
    return { skipped: true, reason: "HEX_PANTONE_PAIR_INCOMPLETE" };
  }
  return unwrap(
    await apiPost(
      "/boyahane/color-assistant/confirm",
      companyPayload(activeMainCompany, body),
      { timeoutMs: 60000 },
    ),
  );
}
