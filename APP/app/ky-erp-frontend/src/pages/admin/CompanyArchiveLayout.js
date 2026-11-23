/**
 * KY ERP | Ortak firma arşiv ağacı.
 *
 * Sadece görecekleri tek ana klasör Google Drive/OneDrive/SharePoint'tir.
 * Modüller bu dizin adlarını değil, kanonik moduleCode+purposeCode bağlarını
 * kullanır. Firmanın özel klasör ismi File Hub binding.root_path değeridir.
 * Bu dosya Google Drive'da dosya taşımaz veya kendiliğinden yetki vermez.
 */
export const ARCHIVE_LAYOUT_VERSION="KYERP_COMPANY_ARCHIVE_V2_20261122";

export const ARCHIVE_SECTIONS=Object.freeze([
 {key:"DESEN",label:"Desen",path:"DESEN",areas:["Modeller","Görseller","Giden Desenler","Yerleşim Dosyaları","DTF"],hint:"PSD, AI, TIFF, model ve kalıp belgeleri"},
 {key:"MUHASEBE",label:"Muhasebe",path:"MUHASEBE",areas:["e-Belgeler","Sahadan Gelen İrsaliye","Çek ve Ödemeler","Cari ve Gider Evrakları","Vergi ve KDV"],hint:"XML asıl, PDF ek; tek belge kimliği"},
 {key:"BOYAHANE",label:"Boyahane",path:"BOYAHANE",areas:["Model Formları","Reçeteler","Kalite"],hint:"Model bağlantılı formlar, reçete ve kalite"},
 {key:"IK",label:"İnsan Kaynakları",path:"İK",areas:["Personel Evrakları","Bordro ve Ödemeler","İzin ve Puantaj"],hint:"Özlük/maaş belgelerinde ayrıca erişim denetimi gerekir",sensitive:true},
 {key:"IMALAT",label:"İmalat",path:"İMALAT",areas:["İş Emirleri","Sevkiyat"],hint:"Üretim ve sevkiyat belgeleri"},
 {key:"DENETIM",label:"Denetim",path:"DENETİM",areas:["Denetim Evrakları (FAMA, Disney, LC Waikiki)","Standartlar (LCW, ZDHC, GOTS)","MSDS","TDS","Periyodik Bakımlar","Prosedürler ve Talimatlar","Kimyasal Envanter ve Deklarasyonlar","Çevre ve Emisyon","Eğitimler ve Katılım Kayıtları","Denetim Raporları ve CAPA","İmzalı Orijinaller ve Revizyonlar","LOT ve Reçete Kanıtları","İSG ve Acil Durum","Kalite ve Test Raporları"],hint:"Orijinaller File Hub sağlayıcısında; eski revizyonlar korunur, yeni kanıtlar onay bekler",sensitive:true},
 {key:"FORMLAR",label:"Formlar",path:"FORMLAR",areas:["Yemek","Temizlik","Genel"],hint:"Günlük işletme formları"},
 {key:"YONETIM",label:"Yönetim",path:"YÖNETİM",areas:["Firma Yedekleri","Loglar","Sistem Raporları","Firma Belgeleri"],hint:"Yedek ve log dosyaları ayrıca doğrulanan işlerdir",sensitive:true},
 {key:"OTOMASYON",label:"Otomasyon",path:"OTOMASYON",areas:[],hint:"KY Control ve mevcut otomasyon dosyaları korunur"},
 {key:"GELEN",label:"Gelen Dosyalar",path:"gelen dosyalar",areas:[],hint:"Sınıflandırılmayı bekleyen kaynaklar"},
].map(row=>Object.freeze({...row,areas:Object.freeze(row.areas)})));

const rawAssignments=[
 ["DESEN","MODEL_SOURCE","DESEN/Modeller"],
 ["DESEN","MODEL_IMAGE","DESEN/Görseller"],
 ["DESEN","PLACEMENT","DESEN/Yerleşim Dosyaları"],
 ["DESEN","OUTGOING_DESIGN","DESEN/Giden Desenler"],
 ["DTF","MODEL_SOURCE","DESEN/DTF"],
 ["DTF","RIP_PDF","DESEN/DTF"],
 ["IMALAT","TECHNICAL_SHEET","İMALAT/İş Emirleri"],
 ["IMALAT","PRODUCTION_PHOTO","İMALAT/İş Emirleri"],
 ["BOYAHANE","MODEL_FORM","BOYAHANE/Model Formları"],
 ["BOYAHANE","RECIPE","BOYAHANE/Reçeteler"],
 ["BOYAHANE","QUALITY","BOYAHANE/Kalite"],
 ["BOYAHANE","GENERIC","BOYAHANE/Model Formları"],
 ["E_BELGE","E_DOCUMENT","MUHASEBE/e-Belgeler"],
 ["MUHASEBE","DELIVERY_NOTE","MUHASEBE/Sahadan Gelen İrsaliye"],
 ["MUHASEBE","CHEQUE","MUHASEBE/Çek ve Ödemeler"],
 ["MUHASEBE","PAYMENT_DOCUMENT","MUHASEBE/Çek ve Ödemeler"],
 ["MUHASEBE","PURCHASE_INVOICE","MUHASEBE/Cari ve Gider Evrakları"],
 ["MUHASEBE","EXPENSE_RECEIPT","MUHASEBE/Cari ve Gider Evrakları"],
 ["MUHASEBE","TAX_DOCUMENT","MUHASEBE/Vergi ve KDV"],
 ["IK","PERSONNEL_DOCUMENT","İK/Personel Evrakları"],
 ["IK","EMPLOYEE_PAYROLL","İK/Bordro ve Ödemeler"],
 ["IK","EMPLOYEE_PAYMENT","İK/Bordro ve Ödemeler"],
 ["IK","EMPLOYEE_LEAVE","İK/İzin ve Puantaj"],
 ["PDKS","ATTENDANCE_REPORT","İK/İzin ve Puantaj"],
 ["DENETIM","AUDIT_REPORT","DENETİM/Denetim Raporları ve CAPA"],
 ["DENETIM","MSDS","DENETİM/MSDS"],
 ["DENETIM","TDS","DENETİM/TDS"],
 ["DENETIM","PERIODIC_MAINTENANCE","DENETİM/Periyodik Bakımlar"],
 ["DENETIM","AUDIT_EVIDENCE","DENETİM/Denetim Evrakları"],
 ["DENETIM","OHS_DOCUMENT","DENETİM/İSG ve Acil Durum"],
 ["DENETIM","QUALITY","DENETİM/Kalite ve Test Raporları"],
 ["DENETIM","PROCEDURE","DENETİM/Prosedürler ve Talimatlar"],
 ["DENETIM","DECLARATION","DENETİM/Kimyasal Envanter ve Deklarasyonlar/Tedarikçi Deklarasyonları"],
 ["DENETIM","INVENTORY","DENETİM/Kimyasal Envanter ve Deklarasyonlar/Kimyasal Envanterler"],
 ["DENETIM","TRAINING","DENETİM/Eğitimler ve Katılım Kayıtları"],
 ["DENETIM","ENVIRONMENT","DENETİM/Çevre ve Emisyon"],
 ["DENETIM","LOT_EVIDENCE","DENETİM/LOT ve Reçete Kanıtları"],
 ["DENETIM","SIGNED_ORIGINAL","DENETİM/İmzalı Orijinaller ve Revizyonlar"],
 ["DENETIM","CERTIFICATE","DENETİM/Standartlar"],
 ["YONETIM","BACKUP_MANIFEST","YÖNETİM/Firma Yedekleri"],
 ["YONETIM","SYSTEM_LOG","YÖNETİM/Loglar"],
 ["YONETIM","SYSTEM_REPORT","YÖNETİM/Sistem Raporları"],
 ["FORMLAR","FORM_TEMPLATE","FORMLAR/Genel"],
 ["FIRMA","COMPANY_REGISTRY","YÖNETİM/Firma Belgeleri"],
 ["FIRMA","COMPANY_LICENSE","YÖNETİM/Firma Belgeleri"],
 ["GENEL","GENERIC","gelen dosyalar"],
];
export const ARCHIVE_DEFAULT_BINDINGS=Object.freeze(rawAssignments.map(([moduleCode,purposeCode,rootPath])=>
 Object.freeze({moduleCode,purposeCode,rootPath})));

export function archiveBindingFor(moduleCode,purposeCode){
 const mod=String(moduleCode||"").toUpperCase();
 const purpose=String(purposeCode||"").toUpperCase();
 return ARCHIVE_DEFAULT_BINDINGS.find(row=>row.moduleCode===mod&&row.purposeCode===purpose)||null;
}

export function archiveAssignmentStatus(template,bindings,connections){
 const connectionIds=new Set((connections||[]).filter(row=>row.isActive!==false).map(row=>row.id));
 const found=(bindings||[]).find(row=>row.module_code===template.moduleCode &&
   row.purpose_code===template.purposeCode && connectionIds.has(row.storage_connection_id));
 return found ? {
  state:"CONNECTED",rootPath:String(found.root_path||""),
  connectionId:found.storage_connection_id,
  readEnabled:found.readEnabled!==false,
  writeEnabled:found.writeEnabled===true,
  syncEnabled:found.syncEnabled===true,
  customized:String(found.root_path||"")!==template.rootPath
 } : {state:"NOT_CONNECTED",rootPath:template.rootPath,customized:false};
}

export function archiveLayoutForSection(section){
 const prefix=section.path+"/";
 return ARCHIVE_DEFAULT_BINDINGS.filter(row=>row.rootPath===section.path||row.rootPath.startsWith(prefix));
}
