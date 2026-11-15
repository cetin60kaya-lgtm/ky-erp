import {useCallback,useEffect,useMemo,useState} from "react";
import {Download,FileText,FileCode2,Link2,RefreshCw,Search,ShieldCheck,Files} from "lucide-react";
import {apiGet,apiPost,apiFetch} from "../../utils/api";
import "./modelDocumentCenter.css";

const sections=[
 ["ALL","Tüm Belgeler"],["INCOMING:IRSALIYE","Gelen İrsaliye"],
 ["OUTGOING:IRSALIYE","Giden İrsaliye"],["INCOMING:FATURA","Gelen Fatura"],["OUTGOING:FATURA","Giden Fatura"],
];
const rowsOf=value=>Array.isArray(value)?value:Array.isArray(value?.items)?value.items:[];
const labelOf=item=>(item.direction==="OUTGOING"?"Giden ":"Gelen ")+(item.kind==="IRSALIYE"?"İrsaliye":"Fatura");
const suffixOf=(value,kind)=>String(value||"BELGE").replace(/[\\/:*?"<>|\u0000-\u001f]/g,"-").trim()+"."+kind.toLowerCase();

export default function ModelDocumentCenter({modelId,modelName,activeMainCompany,models=[]}){
 const slug=String(activeMainCompany?.slug||activeMainCompany?.id||"").trim();
 const [docs,setDocs]=useState([]);
 const [stats,setStats]=useState({});
 const [filter,setFilter]=useState("ALL");
 const [q,setQ]=useState("");
 const [results,setResults]=useState([]);
 const [selected,setSelected]=useState("");
 const [additional,setAdditional]=useState([]);
 const [busy,setBusy]=useState("");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [loaded,setLoaded]=useState(false);
 const params=useMemo(()=>({mainCompanySlug:slug}),[slug]);
 const load=useCallback(async()=>{
  if(!modelId||!slug)return;
  setBusy("load");setError("");
  try{
   const r=await apiGet(`/model-files/${encodeURIComponent(modelId)}/document-center`,params,{forceFresh:true,timeoutMs:25000});
   const d=r.data||r;
   setDocs(rowsOf(d.items||d));setStats(d.stats||{});setLoaded(true);
  }catch(e){setError(e?.message||"Model belgeleri okunamadı.");setLoaded(true)}
  finally{setBusy("")}
 },[modelId,slug,params]);
 useEffect(()=>{setDocs([]);setResults([]);setSelected("");setAdditional([]);setLoaded(false);setFilter("ALL");setNotice("");void load()},[load]);
 const displayed=useMemo(()=>docs.filter(d=>(filter==="ALL"||filter===d.direction+":"+d.kind)&&
  (!q.trim()||[d.number,d.company,d.date].some(x=>String(x||"").toLocaleLowerCase("tr-TR").includes(q.trim().toLocaleLowerCase("tr-TR"))))
 ),[docs,filter,q]);
 const find=async()=>{
  if(q.trim().length<2||busy)return;
  setBusy("search");setError("");setResults([]);setSelected("");
  try{
   const r=await apiGet(`/model-files/${encodeURIComponent(modelId)}/document-candidates`,{...params,q:q.trim()},{forceFresh:true});
   setResults(rowsOf(r.data||r));
  }catch(e){setError(e?.message||"Belge araması başarısız.");}
  finally{setBusy("")}
 };
 const link=async()=>{
  if(!selected||busy)return;
  setBusy("link");setError("");setNotice("");
  try{
   const r=await apiPost(`/model-files/${encodeURIComponent(modelId)}/documents/${encodeURIComponent(selected)}/link`,
    {...params,modelIds:additional});
   setNotice((r.data||r).message||"Belge ve model ilişkileri kaydedildi.");
   setResults([]);setSelected("");setAdditional([]);await load();
  }catch(e){setError(e?.message||"Belge modele bağlanamadı.");}
  finally{setBusy("")}
 };
 const download=async(doc,kind)=>{
  if(busy)return;
  setBusy("file:"+doc.id+":"+kind);setError("");
  try{
   const blob=await apiFetch(`/model-files/${encodeURIComponent(modelId)}/documents/${encodeURIComponent(doc.id)}/file/${kind}`,{
    params,responseType:"blob",timeoutMs:60000});
   if(!(blob instanceof Blob)||!blob.size)throw new Error("Arşivde dosya bulunamadı.");
   const object=URL.createObjectURL(blob),link=document.createElement("a");
   link.href=object;link.download=suffixOf(doc.number,kind);document.body.appendChild(link);link.click();link.remove();
   window.setTimeout(()=>URL.revokeObjectURL(object),10000);
  }catch(e){setError(e?.message||"Dosya indirilemedi. File Hub kaynak bağlantısını kontrol edin.");}
  finally{setBusy("")}
 };
 const options=useMemo(()=>models.filter(m=>m.id!==modelId&&m.id).slice(0,150),[models,modelId]);
 return <section className="mdc" aria-label="Model kartı tüm e-Belge dosyaları">
  <header className="mdc-head">
   <div><strong><Files size={18}/> Modelin Fatura ve İrsaliye Dosyaları</strong>
    <small>{modelName} · Gelen/giden, XML/PDF ve ilişkili karşı belgeler · Tek belge, birden fazla model bağlantısı</small></div>
   <button type="button" disabled={Boolean(busy)} onClick={()=>void load()}><RefreshCw size={15}/> Yenile</button>
  </header>
  <div className="mdc-stats">
   <span>Gelen irsaliye <b>{stats.incomingDispatches||0}</b></span>
   <span>Giden irsaliye <b>{stats.outgoingDispatches||0}</b></span>
   <span>Gelen fatura <b>{stats.incomingInvoices||0}</b></span>
   <span>Giden fatura <b>{stats.outgoingInvoices||0}</b></span>
  </div>
  <div className="mdc-filters">
   <div>{sections.map(([key,title])=><button type="button" key={key}
    className={filter===key?"active":""} onClick={()=>setFilter(key)}>{title}</button>)}</div>
   <label><Search size={15}/><input aria-label="Model belge araması" value={q} onChange={e=>setQ(e.target.value)}
    placeholder="Belge no / firma / tarih" /></label>
  </div>
  {busy==="load"&&!loaded&&<p>Belge bağlantıları okunuyor…</p>}
  {error&&<p className="mdc-error" role="alert">{error}</p>}
  {notice&&<p className="mdc-notice" role="status"><ShieldCheck size={15}/>{notice}</p>}
  <div className="mdc-documents">
   {displayed.map(doc=><article key={doc.id} className="mdc-row">
    <div className="mdc-row-title"><strong>{doc.number||"Numarasız belge"}</strong>
     <span>{labelOf(doc)} · {doc.date||"Tarih belirtilmedi"} · {doc.company||"Firma belirtilmedi"}</span>
     {doc.files?.some(f=>f.relativePath)&&<small className="mdc-path">Drive yolu: {doc.files.find(f=>f.relativePath)?.relativePath}</small>}
     <small>{doc.linkedBy==="RELATED_DOCUMENT"?"Bağlı faturanın/irsaliyenin ilişkili belgesi":
       doc.linkedBy==="MODEL_LINE_OR_DOCUMENT"?"Belge satırından modele bağlandı":"Doğrulanmış model/file bağlantısı"} · {doc.status||"Durum yok"}</small>
     {!!doc.relatedDocuments?.length&&<small>Karşı belge bağlantısı: {doc.relatedDocuments.length} kayıt</small>}
    </div>
    <div className="mdc-downloads">
      {doc.files?.some(f=>f.role==="XML")?<button type="button" disabled={Boolean(busy)} onClick={()=>void download(doc,"XML")}><FileCode2 size={15}/> XML</button>
        :<small>XML bekleniyor</small>}
      {doc.files?.some(f=>f.role==="PDF")?<button type="button" disabled={Boolean(busy)} onClick={()=>void download(doc,"PDF")}><FileText size={15}/> PDF</button>
        :<small>PDF bekleniyor</small>}
    </div>
   </article>)}
   {loaded&&!displayed.length&&<div className="mdc-empty">Bu modele bağlı {filter==="ALL"?"fatura veya irsaliye":"belge"} bulunamadı. Mevcut belgeleri numarayla arayıp bağlayabilirsin. Dosyalar fiziksel olarak taşınmaz.</div>}
  </div>
  <details className="mdc-link-panel">
   <summary><Link2 size={16}/> Kayıtlı Fatura / İrsaliyeyi Modele Bağla</summary>
   <div className="mdc-link-form">
    <p>İlgili gelen veya giden belgeyi numarayla ara. Bir irsaliyedeki 2–3 modeli burada birlikte seçebilirsin. Yalnızca mevcut belgeye ilişki eklenir.</p>
    <div className="mdc-link-search"><input aria-label="Belge numarası" placeholder="Ör. THA2026000123"
      value={q} onChange={e=>setQ(e.target.value)} /><button type="button" disabled={q.trim().length<2||Boolean(busy)} onClick={()=>void find()}>Belge Ara</button></div>
    {results.length>0&&<label>Bulunan belge
      <select value={selected} onChange={e=>setSelected(e.target.value)}>
       <option value="">Belge seç</option>
       {results.map(row=><option value={row.id} key={row.id}>{row.number} · {row.direction} · {row.type} · {row.party||""}</option>)}
      </select></label>}
    {selected&&<><label>Bu belgeye bağlı diğer modeller (isteğe bağlı)
      <select multiple size={Math.min(5,options.length||2)} value={additional}
       onChange={e=>setAdditional([...e.target.selectedOptions].map(o=>o.value))}>
       {options.map(m=><option key={m.id} value={m.id}>{m.modelName||m.name||m.id}</option>)}
      </select></label>
      <small>Ctrl/⌘ ile birden fazla model seçilebilir. Firma uyuşmazsa sunucu işlemi reddeder.</small>
      <button className="mdc-main-action" type="button" disabled={Boolean(busy)} onClick={()=>void link()}>Belgeyi Seçili Modellerle İlişkilendir</button>
    </>}
    {busy==="search"&&<small>Aranıyor…</small>}
    {!busy&&q.trim().length>=2&&results.length===0&&<small>Arama sonuçlarını görmek için Belge Ara'ya bas.</small>}
   </div>
  </details>
 </section>;
}
