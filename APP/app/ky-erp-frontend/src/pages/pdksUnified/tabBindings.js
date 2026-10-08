/**
 * KY PDKS Unified: one verified presentation contract for 49 tabs.
 * Every binding below is derived from the actual Cloudflare API response.
 * "unconnected" means no matching endpoint / no proven completeness.
 * A read endpoint NEVER grants a write or local FDB/TNF acknowledgement.
 */
import {ALL_PRODUCT_TABS} from "./productModel.js";
import {displayValue,toPersonRows,toAttendanceRows} from "./productData.js";

const SOURCES = Object.freeze({
  // Read-only people/physical-card administration.
  people:"people",cards:"people",employment:"people",departments:"masters",
  groups:"masters",routes:"masters",rules:"config",
  // Only selected-person attendance. Real live aggregate not yet certified.
  punches:"attendance",exceptions:"attendance",history:"attendance",daily:"attendance",
  violations:"attendance",signatures:"attendance",attendance:"attendance",
  // Independent verified API shapes.
  leave:"leaves",holidays:"holidays",
  monthly:"monthly-attendance",timesheets:"monthly-attendance",
  closing:"month",advances:"month-adjustments",deductions:"month-adjustments",
  overtime:"month-adjustments",
  earnings:"payroll",salary:"payroll",payments:"payroll",payroll:"payroll",
  audit:"audit",corrections:"corrections",
});
const byId = new Map(ALL_PRODUCT_TABS.map((t)=>[t.id,t]));
export const TAB_BINDINGS=Object.freeze(ALL_PRODUCT_TABS.map((tab)=>Object.freeze({
  ...tab,source:SOURCES[tab.id]||"unconnected",
  safeToWrite:false,localReconciled:false,
})));
export const tabBinding=(id)=>TAB_BINDINGS.find((t)=>t.id===id)||null;
export const sourceForTab=(id,{audit=false}={})=>{
  const tab=byId.get(id);
  if(!tab)return "unconnected";
  const source=SOURCES[id]||"unconnected";
  if(audit && (tab.section==="payroll"||tab.sensitive ||
    !["people","attendance","monthly-attendance","unconnected"].includes(source)))
    return "forbidden";
  return source;
};
const arr=(data,...keys)=>{
  if(Array.isArray(data))return data;
  for(const k of keys)if(Array.isArray(data?.[k]))return data[k];
  return null; // unknown JSON layout is not an empty successful dataset
};
const field=(row,...keys)=>{
  for(const key of keys){
    const value=row?.[key];
    if(value!==null && value!==undefined && String(value).trim()!=="")return value;
  }
  return null;
};
const display=(row,...keys)=>displayValue(field(row,...keys));
const toRows=(raw,fields)=>{
  const mapped=arr(raw,"rows","items");
  if(!mapped)return {rows:[],supported:false};
  return {rows:mapped.map((record,i)=>{
    const result={_id:String(field(record,"id","employeeId","employee_id")??i)};
    for(const [heading,names] of Object.entries(fields))result[heading]=display(record,...names);
    return result;
  }),supported:true};
};
const attendanceTypes=new Set(["punches","exceptions","history","daily","violations","signatures","attendance"]);
const statusIsIssue=(day)=>{
  const code=String(day?.status||"").toUpperCase();
  return ["EKSIK_BASIM","KART_YOK","GEC_GIRIS","ERKEN_CIKIS"].includes(code)||
    day?.missingPunch===true||Number(day?.missingPunch)===1;
};

const finance = {
  "Personel":["fullName"],"Kart No":["cardNo"],"Maaş":["salary"],
  "Mesai":["overtimeAmount"],"Toplam":["totalAmount"],
  "Kesinti":["deductionAmount"],"Net":["totalAmount"],
  "Dönem":["period"],"Durum":["status"],
  "Tarih":["date"],"Tür":["adjustmentType"],"Tutar":["amount"],
  "Açıklama":["note"],"Banka":["bankAmount"],"Elden":["cashAmount"],
  "Ödeme":["status"],
};

export function rowsForTab(id,payload,{people=[],selectedPerson=null,year=null,month=null}={}){
  if(["people","cards","employment"].includes(id))
    return {rows:toPersonRows(people,id),supported:true,scope:"assigned-card-roster"};
  if(id==="departments"){
    if(!Array.isArray(payload?.groups)||!Array.isArray(payload?.personnelGroups)||
       !Array.isArray(payload?.groupAssignments)||
       !Array.isArray(payload?.personnelGroupAssignments))
      return {rows:[],supported:false};
    const count=(assignments,key,id)=>assignments.filter((a)=>String(a[key])===String(id)).length;
    const shifts=payload.groups.map((record)=>({
      _id:"shift:"+record.id,"Bölüm":"Vardiya","Grup":record.name||"—",
      "Vardiya":[record.entryTime,record.exitTime].filter(Boolean).join(" – ")||"—",
      "Kişi":String(count(payload.groupAssignments,"groupId",record.id)),
      "Yönetici":"—","Durum":Number(record.active)===0?"Pasif":"Aktif",
    }));
    const groupRows=payload.personnelGroups.map((record)=>({
      _id:"personnel-group:"+record.id,"Bölüm":"Personel grubu",
      "Grup":record.name||"—","Vardiya":record.defaultShiftId||"—",
      "Kişi":String(count(payload.personnelGroupAssignments,"personnelGroupId",record.id)),
      "Yönetici":"—","Durum":Number(record.active)===0?"Pasif":"Aktif",
    }));
    return {rows:[...shifts,...groupRows],supported:true,scope:"verified-cloud-master"};
  }
  if(attendanceTypes.has(id)){
    const days=arr(payload,"days");
    if(!days)return {rows:[],supported:false};
    if(["exceptions","violations","signatures"].includes(id)){
      return {rows:days.filter(statusIsIssue).map((day,i)=>({
        _id:"exception-"+i,
        "Kart No":selectedPerson?.cardNo||"—",
        "Personel":selectedPerson?.fullName||"—",
        "Tarih":display(day,"date","workDate"),"İhlal":display(day,"status"),
        "Kaynak":display(day,"source"),"İşlem":display(day,"note"),
        "Durum":display(day,"status"),"Kanıt":display(day,"eventCount"),
        "Eksik Hareket":display(day,"status"),
        "Saat":display(day,"entry","exit"),"İmza":"—",
      })),supported:true,scope:"selected-person"};
    }
    return {rows:toAttendanceRows(days,selectedPerson||{}),supported:true,scope:"selected-person"};
  }
  if(id==="leave")return toRows({rows:arr(payload,"plans","leaves","rows")},{
    "Personel":["fullName","employeeName"],
    "İzin Türü":["recordType"],"Başlangıç":["startDate"],"Bitiş":["endDate"],
    "Gün":["dayCount"],"Onay":["approvedBy"],"Durum":["status"],
  });
  if(id==="holidays")return toRows({rows:arr(payload,"rows","holidays")},{
    "Tarih":["date"],"Tatil Adı":["name"],"Süre":["halfDay"],
    "Çalışma Kararı":["workDecision"],"Durum":["status"],
  });
  if(id==="routes"){
    if(!Array.isArray(payload?.services)||!Array.isArray(payload?.serviceAssignments))
      return {rows:[],supported:false};
    return {rows:payload.services.map((record)=>({
      _id:String(record.id),"Hat":record.code||record.name||"—",
      "Güzergâh":record.routeNote||"—",
      "Personel":String(payload.serviceAssignments.filter((a)=>
        String(a.serviceId)===String(record.id)).length),
      "Dönem":"—","Durum":Number(record.active)===0?"Pasif":"Aktif",
    })),supported:true,scope:"verified-cloud-master"};
  }
  if(id==="groups")return toRows({rows:arr(payload?.personnelGroups)},{
    "Grup":["name"],"Vardiya":["defaultShiftId"],
    "Kişi":["employeeCount"],"Bölüm":["department"],
    "Yönetici":["manager"],"Durum":["active"],
  });
  if(id==="monthly"||id==="timesheets"){
    const rows=arr(payload,"rows");
    if(!rows || payload?.complete!==true)return {rows:[],supported:false};
    return toRows({rows},{
      "Kart No":["cardNo"],"Personel":["fullName"],
      "Çalışılan":["workedDays"],"İzin":["annualLeaveDays"],
      "Mesai":["overtimeMinutes"],"Eksik":["missingPunchDays"],
      "Durum":["sourceStatus"],"Rapor":["report"],"Dönem":["period"],
      "Gün":["workedDays"],
    });
  }
  if(id==="closing"){
    if(!payload?.close||typeof payload.close.isLocked!=="boolean")
      return {rows:[],supported:false};
    return {rows:[{
      _id:"period","Dönem":`${year}-${String(month).padStart(2,"0")}`,
      "Kontrol":"—","Eksik":"—","Onaylayan":"—",
      "Kilit":payload.close.isLocked?"Kilitli":"Açık",
      "Durum":"D1 dönem kaydı (FDB/TNF kontrolü yok)",
    }],supported:true,scope:"cloud-period-only"};
  }
  if(["advances","deductions","overtime"].includes(id)){
    const source=arr(payload,"adjustments");
    if(!source)return {rows:[],supported:false};
    const check=id==="advances"?/AVANS|EK_KAZANC|PRIM|YOL|YEMEK/ :
      id==="overtime"?/MESAI/ : /KESINTI|ICRA|HACIZ|BES/;
    const relevant=source.filter((row)=>check.test(String(row.adjustmentType||"").toUpperCase()));
    return toRows({rows:relevant},{
      "Personel":["employeeName"],"Tarih":["date"],
      "Tür":["adjustmentType"],"Tutar":["amount"],
      "Saat":["hourOrDay"],"Oran":["approvedRate"],"Gerekçe":["note"],
      "Onay":["status"],"Durum":["status"],"Açıklama":["note"],
    });
  }
  if(["earnings","salary","payments"].includes(id)){
    // Actual /operations/payroll payload: {year,month,lines}.
    const source=arr(payload,"lines");
    if(!source)return {rows:[],supported:false};
    return toRows({rows:source},finance);
  }
  if(id==="payroll"){
    const source=arr(payload,"lines");
    if(!source)return {rows:[],supported:false};
    return {rows:[{_id:"pdks-payroll-summary","Rapor":"Bordro özeti",
      "Dönem":`${year}-${String(month).padStart(2,"0")}`,
      "Yetki":"Yetkili oturum","Durum":"D1 görünümü, FDB/TNF mutabakat bekliyor"}],
      supported:true,scope:"sensitive-summary"};
  }
  if(id==="corrections"){
    const source=arr(payload,"rows","corrections");
    if(!source)return {rows:[],supported:false};
    return toRows({rows:source},{
      "Personel":["fullName","employeeName"],"Tarih":["workDate","date"],
      "Alan":["field","type"],"Eski":["oldValue","oldValueText"],
      "Yeni":["newValue","newValueText"],
      "Gerekçe":["reason","note"],"Onay":["status"],
    });
  }
  if(id==="audit")return toRows({rows:arr(payload,"rows","logs")},{
    "Tarih":["createdAt"],"Kullanıcı":["userName"],
    "İşlem":["actionType"],"Kaynak":["sourceScreen"],
    "Eski/Yeni":["reason"],"Sonuç":["result"],
  });
  if(id==="rules"){
    const config=payload?.rules;
    return Array.isArray(config)?toRows({rows:config},{
      "Kural":["name","code"],"Grup":["groupName"],
      "Geçerlilik":["effectiveDate"],"Onay":["approvedBy"],"Durum":["status"],
    }):{rows:[],supported:false};
  }
  return {rows:[],supported:false};
}
export function integrationCoverage(){
  const counts=TAB_BINDINGS.reduce((result,item)=>{
    result[item.source]=(result[item.source]||0)+1;return result;
  },{});
  return {total:TAB_BINDINGS.length,...counts};
}
