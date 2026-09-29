from pathlib import Path
import re

p = Path('APP/app/ky-erp-frontend/src/pages/modules/ik/DailyHrWorkspace.jsx')
s = p.read_text(encoding='utf-8')

daily = r'''function printDailyPaymentSlips(range, rows = []) {
  const source = Array.isArray(rows) ? rows : [];
  const pages = [];
  for (let index = 0; index < source.length; index += 10) pages.push(source.slice(index, index + 10));
  const html = pages.map((pageRows, pageIndex) => `<section class="pay-page"><header><strong>GÜNLÜK PERSONEL ÖDEME FİŞLERİ</strong><span>${escapeHtml(dateText(range.start))} — ${escapeHtml(dateText(range.end))}</span><em>Sayfa ${pageIndex + 1} / ${pages.length}</em></header><div class="pay-grid">${pageRows.map((row, index) => {
    const dayCount = number(row.dayCount);
    const nightCount = number(row.nightCount);
    const dayRate = number(row.dayRate ?? row.dayWage);
    const nightRate = number(row.nightRate ?? row.nightWage);
    const dayTotal = number(row.dayTotal) || dayCount * dayRate;
    const nightTotal = number(row.nightTotal) || nightCount * nightRate;
    const total = number(row.totalAmount ?? row.total) || dayTotal + nightTotal;
    const no = pageIndex * 10 + index + 1;
    return `<article class="pay-card"><div class="pay-name"><b>${no}. ${escapeHtml(row.name || row.fullName || "-")}</b><span>${escapeHtml(row.qualification || row.role || "-")}</span></div><div class="pay-shifts"><div><strong>GÜNDÜZ</strong><span>${dayCount} gün</span><b>${escapeHtml(money(dayTotal))}</b></div><div><strong>GECE</strong><span>${nightCount} gün</span><b>${escapeHtml(money(nightTotal))}</b></div></div><div class="pay-total"><span>TOPLAM ÖDEME</span><strong>${escapeHtml(money(total))}</strong></div></article>`;
  }).join("")}</div></section>`).join("");
  return printHtmlDocument({
    title: "KY ERP Günlük Personel Ödeme Fişleri",
    html: `<main class="pay-print">${html || '<p>Kayıt yok.</p>'}</main>`,
    css: `@page{size:A4 portrait;margin:5mm}*{box-sizing:border-box}html,body{margin:0;padding:0;font-family:Arial,sans-serif;color:#000;background:#fff}.pay-print{width:200mm}.pay-page{width:200mm;height:287mm;page-break-after:always;break-after:page;overflow:hidden}.pay-page:last-child{page-break-after:auto;break-after:auto}.pay-page>header{height:13mm;border:1px solid #000;display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:6mm;padding:1.8mm 3mm;margin-bottom:3mm}.pay-page>header strong{font-size:12pt}.pay-page>header span,.pay-page>header em{font-size:7.5pt;font-style:normal;white-space:nowrap}.pay-grid{display:grid;grid-template-columns:repeat(2,1fr);grid-template-rows:repeat(5,50mm);gap:3mm 4mm}.pay-card{height:50mm;border:1px solid #000;padding:2.2mm 2.6mm;display:grid;grid-template-rows:auto 1fr auto;gap:1.4mm;break-inside:avoid;page-break-inside:avoid}.pay-name{display:flex;align-items:baseline;justify-content:space-between;gap:3mm;border-bottom:1px solid #000;padding-bottom:1.2mm}.pay-name b{font-size:10.5pt;text-transform:uppercase;line-height:1}.pay-name span{font-size:7.5pt;white-space:nowrap}.pay-shifts{border:1px solid #000}.pay-shifts>div{display:grid;grid-template-columns:1fr 18mm 31mm;align-items:center;min-height:8mm;padding:1mm 2mm}.pay-shifts>div+div{border-top:1px solid #000}.pay-shifts strong{font-size:8pt}.pay-shifts span{font-size:7.5pt;text-align:center}.pay-shifts b{font-size:9pt;text-align:right}.pay-total{display:flex;align-items:flex-end;justify-content:space-between;border-top:1.5px solid #000;padding-top:1.2mm}.pay-total span{font-size:8.5pt;font-weight:900}.pay-total strong{font-size:17pt;line-height:1;font-weight:900}@media print{body{-webkit-print-color-adjust:economy;print-color-adjust:economy}}`
  });
}
'''

weekly = r'''function printWeeklyControlList(range, days, rows = []) {
  const source = Array.isArray(rows) ? rows : [];
  const safeDays = Array.isArray(days) ? days : [];
  const pages = [];
  for (let index = 0; index < source.length; index += 35) pages.push(source.slice(index, index + 35));
  const headers = safeDays.map((date) => `<th class="date-col">${escapeHtml(dateText(date, true))}</th>`).join("");
  const html = pages.map((pageRows, pageIndex) => {
    const body = pageRows.map((row, index) => {
      const dayCells = safeDays.map((date) => {
        const cell = row.days?.[date] || {};
        return `<td class="work-cell"><span><b>G</b>${cell.day ? "✓" : "–"}</span><span><b>N</b>${cell.night ? "✓" : "–"}</span></td>`;
      }).join("");
      const dayCount = number(row.dayCount);
      const nightCount = number(row.nightCount);
      const total = number(row.totalAmount ?? row.total);
      const dayTotal = number(row.dayTotal);
      const nightTotal = number(row.nightTotal);
      return `<tr><td class="no">${pageIndex * 35 + index + 1}</td><td class="person"><strong>${escapeHtml(row.name || row.fullName || "-")}</strong><small>${escapeHtml(row.personnelNo || "")}</small></td><td class="role">${escapeHtml(row.qualification || row.role || "-")}</td>${dayCells}<td class="sum">${dayCount}<small>${dayTotal ? escapeHtml(money(dayTotal)) : ""}</small></td><td class="sum">${nightCount}<small>${nightTotal ? escapeHtml(money(nightTotal)) : ""}</small></td><td class="sum total">${dayCount + nightCount}<small>${escapeHtml(money(total))}</small></td></tr>`;
    }).join("");
    return `<section class="week-page"><header><div><strong>GÜNLÜK PERSONEL HAFTALIK KONTROL LİSTESİ</strong><span>${escapeHtml(dateText(range.start))} — ${escapeHtml(dateText(range.end))}</span></div><em>Sayfa ${pageIndex + 1} / ${pages.length}</em></header><table><thead><tr><th class="no">No</th><th class="person">Personel</th><th class="role">Vasıf</th>${headers}<th>Gündüz</th><th>Gece</th><th>Toplam</th></tr></thead><tbody>${body}</tbody></table></section>`;
  }).join("");
  return printHtmlDocument({
    title: "KY ERP Günlük Personel Haftalık Kontrol Listesi",
    html: `<main class="week-print">${html || '<p>Kayıt yok.</p>'}</main>`,
    css: `@page{size:A4 landscape;margin:5mm}*{box-sizing:border-box}html,body{margin:0;padding:0;font-family:Arial,sans-serif;color:#000;background:#fff}.week-print{width:287mm}.week-page{width:287mm;min-height:200mm;page-break-after:always;break-after:page}.week-page:last-child{page-break-after:auto;break-after:auto}.week-page>header{height:12mm;border:1px solid #000;display:flex;align-items:center;justify-content:space-between;padding:1.4mm 3mm;margin-bottom:2mm}.week-page>header div{display:flex;align-items:baseline;gap:5mm}.week-page>header strong{font-size:11.5pt}.week-page>header span,.week-page>header em{font-size:7pt;font-style:normal;white-space:nowrap}.week-page table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:6.4pt}.week-page th,.week-page td{border:1px solid #000;padding:.45mm .6mm;line-height:1.02;vertical-align:middle}.week-page th{font-weight:900;text-align:center;height:6mm}.week-page td{height:4.55mm}.week-page .no{width:8mm;text-align:center}.week-page .person{width:43mm;text-align:left}.week-page .person strong{display:block;font-size:6.5pt;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.week-page .person small{display:block;font-size:5.2pt;line-height:1;color:#000}.week-page .role{width:20mm;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.week-page .date-col{width:25mm}.work-cell{padding:.25mm!important;text-align:center}.work-cell>span{display:inline-flex;align-items:center;justify-content:center;gap:.6mm;width:50%;font-size:6.2pt;white-space:nowrap}.work-cell>span+span{border-left:1px solid #000}.work-cell b{font-size:5.4pt}.sum{width:20mm;text-align:center;font-weight:900}.sum small{display:block;font-size:5.2pt;font-weight:400;line-height:1}.sum.total{width:23mm}@media print{body{-webkit-print-color-adjust:economy;print-color-adjust:economy}}`
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

p.write_text(s, encoding='utf-8')
