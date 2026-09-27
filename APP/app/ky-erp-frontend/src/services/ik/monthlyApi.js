import { apiGet, apiPost, apiUpload } from "../../utils/api";

function unwrap(payload) {
  return payload &&
    typeof payload === "object" &&
    payload.ok === true &&
    Object.prototype.hasOwnProperty.call(payload, "data")
    ? payload.data
    : payload;
}
export async function getIkAdvancedMonth(params = {}) {
  return unwrap(await apiGet("/ik/advanced/month", params));
}

export async function getIkAdvancedAuditLogs(params = {}) {
  return unwrap(await apiGet("/ik/advanced/audit-logs", params));
}

export async function getIkAdvancedPayroll(params = {}) {
  return unwrap(await apiGet("/ik/advanced/payroll", params));
}

export async function getIkAdvancedPeriodState(params = {}) {
  return unwrap(await apiGet("/ik/advanced/period-state", params));
}

export async function prepareIkAdvancedPeriod(payload = {}) {
  return unwrap(await apiPost("/ik/advanced/period-prepare", payload));
}

export async function saveIkAdvancedPersonCard(employeeId, payload = {}) {
  return unwrap(await apiPost(`/ik/advanced/person-card/${encodeURIComponent(employeeId)}`, payload));
}

export async function saveIkAdvancedException(payload = {}) {
  return unwrap(await apiPost("/ik/advanced/exception", payload));
}

export async function saveIkAdvancedLeave(payload = {}) {
  return unwrap(await apiPost("/ik/advanced/leave", payload));
}

export async function getIkAdvancedLeaveCenter(params = {}) {
  return unwrap(await apiGet("/ik/advanced/leave-center", params));
}

export async function previewIkAdvancedLeave(payload = {}) {
  return unwrap(await apiPost("/ik/advanced/leave/preview", payload));
}

export async function saveIkAdvancedLeavePolicy(payload = {}) {
  return unwrap(await apiPost("/ik/advanced/leave/policy", payload));
}

export async function cancelIkAdvancedLeave(payload = {}) {
  return unwrap(await apiPost("/ik/advanced/leave/cancel", payload));
}

export async function saveIkAdvancedFinanceMovement(payload = {}) {
  return unwrap(await apiPost("/ik/advanced/finance-movement", payload));
}

export async function updateIkAdvancedFinanceMovement(payload = {}) {
  return unwrap(await apiPost("/ik/advanced/finance-movement/update", payload));
}

export async function deleteIkAdvancedFinanceMovement(payload = {}) {
  return unwrap(await apiPost("/ik/advanced/finance-movement/delete", payload));
}

export async function saveIkAdvancedFinalPayrollControl(payload = {}) {
  return unwrap(await apiPost("/ik/advanced/payroll/final-control", payload));
}

export async function saveIkAdvancedPayrollLines(payload = {}) {
  return unwrap(await apiPost("/ik/advanced/payroll/save", payload));
}

export async function saveIkAdvancedSettlementDraft(payload = {}) {
  return unwrap(await apiPost("/ik/advanced/settlement-draft", payload));
}

export async function uploadIkAdvancedDocument(file, params = {}) {
  const form = new FormData();
  form.append("file", file);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") form.append(key, value);
  });
  return unwrap(await apiUpload("/ik/advanced/documents/upload", form));
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

export async function previewIkAdvancedCard(file, params = {}) {
  const form = new FormData();
  form.append("file", file);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") form.append(key, value);
  });
  return unwrap(await apiUpload("/ik/advanced/card/preview", form));
}

export async function confirmIkAdvancedCard(payload = {}) {
  return unwrap(await apiPost("/ik/advanced/card/confirm", payload));
}

export async function runIkAdvancedCloseCheck(payload = {}) {
  return unwrap(await apiPost("/ik/advanced/close-check", payload));
}
