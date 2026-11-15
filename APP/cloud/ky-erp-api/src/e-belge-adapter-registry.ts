/** Canonical platform-owned e-Belge adapter registry.
 * Company selection is a separate record; a registered adapter is NOT a live connection.
 * New providers join here with their own audited driver/settings component.
 */
export const EBELGE_ADAPTERS = Object.freeze([
 {key:"ISNET",label:"İşNet / NetteFatura",family:"PROVIDER",driver:"isnet",settingsView:"ISNET",
   state:"IMPLEMENTED_UNVERIFIED",capabilities:["XML_LIST","XML_DOWNLOAD","FIRM_SELECTION"],description:"Portal ve resmî API bağlantısı; gerçek firma oturumu ayrı doğrulanır."},
 {key:"MANUAL",label:"Manuel XML / PDF",family:"SOURCE",driver:"manual-ubl",settingsView:"MANUAL",
   state:"XML_READY",capabilities:["XML_UPLOAD","UBL_REVIEW","PDF_REVIEW"],description:"XML asıl belgedir. PDF/JPEG görüntüleme, doğrulama ve gerektiğinde elle yükleme."},
 {key:"LOGO",label:"Logo Yazılım",family:"PROVIDER",driver:null,settingsView:"LOGO",
   state:"DRIVER_PENDING",capabilities:[],description:"Sistem kataloğunda tanımlı; sağlayıcı bağlantı motoru henüz yok."},
 {key:"MIKRO",label:"Mikro Yazılım",family:"PROVIDER",driver:null,settingsView:"MIKRO",
   state:"DRIVER_PENDING",capabilities:[],description:"Sistem kataloğunda tanımlı; sağlayıcı bağlantı motoru henüz yok."},
 {key:"PARASUT",label:"Paraşüt",family:"PROVIDER",driver:null,settingsView:"PARASUT",
   state:"DRIVER_PENDING",capabilities:[],description:"Sistem kataloğunda tanımlı; sağlayıcı bağlantı motoru henüz yok."},
] as const);
export type EBELGEAdapterKey = (typeof EBELGE_ADAPTERS)[number]["key"];
export function getEBELGEAdapter(key:unknown) {
 const k=String(key||"").trim().toUpperCase();
 return EBELGE_ADAPTERS.find(x=>x.key===k)||null;
}
export function classifyAdapterInstallation(key:unknown,installed:boolean) {
 const adapter=getEBELGEAdapter(key);
 if(!adapter)return {status:"UNKNOWN_ADAPTER",canConnect:false};
 if(!installed)return {status:"NOT_SELECTED",canConnect:false};
 if(adapter.driver===null)return {status:"DRIVER_PENDING",canConnect:false};
 return {status:"SELECTED_VERIFICATION_REQUIRED",canConnect:false};
}
