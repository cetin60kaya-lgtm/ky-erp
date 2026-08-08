from pathlib import Path
import re

front = Path('APP/app/ky-erp-frontend/src/pages/modules/IkAdvancedMonthly.jsx')
worker = Path('APP/cloud/ky-erp-api/src/ik-relational-cloud.ts')
s = front.read_text(encoding='utf-8')

for line in [
    '    legalDeductionType: employee.legalDeductionType || ((employee.garnishmentActive === true || num(employee.garnishmentAmount) > 0) ? "ICRA" : "YOK"),\n',
    '    garnishmentActive: employee.garnishmentActive === true || num(employee.garnishmentAmount) > 0,\n',
    '    garnishmentAmount: employee.garnishmentAmount ?? "",\n',
    '    garnishmentSource: employee.garnishmentSource || "BANKA",\n',
    '    legalStartPeriod: employee.legalStartPeriod || "",\n',
    '    legalEndPeriod: employee.legalEndPeriod || "",\n',
    '    garnishmentNote: employee.garnishmentNote || "",\n',
]:
    s = s.replace(line, '', 1)

s, count = re.subn(r'<Field label="Dosya No / Açıklama" wide><input disabled=\{\(modalDraft\.legalDeductionType\|\|"YOK"\)==="YOK"\}.*?</Field>', '', s, count=1, flags=re.S)
if count != 1:
    raise SystemExit('legacy person-card legal note field not found')

old_save = '''        override: {
          roadPay: num(modalDraft.road),
          overtimeAmount: num(modalDraft.overtime),
          premiumAmount: num(modalDraft.extra),
          advanceAmount: num(modalDraft.advance),
          deductionAmount: num(modalDraft.deduction),
          garnishmentAmount: num(modalDraft.garnishment),
          bank: num(modalDraft.bank),
          cash: num(modalDraft.cash),
          total: totals.net,
        },'''
new_save = '''        override: {
          bank: num(modalDraft.bank),
          cash: num(modalDraft.cash),
          total: totals.net,
        },'''
if old_save not in s:
    raise SystemExit('payroll override payload not found')
s = s.replace(old_save, new_save, 1)

old_modal = '''    if (modal === "bordroDuzelt") {
      const totals = calcRow({ salary: modalDraft.salary, road: modalDraft.road, overtime: modalDraft.overtime, extra: modalDraft.extra, advance: modalDraft.advance, deduction: modalDraft.deduction, garnishment: modalDraft.garnishment, bank: modalDraft.bank, cash: modalDraft.cash });
      return (
        <Modal title="Bordro Kontrol & Duzelt" sub="Hesaplar otomatik, manuel duzeltme loglanir" onClose={() => setModal(null)}>
          <div className="drawer-grid"><div className="form">{[["salary","Maaş"],["road","Yol"],["extra","EK"],["overtime","Mesai"],["advance","Avans"],["deduction","Kesinti"],["garnishment","İcra / Haciz"],["bank","Banka"],["cash","Elden"]].map(([key,label]) => <Field key={key} label={label}><input type="number" value={modalDraft[key] || ""} onChange={(event) => setModalDraft((old) => ({ ...old, [key]: event.target.value }))} /></Field>)}<Field label="Aciklama" wide><textarea value={modalDraft.reason || ""} onChange={(event) => setModalDraft((old) => ({ ...old, reason: event.target.value }))} /></Field></div><div><div className="mini-summary"><div className="mini"><span>Hakedis</span><b>{money(totals.hakedis)}</b></div><div className="mini"><span>Net</span><b>{money(totals.net)}</b></div><div className="mini"><span>Toplam</span><b>{money(totals.total)}</b></div></div><div className={`warnline ${totals.diff === 0 ? "ok" : "warn"}`}>{totals.diff === 0 ? "Banka + elden net odeme ile eslesiyor." : "Banka + elden net odeme ile eslesmiyor."}</div></div></div>
          <ModalFooter onClose={() => setModal(null)} actions={<button className="btn primary" onClick={savePayrollOverride}>Kaydet</button>} />
        </Modal>
      );
    }'''
new_modal = '''    if (modal === "bordroDuzelt") {
      const totals = calcRow({ salary: modalDraft.salary, road: modalDraft.road, overtime: modalDraft.overtime, extra: modalDraft.extra, advance: modalDraft.advance, deduction: modalDraft.deduction, garnishment: modalDraft.garnishment, bank: modalDraft.bank, cash: modalDraft.cash });
      const sourceRows = [["Maaş", modalDraft.salary], ["Yol", modalDraft.road], ["EK", modalDraft.extra], ["Mesai", modalDraft.overtime], ["Avans", -num(modalDraft.advance)], ["Özel Kesinti", -num(modalDraft.deduction)], ["İcra / Haciz", -num(modalDraft.garnishment)]];
      return (
        <Modal title="Ödeme Dağılımı Kontrolü" sub="Maaş ve hareket kalemleri kendi ekranlarından gelir; burada yalnız banka / elden dağılımı düzeltilir" onClose={() => setModal(null)}>
          <div className="drawer-grid"><div><div className="card" style={{margin:0}}><div className="ch"><div><b>Kaynak Hesap</b><span>Bu değerler burada değiştirilemez.</span></div></div><div className="tw"><table><tbody>{sourceRows.map(([label,value]) => <tr key={label}><td>{label}</td><td className="money"><b>{money(value)}</b></td></tr>)}</tbody></table></div></div></div><div className="form"><Field label="Bankadan Ödenecek" half><input type="number" min="0" value={modalDraft.bank || ""} onChange={(event) => setModalDraft((old) => ({ ...old, bank: event.target.value }))} /></Field><Field label="Elden Ödenecek" half><input type="number" min="0" value={modalDraft.cash || ""} onChange={(event) => setModalDraft((old) => ({ ...old, cash: event.target.value }))} /></Field><Field label="Düzeltme Açıklaması" wide><textarea value={modalDraft.reason || ""} onChange={(event) => setModalDraft((old) => ({ ...old, reason: event.target.value }))} placeholder="Neden banka / elden dağılımı değiştirildi?" /></Field><div className="wide mini-summary"><div className="mini"><span>Hakediş</span><b>{money(totals.hakedis)}</b></div><div className="mini"><span>Net</span><b>{money(totals.net)}</b></div><div className="mini"><span>Banka + Elden</span><b>{money(totals.paymentTotal)}</b></div></div><div className={`wide warnline ${totals.diff === 0 ? "ok" : "warn"}`}>{totals.diff === 0 ? "Banka + elden net ödeme ile eşleşiyor." : `Dağılım net ödemeyle eşleşmiyor. Fark: ${money(totals.diff)}`}</div></div></div>
          <ModalFooter onClose={() => setModal(null)} actions={<button className="btn primary" onClick={savePayrollOverride}>Dağılımı Kaydet</button>} />
        </Modal>
      );
    }'''
if old_modal not in s:
    raise SystemExit('bordroDuzelt modal not found')
s = s.replace(old_modal, new_modal, 1)

s = s.replace('>Tumunu Duzenle</button>', '>Ödeme Dağılımı</button>', 1)

old_report = '<th>Avans</th><th>Kesinti</th><th>Banka</th><th>Elden</th><th>Net</th>'
new_report = '<th>Avans</th><th>Özel Kesinti</th><th>İcra / Haciz</th><th>Banka</th><th>Elden</th><th>Net</th>'
if old_report not in s:
    raise SystemExit('report header not found')
s = s.replace(old_report, new_report, 1)
old_row = '<td>${money(row.advance)}</td><td>${money(row.deduction)}</td><td>${money(row.bank)}</td>'
new_row = '<td>${money(row.advance)}</td><td>${money(row.deduction)}</td><td>${money(row.garnishment)}</td><td>${money(row.bank)}</td>'
if old_row not in s:
    raise SystemExit('report row not found')
s = s.replace(old_row, new_row, 1)
old_total = '<td>${money(rows.reduce((sum,row)=>sum+row.advance,0))}</td><td>${money(rows.reduce((sum,row)=>sum+row.deduction,0))}</td><td>${money(rows.reduce((sum,row)=>sum+row.bank,0))}</td>'
new_total = '<td>${money(rows.reduce((sum,row)=>sum+row.advance,0))}</td><td>${money(rows.reduce((sum,row)=>sum+row.deduction,0))}</td><td>${money(rows.reduce((sum,row)=>sum+row.garnishment,0))}</td><td>${money(rows.reduce((sum,row)=>sum+row.bank,0))}</td>'
if old_total not in s:
    raise SystemExit('report total not found')
s = s.replace(old_total, new_total, 1)

old_export = '''hukukiKesintiTuru: row.legalType === "HACIZ" ? "Haciz" : row.legalType === "ICRA" ? "İcra" : "",
      hukukiKesintiYeri: row.garnishmentSource === "ELDEN" ? "Elden" : "Banka",'''
new_export = '''hukukiKesintiTuru: row.legalType === "KARMA" ? "İcra / Haciz" : row.legalType === "HACIZ" ? "Haciz" : row.legalType === "ICRA" ? "İcra" : "",
      hukukiKesintiYeri: row.garnishmentSource === "KARMA" ? "Banka + Elden" : row.garnishmentSource === "ELDEN" ? "Elden" : row.garnishment ? "Banka" : "",'''
if old_export not in s:
    raise SystemExit('export legal labels not found')
s = s.replace(old_export, new_export, 1)
front.write_text(s, encoding='utf-8')

w = worker.read_text(encoding='utf-8')
start = w.find('async function saveAdvancedPayrollOverride(c: Context<AppEnv>) {')
end = w.find('\nasync function auditLogs', start)
if start < 0 or end < 0:
    raise SystemExit('worker override function not found')
block = w[start:end]
patterns = [
    (r'  const salary = .*?;\n', '  const salary = baseSalary;\n'),
    (r'  const road = .*?;\n', '  const road = number(employee.road_allowance);\n'),
    (r'  const overtimeFinal = .*?;\n', '  const overtimeFinal = overtime;\n'),
    (r'  const premium = .*?;\n', '  const premium = autoPremium;\n'),
    (r'  const deduction = .*?;\n', '  const deduction = deductionDefault;\n'),
    (r'  const advance = .*?;\n', '  const advance = advanceDefault;\n'),
    (r'  const garnishment = .*?;\n', '  const garnishment = garnishmentDefault;\n'),
]
for pattern, replacement in patterns:
    block, n = re.subn(pattern, replacement, block, count=1)
    if n != 1:
        raise SystemExit(f'worker source replacement failed: {pattern}')
w = w[:start] + block + w[end:]
worker.write_text(w, encoding='utf-8')
