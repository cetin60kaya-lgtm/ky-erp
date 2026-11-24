import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, getApiActiveMainCompanySlug, clearApiGetCache } from "../../../utils/api";
import { CheckCircle2, RefreshCw, ShieldCheck, FolderOpen, AlertTriangle } from "lucide-react";
import "./eBelgeIsnetPortalSync.css";

const TYPES=[
 ["incoming-invoice","Gelen Faturalar","gelen-faturalar"],
 ["outgoing-invoice","Giden Faturalar","giden-faturalar"],
 ["incoming-dispatch","Gelen İrsaliyeler","gelen-irsaliyeler"],
 ["outgoing-dispatch","Giden İrsaliyeler","giden-irsaliyeler"]
];
const CHANNEL="KYERP_ISNET_BROWSER_V2";
const today=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)};
const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
const nextDay=s=>new Date(Date.parse(s)+86400000).toISOString().slice(0,10);
const endMonth=s=>new Date(Date.UTC(Number(s.slice(0,4)),Number(s.slice(5,7)),0)).toISOString().slice(0,10);
const initial=()=>Object.fromEntries(TYPES.map(([key])=>[key,{total:0,done:0,added:0,existing:0,archived:0,pending:0,failed:0,finished:false}]));
function callBridge(op,payload={},timeout=40000){
 return new Promise((resolve,reject)=>{
  const id=crypto.randomUUID(),origin=window.location.origin;
  const cleanup=()=>{clearTimeout(timer);window.removeEventListener("message",listener)};
  const listener=e=>{
   if(e.source!==window||e.origin!==origin||e.data?.channel!==CHANNEL||e.data?.direction!=="response"||e.data?.id!==id)return;
   cleanup();const r=e.data.result;r?.ok?resolve(r.data):reject(new Error(r?.error||"PORTAL_UNAVAILABLE"));
  };
  const timer=setTimeout(()=>{cleanup();reject(new Error("BROWSER_BRIDGE_TIMEOUT"))},timeout);
  window.addEventListener("message",listener);
  window.postMessage({channel:CHANNEL,direction:"request",id,op,payload},origin);
 });
}
function toFile(x,ext){
 if(!x||typeof x.base64!=="string"||!Number.isInteger(x.size)||x.size<1||x.size>20*1024*1024||x.base64.length>28*1024*1024||!new RegExp("^[A-Za-z0-9_.-]+\\."+ext+"$","i").test(x.name))throw Error("FILE_INVALID");
 const raw=atob(x.base64);if(raw.length!==x.size)throw Error("FILE_SIZE_MISMATCH");
 const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
 return new File([bytes],x.name,{type:ext==="xml"?"application/xml":"application/pdf"});
}
const unwrap=r=>r?.data??r;
const labels={
 PORTAL_TAB_REQUIRED:"İşNet oturumu açılmalı.",
 PORTAL_LOGIN_REQUIRED:"İşNet giriş veya firma seçimi gerekli.",
 PORTAL_COMPANY_FILTER_UNVERIFIED:"İşNet seçili firma bilgisi doğrulanamadı.",
 PORTAL_PAGE_INCOMPLETE:"İşNet sayfalama yanıtı eksik; tüm belgeler alındı denilemez.",
 BROWSER_BRIDGE_TIMEOUT:"Chrome eklentisi yanıt vermedi. REV 0.2.0 sürümünü kontrol edin.",
 OWNER_VKN_MISMATCH:"İşNet firması ile seçili ERP ana firması uyuşmuyor.",
 MULTIPLE_PORTAL_TABS:"Birden fazla İşNet oturumu açık. Doğru firma oturumunu seçin.",
 PAIR_RESULT_UNCERTAIN:"Aktarım sonucu belirsiz; havuz kontrolü gerekli."
};
const message=e=>labels[e?.code]||labels[e?.message]||e?.message||"Senkronizasyon tamamlanamadı.";
export default function EBelgeIsnetPortalSync({activeMainCompany,openModule,enabled=true,onSynced}){
 const slug=String(activeMainCompany?.slug||activeMainCompany?.mainCompanySlug||activeMainCompany?.id||"");
 const [from,setFrom]=useState("2010-01-01"),[to,setTo]=useState(today);
 const [stats,setStats]=useState(initial),[state,setState]=useState("idle"),[status,setStatus]=useState("İşNet oturumu kontrol edilecek.");
 const [errors,setErrors]=useState([]),[confirm,setConfirm]=useState(false);
 const running=useRef(false),stop=useRef(false),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;stop.current=true}},[]);
 const update=(k,fn)=>{if(mounted.current)setStats(old=>({...old,[k]:fn(old[k])}))};
 const busy=state==="running";
 const assertTenant=()=>{if(!mounted.current||stop.current)throw Error("SYNC_STOPPED");if(getApiActiveMainCompanySlug()!==slug)throw Error("ERP_COMPANY_CHANGED")};
 const post=async(path,body,ms=90000)=>{
  assertTenant();
  const r=await apiFetch(path,{method:"POST",body,params:{mainCompanySlug:slug},timeoutMs:ms});return unwrap(r);
 };
 const connect=async()=>{try{await callBridge("connect");setStatus("Gerekliyse İşNet'in kendi sayfasında giriş ve firma seçimini yapın. Sonra bu merkezden senkronize edin.");}catch(e){setStatus(message(e))}};
 const sync=async()=>{
  if(running.current||!enabled||!slug||!confirm||!validDate(from)||!validDate(to)||from>to)return;
  running.current=true;stop.current=false;setState("running");setStats(initial());setErrors([]);setStatus("İşNet oturumu doğrulanıyor…");
  let problemCount=0,expectedCompany=null;
  try{
   assertTenant();
   const health=await callBridge("status");
   if(!health?.connected)throw Error("PORTAL_LOGIN_REQUIRED");
   for(const [kind,title] of TYPES){
    const direction=kind.startsWith("incoming")?"INCOMING":"OUTGOING",documentKind=kind.endsWith("invoice")?"FATURA":"IRSALIYE";
    for(let startDate=from;startDate<=to;){
     const monthEnd=endMonth(startDate),last=monthEnd<to?monthEnd:to;
     let offset=0,total=null;const seen=new Set();
     do{
      assertTenant();setStatus(title+" · "+startDate+" – "+last+" · sayfa taranıyor");
      const page=await callBridge("list",{kind,from:startDate,to:last,start:offset},45000);
      if(!page?.companySelected||!page.companyId||!Array.isArray(page.rows)||!Number.isSafeInteger(page.total)||page.total<0||!page.key)throw Error("PORTAL_PAGE_INCOMPLETE");
      if(expectedCompany!==null&&page.companyId!==expectedCompany)throw Error("PORTAL_COMPANY_CHANGED");
      expectedCompany=page.companyId;
      if(total===null){total=page.total;update(kind,x=>({...x,total:x.total+total}))}
      if(page.total!==total||offset+page.rows.length>total||(offset<total&&!page.rows.length))throw Error("PORTAL_PAGE_INCOMPLETE");
      for(const row of page.rows){
       assertTenant();if(seen.has(row.id))throw Error("PORTAL_PAGE_INCOMPLETE");seen.add(row.id);
       setStatus(title+" · "+(offset+seen.size)+" / "+total+" · "+row.number);
       try{
        const xml=toFile(await callBridge("file",{key:page.key,id:row.id,format:"xml"}),"xml");
        const check=new FormData();check.set("xml",xml);check.set("direction",direction);check.set("documentKind",documentKind);check.set("documentNo",row.number);
        const inspected=await post("/e-belge/isnet-browser/inspect",check);
        let id=inspected.documentId,existing=inspected.complete===true;
        if(!existing){
         const pdf=toFile(await callBridge("file",{key:page.key,id:row.id,format:"pdf"}),"pdf");
         const form=new FormData();form.append("files",xml);form.append("files",pdf);form.set("source","ISNET_BROWSER_PAIR");form.set("direction",direction);form.set("documentKind",documentKind);form.set("documentNo",row.number);
         const result=await post("/e-belge/upload",form);
         if(!result?.documentId||!result.xmlAttached||!result.pdfAttached)throw Error("PAIR_RESULT_UNCERTAIN");
         id=result.documentId;
        }
        update(kind,x=>({...x,done:x.done+1,existing:x.existing+(existing?1:0),added:x.added+(existing?0:1)}));
        try{const arc=await post("/e-belge/isnet-browser/archive",{documentId:id},90000);update(kind,x=>({...x,archived:x.archived+(arc.complete?1:0),pending:x.pending+(arc.complete?0:1)}));}
        catch(e){update(kind,x=>({...x,pending:x.pending+1}));problemCount++;if(mounted.current)setErrors(old=>[...old.slice(-49),{number:row.number,type:title,detail:"Drive: "+message(e)}])}
       }catch(e){
        if(["OWNER_VKN_MISMATCH","ACCOUNTING_FORBIDDEN","PAIR_RESULT_UNCERTAIN","REQUEST_TIMEOUT","NETWORK_ERROR","ERP_COMPANY_CHANGED","SYNC_STOPPED"].includes(e.code||e.message)||!mounted.current||stop.current)throw e;
        problemCount++;update(kind,x=>({...x,failed:x.failed+1}));
        if(mounted.current)setErrors(old=>[...old.slice(-49),{number:row.number,type:title,detail:message(e)}]);
       }
      }
      offset+=page.rows.length;
     }while(offset<total);
     if(seen.size!==total)throw Error("PORTAL_PAGE_INCOMPLETE");
     startDate=nextDay(last);
    }
    update(kind,x=>({...x,finished:true}));
   }
   if(mounted.current){setState(problemCount?"partial":"complete");setStatus("Dört belge türü tarandı. Havuza alınanlar ve Drive doğrulaması aşağıda ayrı gösteriliyor.");}
  }catch(e){if(mounted.current){setState("partial");setStatus(e.message==="SYNC_STOPPED"?"İşlem durduruldu. Kabul edilmiş belgeler korunur; yeniden başlatınca ETTN kontrol edilir.":message(e));}}
  finally{running.current=false;clearApiGetCache();if(mounted.current){window.dispatchEvent(new CustomEvent("kyerp:accounting-refresh",{detail:{source:"e-belge",action:"isnet-browser-sync"}}));try{await onSynced?.()}catch{}}}
 };
 const sum=Object.values(stats).reduce((a,x)=>({total:a.total+x.total,done:a.done+x.done,archive:a.archive+x.archived,pending:a.pending+x.pending,failed:a.failed+x.failed}),{total:0,done:0,archive:0,pending:0,failed:0});
 return <section className="eis-local eis-single" aria-label="İşNet tek merkez">
  <header className="eis-local-head"><div><span className="eis-local-kicker"><ShieldCheck size={15}/> İŞNET · TEK SENKRONİZASYON</span><h3>Tüm İşNet Belgeleri</h3><p>Gelen/giden fatura ve irsaliyeler · XML + PDF · tek belge havuzu · Google Drive</p></div></header>
  <div className="eis-status"><div><strong>{activeMainCompany?.name||slug||"Ana firma seçin"}</strong><small>{status}</small></div><button type="button" onClick={connect} disabled={busy||!enabled}>İşNet oturumu / firma</button></div>
  <div className="eis-local-actions">
   <label>Başlangıç <input type="date" value={from} onChange={e=>setFrom(e.target.value)} disabled={busy}/></label>
   <label>Bitiş <input type="date" value={to} onChange={e=>setTo(e.target.value)} disabled={busy}/></label>
   <button type="button" disabled={busy} onClick={()=>{setFrom("2010-01-01");setTo(today())}}>Tüm geçmiş</button>
  </div>
  <label><input type="checkbox" checked={confirm} disabled={busy} onChange={e=>setConfirm(e.target.checked)}/> Seçili ana firmaya ait belgeleri otomatik havuza ve Drive arşivine aktar.</label>
  <div className="eis-local-actions"><button type="button" className="eb-primary" disabled={busy||!enabled||!slug||!confirm||!validDate(from)||!validDate(to)||from>to} onClick={sync}><RefreshCw size={17}/> {busy?"Senkronize ediliyor…":"Tümünü Senkronize Et"}</button>{busy&&<button type="button" onClick={()=>{stop.current=true;setStatus("Mevcut işlem bitince durdurulacak…")}}>Durdur</button>}</div>
  <div className="eis-local-directions">{TYPES.map(([key,title,tab])=>{const x=stats[key];return <div key={key}><span><strong>{title}</strong><small>{x.finished?"Tarandı":"Bekliyor / taranıyor"} · {x.done}/{x.total} havuz · {x.archived} Drive · {x.failed} hata</small><button type="button" disabled={busy} onClick={()=>openModule?.("e-belge",{tabKey:tab})}>Belgeleri gör</button></span></div>})}</div>
  <div className="eis-status" role="status"><div><strong>{sum.done} belge havuzda · {sum.archive} Drive doğrulandı</strong><small>{sum.total} listelendi · {sum.pending} Drive bekliyor · {sum.failed} belge hatalı. {state==="complete"&&sum.pending===0&&sum.done===sum.total?"Seçilen tarih aralığı tamamlandı.":"Tam kabul için bütün kategoriler ve arşiv durumları doğrulanır."}</small></div></div>
  {!!errors.length&&<details><summary>Son {errors.length} sorun</summary>{errors.map((x,i)=><p key={i}>{x.type} / {x.number}: {x.detail}</p>)}</details>}
  <div className="eis-local-actions"><button type="button" disabled={busy} onClick={()=>openModule?.("e-belge",{tabKey:"belge-havuzu"})}><FolderOpen size={16}/> Tüm Belge Havuzu</button></div>
  <p className="eis-local-warning">Chrome oturumu açık kalmalı. Şifre yalnız sağlayıcı/Chrome parola yöneticisinde. ZIP ve yerel EXE yok. Kesin muhasebeleştirme veya resmî gönderim yapılmaz.</p>
 </section>;
}
