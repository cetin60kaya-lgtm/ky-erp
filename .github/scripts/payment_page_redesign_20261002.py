from pathlib import Path
import re

PAGE = Path("APP/app/ky-erp-frontend/src/pages/modules/ik/DailyHrWorkspace.jsx")
CSS = Path("APP/app/ky-erp-frontend/src/pages/modules/ik/daily-hr-workspace-final.css")
s = PAGE.read_text(encoding="utf-8")
css = CSS.read_text(encoding="utf-8")

# 1) Full selected-period rows are independent from the unpaid pool.
if "paymentPeriodRows" not in s:
    s = s.replace(
        '  const [paymentRows, setPaymentRows] = useState([]);\n',
        '  const [paymentRows, setPaymentRows] = useState([]);\n  const [paymentPeriodRows, setPaymentPeriodRows] = useState([]);\n',
        1,
    )

# Default to period/output tab.
s = s.replace('const [paymentTab, setPaymentTab] = useState("pool");', 'const [paymentTab, setPaymentTab] = useState("period");', 1)

# 2) Load open payment pool AND all attendance for the selected range.
pattern = re.compile(r'''  const loadPayments = useCallback\(async \(\) => \{.*?\n  \}, \[companyId, paymentPoolRange, range, view\]\);''', re.S)
replacement = '''  const loadPayments = useCallback(async () => {
    if (!companyId || !["daily-payments", "daily-dashboard"].includes(view)) return;
    setLoading(true); setPaymentLoadError("");
    if (view === "daily-payments") setError("");
    try {
      const sourceRange = view === "daily-dashboard" ? range : paymentPoolRange;
      const [poolResult, attendanceResult] = await Promise.all([
        getDailyPaymentPool({ mainCompanyId: companyId, startDate: sourceRange.start, endDate: sourceRange.end }),
        getDailyAttendance({ mainCompanyId: companyId, startDate: sourceRange.start, endDate: sourceRange.end }, { forceFresh: true }),
      ]);
      const poolRows = Array.isArray(poolResult) ? poolResult : [];
      const attendanceRows = Array.isArray(attendanceResult) ? attendanceResult : [];
      setPaymentRows(poolRows);

      const employeeLookup = new Map(employees.map((person) => [String(person.id), person]));
      const map = new Map();
      attendanceRows.forEach((row) => {
        const date = rowDate(row);
        if (!date || date < sourceRange.start || date > sourceRange.end) return;
        const employeeId = rowEmployeeId(row);
        if (!employeeId) return;
        const person = employeeLookup.get(String(employeeId)) || {};
        const current = map.get(employeeId) || {
          employeeId,
          name: person.name || row.name || row.fullName || "Personel",
          fullName: person.name || row.name || row.fullName || "Personel",
          personnelNo: person.personnelNo || row.personnelNo || "",
          qualification: person.role || row.qualification || row.role || "-",
          periodStart: sourceRange.start,
          periodEnd: sourceRange.end,
          dayCount: 0,
          dayTotal: 0,
          nightCount: 0,
          nightTotal: 0,
          totalDays: 0,
          totalAmount: 0,
          items: [],
        };
        if (rowDay(row)) {
          const amount = number(row.dayWage ?? row.dayRate ?? person.dayRate);
          current.dayCount += 1;
          current.dayTotal += amount;
          current.totalDays += 1;
          current.totalAmount += amount;
          current.items.push({ workDate: date, shift: "day", amount, active: true });
        }
        if (rowNight(row)) {
          const amount = number(row.nightWage ?? row.nightRate ?? person.nightRate);
          current.nightCount += 1;
          current.nightTotal += amount;
          current.totalDays += 1;
          current.totalAmount += amount;
          current.items.push({ workDate: date, shift: "night", amount, active: true });
        }
        map.set(employeeId, current);
      });
      setPaymentPeriodRows([...map.values()].sort((a, b) => String(a.name).localeCompare(String(b.name), "tr")));
    } catch (e) {
      const message = e?.message || "Dönem ödeme verileri alınamadı.";
      setPaymentRows([]);
      setPaymentPeriodRows([]);
      setPaymentLoadError(message);
      if (view === "daily-payments") setError(message);
    } finally { setLoading(false); }
  }, [companyId, employees, paymentPoolRange, range, view]);'''
s, n = pattern.subn(replacement, s, count=1)
if n != 1:
    raise SystemExit("loadPayments replacement failed")

# 3) Selected rows and exact period totals.
if "selectedPaymentPeriodRows" not in s:
    s = s.replace(
        '  const selectedPaymentRows = useMemo(() => paymentRows.filter((row) => paymentSelectedIds.has(String(row.employeeId))), [paymentRows, paymentSelectedIds]);',
        '  const selectedPaymentRows = useMemo(() => paymentRows.filter((row) => paymentSelectedIds.has(String(row.employeeId))), [paymentRows, paymentSelectedIds]);\n  const selectedPaymentPeriodRows = useMemo(() => paymentPeriodRows.filter((row) => paymentSelectedIds.has(String(row.employeeId))), [paymentPeriodRows, paymentSelectedIds]);',
        1,
    )

metrics_pattern = re.compile(r'''  const paymentMetrics = useMemo\(\(\) => paymentRows\.reduce\(\(sum, row\) => \{.*?\n  \}, \{ waitingCount: 0, waitingAmount: 0, totalDays: 0, controlPending: 0 \}.*?;''', re.S)
metrics_replacement = '''  const paymentMetrics = useMemo(() => paymentPeriodRows.reduce((sum, row) => {
    sum.people += 1;
    sum.dayCount += number(row.dayCount);
    sum.dayTotal += number(row.dayTotal);
    sum.nightCount += number(row.nightCount);
    sum.nightTotal += number(row.nightTotal);
    sum.totalDays += number(row.totalDays);
    sum.totalAmount += number(row.totalAmount);
    return sum;
  }, { people: 0, dayCount: 0, dayTotal: 0, nightCount: 0, nightTotal: 0, totalDays: 0, totalAmount: 0 }), [paymentPeriodRows]);
  const openPaymentMetrics = useMemo(() => paymentRows.reduce((sum, row) => {
    sum.people += 1;
    sum.days += number(row.totalDays ?? (number(row.dayCount) + number(row.nightCount)));
    sum.amount += number(row.totalAmount);
    sum.controlPending += number(row.pendingCheckCount) > 0 ? 1 : 0;
    return sum;
  }, { people: 0, days: 0, amount: 0, controlPending: 0 }), [paymentRows]);'''
s, n = metrics_pattern.subn(metrics_replacement, s, count=1)
if n != 1:
    raise SystemExit("paymentMetrics replacement failed")

# Existing dashboard warning must use open pool count.
s = s.replace("if (paymentMetrics.waitingCount) rows.push(`${paymentMetrics.waitingCount} personelin ödemesi bekliyor.`);",
              "if (openPaymentMetrics.people) rows.push(`${openPaymentMetrics.people} personelin ödemesi bekliyor.`);")
s = s.replace("paymentMetrics.waitingCount, periodLocked", "openPaymentMetrics.people, periodLocked")

# Selection remains valid for full selected-period rows, not only unpaid rows.
s = s.replace(
    '    const valid = new Set(paymentRows.map((row) => String(row.employeeId || row.id || row.personnelNo || row.name || row.fullName || "")));',
    '    const valid = new Set(paymentPeriodRows.map((row) => String(row.employeeId || row.id || row.personnelNo || row.name || row.fullName || "")));',
    1,
)
s = s.replace('  }, [paymentRows]);\n\n  const saveRoster', '  }, [paymentPeriodRows]);\n\n  const saveRoster', 1)

# 4) Printing always uses the selected-period rows even after payment.
print_pattern = re.compile(r'''  const printPaymentPeriodSlips = useCallback\(async \(\{ selectedOnly = false \} = \{\}\) => \{.*?\n  \}, \[companyId, employeeMap, paymentPoolRange, paymentSelectedIds\]\);''', re.S)
print_replacement = '''  const printPaymentPeriodSlips = useCallback(({ selectedOnly = false } = {}) => {
    let slips = paymentPeriodRows;
    if (selectedOnly) slips = slips.filter((row) => paymentSelectedIds.has(String(row.employeeId)));
    printDailyPaymentSlips(paymentPoolRange, slips);
  }, [paymentPeriodRows, paymentPoolRange, paymentSelectedIds]);'''
s, n = print_pattern.subn(print_replacement, s, count=1)
if n != 1:
    raise SystemExit("printPaymentPeriodSlips replacement failed")

# 5) Three clear tabs: always-printable period, unpaid pool, permanent paid history.
panel_start = s.find('{view === "daily-payments" ? <div className="gop-payments-v2">')
history_split = s.find('        </> : <>', panel_start)
panel_end = s.find('        </>}\n      </div> : null}', history_split)
if panel_start < 0 or history_split < 0 or panel_end < 0:
    raise SystemExit("payment panel anchors missing")

old_history = s[history_split + len('        </> : <>'):panel_end]
new_panel = '''{view === "daily-payments" ? <div className="gop-payments-v2">
        <div className="gop-payment-tabs three">
          <button type="button" className={paymentTab === "period" ? "active" : ""} onClick={() => setPaymentTab("period")}><Printer size={16}/> Dönem / Çıktı <b>{paymentPeriodRows.length}</b></button>
          <button type="button" className={paymentTab === "pool" ? "active" : ""} onClick={() => setPaymentTab("pool")}><WalletCards size={16}/> Ödeme Bekleyen <b>{paymentRows.length}</b></button>
          <button type="button" className={paymentTab === "history" ? "active" : ""} onClick={() => setPaymentTab("history")}><ClipboardList size={16}/> Yapılan Ödemeler <b>{paymentHistoryRows.filter((row) => String(row.status).toUpperCase() === "PAID").length}</b></button>
        </div>
        <div className="gop-toolbar-card payment-toolbar"><div className="gop-payment-filter-context"><strong>{paymentTab === "history" ? "Ödeme Tarihi Filtresi" : "Hakediş Filtresi"}</strong><span>{dateText(activePaymentRange.start)} — {dateText(activePaymentRange.end)}</span></div><div className="gop-preset-buttons"><button type="button" className={paymentPresetActive("today") ? "active" : ""} onClick={() => paymentPreset("today")}>Bugün</button><button type="button" className={paymentPresetActive("week") ? "active" : ""} onClick={() => paymentPreset("week")}>Bu Hafta</button><button type="button" className={paymentPresetActive("lastWeek") ? "active" : ""} onClick={() => paymentPreset("lastWeek")}>Geçen Hafta</button><button type="button" className={paymentPresetActive("month") ? "active" : ""} onClick={() => paymentPreset("month")}>Bu Ay</button><button type="button" className={paymentPresetActive("lastMonth") ? "active" : ""} onClick={() => paymentPreset("lastMonth")}>Geçen Ay</button><button type="button" className={paymentPresetActive("year") ? "active" : ""} onClick={() => paymentPreset("year")}>Bu Yıl</button></div>{paymentRangeControls}</div>

        {paymentTab === "period" ? <>
          <div className="gop-payment-stats period-stats"><Stat label="Personel" value={paymentMetrics.people}/><Stat label="Gündüz" value={paymentMetrics.dayCount} hint={money(paymentMetrics.dayTotal)}/><Stat label="Gece" value={paymentMetrics.nightCount} hint={money(paymentMetrics.nightTotal)}/><Stat label="Toplam Vardiya" value={paymentMetrics.totalDays}/><Stat label="GENEL TOPLAM" value={money(paymentMetrics.totalAmount)}/></div>
          <div className="gop-card"><div className="gop-card-head payment-head"><div><h2>Dönem Hakedişleri ve Çıktı</h2><span>Ödeme yapılsa bile bu liste kaybolmaz. Çıktı her zaman seçili tarih aralığından alınır.</span></div><div className="gop-print-actions"><button type="button" disabled={!selectedPaymentPeriodRows.length} onClick={() => printPaymentPeriodSlips({ selectedOnly: true })}><Printer size={15}/> Seçili Fişleri Yazdır</button><button type="button" disabled={!paymentPeriodRows.length} onClick={() => printPaymentPeriodSlips()}><Printer size={15}/> Tüm Fişleri Yazdır</button><button type="button" onClick={() => setPaymentSelectedIds(new Set(paymentPeriodRows.map((row) => String(row.employeeId))))}>Tümünü Seç</button><button type="button" disabled={!paymentSelectedIds.size} onClick={() => setPaymentSelectedIds(new Set())}>Seçimi Kaldır</button></div></div>
            <div className="gop-payment-ledger-table period-ledger"><table><thead><tr><th>Seç</th><th>Personel</th><th>Hakediş Dönemi</th><th>Gündüz Adet</th><th>Gündüz Toplam</th><th>Gece Adet</th><th>Gece Toplam</th><th>Ücret Toplamı</th><th>Fiş</th></tr></thead><tbody>{paymentPeriodRows.length ? paymentPeriodRows.map((row) => { const key=String(row.employeeId); const picked=paymentSelectedIds.has(key); return <tr key={key}><td><input type="checkbox" checked={picked} onChange={() => setPaymentSelectedIds((current) => { const next=new Set(current); if(next.has(key)) next.delete(key); else next.add(key); return next; })}/></td><td><strong>{row.name || row.fullName}</strong><small>{row.personnelNo || ""} · {row.qualification || "-"}</small></td><td>{dateText(paymentPoolRange.start)} — {dateText(paymentPoolRange.end)}</td><td><b>{number(row.dayCount)}</b></td><td className="money">{money(row.dayTotal)}</td><td><b>{number(row.nightCount)}</b></td><td className="money">{money(row.nightTotal)}</td><td className="money grand"><strong>{money(row.totalAmount)}</strong></td><td><button type="button" onClick={() => printDailyPaymentSlips(paymentPoolRange,[row])}><Printer size={14}/> Fiş</button></td></tr>; }) : <tr><td colSpan="9"><Empty>Seçili tarih aralığında çalışma kaydı yok.</Empty></td></tr>}</tbody><tfoot><tr><td colSpan="3"><strong>GENEL TOPLAM</strong></td><td><strong>{paymentMetrics.dayCount}</strong></td><td className="money"><strong>{money(paymentMetrics.dayTotal)}</strong></td><td><strong>{paymentMetrics.nightCount}</strong></td><td className="money"><strong>{money(paymentMetrics.nightTotal)}</strong></td><td className="money grand"><strong>{money(paymentMetrics.totalAmount)}</strong></td><td></td></tr></tfoot></table></div>
          </div>
        </> : paymentTab === "pool" ? <>
          <div className="gop-payment-stats pool-stats"><Stat label="Ödeme Bekleyen" value={openPaymentMetrics.people} hint={`${openPaymentMetrics.days} vardiya`}/><Stat label="Bekleyen Tutar" value={money(openPaymentMetrics.amount)}/><Stat label="Kontrol Bekleyen" value={openPaymentMetrics.controlPending}/><Stat label="Hakediş Dönemi" value={`${dateText(paymentPoolRange.start)} — ${dateText(paymentPoolRange.end)}`}/></div>
          <div className="gop-card"><div className="gop-card-head payment-head"><div><h2>Ödeme Bekleyenler</h2><span>Bu alan yalnız ödenmemiş hakedişleri gösterir. Ödeme sonrası kayıt Dönem / Çıktı ve Yapılan Ödemeler tarafında kalır.</span></div><div className="gop-print-actions"><button type="button" onClick={() => setPaymentTab("period")}><Printer size={15}/> Dönem Çıktısına Git</button><button type="button" onClick={() => setPaymentSelectedIds(new Set(paymentRows.map((row) => String(row.employeeId))))}>Tümünü Seç</button><button type="button" className="primary" disabled={busy || !selectedPaymentRows.length || selectedPaymentRows.some((row) => number(row.pendingCheckCount) > 0)} onClick={paySelectedRows}><WalletCards size={15}/> Seçili Ödendi</button></div></div>
            <div className="gop-payment-ledger-table"><table><thead><tr><th>Seç</th><th>Personel</th><th>Dönem</th><th>Gündüz</th><th>Gece</th><th>Vardiya</th><th>Ödenecek</th><th>Kontrol</th><th>İşlem</th></tr></thead><tbody>{paymentRows.length ? paymentRows.map((row) => { const key=String(row.employeeId); const picked=paymentSelectedIds.has(key); const ready=number(row.pendingCheckCount)===0; return <tr key={key} className={!ready ? "needs-control" : ""}><td><input type="checkbox" checked={picked} onChange={() => setPaymentSelectedIds((current) => { const next=new Set(current); if(next.has(key)) next.delete(key); else next.add(key); return next; })}/></td><td><strong>{row.name || row.fullName}</strong><small>{row.personnelNo || ""} · {row.qualification || "-"}</small></td><td>{dateText(row.periodStart)} — {dateText(row.periodEnd)}</td><td>{number(row.dayCount)}</td><td>{number(row.nightCount)}</td><td><b>{number(row.totalDays)}</b></td><td className="money"><strong>{money(row.totalAmount)}</strong></td><td><span className={`gop-badge ${ready ? "ok" : "waiting"}`}>{ready ? "✓ Tam" : `${number(row.pendingCheckCount)} eksik`}</span></td><td><div className="ledger-actions"><button type="button" className="primary" disabled={busy || !ready} onClick={() => payRow(row,false)}><WalletCards size={14}/> Ödendi Yap</button><button type="button" className="primary soft" disabled={busy || !ready} onClick={() => payRow(row,true)}><Printer size={14}/> Ödendi + Fiş</button></div></td></tr>; }) : <tr><td colSpan="9"><Empty>Bu dönemde bekleyen ödeme yok. Çıktılar Dönem / Çıktı sekmesinden alınabilir.</Empty></td></tr>}</tbody></table></div>
          </div>
''' + '        </> : <>' + old_history + '''        </>}
      </div> : null}'''

s = s[:panel_start] + new_panel + s[panel_end + len('        </>}\n      </div> : null}'):]

# 6) History tab gets a quick print/period bridge.
s = s.replace(
    '<div className="gop-card"><div className="gop-card-head payment-head"><div><h2>Yapılan Ödemeler</h2><span>Ödeme tarihine göre kalıcı ödeme defteri. Hakediş dönemi ayrıca korunur.</span></div>',
    '<div className="gop-card"><div className="gop-card-head payment-head"><div><h2>Yapılan Ödemeler</h2><span>Kalıcı ödeme geçmişi. Ödeme yapılsa da dönem çıktısı ayrıca korunur.</span></div><div className="gop-print-actions"><button type="button" onClick={() => setPaymentTab("period")}><Printer size={14}/> Dönem / Çıktı</button></div>',
    1,
)

marker = "/* PAYMENT-TAB-REDESIGN-2026-10-02 */"
if marker not in css:
    css += """

/* PAYMENT-TAB-REDESIGN-2026-10-02 */
.gop-payment-tabs.three{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}
.gop-payment-tabs.three button{justify-content:center;min-height:38px}
.gop-payment-stats.period-stats{grid-template-columns:repeat(5,minmax(0,1fr))}
.gop-payment-stats.period-stats .gop-stat:last-child{border:1px solid #9fc4ff;background:#f1f6ff}
.gop-payment-stats.period-stats .gop-stat:last-child strong{font-size:18px;color:#0f4c81}
.period-ledger table{min-width:1280px}
.period-ledger td.money,.period-ledger th:nth-child(5),.period-ledger th:nth-child(7),.period-ledger th:nth-child(8){text-align:right}
.period-ledger td.grand strong{font-size:14px;color:#0f4c81}
.period-ledger tfoot td{background:#eef4fa;border-top:2px solid #173d68;padding:10px 8px;font-weight:900}
.period-ledger tfoot .grand strong{font-size:17px}
.period-ledger tbody tr:hover{background:#f8fbff}
.period-ledger td>button{border:1px solid #d6dfeb;background:#fff;border-radius:7px;padding:6px 9px;font-weight:800;display:inline-flex;gap:5px;align-items:center}
.pool-stats{grid-template-columns:repeat(4,minmax(0,1fr))!important}
@media(max-width:900px){.gop-payment-tabs.three{grid-template-columns:1fr}.gop-payment-stats.period-stats,.pool-stats{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
"""

PAGE.write_text(s, encoding="utf-8")
CSS.write_text(css, encoding="utf-8")
print("payment tab redesigned")
