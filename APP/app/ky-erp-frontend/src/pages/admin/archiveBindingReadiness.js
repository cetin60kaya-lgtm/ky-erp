// Display only. The archive job's server-side checks remain authoritative.
export function archiveBindingReadiness(verified, bindings=[],connections=[]){
 const labels=["Arşiv ataması","Okuma / yazma / senkron","Dosya servisi","İndeks"];
 const unknown=message=>({checks:labels.map(label=>({label,value:"—"})),message});
 if(!verified)return unknown("Firma bağlantıları doğrulanmadı.");
 const rows=bindings.filter(r=>["E_BELGE","EBELGE"].includes(r.module_code)&&r.purpose_code==="E_DOCUMENT");
 if(rows.length!==1)return unknown(rows.length?"Birden fazla e-Belge ataması var.":"e-Belge arşiv ataması yok.");
 const row=rows[0],c=connections.find(x=>x.id===row.storage_connection_id&&x.isActive===true);
 const flags=[row.readEnabled,row.writeEnabled,row.syncEnabled];
 const supported=c?.provider_type==="GOOGLE_DRIVE"&&c?.sync_mode==="CLOUD_API";
 const index=c?.last_sync_at&&!c?.metadata?.cloudSyncCursor&&!c?.metadata?.cloudNeedsFullRescan;
 return {checks:[{label:labels[0],value:row.root_path||"Servis ana klasörü"},{label:labels[1],value:flags.map(x=>x===true?"Açık":x===false?"Kapalı":"Bilinmiyor").join(" / ")},{label:labels[2],value:c?(c.connection_status||"Bilinmiyor"):"Aktif servis yok"},{label:labels[3],value:index?"Son tarama kayıtlı":c?.metadata?.cloudSyncCursor?"Tarama sürüyor / bekliyor":"Doğrulanmadı"}],message:!supported?"Canlı İşNet aktarımı için Google Drive CLOUD_API ataması gerekiyor.":flags.some(x=>x!==true)?"Mevcut atamada üç izin de doğrulanmalı; otomatik izin değişikliği yapılmaz.":c.connection_status!=="CONNECTED"?"Dosya servisi sağlığı doğrulanmalı.":!index?"İndeks ilerlemesi kontrol edilmeli.":"Ön koşullar okunabildi; aktarım öncesi sunucu arşiv kontrolü gerekir."};
}
