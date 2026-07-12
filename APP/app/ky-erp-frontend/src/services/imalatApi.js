import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "../utils/api";

export { fetchErpModuleData, runErpApprovedAction } from "./erpApi";

function unwrap(payload) {
  if (
    payload &&
    typeof payload === "object" &&
    payload.ok === true &&
    Object.prototype.hasOwnProperty.call(payload, "data")
  ) {
    return payload?.data;
  }
  return payload;
}

function withCompany(activeMainCompany, extra = {}) {
  return {
    ...(activeMainCompany || {}),
    ...extra,
  };
}

export async function getImalatGirisHavuzu(activeMainCompany, params = {}) {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  });
  const suffix = search.toString() ? `${search.toString()}` : "";
  return unwrap(
    await apiGet(
      `/imalat/giris-havuzu${suffix}`,
      withCompany(activeMainCompany),
    ),
  );
}

export async function getUretimSeriHavuz(activeMainCompany, params = {}) {
  return unwrap(
    await apiGet("/uretim/seri-havuz", withCompany(activeMainCompany, params)),
  );
}

export async function postUretimHizliGiris(activeMainCompany, payload = {}) {
  return unwrap(
    await apiPost("/uretim/hizli-giris", withCompany(activeMainCompany, payload)),
  );
}

export async function getUretimModelGecmisi(activeMainCompany, modelId) {
  return unwrap(
    await apiGet(
      `/uretim/model-gecmisi/${encodeURIComponent(modelId)}`,
      withCompany(activeMainCompany),
    ),
  );
}

export async function getUretimMakineTanimlari(activeMainCompany) {
  return unwrap(
    await apiGet("/uretim/makine-tanimlari", withCompany(activeMainCompany)),
  );
}

export async function saveUretimMakineTanim(activeMainCompany, payload = {}) {
  return unwrap(
    await apiPost(
      "/uretim/makine-tanimlari",
      withCompany(activeMainCompany, payload),
    ),
  );
}

export async function postUretimIrsaliyeEslestir(activeMainCompany, payload = {}) {
  return unwrap(
    await apiPost(
      "/uretim/irsaliye-eslestir",
      withCompany(activeMainCompany, payload),
    ),
  );
}

export async function postUretimIsKapat(activeMainCompany, payload = {}) {
  return unwrap(
    await apiPost("/uretim/is-kapat", withCompany(activeMainCompany, payload)),
  );
}

export async function getUretimSeriRapor(activeMainCompany, params = {}) {
  return unwrap(
    await apiGet("/uretim/seri-rapor", withCompany(activeMainCompany, params)),
  );
}

export async function getImalatHavuz(activeMainCompany, params = {}) {
  return unwrap(
    await apiGet("/imalat/havuz", withCompany(activeMainCompany, params)),
  );
}

export async function createManuelIs(activeMainCompany, payload = {}) {
  return unwrap(
    await apiPost(
      "/imalat/manuel-is",
      withCompany(activeMainCompany, {
        firma: payload?.firma,
        musteriFirma: payload?.firma,
        modelAdi: payload?.model || payload?.modelAdi,
        musteriIrsaliyeNo: payload?.irsaliyeNo || payload?.siparisNo,
        gelenAdet: payload?.beklenenAdet,
        grup: payload?.baskiBolgesi,
        tarih: payload?.tarih,
        durum: payload?.durum || "İşlem Bekliyor",
        kaynak: "Manuel",
      }),
    ),
  );
}

export async function addUretimGirisi(
  activeMainCompany,
  planLineId,
  payload = {},
) {
  return unwrap(
    await apiPost(
      "/imalat/kayitlar",
      withCompany(activeMainCompany, {
        planLineId,
        modelKaydiId: payload?.modelKaydiId || payload?.modelId || planLineId,
        modelId: payload?.modelKaydiId || payload?.modelId || planLineId,
        tarih: payload?.tarih,
        vardiya: payload?.vardiya,
        partiNo: payload?.partiNo,
        batchNo: payload?.partiNo,
        makina: payload?.makineNo || payload?.makina,
        makinaAdi: payload?.makineAdi || payload?.makinaAdi,
        sorumluPersonel: payload?.makinaci || payload?.sorumluPersonel,
        uretimAdedi: payload?.adet,
        hataliAdet: payload?.hataliAdet || 0,
        not: payload?.not,
        firma: payload?.firma,
        modelAdi: payload?.model,
        musteriIrsaliyeNo: payload?.irsaliyeNo,
        grup: payload?.baskiBolgesi,
        baskiBolgesi: payload?.baskiBolgesi,
      }),
    ),
  );
}

export async function getUretimGirisleri(
  activeMainCompany,
  planLineId,
  params = {},
) {
  return unwrap(
    await apiGet(
      `/imalat/havuz/${encodeURIComponent(planLineId)}/girisler`,
      withCompany(activeMainCompany, params),
    ),
  );
}

export async function getImalatRaporlar(activeMainCompany, params = {}) {
  return unwrap(
    await apiGet("/imalat/raporlar", withCompany(activeMainCompany, params)),
  );
}

export async function getImalatDenetim(activeMainCompany, params = {}) {
  return unwrap(
    await apiGet("/imalat/denetim", withCompany(activeMainCompany, params)),
  );
}

export async function getImalatOperasyonRaporu(activeMainCompany, params = {}) {
  return unwrap(
    await apiGet("/imalat/rapor", withCompany(activeMainCompany, params)),
  );
}

export async function getImalatMakineler(activeMainCompany) {
  return unwrap(
    await apiGet("/imalat/makineler", withCompany(activeMainCompany)),
  );
}

export async function saveImalatMakine(activeMainCompany, payload = {}) {
  const id = payload?.id || payload?.makineNo;
  if (id) {
    return unwrap(
      await apiPut(
        `/imalat/makineler/${encodeURIComponent(id)}`,
        withCompany(activeMainCompany, payload),
      ),
    );
  }
  return unwrap(
    await apiPost("/imalat/makineler", withCompany(activeMainCompany, payload)),
  );
}

export async function patchImalatMakineDurum(activeMainCompany, machineId, payload = {}) {
  return unwrap(
    await apiPatch(
      `/imalat/makineler/${encodeURIComponent(machineId)}/durum`,
      withCompany(activeMainCompany, payload),
    ),
  );
}

export async function getBaskiBolgesiTanimlari(activeMainCompany) {
  return unwrap(
    await apiGet(
      "/imalat/baski-bolgesi-tanimlari",
      withCompany(activeMainCompany),
    ),
  );
}

export async function getMakineVardiya(activeMainCompany, params = {}) {
  return unwrap(
    await apiGet("/imalat/makinalar", withCompany(activeMainCompany, params)),
  );
}

export async function saveMakineVardiya(activeMainCompany, payload = {}) {
  return unwrap(
    await apiPost(
      "/imalat/makinalar",
      withCompany(activeMainCompany, {
        id: payload?.makineNo || payload?.id,
        ad: payload?.makineAdi || payload?.makine || payload?.ad,
        vardiya: payload?.vardiya,
        operator: payload?.makinaci || payload?.operator,
        durum: payload?.durum,
        renkKapasitesi: payload?.renkKapasitesi || 0,
      }),
    ),
  );
}

export async function updateMakineVardiya(
  activeMainCompany,
  makinaId,
  payload = {},
) {
  return unwrap(
    await apiPatch(
      `/imalat/makinalar/${encodeURIComponent(makinaId)}`,
      withCompany(activeMainCompany, {
        id: payload?.makineNo || payload?.id || makinaId,
        ad: payload?.makineAdi || payload?.makine || payload?.ad,
        vardiya: payload?.vardiya,
        operator: payload?.makinaci || payload?.operator,
        durum: payload?.durum,
        renkKapasitesi: payload?.renkKapasitesi || 0,
      }),
    ),
  );
}

export async function deleteMakineVardiya(activeMainCompany, makinaId) {
  return unwrap(
    await apiDelete(
      `/imalat/makinalar/${encodeURIComponent(makinaId)}`,
      withCompany(activeMainCompany),
    ),
  );
}

export async function getMakineSilmeOzeti(activeMainCompany, makinaId) {
  return unwrap(
    await apiGet(
      `/imalat/makinalar/${encodeURIComponent(makinaId)}/delete-summary`,
      withCompany(activeMainCompany),
    ),
  );
}

export async function patchImalatQuantity(
  activeMainCompany,
  lineId,
  payload = {},
) {
  return unwrap(
    await apiPatch(
      `/imalat/giris-havuzu/${encodeURIComponent(lineId)}/quantity`,
      {
        ...withCompany(activeMainCompany),
        ...payload,
      },
    ),
  );
}

export async function updateUretimGirisi(
  activeMainCompany,
  entryId,
  payload = {},
) {
  return unwrap(
    await apiPatch(
      `/imalat/kayitlar/${encodeURIComponent(entryId)}`,
      withCompany(activeMainCompany, {
        tarih: payload?.tarih,
        vardiya: payload?.vardiya,
        partiNo: payload?.partiNo,
        batchNo: payload?.partiNo,
        makina: payload?.makineNo || payload?.makina,
        makinaAdi: payload?.makineAdi || payload?.makinaAdi,
        sorumluPersonel: payload?.makinaci || payload?.sorumluPersonel,
        uretimAdedi: payload?.adet,
        hataliAdet: payload?.hataliAdet || 0,
        printDefectQty: payload?.baskiHatasiAdet || 0,
        fabricDefectQty: payload?.kumasHatasiAdet || 0,
        grup: payload?.baskiBolgesi,
        baskiBolgesi: payload?.baskiBolgesi,
        not: payload?.not,
      }),
    ),
  );
}

export async function deleteUretimGirisi(activeMainCompany, entryId) {
  return unwrap(
    await apiDelete(
      `/imalat/kayitlar/${encodeURIComponent(entryId)}`,
      withCompany(activeMainCompany),
    ),
  );
}

export async function deleteModelKaydiImalat(activeMainCompany, modelKaydiId) {
  return unwrap(
    await apiDelete(
      `/imalat/model-kayitlari/${encodeURIComponent(modelKaydiId)}`,
      withCompany(activeMainCompany),
    ),
  );
}

export async function getFisAktarimHavuzu(activeMainCompany, tumu = false) {
  const path = tumu ? "/uretim/fis-aktarim/havuz/tumu" : "/uretim/fis-aktarim/havuz";
  return unwrap(await apiGet(path, withCompany(activeMainCompany)));
}

export async function fisAktarimSatirlariHavuzaAl(activeMainCompany, satirlar = []) {
  return unwrap(
    await apiPost(
      "/uretim/fis-aktarim/excel-satirlari",
      withCompany(activeMainCompany, { kaynak: "EXCEL", satirlar }),
    ),
  );
}

export async function updateFisAktarimSatiri(activeMainCompany, id, payload = {}) {
  return unwrap(
    await apiPatch(
      `/uretim/fis-aktarim/havuz/${encodeURIComponent(id)}`,
      withCompany(activeMainCompany, payload),
    ),
  );
}

export async function deleteFisAktarimSatiri(activeMainCompany, id) {
  return unwrap(
    await apiDelete(
      `/uretim/fis-aktarim/havuz/${encodeURIComponent(id)}`,
      withCompany(activeMainCompany),
    ),
  );
}

export async function topluEslestirFisAktarim(activeMainCompany) {
  return unwrap(
    await apiPost(
      "/uretim/fis-aktarim/toplu-eslestir",
      withCompany(activeMainCompany),
    ),
  );
}

export async function onaylaAktarFisAktarim(activeMainCompany) {
  return unwrap(
    await apiPost(
      "/uretim/fis-aktarim/onayla-aktar",
      withCompany(activeMainCompany),
    ),
  );
}

export async function temizleFisAktarimHavuzu(activeMainCompany) {
  return unwrap(
    await apiPost(
      "/uretim/fis-aktarim/havuz-temizle",
      withCompany(activeMainCompany),
    ),
  );
}
