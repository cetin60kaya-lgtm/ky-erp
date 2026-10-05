import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const monthly = readFileSync(new URL("./IkAdvancedMonthly.jsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../../../../AppV3.jsx", import.meta.url), "utf8");
const financePage = readFileSync(new URL("./IkFinancePage.jsx", import.meta.url), "utf8");
const shell = readFileSync(new URL("./IkMonthlyProShell.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./ik.monthly.pro.css", import.meta.url), "utf8");

test("monthly HR uses the professional command shell without replacing payroll rules", () => {
  assert.match(monthly, /IkMonthlyProShell/);
  assert.match(monthly, /periodPrepared=\{periodPrepared\}/);
  assert.match(monthly, /balanced=\{periodPrepared && balanced\}/);
  assert.match(monthly, /paidCount=\{payrollRows\.filter/);
  assert.match(monthly, /renderBordro\(\)/);
  assert.match(monthly, /renderEvrak\(\)/);
  assert.match(monthly, /reconcilePaymentSplit/);
});

test("professional shell exposes the seven canonical HR work areas", () => {
  const labels = [
    "Kontrol Merkezi",
    "Personel",
    "Ücret Planı",
    "Mesai / Avans",
    "Yıllık İzin",
    "Bordro / Ödeme",
    "SGK / Ay Sonu",
  ];
  labels.forEach((label) => assert.ok(shell.includes(label), label));
  assert.ok(shell.includes("Dönem Hazırlığı"));
  assert.ok(shell.includes("Kontrol"));
  assert.ok(shell.includes("Ödeme"));
  assert.ok(shell.includes("Kapanış"));
});

test("monthly HR professional UI stays responsive and keeps dense tables usable", () => {
  assert.match(css, /ik-pro-command/);
  assert.match(css, /ik-pro-overview-strip/);
  assert.match(css, /ik-pro-flow/);
  assert.match(css, /max-height: 560px/);
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /@media \(max-width: 560px\)/);
});


test("personnel cards use master detail UX and a real canonical create route", () => {
  assert.match(monthly, /openNewPerson/);
  assert.match(monthly, /createIkAdvancedPerson/);
  assert.match(monthly, /ik-pro-personnel-layout/);
  assert.match(monthly, /ik-pro-roster-item/);
  assert.match(monthly, /Detay Personel Tablosunu Aç/);
  assert.match(monthly, /fourth: "Durum", fifth: "SGK"/);
  assert.match(css, /ik-pro-personnel-layout/);
  assert.match(css, /ik-pro-profile-grid/);
  assert.match(css, /ik-pro-finance-snapshot/);
});

test("new personnel is blocked in a closed period and duplicate card is checked before save", () => {
  assert.match(monthly, /Kapalı dönemde yeni personel kartı açılamaz/);
  assert.match(monthly, /duplicateCard/);
  assert.match(monthly, /Bu kart numarası başka bir personele bağlı/);
});

test("personnel cards use the complete HKN master roster while payroll stays period scoped", () => {
  assert.match(monthly, /const rawMasterEmployees = safeList\(data\.masterEmployees\)/);
  assert.match(monthly, /const masterEmployees = useMemo\(\(\) => sortHknEmployees\(rawMasterEmployees\.filter\(isHknEmployee\)\)/);
  assert.match(monthly, /const employees = safeList\(data\.employees\)\.filter\(\(item\) => payrollVisibleEmployee\(item, period\)\)/);
  assert.match(monthly, /filteredMasterEmployees/);
  assert.match(monthly, /İK Ana Personel Kadrosu/);
  assert.match(monthly, /nextHknCode\(masterEmployees\)/);
  assert.match(monthly, /Personel Kodu/);
  assert.match(monthly, /HKN Değiştir/);
});

test("personnel edit modal switches person without closing", () => {
  assert.match(monthly, /const switchPersonInModal = \(employeeId\) =>/);
  assert.match(monthly, /Personel Seç/);
  assert.match(monthly, /← Önceki/);
  assert.match(monthly, /Sonraki →/);
  assert.match(monthly, /switchPersonInModal\(event\.target\.value\)/);
  assert.match(monthly, /person-modal-position/);
  assert.match(css, /\.person-modal-nav\{/);
});

test("personnel list keeps single-click selection and opens edit on double click", () => {
  assert.match(monthly, /title="Tek tık: seç · Çift tık: düzenle"/);
  assert.match(monthly, /onClick=\{\(\) => setSelectedId\(employee\.id\)\} onDoubleClick=\{\(\) => openPerson\(employee\)\}/);
});

test("personnel selection survives live refresh against the full master roster", () => {
  assert.match(monthly, /const masterSelectionIds = new Set/);
  assert.match(monthly, /safeList\(result\?\.masterEmployees\)\.map\(\(item\) => item\.id\)/);
  assert.match(monthly, /safeList\(result\?\.rawEmployees\)\.map\(\(item\) => item\.id\)/);
  assert.match(monthly, /setSelectedId\(\(old\) => masterSelectionIds\.has\(old\)/);
});

test("person card save stays usable when the selected historical month is locked", () => {
  assert.match(monthly, /skipPeriodCompliance: Boolean\(data\.close\?\.isLocked\)/);
  assert.match(monthly, /periodComplianceSkipped/);
  assert.match(monthly, /person-save-message/);
  assert.match(monthly, /dönemi kapalı olduğu için yalnız dönemsel SGK alanlarına dokunulmadı/);
  assert.match(monthly, /disabled=\{Boolean\(data\.close\?\.isLocked\) \|\| modalDraft\.sgkDaySource==="RESMI_BORDRO"\}/);
});

test("monthly write dialogs surface validation and accept canonical SGK day values", () => {
  assert.match(monthly, /const hasSgkDays = modalDraft\.sgkDays !== ""/);
  assert.match(monthly, /SGK gün sayısı 0-30 arasında olmalıdır/);
  assert.match(monthly, /hasSgkDays \? Math\.round\(num\(modalDraft\.sgkDays\)\) : null/);
  assert.match(monthly, /modal && notice \? createPortal/);
  assert.match(css, /\.ik-modal-notice\{/);
});

test("monthly mutation buttons are guarded against duplicate submit while busy", () => {
  assert.match(monthly, /disabled=\{busy\} onClick=\{saveFinance\}/);
  assert.match(monthly, /disabled=\{busy\} onClick=\{saveLeave\}/);
  assert.match(monthly, /disabled=\{busy \|\| !balanced\} onClick=\{printPayrollReport\}/);
  assert.match(monthly, /disabled=\{busy \|\| !balanced\} onClick=\{exportPayroll\}/);
  assert.match(monthly, /disabled=\{busy \|\| data\.close\?\.isLocked\} onClick=\{refreshPayroll\}/);
});

test("live sync is quiet, slower and does not show loading loops for background refresh", () => {
  assert.match(monthly, /const IK_LIVE_SYNC_INTERVAL_MS = 15000/);
  assert.match(monthly, /lastSuccessfulLoadStartedAtRef/);
  assert.match(monthly, /silent = false/);
  assert.match(monthly, /load\(\{ force: true, prepare: periodPrepared, silent: true \}\)/);
  assert.doesNotMatch(monthly, /başka bilgisayarda değişiklik var/);
});

test("person card separates SGK source, suggestion and PDKS control days", () => {
  assert.match(monthly, /SGK Gün \(Kayıt\)/);
  assert.match(monthly, /Önerilen SGK Gün/);
  assert.match(monthly, /PDKS Kartlı Gün \(Kontrol\)/);
  assert.match(monthly, /SGK Gün Kaynağı/);
  assert.match(monthly, /Öneriyi Kullan/);
  assert.match(monthly, /RESMI_BORDRO/);
  assert.match(monthly, /SISTEM_ONERISI/);
  assert.match(css, /\.inline-action-field/);
});

test("payroll person actions link to the same source movements", () => {
  assert.match(monthly, /Hareketleri Yönet/);
  assert.match(monthly, /Mesai Ekle/);
  assert.match(monthly, /Avans Ekle/);
  assert.match(monthly, /Kesinti Ekle/);
  assert.match(monthly, /Bordrodan Düzelt/);
});


test("payroll and document controls filter the rows they display", () => {
  assert.match(monthly, /payrollPaymentFilter/);
  assert.match(monthly, /payrollStatusFilter/);
  assert.match(monthly, /const filteredPayrollRows = useMemo/);
  assert.match(monthly, /filteredPayrollRows\.map/);
  assert.match(monthly, /documentFilter/);
  assert.match(monthly, /visibleDocumentEmployeeIds/);
  assert.match(monthly, /filteredDocuments\.map/);
});


test("selected-month employment state ignores today's passive flag and explains the selected period", () => {
  assert.match(monthly, /function employmentStateAtPeriod/);
  assert.match(monthly, /periodEmploymentState/);
  assert.match(monthly, /\$\{periodName\} · Aktif/);
  assert.match(monthly, /\$\{periodName\} · İşe Başlamamış/);
  assert.match(monthly, /\$\{periodName\} · Çıkış Ayı/);
  assert.match(monthly, /\["ACTIVE", "NEW_HIRE", "EXIT_MONTH", "ENTERED_EXITED", "MISSING_HIRE_DATE"\]/);
  assert.match(monthly, /Giriş Tarihi Eksik/);
});

test("IK uses one canonical monthly workspace for personnel salary movements leave and payroll", () => {
  assert.doesNotMatch(app, /IkPersonnelFinancePage/);
  assert.match(app, /IkFinancePage/);
  assert.match(financePage, /"personel-kartlari": "personel"/);
  assert.match(monthly, /renderPersonel\(\)/);
  assert.match(monthly, /renderUcret\(\)/);
});

test("canonical personnel workspace supports selected bulk salary and road changes with history", () => {
  assert.match(monthly, /saveIkAdvancedBulkCompensation/);
  assert.match(monthly, /Toplu Ücret \/ Yol Düzenleme/);
  assert.match(monthly, /SALARY_PERCENT/);
  assert.match(monthly, /ROAD_SET/);
  assert.match(monthly, /ROAD_PERCENT/);
  assert.match(monthly, /Geçerlilik Tarihi/);
});

test("annual leave keeps proof-grade day-by-day snapshots and printable ledger", () => {
  assert.match(monthly, /Gün Gün İzin Dökümü/);
  assert.match(monthly, /leavePreview\.dayDetails/);
  assert.match(monthly, /Gün Dökümünü Yazdır \/ PDF/);
  assert.match(monthly, /policySnapshot/);
  assert.match(monthly, /effectType/);
});

test("official payroll output is the payment completion action", () => {
  assert.match(monthly, /const finalizePayrollForOutput/);
  assert.match(monthly, /status:\s*"PAID"/);
  assert.match(monthly, /window\.confirm/);
  assert.match(monthly, /Bordroyu Tamamla \/ PDF/);
  assert.match(monthly, /10['’]lu Fiş \+ Tamamla/);
  assert.match(monthly, /Tamamla \/ Excel/);
});


test("all IK dialogs use the shared overflow-safe modal standard", () => {
  assert.match(css, /\/\* IK modal standard - all dialogs \*\//);
  assert.match(css, /\.modal-bg \.mb\{[\s\S]*overflow-y:auto;[\s\S]*overflow-x:hidden;/);
  assert.match(css, /\.modal-bg \.mf\{[\s\S]*margin:auto 0 0;/);
  assert.match(css, /\.modal-bg \.tw,[\s\S]*overflow:auto;/);
});

test("personnel card supports clear exit/reactivation plus simplified admin maintenance", () => {
  assert.match(monthly, /İşten Çıkış Bugün/);
  assert.match(monthly, /Aktife Geri Al/);
  assert.match(monthly, /adminMaintainIkAdvancedPerson/);
  assert.match(monthly, /canAdminMaintainPersonnel/);
  assert.match(monthly, /HKN Değiştir/);
  assert.match(monthly, />Birleştir<\/button>/);
  assert.match(monthly, />Sil<\/button>/);
  assert.match(monthly, /adminActionMessage/);
  assert.doesNotMatch(monthly, /adminCodeConfirm|adminDeleteConfirm|adminMergeConfirm/);
});


test("monthly payroll and movement list use only the selected period movements", () => {
  assert.match(monthly, /const periodMovements = useMemo/);
  assert.match(monthly, /String\(item\.date \|\| ""\)\.startsWith\(period\)/);
  assert.match(monthly, /return periodMovements\.filter/);
  assert.match(monthly, /const own = periodMovements\.filter/);
  assert.match(monthly, /\[periodMovements, payrollLines, rawEmployees\]/);
});
