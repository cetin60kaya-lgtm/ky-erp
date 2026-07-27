import { apiGet, apiPatch, apiPost } from "../utils/api";

function withCompany(activeMainCompany, params = {}) {
  return {
    ...params,
    mainCompanyId: activeMainCompany?.id || params.mainCompanyId,
    mainCompanySlug: activeMainCompany?.slug || params.mainCompanySlug,
  };
}

export async function getBoyahaneOzet(activeMainCompany, params = {}) {
  return apiGet("/boyahane/ozet", withCompany(activeMainCompany, params));
}

export async function getRenkReceteIsler(activeMainCompany, params = {}) {
  return apiGet("/boyahane/renk-recete/isler", withCompany(activeMainCompany, params));
}

export async function getRenkReceteModelHavuzu(activeMainCompany, params = {}) {
  return apiGet("/boyahane/model-havuzu", withCompany(activeMainCompany, params));
}

export async function getModelHavuzuRenkler(activeMainCompany, modelId, params = {}) {
  return apiGet(`/boyahane/model-havuzu/${encodeURIComponent(modelId)}/renkler`, withCompany(activeMainCompany, params));
}

export async function getRenkRecete(activeMainCompany, id) {
  return apiGet(`/boyahane/renk-recete/${encodeURIComponent(id)}`, withCompany(activeMainCompany));
}

export async function createRenkRecete(activeMainCompany, payload) {
  return apiPost("/boyahane/renk-recete", withCompany(activeMainCompany, payload));
}

export async function updateRenkRecete(activeMainCompany, id, payload) {
  return apiPatch(`/boyahane/renk-recete/${encodeURIComponent(id)}`, withCompany(activeMainCompany, payload));
}

export async function createRenkReceteVersion(activeMainCompany, id, payload = {}) {
  return apiPost(`/boyahane/renk-recete/${encodeURIComponent(id)}/yeni-versiyon`, withCompany(activeMainCompany, payload));
}

export async function createModelBoyaGideri(activeMainCompany, payload) {
  return apiPost("/boyahane/model-boya-gideri", withCompany(activeMainCompany, payload));
}

export async function convertUndefinedColor(activeMainCompany, payload) {
  return apiPost("/boyahane/tanimsiz-renk/kayitli-renge-cevir", withCompany(activeMainCompany, payload));
}

export async function getKayitliRenkler(activeMainCompany, params = {}) {
  return apiGet("/boyahane/kayitli-renkler", withCompany(activeMainCompany, params));
}

export async function getKayitliRenk(activeMainCompany, id) {
  return apiGet(`/boyahane/kayitli-renkler/${encodeURIComponent(id)}`, withCompany(activeMainCompany));
}

export async function createKayitliRenk(activeMainCompany, payload) {
  return apiPost("/boyahane/kayitli-renkler", withCompany(activeMainCompany, payload));
}

export async function updateKayitliRenk(activeMainCompany, id, payload) {
  return apiPatch(`/boyahane/kayitli-renkler/${encodeURIComponent(id)}`, withCompany(activeMainCompany, payload));
}

export async function getHammaddeLot(activeMainCompany, params = {}) {
  return apiGet("/boyahane/hammadde-lot", withCompany(activeMainCompany, params));
}

export async function createHammaddeLot(activeMainCompany, payload) {
  return apiPost("/boyahane/hammadde-lot", withCompany(activeMainCompany, payload));
}

export async function updateHammaddeLot(activeMainCompany, id, payload) {
  return apiPatch(`/boyahane/hammadde-lot/${encodeURIComponent(id)}`, withCompany(activeMainCompany, payload));
}

export async function makeDefaultLot(activeMainCompany, id, payload = {}) {
  return apiPost(`/boyahane/hammadde-lot/${encodeURIComponent(id)}/varsayilan-yap`, withCompany(activeMainCompany, payload));
}

export async function deactivateLot(activeMainCompany, id, payload = {}) {
  return apiPost(`/boyahane/hammadde-lot/${encodeURIComponent(id)}/pasife-al`, withCompany(activeMainCompany, payload));
}

export async function getLotHareketler(activeMainCompany, id) {
  return apiGet(`/boyahane/hammadde-lot/${encodeURIComponent(id)}/hareketler`, withCompany(activeMainCompany));
}

export async function getOnayliEnvanter(activeMainCompany, params = {}) {
  return apiGet("/boyahane/onayli-envanter", withCompany(activeMainCompany, params));
}

export async function createOnayliEnvanter(activeMainCompany, payload) {
  return apiPost("/boyahane/onayli-envanter", withCompany(activeMainCompany, payload));
}

export async function updateOnayliEnvanter(activeMainCompany, id, payload) {
  return apiPatch(`/boyahane/onayli-envanter/${encodeURIComponent(id)}`, withCompany(activeMainCompany, payload));
}

export async function getEvraklar(activeMainCompany, params = {}) {
  return apiGet("/boyahane/evraklar", withCompany(activeMainCompany, params));
}

export async function createEvrak(activeMainCompany, payload) {
  return apiPost("/boyahane/evraklar", withCompany(activeMainCompany, payload));
}

export async function updateEvrak(activeMainCompany, id, payload) {
  return apiPatch(`/boyahane/evraklar/${encodeURIComponent(id)}`, withCompany(activeMainCompany, payload));
}

export async function approveEvrak(activeMainCompany, id, payload = {}) {
  return apiPost(`/boyahane/evraklar/${encodeURIComponent(id)}/onayla`, withCompany(activeMainCompany, payload));
}

export async function getBoyahaneRaporlar(activeMainCompany, params = {}) {
  return apiGet("/boyahane/raporlar", withCompany(activeMainCompany, params));
}
