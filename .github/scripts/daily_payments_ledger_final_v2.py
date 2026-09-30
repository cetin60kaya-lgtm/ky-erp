from pathlib import Path
import re

source=Path('.github/scripts/daily_payments_ledger_final.py').read_text(encoding='utf-8')
start=source.index('# ---- service methods ----')
end=source.index('# ---- frontend imports ----')
service_block=r'''# ---- service methods ----
svc_anchor=''' + "'''" + r'''export async function markDailyPaid(payload = {}) {
  return unwrap(await apiPost(`${ROOT}/attendance/mark-paid`, payload));
}''' + "'''" + r'''
svc_insert=svc_anchor+''' + "'''" + r'''

export async function getDailyPaymentPool(params = {}, options = {}) {
  return unwrap(await apiGet(`${ROOT}/payments/pool`, params, freshOptions(options)));
}

export async function getDailyPaymentHistory(params = {}, options = {}) {
  return unwrap(await apiGet(`${ROOT}/payments/history`, params, freshOptions(options)));
}

export async function createDailyPayment(payload = {}) {
  return unwrap(await apiPost(`${ROOT}/payments`, payload));
}

export async function cancelDailyPayment(paymentId, payload = {}) {
  return unwrap(await apiPost(`${ROOT}/payments/${encodeURIComponent(paymentId)}/cancel`, payload));
}''' + "'''" + r'''
if svc_anchor not in svc: raise SystemExit('service anchor missing')
svc=svc.replace(svc_anchor,svc_insert,1)

'''
patched=source[:start]+service_block+source[end:]
exec(compile(patched,'daily_payments_ledger_final_v2_exec.py','exec'))
