import { apiGet, apiPost, apiPut } from "../utils/api";

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

export async function getUretimSeriSummary(activeMainCompany, params = {}) {
  return unwrap(
    await apiGet("/uretim/seri/summary", withCompany(activeMainCompany, params)),
  );
}

export async function searchUretimSeriModels(activeMainCompany, q) {
  return unwrap(
    await apiGet(
      "/uretim/seri/model-search",
      withCompany(activeMainCompany, { q }),
    ),
  );
}

export async function getUretimSeriWorkCards(activeMainCompany, params = {}) {
  return unwrap(
    await apiGet(
      "/uretim/seri/work-cards",
      withCompany(activeMainCompany, params),
    ),
  );
}

export async function getUretimSeriIncomingDispatches(activeMainCompany, params = {}) {
  return unwrap(
    await apiGet(
      "/uretim/seri/incoming-dispatches",
      withCompany(activeMainCompany, params),
    ),
  );
}

export async function getUretimSeriEntries(activeMainCompany, params = {}) {
  return unwrap(
    await apiGet("/uretim/seri/entries", withCompany(activeMainCompany, params)),
  );
}

export async function getUretimSeriReport(activeMainCompany, params = {}) {
  return unwrap(
    await apiGet("/uretim/seri/report", withCompany(activeMainCompany, params)),
  );
}

export async function createUretimSeriEntry(activeMainCompany, payload = {}) {
  return unwrap(
    await apiPost(
      "/uretim/seri/entry",
      withCompany(activeMainCompany, payload),
    ),
  );
}

export async function createUretimSeriWorkCard(activeMainCompany, payload = {}) {
  return unwrap(
    await apiPost(
      "/uretim/seri/work-card",
      withCompany(activeMainCompany, payload),
    ),
  );
}

export async function linkUretimSeriModel(activeMainCompany, payload = {}) {
  return unwrap(
    await apiPost(
      "/uretim/seri/link-model",
      withCompany(activeMainCompany, payload),
    ),
  );
}

export async function linkUretimSeriInvoice(activeMainCompany, payload = {}) {
  return unwrap(
    await apiPost(
      "/uretim/seri/link-invoice",
      withCompany(activeMainCompany, payload),
    ),
  );
}

export async function setUretimSeriPrice(activeMainCompany, payload = {}) {
  return unwrap(
    await apiPost(
      "/uretim/seri/set-price",
      withCompany(activeMainCompany, payload),
    ),
  );
}

export async function closeUretimSeriWork(activeMainCompany, payload = {}) {
  return unwrap(
    await apiPost(
      "/uretim/seri/close-work",
      withCompany(activeMainCompany, payload),
    ),
  );
}

export async function getUretimSeriMachines(activeMainCompany) {
  return unwrap(
    await apiGet("/uretim/seri/machines", withCompany(activeMainCompany)),
  );
}

export async function saveUretimSeriMachine(activeMainCompany, payload = {}) {
  const id = payload?.id || payload?.makineNo;
  if (id) {
    return unwrap(
      await apiPut(
        `/uretim/seri/machines/${encodeURIComponent(id)}`,
        withCompany(activeMainCompany, payload),
      ),
    );
  }
  return unwrap(
    await apiPost(
      "/uretim/seri/machines",
      withCompany(activeMainCompany, payload),
    ),
  );
}
