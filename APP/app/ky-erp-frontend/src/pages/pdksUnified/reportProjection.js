/** Read-only projections from full, authenticated D1 monthly attendance. */
const val=value=>value===undefined||value===null||value===""?"—":String(value);
const validIso=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value??""));
const isIssue=day=>["KART_YOK","EKSIK_BASIM","GEC_GIRIS","ERKEN_CIKIS"]
 .includes(String(day.status||"").toUpperCase())||Number(day.lateMinutes)>0||
 Number(day.earlyMinutes)>0||day.missingPunch===true;
export function dailyReportRows(person,days,{year,month}={}){
 if(!person?.id||!Array.isArray(days))throw Error("PDKS_GUNLUK_KAYNAK_GECERSIZ");
 const prefix=String(year)+"-"+String(month).padStart(2,"0")+"-";
 const seen=new Set();
 return days.map(day=>{
  const date=String(day?.date??day?.workDate??"");
  if(!validIso(date)||!date.startsWith(prefix)||seen.has(date))
   throw Error("PDKS_GUNLUK_TARIH_VE_TEKILLIK_HATASI");
  seen.add(date);
  const status=String(day?.status??"");
  return {
   _id:String(person.id)+"|"+date,personId:String(person.id),
   "Kart No":val(person.cardNo),"Personel":val(person.fullName),
   "Tarih":date,"Giriş":val(day.entry),"Çıkış":val(day.exit),
   "Kaynak":val(day.source),"E":day.source==="MANUAL_OVERRIDE"?"İdari düzeltme":"—",
   "Süre":val(day.workedMinutes),"Durum":val(status),"İhlal":isIssue(day)?val(status):"—",
   "Kanıt":val(day.eventCount),"İşlem":isIssue(day)?"İnceleme bekliyor":"—",
   _issue:isIssue(day),
  };
 });
}
export function projectMonthlyReport(id,payload){
 if(payload?.complete!==true||!Array.isArray(payload?.rows))
  return {rows:[],supported:false};
 if(id==="timesheets"){
  return {rows:payload.rows.map((row,i)=>({
   _id:String(row._id??i),personId:String(row._id??""),
   "Rapor":"D1 ön puantajı","Personel":val(row.fullName),
   "Dönem":val(row.period),"Gün":val(row.workedDays),
   "Mesai":val(row.overtimeMinutes),"İzin":val(row.annualLeaveDays),
   "Durum":"FDB/TNF ve bordro onayı bekleniyor",
  })),supported:true};
 }
 if(["attendance","violations"].includes(id)){
  if(!Array.isArray(payload.dailyRows))return {rows:[],supported:false};
  const data=id==="violations"?payload.dailyRows.filter(row=>row._issue):payload.dailyRows;
  return {rows:data,supported:true,scope:"d1-monthly-daily-unreconciled"};
 }
 return {rows:[],supported:false};
}
