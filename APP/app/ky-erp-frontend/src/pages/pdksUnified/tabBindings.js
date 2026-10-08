/**
 * One typed presentation contract for the whole KY PDKS menu.
 * Each tab is either backed by an existing authenticated read API, or
 * explicitly unavailable pending Windows Agent/Cloud implementation.
 * Never manufacture empty payroll/punch rows as if a query succeeded.
 */
import { ALL_PRODUCT_TABS } from "./productModel.js";
import { displayValue, toPersonRows, toAttendanceRows } from "./productData.js";

const map = Object.freeze({
  // Existing personnel and authorized account sources.
  people: "people", cards: "people", employment: "people",
  departments: "masters", shift: "masters", routes: "masters",
  rules: "config", holidays: "holidays", leave: "leaves",
  // Selected physical-card employee attendance is exposed by the D1 API;
  // the source cannot be labeled FDB/TNF verified until reconciled.
  live: "attendance", punches: "attendance", exceptions: "attendance",
  history: "attendance", daily: "attendance", violations: "attendance",
  signatures: "attendance", attendance: "attendance",
  // Existing D1 analytical endpoints.
  monthly: "month", timesheets: "month", validation: "month",
  earnings: "payroll", salary: "payroll", advances: "payroll",
  deductions: "payroll", payments: "payroll", receipts: "payroll",
  audit: "audit", system: "audit",
  // Every other tab intentionally stays without a falsely claimed API.
});
export const TAB_BINDINGS = Object.freeze(ALL_PRODUCT_TABS.map((tab) =>
  Object.freeze({ ...tab, source: map[tab.id] || "unconnected",
    safeToWrite: false, requiresSourceReconciliation: tab.section !== "people" })
));

export const tabBinding = (id) =>
  TAB_BINDINGS.find((x)=>x.id === id) || null;

export const sourceForTab = (id, { audit = false } = {}) => {
  const tab = tabBinding(id);
  if (!tab) return "unconnected";
  if (audit && (tab.section === "payroll" || tab.id === "payroll")) return "forbidden";
  return tab.source;
};

const list = (value,...properties) => {
  if(Array.isArray(value)) return value;
  for(const property of properties) if(Array.isArray(value?.[property])) return value[property];
  return [];
};
const first = (row,...keys) => {
  for(const key of keys) {
    const v=row?.[key];
    if(v !== null && v !== undefined && String(v).trim() !== "") return v;
  }
  return null;
};
const d = (...args) => displayValue(first(...args));
const projected = (rows, fields) => rows.map((raw,index) => {
  const result={_id:String(first(raw,"id","employeeId","code") ?? index)};
  for(const [column,keys] of Object.entries(fields)) result[column]=d(raw,...keys);
  return result;
});

const groupFields = {
  "Bölüm":["name","department","departmentName"],
  "Grup":["code","name","group"],
  "Vardiya":["entryTime","startTime","shift"],
  "Kişi":["peopleCount","employeeCount","count"],
  "Yönetici":["manager","managerName"],
  "Durum":["status","active"],
};
const routeFields = {
  "Hat":["code","name"],"Güzergâh":["routeNote","description"],
  "Personel":["employeeCount","personnelCount"],"Dönem":["period"],
  "Durum":["status","active"],
};
const shiftFields = {
  "Personel":["employeeName","fullName"],"Tarih":["workDate","date"],
  "Vardiya":["name","shiftName"],"Başlangıç":["entryTime","startTime"],
  "Bitiş":["exitTime","endTime"],"Onay":["approval","status"],
};
const leaveFields={
  "Personel":["fullName","employeeName","employeeId"],
  "İzin Türü":["recordType","record_type","leaveType"],
  "Başlangıç":["startDate","start_date"],
  "Bitiş":["endDate","end_date"],
  "Gün":["days","durationDays"],"Onay":["approval","approvedBy"],
  "Durum":["status","state"],
};
const holidayFields={
  "Tarih":["date","holidayDate"],"Tatil Adı":["name","holidayName"],
  "Süre":["duration","halfDay"],"Çalışma Kararı":["workDecision","workStatus"],
  "Durum":["status","state"],
};
const auditFields={
  "Tarih":["createdAt","created_at","date"],
  "Kullanıcı":["userName","user_name","actorName"],
  "İşlem":["actionType","action_type","operation"],
  "Kaynak":["sourceScreen","source_screen","source"],
  "Eski/Yeni":["changeSummary","details"],"Sonuç":["result","status"],
};
const monthlyFields={
  "Kart No":["cardNo","card_no"],
  "Personel":["fullName","employeeName","personName"],
  "Çalışılan":["workedDays","workDays"],"İzin":["annualLeaveDays","leaveDays"],
  "Mesai":["overtimeMinutes","overtimeHours"],"Eksik":["missingPunchDays","missingDays"],
  "Durum":["status","state"],
};
const payrollFields={
  "Kart No":["cardNo","card_no"],
  "Personel":["fullName","employeeName","personName"],
  "Maaş":["salary","baseSalary","netSalary"],
  "Yol":["transport","roadAllowance","travel"],
  "Yemek":["meal","mealAllowance"],"Mesai":["overtimeAmount","overtime"],
  "Toplam":["total","netTotal","totalEarnings"],
  "Brüt":["gross","grossSalary"],"Kesinti":["deductions","deductionTotal"],
  "Net":["net","netSalary"],"Dönem":["period"],
  "Durum":["status"],"Ödeme":["paymentStatus","paid"],
  "Tarih":["date","workDate"],"Tür":["type","movementType"],
  "Tutar":["amount"],"Onay":["approvedBy","approval"],
  "Açıklama":["note","description"],"Banka":["bank","bankAmount"],
  "Elden":["cash","cashAmount"],"Belge":["document","receipt"],
  "İmza":["signature","signed"],"Kart":["cardNo"],
};

/**
 * Returns {rows, supported}, never an invented success. Raw API containers
 * are only handled when they follow the project's existing response shape.
 */
export function rowsForTab(tabId, payload, { people=[],selectedPerson=null }={}) {
  if(["people","cards","employment"].includes(tabId))
    return {rows:toPersonRows(people,tabId),supported:true};
  if(["live","punches","history","daily","exceptions","violations","signatures","attendance"].includes(tabId)){
    const days=list(payload,"days");
    const base=toAttendanceRows(days,selectedPerson || {});
    const isException=(raw) => ["EKSIK_BASIM","KART_YOK","GEC_GIRIS","ERKEN_CIKIS"].includes(String(raw?.status||"").toUpperCase())
      || Number(raw?.missingPunch) === 1 || raw?.missingPunch === true;
    if(["exceptions","violations","signatures"].includes(tabId)){
      const rows=days.filter(isException).map((day,i)=>({
        "Kart No":selectedPerson?.cardNo ?? "—","Personel":selectedPerson?.fullName ?? "—",
        "Tarih":d(day,"date","workDate"),"İhlal":d(day,"status"),
        "Kaynak":d(day,"source"),"İşlem":d(day,"note"),"Durum":d(day,"status"),
        "Kanıt":d(day,"eventCount"),"Eksik Hareket":d(day,"status"),
        "Saat":d(day,"entry","exit"),"İmza":"—",_id:"i"+i,
      }));
      return {rows,supported:true,scope:"selected-person"};
    }
    return {rows:base,supported:true,scope:"selected-person"};
  }
  if(tabId==="departments"){
    const groups=list(payload,"groups","workGroups");
    return {rows:projected(groups,groupFields),supported:true};
  }
  if(tabId==="shift"){
    const groups=list(payload,"groups","workGroups");
    return {rows:projected(groups,shiftFields),supported:true,scope:"shift-definitions"};
  }
  if(tabId==="routes")
    return {rows:projected(list(payload,"services","routes"),routeFields),supported:true};
  if(tabId==="leave")
    return {rows:projected(list(payload,"plans","leaves","rows"),leaveFields),supported:true};
  if(tabId==="holidays")
    return {rows:projected(list(payload,"holidays","rows"),holidayFields),supported:true};
  if(["audit","system"].includes(tabId))
    return {rows:projected(list(payload,"logs","rows","items"),auditFields),supported:true};
  if(["monthly","timesheets","validation"].includes(tabId))
    return {rows:projected(list(payload,"rows","people","items","summaryRows"),monthlyFields),supported:true};
  if(["earnings","salary","advances","deductions","payments","receipts"].includes(tabId))
    return {rows:projected(list(payload,"rows","people","items","payroll"),payrollFields),supported:true};
  if(tabId==="rules")
    return {rows:projected(list(payload,"rules","rows"),{
      "Kural":["code","name"],"Grup":["groupName","workGroup"],
      "Geçerlilik":["effectiveDate","effectiveFrom"],"Onay":["approvedBy"],
      "Durum":["status","active"],
    }),supported:true};
  return {rows:[],supported:false};
}

export const integrationCoverage = () => {
  const summary=TAB_BINDINGS.reduce((memo,tab)=>{
    memo[tab.source]=(memo[tab.source]||0)+1;return memo;
  },{});
  return {total:TAB_BINDINGS.length,...summary};
};
