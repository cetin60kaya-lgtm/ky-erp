import { apiGet, apiPost, apiUpload, downloadFile } from "../../utils/api";

function unwrap(payload) {
  return payload &&
    typeof payload === "object" &&
    payload.ok === true &&
    Object.prototype.hasOwnProperty.call(payload, "data")
    ? payload.data
    : payload;
}

const IK_MUTATION_CHANNEL = "kyerp.ik.monthly.live.v1";
const freshOptions = (options = {}) => ({ ...options, forceFresh: options.forceFresh !== false });

function publishIkMutation(type = "mutation") {
  if (typeof window === "undefined" || typeof window.BroadcastChannel !== "function") return;
  try {
    const channel = new window.BroadcastChannel(IK_MUTATION_CHANNEL);
    channel.postMessage({ type, at: Date.now() });
    channel.close();
  } catch {
    // D1 sync-state is authoritative; BroadcastChannel only accelerates same-browser refresh.
  }
}

async function postAndPublish(path, payload, type) {
  const result = unwrap(await apiPost(path, payload));
  publishIkMutation(type);
  return result;
}

export async function getIkAdvancedSyncState(params = {}, options = {}) {
  return unwrap(await apiGet("/ik/advanced/sync-state", params, freshOptions(options)));
}
export async function getIkAdvancedMonth(params = {}) {
  return unwrap(await apiGet("/ik/advanced/month", params, freshOptions()));
}

export async function getIkAdvancedAuditLogs(params = {}) {
  return unwrap(await apiGet("/ik/advanced/audit-logs", params, freshOptions()));
}

export async function getIkAdvancedPayroll(params = {}) {
  return unwrap(await apiGet("/ik/advanced/payroll", params, freshOptions()));
}

export async function getIkAdvancedPeriodState(params = {}) {
  return unwrap(await apiGet("/ik/advanced/period-state", params, freshOptions()));
}

export async function prepareIkAdvancedPeriod(payload = {}) {
  return postAndPublish("/ik/advanced/period-prepare", payload, "period-prepare");
}

export async function saveIkAdvancedPersonCard(employeeId, payload = {}) {
  return postAndPublish(`/ik/advanced/person-card/${encodeURIComponent(employeeId)}`, payload, "person-card");
}

export async function saveIkAdvancedException(payload = {}) {
  return postAndPublish("/ik/advanced/leave", payload, "exception");
}

export async function saveIkAdvancedLeave(payload = {}) {
  return postAndPublish("/ik/advanced/leave", payload, "leave");
}

export async function getIkAdvancedLeaveCenter(params = {}) {
  return unwrap(await apiGet("/ik/advanced/leave-center", params, freshOptions()));
}

export async function previewIkAdvancedLeave(payload = {}) {
  return unwrap(await apiPost("/ik/advanced/leave/preview", payload));
}

export async function saveIkAdvancedLeavePolicy(payload = {}) {
  return postAndPublish("/ik/advanced/leave/policy", payload, "leave-policy");
}

export async function cancelIkAdvancedLeave(payload = {}) {
  return postAndPublish("/ik/advanced/leave/cancel", payload, "leave-cancel");
}

export async function saveIkAdvancedFinanceMovement(payload = {}) {
  return postAndPublish("/ik/advanced/finance-movement", payload, "finance-create");
}

export async function updateIkAdvancedFinanceMovement(payload = {}) {
  return postAndPublish("/ik/advanced/finance-movement/update", payload, "finance-update");
}

export async function deleteIkAdvancedFinanceMovement(payload = {}) {
  return postAndPublish("/ik/advanced/finance-movement/delete", payload, "finance-delete");
}

export async function saveIkAdvancedFinalPayrollControl(payload = {}) {
  return postAndPublish("/ik/advanced/payroll/final-control", payload, "payroll-final");
}

export async function saveIkAdvancedPayrollLines(payload = {}) {
  return postAndPublish("/ik/advanced/payroll/save", payload, "payroll-save");
}

export async function saveIkAdvancedSettlementDraft(payload = {}) {
  return postAndPublish("/ik/advanced/settlement-draft", payload, "settlement-draft");
}

export async function uploadIkAdvancedDocument(file, params = {}) {
  const form = new FormData();
  form.append("file", file);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") form.append(key, value);
  });
  const result = unwrap(await apiUpload("/ik/advanced/documents/upload", form));
  publishIkMutation("document-upload");
  return result;
}

export async function downloadIkAdvancedDocument(documentId, fileName = "ik-evrak") {
  return downloadFile(`/ik/advanced/documents/${encodeURIComponent(documentId)}/content`, undefined, fileName);
}

export async function previewIkAdvancedSgk(file, params = {}) {
  const form = new FormData();
  form.append("file", file);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") form.append(key, value);
  });
  return unwrap(await apiUpload("/ik/advanced/sgk/preview", form));
}

export async function confirmIkAdvancedSgk(payload = {}) {
  return unwrap(await apiPost("/ik/advanced/sgk/confirm", payload));
}


export async function runIkAdvancedCloseCheck(payload = {}) {
  return postAndPublish("/ik/advanced/close-check", payload, "close-check");
}
