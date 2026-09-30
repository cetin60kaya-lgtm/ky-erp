from pathlib import Path

FE = Path('APP/app/ky-erp-frontend/src/pages/modules/ik/DailyHrWorkspace.jsx')
CSS = Path('APP/app/ky-erp-frontend/src/pages/modules/ik/daily-hr-workspace-final.css')

fe = FE.read_text(encoding='utf-8')
css = CSS.read_text(encoding='utf-8')


def replace_once(old, new, label):
    global fe
    count = fe.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 anchor, found {count}')
    fe = fe.replace(old, new, 1)

# 1) Independent persisted payment ranges.
replace_once(
    'const RANGE_KEY = "kyerp.dailyOperations.range.v5";\n',
    'const RANGE_KEY = "kyerp.dailyOperations.range.v5";\nconst PAYMENT_POOL_RANGE_KEY = "kyerp.dailyOperations.paymentPoolRange.v1";\nconst PAYMENT_HISTORY_RANGE_KEY = "kyerp.dailyOperations.paymentHistoryRange.v1";\n',
    'range keys',
)

replace_once(
    'function defaultRange() { const start = startOfWeek(); return { start, end: addDays(start, 4) }; }\n',
    '''function defaultRange() { const start = startOfWeek(); return { start, end: addDays(start, 4) }; }\nfunction defaultPaymentRange() { const start = startOfWeek(); return { start, end: addDays(start, 6) }; }\nfunction paymentPresetRange(mode, today = localDateKey()) {\n  const start = startOfWeek(today);\n  const [year, month] = today.split("-").map(Number);\n  if (mode === "today") return { start: today, end: today };\n  if (mode === "week") return { start, end: addDays(start, 6) };\n  if (mode === "lastWeek") { const previous = addDays(start, -7); return { start: previous, end: addDays(previous, 6) }; }\n  if (mode === "month") return { start: `${year}-${pad(month)}-01`, end: localDateKey(new Date(year, month, 0, 12)) };\n  if (mode === "lastMonth") { const d = new Date(year, month - 2, 1, 12); return { start: localDateKey(d), end: localDateKey(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12)) }; }\n  if (mode === "year") return { start: `${year}-01-01`, end: today };\n  return defaultPaymentRange();\n}\n''',
    'payment range helpers',
)

replace_once(
    'function writeRange(range) { try { window.localStorage.setItem(RANGE_KEY, JSON.stringify(range)); } catch { /* optional storage */ } }\n',
    '''function writeRange(range) { try { window.localStorage.setItem(RANGE_KEY, JSON.stringify(range)); } catch { /* optional storage */ } }\nfunction readNamedRange(key, fallback = defaultPaymentRange) {\n  try {\n    const parsed = JSON.parse(window.localStorage.getItem(key) || "null");\n    if (/^\\d{4}-\\d{2}-\\d{2}$/.test(parsed?.start || "") && /^\\d{4}-\\d{2}-\\d{2}$/.test(parsed?.end || "") && parsed.end >= parsed.start) return parsed;\n  } catch { /* optional storage */ }\n  return fallback();\n}\nfunction writeNamedRange(key, range) { try { window.localStorage.setItem(key, JSON.stringify(range)); } catch { /* optional storage */ } }\nfunction sameRange(a, b) { return Boolean(a?.start && b?.start && a.start === b.start && a.end === b.end); }\n''',
    'named range storage',
)

replace_once(
    '  const [paymentHistoryRows, setPaymentHistoryRows] = useState([]);\n',
    '  const [paymentHistoryRows, setPaymentHistoryRows] = useState([]);\n  const [paymentPoolRange, setPaymentPoolRange] = useState(() => readNamedRange(PAYMENT_POOL_RANGE_KEY));\n  const [paymentHistoryRange, setPaymentHistoryRange] = useState(() => readNamedRange(PAYMENT_HISTORY_RANGE_KEY));\n',
    'payment range state',
)

replace_once(
    '''  const setSafeRange = useCallback((next) => {\n    const resolved = typeof next === "function" ? next(range) : next;\n    if (!resolved?.start || !resolved?.end || resolved.end < resolved.start) return;\n    if (rangeDays(resolved.start, resolved.end).length > 31) { setError("Günlük Operasyon tek seferde en fazla 31 günlük aralıkla çalışır."); return; }\n    setRange(resolved); writeRange(resolved); setError("");\n  }, [range]);\n''',
    '''  const setSafeRange = useCallback((next) => {\n    const resolved = typeof next === "function" ? next(range) : next;\n    if (!resolved?.start || !resolved?.end || resolved.end < resolved.start) return;\n    if (rangeDays(resolved.start, resolved.end).length > 31) { setError("Günlük Operasyon tek seferde en fazla 31 günlük aralıkla çalışır."); return; }\n    setRange(resolved); writeRange(resolved); setError("");\n  }, [range]);\n  const setSafePaymentRange = useCallback((target, next) => {\n    const current = target === "history" ? paymentHistoryRange : paymentPoolRange;\n    const resolved = typeof next === "function" ? next(current) : next;\n    if (!resolved?.start || !resolved?.end || resolved.end < resolved.start) return;\n    if (target === "history") { setPaymentHistoryRange(resolved); writeNamedRange(PAYMENT_HISTORY_RANGE_KEY, resolved); }\n    else { setPaymentPoolRange(resolved); writeNamedRange(PAYMENT_POOL_RANGE_KEY, resolved); }\n    setError("");\n  }, [paymentHistoryRange, paymentPoolRange]);\n''',
    'safe payment range setter',
)

# 2) Loaders use their own ranges; dashboard keeps the operational range.
replace_once(
    '''    try {\n      const rows = await getDailyPaymentPool({ mainCompanyId: companyId, startDate: range.start, endDate: range.end });\n      setPaymentRows(Array.isArray(rows) ? rows : []);\n''',
    '''    try {\n      const sourceRange = view === "daily-dashboard" ? range : paymentPoolRange;\n      const rows = await getDailyPaymentPool({ mainCompanyId: companyId, startDate: sourceRange.start, endDate: sourceRange.end });\n      setPaymentRows(Array.isArray(rows) ? rows : []);\n''',
    'payment pool loader body',
)
replace_once(
    '  }, [companyId, range.end, range.start, view]);\n  useEffect(() => { void loadPayments(); }, [loadPayments]);\n\n  const loadPaymentHistory',
    '  }, [companyId, paymentPoolRange.end, paymentPoolRange.start, range.end, range.start, view]);\n  useEffect(() => { void loadPayments(); }, [loadPayments]);\n\n  const loadPaymentHistory',
    'payment pool loader deps',
)
replace_once(
    '      const rows = await getDailyPaymentHistory({ mainCompanyId: companyId, startDate: range.start, endDate: range.end, status: paymentHistoryStatus === "all" ? "" : paymentHistoryStatus.toUpperCase() });\n',
    '      const rows = await getDailyPaymentHistory({ mainCompanyId: companyId, startDate: paymentHistoryRange.start, endDate: paymentHistoryRange.end, status: paymentHistoryStatus === "all" ? "" : paymentHistoryStatus.toUpperCase() });\n',
    'payment history loader range',
)
replace_once(
    '  }, [companyId, paymentHistoryStatus, range.end, range.start, view]);\n',
    '  }, [companyId, paymentHistoryRange.end, paymentHistoryRange.start, paymentHistoryStatus, view]);\n',
    'payment history loader deps',
)

# 3) Payments always use the payment-pool entitlement range.
fe = fe.replace('startDate: range.start, endDate: range.end, paymentDate: localDateKey()', 'startDate: paymentPoolRange.start, endDate: paymentPoolRange.end, paymentDate: localDateKey()', 2)
fe = fe.replace('periodStart: range.start, periodEnd: range.end, paidDate: localDateKey()', 'periodStart: paymentPoolRange.start, periodEnd: paymentPoolRange.end, paidDate: localDateKey()', 1)

old_preset = '''  const paymentPreset = (mode) => {\n    const today = localDateKey(); const start = startOfWeek(today); const [year, month] = today.split("-").map(Number);\n    if (mode === "today") return setSafeRange({ start: today, end: today });\n    if (mode === "week") return setSafeRange({ start, end: addDays(start, 6) });\n    if (mode === "lastWeek") { const previous = addDays(start, -7); return setSafeRange({ start: previous, end: addDays(previous, 6) }); }\n    if (mode === "month") return setSafeRange({ start: `${year}-${pad(month)}-01`, end: localDateKey(new Date(year, month, 0, 12)) });\n    if (mode === "lastMonth") { const d = new Date(year, month - 2, 1, 12); return setSafeRange({ start: localDateKey(d), end: localDateKey(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12)) }); }\n    if (mode === "year") return setSafeRange({ start: `${year}-01-01`, end: `${year}-12-31` });\n  };\n'''
new_preset = '''  const activePaymentRange = paymentTab === "history" ? paymentHistoryRange : paymentPoolRange;\n  const paymentPreset = (mode) => setSafePaymentRange(paymentTab === "history" ? "history" : "pool", paymentPresetRange(mode));\n  const paymentPresetActive = (mode) => sameRange(activePaymentRange, paymentPresetRange(mode));\n  const shiftPaymentRange = (weeks) => setSafePaymentRange(paymentTab === "history" ? "history" : "pool", { start: addDays(activePaymentRange.start, weeks * 7), end: addDays(activePaymentRange.end, weeks * 7) });\n  const paymentRangeControls = <div className="gop-range-controls payment-range-controls"><button type="button" onClick={() => shiftPaymentRange(-1)}>‹ Önceki hafta</button><label>Başlangıç<input type="date" value={activePaymentRange.start} onChange={(e) => setSafePaymentRange(paymentTab === "history" ? "history" : "pool", { ...activePaymentRange, start: e.target.value })}/></label><label>Bitiş<input type="date" value={activePaymentRange.end} onChange={(e) => setSafePaymentRange(paymentTab === "history" ? "history" : "pool", { ...activePaymentRange, end: e.target.value })}/></label><button type="button" onClick={() => shiftPaymentRange(1)}>Sonraki hafta ›</button></div>;\n'''
replace_once(old_preset, new_preset, 'payment preset implementation')

# 4) Payment toolbar reflects only the active payment tab range.
old_toolbar = '        <div className="gop-toolbar-card payment-toolbar"><div className="gop-preset-buttons"><button type="button" onClick={() => paymentPreset("today")}>Bugün</button><button type="button" onClick={() => paymentPreset("week")}>Bu Hafta</button><button type="button" onClick={() => paymentPreset("lastWeek")}>Geçen Hafta</button><button type="button" onClick={() => paymentPreset("month")}>Bu Ay</button><button type="button" onClick={() => paymentPreset("lastMonth")}>Geçen Ay</button><button type="button" onClick={() => paymentPreset("year")}>Bu Yıl</button></div>{rangeControls}</div>\n'
new_toolbar = '        <div className="gop-toolbar-card payment-toolbar"><div className="gop-payment-filter-context"><strong>{paymentTab === "pool" ? "Hakediş Filtresi" : "Ödeme Tarihi Filtresi"}</strong><span>{dateText(activePaymentRange.start)} — {dateText(activePaymentRange.end)}</span></div><div className="gop-preset-buttons"><button type="button" className={paymentPresetActive("today") ? "active" : ""} onClick={() => paymentPreset("today")}>Bugün</button><button type="button" className={paymentPresetActive("week") ? "active" : ""} onClick={() => paymentPreset("week")}>Bu Hafta</button><button type="button" className={paymentPresetActive("lastWeek") ? "active" : ""} onClick={() => paymentPreset("lastWeek")}>Geçen Hafta</button><button type="button" className={paymentPresetActive("month") ? "active" : ""} onClick={() => paymentPreset("month")}>Bu Ay</button><button type="button" className={paymentPresetActive("lastMonth") ? "active" : ""} onClick={() => paymentPreset("lastMonth")}>Geçen Ay</button><button type="button" className={paymentPresetActive("year") ? "active" : ""} onClick={() => paymentPreset("year")}>Bu Yıl</button></div>{paymentRangeControls}</div>\n'
replace_once(old_toolbar, new_toolbar, 'payment toolbar')

fe = fe.replace('value={`${dateText(range.start)} — ${dateText(range.end)}`}', 'value={`${dateText(paymentPoolRange.start)} — ${dateText(paymentPoolRange.end)}`}', 1)
fe = fe.replace('onClick={() => printDailyPaymentSlips(range,[row])}', 'onClick={() => printDailyPaymentSlips(paymentPoolRange,[row])}', 1)

# 5) Make history a clear payment record / audit view instead of a flat ledger table.
history_start = fe.find('            <div className="gop-payment-history">')
if history_start < 0:
    raise SystemExit('payment history block start not found')
history_end = fe.find('\n          </div>\n        </>}\n      </div> : null}', history_start)
if history_end < 0:
    raise SystemExit('payment history block end not found')
new_history = '''            <div className="gop-payment-history-records">{paymentHistoryGroups.length ? paymentHistoryGroups.map(([group, rows]) => {\n              const paidRows = rows.filter((row) => String(row.status).toUpperCase() === "PAID");\n              const groupAmount = paidRows.reduce((sum, row) => sum + number(row.totalAmount), 0);\n              return <section className="gop-payment-history-group" key={group}>\n                <header className="gop-payment-history-group-head"><div><strong>{paymentHistoryGroup === "month" ? group : paymentHistoryGroup === "week" ? `${dateText(group)} haftası` : dateText(group)}</strong><span>{rows.length} ödeme kaydı · {paidRows.length} aktif</span></div><b>{money(groupAmount)}</b></header>\n                <div className="gop-payment-record-grid">{rows.map((row) => {\n                  const cancelled = String(row.status).toUpperCase() === "CANCELLED";\n                  const items = Array.isArray(row.items) ? row.items : [];\n                  return <article className={`gop-payment-record ${cancelled ? "cancelled" : "paid"}`} key={row.id}>\n                    <div className="gop-payment-record-top"><div><span className={`gop-badge ${cancelled ? "waiting" : "ok"}`}>{cancelled ? "İPTAL" : "✓ ÖDENDİ"}</span><strong>{row.paymentNo || "Ödeme kaydı"}</strong><small>{dateTimeText(row.paidAt || row.paidDate)}</small></div><div className="gop-payment-record-amount"><span>Ödenen Tutar</span><strong>{money(row.totalAmount)}</strong></div></div>\n                    <div className="gop-payment-record-person"><div><strong>{row.name || row.fullName || "Personel"}</strong><small>{row.personnelNo || "Kod yok"} · {row.qualification || "Vasıf yok"}</small></div><span>{cancelled ? "İptal edilmiş ödeme" : "Tamamlanmış ödeme"}</span></div>\n                    <div className="gop-payment-record-meta"><div><span>Hakediş Dönemi</span><strong>{dateText(row.periodStart)} — {dateText(row.periodEnd)}</strong></div><div><span>Vardiya</span><strong>G {number(row.dayCount)} · N {number(row.nightCount)} · Toplam {number(row.totalDays)}</strong></div><div><span>Ödeme Tarihi</span><strong>{dateText(row.paidDate || String(row.paidAt || "").slice(0,10))}</strong></div><div><span>İşlemi Yapan</span><strong>{row.paidByLabel || "KY ERP Kullanıcısı"}</strong></div></div>\n                    {cancelled ? <div className="gop-payment-cancel-note"><strong>Ödeme İptal Edildi</strong><span>{row.cancelReason || "İptal açıklaması girilmedi."}</span><small>{row.cancelledByLabel || "-"} · {dateTimeText(row.cancelledAt)}</small></div> : null}\n                    <details className="gop-payment-record-details"><summary>İşlem Detayı <span>{items.length || number(row.totalDays)} vardiya</span></summary><div className="gop-payment-item-list">{items.length ? items.map((item, index) => <div key={item.id || `${item.workDate}-${item.shift}-${index}`}><span><strong>{dateText(item.workDate)}</strong><small>{item.shift === "night" ? "Gece vardiyası" : "Gündüz vardiyası"}</small></span><b>{money(item.amount)}</b></div>) : <Empty>Vardiya detay kaydı bulunamadı.</Empty>}</div></details>\n                    <footer className="gop-payment-record-actions"><button type="button" onClick={() => printPaidPaymentReceipt(row)}><Printer size={14}/> Ödeme Fişi</button>{!cancelled ? <button type="button" disabled={busy} onClick={() => cancelPaymentRow(row)}><Trash2 size={14}/> Ödemeyi İptal Et</button> : <span>Geçmiş kayıt korunuyor</span>}</footer>\n                  </article>;\n                })}</div>\n              </section>;\n            }) : <Empty>Seçili ödeme tarihi aralığında kayıt yok.</Empty>}</div>'''
fe = fe[:history_start] + new_history + fe[history_end:]

# Refresh on Payments must refresh both independent sources.
replace_once(
    'view === "daily-payments" ? loadPayments() : loadEmployees()',
    'view === "daily-payments" ? Promise.all([loadPayments(), loadPaymentHistory()]) : loadEmployees()',
    'payments refresh action',
)

# Final invariants.
required = [
    'const [paymentPoolRange, setPaymentPoolRange]',
    'const [paymentHistoryRange, setPaymentHistoryRange]',
    'startDate: paymentHistoryRange.start',
    'startDate: paymentPoolRange.start',
    'gop-payment-history-records',
    'Hakediş Filtresi',
    'Ödeme Tarihi Filtresi',
]
for token in required:
    if token not in fe:
        raise SystemExit(f'missing invariant: {token}')
if 'getDailyPaymentHistory({ mainCompanyId: companyId, startDate: range.start' in fe:
    raise SystemExit('history still coupled to operational range')

css_marker = '/* PAYMENT-FILTER-ISOLATION-AND-HISTORY-2026-09-30 */'
css_block = r'''

/* PAYMENT-FILTER-ISOLATION-AND-HISTORY-2026-09-30 */
.payment-toolbar{display:grid!important;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:end}.gop-payment-filter-context{display:grid;gap:2px;min-width:165px}.gop-payment-filter-context strong{font-size:9px;color:#17324e}.gop-payment-filter-context span{font-size:8px;color:#6b7e93}.payment-toolbar .gop-preset-buttons{align-self:center}.payment-toolbar .gop-preset-buttons button:first-child{color:#28445f;border-color:#d6e0ec;background:#fff}.payment-toolbar .gop-preset-buttons button.active{background:#ecfdf5!important;border-color:#22c55e!important;color:#15803d!important;box-shadow:inset 0 0 0 1px rgba(34,197,94,.08)}.payment-range-controls{justify-self:end}
.gop-payment-history-records{display:grid;gap:12px}.gop-payment-history-group{border:1px solid #dfe7f0;border-radius:10px;overflow:hidden;background:#f8fafc}.gop-payment-history-group-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;background:#eef4fa;border-bottom:1px solid #dfe7f0}.gop-payment-history-group-head strong{display:block;font-size:11px;color:#17324e}.gop-payment-history-group-head span{display:block;margin-top:2px;font-size:8px;color:#64748b}.gop-payment-history-group-head>b{font-size:14px;color:#0f4c81}.gop-payment-record-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;padding:9px}.gop-payment-record{display:grid;gap:8px;border:1px solid #dbe5ef;border-radius:9px;background:#fff;padding:10px;box-shadow:0 1px 2px rgba(15,23,42,.04)}.gop-payment-record.paid{border-left:5px solid #16a34a}.gop-payment-record.cancelled{border-left:5px solid #dc2626;background:#fffafa}.gop-payment-record-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.gop-payment-record-top>div:first-child{display:grid;grid-template-columns:auto 1fr;gap:3px 6px;align-items:center}.gop-payment-record-top>div:first-child strong{font-size:10px;color:#17324e}.gop-payment-record-top>div:first-child small{grid-column:1/-1;font-size:7px;color:#7a899b}.gop-payment-record-amount{text-align:right}.gop-payment-record-amount span{display:block;font-size:7px;color:#6b7e93;font-weight:800}.gop-payment-record-amount strong{display:block;font-size:17px;line-height:1.15;color:#0f4c81;margin-top:2px}.gop-payment-record-person{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 8px;border-radius:7px;background:#f8fafc}.gop-payment-record-person strong,.gop-payment-record-person small{display:block}.gop-payment-record-person strong{font-size:10px;color:#17324e}.gop-payment-record-person small{font-size:7px;color:#6b7e93;margin-top:2px}.gop-payment-record-person>span{font-size:7px;font-weight:900;color:#64748b;white-space:nowrap}.gop-payment-record-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.gop-payment-record-meta>div{border:1px solid #e6edf4;border-radius:7px;padding:6px 7px}.gop-payment-record-meta span{display:block;font-size:7px;color:#74869a;font-weight:800}.gop-payment-record-meta strong{display:block;margin-top:2px;font-size:8px;color:#1e3a56}.gop-payment-cancel-note{display:grid;gap:2px;border:1px solid #fecaca;background:#fff1f2;border-radius:7px;padding:7px 8px;color:#991b1b}.gop-payment-cancel-note strong{font-size:8px}.gop-payment-cancel-note span,.gop-payment-cancel-note small{font-size:7px}.gop-payment-record-details{border-top:1px solid #edf2f7}.gop-payment-record-details summary{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 0 2px;cursor:pointer;font-size:8px;font-weight:900;color:#31506d}.gop-payment-record-details summary span{font-size:7px;color:#64748b}.gop-payment-item-list{display:grid;gap:4px;padding-top:5px}.gop-payment-item-list>div{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 7px;border-radius:6px;background:#f8fafc;border:1px solid #edf2f7}.gop-payment-item-list strong,.gop-payment-item-list small{display:block}.gop-payment-item-list strong{font-size:8px;color:#17324e}.gop-payment-item-list small{font-size:7px;color:#708095}.gop-payment-item-list b{font-size:9px;color:#0f4c81}.gop-payment-record-actions{display:flex;align-items:center;gap:6px;border-top:1px solid #edf2f7;padding-top:7px}.gop-payment-record-actions button{min-height:30px;border:1px solid #d5deeb;border-radius:7px;background:#fff;color:#24445f;padding:0 8px;display:inline-flex;align-items:center;gap:5px;font-size:8px;font-weight:900;cursor:pointer}.gop-payment-record-actions button:last-of-type{color:#b91c1c;border-color:#fecaca}.gop-payment-record-actions>span{margin-left:auto;font-size:7px;color:#7a899b;font-weight:800}
@media(max-width:1200px){.payment-toolbar{grid-template-columns:1fr}.payment-range-controls{justify-self:stretch}.gop-payment-record-grid{grid-template-columns:1fr}}@media(max-width:700px){.gop-payment-record-meta{grid-template-columns:1fr}.gop-payment-record-top,.gop-payment-record-person{align-items:flex-start;flex-direction:column}.gop-payment-record-amount{text-align:left}}
'''
if css_marker not in css:
    css += css_block

FE.write_text(fe, encoding='utf-8')
CSS.write_text(css, encoding='utf-8')
print('daily payment ranges isolated and payment history redesigned')
