// Firma sahibi ekranları için gerçek işlem başlıkları ve görünür rotalar.
export function roleModules(modules,role) {
  const normalized=String(role||"").toUpperCase().replace(/İ/g,"I");
  if(normalized!=="COMPANY_ADMIN")return modules;
  return modules.map(module=>module.key!=="admin"?module:{
    ...module,
    label:"Firma Yönetimi",
    groups:[{label:"Firma Yönetimi",tabs:[
      ["admin-yonetim-ozeti","Firma Özeti","dashboard"],
      ["kullanicilar","Kullanıcılar","users"],
      ["admin-guvenlik","Güvenlik Merkezi","guvenlik"],
      ["admin-sistem","Firma Yetkileri","users"],
    ]}],
    hiddenTabs:[],
  });
}
