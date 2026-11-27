import {useEffect,useRef,useState} from "react";
import {apiGet,apiPost,apiPut} from "../../../utils/api";
import "./eBelgeOperator.css";
const unwrap=v=>v?.ok===true?v.data:v;
export default function EBelgeSmartWorkspace({activeMainCompany,openModule,compact=false}){
 const slug=activeMainCompany?.slug||activeMainCompany?.id||"";
 const [command,setCommand]=useState(""),[answers,setAnswers]=useState({}),[missing,setMissing]=useState([]),[proposal,setProposal]=useState(null),[id,setId]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[saved,setSaved]=useState(null);
 const lock=useRef(false);
 const [policy,setPolicy]=useState(null),[policyError,setPolicyError]=useState(""),[aiSuggestion,setAiSuggestion]=useState(null);
 useEffect(()=>{let live=true;if(!slug)return;apiGet("/e-belge/operator-policy",{mainCompanySlug:slug},{forceFresh:true}).then(unwrap).then(r=>{if(live&&String(r?.mainCompanySlug||"").toLowerCase()===String(slug).toLowerCase())setPolicy(r)}).catch(e=>{if(live)setPolicyError(e.message||"Firma AI politikası okunamadı.")});return()=>{live=false}},[slug]);
 const scope=r=>String(r?.mainCompanySlug||"").toLowerCase()===String(slug).toLowerCase();
 const change=v=>{setAiSuggestion(null);setCommand(v);setAnswers({});setMissing([]);setProposal(null);setId("");setSaved(null);setError("")};
 const nav=tabKey=>openModule?.("e-belge",{tabKey});
 async function changePolicy(enabled){
  if(lock.current||!policy?.canManage||!policy.ready)return;
  if(enabled&&!window.confirm("AI yorumlama yalnız yazdığınız komutu Cloudflare Workers AI servisine iletir. Firma kullanım kaydı tutulur. Resmî gönderim izni verilmez. Açmak istiyor musunuz?"))return;
  lock.current=true;setBusy(true);setPolicyError("");
  try{const r=unwrap(await apiPut("/e-belge/operator-policy",{mainCompanySlug:slug,version:policy.version,aiEnabled:enabled}));if(!scope(r)||r.aiEnabled!==enabled)throw Error("Politika sonucu doğrulanamadı.");setPolicy(r)}catch(e){setPolicyError(e.message||"Politika değişmedi.")}finally{lock.current=false;setBusy(false)}
 }
 async function interpret(){
  if(lock.current||!policy?.aiEnabled||!command.trim()||saved)return;
  lock.current=true;setBusy(true);setError("");setAiSuggestion(null);
  try{const r=unwrap(await apiPost("/e-belge/operator-command/interpret",{mainCompanySlug:slug,command,allowAi:true},{timeoutMs:45000}));if(!scope(r)||r.requiresReview!==true||r.sendAllowed!==false)throw Error("AI önerisi doğrulanamadı.");setAiSuggestion(r)}catch(e){setError(e.message||"AI önerisi alınamadı.")}finally{lock.current=false;setBusy(false)}
 }
 async function run(save){
  if(lock.current||!slug||!command.trim())return;
  lock.current=true;setBusy(true);setError("");setProposal(null);
  const key=id||crypto.randomUUID();setId(key);
  try{
   const r=unwrap(await apiPost("/e-belge/operator-command/prepare",{mainCompanySlug:slug,command,answers,saveDraft:save,id:key}));
   if(!scope(r)||!Array.isArray(r.missing))throw Error("Firma kapsamı doğrulanamadı.");
   setMissing(r.missing);setProposal(r.proposal);
   if(!r.proposal||r.missing.length||!save)return;
   if(r.draft?.id!==key||!r.draft?.payload)throw Error("Kayıt sonucu doğrulanamadı; taslak listesini kontrol edin.");
   setSaved(r.draft);
  }catch(e){setError(e.message||"İşlem tamamlanamadı.")}finally{lock.current=false;setBusy(false)}
 }
 return <section className="ebo-workspace ebo-rev3-smart">
  <div className="ebo-heading"><div><h3>Akıllı İşlem Merkezi</h3><small>Tek komut · kayıtlı cari ve model · yalnız eksik alanları tamamla</small></div><span className="ebo-tag">{policy?.aiEnabled?"Kural + AI önerisi":"Kural tabanlı komut"} · resmî gönderim kapalı</span></div>
  <div className="ebo-command"><input aria-label="İşlem komutu" maxLength={500} disabled={busy||Boolean(saved)} value={command} onChange={e=>change(e.target.value)} placeholder="Cari için Model 100 adet 10 TL’den doğrudan fatura oluştur" onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();void run(false)}}}/><button type="button" disabled={busy||!command.trim()||Boolean(saved)} onClick={()=>void run(false)}>İşlemi Hazırla</button><button type="button" disabled={busy||!command.trim()||Boolean(saved)} onClick={()=>void run(true)}>Hazırla ve Taslağa Kaydet</button></div>
  {policy?.aiEnabled&&<button type="button" disabled={busy||!command.trim()||Boolean(saved)} onClick={()=>void interpret()}>AI ile Komutu Yorumla</button>}
  {aiSuggestion&&<div className="ebo-rev3-proposal"><strong>AI önerisi · kayıt yapılmadı</strong><p>{aiSuggestion.command||aiSuggestion.question}</p>{aiSuggestion.command&&<button type="button" onClick={()=>change(aiSuggestion.command)}>Komutu Kullan ve Kontrol Et</button>}</div>}
  {!compact&&<details><summary>Firma otomasyon politikası</summary><p>AI yorumlama: {policy?.aiEnabled?"Etkin":policy?.ready?"Kapalı":"Şema / erişim bekleniyor"} · Resmî otomatik gönderim: kapalı</p>{policyError&&<p role="alert">{policyError}</p>}{policy?.canManage&&policy.ready&&<button type="button" disabled={busy} onClick={()=>void changePolicy(!policy.aiEnabled)}>{policy.aiEnabled?"AI Yorumlamayı Kapat":"AI Yorumlamayı Etkinleştir"}</button>}</details>}
  {error&&<p role="alert" className="ebo-error">{error}</p>}
  {missing.length>0&&<div className="ebo-grid">{missing.map(x=><label key={x.field}>{x.question}{!["party","item","unit","defaults"].includes(x.field)&&<input disabled={busy} value={answers[x.field]||""} onChange={e=>{setAnswers(a=>({...a,[x.field]:e.target.value}));setProposal(null)}}/>}</label>)}</div>}
  {proposal&&<div className="ebo-rev3-proposal"><strong>{proposal.payload.partyName} · {proposal.kind==="INVOICE"?"Fatura":"İrsaliye"}</strong><p>{proposal.payload.lines.map(l=>l.description+" · "+l.quantity+" "+l.unit).join(", ")}</p>{proposal.kind==="INVOICE"&&<p>Toplam: {proposal.payload.total} {proposal.payload.currency}</p>}<details><summary>Bilgi kaynakları ve kontrol uyarıları</summary>{Object.entries(proposal.provenance).map(([k,v])=><p key={k}>{k}: {v}</p>)}{proposal.workflowProfile&&<p>İş akışı profili · {proposal.workflowProfile.version}</p>}{proposal.payload.warnings.map(v=><p key={v}>{v}</p>)}</details></div>}
  {saved&&<p role="status">Taslak kaydedildi. <button type="button" onClick={()=>nav(saved.kind==="INVOICE"?"fatura-taslaklari":"irsaliye-taslaklari")}>Taslak Listesini Aç</button> <button type="button" onClick={()=>change("")}>Yeni Komut</button></p>}
  {!compact&&<p>Kaynak irsaliyeye bağlı işlem için <button type="button" onClick={()=>nav("is-akislari")}>Sevk ve Faturalandırma</button> kullanın. Komutla atomik kaynak rezervasyonu henüz doğrulanmadı.</p>}
 </section>;
}
export function EBelgeCreateHub({openModule}){
 const nav=tabKey=>openModule?.("e-belge",{tabKey,...(["fatura-taslaklari","irsaliye-taslaklari"].includes(tabKey)?{actionContext:{createDraft:true}}:{})});
 const actions=[["Fatura Hazırla","Cari ve modeli seç, miktar ve fiyatı gir.","fatura-taslaklari"],["İrsaliyeden Fatura","Sevk ve kalan miktarı kontrol et.","is-akislari"],["İrsaliye Hazırla","Cari, sevk ve teslimat bilgileri.","irsaliye-taslaklari"],["Gelen İrsaliyeden Sevk","Gelen belge ve kalan miktarı incele.","gelen-irsaliyeler"],["Belgelerimi Al","İşNet veya mevcut belge kaynakları.","belgeleri-al"],["Akıllı İşlem","Tek komutla taslak hazırla.","ai-center"]];
 return <section className="ebo-workspace ebo-quick-hub"><div className="ebo-heading"><div><h3>Ne yapmak istiyorsunuz?</h3><small>Cari → Model / irsaliye → Miktar ve fiyat → Kontrol</small></div></div><div className="ebo-rev3-tiles">{actions.map(([title,desc,tab])=><button className="ebo-quick-tile" key={tab} type="button" onClick={()=>nav(tab)}><strong>{title}</strong><span>{desc}</span></button>)}</div><details><summary>Diğer belge türleri</summary><p>e-Arşiv, iade ve istisna için sağlayıcı ve vergi kabulü gerekir. Mevcut e-Arşiv kayıtlarını inceleyebilirsiniz.</p><button type="button" onClick={()=>nav("earchive-drafts")}>e-Arşiv Taslakları</button></details><p className="ebo-send-note">Resmî gönderim kapalı; şu anda taslak hazırlama ve belge kontrolü kullanılabilir.</p></section>
}
