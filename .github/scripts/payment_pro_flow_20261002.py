from pathlib import Path
import re

PAGE = Path("APP/app/ky-erp-frontend/src/pages/modules/ik/DailyHrWorkspace.jsx")
CSS = Path("APP/app/ky-erp-frontend/src/pages/modules/ik/daily-hr-workspace-final.css")
s = PAGE.read_text(encoding="utf-8")
css = CSS.read_text(encoding="utf-8")

# Payment history is more useful grouped weekly by default.
s = s.replace('const [paymentHistoryGroup, setPaymentHistoryGroup] = useState("day");',
              'const [paymentHistoryGroup, setPaymentHistoryGroup] = useState("week");', 1)

# Period status metrics: paid rows remain visible; pool only represents still-open payments.
needle = '''  const openPaymentMetrics = useMemo(() => paymentRows.reduce((sum, row) => {
    sum.people += 1;
    sum.days += number(row.totalDays ?? (number(row.dayCount) + number(row.nightCount)));
    sum.amount += number(row.totalAmount);
    sum.controlPending += number(row.pendingCheckCount) > 0 ? 1 : 0;
    return sum;
  }, { people: 0, days: 0, amount: 0, controlPending: 0 }), [paymentRows]);'''
if needle not in s:
    raise SystemExit("openPaymentMetrics anchor missing")
replacement = needle + '''
  const periodPaymentStatus = useMemo(() => {
    const openMap = new Map(paymentRows.map((row) => [String(row.employeeId), row]));
    return paymentPeriodRows.reduce((sum, row) => {
      const open = openMap.get(String(row.employeeId));
      if (open) {
        sum.waiting += 1;
        sum.waitingAmount += number(open.totalAmount);
        if (number(open.pendingCheckCount) > 0) sum.controlPending += 1;
      } else {
        sum.paid += 1;
        sum.paidAmount += number(row.totalAmount);
      }
      return sum;
    }, { paid: 0, paidAmount: 0, waiting: 0, waitingAmount: 0, controlPending: 0 });
  }, [paymentPeriodRows, paymentRows]);'''
s = s.replace(needle, replacement, 1)

# Replace period print helper: printing a receipt is the payment action for any open/ready rows.
pattern = re.compile(r'''  const printPaymentPeriodSlips = useCallback\(\(\{ selectedOnly = false \} = \{\}\) => \{.*?\n  \}, \[paymentPeriodRows, paymentPoolRange, paymentSelectedIds\]\);''', re.S)
replacement = '''  const settleAndPrintPeriodRows = useCallback(async (rowsToPrint = []) => {
    const slips = Array.isArray(rowsToPrint) ? rowsToPrint : [];
    if (!slips.length || busy) return;
    const openMap = new Map(paymentRows.map((row) => [String(row.employeeId), row]));
    const openRows = slips.map((row) => openMap.get(String(row.employeeId))).filter(Boolean);
    const blocked = openRows.filter((row) => number(row.pendingCheckCount) > 0);
    if (blocked.length) {
      setError(`${blocked.length} personelin kontrolü tamamlanmamış. Fiş ödeme kaydı oluşturduğu için önce Kontrol Edildi işlemini tamamlayın.`);
      return;
    }

    setBusy(true); setError("");
    try {
      let paidNow = 0;
      for (const row of openRows) {
        await createDailyPayment({
          mainCompanyId: companyId,
          employeeId: row.employeeId,
          startDate: paymentPoolRange.start,
          endDate: paymentPoolRange.end,
          paymentDate: localDateKey(),
        });
        paidNow += 1;
      }
      if (paidNow) {
        setNotice(`${paidNow} personelin ödemesi fiş işlemiyle kaydedildi. Çıktı hazırlanıyor.`);
        await Promise.all([loadPayments(), loadPaymentHistory(), loadRangeData()]);
      }
      printDailyPaymentSlips(paymentPoolRange, slips);
    } catch (e) {
      setError(e?.message || "Fiş / ödeme işlemi tamamlanamadı.");
    } finally {
      setBusy(false);
    }
  }, [busy, companyId, loadPaymentHistory, loadPayments, loadRangeData, paymentPoolRange, paymentRows]);

  const printPaymentPeriodSlips = useCallback(async ({ selectedOnly = false } = {}) => {
    let slips = paymentPeriodRows;
    if (selectedOnly) slips = slips.filter((row) => paymentSelectedIds.has(String(row.employeeId)));
    await settleAndPrintPeriodRows(slips);
  }, [paymentPeriodRows, paymentSelectedIds, settleAndPrintPeriodRows]);'''
s, n = pattern.subn(replacement, s, count=1)
if n != 1:
    raise SystemExit("printPaymentPeriodSlips replacement failed")

# The history tab opens on the same date range the user was already reviewing.
old = '''<button type="button" className={paymentTab === "history" ? "active" : ""} onClick={() => setPaymentTab("history")}><ClipboardList size={16}/> Yapılan Ödemeler <b>{paymentHistoryRows.filter((row) => String(row.status).toUpperCase() === "PAID").length}</b></button>'''
new = '''<button type="button" className={paymentTab === "history" ? "active" : ""} onClick={() => { setPaymentHistoryRange(paymentPoolRange); writeNamedRange(PAYMENT_HISTORY_RANGE_KEY, paymentPoolRange); setPaymentTab("history"); }}><ClipboardList size={16}/> Yapılan Ödemeler <b>{paymentHistoryRows.filter((row) => String(row.status).toUpperCase() === "PAID").length}</b></button>'''
if old not in s:
    raise SystemExit("history tab anchor missing")
s = s.replace(old, new, 1)

# Stronger period KPIs.
old = '''<div className="gop-payment-stats period-stats"><Stat label="Personel" value={paymentMetrics.people}/><Stat label="Gündüz" value={paymentMetrics.dayCount} hint={money(paymentMetrics.dayTotal)}/><Stat label="Gece" value={paymentMetrics.nightCount} hint={money(paymentMetrics.nightTotal)}/><Stat label="Toplam Vardiya" value={paymentMetrics.totalDays}/><Stat label="GENEL TOPLAM" value={money(paymentMetrics.totalAmount)}/></div>'''
new = '''<div className="gop-payment-stats period-stats"><Stat label="Personel" value={paymentMetrics.people} hint={`${paymentMetrics.totalDays} vardiya`}/><Stat label="Gündüz" value={paymentMetrics.dayCount} hint={money(paymentMetrics.dayTotal)}/><Stat label="Gece" value={paymentMetrics.nightCount} hint={money(paymentMetrics.nightTotal)}/><Stat label="Ödendi" value={periodPaymentStatus.paid} hint={money(periodPaymentStatus.paidAmount)}/><Stat label="Bekleyen" value={periodPaymentStatus.waiting} hint={money(periodPaymentStatus.waitingAmount)}/><Stat label="GENEL TOPLAM" value={money(paymentMetrics.totalAmount)}/></div>'''
if old not in s:
    raise SystemExit("period stats anchor missing")
s = s.replace(old, new, 1)

# Explain print semantics explicitly.
s = s.replace(
    '<span>Ödeme yapılsa bile bu liste kaybolmaz. Çıktı her zaman seçili tarih aralığından alınır.</span>',
    '<span>Bu liste kalıcıdır. Fiş yazdırılan açık hakediş otomatik ÖDENDİ olarak kaydedilir; daha önce ödenen fişler tekrar yazdırılabilir.</span>',
    1,
)

# Period table: add payment status and make each receipt button settle first when needed.
old_head = '<th>Seç</th><th>Personel</th><th>Hakediş Dönemi</th><th>Gündüz Adet</th><th>Gündüz Toplam</th><th>Gece Adet</th><th>Gece Toplam</th><th>Ücret Toplamı</th><th>Fiş</th>'
new_head = '<th>Seç</th><th>Personel</th><th>Hakediş Dönemi</th><th>Gündüz Adet</th><th>Gündüz Toplam</th><th>Gece Adet</th><th>Gece Toplam</th><th>Ücret Toplamı</th><th>Durum</th><th>Fiş</th>'
if old_head not in s:
    raise SystemExit("period table header anchor missing")
s = s.replace(old_head, new_head, 1)

old_map = '''{paymentPeriodRows.length ? paymentPeriodRows.map((row) => { const key=String(row.employeeId); const picked=paymentSelectedIds.has(key); return <tr key={key}>'''
new_map = '''{paymentPeriodRows.length ? paymentPeriodRows.map((row) => { const key=String(row.employeeId); const picked=paymentSelectedIds.has(key); const open=paymentRows.find((item) => String(item.employeeId)===key); const controlPending=open ? number(open.pendingCheckCount)>0 : false; return <tr key={key}>'''
if old_map not in s:
    raise SystemExit("period table map anchor missing")
s = s.replace(old_map, new_map, 1)

old_tail = '''<td className="money grand"><strong>{money(row.totalAmount)}</strong></td><td><button type="button" onClick={() => printDailyPaymentSlips(paymentPoolRange,[row])}><Printer size={14}/> Fiş</button></td></tr>; }) : <tr><td colSpan="9"><Empty>Seçili tarih aralığında çalışma kaydı yok.</Empty></td></tr>}'''
new_tail = '''<td className="money grand"><strong>{money(row.totalAmount)}</strong></td><td><span className={`payment-state ${open ? (controlPending ? "control" : "waiting") : "paid"}`}>{open ? (controlPending ? "KONTROL BEKLİYOR" : "ÖDEME BEKLİYOR") : "✓ ÖDENDİ"}</span></td><td><button type="button" disabled={busy || controlPending} onClick={() => settleAndPrintPeriodRows([row])}><Printer size={14}/> {open ? "Fiş Al" : "Tekrar Yazdır"}</button></td></tr>; }) : <tr><td colSpan="10"><Empty>Seçili tarih aralığında çalışma kaydı yok.</Empty></td></tr>}'''
if old_tail not in s:
    raise SystemExit("period table tail anchor missing")
s = s.replace(old_tail, new_tail, 1)

# Footer receives the extra status column.
s = s.replace(
    '<td className="money grand"><strong>{money(paymentMetrics.totalAmount)}</strong></td><td></td></tr></tfoot>',
    '<td className="money grand"><strong>{money(paymentMetrics.totalAmount)}</strong></td><td><strong>{periodPaymentStatus.paid} ödendi / {periodPaymentStatus.waiting} bekliyor</strong></td><td></td></tr></tfoot>',
    1,
)

# Buttons signal that receipt is the payment record.
s = s.replace('<Printer size={15}/> Seçili Fişleri Yazdır</button>', '<Printer size={15}/> Seçili Fişleri Yazdır</button>', 1)
s = s.replace('<Printer size={15}/> Tüm Fişleri Yazdır</button>', '<Printer size={15}/> Tüm Fişleri Yazdır</button>', 1)
s = s.replace(
    '<div className="gop-print-actions"><button type="button" disabled={!selectedPaymentPeriodRows.length}',
    '<div className="gop-print-actions"><span className="print-payment-note">Fiş = Ödendi</span><button type="button" disabled={!selectedPaymentPeriodRows.length}',
    1,
)

# History header gets concise range summary and no awkward split controls.
s = s.replace(
    '<span>Kalıcı ödeme geçmişi. Ödeme yapılsa da dönem çıktısı ayrıca korunur.</span>',
    '<span>Kalıcı ödeme defteri · tarih aralığı, haftalık/aylık gruplama, fiş tekrar yazdırma ve iptal kaydı birlikte tutulur.</span>',
    1,
)

marker = "/* PAYMENT-PRO-FLOW-2026-10-02 */"
if marker not in css:
    css += """

/* PAYMENT-PRO-FLOW-2026-10-02 */
.gop-payment-stats.period-stats{grid-template-columns:repeat(6,minmax(0,1fr))}
.payment-state{display:inline-flex;align-items:center;justify-content:center;min-width:92px;min-height:25px;padding:0 8px;border-radius:999px;font-size:8px;font-weight:950;white-space:nowrap}
.payment-state.paid{background:#dcfce7;color:#15803d;border:1px solid #86efac}
.payment-state.waiting{background:#fff7ed;color:#c2410c;border:1px solid #fdba74}
.payment-state.control{background:#fff1f2;color:#be123c;border:1px solid #fda4af}
.print-payment-note{display:inline-flex;align-items:center;min-height:30px;padding:0 9px;border-radius:7px;background:#ecfdf5;border:1px solid #86efac;color:#15803d;font-size:8px;font-weight:950}
.period-ledger td:last-child button:disabled{opacity:.45;cursor:not-allowed}
.gop-payment-history-group-head{background:linear-gradient(180deg,#f8fbff,#eef4fa)}
.gop-payment-record.paid{box-shadow:0 2px 8px rgba(15,23,42,.06)}
.gop-payment-record-actions button{font-weight:900}
@media(max-width:1300px){.gop-payment-stats.period-stats{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:800px){.gop-payment-stats.period-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}
"""

PAGE.write_text(s, encoding="utf-8")
CSS.write_text(css, encoding="utf-8")
print("payment pro flow applied")
