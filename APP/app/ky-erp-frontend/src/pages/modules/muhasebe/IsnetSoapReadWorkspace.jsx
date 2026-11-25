import {useState} from "react";
import {apiGet} from "../../../utils/api";
import {localSevkTime} from "./isnetWorkflowDefaults";
import "./isnetPartialWorkflow.css";
const tabs=[["INVOICE","INCOMING","Gelen Faturalar"],["INVOICE","OUTGOING","Giden Faturalar"],["DISPATCH","INCOMING","Gelen İrsaliyeler"],["DISPATCH","OUTGOING","Giden İrsaliyeler"]];
const unwrap=v=>v?.data?.data??v?.data??v;
export default function IsnetSoapReadWorkspace({slug}){
 const today=localSevkTime().date,[company,setCompany]=useState(""),[from,setFrom]=useState(today.slice(0,8)+"01"),[to,setTo]=useState(today),[tab,setTab]=useState(0),[data,setData]=useState(null),[detail,setDetail]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[health,setHealth]=useState(null);
 const clear=()=>{setData(null);setDetail(null);setError("");};
 const query=()=>({mainCompanySlug:slug,companyTaxCode:company.trim(),kind:tabs[tab][0],direction:tabs[tab][1],from,to});
 async function read(page=1,ettn="",file=""){
  if(busy)return;setBusy(true);setError("");if(!ettn){setData(null);setDetail(null);}
  try{
   const res=unwrap(await apiGet("/muhasebe/isnet-soap-test-documents",{...query(),page,ettn,file},{forceFresh:true,timeoutMs:60000}));
   if(res?.environment!=="TEST"||res.providerRead!==true||!Array.isArray(res.rows))throw Error("İşNet yanıtı doğrulanamadı.");
   if(file){
    if(res.file?.format!==file||res.file.ettn.toLowerCase()!==ettn.toLowerCase())throw Error("Dosya kimliği eşleşmedi.");
    const bytes=Uint8Array.from(atob(res.file.base64),c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:file==="PDF"?"application/pdf":"application/xml"})),a=document.createElement("a");
    a.href=url;a.download="TEST-"+ettn+"."+file.toLowerCase();a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
   }else if(ettn)setDetail(res.rows[0]||null);else setData(res);
  }catch(e){setError(e?.message||"İşNet TEST erişimi başarısız.");}finally{setBusy(false);}
 }
 async function probe(){setBusy(true);setError("");setHealth(null);try{setHealth(unwrap(await apiGet("/muhasebe/isnet-soap-test-health",{mainCompanySlug:slug},{forceFresh:true,timeoutMs:30000})));}catch(e){setError(e?.message||"Bağlantı testi başarısız.");}finally{setBusy(false);}}
 return <section className="isp-root"><h3>1 · İşNet TEST belge erişimi</h3><p className="isp-warning">Salt okunur: İşNet test sunucusundan canlı sorgu. Üretim muhasebesine aktarım ve belge gönderimi yapılmaz. Yalnız verilen test firma VKN'leri.</p>
 <button type="button" disabled={busy} onClick={probe}>SOAP bağlantısını kontrol et</button>{health&&<p>{(health.services||[]).map(s=>s.service+": "+s.status).join(" · ")}</p>}
 <div className="isp-fields"><label>TEST firma VKN<input inputMode="numeric" maxLength={10} value={company} disabled={busy} onChange={e=>{setCompany(e.target.value);clear();}}/></label><label>Başlangıç<input type="date" value={from} disabled={busy} onChange={e=>{setFrom(e.target.value);clear();}}/></label><label>Bitiş<input type="date" value={to} disabled={busy} onChange={e=>{setTo(e.target.value);clear();}}/></label></div>
 <div className="isow-actions">{tabs.map((t,i)=><button type="button" aria-pressed={tab===i} disabled={busy} key={t[2]} onClick={()=>{setTab(i);clear();}}>{t[2]}</button>)}</div>
 <button type="button" disabled={busy||!/^\d{10}$/.test(company)||!from||!to} onClick={()=>read(1)}>{busy?"İşNet yanıtı bekleniyor…":"Belgeleri getir"}</button>{error&&<p role="alert">{error}</p>}
 {data&&<><p>İşNet TEST yanıtı · {data.total} kayıt · Sayfa {data.page}/{data.pages||1}</p><div className="isp-scroll"><table><thead><tr><th>Belge no</th><th>Tarih</th><th>Durum</th><th>Tutar</th><th>İşlem</th></tr></thead><tbody>{data.rows.map(row=><tr key={row.ettn}><td>{row.number}</td><td>{row.date}</td><td>{row.status}</td><td>{row.amount} {row.currency}</td><td><button type="button" disabled={busy} onClick={()=>read(1,row.ettn)}>Detay</button><button type="button" disabled={busy} onClick={()=>read(1,row.ettn,"XML")}>XML</button><button type="button" disabled={busy} onClick={()=>read(1,row.ettn,"PDF")}>PDF</button></td></tr>)}</tbody></table></div><button type="button" disabled={busy||data.page<=1} onClick={()=>read(data.page-1)}>Önceki</button><button type="button" disabled={busy||data.page>=data.pages} onClick={()=>read(data.page+1)}>Sonraki</button></>}
 {detail&&<section><h4>{detail.number}</h4><p>ETTN: {detail.ettn}</p><p>{detail.date} · {detail.status} · {detail.amount} {detail.currency}</p></section>}</section>;
}
