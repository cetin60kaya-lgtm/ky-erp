from pathlib import Path

p = Path('APP/app/ky-erp-frontend/src/pages/modules/ik/DailyHrWorkspace.jsx')
s = p.read_text(encoding='utf-8')

insert_before = 'function actionLabel(row = {}) {'
weekly_fn = r'''function printWeeklyControlList(range, days, rows = []) {
  const source = Array.isArray(rows) ? rows : [];
  const safeDays = Array.isArray(days) ? days : [];
  const dayHeaders = safeDays.map((date) => `<th>${escapeHtml(dateText(date, true))} G</th>`).join("");
  const nightHeaders = safeDays.map((date) => `<th>${escapeHtml(dateText(date, true))} N</th>`).join("");
  const body = source.map((row, index) => {
    const dayCells = safeDays.map((date) => `<td class="mark">${row.days?.[date]?.day ? "✓" : ""}</td>`).join("");
    const nightCells = safeDays.map((date) => `<td class="mark">${row.days?.[date]?.night ? "✓" : ""}</td>`).join("");
    return `<tr><td>${index + 1}</td><td><strong>${escapeHtml(row.name || row.fullName || "-")}</strong><small>${escapeHtml(row.personnelNo || "")}</small></td><td>${escapeHtml(row.qualification || row.role || "-")}</td>${dayCells}${nightCells}<td>${number(row.dayCount)}</td><td>${number(row.nightCount)}</td><td>${number(row.dayCount) + number(row.nightCount)}</td><td class="money">${escapeHtml(money(row.totalAmount ?? row.total))}</td></tr>`;
  }).join("");
  return printHtmlDocument({
    title: "KY ERP Günlük Personel Haftalık Kontrol Listesi",
    html: `<main><h1>GÜNLÜK PERSONEL HAFTALIK KONTROL LİSTESİ</h1><p>${escapeHtml(dateText(range.start))} — ${escapeHtml(dateText(range.end))}</p><table><thead><tr><th>#</th><th>Personel</th><th>Vasıf</th>${dayHeaders}${nightHeaders}<th>Gündüz</th><th>Gece</th><th>Toplam</th><th>Tutar</th></tr></thead><tbody>${body}</tbody></table></main>`,
    css: `@page{size:A4 landscape;margin:6mm}body{font:8.5px Arial,sans-serif;color:#111;margin:0}h1{text-align:center;font-size:14px;margin:0 0 2mm}p{text-align:center;margin:0 0 3mm;color:#444;font-weight:700}table{width:100%;border-collapse:collapse}th,td{border:1px solid #111;padding:2.2px 3px;text-align:left;white-space:nowrap}th{background:#eef4fb;font-size:7.5px}td strong,td small{display:block}td small{font-size:7px;color:#555}.mark{text-align:center;font-size:11px;font-weight:900}.money{font-weight:900}`,
  });
}
'''
if 'function printWeeklyControlList' not in s:
    if insert_before not in s:
        raise SystemExit('actionLabel anchor missing')
    s = s.replace(insert_before, weekly_fn + insert_before, 1)

state_anchor = '  const [paymentRows, setPaymentRows] = useState([]);\n'
if 'paymentSelectedIds' not in s:
    if state_anchor not in s:
        raise SystemExit('paymentRows state anchor missing')
    s = s.replace(state_anchor, state_anchor + '  const [paymentSelectedIds, setPaymentSelectedIds] = useState(() => new Set());\n', 1)

weekly_anchor = '  const selectedRoleCounts = useMemo(() => groupedEntryPeople.map(([role, people]) => ({ role, count: people.filter((person) => selectedIds.has(person.id)).length })).filter((row) => row.count > 0), [groupedEntryPeople, selectedIds]);\n'
weekly_logic = r'''  const weeklyControlRows = useMemo(() => {
    const map = new Map();
    attendance.forEach((row) => {
      const date = rowDate(row);
      if (!date || date < range.start || date > range.end) return;
      const employeeId = rowEmployeeId(row);
      if (!employeeId) return;
      const person = employeeMap.get(employeeId) || {};
      const current = map.get(employeeId) || { employeeId, name: person.name || row.name || row.fullName || "Personel", personnelNo: person.personnelNo || row.personnelNo || "", role: person.role || row.qualification || row.role || "-", days: {}, dayCount: 0, nightCount: 0, totalAmount: 0 };
      const day = rowDay(row);
      const night = rowNight(row);
      current.days[date] = { day, night };
      if (day) { current.dayCount += 1; current.totalAmount += number(row.dayWage ?? row.dayRate ?? person.dayRate); }
      if (night) { current.nightCount += 1; current.totalAmount += number(row.nightWage ?? row.nightRate ?? person.nightRate); }
      map.set(employeeId, current);
    });
    return [...map.values()].sort((a, b) => String(a.name).localeCompare(String(b.name), "tr"));
  }, [attendance, employeeMap, range.end, range.start]);
  const selectedPaymentRows = useMemo(() => paymentRows.filter((row) => paymentSelectedIds.has(String(row.employeeId || row.id || row.personnelNo || row.name || row.fullName || ""))), [paymentRows, paymentSelectedIds]);
  useEffect(() => {
    const valid = new Set(paymentRows.map((row) => String(row.employeeId || row.id || row.personnelNo || row.name || row.fullName || "")));
    setPaymentSelectedIds((current) => {
      const next = new Set([...current].filter((id) => valid.has(id)));
      return sameSet(current, next) ? current : next;
    });
  }, [paymentRows]);
'''
if 'const weeklyControlRows = useMemo' not in s:
    if weekly_anchor not in s:
        raise SystemExit('selectedRoleCounts anchor missing')
    s = s.replace(weekly_anchor, weekly_anchor + weekly_logic, 1)

old_weekly = r'''      {view === "daily-weekly" ? <><div className="gop-toolbar-card">{rangeControls}</div><div className="gop-stat-grid three"><Stat label="Çalışan" value={summaryRows.length}/><Stat label="Vardiya toplamı" value={summaryRows.reduce((s, r) => s + number(r.dayCount) + number(r.nightCount), 0)}/><Stat label="Dönem toplamı" value={money(summaryRows.reduce((s, r) => s + number(r.totalAmount ?? r.total), 0))}/></div><div className="gop-card"><div className="gop-card-head"><div><h2>Haftalık Özet</h2><span>Sunucu kayıtlarından hesaplanan dönem özeti.</span></div><button type="button" onClick={() => printRows("KY ERP Günlük Personel Haftalık Özeti", range, summaryRows)}><Printer size={16}/> Yazdır</button></div><div className="gop-table-wrap"><table><thead><tr><th>Personel</th><th>Vasıf</th><th>Gündüz</th><th>Gece</th><th>Toplam</th></tr></thead><tbody>{summaryRows.length ? summaryRows.map((row) => <tr key={row.employeeId || row.id}><td><strong>{row.name || row.fullName}</strong></td><td>{row.qualification || row.role || "-"}</td><td>{number(row.dayCount)}</td><td>{number(row.nightCount)}</td><td><strong>{money(row.totalAmount ?? row.total)}</strong></td></tr>) : <tr><td colSpan="5"><Empty>Seçili dönemde çalışma kaydı yok.</Empty></td></tr>}</tbody></table></div></div></> : null}'''
new_weekly = r'''      {view === "daily-weekly" ? <><div className="gop-toolbar-card">{rangeControls}</div><div className="gop-stat-grid three"><Stat label="Çalışan" value={summaryRows.length}/><Stat label="Vardiya toplamı" value={summaryRows.reduce((s, r) => s + number(r.dayCount) + number(r.nightCount), 0)}/><Stat label="Dönem toplamı" value={money(summaryRows.reduce((s, r) => s + number(r.totalAmount ?? r.total), 0))}/></div><div className="gop-card"><div className="gop-card-head"><div><h2>Haftalık Özet</h2><span>Sunucu kayıtlarından hesaplanan dönem özeti ve eski haftalık kontrol listesi.</span></div><div className="gop-print-actions"><button type="button" onClick={() => printWeeklyControlList(range, days, weeklyControlRows)}><Printer size={16}/> Haftalık Kontrol Listesi</button><button type="button" onClick={() => printRows("KY ERP Günlük Personel Haftalık Özeti", range, summaryRows)}><Printer size={16}/> Özet Yazdır</button></div></div><div className="gop-table-wrap"><table><thead><tr><th>Personel</th><th>Vasıf</th><th>Gündüz</th><th>Gece</th><th>Toplam</th></tr></thead><tbody>{summaryRows.length ? summaryRows.map((row) => <tr key={row.employeeId || row.id}><td><strong>{row.name || row.fullName}</strong></td><td>{row.qualification || row.role || "-"}</td><td>{number(row.dayCount)}</td><td>{number(row.nightCount)}</td><td><strong>{money(row.totalAmount ?? row.total)}</strong></td></tr>) : <tr><td colSpan="5"><Empty>Seçili dönemde çalışma kaydı yok.</Empty></td></tr>}</tbody></table></div></div></> : null}'''
if old_weekly in s:
    s = s.replace(old_weekly, new_weekly, 1)
elif 'Haftalık Kontrol Listesi' not in s:
    raise SystemExit('weekly JSX anchor missing')

old_payments = r'''      {view === "daily-payments" ? <><div className="gop-toolbar-card">{rangeControls}</div><div className="gop-stat-grid three"><Stat label="Ödeme fişi" value={paymentRows.length}/><Stat label="Ödendi" value={paymentRows.filter((r) => rowPaid(r) || (number(r.totalAmount ?? r.total) > 0 && number(r.paidAmount) >= number(r.totalAmount ?? r.total))).length}/><Stat label="Dönem toplamı" value={money(paymentRows.reduce((s, r) => s + number(r.totalAmount ?? r.total), 0))}/></div><div className="gop-card"><div className="gop-card-head"><div><h2>Ödeme Fişleri</h2><span>Ödendi işlemi gerçek günlük kaydına yazılır.</span></div><button type="button" onClick={() => printDailyPaymentSlips(range, paymentRows)}><Printer size={16}/> Yazdır</button></div><div className="gop-payment-grid">{paymentRows.length ? paymentRows.map((row) => { const total = number(row.totalAmount ?? row.total); const paid = rowPaid(row) || (total > 0 && number(row.paidAmount) >= total); return <article key={row.employeeId || row.id} className={`gop-payment-card ${paid ? "paid" : ""}`}><div><UserRound size={18}/><span><strong>{row.name || row.fullName}</strong><small>{row.qualification || row.role || "-"}</small></span></div><dl><div><dt>Gündüz</dt><dd>{number(row.dayCount)}</dd></div><div><dt>Gece</dt><dd>{number(row.nightCount)}</dd></div><div><dt>Ödenecek</dt><dd>{money(total)}</dd></div></dl><footer><span className={`gop-badge ${paid ? "ok" : "waiting"}`}>{paid ? "Ödendi" : "Ödeme Bekliyor"}</span>{!paid ? <button type="button" className="primary" disabled={busy} onClick={() => payRow(row)}><WalletCards size={15}/> Ödendi İşaretle</button> : null}</footer></article>; }) : <Empty>Seçili dönemde ödeme fişi oluşacak kayıt yok.</Empty>}</div></div></> : null}'''
new_payments = r'''      {view === "daily-payments" ? <><div className="gop-toolbar-card">{rangeControls}</div><div className="gop-stat-grid three"><Stat label="Ödeme fişi" value={paymentRows.length}/><Stat label="Ödendi" value={paymentRows.filter((r) => rowPaid(r) || (number(r.totalAmount ?? r.total) > 0 && number(r.paidAmount) >= number(r.totalAmount ?? r.total))).length}/><Stat label="Dönem toplamı" value={money(paymentRows.reduce((s, r) => s + number(r.totalAmount ?? r.total), 0))}/></div><div className="gop-card"><div className="gop-card-head"><div><h2>Ödeme Fişleri</h2><span>{paymentSelectedIds.size ? `${paymentSelectedIds.size} kişi seçili.` : "Yazdırılacak kişileri kartlardan seçebilirsiniz."}</span></div><div className="gop-print-actions"><button type="button" className="primary" disabled={!selectedPaymentRows.length} onClick={() => printDailyPaymentSlips(range, selectedPaymentRows)}><Printer size={16}/> Seçili Kişileri Yazdır{paymentSelectedIds.size ? ` (${paymentSelectedIds.size})` : ""}</button><button type="button" disabled={!paymentRows.length} onClick={() => printDailyPaymentSlips(range, paymentRows)}><Printer size={16}/> Tümünü Yazdır</button><button type="button" disabled={!weeklyControlRows.length} onClick={() => printWeeklyControlList(range, days, weeklyControlRows)}><ClipboardList size={16}/> Haftalık Özet</button></div></div><div className="gop-payment-grid">{paymentRows.length ? paymentRows.map((row) => { const total = number(row.totalAmount ?? row.total); const paid = rowPaid(row) || (total > 0 && number(row.paidAmount) >= total); const paymentKey = String(row.employeeId || row.id || row.personnelNo || row.name || row.fullName || ""); const picked = paymentSelectedIds.has(paymentKey); return <article key={paymentKey} className={`gop-payment-card ${paid ? "paid" : ""} ${picked ? "selected" : ""}`}><div><label className="gop-payment-pick"><input type="checkbox" checked={picked} onChange={() => setPaymentSelectedIds((current) => { const next = new Set(current); if (next.has(paymentKey)) next.delete(paymentKey); else next.add(paymentKey); return next; })}/><span>Seç</span></label><UserRound size={18}/><span><strong>{row.name || row.fullName}</strong><small>{row.qualification || row.role || "-"}</small></span></div><dl><div><dt>Gündüz</dt><dd>{number(row.dayCount)}</dd></div><div><dt>Gece</dt><dd>{number(row.nightCount)}</dd></div><div><dt>Ödenecek</dt><dd>{money(total)}</dd></div></dl><footer><span className={`gop-badge ${paid ? "ok" : "waiting"}`}>{paid ? "Ödendi" : "Ödeme Bekliyor"}</span>{!paid ? <button type="button" className="primary" disabled={busy} onClick={() => payRow(row)}><WalletCards size={15}/> Ödendi İşaretle</button> : null}</footer></article>; }) : <Empty>Seçili dönemde ödeme fişi oluşacak kayıt yok.</Empty>}</div></div></> : null}'''
if old_payments in s:
    s = s.replace(old_payments, new_payments, 1)
elif 'Seçili Kişileri Yazdır' not in s:
    raise SystemExit('payment JSX anchor missing')

p.write_text(s, encoding='utf-8')

css = Path('APP/app/ky-erp-frontend/src/pages/modules/ik/daily-hr-workspace-final.css')
c = css.read_text(encoding='utf-8')
marker = '/* final payment selection and weekly print controls */'
if marker not in c:
    c += '\n' + marker + '\n' + '.gop-print-actions{display:flex;align-items:center;justify-content:flex-end;gap:6px;flex-wrap:wrap}.gop-print-actions button{min-height:34px;border:1px solid #d5deeb;border-radius:8px;background:#fff;color:#17345e;padding:0 10px;display:inline-flex;align-items:center;gap:6px;font-weight:800;cursor:pointer}.gop-print-actions button.primary{background:#2563eb;border-color:#2563eb;color:#fff}.gop-print-actions button:disabled{opacity:.45;cursor:not-allowed}.gop-payment-card.selected{border-color:#60a5fa;background:#eff6ff;box-shadow:inset 4px 0 0 #2563eb}.gop-payment-pick{display:inline-flex!important;align-items:center!important;gap:4px!important;margin-right:2px;border:1px solid #bfdbfe;border-radius:999px;background:#fff;color:#1d4ed8;padding:3px 7px;font-size:10px;font-weight:900;white-space:nowrap;cursor:pointer}.gop-payment-pick input{margin:0;width:14px;height:14px}@media(max-width:900px){.gop-print-actions{justify-content:flex-start;width:100%}.gop-card-head{align-items:flex-start;flex-direction:column}}\n'
css.write_text(c, encoding='utf-8')

print('daily payment selected/all + weekly control print patch applied')
