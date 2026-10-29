// Platform Yönetimi için tek canonical işlem ve rota sözlüğü.
export const ADMIN_SECTIONS=[
  {key:"management",label:"Yönetim",description:"Kullanıcı, firma, yetki ve paket işlemleri",panels:[
    {route:"admin-yonetim-ozeti",label:"Genel Bakış",description:"Durum, onay ve kontrol",icon:"dashboard"},
    {route:"kullanicilar",label:"Kullanıcılar",description:"Kişi ekle, düzenle ve yetkilendir",icon:"users"},
    {route:"ana-firma-ayarlar",label:"Firmalar",description:"Firma kartları ve PDKS ayarları",icon:"building"},
    {route:"firma-yetkilileri",label:"Firma Yetkilileri",description:"Firma sahibi yetkisi ver veya kaldır",icon:"user-cog"},
    {route:"firma-ucretlendirme",label:"Paket ve Ücretler",description:"Paket, dönem ve hareket geçmişi",icon:"credit-card"},
  ]},
  {key:"security",label:"Güvenlik",description:"Giriş, oturum ve hesap koruması",panels:[
    {route:"admin-guvenlik",label:"Güvenlik Merkezi",description:"Giriş onayları, cihaz ve oturumlar",icon:"shield"},
    {route:"uygulama-sahibi",label:"Süper Yönetici",description:"MFA, hesap güvenliği ve kurtarma",icon:"key"},
  ]},
  {key:"system",label:"Sistem",description:"Uygulama, bağlantı ve yayın kontrolleri",panels:[
    {route:"admin-sistem",label:"Uygulama Ayarları",description:"Arayüz ve hızlı işlem tercihleri",icon:"settings"},
    {route:"dosya-klasor-yonetimi",label:"Dosya ve Depolama",description:"Klasörler, servisler ve agent",icon:"database"},
    {route:"eslestirmeler",label:"Firma / Ürün Eşleştirme",description:"Ürün ve firma eşleştirmeleri",icon:"git"},
    {route:"yedekleme-loglar",label:"Yedek ve Kayıtlar",description:"Yedekleme, geri yükleme ve loglar",icon:"archive"},
    {route:"surum-merkezi",label:"Windows Build",description:"Sürüm ve kurulum paketi üretimi",icon:"package"},
    {route:"guncelleme-gecmisi",label:"Güncelleme Geçmişi",description:"PR, commit, test ve yayın kanıtları",icon:"history"},
  ]},
];
export const ADMIN_PRIMARY_ROUTES=["admin-yonetim-ozeti","admin-guvenlik","admin-sistem"];
export const ADMIN_COMPAT_TABS=[["uygulama-ayarlari","Uygulama Ayarları","ayarlar"],["giris-onaylari","Giriş Onayları","file-check"]];
export function findAdminPanel(route){
  const target=route==="uygulama-ayarlari"?"admin-sistem":route==="giris-onaylari"?"admin-guvenlik":route;
  for(const section of ADMIN_SECTIONS){
    const panel=section.panels.find(item=>item.route===target);
    if(panel)return {section,panel};
  }
  return null;
}
export function getAdminPrimaryTabs(){
  return ADMIN_PRIMARY_ROUTES.map(route=>{const {panel}=findAdminPanel(route);return [route,panel.label,panel.icon];});
}
export function getAdminHiddenTabs(){
  return [...ADMIN_SECTIONS.flatMap(section=>section.panels).filter(panel=>!ADMIN_PRIMARY_ROUTES.includes(panel.route)).map(panel=>[panel.route,panel.label,panel.icon]),...ADMIN_COMPAT_TABS];
}
