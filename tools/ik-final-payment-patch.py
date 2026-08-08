from pathlib import Path

FRONT = Path('APP/app/ky-erp-frontend/src/pages/modules/IkAdvancedMonthly.jsx')
BACK = Path('APP/cloud/ky-erp-api/src/ik-relational-cloud.ts')
MIG = Path('APP/cloud/ky-erp-api/migrations/0007_hr_base_employee_legal_deduction.sql')


def rep(text, old, new, label):
    if old not in text:
        raise SystemExit(f'PATCH_MISSING: {label}')
    return text.replace(old, new, 1)


front = FRONT.read_text(encoding='utf-8')

front = rep(front, '''    extraPaymentLabel: employee.extraPaymentLabel || "Ek Ödeme / Prim",
    extraPaymentAmount: employee.extraPaymentAmount ?? "",
    garnishmentActive: employee.garnishmentActive === true || num(employee.garnishmentAmount) > 0,
    garnishmentAmount: employee.garnishmentAmount ?? "",
    garnishmentNote: employee.garnishmentNote || "",''', '''    baseEmployeeId: employee.baseEmployeeId || "",
    extraPaymentLabel: "EK",
    extraPaymentAmount: employee.extraPaymentAmount ?? "",
    legalDeductionType: employee.legalDeductionType || ((employee.garnishmentActive === true || num(employee.garnishmentAmount) > 0) ? "ICRA" : "YOK"),
    garnishmentActive: employee.garnishmentActive === true || num(employee.garnishmentAmount) > 0,
    garnishmentAmount: employee.garnishmentAmount ?? "",
    garnishmentSource: employee.garnishmentSource || "BANKA",
    legalStartPeriod: employee.legalStartPeriod || "",
    legalEndPeriod: employee.legalEndPeriod || "",
    garnishmentNote: employee.garnishmentNote || "",''', 'draft person fields')

old_plan = '''  const planFor = useCallback((employee) => {
  const own = movements.filter((item) => item.employeeId === employee.id);
  const overtime = own.filter((item) => item.type === "Mesai").reduce((sum, item) => sum + num(item.amount), 0);
  const advance = own.filter((item) => item.type === "Avans" || item.type === "Toplu avans").reduce((sum, item) => sum + num(item.amount), 0);
  const deduction = own.filter((item) => item.type === "Ozel kesinti").reduce((sum, item) => sum + num(item.amount), 0);
  const salary = num(employee.salary);
  const road = num(employee.roadAllowance);
  const extraLabel = employee.extraPaymentLabel || "Ek Ödeme / Prim";
  const extra = num(employee.extraPaymentAmount);
  const garnishment = employee.garnishmentActive === true || num(employee.garnishmentAmount) > 0 ? num(employee.garnishmentAmount) : 0;
  const pre = calcRow({ salary, road, overtime, extra, advance, deduction, garnishment });
  const saved = payrollLines.find((line) => line.employeeId === employee.id);
  const savedHasNewPlan = saved?.final && (saved.final.premiumAmount !== undefined || saved.final.garnishmentAmount !== undefined);
  const bankPlanAfterGarnishment = Math.max(num(employee.bankAmount) - garnishment, 0);
  const bank = saved?.final && savedHasNewPlan ? num(saved.final.bank) : Math.min(pre.net, bankPlanAfterGarnishment);
  const cash = saved?.final && savedHasNewPlan ? num(saved.final.cash) : Math.max(pre.net - bank, 0);
  return { employee, salary, road, extraLabel, extra, overtime, advance, deduction, garnishment, bank, cash, saved, ...calcRow({ salary, road, overtime, extra, advance, deduction, garnishment, bank, cash }) };
}, [movements, payrollLines]);'''
new_plan = '''  const planFor = useCallback((employee) => {
  const own = movements.filter((item) => item.employeeId === employee.id);
  const overtime = own.filter((item) => item.type === "Mesai").reduce((sum, item) => sum + num(item.amount), 0);
  const advance = own.filter((item) => item.type === "Avans" || item.type === "Toplu avans").reduce((sum, item) => sum + num(item.amount), 0);
  const deduction = own.filter((item) => item.type === "Ozel kesinti").reduce((sum, item) => sum + num(item.amount), 0);
  const actualSalary = num(employee.salary);
  const baseEmployee = employee.baseEmployeeId ? employees.find((item) => item.id === employee.baseEmployeeId) : null;
  const salary = baseEmployee ? num(baseEmployee.salary) : actualSalary;
  const road = num(employee.roadAllowance);
  const extraLabel = "EK";
  const extra = baseEmployee ? Math.max(round(actualSalary - salary), 0) : num(employee.extraPaymentAmount);
  const legalType = upper(employee.legalDeductionType) === "HACIZ" ? "HACIZ" : (upper(employee.legalDeductionType) === "ICRA" || employee.garnishmentActive === true || num(employee.garnishmentAmount) > 0 ? "ICRA" : "YOK");
  const garnishmentSource = upper(employee.garnishmentSource) === "ELDEN" ? "ELDEN" : "BANKA";
  const legalInPeriod = legalType !== "YOK" && (!employee.legalStartPeriod || period >= employee.legalStartPeriod) && (!employee.legalEndPeriod || period <= employee.legalEndPeriod);
  const garnishment = legalInPeriod ? num(employee.garnishmentAmount) : 0;
  const pre = calcRow({ salary, road, overtime, extra, advance, deduction, garnishment });
  const saved = payrollLines.find((line) => line.employeeId === employee.id);
  const savedHasNewPlan = saved?.final && (saved.final.premiumAmount !== undefined || saved.final.garnishmentAmount !== undefined);
  const bankPlanAfterGarnishment = garnishmentSource === "BANKA" ? Math.max(num(employee.bankAmount) - garnishment, 0) : num(employee.bankAmount);
  const bank = saved?.final && savedHasNewPlan ? num(saved.final.bank) : Math.min(pre.net, bankPlanAfterGarnishment);
  const cash = saved?.final && savedHasNewPlan ? num(saved.final.cash) : Math.max(pre.net - bank, 0);
  return { employee, actualSalary, baseEmployee, salary, road, extraLabel, extra, overtime, advance, deduction, legalType, garnishmentSource, garnishment, bank, cash, saved, ...calcRow({ salary, road, overtime, extra, advance, deduction, garnishment, bank, cash }) };
}, [employees, movements, payrollLines, period]);'''
front = rep(front, old_plan, new_plan, 'planFor')

old_rows = '''  const payrollRows = useMemo(() => employees.map((employee) => {
    const saved = payrollLines.find((line) => line.employeeId === employee.id);
    if (!saved?.final) return planFor(employee);
    const salary = num(saved.final.salaryPay);
    const road = num(saved.final.roadPay);
    const extraLabel = employee.extraPaymentLabel || "Ek Ödeme / Prim";
    const extra = saved.final.premiumAmount !== undefined ? num(saved.final.premiumAmount) : num(employee.extraPaymentAmount);
    const overtime = num(saved.final.overtimeAmount);
    const advance = num(saved.final.advanceAmount);
    const deduction = num(saved.final.deductionAmount);
    const garnishment = saved.final.garnishmentAmount !== undefined ? num(saved.final.garnishmentAmount) : (employee.garnishmentActive === true || num(employee.garnishmentAmount) > 0 ? num(employee.garnishmentAmount) : 0);
    const savedHasNewPlan = saved.final.premiumAmount !== undefined || saved.final.garnishmentAmount !== undefined;
    if (!savedHasNewPlan && (extra > 0 || garnishment > 0)) return planFor(employee);
    const bank = num(saved.final.bank);
    const cash = num(saved.final.cash);
    return { employee, salary, road, extraLabel, extra, overtime, advance, deduction, garnishment, bank, cash, saved, ...calcRow({ salary, road, overtime, extra, advance, deduction, garnishment, bank, cash }) };
  }), [employees, payrollLines, planFor]);'''
new_rows = '''  const payrollRows = useMemo(() => employees.map((employee) => {
    const saved = payrollLines.find((line) => line.employeeId === employee.id);
    if (!saved?.final) return planFor(employee);
    const legacyAutoBase = Boolean(employee.baseEmployeeId) && num(saved.final.salaryPay) === num(employee.salary) && num(saved.final.premiumAmount) === 0;
    if (legacyAutoBase) return planFor(employee);
    const salary = num(saved.final.salaryPay);
    const road = num(saved.final.roadPay);
    const extraLabel = "EK";
    const extra = saved.final.premiumAmount !== undefined ? num(saved.final.premiumAmount) : num(employee.extraPaymentAmount);
    const overtime = num(saved.final.overtimeAmount);
    const advance = num(saved.final.advanceAmount);
    const deduction = num(saved.final.deductionAmount);
    const garnishment = saved.final.garnishmentAmount !== undefined ? num(saved.final.garnishmentAmount) : (employee.garnishmentActive === true || num(employee.garnishmentAmount) > 0 ? num(employee.garnishmentAmount) : 0);
    const legalType = upper(employee.legalDeductionType) === "HACIZ" ? "HACIZ" : (garnishment > 0 ? "ICRA" : "YOK");
    const garnishmentSource = upper(employee.garnishmentSource) === "ELDEN" ? "ELDEN" : "BANKA";
    const savedHasNewPlan = saved.final.premiumAmount !== undefined || saved.final.garnishmentAmount !== undefined;
    if (!savedHasNewPlan && (extra > 0 || garnishment > 0)) return planFor(employee);
    const bank = num(saved.final.bank);
    const cash = num(saved.final.cash);
    return { employee, actualSalary: num(employee.salary), baseEmployee: employee.baseEmployeeId ? employees.find((item) => item.id === employee.baseEmployeeId) : null, salary, road, extraLabel, extra, overtime, advance, deduction, legalType, garnishmentSource, garnishment, bank, cash, saved, ...calcRow({ salary, road, overtime, extra, advance, deduction, garnishment, bank, cash }) };
  }), [employees, payrollLines, planFor]);'''
front = rep(front, old_rows, new_rows, 'payroll rows')

front = rep(front, '''    if (num(modalDraft.extraPaymentAmount) < 0) return setNotice("Ek odeme negatif olamaz.");
    if (num(modalDraft.garnishmentAmount) < 0) return setNotice("Icra kesintisi negatif olamaz.");
    const planTotal = num(modalDraft.bankAmount) + num(modalDraft.cashAmount);
    if (planTotal > num(modalDraft.salary) + num(modalDraft.roadAllowance) + num(modalDraft.extraPaymentAmount) && !window.confirm("Banka plan + elden plan ücret/yol/ek ödeme toplamından yüksek. Devam edilsin mi?")) return;''', '''    const baseEmployee = modalDraft.baseEmployeeId ? employees.find((item) => item.id === modalDraft.baseEmployeeId) : null;
    if (modalDraft.baseEmployeeId === modalDraft.id) return setNotice("Personel kendisini baz personel olarak secemez.");
    if (modalDraft.baseEmployeeId && !baseEmployee) return setNotice("Baz personel bulunamadi.");
    if (baseEmployee && num(baseEmployee.salary) > num(modalDraft.salary)) return setNotice("Baz personel maasi gercek maastan yuksek olamaz.");
    const autoExtra = baseEmployee ? Math.max(round(num(modalDraft.salary) - num(baseEmployee.salary)), 0) : 0;
    const legalType = ["ICRA", "HACIZ"].includes(upper(modalDraft.legalDeductionType)) ? upper(modalDraft.legalDeductionType) : "YOK";
    if (num(modalDraft.garnishmentAmount) < 0) return setNotice("Icra / haciz kesintisi negatif olamaz.");
    const planTotal = num(modalDraft.bankAmount) + num(modalDraft.cashAmount);
    if (planTotal > num(modalDraft.salary) + num(modalDraft.roadAllowance) && !window.confirm("Banka plan + elden plan gercek maas ve yol toplamindan yüksek. Devam edilsin mi?")) return;''', 'save person validation')

front = rep(front, '''        extraPaymentLabel: modalDraft.extraPaymentLabel || "Ek Ödeme / Prim",
        extraPaymentAmount: num(modalDraft.extraPaymentAmount),
        garnishmentActive: modalDraft.garnishmentActive === true && num(modalDraft.garnishmentAmount) > 0,
        garnishmentAmount: modalDraft.garnishmentActive === true ? num(modalDraft.garnishmentAmount) : 0,
        garnishmentNote: modalDraft.garnishmentNote || "",''', '''        baseEmployeeId: modalDraft.baseEmployeeId || "",
        extraPaymentLabel: "EK",
        extraPaymentAmount: autoExtra,
        legalDeductionType: legalType,
        garnishmentActive: legalType !== "YOK" && num(modalDraft.garnishmentAmount) > 0,
        garnishmentAmount: legalType !== "YOK" ? num(modalDraft.garnishmentAmount) : 0,
        garnishmentSource: upper(modalDraft.garnishmentSource) === "ELDEN" ? "ELDEN" : "BANKA",
        legalStartPeriod: modalDraft.legalStartPeriod || "",
        legalEndPeriod: modalDraft.legalEndPeriod || "",
        garnishmentNote: modalDraft.garnishmentNote || "",''', 'save person payload')

old_payment = '''          <div className="modal-section"><h3>Ücret ve Ödeme Planı</h3><div className="form"><Field label="Aylık Ücret"><input type="number" value={modalDraft.salary||""} onChange={(event)=>setModalDraft((old)=>({...old,salary:event.target.value}))}/></Field><Field label="Yol Yardımı"><input type="number" value={modalDraft.roadAllowance||""} onChange={(event)=>setModalDraft((old)=>({...old,roadAllowance:event.target.value}))}/></Field><Field label="Ek Ödeme Adı"><input value={modalDraft.extraPaymentLabel||"Ek Ödeme / Prim"} onChange={(event)=>setModalDraft((old)=>({...old,extraPaymentLabel:event.target.value}))} placeholder="Performans Primi, Ek Ödeme..."/></Field><Field label="Ek Ödeme / Prim"><input type="number" min="0" value={modalDraft.extraPaymentAmount||""} onChange={(event)=>setModalDraft((old)=>({...old,extraPaymentAmount:event.target.value}))}/></Field><Field label="Ödeme Tipi"><select value={modalDraft.paymentType||"BANKA_ELDEN"} onChange={(event)=>setModalDraft((old)=>({...old,paymentType:event.target.value}))}><option value="BANKA_ELDEN">Banka + Elden</option><option value="Banka">Sadece Banka</option><option value="Elden">Sadece Elden</option></select></Field><Field label="Banka Planı"><input type="number" value={modalDraft.bankAmount||""} onChange={(event)=>setModalDraft((old)=>({...old,bankAmount:event.target.value}))}/></Field><Field label="Elden Planı"><input type="number" value={modalDraft.cashAmount||""} onChange={(event)=>setModalDraft((old)=>({...old,cashAmount:event.target.value}))}/></Field><Field label="İcra Kesintisi"><select value={modalDraft.garnishmentActive?"VAR":"YOK"} onChange={(event)=>setModalDraft((old)=>({...old,garnishmentActive:event.target.value==="VAR"}))}><option value="YOK">Yok</option><option value="VAR">Var - banka ödemesinden düş</option></select></Field><Field label="Aylık İcra Tutarı"><input type="number" min="0" disabled={!modalDraft.garnishmentActive} value={modalDraft.garnishmentAmount||""} onChange={(event)=>setModalDraft((old)=>({...old,garnishmentAmount:event.target.value}))}/></Field><Field label="Resmi Bordro Net"><input value={money(selected?.sgkNet)} readOnly/></Field><Field label="İcra Notu / Dosya No" wide><input disabled={!modalDraft.garnishmentActive} value={modalDraft.garnishmentNote||""} onChange={(event)=>setModalDraft((old)=>({...old,garnishmentNote:event.target.value}))} placeholder="Dosya no / açıklama"/></Field><Field label="Not" wide><textarea value={modalDraft.note||""} onChange={(event)=>setModalDraft((old)=>({...old,note:event.target.value}))}/></Field></div></div>'''
new_payment = '''          <div className="modal-section"><h3>Ücret ve Ödeme Planı</h3><div className="form"><Field label="Gerçek Maaş"><input type="number" value={modalDraft.salary||""} onChange={(event)=>setModalDraft((old)=>({...old,salary:event.target.value}))}/></Field><Field label="Baz Personel"><select value={modalDraft.baseEmployeeId||""} onChange={(event)=>setModalDraft((old)=>({...old,baseEmployeeId:event.target.value}))}><option value="">Yok - gerçek maaşı kullan</option>{employees.filter((item)=>item.id!==modalDraft.id).map((item)=><option key={item.id} value={item.id}>{item.fullName} - {money(item.salary)}</option>)}</select></Field><Field label="Bordro Baz Maaşı"><input value={money(modalDraft.baseEmployeeId?employees.find((item)=>item.id===modalDraft.baseEmployeeId)?.salary:modalDraft.salary)} readOnly/></Field><Field label="EK"><input value={money(modalDraft.baseEmployeeId?Math.max(num(modalDraft.salary)-num(employees.find((item)=>item.id===modalDraft.baseEmployeeId)?.salary),0):0)} readOnly/></Field><Field label="Yol Yardımı"><input type="number" value={modalDraft.roadAllowance||""} onChange={(event)=>setModalDraft((old)=>({...old,roadAllowance:event.target.value}))}/></Field><Field label="Ödeme Tipi"><select value={modalDraft.paymentType||"BANKA_ELDEN"} onChange={(event)=>setModalDraft((old)=>({...old,paymentType:event.target.value}))}><option value="BANKA_ELDEN">Banka + Elden</option><option value="Banka">Sadece Banka</option><option value="Elden">Sadece Elden</option></select></Field><Field label="Banka Planı"><input type="number" value={modalDraft.bankAmount||""} onChange={(event)=>setModalDraft((old)=>({...old,bankAmount:event.target.value}))}/></Field><Field label="Elden Planı"><input type="number" value={modalDraft.cashAmount||""} onChange={(event)=>setModalDraft((old)=>({...old,cashAmount:event.target.value}))}/></Field><Field label="Hukuki Kesinti"><select value={modalDraft.legalDeductionType||"YOK"} onChange={(event)=>setModalDraft((old)=>({...old,legalDeductionType:event.target.value,garnishmentActive:event.target.value!=="YOK"}))}><option value="YOK">Yok</option><option value="ICRA">İcra</option><option value="HACIZ">Haciz</option></select></Field><Field label="Kesinti Yeri"><select disabled={(modalDraft.legalDeductionType||"YOK")==="YOK"} value={modalDraft.garnishmentSource||"BANKA"} onChange={(event)=>setModalDraft((old)=>({...old,garnishmentSource:event.target.value}))}><option value="BANKA">Bankadan</option><option value="ELDEN">Elden</option></select></Field><Field label="Aylık Tutar"><input type="number" min="0" disabled={(modalDraft.legalDeductionType||"YOK")==="YOK"} value={modalDraft.garnishmentAmount||""} onChange={(event)=>setModalDraft((old)=>({...old,garnishmentAmount:event.target.value}))}/></Field><Field label="Başlangıç Dönemi"><input type="month" disabled={(modalDraft.legalDeductionType||"YOK")==="YOK"} value={modalDraft.legalStartPeriod||""} onChange={(event)=>setModalDraft((old)=>({...old,legalStartPeriod:event.target.value}))}/></Field><Field label="Bitiş Dönemi"><input type="month" disabled={(modalDraft.legalDeductionType||"YOK")==="YOK"} value={modalDraft.legalEndPeriod||""} onChange={(event)=>setModalDraft((old)=>({...old,legalEndPeriod:event.target.value}))}/></Field><Field label="Resmi Bordro Net"><input value={money(selected?.sgkNet)} readOnly/></Field><Field label="Dosya No / Açıklama" wide><input disabled={(modalDraft.legalDeductionType||"YOK")==="YOK"} value={modalDraft.garnishmentNote||""} onChange={(event)=>setModalDraft((old)=>({...old,garnishmentNote:event.target.value}))} placeholder="Dosya no / kısa açıklama"/></Field><Field label="Not" wide><textarea value={modalDraft.note||""} onChange={(event)=>setModalDraft((old)=>({...old,note:event.target.value}))}/></Field></div></div>'''
front = rep(front, old_payment, new_payment, 'person payment modal')

front = front.replace('summaryBox("Ek Ödeme / İcra"', 'summaryBox("EK / İcra-Haciz"')
front = front.replace('<th>Ek Ödeme</th>', '<th>EK</th>')
front = front.replace('<th>İcra</th>', '<th>İcra/Haciz</th>')
front = front.replace('[["salary","Maaş"],["road","Yol"],["extra","Ek Ödeme / Prim"],["overtime","Mesai"],["advance","Avans"],["deduction","Kesinti"],["garnishment","İcra Kesintisi"],["bank","Banka"],["cash","Elden"]]', '[["salary","Maaş"],["road","Yol"],["extra","EK"],["overtime","Mesai"],["advance","Avans"],["deduction","Kesinti"],["garnishment","İcra / Haciz"],["bank","Banka"],["cash","Elden"]]')

front = rep(front, '''      ekOdemeAdi: row.extraLabel,
      ekOdeme: row.extra,
      mesai: row.overtime,
      avans: row.advance,
      kesinti: row.deduction,
      icraKesintisi: row.garnishment,''', '''      ek: row.extra,
      mesai: row.overtime,
      avans: row.advance,
      kesinti: row.deduction,
      hukukiKesintiTuru: row.legalType === "HACIZ" ? "Haciz" : row.legalType === "ICRA" ? "İcra" : "",
      hukukiKesintiYeri: row.garnishmentSource === "ELDEN" ? "Elden" : "Banka",
      hukukiKesinti: row.garnishment,''', 'excel legal fields')

old_slip = '''  const printSlip = (row = payrollRows.find((item) => item.employee.id === selected?.id)) => {
  if (!row) return setNotice("Fis icin personel secilmelidir.");
  const slipRows = [
    ["Personel", row.employee.fullName],
    ["Donem", `${MONTHS[month - 1]} ${year}`],
    ["Maas", money(row.salary)],
    ["Yol", money(row.road)],
    ...(row.extra > 0 ? [[row.extraLabel || "Ek Ödeme / Prim", money(row.extra)]] : []),
    ["Mesai", money(row.overtime)],
    ["Avans", money(row.advance)],
    ["Kesinti", money(row.deduction)],
    ...(row.garnishment > 0 ? [["İcra Kesintisi", money(row.garnishment)]] : []),
    ["Banka Ödemesi", money(row.bank)],
    ["Elden Ödeme", money(row.cash)],
    ["Net Odenecek", money(row.net)],
  ];
  const html = `<html><head><meta charset="utf-8"><style>body{font-family:Arial;padding:22px}.print-row{display:flex;justify-content:space-between;border-bottom:1px solid #edf2f7;padding:8px 0}.print-row.legal{font-weight:700}.sheet{max-width:520px;margin:auto;border:1px solid #d9e3ef;border-radius:12px;padding:18px}</style></head><body><div class="sheet"><h2>BORDRO ODEME FISI</h2>${slipRows.map(([label, value]) => `<div class="print-row${label === "İcra Kesintisi" ? " legal" : ""}"><span>${label}</span><b>${value}</b></div>`).join("")}<br><p>Imza: ____________________</p></div></body></html>`;
  printHtmlDocument(html, `ik-fis-${row.employee.fullName}`);
};'''
new_slip = '''  const legalLabel = (row) => row.legalType === "HACIZ" ? "Haciz" : row.legalType === "ICRA" ? "İcra" : "";
  const legalSourceLabel = (row) => row.garnishmentSource === "ELDEN" ? "Elden" : "Bankadan";

  const slipCardHtml = (row) => {
    const lines = [
      ["Maaş", money(row.salary)],
      ...(row.road ? [["Yol", money(row.road)]] : []),
      ...(row.overtime ? [["Mesai", money(row.overtime)]] : []),
      ...(row.advance ? [["Avans", `-${money(row.advance)}`]] : []),
      ...(row.deduction ? [["Özel Kesinti", `-${money(row.deduction)}`]] : []),
      ...(row.garnishment ? [[`${legalLabel(row)} (${legalSourceLabel(row)})`, `-${money(row.garnishment)}`]] : []),
    ];
    return `<article class="pay-slip"><header><b>${row.employee.fullName}</b><span>${MONTHS[month - 1]} ${year} ÖDEME FİŞİ</span></header><div class="slip-lines">${lines.map(([label,value])=>`<div><span>${label}</span><b>${value}</b></div>`).join("")}</div><div class="pay-channels"><div><span>BANKADAN</span><b>${money(row.bank)}</b></div><div><span>ELDEN</span><b>${money(row.cash)}</b></div></div><div class="net"><span>TOPLAM ÖDENECEK</span><b>${money(row.net)}</b></div>${row.extra>0?`<div class="ek-cut"><span>EK</span><b>${money(row.extra)}</b></div>`:""}</article>`;
  };

  const printSlip = (row = payrollRows.find((item) => item.employee.id === selected?.id)) => {
    if (!row) return setNotice("Fis icin personel secilmelidir.");
    const html = `<html><head><meta charset="utf-8"><style>@page{size:A4 portrait;margin:8mm}*{box-sizing:border-box}body{font-family:Arial;color:#101828;margin:0}.single{width:96mm;margin:auto}.pay-slip{border:1px solid #8fa3b8;padding:3mm;background:#fff}.pay-slip header{text-align:center;border-bottom:1px solid #cbd5e1;padding-bottom:2mm}.pay-slip header b{display:block;font-size:15px}.pay-slip header span{font-size:9px}.slip-lines>div{display:flex;justify-content:space-between;padding:1.1mm 0;border-bottom:1px solid #e7edf3;font-size:10px}.pay-channels{display:grid;grid-template-columns:1fr 1fr;gap:2mm;margin-top:2mm}.pay-channels div{text-align:center;border:1px solid #b9c8d8;padding:2mm}.pay-channels span,.net span{display:block;font-size:8px;font-weight:700}.pay-channels b{font-size:14px}.net{margin-top:2mm;text-align:center;border:1.5px solid #111;padding:2mm}.net b{font-size:18px}.ek-cut{margin:3mm -3mm -3mm;border-top:1px dashed #111;padding:2mm 3mm;display:flex;justify-content:center;gap:5mm;font-size:13px}.ek-cut b{font-size:15px}</style></head><body><div class="single">${slipCardHtml(row)}</div></body></html>`;
    printHtmlDocument(html, `ik-fis-${row.employee.fullName}`);
  };

  const printPaymentSlips = () => {
    const rows = payrollRows.filter((row) => !selectedPayrollIds.length || selectedPayrollIds.includes(row.employee.id));
    if (!rows.length) return setNotice("Fis icin personel bulunamadi.");
    const pages = [];
    for (let index = 0; index < rows.length; index += 10) pages.push(rows.slice(index, index + 10));
    const html = `<html><head><meta charset="utf-8"><style>@page{size:A4 portrait;margin:5mm}*{box-sizing:border-box}body{font-family:Arial;color:#101828;margin:0}.page{width:200mm;height:287mm;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(5,1fr);gap:2mm;page-break-after:always}.page:last-child{page-break-after:auto}.pay-slip{border:1px dashed #6f8194;padding:2mm;overflow:hidden;display:flex;flex-direction:column;background:#fff}.pay-slip header{text-align:center;border-bottom:1px solid #cbd5e1;padding-bottom:1mm}.pay-slip header b{display:block;font-size:11px}.pay-slip header span{font-size:7px}.slip-lines{flex:1}.slip-lines>div{display:flex;justify-content:space-between;padding:.55mm 0;border-bottom:1px solid #edf1f5;font-size:7.5px}.pay-channels{display:grid;grid-template-columns:1fr 1fr;gap:1mm;margin-top:1mm}.pay-channels div{text-align:center;border:1px solid #b9c8d8;padding:1mm}.pay-channels span,.net span{display:block;font-size:6.5px;font-weight:700}.pay-channels b{font-size:10.5px}.net{margin-top:1mm;text-align:center;border:1.3px solid #111;padding:1mm}.net b{font-size:13px}.ek-cut{margin:1mm -2mm -2mm;border-top:1px dashed #111;padding:1mm 2mm;display:flex;justify-content:center;gap:4mm;font-size:8px}.ek-cut b{font-size:10px}@media print{.pay-slip{break-inside:avoid}}</style></head><body>${pages.map((pageRows)=>`<section class="page">${pageRows.map(slipCardHtml).join("")}</section>`).join("")}</body></html>`;
    printHtmlDocument(html, `ik-personel-fisleri-${period}`);
  };'''
front = rep(front, old_slip, new_slip, 'print slip')

front = rep(front, '<button className="btn" onClick={printPayrollReport}>Toplu Rapor / PDF</button><button className="btn" onClick={() => setModal("fis")}>Tek Kisi Fisi</button>', '<button className="btn" onClick={printPayrollReport}>Toplu Rapor / PDF</button><button className="btn" onClick={printPaymentSlips}>Toplu Fiş / PDF</button><button className="btn" onClick={() => setModal("fis")}>Tek Kisi Fisi</button>', 'bulk slip button')

old_preview = '''          <div className="print-sheet"><h2>{modal === "fis" ? "BORDRO ODEME FISI" : "KIDEM CIKTISI"}</h2><div className="print-row"><span>Personel</span><b>{row?.employee?.fullName || "-"}</b></div><div className="print-row"><span>Donem</span><b>{MONTHS[month - 1]} {year}</b></div><div className="print-row"><span>Maas</span><b>{money(row?.salary)}</b></div><div className="print-row"><span>Yol</span><b>{money(row?.road)}</b></div>{row?.extra>0&&<div className="print-row"><span>{row?.extraLabel||"Ek Ödeme / Prim"}</span><b>{money(row?.extra)}</b></div>}<div className="print-row"><span>Mesai</span><b>{money(row?.overtime)}</b></div><div className="print-row"><span>Avans</span><b>{money(row?.advance)}</b></div><div className="print-row"><span>Kesinti</span><b>{money(row?.deduction)}</b></div>{row?.garnishment>0&&<div className="print-row"><span>İcra Kesintisi</span><b>{money(row?.garnishment)}</b></div>}<div className="print-row"><span>Banka</span><b>{money(row?.bank)}</b></div><div className="print-row"><span>Elden</span><b>{money(row?.cash)}</b></div><div className="print-row"><span>Net Odenecek</span><b>{money(row?.net)}</b></div><br /><p>Imza: ____________________</p></div>'''
new_preview = '''          <div className="print-sheet"><h2>{modal === "fis" ? "ÖDEME FİŞİ" : "KIDEM CIKTISI"}</h2><div className="print-row"><span>Personel</span><b>{row?.employee?.fullName || "-"}</b></div><div className="print-row"><span>Dönem</span><b>{MONTHS[month - 1]} {year}</b></div><div className="print-row"><span>Maaş</span><b>{money(row?.salary)}</b></div>{row?.road>0&&<div className="print-row"><span>Yol</span><b>{money(row?.road)}</b></div>}{row?.overtime>0&&<div className="print-row"><span>Mesai</span><b>{money(row?.overtime)}</b></div>}{row?.advance>0&&<div className="print-row"><span>Avans</span><b>-{money(row?.advance)}</b></div>}{row?.deduction>0&&<div className="print-row"><span>Özel Kesinti</span><b>-{money(row?.deduction)}</b></div>}{row?.garnishment>0&&<div className="print-row"><span>{row?.legalType==="HACIZ"?"Haciz":"İcra"} ({row?.garnishmentSource==="ELDEN"?"Elden":"Bankadan"})</span><b>-{money(row?.garnishment)}</b></div>}<div className="print-row"><span>Bankadan</span><b>{money(row?.bank)}</b></div><div className="print-row"><span>Elden</span><b>{money(row?.cash)}</b></div><div className="print-row"><span>Toplam Ödenecek</span><b>{money(row?.net)}</b></div>{row?.extra>0&&<div className="print-row" style={{marginTop:10,borderTop:"1px dashed #111",justifyContent:"center",gap:18}}><span>EK</span><b>{money(row?.extra)}</b></div>}</div>'''
front = rep(front, old_preview, new_preview, 'slip preview')

FRONT.write_text(front, encoding='utf-8')

back = BACK.read_text(encoding='utf-8')
back = rep(back, '''    extraPaymentLabel: text(row.extra_payment_label) || "Ek Ödeme / Prim",
    extraPaymentAmount: number(row.extra_payment_amount),
    garnishmentActive: flag(row.garnishment_active) || number(row.garnishment_amount) > 0,
    garnishmentAmount: number(row.garnishment_amount),
    garnishmentNote: text(row.garnishment_note),''', '''    baseEmployeeId: text(row.base_employee_id),
    extraPaymentLabel: "EK",
    extraPaymentAmount: number(row.extra_payment_amount),
    legalDeductionType: text(row.legal_deduction_type) || (flag(row.garnishment_active) || number(row.garnishment_amount) > 0 ? "ICRA" : "YOK"),
    garnishmentActive: flag(row.garnishment_active) || number(row.garnishment_amount) > 0,
    garnishmentAmount: number(row.garnishment_amount),
    garnishmentSource: text(row.garnishment_source) || "BANKA",
    legalStartPeriod: text(row.legal_start_period),
    legalEndPeriod: text(row.legal_end_period),
    garnishmentNote: text(row.garnishment_note),''', 'map monthly')

back = rep(back, '''              s.extra_payment_label,
              s.extra_payment_amount,
              s.garnishment_active,
              s.garnishment_amount,
              s.garnishment_note''', '''              s.extra_payment_label,
              s.extra_payment_amount,
              s.base_employee_id,
              s.legal_deduction_type,
              s.garnishment_active,
              s.garnishment_amount,
              s.garnishment_source,
              s.legal_start_period,
              s.legal_end_period,
              s.garnishment_note''', 'monthly select settings')

old_adv = '''  const employees = await monthlyRows(c, companyId);
  const saved = await payrollRows(c, companyId);
  const byEmployee = new Map(saved.filter((row) => number(row.year) === year && number(row.month) === month).map((row) => [text(row.employeeId), row]));
  const lines = employees.map((employee) => {
    const row = byEmployee.get(text(employee.id));
    const extra = number(employee.extraPaymentAmount);
    const garnishment = employee.garnishmentActive === true || number(employee.garnishmentAmount) > 0 ? number(employee.garnishmentAmount) : 0;
    const baseNet = Math.max(number(employee.salary) + number(employee.roadAllowance) + extra - garnishment, 0);
    const bankPlan = Math.max(number(employee.bankAmount) - garnishment, 0);
    const systemBank = Math.min(baseNet, bankPlan);
    const systemCash = Math.max(baseNet - systemBank, 0);
    const final = row ? {
      salaryPay: row.salary,
      roadPay: row.roadAllowance,
      overtimeAmount: row.overtimeAmount,
      premiumAmount: row.premiumAmount,
      garnishmentAmount: row.garnishmentAmount,
      deductionAmount: row.deductionAmount,
      advanceAmount: row.advanceAmount,
      bank: row.bankAmount,
      cash: row.cashAmount,
      total: row.totalAmount,
    } : {
      salaryPay: number(employee.salary),
      roadPay: number(employee.roadAllowance),
      overtimeAmount: 0,
      premiumAmount: extra,
      garnishmentAmount: garnishment,
      deductionAmount: 0,
      advanceAmount: 0,
      bank: systemBank,
      cash: systemCash,
      total: baseNet,
    };
    return { employeeId: employee.id, code: employee.code, fullName: employee.fullName, department: employee.department, system: final, final, status: row?.status || "SYSTEM" };
  });'''
new_adv = '''  const employees = await monthlyRows(c, companyId);
  const saved = await payrollRows(c, companyId);
  const employeesById = new Map(employees.map((employee) => [text(employee.id), employee]));
  const byEmployee = new Map(saved.filter((row) => number(row.year) === year && number(row.month) === month).map((row) => [text(row.employeeId), row]));
  const period = `${year}-${String(month).padStart(2, "0")}`;
  const lines = employees.map((employee) => {
    const row = byEmployee.get(text(employee.id));
    const baseEmployee = employee.baseEmployeeId ? employeesById.get(text(employee.baseEmployeeId)) : null;
    const baseSalary = baseEmployee ? number(baseEmployee.salary) : number(employee.salary);
    const extra = baseEmployee ? Math.max(number(employee.salary) - baseSalary, 0) : number(employee.extraPaymentAmount);
    const legalType = text(employee.legalDeductionType) || (employee.garnishmentActive ? "ICRA" : "YOK");
    const legalInPeriod = legalType !== "YOK" && (!text(employee.legalStartPeriod) || period >= text(employee.legalStartPeriod)) && (!text(employee.legalEndPeriod) || period <= text(employee.legalEndPeriod));
    const garnishment = legalInPeriod ? number(employee.garnishmentAmount) : 0;
    const baseNet = Math.max(baseSalary + number(employee.roadAllowance) + extra - garnishment, 0);
    const garnishmentSource = upper(employee.garnishmentSource) === "ELDEN" ? "ELDEN" : "BANKA";
    const bankPlan = garnishmentSource === "BANKA" ? Math.max(number(employee.bankAmount) - garnishment, 0) : number(employee.bankAmount);
    const systemBank = Math.min(baseNet, bankPlan);
    const systemCash = Math.max(baseNet - systemBank, 0);
    const legacyAutoBase = Boolean(baseEmployee) && row && number(row.salary) === number(employee.salary) && number(row.premiumAmount) === 0;
    const final = row && !legacyAutoBase ? {
      salaryPay: row.salary,
      roadPay: row.roadAllowance,
      overtimeAmount: row.overtimeAmount,
      premiumAmount: row.premiumAmount,
      garnishmentAmount: row.garnishmentAmount,
      deductionAmount: row.deductionAmount,
      advanceAmount: row.advanceAmount,
      bank: row.bankAmount,
      cash: row.cashAmount,
      total: row.totalAmount,
    } : {
      salaryPay: baseSalary,
      roadPay: number(employee.roadAllowance),
      overtimeAmount: 0,
      premiumAmount: extra,
      garnishmentAmount: garnishment,
      deductionAmount: 0,
      advanceAmount: 0,
      bank: systemBank,
      cash: systemCash,
      total: baseNet,
    };
    return { employeeId: employee.id, code: employee.code, fullName: employee.fullName, department: employee.department, system: final, final, status: row && !legacyAutoBase ? row.status : "SYSTEM" };
  });'''
back = rep(back, old_adv, new_adv, 'advanced payroll')
back = back.replace('garnishmentReducesBank: true', 'garnishmentRespectsSource: true')

start = back.index('async function savePersonCard(c: Context<AppEnv>) {')
end = back.index('\nasync function updateMonthlyEmployeeFromCard', start)
new_save_card = '''async function savePersonCard(c: Context<AppEnv>) {
  const body = await bodyOf(c);
  const companyId = companyIdOf(c, body);
  const employeeId = text(c.req.param("employeeId"));
  const current = await first(c, "SELECT * FROM hr_monthly_employees WHERE id=? AND main_company_id=?", [employeeId, companyId]);
  if (!current) return error(c, 404, "NOT_FOUND", "Personel bulunamadı.");
  const cardNo = text(body.cardNo);
  if (cardNo) {
    const duplicate = await first(c, "SELECT employee_id FROM ik_person_card_settings WHERE main_company_id=? AND card_no=? AND employee_id<>?", [companyId, cardNo, employeeId]);
    if (duplicate) return error(c, 409, "DUPLICATE_CARD", "Bu kart numarası başka bir personele bağlı.");
  }
  const baseEmployeeId = text(body.baseEmployeeId);
  if (baseEmployeeId === employeeId) return error(c, 400, "INVALID_BASE_EMPLOYEE", "Personel kendisini baz personel seçemez.");
  const baseEmployee = baseEmployeeId ? await first(c, "SELECT id,salary FROM hr_monthly_employees WHERE id=? AND main_company_id=?", [baseEmployeeId, companyId]) : null;
  if (baseEmployeeId && !baseEmployee) return error(c, 400, "INVALID_BASE_EMPLOYEE", "Baz personel bulunamadı.");
  const actualSalary = number(body.salary ?? current.salary);
  if (baseEmployee && number(baseEmployee.salary) > actualSalary) return error(c, 400, "BASE_SALARY_HIGH", "Baz personel maaşı gerçek maaştan yüksek olamaz.");
  const autoExtra = baseEmployee ? Math.max(actualSalary - number(baseEmployee.salary), 0) : 0;
  const legalTypeRaw = upper(body.legalDeductionType);
  const legalType = legalTypeRaw === "HACIZ" ? "HACIZ" : legalTypeRaw === "ICRA" ? "ICRA" : "YOK";
  const legalAmount = legalType === "YOK" ? 0 : number(body.garnishmentAmount);
  const legalSource = upper(body.garnishmentSource) === "ELDEN" ? "ELDEN" : "BANKA";
  await c.env.DB.prepare(
    `INSERT INTO ik_person_card_settings (
       employee_id,main_company_id,card_no,identity_no,payroll_included,card_source,personel_kodu,exit_date,
       active_passive,work_type,sgk_follow,payment_type,note,phone,extra_payment_label,extra_payment_amount,
       base_employee_id,legal_deduction_type,garnishment_active,garnishment_amount,garnishment_source,
       legal_start_period,legal_end_period,garnishment_note,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(employee_id) DO UPDATE SET
       main_company_id=excluded.main_company_id,
       card_no=excluded.card_no,
       identity_no=excluded.identity_no,
       payroll_included=excluded.payroll_included,
       card_source=excluded.card_source,
       personel_kodu=excluded.personel_kodu,
       exit_date=excluded.exit_date,
       active_passive=excluded.active_passive,
       work_type=excluded.work_type,
       sgk_follow=excluded.sgk_follow,
       payment_type=excluded.payment_type,
       note=excluded.note,
       phone=excluded.phone,
       extra_payment_label=excluded.extra_payment_label,
       extra_payment_amount=excluded.extra_payment_amount,
       base_employee_id=excluded.base_employee_id,
       legal_deduction_type=excluded.legal_deduction_type,
       garnishment_active=excluded.garnishment_active,
       garnishment_amount=excluded.garnishment_amount,
       garnishment_source=excluded.garnishment_source,
       legal_start_period=excluded.legal_start_period,
       legal_end_period=excluded.legal_end_period,
       garnishment_note=excluded.garnishment_note,
       updated_at=excluded.updated_at`,
  ).bind(
    employeeId, companyId, cardNo, text(body.identityNo), body.payrollIncluded === false ? 0 : 1,
    text(body.cardSource) || "TNF", text(body.personelKodu || body.code), hrDateOnly(body.exitDate) || null,
    text(body.activePassive || body.status) || "AKTIF", text(body.workType) || "AYLIK",
    body.sgkFollow === null ? 2 : body.sgkFollow === false ? 0 : 1, text(body.paymentType) || "BANKA_ELDEN",
    text(body.note), text(body.phone), "EK", autoExtra, baseEmployeeId, legalType,
    legalType !== "YOK" && legalAmount > 0 ? 1 : 0, legalAmount, legalSource,
    text(body.legalStartPeriod), text(body.legalEndPeriod), text(body.garnishmentNote), nowIso(),
  ).run();
  await updateMonthlyEmployeeFromCard(c, employeeId, companyId, body, current);
  return okData(c, { employeeId, saved: true, baseEmployeeId, extraPaymentAmount: autoExtra, legalDeductionType: legalType, garnishmentSource: legalSource });
}'''
back = back[:start] + new_save_card + back[end:]

old_override_query = 'const employee = await first(c, `SELECT e.*, s.extra_payment_amount, s.garnishment_active, s.garnishment_amount FROM hr_monthly_employees e LEFT JOIN ik_person_card_settings s ON s.employee_id=e.id AND s.main_company_id=e.main_company_id WHERE e.id=? AND e.main_company_id=?`, [employeeId, companyId]);'
new_override_query = 'const employee = await first(c, `SELECT e.*, s.extra_payment_amount, s.base_employee_id, s.legal_deduction_type, s.garnishment_active, s.garnishment_amount, s.garnishment_source, s.legal_start_period, s.legal_end_period FROM hr_monthly_employees e LEFT JOIN ik_person_card_settings s ON s.employee_id=e.id AND s.main_company_id=e.main_company_id WHERE e.id=? AND e.main_company_id=?`, [employeeId, companyId]);'
back = rep(back, old_override_query, new_override_query, 'override query')

back = rep(back, '''  const existing = await first(c, "SELECT * FROM hr_payrolls_v2 WHERE main_company_id=? AND year=? AND month=? AND employee_id=?", [companyId, year, month, employeeId]);
  const salary = number(override.salaryPay ?? existing?.salary ?? employee.salary);
  const road = number(override.roadPay ?? existing?.road_allowance ?? employee.road_allowance);
  const overtime = number(override.overtimeAmount ?? existing?.overtime_amount);
  const premium = number(override.premiumAmount ?? existing?.premium_amount ?? employee.extra_payment_amount);
  const deduction = number(override.deductionAmount ?? existing?.deduction_amount);
  const advance = number(override.advanceAmount ?? existing?.advance_amount);
  const garnishment = number(override.garnishmentAmount ?? existing?.garnishment_amount ?? employee.garnishment_amount);
  const calculatedTotal = Math.max(salary + road + overtime + premium - deduction - advance - garnishment, 0);
  const plannedBank = Math.max(number(employee.bank_amount) - garnishment, 0);''', '''  const existing = await first(c, "SELECT * FROM hr_payrolls_v2 WHERE main_company_id=? AND year=? AND month=? AND employee_id=?", [companyId, year, month, employeeId]);
  const baseEmployee = text(employee.base_employee_id) ? await first(c, "SELECT id,salary FROM hr_monthly_employees WHERE id=? AND main_company_id=?", [text(employee.base_employee_id), companyId]) : null;
  const baseSalary = baseEmployee ? number(baseEmployee.salary) : number(employee.salary);
  const autoPremium = baseEmployee ? Math.max(number(employee.salary) - baseSalary, 0) : number(employee.extra_payment_amount);
  const salary = number(override.salaryPay ?? existing?.salary ?? baseSalary);
  const road = number(override.roadPay ?? existing?.road_allowance ?? employee.road_allowance);
  const overtime = number(override.overtimeAmount ?? existing?.overtime_amount);
  const premium = number(override.premiumAmount ?? existing?.premium_amount ?? autoPremium);
  const deduction = number(override.deductionAmount ?? existing?.deduction_amount);
  const advance = number(override.advanceAmount ?? existing?.advance_amount);
  const legalType = text(employee.legal_deduction_type) || (number(employee.garnishment_amount) > 0 ? "ICRA" : "YOK");
  const period = `${year}-${String(month).padStart(2, "0")}`;
  const legalInPeriod = legalType !== "YOK" && (!text(employee.legal_start_period) || period >= text(employee.legal_start_period)) && (!text(employee.legal_end_period) || period <= text(employee.legal_end_period));
  const defaultGarnishment = legalInPeriod ? number(employee.garnishment_amount) : 0;
  const garnishment = number(override.garnishmentAmount ?? existing?.garnishment_amount ?? defaultGarnishment);
  const calculatedTotal = Math.max(salary + road + overtime + premium - deduction - advance - garnishment, 0);
  const plannedBank = upper(employee.garnishment_source) === "ELDEN" ? number(employee.bank_amount) : Math.max(number(employee.bank_amount) - garnishment, 0);''', 'override calculation')

BACK.write_text(back, encoding='utf-8')

MIG.write_text('''-- İK nihai ücret planı: baz personel, otomatik EK ve hukuki kesinti kanalı.\n-- Mevcut bordro geçmişini silmez veya değiştirmez.\n\nALTER TABLE ik_person_card_settings ADD COLUMN base_employee_id TEXT NOT NULL DEFAULT '';\nALTER TABLE ik_person_card_settings ADD COLUMN legal_deduction_type TEXT NOT NULL DEFAULT 'YOK';\nALTER TABLE ik_person_card_settings ADD COLUMN garnishment_source TEXT NOT NULL DEFAULT 'BANKA';\nALTER TABLE ik_person_card_settings ADD COLUMN legal_start_period TEXT NOT NULL DEFAULT '';\nALTER TABLE ik_person_card_settings ADD COLUMN legal_end_period TEXT NOT NULL DEFAULT '';\n\nCREATE INDEX IF NOT EXISTS idx_ik_person_card_base_employee\n  ON ik_person_card_settings(main_company_id, base_employee_id);\n\n-- CUMA ÖZKURT gerçek maaşı korunur; HKN-03 MURAT MİNANZ baz alınır ve fark EK olarak hesaplanır.\nINSERT INTO ik_person_card_settings\n  (employee_id, main_company_id, personel_kodu, extra_payment_label, extra_payment_amount, base_employee_id, updated_at)\nSELECT c.id, c.main_company_id, c.code, 'EK', MAX(c.salary - b.salary, 0), b.id, CURRENT_TIMESTAMP\n  FROM hr_monthly_employees c\n  JOIN hr_monthly_employees b ON b.main_company_id = c.main_company_id AND b.code = 'HKN-03'\n WHERE c.code = 'HKN-05'\nON CONFLICT(employee_id) DO UPDATE SET\n  base_employee_id = excluded.base_employee_id,\n  extra_payment_label = 'EK',\n  extra_payment_amount = excluded.extra_payment_amount,\n  updated_at = excluded.updated_at;\n''', encoding='utf-8')

print('IK final payment patch applied.')
