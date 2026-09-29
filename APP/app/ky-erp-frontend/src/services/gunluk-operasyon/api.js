import { apiGet } from "../../utils/api";

function unwrap(payload) {
  return payload && typeof payload === "object" && payload.ok === true && Object.prototype.hasOwnProperty.call(payload, "data")
    ? payload.data
    : payload;
}

export async function getGunlukPersonel(params = {}, options = {}) {
  return unwrap(await apiGet("/gunluk-operasyon/employees", params, options));
}

export async function getGunlukDurum(params = {}, options = {}) {
  return unwrap(await apiGet("/gunluk-operasyon/attendance", params, options));
}
