import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {apiGet,apiPost,apiUpload} from "../../../utils/api";
import {ArrowRight,CheckCircle2,FileSpreadsheet,Mail,RefreshCw,Search,ShieldAlert} from "lucide-react";
import InvoiceMailWorkspace from "./InvoiceMailWorkspace";
import InvoiceDifferenceMailDraft from "./InvoiceDifferenceMailDraft";
import "./invoiceMailReconciliationCenter.css";

const unpack=payload=>payload?.data?.data??payload?.data??payload??{};
const listOf=value=>Array.isArray(value)?value:Array.isArray(value?.items)?value.items:Array.isArray(value?.rows)?value.rows:[];
const money=(amount,currency)=>Number(amount||0).toLocaleString("tr-TR",{style:"currency",currency:currency||"TRY"});
const tabs=[["send","PDF Mail Gönderimi"],["import","Haftalık Excel & Kontrol"],["listed","Ödemeye Alınanlar"],["missing","Ödemeye Alınmayanlar"],["differences","Eksik / Fazla & İtiraz"]];
const outcomeLabel={
  AWAITING_EXCEL:"Haftalık Excel bekleniyor",
  CUSTOMER_LISTED:"Müşterinin haftalık listesinde",
  NOT_LISTED:"Müşteri listesinde yok",
  MANUAL_INCLUDED:"Manuel: listede var",
  MANUAL_EXCLUDED:"Manuel: listede yok",
  REVIEW_REQUIRED:"İnceleme gerekli",
  EXTRA_IN_CUSTOMER_LIST:"Excel'de var · ERP'de yok",
};
const isListed=row=>["CUSTOMER_LISTED","MANUAL_INCLUDED"].includes(row.outcome);
const isMissing=row=>["NOT_LISTED","MANUAL_EXCLUDED"].includes(row.outcome);
const today=()=>new Date().toLocaleDateString("en-CA");
export default function InvoiceMailReconciliationCenter({activeMainCompany,refreshKey=0,moduleActionContext,openModule}){
 const tenant=activeMainCompany?.slug||"";
 const [tab,setTab]=useState(moduleActionContext?.document_no||moduleActionContext?.delivery_no?"send":"import");
 const [customerId,setCustomerId]=useState("");
 const [companies,setCompanies]=useState([]);
 const [rows,setRows]=useState([]);
 const [extras,setExtras]=useState([]);
 const [summary,setSummary]=useState({});
 const [snapshot,setSnapshot]=useState(null);
 const [file,setFile]=useState(null);
 const [weekDate,setWeekDate]=useState(today);
 const [query,setQuery]=useState("");
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(false);
 const [error,setError]=useState(""),[notice,setNotice]=useState("");
 const [selectedMail,setSelectedMail]=useState(()=>moduleActionContext||null);
 const handoffDocument=moduleActionContext?.document_no||"";
 const handoffDelivery=moduleActionContext?.delivery_no||"";
 const handoffModelId=moduleActionContext?.model_id||"";
 const handoffModelName=moduleActionContext?.model_name||"";
 const handoffParty=moduleActionContext?.party_name||"";
 const [reloadToken,setReloadToken]=useState(0);
 const fetchSeq=useRef(0);
 useEffect(()=>{
  setTab(handoffDocument||handoffDelivery?"send":"import");
  setSelectedMail(handoffDocument||handoffDelivery||handoffModelId||handoffModelName||handoffParty
   ?{document_no:handoffDocument,delivery_no:handoffDelivery,model_id:handoffModelId,model_name:handoffModelName,party_name:handoffParty}:null);
 },[handoffDocument,handoffDelivery,handoffModelId,handoffModelName,handoffParty]);
 useEffect(()=>{fetchSeq.current+=1;setCustomerId("");setRows([]);setExtras([]);setSnapshot(null);setSummary({});setFile(null);setError("");setNotice("");setCompanies([]);},[tenant]);
 useEffect(()=>{
  if(!tenant)return;
  let canceled=false;
  apiGet("/muhasebe/firmalar",{mainCompanySlug:tenant,limit:5000})
    .then(data=>{if(canceled)return;const list=listOf(unpack(data));setCompanies(list.filter(row=>row.id));})
    .catch(e=>{if(!canceled)setError(e.message||"Firma kartları okunamadı.");});
  return()=>{canceled=true;};
 },[tenant,refreshKey]);
 const refresh=useCallback(async()=>{
  const requestId=++fetchSeq.current;
  if(!tenant||!customerId){setRows([]);setExtras([]);setSnapshot(null);setSummary({});return;}
  setLoading(true);setError("");
  try{
   const result=unpack(await apiGet("/muhasebe/invoice-weekly-reconciliations",{mainCompanySlug:tenant,companyId:customerId,_ts:Date.now()}));
   if(requestId!==fetchSeq.current)return;
   setRows(result.rows||[]);setExtras(result.extras||[]);setSummary(result.counts||{});setSnapshot(result.snapshot||null);
  }catch(e){if(requestId===fetchSeq.current){setRows([]);setExtras([]);setSnapshot(null);setSummary({});setError(e.message||"Haftalık karşılaştırma yüklenemedi.");}}
  finally{if(requestId===fetchSeq.current)setLoading(false);}
 },[customerId,tenant]);
 useEffect(()=>{void refresh();},[refresh,reloadToken]);
 const importFile=async event=>{
  event.preventDefault();if(!customerId||!file||busy)return;
  setBusy(true);setError("");setNotice("");
  try{
   const form=new FormData();form.append("file",file);form.append("companyId",customerId);form.append("weekDate",weekDate);
   const result=unpack(await apiUpload("/muhasebe/invoice-weekly-reconciliations/import",form));
   setNotice(result?.idempotent?"Aynı Excel ve hafta daha önce içe alındı; ikinci kayıt açılmadı.":"Excel kaydedildi; HKN numaraları firma kayıtlarıyla karşılaştırıldı. Bu kayıt banka tahsilatı değildir.");
   setFile(null);setReloadToken(n=>n+1);
  }catch(e){setError(e.message||"Excel içe alınamadı.");}finally{setBusy(false);}
 };
 const changeReview=async(row,choice)=>{
  if(!snapshot?.id||!customerId||busy)return;
  setBusy(true);setError("");
  try{
   await apiPost("/muhasebe/invoice-weekly-reconciliations/"+encodeURIComponent(snapshot.id)+"/manual",{
    mainCompanySlug:tenant,companyId:customerId,documentNo:row.documentNo,choice,
   });
   setNotice(row.documentNo+" kontrol durumu kaydedildi. Cari/tahsilat kaydı değişmedi.");
   setReloadToken(n=>n+1);
  }catch(e){setError(e.message||"Manuel durum kaydedilemedi.");}
  finally{setBusy(false);}
 };
 const relevant=useMemo(()=>{
  if(tab==="listed")return rows.filter(isListed);
  if(tab==="missing")return rows.filter(isMissing);
  if(tab==="differences")return rows.filter(row=>row.outcome==="REVIEW_REQUIRED");
  return rows;
 },[tab,rows]);
 const sorted=useMemo(()=>relevant.filter(row=>
  [row.documentNo,row.customer,row.date].join(" ").toLocaleUpperCase("tr-TR").includes(query.toLocaleUpperCase("tr-TR")))
  .sort((a,b)=>a.documentNo.localeCompare(b.documentNo,"tr-TR",{numeric:true})),[relevant,query]);
 const customerName=companies.find(row=>String(row.id)===customerId)?.companyName||
  companies.find(row=>String(row.id)===customerId)?.firmaAdi||
  companies.find(row=>String(row.id)===customerId)?.name||"";
 const openInvoiceMail=row=>{
  setSelectedMail({document_no:row.documentNo,party_name:row.customer||customerName,model_name:row.modelName||""});
  setTab("send");
 };
 return <section className="imrc-root">
  <div className="imrc-top">
   <div><strong>Fatura Mail & Haftalık Mutabakat</strong>
    <p>HKN fatura + DDM irsaliye PDF gönderimi, müşteri Excel kontrolü ve ödeme listesi takibi. Resmî İşNet gönderiminden ve gerçek banka tahsilatından ayrıdır.</p></div>
   <button type="button" onClick={()=>openModule?.("iletisim",{tabKey:"mail-gelen"})}><Mail size={16}/> Gelen Maili Aç</button>
  </div>
  <nav className="imrc-tabs" aria-label="Fatura mail ve haftalık mutabakat bölümleri">
   {tabs.map(([id,label])=><button type="button" key={id} className={tab===id?"active":""} onClick={()=>setTab(id)}>{label}</button>)}
  </nav>
  {tab==="send"?<section className="imrc-panel">
   <p className="imrc-info">Gönderim yalnız açık onayla gerçekleşir. PDF kaynakları File Hub'dan doğrulanır. Gönderim geçmişi Microsoft sağlayıcı kabulünü gösterir; teslim veya banka ödemesi anlamına gelmez.</p>
   <InvoiceMailWorkspace key={tenant+"|"+String(selectedMail?.document_no||"")+"|"+String(selectedMail?.delivery_no||"")} activeMainCompany={activeMainCompany} selectedInvoice={selectedMail}/>
  </section>:<>
   <div className="imrc-toolbar">
    <label>Müşteri firma
     <select value={customerId} disabled={busy} onChange={e=>{fetchSeq.current+=1;setCustomerId(e.target.value);setQuery("");setRows([]);setExtras([]);setSummary({});setSnapshot(null);setFile(null);setError("");setNotice("");}}>
      <option value="">Firma kartını seçin</option>
      {companies.slice().sort((a,b)=>String(a.companyName||a.firmaAdi||a.name).localeCompare(String(b.companyName||b.firmaAdi||b.name),"tr"))
       .map(row=><option key={row.id} value={row.id}>{row.companyName||row.firmaAdi||row.name}</option>)}
     </select>
    </label>
    <label>Fatura ara<div className="imrc-search"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="HKN numarası veya müşteri"/></div></label>
    <button type="button" onClick={()=>void refresh()} disabled={!customerId||loading}><RefreshCw size={16}/> Yenile</button>
   </div>
   {error&&<p className="imrc-error" role="alert">{error}</p>}
   {notice&&<p className="imrc-notice" role="status">{notice}</p>}
   {tab==="import"&&<form className="imrc-import" onSubmit={importFile}>
    <div><strong><FileSpreadsheet size={18}/> Haftalık Müşteri Excel'ini Yükle</strong>
     <p>Outlook'tan gelen XLSX/XLS/CSV dosyasını indirip seçin. Excel'deki HKN numaraları seçili müşteriyle karşılaştırılır; dosya bankaya ödeme veya cari tahsilat kaydı oluşturmaz.</p></div>
    <label>Excel tarihi<input type="date" required value={weekDate} onChange={e=>setWeekDate(e.target.value)}/></label>
    <label>Haftalık Excel / CSV<input type="file" accept=".xlsx,.xls,.csv" onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
    <button type="submit" disabled={!customerId||!file||busy}>{busy?"Kontrol ediliyor...":"Excel'i Al & Karşılaştır"}</button>
   </form>}
   {snapshot&&<p className="imrc-evidence"><ShieldAlert size={16}/> Son Excel: <strong>{snapshot.sourceFile}</strong> · {snapshot.weekDate} · {snapshot.rowCount} satır
    {snapshot.duplicateInvoiceNos?.length?<> · <strong>{snapshot.duplicateInvoiceNos.length} tekrar HKN var; kontrol gerekli</strong></>:null}
    <span>Kaynak Excel dosyasının kendisi saklanmaz; dosya adı, SHA-256 özeti, HKN kimlikleri ve tarih kaydedilir. Önceki haftalar silinmez.</span>
     {snapshot.manualAudit?.length?<details><summary>Manuel işlem geçmişi ({snapshot.manualAudit.length})</summary><div className="imrc-history">{snapshot.manualAudit.slice(-20).reverse().map((entry,index)=><div key={index}>{entry.documentNo} · {entry.previous} → {entry.selected} · {entry.changedAt} · Kullanıcı {entry.actorId}</div>)}</div></details>:null}
   </p>}
   <div className="imrc-metrics">
    <button type="button" onClick={()=>setTab("import")}>HKN faturası<strong>{summary.all??0}</strong></button>
    <button type="button" onClick={()=>setTab("listed")}>Ödeme listesinde<strong>{summary.listed??0}</strong></button>
    <button type="button" onClick={()=>setTab("missing")}>Listede olmayan<strong>{summary.notListed??0}</strong></button>
    <button type="button" onClick={()=>setTab("differences")}>Fazla / belirsiz<strong>{(summary.extras??0)+(summary.review??0)}</strong></button>
   </div>
   {!customerId?<div className="imrc-empty">HKN faturalarını ve müşteriden gelen Excel'i karşılaştırmak için önce firma seçin.</div>:
    loading?<div className="imrc-empty">Gerçek ERP kayıtları okunuyor...</div>:<>
    {(tab!=="differences"||sorted.length>0)&&<div className="imrc-table-wrap"><table>
     <thead><tr><th>HKN Fatura</th><th>Tarih</th><th>Müşteri</th><th>Tutar</th><th>Haftalık liste durumu</th><th>Kontrol / Gönderim</th></tr></thead>
     <tbody>{sorted.map(row=><tr key={row.id}>
      <td><strong>{row.documentNo}</strong></td><td>{row.date||"—"}</td><td>{row.customer||customerName}</td>
      <td>{money(row.total,row.currency)}</td>
      <td><span className={"imrc-outcome "+(isListed(row)?"ok":isMissing(row)?"missing":"review")}>{outcomeLabel[row.outcome]||row.outcome}</span></td>
      <td><div className="imrc-row-actions">
       <button type="button" onClick={()=>openInvoiceMail(row)}>Mail Hazırla <ArrowRight size={13}/></button>
       {snapshot&&<select aria-label={row.documentNo+" manuel durum"} value={row.manual?row.outcome:"AUTO"}
        disabled={busy} onChange={e=>void changeReview(row,e.target.value)}>
        <option value="AUTO">Excel'e göre</option><option value="MANUAL_INCLUDED">Elle: Listede Var</option>
        <option value="MANUAL_EXCLUDED">Elle: Listede Yok</option><option value="REVIEW_REQUIRED">İtiraz / İncele</option>
       </select>}
      </div></td>
     </tr>)}</tbody></table>
     {!sorted.length&&<div className="imrc-empty">Bu filtrede kayıt yok.</div>}
    </div>}
    {tab==="differences"&&snapshot&&<InvoiceDifferenceMailDraft
      activeMainCompany={activeMainCompany} customerName={customerName}
      snapshot={snapshot} missing={rows.filter(isMissing)} extras={extras}
      onOpenDrafts={()=>openModule?.("iletisim",{tabKey:"mail-taslaklar"})}/>}
    {tab==="differences"&&<section className="imrc-panel"><strong>Excel'de Var · ERP'de Yok ({extras.length})</strong>
     <p>Bu HKN numaraları seçilen firmanın ERP faturalarında eşleşmedi. Başka firma, numara yazımı veya eksik belge kontrolü gerekir; otomatik kayıt açılmaz.</p>
     {extras.length?<div className="imrc-extra">{extras.map(row=><div key={row.documentNo}>{row.documentNo} · {outcomeLabel[row.outcome]}</div>)}</div>
      :<div className="imrc-empty">Bu karşılaştırmada fazla HKN bulunamadı.</div>}
    </section>}
    </>}
   <p className="imrc-info"><CheckCircle2 size={15}/> “Ödeme listesinde” = müşterinin Excel listesinde yer alıyor. “Tahsil edildi” yalnız doğrulanmış banka/kasa hareketiyle belirlenir. Manuel işaretler de cari bakiyeyi değiştirmez.</p>
  </>}
 </section>;
}
