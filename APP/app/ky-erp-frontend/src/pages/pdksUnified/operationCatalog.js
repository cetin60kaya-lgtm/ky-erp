/**
 * Single KY PDKS operation schema. No UI or API may silently invent punch
 * events or mutate the Firebird/annual-TNF physical evidence.
 * All actions below are CLOUD D1 configuration/administrative changes only.
 */
const field=(id,label,type="text",required=true,options=[])=>Object.freeze({id,label,type,required,options});
const operation=(id,title,tabId,fields,endpoint,collection,warning)=>Object.freeze({
  id,title,tabId,fields,endpoint,collection,warning,scope:"CLOUD_D1_ONLY",
});
export const OPERATION_CATALOG=Object.freeze([
  operation("work-group","Çalışma vardiyası tanımla","departments",[
    field("code","Vardiya kodu"),field("name","Vardiya adı"),
    field("entryTime","Planlanan giriş saati","time"),
    field("exitTime","Planlanan çıkış saati","time"),
    field("lateTolerance","Geç tolerans (dakika)","number"),
    field("earlyTolerance","Erken tolerans (dakika)","number"),
    field("reason","İşlem gerekçesi"),
  ],"work-group","groups","Bu tanım fiziksel kart basımı veya fiilî çalışma kaydı üretmez."),
  operation("personnel-group","Personel çalışma grubu tanımla","departments",[
    field("code","Grup kodu"),field("name","Grup adı"),
    field("personnelClass","Personel sınıfı","select",true,[
      {value:"BLUE_COLLAR",label:"Üretim / mavi yaka"},
      {value:"WHITE_COLLAR",label:"İdari / beyaz yaka"},
      {value:"CUSTOM",label:"Özel grup"},
    ]),
    field("requirePunch","Kart basma zorunluluğu","select",true,[
      {value:"true",label:"Kart zorunlu"},{value:"false",label:"Kart zorunlu değil"},
    ]),field("reason","İşlem gerekçesi"),
  ],"personnel-group","personnelGroups","Kart zorunluluğu grup kuralıdır; SGK durumu değildir."),
  operation("assign-work-group","Personele vardiya ata","departments",[
    field("employeeId","Personel","person"),
    field("groupId","Çalışma vardiyası","group"),field("reason","Atama gerekçesi"),
  ],"assign-work-group","groupAssignments","Bu işlem yalnız vardiya atamasını değiştirir, kart geçmişini değiştirmez."),
  operation("assign-personnel-group","Personele çalışma grubu ata","departments",[
    field("employeeId","Personel","person"),
    field("personnelGroupId","Personel grubu","personnelGroup"),field("reason","Atama gerekçesi"),
  ],"assign-personnel-group","personnelGroupAssignments","Personel çalışma grubu ve kart basma politikası ayrıca doğrulanmalıdır."),
  operation("service","Servis hattı tanımla","routes",[
    field("code","Hat kodu"),field("name","Hat adı"),
    field("routeNote","Güzergâh açıklaması"),field("reason","İşlem gerekçesi"),
  ],"service","services","Servis hattı, personel kart hareketini değiştirmez."),
  operation("assign-service","Personele servis ata","routes",[
    field("employeeId","Personel","person"),field("serviceId","Servis hattı","service"),
    field("reason","Atama gerekçesi"),
  ],"assign-service","serviceAssignments","Servis ataması ücret/bordro veya yol kesintisi oluşturmaz."),
  operation("holiday","Resmî tatil kararı kaydet","holidays",[
    field("date","Tarih","date"),field("name","Tatil adı"),
    field("halfDay","Tatil süresi","select",true,[
      {value:"false",label:"Tam gün"},
      {value:"true",label:"Yarım gün"},
    ]),field("note","İşyeri çalışma kararı / gerekçe"),
  ],"holiday","holidays","Yarım gün tatilde fiilî çalışma kararı açıkça doğrulanmalıdır."),
  operation("leave","Personel izin kaydı","leave",[
    field("employeeId","Personel","person"),
    field("recordType","İzin türü","select",true,[
      {value:"YILLIK",label:"Yıllık izin"},
      {value:"MAZERET",label:"Mazeret"},
      {value:"RAPOR",label:"Sağlık raporu"},
    ]),field("startDate","İlk izin tarihi","date"),
    field("endDate","Son izin tarihi","date"),field("note","İzin ve onay gerekçesi"),
  ],"leave","plans","Mevcut Cloud API bu kaydı ONAYLI oluşturur. Önizleme ve açık yönetici onayı zorunludur; FDB/TNF mutabakatı ayrıca yapılır."),
  operation("overtime","Mesai / fazla çalışma kaydı","overtime",[
    field("employeeId","Personel","person"),field("date","Mesai tarihi","date"),
    field("adjustmentType","Mesai türü","select",true,[
      {value:"Hafta İçi Mesai",label:"Hafta içi mesai"},
      {value:"Hafta Sonu Mesai",label:"Hafta sonu mesai"},
      {value:"Resmi Tatil Mesai",label:"Resmî tatil mesaisi"},
    ]),
    field("hourOrDay","Mesai saati","number"),field("amount","Onaylı mesai tutarı (TL)","number"),
    field("paymentMethod","Ödeme yöntemi","select",true,[
      {value:"Bordro",label:"Bordro"},{value:"Elden",label:"Elden"},
    ]),field("note","Mesai oranı / onay gerekçesi"),
  ],"adjustment","adjustments","Bu kayıt bordroyu etkileyebilir. %50/%100 oranı burada otomatik hesaplanmaz; onaylı tutar açıkça girilir."),
  operation("deduction","Personel kesintisi kaydet","deductions",[
    field("employeeId","Personel","person"),field("date","Kesinti tarihi","date"),
    field("amount","Onaylı kesinti tutarı (TL)","number"),
    field("note","Kesinti hukuki/işlemsel dayanağı"),
  ],"adjustment","adjustments","Kesinti doğrudan maddi sonuç doğurur. Yalnız belgeli onayla uygulanabilir."),
  operation("advance","Personele avans kaydet","advances",[
    field("employeeId","Personel","person"),field("date","Avans tarihi","date"),
    field("amount","Avans tutarı (TL)","number"),field("note","Avans onay gerekçesi"),
  ],"advance","adjustments","Avans bordroyu etkiler; kayıt ONAYLI olabilir. Yalnız yetkili gerçek işlem olarak uygulanır."),
]);
const map=new Map(OPERATION_CATALOG.map((o)=>[o.id,o]));
export const operationById=(id)=>map.get(id)||null;
export const operationsForTab=(id)=>OPERATION_CATALOG.filter((o)=>o.tabId===id);
const validDate=(s)=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(s)))return false;
  const [y,m,d]=String(s).split("-").map(Number);
  const actual=new Date(Date.UTC(y,m-1,d));
  return actual.getUTCFullYear()===y && actual.getUTCMonth()+1===m && actual.getUTCDate()===d;
};
const required=(value)=>typeof value==="string" && value.trim().length>0;
const codeSafe=(value)=>/^[\p{L}0-9_-]{2,40}$/u.test(value);
const at=(record,k)=>String(record?.[k]??"").trim();

export function makeOperationPreview(id,values,{company,people=[],masters={},year,month}={}){
  const op=operationById(id);
  if(!op)throw new Error("İşlem tanımı bulunamadı.");
  if(!required(company))throw new Error("Firma seçimi zorunlu.");
  const form={};
  for(const field of op.fields){
    const value=at(values,field.id);
    if(field.required&&!value)throw new Error(field.label+" zorunlu.");
    if(field.type==="select"&&!field.options.some((o)=>o.value===value))
      throw new Error(field.label+" geçersiz.");
    form[field.id]=value;
  }
  const reason=form.reason||form.note;
  if(!required(reason)||reason.length<8)throw new Error("İşlem gerekçesi en az 8 karakter olmalı.");
  if(form.code&&!codeSafe(form.code))throw new Error("Kod 2–40 harf/rakam, kısa çizgi veya alt çizgi olmalı.");
  // These forms CREATE new definitions. They must never silently overwrite an
  // existing row through the legacy API's ON CONFLICT code UPSERT behavior.
  const createCollections={"work-group":"groups","personnel-group":"personnelGroups",service:"services"};
  if(createCollections[id]){
    const records=masters?.[createCollections[id]];
    if(!Array.isArray(records))throw new Error("Tanım listesi doğrulanmadan yeni kayıt açılamaz.");
    if(records.some((record)=>String(record.code||"").toLocaleUpperCase("tr-TR")===
      form.code.toLocaleUpperCase("tr-TR")))
      throw new Error("Bu kod zaten kayıtlı. Mevcut tanım sessizce değiştirilemez.");
  }
  if(form.name&&form.name.length>150)throw new Error("Ad 150 karakterden uzun olamaz.");
  if(form.entryTime&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.entryTime))throw new Error("Geçerli giriş saati zorunlu.");
  if(form.exitTime&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.exitTime))throw new Error("Geçerli çıkış saati zorunlu.");
  for(const t of ["lateTolerance","earlyTolerance"]){
    if(form[t]!==undefined && (!/^\d+$/.test(form[t])||Number(form[t])>240))
      throw new Error(t+" 0–240 dakika olmalı.");
  }
  for(const k of ["date","startDate","endDate"])if(form[k]&&!validDate(form[k]))
    throw new Error(k+" geçersiz tarih.");
  if(form.startDate&&form.endDate&&form.endDate<form.startDate)throw new Error("Bitiş tarihi başlangıçtan önce.");
  if(form.amount && (!/^\d+(?:[.,]\d{1,2})?$/.test(form.amount)||
    Number(form.amount.replace(",","."))<=0))throw new Error("Pozitif avans tutarı girin.");
  if(form.date && Number(year)&&Number(month) &&
    form.date.slice(0,7)!==`${year}-${String(month).padStart(2,"0")}`)
      throw new Error("İşlem tarihi seçili ay/yıla ait olmalı.");
  if(form.employeeId && !people.some((p)=>String(p.id)===form.employeeId))
    throw new Error("Personel seçili firma kapsamına ait değil.");
  const selections={groupId:"groups",personnelGroupId:"personnelGroups",serviceId:"services"};
  for(const [key,source] of Object.entries(selections)){
    if(form[key]&&!Array.isArray(masters[source]))throw new Error("İlgili tanım listesi yüklenmedi.");
    if(form[key]&&!masters[source].some((row)=>String(row.id)===form[key] && row.active!==0))
      throw new Error("Seçilen tanım aktif veya mevcut değil.");
  }
  if(form.halfDay==="true" && form.note.length<20)
    throw new Error("Yarım gün tatil için çalışma kararı en az 20 karakterle açıklanmalı.");
  const payload={...form,mainCompanyId:company};
  if(id==="work-group"){
    payload.lateTolerance=Number(form.lateTolerance);
    payload.earlyTolerance=Number(form.earlyTolerance);
  }
  if(id==="personnel-group")payload.requirePunch=form.requirePunch==="true";
  if(id==="holiday")payload.halfDay=form.halfDay==="true";
  if(form.amount)payload.amount=Number(form.amount.replace(",","."));
  if(id==="overtime"){
    const hours=Number(form.hourOrDay);
    if(!Number.isFinite(hours)||hours<=0||hours>24)
      throw new Error("Mesai saati 0'dan büyük ve en fazla 24 olmalı.");
    payload.hourOrDay=hours;
  }
  if(id==="deduction")payload.adjustmentType="Kesinti";
  // Never submit extra implicit status=APPROVED/punch entries.
  const immutable=Object.freeze({id,tabId:op.tabId,title:op.title,
    company,year,month,payload:Object.freeze(payload),
    warning:op.warning,source:"CLOUD_D1_ONLY"});
  return immutable;
}
