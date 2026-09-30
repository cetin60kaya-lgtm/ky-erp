from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TARGET = ROOT / "APP/app/ky-erp-frontend/src/pages/modules/ik/DailyHrWorkspace.jsx"

text = TARGET.read_text(encoding="utf-8")
start = text.index("function printWeeklyControlList(")
end = text.index("\nfunction actionLabel", start)

new_function = r'''function printWeeklyControlList(range, days, rows = []) {
  const source = Array.isArray(rows) ? rows : [];
  const fallbackDays = Array.isArray(days) ? days.slice(0, 7) : [];
  const safeDays = range?.start
    ? Array.from({ length: 7 }, (_, index) => addDays(range.start, index))
    : fallbackDays;
  const printStart = safeDays[0] || range.start;
  const printEnd = safeDays[safeDays.length - 1] || range.end;
  const totals = source.reduce((sum, row) => ({
    people: sum.people + 1,
    days: sum.days + number(row.dayCount) + number(row.nightCount),
    amount: sum.amount + number(row.totalAmount ?? row.total),
  }), { people: 0, days: 0, amount: 0 });
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
        const dayOn = Boolean(cell.day);
        const nightOn = Boolean(cell.night);
        return `<td class="work-cell"><span><b>G</b><i class="${dayOn ? "check day-on" : "off"}">${dayOn ? "✓" : "–"}</i></span><span><b>N</b><i class="${nightOn ? "check night-on" : "off"}">${nightOn ? "✓" : "–"}</i></span></td>`;
      }).join("");
      const totalDays = number(row.dayCount) + number(row.nightCount);
      const totalAmount = number(row.totalAmount ?? row.total);
      return `<tr><td class="no">${pageIndex * 35 + index + 1}</td><td class="person"><strong>${escapeHtml(row.name || row.fullName || "-")}</strong><small>${escapeHtml(row.personnelNo || "")}</small></td><td class="role">${escapeHtml(row.qualification || row.role || "-")}</td>${dayCells}<td class="total-days"><strong>${totalDays}</strong></td><td class="total-money"><strong>${escapeHtml(money(totalAmount))}</strong></td></tr>`;
    }).join("");
    return `<section class="week-page"><header><div><strong>GÜNLÜK PERSONEL HAFTALIK KONTROL LİSTESİ</strong><span>${escapeHtml(dateText(printStart))} — ${escapeHtml(dateText(printEnd))}</span></div><em>Sayfa ${pageIndex + 1} / ${pages.length}</em></header><table><thead><tr><th class="no">No</th><th class="person">Personel</th><th class="role">Vasıf</th>${headers}<th class="total-days">Toplam<br/>Gün</th><th class="total-money">Toplam Tutar</th></tr></thead><tbody>${body}</tbody></table><footer class="week-totals"><div><span>TOPLAM PERSONEL</span><strong>${totals.people}</strong></div><div><span>TOPLAM GÜN</span><strong>${totals.days}</strong></div><div class="grand"><span>GENEL TUTAR</span><strong>${escapeHtml(money(totals.amount))}</strong></div></footer></section>`;
  }).join("");
  return printHtmlDocument({
    title: "KY ERP Günlük Personel Haftalık Kontrol Listesi",
    html: `<main class="week-print">${html || '<p>Kayıt yok.</p>'}</main>`,
    css: `@page{size:A4 portrait;margin:4.5mm}*{box-sizing:border-box}html,body{margin:0;padding:0;font-family:Arial,sans-serif;color:#000;background:#fff}.week-print{width:201mm}.week-page{width:201mm;height:288mm;display:flex;flex-direction:column;page-break-after:always;break-after:page;overflow:hidden}.week-page:last-child{page-break-after:auto;break-after:auto}.week-page>header{height:10mm;border:1px solid #000;display:flex;align-items:center;justify-content:space-between;padding:1.2mm 2mm;margin-bottom:1.6mm}.week-page>header div{display:flex;align-items:baseline;gap:3mm}.week-page>header strong{font-size:10pt}.week-page>header span,.week-page>header em{font-size:6.6pt;font-style:normal;white-space:nowrap}.week-page table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:5.9pt}.week-page th,.week-page td{border:1px solid #000;padding:.32mm .38mm;line-height:1;vertical-align:middle}.week-page th{font-weight:900;text-align:center;height:8mm}.week-page td{height:5.15mm}.week-page .no{width:5.5mm;text-align:center}.week-page .person{width:34mm;text-align:left}.week-page .person strong{display:block;font-size:6pt;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.week-page .person small{display:block;font-size:4.9pt;line-height:1;color:#000}.week-page .role{width:17mm;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.week-page .date-col{width:13.2mm}.week-page .date-col span,.week-page .date-col b{display:block}.week-page .date-col span{font-size:5.5pt}.week-page .date-col b{font-size:5.9pt;margin-top:.5mm}.work-cell{padding:.12mm!important;text-align:center}.work-cell>span{display:inline-flex;align-items:center;justify-content:center;gap:.28mm;width:50%;font-size:6.4pt;font-weight:900;white-space:nowrap}.work-cell>span+span{border-left:1px solid #000}.work-cell b{font-size:6.3pt;font-weight:900;color:#000}.work-cell i{font-style:normal;font-size:7.8pt;font-weight:900;line-height:.9}.work-cell i.off{color:#777;font-size:6.5pt}.work-cell i.day-on{color:#ea580c}.work-cell i.night-on{color:#4338ca}.week-page .total-days{width:11.5mm;text-align:center}.week-page td.total-days strong{font-size:7.5pt}.week-page .total-money{width:26mm;text-align:right}.week-page th.total-money{text-align:center}.week-page td.total-money strong{font-size:7.2pt;white-space:nowrap}.week-totals{margin-top:auto;display:grid;grid-template-columns:1fr 1fr 1.45fr;gap:2mm;padding-top:2mm}.week-totals>div{border:1.5px solid #000;min-height:15mm;padding:1.8mm 2.3mm;display:flex;align-items:center;justify-content:space-between}.week-totals span{font-size:7.5pt;font-weight:900}.week-totals strong{font-size:17pt;line-height:1;font-weight:900}.week-totals .grand{border-width:2px}.week-totals .grand strong{font-size:15pt}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`
  });
}'''

TARGET.write_text(text[:start] + new_function + text[end:], encoding="utf-8")
print("weekly print final patch applied")
