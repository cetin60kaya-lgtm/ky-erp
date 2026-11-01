/** KY ERP File Hub bağımsız, salt okunur akıllı kontrol kuralları.
 * Kaynak yalnız gerçek tenant-scoped D1 bağlantı, atama, indeks ve Agent kayıtlarıdır.
 * Öneri verir, OAuth başlatmaz; silmez, taşımaz, otomatik başka buluta kopyalamaz.
 */
type Row = Record<string, any>;
export type StorageInsight = {code:string;level:"critical"|"warning"|"info";title:string;detail:string;actionTab:"connections"|"bindings"|"files"|"sync"};
type Snapshot = {connections:Row[];bindings:Row[];agents:Row[];unmatchedCount:number;missingCount:number;now?:number};
export function buildFileHubSmartDiagnostics({connections,bindings,agents,unmatchedCount,missingCount,now=Date.now()}:Snapshot):StorageInsight[]{
 const items:StorageInsight[]=[];
 const add=(code:StorageInsight["code"],level:StorageInsight["level"],title:string,detail:string,actionTab:StorageInsight["actionTab"])=>items.push({code,level,title,detail,actionTab});
 const active=connections.filter(row=>Number(row.is_active??1)!==0),cloud=active.filter(row=>String(row.sync_mode||"").toUpperCase()==="CLOUD_API");
 for(const [type,label] of [["GOOGLE_DRIVE","Google Drive"],["ONEDRIVE","Microsoft OneDrive"]]){
  if(!cloud.some(row=>String(row.provider_type||"").toUpperCase()===type))
   add("CONNECT_"+type,"warning",label+" bağlantısı eksik","Bu firma için doğrudan bulut API dosya servisi kayıtlı değil; mevcut yerel klasör aynı şey değildir.","connections");
 }
 for(const row of cloud){
  const name=String(row.name||row.provider_type||"Bulut servisi").slice(0,120);
  if(String(row.connection_status||"").toUpperCase()==="ERROR")
   add("ERROR_"+String(row.id),"critical",name+" senkron hatası",String(row.last_error||"Sağlayıcı bağlantısını ve OAuth iznini kontrol edin.").slice(0,240),"sync");
  else if(!row.last_sync_at)
   add("NEVER_SYNCED_"+String(row.id),"warning",name+" henüz taranmamış","Hesap ve klasör bağlandıktan sonra ilk senkronizasyon yapılmalı.","sync");
  else {const t=Date.parse(String(row.last_sync_at));if(Number.isFinite(t)&&now-t>24*60*60*1000)
   add("STALE_"+String(row.id),"warning",name+" senkronizasyonu eski","Son başarılı dosya taraması 24 saatten eski. Kaynak bağlantısını kontrol edin.","sync");}
  const meta=typeof row.metadata==="string"?(()=>{try{return JSON.parse(row.metadata)}catch{return {}}})():row.metadata||{};
  if(meta.syncTruncated===true)
   add("TRUNCATED_"+String(row.id),"warning",name+" klasör taraması eksik","Tarama limitine ulaşıldı; tüm dosyaların indekslendiği henüz doğrulanmadı.","sync");
 }
 if(cloud.length>0&&!bindings.some(row=>String(row.module_code||"").toUpperCase()==="DESEN"&&String(row.purpose_code||"").toUpperCase()==="MODEL_IMAGE"&&Number(row.sync_enabled??1)!==0&&cloud.some(c=>c.id===row.storage_connection_id)))
  add("DESEN_IMAGE_BINDING","warning","Desen model görseli ataması eksik","2026 klasöründeki dosyaların model kartlarına eşleşmesi için DESEN / MODEL_IMAGE atamasını seçin.","bindings");
 if(missingCount>0)add("MISSING_FILES","warning",missingCount+" kaynak dosya bulunamadı","Fiziksel dosyayı silmeden, önce sağlayıcının gerçek klasörünü ve indeks kaydını karşılaştırın.","files");
 if(unmatchedCount>0)add("UNMATCHED_FILES","info",unmatchedCount+" dosyanın ERP ilişkisi yok","Dosya indeksinden kaydı ve model/firma/evrak bağını kontrol edin; otomatik silme yapılmaz.","files");
 const local=active.filter(row=>String(row.sync_mode||"").toUpperCase()!=="CLOUD_API");
 if(local.length>0&&!agents.some(row=>{const time=Date.parse(String(row.last_seen_at||""));return Number.isFinite(time)&&now-time<5*60*1000}))
  add("AGENT_OFFLINE","warning","Yerel File Agent yanıtı güncel değil","KY Control Hub ayrı sistemdir; yerel dosya servisi için gerçek File Agent heartbeat kaydını kontrol edin.","sync");
 if(items.length===0)add("READY","info","Bağlantı ve atama denetiminde uyarı yok","Bu sonuç yalnız D1 kayıtlarının kontrolüdür. Sağlayıcı üzerinden uçtan uca dosya aktarımı ayrıca doğrulanmalıdır.","sync");
 return items;
}
