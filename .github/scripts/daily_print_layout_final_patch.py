from pathlib import Path
import re

page = Path('APP/app/ky-erp-frontend/src/pages/modules/ik/DailyHrWorkspace.jsx')
css_file = Path('APP/app/ky-erp-frontend/src/pages/modules/ik/daily-hr-workspace-final.css')
s = page.read_text(encoding='utf-8')
css = css_file.read_text(encoding='utf-8')

# --- FINAL PRINT LAYOUTS ----------------------------------------------------
daily = r'''function printDailyPaymentSlips(range, rows = []) {
  const source = Array.isArray(rows) ? rows : [];
  const pages = [];
  for (let index = 0; index < source.length; index += 10) pages.push(source.slice(index, index + 10));
  const html = pages.map((pageRows, pageIndex) => `<section class="pay-page"><header><strong>GÜNLÜK PERSONEL ÖDEME FİŞLERİ</strong><span>${escapeHtml(dateText(range.start))} — ${escapeHtml(dateText(range.end))}</span><em>Sayfa ${pageIndex + 1} / ${pages.length}</em></header><div class="pay-grid">${pageRows.map((row, index) => {
    const dayCount = number(row.dayCount);
    const nightCount = number(row.nightCount);
    const items = Array.isArray(row.items) ? row.items : [];
    const dayRate = number(row.dayRate ?? row.dayWage);
    const nightRate = number(row.nightRate ?? row.nightWage);
    const dayItemTotal = items.filter((item) => String(item.shift || "").toLowerCase() === "day" && item.active !== false).reduce((sum, item) => sum + number(item.amount), 0);
    const nightItemTotal = items.filter((item) => String(item.shift || "").toLowerCase() === "night" && item.active !== false).reduce((sum, item) => sum + number(item.amount), 0);
    const dayTotal = number(row.dayTotal) || dayItemTotal || dayCount * dayRate;
    const nightTotal = number(row.nightTotal) || nightItemTotal || nightCount * nightRate;
    const total = number(row.totalAmount ?? row.total) || dayTotal + nightTotal;
    const no = pageIndex * 10 + index + 1;
    return `<article class="pay-card"><div class="pay-name"><b>${no}. ${escapeHtml(row.name || row.fullName || "-")}</b><span>${escapeHtml(row.qualification || row.role || "-")}</span></div><div class="pay-shifts"><div><strong>GÜNDÜZ</strong><span>${dayCount} GÜN</span><b>${escapeHtml(money(dayTotal))}</b></div><div><strong>GECE</strong><span>${nightCount} GÜN</span><b>${escapeHtml(money(nightTotal))}</b></div></div><div class="pay-total"><span>TOPLAM ÖDEME</span><strong>${escapeHtml(money(total))}</strong></div></article>`;
  }).join("")}</div></section>`).join("");
  return printHtmlDocument({
    title: "KY ERP Günlük Personel Ödeme Fişleri",
    html: `<main class="pay-print">${html || '<p>Kayıt yok.</p>'}</main>`,
    css: `@page{size:A4 portrait;margin:5mm}*{box-sizing:border-box}html,body{margin:0;padding:0;font-family:Arial,sans-serif;color:#000;background:#fff}.pay-print{width:200mm}.pay-page{width:200mm;height:287mm;page-break-after:always;break-after:page;overflow:hidden}.pay-page:last-child{page-break-after:auto;break-after:auto}.pay-page>header{height:11mm;border:1px solid #000;display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:5mm;padding:1.5mm 3mm;margin-bottom:2.5mm}.pay-page>header strong{font-size:11.5pt}.pay-page>header span,.pay-page>header em{font-size:7.5pt;font-style:normal;white-space:nowrap}.pay-grid{display:grid;grid-template-columns:repeat(2,1fr);grid-template-rows:repeat(5,51mm);gap:2.5mm 4mm}.pay-card{height:51mm;border:1px solid #000;padding:2.2mm 2.6mm;display:grid;grid-template-rows:auto 1fr auto;gap:1.2mm;break-inside:avoid;page-break-inside:avoid}.pay-name{display:flex;align-items:baseline;justify-content:space-between;gap:3mm;border-bottom:1px solid #000;padding-bottom:1mm}.pay-name b{font-size:10.5pt;text-transform:uppercase;line-height:1}.pay-name span{font-size:7.5pt;white-space:nowrap}.pay-shifts{border:1px solid #000}.pay-shifts>div{display:grid;grid-template-columns:1fr 18mm 34mm;align-items:center;min-height:8.5mm;padding:1mm 2mm}.pay-shifts>div+div{border-top:1px solid #000}.pay-shifts strong{font-size:8.5pt}.pay-shifts span{font-size:8pt;text-align:center;font-weight:700}.pay-shifts b{font-size:11.5pt;text-align:right;line-height:1}.pay-total{display:flex;align-items:flex-end;justify-content:space-between;border-top:1.5px solid #000;padding-top:1.3mm}.pay-total span{font-size:9pt;font-weight:900}.pay-total strong{font-size:18pt;line-height:1;font-weight:900}@media print{body{-webkit-print-color-adjust:economy;print-color-adjust:economy}}`
  });
}
'''

weekly = r'''function printWeeklyControlList(range, days, rows = []) {
  const source = Array.isArray(rows) ? rows : [];
  const safeDays = Array.isArray(days) ? days : [];
  const totals = source.reduce((sum, row) => ({
    day: sum.day + number(row.dayCount),
    night: sum.night + number(row.nightCount),
    dayAmount: sum.dayAmount + number(row.dayTotal),
    nightAmount: sum.nightAmount + number(row.nightTotal),
    amount: sum.amount + number(row.totalAmount ?? row.total),
  }), { day: 0, night: 0, dayAmount: 0, nightAmount: 0, amount: 0 });
  const pages = [];
  for (let index = 0; index < source.length; index += 35) pages.push(source.slice(index, index + 35));
  const headers = safeDays.map((date) => {
    const weekday = new Intl.DateTimeFormat("tr-TR", { weekday: "short" }).format(new Date(`${date}T12:00:00`)).replace('.', '').toLocaleUpperCase("tr-TR");
    return `<th class="date-col"><span>${escapeHtml(weekday)}</span><b>${escapeHtml(dateText(date, true))}</b></th>`;
  }).join("");
  const html = pages.map((pageRows, pageIndex) => {
    const body = pageRows.map((row, index) => {
      const dayCells = safeDays.map((date) => {
        const cell = row.days?.[date] || {};
        return `<td class="work-cell"><span><b>G</b>${cell.day ? "✓" : "–"}</span><span><b>N</b>${cell.night ? "✓" : "–"}</span></td>`;
      }).join("");
      return `<tr><td class="no">${pageIndex * 35 + index + 1}</td><td class="person"><strong>${escapeHtml(row.name || row.fullName || "-")}</strong><small>${escapeHtml(row.personnelNo || "")}</small></td><td class="role">${escapeHtml(row.qualification || row.role || "-")}</td>${dayCells}</tr>`;
    }).join("");
    return `<section class="week-page"><header><div><strong>GÜNLÜK PERSONEL HAFTALIK KONTROL LİSTESİ</strong><span>${escapeHtml(dateText(range.start))} — ${escapeHtml(dateText(range.end))}</span></div><em>Sayfa ${pageIndex + 1} / ${pages.length}</em></header><table><thead><tr><th class="no">No</th><th class="person">Personel</th><th class="role">Vasıf</th>${headers}</tr></thead><tbody>${body}</tbody></table><footer class="week-totals"><div><span>GÜNDÜZ</span><strong>${totals.day}</strong><small>${escapeHtml(money(totals.dayAmount))}</small></div><div><span>GECE</span><strong>${totals.night}</strong><small>${escapeHtml(money(totals.nightAmount))}</small></div><div class="grand"><span>GENEL TOPLAM</span><strong>${totals.day + totals.night}</strong><small>${escapeHtml(money(totals.amount))}</small></div></footer></section>`;
  }).join("");
  return printHtmlDocument({
    title: "KY ERP Günlük Personel Haftalık Kontrol Listesi",
    html: `<main class="week-print">${html || '<p>Kayıt yok.</p>'}</main>`,
    css: `@page{size:A4 portrait;margin:5mm}*{box-sizing:border-box}html,body{margin:0;padding:0;font-family:Arial,sans-serif;color:#000;background:#fff}.week-print{width:200mm}.week-page{width:200mm;height:287mm;display:flex;flex-direction:column;page-break-after:always;break-after:page;overflow:hidden}.week-page:last-child{page-break-after:auto;break-after:auto}.week-page>header{height:11mm;border:1px solid #000;display:flex;align-items:center;justify-content:space-between;padding:1.4mm 2.5mm;margin-bottom:2mm}.week-page>header div{display:flex;align-items:baseline;gap:4mm}.week-page>header strong{font-size:10.5pt}.week-page>header span,.week-page>header em{font-size:6.8pt;font-style:normal;white-space:nowrap}.week-page table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:6.2pt}.week-page th,.week-page td{border:1px solid #000;padding:.4mm .5mm;line-height:1;vertical-align:middle}.week-page th{font-weight:900;text-align:center;height:8mm}.week-page td{height:5.25mm}.week-page .no{width:7mm;text-align:center}.week-page .person{width:44mm;text-align:left}.week-page .person strong{display:block;font-size:6.4pt;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.week-page .person small{display:block;font-size:5.1pt;line-height:1;color:#000}.week-page .role{width:23mm;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.week-page .date-col{width:auto}.week-page .date-col span,.week-page .date-col b{display:block}.week-page .date-col span{font-size:6pt}.week-page .date-col b{font-size:6.5pt;margin-top:.6mm}.work-cell{padding:.2mm!important;text-align:center}.work-cell>span{display:inline-flex;align-items:center;justify-content:center;gap:.5mm;width:50%;font-size:6.4pt;white-space:nowrap}.work-cell>span+span{border-left:1px solid #000}.work-cell b{font-size:5.4pt}.week-totals{margin-top:auto;display:grid;grid-template-columns:1fr 1fr 1.25fr;gap:2mm;padding-top:2.5mm}.week-totals>div{border:1.5px solid #000;min-height:18mm;padding:2mm 2.5mm;display:grid;grid-template-columns:auto 1fr;grid-template-rows:auto auto;align-items:end}.week-totals span{font-size:8pt;font-weight:900}.week-totals strong{grid-row:1/3;grid-column:2;text-align:right;font-size:19pt;line-height:1}.week-totals small{font-size:8.5pt;font-weight:900;margin-top:1mm}.week-totals .grand{border-width:2px}.week-totals .grand strong{font-size:21pt}@media print{body{-webkit-print-color-adjust:economy;print-color-adjust:economy}}`
  });
}
'''

pat_daily = r'function printDailyPaymentSlips\(range, rows = \[\]\) \{.*?\n\}\nfunction printWeeklyControlList'
s, n1 = re.subn(pat_daily, daily + 'function printWeeklyControlList', s, count=1, flags=re.S)
if n1 != 1:
    raise SystemExit(f'daily print function replace failed: {n1}')
pat_weekly = r'function printWeeklyControlList\(range, days, rows = \[\]\) \{.*?\n\}\nfunction actionLabel'
s, n2 = re.subn(pat_weekly, weekly + 'function actionLabel', s, count=1, flags=re.S)
if n2 != 1:
    raise SystemExit(f'weekly print function replace failed: {n2}')

# Weekly control rows retain split day/night money totals for the large bottom summary.
s = s.replace('dayCount: 0, nightCount: 0, totalAmount: 0 }', 'dayCount: 0, nightCount: 0, dayTotal: 0, nightTotal: 0, totalAmount: 0 }', 1)
s = s.replace('if (day) { current.dayCount += 1; current.totalAmount += number(row.dayWage ?? row.dayRate ?? person.dayRate); }', 'if (day) { const amount = number(row.dayWage ?? row.dayRate ?? person.dayRate); current.dayCount += 1; current.dayTotal += amount; current.totalAmount += amount; }', 1)
s = s.replace('if (night) { current.nightCount += 1; current.totalAmount += number(row.nightWage ?? row.nightRate ?? person.nightRate); }', 'if (night) { const amount = number(row.nightWage ?? row.nightRate ?? person.nightRate); current.nightCount += 1; current.nightTotal += amount; current.totalAmount += amount; }', 1)

# --- PERSISTENT DIALOG SIZES ------------------------------------------------
if 'const DIALOG_SIZE_KEY' not in s:
    marker = 'const RANGE_KEY = "kyerp.dailyOperations.range.v5";\n'
    addon = '''const DIALOG_SIZE_KEY = "kyerp.dailyOperations.dialogSizes.v1";
const DEFAULT_DIALOG_SIZES = {
  quick: { w: 1180, h: 700 },
  person: { w: 560, h: 430 },
  log: { w: 1120, h: 700 },
  excel: { w: 940, h: 650 },
};
function readDialogSizes() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(DIALOG_SIZE_KEY) || "null") || {};
    return Object.fromEntries(Object.entries(DEFAULT_DIALOG_SIZES).map(([key, value]) => [key, { ...value, ...(saved[key] || {}) }]));
  } catch { return DEFAULT_DIALOG_SIZES; }
}
function writeDialogSizes(value) { try { window.localStorage.setItem(DIALOG_SIZE_KEY, JSON.stringify(value)); } catch { /* optional storage */ } }
function dialogBoxStyle(size) { return { width: `${size?.w || 760}px`, height: `${size?.h || 600}px`, maxWidth: "calc(100vw - 28px)", maxHeight: "calc(100dvh - 28px)" }; }
function DialogSizer({ kind, size, onResize }) {
  return <div className="dialog-sizer" title="Pencere ölçüsü tarayıcıda hatırlanır"><span>En</span><input type="number" min="420" max="1600" value={size?.w || ""} onChange={(e) => onResize(kind, "w", e.target.value)}/><span>Boy</span><input type="number" min="260" max="1000" value={size?.h || ""} onChange={(e) => onResize(kind, "h", e.target.value)}/></div>;
}
'''
    if marker not in s:
        raise SystemExit('RANGE_KEY anchor missing')
    s = s.replace(marker, marker + addon, 1)

if 'const [dialogSizes, setDialogSizes]' not in s:
    marker = '  const [error, setError] = useState("");\n'
    if marker not in s:
        raise SystemExit('error state anchor missing')
    s = s.replace(marker, marker + '  const [dialogSizes, setDialogSizes] = useState(readDialogSizes);\n', 1)

if 'const resizeDialog = useCallback' not in s:
    marker = '  const days = useMemo(() => rangeDays(range.start, range.end), [range.end, range.start]);\n'
    addon = '''  const resizeDialog = useCallback((kind, field, raw) => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    setDialogSizes((current) => {
      const base = current[kind] || DEFAULT_DIALOG_SIZES[kind] || { w: 760, h: 600 };
      const value = field === "w" ? Math.max(420, Math.min(1600, parsed)) : Math.max(260, Math.min(1000, parsed));
      const next = { ...current, [kind]: { ...base, [field]: value } };
      writeDialogSizes(next);
      return next;
    });
  }, []);
'''
    if marker not in s:
        raise SystemExit('days anchor missing')
    s = s.replace(marker, marker + addon, 1)

# Save in Quick Entry keeps the modal open; only Save + Next advances the day.
s = s.replace('if (goNext && nextDate && nextDate <= range.end) await loadQuickFocus(nextDate, snapshot.shift, snapshot.query);\n      else setQuick(null);', 'if (goNext && nextDate && nextDate <= range.end) await loadQuickFocus(nextDate, snapshot.shift, snapshot.query);\n      else await loadQuickFocus(snapshot.date, snapshot.shift, snapshot.query);', 1)

# Quick shift identity is obvious without painting the whole screen.
s = s.replace('<section className="gop-dialog gop-quick-dialog">', '<section className={`gop-dialog gop-quick-dialog shift-${quick.shift}`} style={dialogBoxStyle(dialogSizes.quick)}>', 1)
s = s.replace('<h2>{longDateText(quick.date)} · {quick.shift === "day" ? "Gündüz" : "Gece"}</h2><p>', '<div className="quick-title-line"><h2>{longDateText(quick.date)} · {quick.shift === "day" ? "Gündüz" : "Gece"}</h2><span className={`quick-shift-badge ${quick.shift}`}>{quick.shift === "day" ? "GÜNDÜZ" : "GECE"}</span></div><p>', 1)
s = s.replace('<span className="quick-avatar">G</span>', '<span className="quick-avatar">{quick.shift === "day" ? "G" : "N"}</span>', 1)
s = s.replace('<footer className="quick-footer"><div>', '<footer className="quick-footer"><DialogSizer kind="quick" size={dialogSizes.quick} onResize={resizeDialog}/><div>', 1)

# Compact person card and persistent size controls for every daily modal.
s = s.replace('<section className="gop-dialog"><header><div><span>GÜNLÜK OPERASYON</span><h2>{cardDialog.id ? "Personel Kartını Düzenle" : "Yeni Personel"}</h2>', '<section className="gop-dialog gop-person-dialog" style={dialogBoxStyle(dialogSizes.person)}><header><div><span>GÜNLÜK OPERASYON</span><h2>{cardDialog.id ? "Personel Kartını Düzenle" : "Yeni Personel"}</h2>', 1)
s = s.replace('</div><footer><button type="button" onClick={() => { setCardDialog(null); setCardAddToRoster(false); }}>Vazgeç</button>', '</div><footer><DialogSizer kind="person" size={dialogSizes.person} onResize={resizeDialog}/><button type="button" onClick={() => { setCardDialog(null); setCardAddToRoster(false); }}>Vazgeç</button>', 1)
s = s.replace('<section className="gop-dialog gop-dialog-wide"><header><div><span>EXCEL KONTROL</span>', '<section className="gop-dialog gop-dialog-wide" style={dialogBoxStyle(dialogSizes.excel)}><header><div><span>EXCEL KONTROL</span>', 1)
s = s.replace('</div><footer><button type="button" onClick={() => setExcelPreview(null)}>Vazgeç</button>', '</div><footer><DialogSizer kind="excel" size={dialogSizes.excel} onResize={resizeDialog}/><button type="button" onClick={() => setExcelPreview(null)}>Vazgeç</button>', 1)
s = s.replace('<section className="gop-dialog gop-log-dialog"><header>', '<section className="gop-dialog gop-log-dialog" style={dialogBoxStyle(dialogSizes.log)}><header>', 1)
log_tail = ': <Empty>Personel seçin veya HKN / isim yazarak arayın.</Empty>}</div> : null}</section></div> : null}'
if log_tail in s and 'kind="log"' not in s:
    s = s.replace(log_tail, ': <Empty>Personel seçin veya HKN / isim yazarak arayın.</Empty>}</div> : null}<DialogSizer kind="log" size={dialogSizes.log} onResize={resizeDialog}/></section></div> : null}', 1)

page.write_text(s, encoding='utf-8')

# --- VISUAL CONSOLIDATION ---------------------------------------------------
marker = '/* FINAL-UX-CONSOLIDATION-2026-09-29 */'
if marker not in css:
    css += r'''

/* FINAL-UX-CONSOLIDATION-2026-09-29 */
/* One strong shift identity: button + thin stripe + compact badge only. */
.kyop-daily.day .kyop-titlebar,.kyop-daily.day .kyop-entry{border-left:6px solid #f97316}
.kyop-daily.night .kyop-titlebar,.kyop-daily.night .kyop-entry{border-left:6px solid #3730a3}
.gop-quick-dialog{position:relative}
.gop-quick-dialog.shift-day{border-left:7px solid #f97316;box-shadow:0 24px 72px rgba(15,23,42,.28),inset 0 0 0 1px rgba(249,115,22,.12)}
.gop-quick-dialog.shift-night{border-left:7px solid #3730a3;box-shadow:0 24px 72px rgba(15,23,42,.28),inset 0 0 0 1px rgba(55,48,163,.12)}
.quick-title-line{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.quick-title-line h2{margin:2px 0 0}
.quick-shift-badge{display:inline-flex!important;align-items:center;justify-content:center;min-width:64px;height:22px;border-radius:5px;color:#fff!important;font-size:8px!important;font-weight:950!important;letter-spacing:.05em!important}
.quick-shift-badge.day{background:#f97316}.quick-shift-badge.night{background:#3730a3}
.gop-shift-switch button.active.day{background:#f97316!important;border-color:#f97316!important;color:#fff!important}
.gop-shift-switch button.active.night{background:#3730a3!important;border-color:#3730a3!important;color:#fff!important}
.gop-quick-dialog.shift-day .quick-warning{border-left:5px solid #f97316}.gop-quick-dialog.shift-night .quick-warning{border-left:5px solid #3730a3}
.gop-quick-dialog.shift-day .quick-avatar{background:#f97316!important}.gop-quick-dialog.shift-night .quick-avatar{background:#3730a3!important}
.gop-quick-dialog.shift-day .quick-footer button.primary:not(.soft){background:#f97316!important;border-color:#f97316!important}.gop-quick-dialog.shift-night .quick-footer button.primary:not(.soft){background:#3730a3!important;border-color:#3730a3!important}

/* New/Edit Person is intentionally compact; the user can keep a custom size. */
.gop-person-dialog{min-width:420px;overflow:auto}.gop-person-dialog .gop-form-grid{gap:7px;padding:10px 12px}.gop-person-dialog .gop-form-grid input{height:31px}.gop-person-dialog .gop-form-grid textarea{min-height:54px;max-height:90px}.gop-person-dialog header{padding:9px 12px}.gop-person-dialog footer{padding:8px 10px}

/* Persistent width / height controls at the lower left of Daily Operations dialogs. */
.dialog-sizer{display:inline-flex;align-items:center;gap:4px;border:1px solid #d5deeb;border-radius:7px;background:#f8fafc;padding:3px 5px;color:#60748c;font-size:7px;font-weight:900;white-space:nowrap}.dialog-sizer input{width:52px!important;height:24px!important;border:1px solid #d5deeb!important;border-radius:5px!important;background:#fff!important;padding:0 4px!important;font-size:8px!important;color:#17324e!important}.gop-dialog>footer .dialog-sizer{margin-right:auto}.quick-footer>.dialog-sizer{margin-right:7px!important}.quick-footer>div:not(.dialog-sizer){margin-right:auto}.gop-log-dialog>.dialog-sizer{position:sticky;left:10px;bottom:8px;width:max-content;z-index:12;margin:8px 10px;background:#fff;box-shadow:0 2px 8px rgba(15,23,42,.08)}
@media(max-width:650px){.dialog-sizer{display:none}.gop-person-dialog{min-width:0}.gop-quick-dialog{border-left-width:5px}}
'''
css_file.write_text(css, encoding='utf-8')
