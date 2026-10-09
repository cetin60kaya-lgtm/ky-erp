// KY ERP release evidence: only GitHub's verified actions and commit ancestry can prove live status.
export const KY_REPO = "cetin60kaya-lgtm/ky-erp";
export const KY_BRANCH = "codex/model-uretim-kontrol-merkezi-final";
export const GITHUB_API = "https://api.github.com/repos/" + KY_REPO;
export const GITHUB_SITE = "https://github.com/" + KY_REPO;
export function releaseKind(run) {
  const name=String(run?.name||"");
  if(name==="KY ERP Frontend Canonical Deploy")return "FRONTEND";
  if(name==="KY ERP Worker Canli Yayin")return "WORKER";
  if(name==="KY ERP Canli Yayin - Hedefli D1 + Worker + Pages")return "BOTH";
  return "OTHER";
}
export function verifiedRelease(run) {
  return run?.status==="completed" && run?.conclusion==="success" && ["FRONTEND","WORKER","BOTH"].includes(releaseKind(run));
}
export function firstVerifiedRun(runs,kind) {
  return (runs||[]).find(run=>verifiedRelease(run)&&(releaseKind(run)===kind||releaseKind(run)==="BOTH"))||null;
}
export function releaseEvidence(mergeSha,frontProof,workerProof) {
  const sha=String(mergeSha||"");
  const web=Boolean(sha&&frontProof?.ready&&frontProof.shas?.has(sha));
  const api=Boolean(sha&&workerProof?.ready&&workerProof.shas?.has(sha));
  return {
    web,api,
    label:web&&api?"Arayüz + API canlı kanıtlı":web?"Arayüz canlı kanıtlı":api?"API canlı kanıtlı":"Canlılık henüz kanıtlanamadı",
    level:web&&api?"live":web||api?"partial":"unknown"
  };
}
export function changeStatus(pr,frontProof,workerProof) {
  if(pr?.draft && !pr?.merged_at)return {label:"Taslak PR",level:"draft"};
  if(!pr?.merged_at)return {label:"Açık PR — canlı değil",level:"open"};
  if(!pr?.merge_commit_sha)return {label:"Birleştirildi — canlı kanıtı bekliyor",level:"merged"};
  const result=releaseEvidence(pr.merge_commit_sha,frontProof,workerProof);
  return result.level==="unknown"?{label:"Birleştirildi — yayın kanıtı yok",level:"merged"}:result;
}
// Modules are derived from canonical moduleRegistry routes; statuses are not fictional E2E claims.
export const QA_MODULES = [
  {name:"Muhasebe",route:"/muhasebe/yonetim-ozeti",check:"Cari, XML/e-Belge, fatura ve KDV"},
  {name:"e-Belge",route:"/e-belge/genel-bakis",check:"Gelen/giden XML, PDF, eşleştirme ve arşiv"},
  {name:"İK",route:"/ik/ozet",check:"Personel, izin, mesai, bordro ve kayıt yetkisi"},
  {name:"Günlük Operasyon",route:"/gunluk-operasyon/daily-dashboard",check:"Günlük giriş, vardiya, hakediş ve ödeme"},
  {name:"PDKS",route:"/pdks/ana-ekran",check:"Cihaz, giriş/çıkış, puantaj, personel senkronu"},
  {name:"Desen",route:"/desen/gelen-desenler",check:"Desen havuzu, model, görsel ve dosya"},
  {name:"Boyahane",route:"/boyahane/is-akisi",check:"Reçete, stok, lot, numune ve rapor"},
  {name:"İmalat",route:"/uretim/uretim-merkezi",check:"Model, vardiya, üretim, mükerrer kayıt koruması"},
  {name:"Mail & Dosyalar",route:"/iletisim/mail-gelen",check:"Mail kutusu, gönderim, Drive bağlantısı"},
  {name:"Denetim",route:"/compliance/denetim-genel",check:"Evrak, CAPA, belge süresi ve hatırlatmalar"},
  {name:"Bağlantılar",route:"/depolama/depolama-genel",check:"Dosyalar, bağlantılar, yedek, entegrasyon"},
  {name:"Sistem Merkezi",route:"/sistem-merkezi/sistem-nobetcisi",check:"Sistem sağlık, izleme ve uyarı"},
  {name:"Platform",route:"/admin/admin-yonetim-ozeti",check:"Firma, kullanıcı, güvenlik, sürüm, yetkiler"},
  {name:"Asistan",route:"/asistan/sohbet",check:"Yalnız yetkili kullanıcı, tenant sınırı ve komut koruması"}
];
export function moduleOf(text) {
  const s=String(text||"").toLocaleLowerCase("tr-TR");
  if(/güncelleme geçmişi|guncelleme-gecmisi|platform yönetimi|sürüm merkez|release history/.test(s))return "Platform";
  if(/pdks|puantaj|kart okut|terminal/.test(s))return "PDKS";
  if(/e-belge|ubl-tr|işnet/.test(s))return "e-Belge";
  if(/muhasebe|fatura|irsaliye|(?<![\p{L}])çek(?![\p{L}])|cari|kdv/u.test(s))return "Muhasebe";
  if(/günlük operasyon|gunluk-operasyon|daily-dashboard/.test(s))return "Günlük Operasyon";
  if(/mail & dosyalar|mail merkezi|gelen kutusu|drive/.test(s))return "Mail & Dosyalar";
  if(/denetim|capa|disney|sedex/.test(s))return "Denetim";
  if(/bağlantılar|depolama|dosya servisi/.test(s))return "Bağlantılar";
  if(/sistem merkezi|sistem nöbetçisi/.test(s))return "Sistem Merkezi";
  if(/(?:^|[^\p{L}])ik(?:$|[^\p{L}])|personel|bordro|maaş|izin|mesai|avans/u.test(s))return "İK";
  if(/imalat|üretim|makina|makine|model/.test(s))return "İmalat";
  if(/boyahane|lot|reçete/.test(s))return "Boyahane";
  if(/desen|dtf|photoshop/.test(s))return "Desen";
  if(/güvenlik|mfa|oturum|login|auth|cihaz/.test(s))return "Güvenlik";
  if(/cloudflare|worker|pages|deploy|canlı|frontend|api|yayın/.test(s))return "Bulut";
  return "Genel";
}
export function shortSha(value) {return String(value||"").slice(0,9)||"-";}
export function localStamp(value) {
  if(!value)return "-";
  const d=new Date(value);
  return Number.isNaN(d.valueOf())?"-":d.toLocaleString("tr-TR",{dateStyle:"short",timeStyle:"short"});
}
