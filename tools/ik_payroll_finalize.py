from pathlib import Path
import re
import sys

path = Path(sys.argv[1] if len(sys.argv) > 1 else "APP/app/ky-erp-frontend/src/pages/modules/IkAdvancedMonthly.jsx")
text = path.read_text(encoding="utf-8")


def sub(pattern, replacement, label, flags=0):
    global text
    text, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, found {count}")


# Bordro düzeltme modalı, personel kartındaki ek ödeme ve icra değerlerini alsın.
sub(
    r'(const openPayroll = \(row = .*?setModalDraft\(\{.*?\n\s*road: row\.road,)(\n\s*overtime: row\.overtime,.*?\n\s*deduction: row\.deduction,)(\n\s*bank: row\.bank,)',
    r'\1\n      extra: row.extra,\2\n      garnishment: row.garnishment,\3',
    "openPayroll",
    re.S,
)

# Plan toplamı kontrolüne kişi bazlı ek ödeme de dahil olsun.
old_validation = 'if (planTotal > num(modalDraft.salary) + num(modalDraft.roadAllowance) && !window.confirm("Banka plan + elden plan maas/yol toplamindan yuksek. Devam edilsin mi?")) return;'
new_validation = 'if (planTotal > num(modalDraft.salary) + num(modalDraft.roadAllowance) + num(modalDraft.extraPaymentAmount) && !window.confirm("Banka plan + elden plan ücret/yol/ek ödeme toplamından yüksek. Devam edilsin mi?")) return;'
if old_validation not in text:
    raise SystemExit("person plan validation not found")
text = text.replace(old_validation, new_validation, 1)

# Sadece savePerson fonksiyonunda yeni alanları API payloadına ekle.
person_match = re.search(r'(const savePerson = async \(\) => \{.*?\n\s*\};)(?=\n\n\s*const validateFinance)', text, re.S)
if not person_match:
    raise SystemExit("savePerson block not found")
person = person_match.group(1)
needle = "cashAmount: num(modalDraft.cashAmount),"
if needle not in person:
    raise SystemExit("savePerson cashAmount not found")
person = person.replace(
    needle,
    needle
    + '''
        extraPaymentLabel: modalDraft.extraPaymentLabel || "Ek Ödeme / Prim",
        extraPaymentAmount: num(modalDraft.extraPaymentAmount),
        garnishmentActive: modalDraft.garnishmentActive === true && num(modalDraft.garnishmentAmount) > 0,
        garnishmentAmount: modalDraft.garnishmentActive === true ? num(modalDraft.garnishmentAmount) : 0,
        garnishmentNote: modalDraft.garnishmentNote || "",''',
    1,
)
text = text[: person_match.start(1)] + person + text[person_match.end(1) :]

# Bordro düzeltmesinde de prim ve icra kalıcı kayda girsin.
payroll_override = '''  const savePayrollOverride = async () => {
    const totals = calcRow({
      salary: modalDraft.salary,
      road: modalDraft.road,
      extra: modalDraft.extra,
      overtime: modalDraft.overtime,
      advance: modalDraft.advance,
      deduction: modalDraft.deduction,
      garnishment: modalDraft.garnishment,
      bank: modalDraft.bank,
      cash: modalDraft.cash,
    });
    if (totals.diff !== 0 && !window.confirm("Banka + elden net odeme ile eslesmiyor. Devam edilsin mi?")) return;
    setBusy(true);
    try {
      await saveIkAdvancedPayrollOverride({
        mainCompanyId: companyId,
        year,
        month,
        employeeId: modalDraft.employeeId,
        reason: modalDraft.reason || "Bordro kontrol duzeltmesi",
        override: {
          roadPay: num(modalDraft.road),
          overtimeAmount: num(modalDraft.overtime),
          premiumAmount: num(modalDraft.extra),
          advanceAmount: num(modalDraft.advance),
          deductionAmount: num(modalDraft.deduction),
          garnishmentAmount: num(modalDraft.garnishment),
          bank: num(modalDraft.bank),
          cash: num(modalDraft.cash),
          total: totals.net,
        },
      });
      setModal(null);
      setNotice("Bordro duzeltmesi kaydedildi.");
      await load();
    } catch (error) {
      setNotice(error?.message || "Bordro duzeltmesi kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };
'''
sub(
    r'  const savePayrollOverride = async \(\) => \{.*?\n  \};\n(?=\n  const refreshPayroll)',
    payroll_override,
    "savePayrollOverride",
    re.S,
)

# Excel'de yeni kalemleri ayrı kolonlarla göster.
export_block = '''  const exportPayroll = () => {
    exportRowsToExcelFile(`ik-bordro-${period}.xlsx`, payrollRows.map((row) => ({
      personel: row.employee.fullName,
      sgk: sgkLabel(row.employee),
      odeme: paymentLabel(row.employee),
      maas: row.salary,
      yol: row.road,
      ekOdemeAdi: row.extraLabel,
      ekOdeme: row.extra,
      mesai: row.overtime,
      avans: row.advance,
      kesinti: row.deduction,
      icraKesintisi: row.garnishment,
      hakedis: row.hakedis,
      netOdenecek: row.net,
      banka: row.bank,
      elden: row.cash,
      toplam: row.total,
      durum: row.diff === 0 ? "Dengeli" : "Kontrol",
    })));
  };
'''
sub(
    r'  const exportPayroll = \(\) => \{.*?\n  \};\n(?=\n\n  const printPayrollReport)',
    export_block,
    "exportPayroll",
    re.S,
)

path.write_text(text, encoding="utf-8")

# Kaynak seviyesinde zorunlu kontroller.
checks = [
    'extraPaymentLabel: modalDraft.extraPaymentLabel',
    'garnishmentAmount: modalDraft.garnishmentActive === true',
    'premiumAmount: num(modalDraft.extra)',
    'garnishmentAmount: num(modalDraft.garnishment)',
    'extra: row.extra',
    'garnishment: row.garnishment',
    'bankPlanAfterGarnishment',
    'Ek Ödeme Adı',
    'Aylık İcra Tutarı',
    'İcra Kesintisi',
]
updated = path.read_text(encoding="utf-8")
missing = [item for item in checks if item not in updated]
if missing:
    raise SystemExit("missing source markers: " + ", ".join(missing))

print("IK payroll finalizer applied and verified")
