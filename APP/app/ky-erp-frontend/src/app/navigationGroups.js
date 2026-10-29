// Tek kanonik ana menü: sol panel ile Ana Sayfa aynı başlık, sıra ve yetki gruplarını kullanır.
export const KY_NAV_GROUPS = [
  { key:"daily", title:"Personel & İK", description:"Aylık İK, günlük personel ve PDKS", keys:["ik","gunluk-operasyon","pdks"] },
  { key:"production", title:"Üretim", description:"Desen, imalat ve boyahane", keys:["desen","uretim","boyahane"] },
  { key:"finance", title:"Muhasebe & Finans", description:"Cari hesaplar, faturalar ve e-Belge", keys:["muhasebe","e-belge"] },
  { key:"company", title:"Denetim & Uygunluk", description:"Firma denetimleri, evraklar ve süreler", keys:["compliance"] },
  { key:"communication", title:"İletişim & Dosyalar", description:"E-posta, firma dosyaları ve asistan", keys:["iletisim","asistan"] },
  { key:"management", title:"Yönetim & Sistem", description:"Yönetim, güvenlik, bağlantılar ve sistem", keys:["admin","depolama","sistem-merkezi"] },
];
export function visibleNavigationGroups(modules=[]) {
  const access=new Map(modules.filter(module=>module?.key && module.key!=="ana-sayfa").map(module=>[module.key,module]));
  return KY_NAV_GROUPS.map(group=>({...group,modules:group.keys.map(key=>access.get(key)).filter(Boolean)})).filter(group=>group.modules.length);
}
export function navigationGroupFor(moduleKey) {
  return KY_NAV_GROUPS.find(group=>group.keys.includes(moduleKey))?.key || "";
}
