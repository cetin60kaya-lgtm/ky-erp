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
export function moduleOf(text) {
  const s=String(text||"").toLocaleLowerCase("tr-TR");
  if(/pdks|puantaj|kart okut|terminal/.test(s))return "PDKS";
  if(/ik\b|personel|bordro|maaş|izin|mesai|avans/.test(s))return "İK";
  if(/muhasebe|fatura|e-belge|irsaliye|çek|cari|kdv/.test(s))return "Muhasebe";
  if(/imalat|üretim|makina|makine|model/.test(s))return "İmalat";
  if(/boyahane|lot|reçete/.test(s))return "Boyahane";
  if(/desen|dtf|photoshop/.test(s))return "Desen";
  if(/güvenlik|mfa|oturum|login|auth|cihaz/.test(s))return "Güvenlik";
  if(/cloudflare|worker|pages|deploy|release|canlı|frontend|api|yayın/.test(s))return "Bulut";
  return "Genel";
}
export function shortSha(value) {return String(value||"").slice(0,9)||"-";}
export function localStamp(value) {
  if(!value)return "-";
  const d=new Date(value);
  return Number.isNaN(d.valueOf())?"-":d.toLocaleString("tr-TR",{dateStyle:"short",timeStyle:"short"});
}
