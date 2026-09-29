import { apiGet, apiPatch, apiPost } from "../utils/api";
function unwrap(payload) { return payload && typeof payload === "object" && payload.ok === true && Object.prototype.hasOwnProperty.call(payload, "data") ? payload.data : payload; }
export async function getGunlukPersonel(params = {}) { return unwrap(await apiGet("/ik/daily-employees", params)); }
export async function createGunlukPersonel(payload = {}) { return unwrap(await apiPost("/ik/daily-employees", payload)); }
export async function updateGunlukPersonel(id, payload = {}) { return unwrap(await apiPatch(`/ik/daily-employees/${encodeURIComponent(id)}`, payload)); }
export async function getGunlukPuantaj(params = {}) { return unwrap(await apiGet("/ik/daily-attendance", params)); }
export async function saveGunlukPuantaj(payload = {}) { return unwrap(await apiPost("/ik/daily-attendance/save-range", payload)); }
