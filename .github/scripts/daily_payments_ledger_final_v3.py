from pathlib import Path
import re

source=Path('.github/scripts/daily_payments_ledger_final.py').read_text(encoding='utf-8')
# Align service adapter with current dailyOpsApi architecture.
start=source.index('# ---- service methods ----')
end=source.index('# ---- frontend imports ----')
service_block="""# ---- service methods ----
svc_anchor='''export async function markDailyPaid(payload = {}) {
  return unwrap(await apiPost(`${ROOT}/attendance/mark-paid`, payload));
}'''
svc_insert=svc_anchor+'''\n\nexport async function getDailyPaymentPool(params = {}, options = {}) {\n  return unwrap(await apiGet(`${ROOT}/payments/pool`, params, freshOptions(options)));\n}\n\nexport async function getDailyPaymentHistory(params = {}, options = {}) {\n  return unwrap(await apiGet(`${ROOT}/payments/history`, params, freshOptions(options)));\n}\n\nexport async function createDailyPayment(payload = {}) {\n  return unwrap(await apiPost(`${ROOT}/payments`, payload));\n}\n\nexport async function cancelDailyPayment(paymentId, payload = {}) {\n  return unwrap(await apiPost(`${ROOT}/payments/${encodeURIComponent(paymentId)}/cancel`, payload));\n}'''
if svc_anchor not in svc: raise SystemExit('service anchor missing')
svc=svc.replace(svc_anchor,svc_insert,1)

"""
patched=source[:start]+service_block+source[end:]
# Replace the transformer's fragile pay-handler regex with source-boundary replacement.
m=re.search(r"pay_repl='''(.*?)'''\nfe,n=pay_pattern\.subn\(pay_repl,fe,count=1\)\nif n!=1: raise SystemExit\('pay handler pattern missing'\)",patched,re.S)
if not m:
    raise SystemExit('pay replacement payload missing in transformer')
pay_payload=m.group(1)
block_start=patched.rfind('pay_pattern=re.compile',0,m.start())
if block_start<0:
    raise SystemExit('pay transformer start missing')
replacement=("pay_repl="+repr(pay_payload)+"\n"
             "pay_start=fe.find('  const payRow = async (row) =>')\n"
             "pay_end=fe.find('  const exportExcel = async',pay_start)\n"
             "if pay_start<0 or pay_end<0: raise SystemExit('pay handler boundaries missing')\n"
             "fe=fe[:pay_start]+pay_repl+'\\n\\n'+fe[pay_end:]\n")
patched=patched[:block_start]+replacement+patched[m.end():]
exec(compile(patched,'daily_payments_ledger_final_v3_exec.py','exec'))
