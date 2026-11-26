import {useRef,useState} from "react";
import {apiPost} from "../../../utils/api";
import "./eBelgeOperator.css";
const unwrap=v=>v?.ok===true?v.data:v;
export default function EBelgeSmartWorkspace({activeMainCompany,openModule,compact=false}){
 const slug=activeMainCompany?.slug||activeMainCompany?.id||"";
 const [command,setCommand]=useState(""),[answers,setAnswers]=useState({}),[missing,setMissing]=useState([]),[proposal,setProposal]=useState(null),[id,setId]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[saved,setSaved]=useState(null);
 const lock=useRef(false);
 const scope=r=>String(r?.mainCompanySlug||"").toLowerCase()===String(slug).toLowerCase();
 const change=v=>{setCommand(v);setAnswers({});setMissing([]);setProposal(null);setId("");setSaved(null);setError("")};
 const nav=tabKey=>openModule?.("e-belge",{tabKey});
 async function run(save){
  if(lock.current||!slug||!command.trim())return;
  lock.current=true;setBusy(true);setError("");setProposal(null);
  const key=id||crypto.randomUUID();setId(key);
  try{
   const r=unwrap(await apiPost("/e-belge/operator-command/prepare",{mainCompanySlug:slug,command,answers}));
   if(!scope(r)||!Array.isArray(r.missing))throw Error("Firma kapsamı doğrulanamadı.");
   setMissing(r.missing);setProposal(r.proposal);
   if(!r.proposal||r.missing.length||!save)return;
   const p=r.proposal;
   const result=unwrap(await apiPost("/e-belge/operator-drafts",{mainCompanySlug:slug,kind:p.kind,id:key,providerKey:p.providerKey,payload:p.payload}));
   if(!scope(result)||result.draft?.id!==key)throw Error("Kayıt sonucu doğrulanamadı; taslak listesini kontrol edin.");
   setSaved(result.draft);
  }catch(e){setError(e.message||"İşlem tamamlanamadı.")}finally{lock.current=false;setBusy(false)}
 }
 return <section className="ebo-workspace ebo-rev3-smart">
  <div className="ebo-heading"><div><h3>Akıllı İşlem Merkezi</h3><small>Tek komut · kayıtlı cari ve model · yalnız eksik alanları tamamla</small></div><span className="ebo-tag">Kural tabanlı komut · resmî gönderim kapalı</span></div>
  <div className="ebo-command"><input aria-label="İşlem komutu" disabled={busy||Boolean(saved)} value={command} onChange={e=>change(e.target.value)} placeholder="Cari için Model 100 adet 10 TL’den doğrudan fatura oluştur" onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();void run(false)}}}/><button type="button" disabled={busy||!command.trim()||Boolean(saved)} onClick={()=>void run(false)}>İşlemi Hazırla</button><button type="button" disabled={busy||!command.trim()||Boolean(saved)} onClick={()=>void run(true)}>Hazırla ve Taslağa Kaydet</button></div>
  {error&&<p role="alert" className="ebo-error">{error}</p>}
  {missing.length>0&&<div className="ebo-grid">{missing.map(x=><label key={x.field}>{x.question}{!["party","item","unit","defaults"].includes(x.field)&&<input disabled={busy} value={answers[x.field]||""} onChange={e=>{setAnswers(a=>({...a,[x.field]:e.target.value}));setProposal(null)}}/>}</label>)}</div>}
  {proposal&&<div className="ebo-rev3-proposal"><strong>{proposal.payload.partyName} · {proposal.kind==="INVOICE"?"Fatura":"İrsaliye"}</strong><p>{proposal.payload.lines.map(l=>l.description+" · "+l.quantity+" "+l.unit).join(", ")}</p>{proposal.kind==="INVOICE"&&<p>Toplam: {proposal.payload.total} {proposal.payload.currency}</p>}<details><summary>Bilgi kaynakları ve kontrol uyarıları</summary>{Object.entries(proposal.provenance).map(([k,v])=><p key={k}>{k}: {v}</p>)}{proposal.payload.warnings.map(v=><p key={v}>{v}</p>)}</details></div>}
  {saved&&<p role="status">Taslak kaydedildi. <button type="button" onClick={()=>nav(saved.kind==="INVOICE"?"fatura-taslaklari":"irsaliye-taslaklari")}>Taslak Listesini Aç</button> <button type="button" onClick={()=>change("")}>Yeni Komut</button></p>}
  {!compact&&<p>Kaynak irsaliyeye bağlı işlem için <button type="button" onClick={()=>nav("is-akislari")}>Sevk ve Faturalandırma</button> kullanın. Komutla atomik kaynak rezervasyonu henüz doğrulanmadı.</p>}
 </section>;
}
export function EBelgeCreateHub({openModule}){
 const nav=tabKey=>openModule?.("e-belge",{tabKey});
 return <section className="ebo-workspace"><h3>Satış ve sevk</h3><div className="ebo-rev3-tiles">{[["Doğrudan Fatura","İrsaliye olmadan ortak editör","fatura-taslaklari"],["İrsaliyeden Fatura","Mevcut sevk ve faturalandırma motoru","is-akislari"],["Doğrudan İrsaliye","Yeni sevk ve teslimat","irsaliye-taslaklari"],["Gelen İrsaliyeden Sevk","Kaynak ve kalan miktar kontrolü","gelen-irsaliyeler"],["e-Arşiv Fatura","Mükellef ve sağlayıcı kabulü gerekli",""],["İade / İstisna Faturası","Vergi ve belge tipi kabulü gerekli",""]].map(([title,desc,tab])=><article key={title}><h4>{title}</h4><p>{desc}</p><button type="button" disabled={!tab} onClick={()=>nav(tab)}>{tab?"İşlem Merkezini Aç":"Kabul Bekliyor"}</button></article>)}</div><button type="button" onClick={()=>nav("ai-center")}>Akıllı İşlem Merkezi</button></section>
}
