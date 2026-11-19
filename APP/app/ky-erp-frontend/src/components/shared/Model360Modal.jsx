import {useCallback,useEffect,useMemo,useState} from "react";
import {AlertTriangle,CheckCircle2,Factory,FileCheck2,ImageOff,Layers3,Mail,Palette,RefreshCcw,Save,X} from "lucide-react";
import {useAuth} from "../../context/AuthContext";
import {apiGet,apiPost} from "../../utils/api";
import {createProductionCenterEntry,getProductionCenterModel} from "../../services/productionCenterApi";
import {getDesignModel} from "../../services/desenWorkflowApi";
import {listBoyahaneJobs,patchBoyahaneJob} from "../../services/boyahaneWorkflowApi";
import {productionImagePath} from "../../pages/imalat/productionModelImage";
import ModelFilesPanel from "./ModelFilesPanel";
import ModelDocumentCenter from "./ModelDocumentCenter";
import InvoiceMailWorkspace from "../../pages/modules/muhasebe/InvoiceMailWorkspace";
import {MODEL360_TABS,model360Access,model360LinkedInvoices,model360DeliveryForInvoice,model360DeliveriesForInvoice,model360Warnings,model360QuantityReview} from "./model360Rules";
import "./model360.css";

const unwrap = (v) => v?.data?.data ?? v?.data ?? v ?? {};
const format = (value) => Number(value || 0).toLocaleString("tr-TR",{maximumFractionDigits:2});
const label = (value) => String(value || "").trim() || "—";
const emptyEntry = () => ({date:new Date().toLocaleDateString("en-CA"),printRegion:"",quantity:"",printDefectQty:"0",fabricDefectQty:"0",testQty:"0",machineName:"",operatorName:"",note:""});
const allowedTab = (tab) => MODEL360_TABS.some(([id])=>id===tab)?tab:"general";
const modelMatchesJob = (job,id) => [job?.modelId,job?.model_id,job?.modelRecordId,job?.designModelId].some(v=>String(v||"")===String(id));
const array = (value) => Array.isArray(value)?value:[];

function Metric({name,value,unit="adet",accent=""}) {
  return <div className={"m360-metric "+accent}><span>{name}</span><strong>{value===null||value===undefined||value===""?"—":format(value)}</strong><small>{unit}</small></div>;
}
function Empty({children}) {
  return <p className="m360-empty">{children}</p>;
}
function ErrorNotice({text}) {
  return text?<p className="m360-error" role="alert">{text}</p>:null;
}
function DocumentList({items}) {
  return <div className="m360-doc-list">
    {items.length?items.map(row=><div key={row.id} className="m360-doc-row">
      <span><b>{row.number}</b><small>{row.direction==="OUTGOING"?"Giden":"Gelen"} {row.kind==="FATURA"?"fatura":"irsaliye"}</small></span>
      <span>{row.date||""}</span>
      <small>{row.linkedBy||"Bağlı belge"}</small>
    </div>):<Empty>Bu modele bağlı belge bulunamadı; belirsiz isim benzerliğinden otomatik belge bağlanmaz.</Empty>}
  </div>;
}
function DateText({value}) {
  return <time>{String(value||"").slice(0,16).replace("T"," ")||"—"}</time>;
}

export default function Model360Modal({modelId,initialTab="general",activeMainCompany,onClose}) {
  const {user} = useAuth();
  const tenant = String(activeMainCompany?.slug||activeMainCompany?.id||"");
  const canDesign = model360Access(user,"design");
  const canProduction = model360Access(user,"production");
  const canDyehouse = model360Access(user,"dyehouse");
  const canDocuments = model360Access(user,"documents");
  const canMail = model360Access(user,"mail");
  const writeProduction = model360Access(user,"production",true);
  const writeDyehouse = model360Access(user,"dyehouse",true);
  const writeDesign = model360Access(user,"design",true);
  const [tab,setTab] = useState(allowedTab(initialTab));
  const [data,setData] = useState({});
  const [errors,setErrors] = useState({});
  const [loading,setLoading] = useState(true);
  const [reload,setReload] = useState(0);
  const [imageFailed,setImageFailed] = useState(false);
  const [imageIndex,setImageIndex] = useState(0);
  const [entry,setEntry] = useState(emptyEntry);
  const [saving,setSaving] = useState(false);
  const [message,setMessage] = useState("");
  const [selectedInvoice,setSelectedInvoice] = useState("");
  const [jobNotes,setJobNotes] = useState({});
  const [savingBoyahane,setSavingBoyahane] = useState("");
  const refresh = useCallback(()=>setReload(v=>v+1),[]);
  useEffect(()=>{
    const listener = e=>{if(e.key==="Escape"){e.stopPropagation();onClose();}};
    window.addEventListener("keydown",listener);
    return ()=>window.removeEventListener("keydown",listener);
  },[onClose]);
  useEffect(()=>{
    let disposed = false;
    setLoading(true);setErrors({});setData({});setSelectedInvoice("");setImageFailed(false);setImageIndex(0);
    const requests = [
      ["production",canProduction,()=>getProductionCenterModel(activeMainCompany,modelId)],
      ["identity",model360Access(user,"general"),()=>apiGet("/model-360/"+encodeURIComponent(modelId)+"/identity",{mainCompanySlug:tenant})],
      ["canonicalLines",model360Access(user,"general"),()=>apiGet("/model-360/"+encodeURIComponent(modelId)+"/document-lines",{mainCompanySlug:tenant})],
      ["design",canDesign,()=>getDesignModel(activeMainCompany,modelId)],
      ["documents",canDocuments,()=>apiGet("/model-files/"+encodeURIComponent(modelId)+"/document-center",{mainCompanySlug:tenant})],
      ["mail",canMail,()=>apiGet("/muhasebe/invoice-mail-links",{mainCompanySlug:tenant,modelId})],
      ["outlookEvidence",canMail&&canDocuments,()=>apiGet("/muhasebe/invoice-mail-outlook-history",{mainCompanySlug:tenant,modelId})],
      ["dyehouse",canDyehouse,()=>listBoyahaneJobs(activeMainCompany)],
    ];
    const enabled = requests.filter(([,can])=>can);
    Promise.all(enabled.map(async ([key,,fn])=>{
      try{return {key,value:unwrap(await fn())};}
      catch(error){return {key,error:error?.message||"Kayıt okunamadı."};}
    })).then(results=>{
      if(disposed)return;
      const next={},failures={};
      for(const result of results){
        if(result.error)failures[result.key]=result.error;
        else next[result.key]=result.value;
      }
      setData(next);setErrors(failures);setLoading(false);
      if(Array.isArray(next.dyehouse))setJobNotes(Object.fromEntries(next.dyehouse.filter(job=>job.id).map(job=>[job.id,String(job.note||"")])));
    });
    return ()=>{disposed=true;};
  },[activeMainCompany,tenant,modelId,reload,user,canProduction,canDesign,canDocuments,canMail,canDyehouse]);
  useEffect(()=>{
    const changed=event=>{if(!event?.detail?.modelId||String(event.detail.modelId)===String(modelId))refresh();};
    window.addEventListener("kyerp:production-refresh",changed);
    window.addEventListener("kyerp:accounting-refresh",changed);
    return ()=>{
      window.removeEventListener("kyerp:production-refresh",changed);
      window.removeEventListener("kyerp:accounting-refresh",changed);
    };
  },[modelId,refresh]);

  const identity=data.identity||null;
  const production=data.production||null;
  const canonicalLines=data.canonicalLines||null;
  const design=data.design||null;
  const docs=array(data.documents?.items);
  const mailHistory=array(data.mail);
  const outlookEvidence=array(data.outlookEvidence?.items);
  const [evidenceBusy,setEvidenceBusy]=useState("");
  const dyehouseJobs=array(data.dyehouse).filter(job=>modelMatchesJob(job,modelId));
  const imageSources=[...new Set([production?.imageUrl,design?.mainImage?.previewUrl,design?.mainImage?.thumbnailUrl,identity?.imageUrl]
    .map(productionImagePath).filter(Boolean))];
  const imageSource=imageSources[imageIndex]||"";
  const name=identity?.modelName||production?.modelName||design?.modelName||"Model kaydı";
  const company=identity?.companyName||production?.companyName||design?.companyName||"Firma bağlantısı bekliyor";
  const warnings=useMemo(()=>model360Warnings(production,design,canDocuments?docs:null,identity),[production,design,docs,canDocuments,identity]);
  const quantityReview=useMemo(()=>model360QuantityReview(production,canDocuments?docs:null),[production,docs,canDocuments]);
  const invoices=useMemo(()=>model360LinkedInvoices(docs),[docs]);
  const picked=invoices.find(row=>row.id===selectedInvoice)||null;
  const canWriteEntry=writeProduction&&!production?.isVirtual&&Boolean(production?.id);
  const regions=array(production?.printRegions).map(row=>row.regionName).filter(Boolean);

  async function verifyOutlookEvidence(item){
    if(!item?.id||evidenceBusy)return;
    setEvidenceBusy(String(item.id));setMessage("");
    try{
      const result=await apiPost("/mail/messages/"+encodeURIComponent(item.id)+"/verify-evidence/microsoft",{});
      const detail=result?.data?.data??result?.data??result;
      setMessage(detail?.complete?"Outlook PDF SHA-256 kanıtı File Hub ile doğrulandı.":"PDF kanıtı eksik; REVIEW_REQUIRED olarak korunuyor.");
      refresh();
    }catch(e){setMessage(e?.message||"Outlook PDF doğrulaması başarısız.");}
    finally{setEvidenceBusy("");}
  }

  async function saveProduction(event) {
    event.preventDefault();
    if(saving||!canWriteEntry)return;
    const qty=Number(entry.quantity),defect=Number(entry.printDefectQty||0),fabric=Number(entry.fabricDefectQty||0),test=Number(entry.testQty||0);
    if(!entry.printRegion||!Number.isFinite(qty)||qty<=0||[defect,fabric,test].some(v=>!Number.isFinite(v)||v<0)||defect+fabric+test>qty){
      setMessage("Baskı bölgesi, pozitif brüt adet ve geçerli hata/test miktarları zorunludur.");return;
    }
    setSaving(true);setMessage("");
    try{
      await createProductionCenterEntry(activeMainCompany,{
        modelId:production.id,date:entry.date,printRegion:entry.printRegion,quantity:qty,
        printDefectQty:defect,fabricDefectQty:fabric,testQty:test,
        machineName:entry.machineName,operatorName:entry.operatorName,note:entry.note,
        dispatchNo:production.defaultDispatchNo||"",orderNo:production.orderNo||"",
      });
      setEntry(emptyEntry());
      setMessage("İmalat fişi canonical üretim merkezine kaydedildi; adetler yenileniyor.");
      refresh();
      window.dispatchEvent(new CustomEvent("kyerp:production-refresh",{detail:{source:"model-360",modelId}}));
    }catch(e){setMessage(e?.message||"İmalat kaydı doğrulanamadı.");}
    finally{setSaving(false);}
  }

  async function saveBoyahaneNote(job) {
    const jobId=String(job?.id||"");
    if(!writeDyehouse||!jobId||!modelMatchesJob(job,modelId)||savingBoyahane)return;
    const note=String(jobNotes[jobId]||"").trim();
    if(note.length>1000){setMessage("Boyahane açıklaması en fazla 1000 karakter olabilir.");return;}
    setSavingBoyahane(jobId);setMessage("");
    try {
      await patchBoyahaneJob(activeMainCompany,jobId,{note});
      setMessage("Boyahane iş açıklaması mevcut iş kaydına işlendi; model kaydı çoğaltılmadı.");
      refresh();
    }catch(e){setMessage(e?.message||"Boyahane açıklaması kaydedilemedi.");}
    finally{setSavingBoyahane("");}
  }

  return <div className="m360-backdrop" role="presentation">
    <section className="m360-dialog" role="dialog" aria-modal="true" aria-labelledby="m360-title">
      <header className="m360-header">
        <div><span className="m360-eyebrow">KY ERP · ORTAK MODEL İŞLEM MERKEZİ</span><h2 id="m360-title">{name}</h2><p>{company} · Model ID: <code>{modelId}</code></p></div>
        <div className="m360-header-actions"><button type="button" onClick={refresh} disabled={loading}><RefreshCcw size={16}/> Yenile</button><button type="button" aria-label="Model kartını kapat" onClick={onClose}><X size={20}/></button></div>
      </header>
      <div className="m360-scroll">
        <section className="m360-hero">
          <div className="m360-image">
            {imageSource&&!imageFailed?<img src={imageSource} alt={name+" model görseli"} onError={()=>{if(imageIndex+1<imageSources.length)setImageIndex(v=>v+1);else setImageFailed(true);}}/>:<div className="m360-image-missing"><ImageOff size={33}/><strong>Model görseli eksik</strong><small>Gerçek görseli DESEN dosyalarından ekleyin</small></div>}
          </div>
          <div className="m360-hero-info">
            <div className="m360-hero-tags"><span>Model kodu: {label(identity?.modelCode||production?.modelCode||design?.modelCode)}</span><span>Sipariş: {label(identity?.orderNo||production?.orderNo)}</span><span>İrsaliye: {label(production?.defaultDispatchNo)}</span></div>
            <div className="m360-metrics">
              <Metric name="Müşteriden gelen" value={production?.incomingQty}/>
              <Metric name="Net sağlam üretim" value={production?.completedNetQty}/>
              <Metric name="Faturalanan" value={production?.invoicedQty}/>
              <Metric name="Fatura kalan" value={production?.invoiceRemainingQty} accent={Number(production?.invoiceRemainingQty||0)>0?"warn":""}/>
            </div>
            <small className="m360-info-note">Gelen irsaliye, net üretim ve fatura farklı kaynaklardır. Baskı bölgeleri ve tekrarlanan evraklar toplamda iki kez sayılmaz.</small>
          </div>
        </section>
        {loading?<div className="m360-state" role="status">Modelin departman kayıtları yükleniyor…</div>:null}
        {!loading&&Object.keys(errors).length?<div className="m360-issues" role="status">Bazı bölüm verileri getirilemedi: {Object.entries(errors).map(([key,value])=><span key={key}><b>{key}</b>: {value}</span>)}</div>:null}
        {!loading&&warnings.length?<div className="m360-warnings">{warnings.map((item,index)=><p key={index}><AlertTriangle size={15}/>{item}</p>)}</div>:null}
        <nav className="m360-tabs" aria-label="Model kartı bölümleri">
          {MODEL360_TABS.map(([id,title])=><button key={id} type="button" className={tab===id?"active":""} onClick={()=>{setTab(id);setMessage("");}} aria-current={tab===id?"page":undefined}>{title}</button>)}
        </nav>
        <div className="m360-tab-body">
          {tab==="general"&&<section>
            <h3>Tek model · bütün departmanların ortak görünümü</h3>
            <p>Bu model kartı yeniden oluşturulmaz. DESEN, İmalat, Boyahane, Muhasebe ve Mail her biri kendi yetkili işlemini aynı model kimliğine kaydeder.</p>
            <div className="m360-metrics m360-general-metrics">
              <Metric name="Brüt tamamlanan" value={production?.completedGrossQty}/>
              <Metric name="Baskı hatası" value={production?.printDefectQty}/>
              <Metric name="Kumaş hatası" value={production?.fabricDefectQty}/>
              <Metric name="Test adedi" value={production?.testQty}/>
              <Metric name="Üretim kalan" value={production?.productionRemainingQty}/>
              <Metric name="Fazla üretim" value={production?.overProducedQty}/>
            </div>
            {production?.isVirtual?<ErrorNotice text="Bu yalnızca kaynak eşleşmesi bekleyen sanal modeldir. Kalıcı model kartına bağlamadan fiş girişi yapılamaz."/>:null}
          </section>}
          {tab==="design"&&(canDesign?<section>
            <h3><Palette size={18}/> DESEN · Görsel, baskı bölgesi, kanal ve dosyalar</h3>
            <p>PSD, AI, PDF, yerleşim ve model görseli File Hub'daki tek kaynak üzerinden yönetilir.</p>
            <div className="m360-operation-grid">{array(design?.operations).map((operation,index)=><article key={operation.id||index}>
              <b>{operation.printAreaName||operation.regionName||"Baskı bölgesi"}</b>
              <span>Renk kanalı: {array(operation.channels).length}</span>
              <span>Renk grubu: {array(operation.colorGroups).length}</span>
              <span>Boyahane: {label(operation.dyehouseStatus)}</span>
            </article>)}</div>
            {!design?<Empty>DESEN detay kaydı bulunamadı veya bu model henüz DESEN akışına bağlanmadı.</Empty>:null}
            <ModelFilesPanel modelId={modelId} modelName={name} activeMainCompany={activeMainCompany} onUploaded={refresh} readOnly={!writeDesign}/>
          </section>:<Empty>DESEN kartını görme yetkiniz bulunmuyor.</Empty>)}
          {tab==="production"&&(canProduction?<section>
            <h3><Factory size={18}/> İmalat · Fişler ve gerçek adet karşılaştırması</h3>
            <div className="m360-metrics">
              <Metric name="Gelen" value={production?.incomingQty}/>
              <Metric name="Brüt üretim" value={production?.completedGrossQty}/>
              <Metric name="Net üretim" value={production?.completedNetQty}/>
              <Metric name="Fark" value={production?Number(production.incomingQty||0)-Number(production.completedNetQty||0):null}/>
            </div>
            <div className="m360-table-wrap"><table><thead><tr><th>Tarih</th><th>Bölge</th><th>Brüt</th><th>Net</th><th>Makine</th><th>Operatör</th></tr></thead><tbody>
              {array(production?.productionEntries).map((row,index)=><tr key={row.id||index}><td>{row.date||""}</td><td>{row.printRegion||""}</td><td>{format(row.quantity)}</td><td>{format(row.netQuantity??Number(row.quantity||0)-Number(row.printDefectQty||0)-Number(row.fabricDefectQty||0)-Number(row.testQty||0))}</td><td>{row.machineName||"—"}</td><td>{row.operatorName||"—"}</td></tr>)}
            </tbody></table></div>
            {!array(production?.productionEntries).length?<Empty>Bu modele ait doğrulanmış imalat fişi bulunamadı.</Empty>:null}
            {canWriteEntry?<form className="m360-entry" onSubmit={saveProduction}>
              <h4><Layers3 size={17}/> Yeni imalat fişi</h4>
              <div className="m360-entry-grid">
                <label>Tarih<input type="date" required value={entry.date} onChange={e=>setEntry(v=>({...v,date:e.target.value}))}/></label>
                <label>Baskı bölgesi<select required value={entry.printRegion} onChange={e=>setEntry(v=>({...v,printRegion:e.target.value}))}><option value="">Bölge seç</option>{regions.map(r=><option key={r} value={r}>{r}</option>)}</select></label>
                <label>Brüt adet<input type="number" min="0.0001" step="any" required value={entry.quantity} onChange={e=>setEntry(v=>({...v,quantity:e.target.value}))}/></label>
                <label>Baskı hatası<input type="number" min="0" step="any" value={entry.printDefectQty} onChange={e=>setEntry(v=>({...v,printDefectQty:e.target.value}))}/></label>
                <label>Kumaş hatası<input type="number" min="0" step="any" value={entry.fabricDefectQty} onChange={e=>setEntry(v=>({...v,fabricDefectQty:e.target.value}))}/></label>
                <label>Test<input type="number" min="0" step="any" value={entry.testQty} onChange={e=>setEntry(v=>({...v,testQty:e.target.value}))}/></label>
                <label>Makine<input value={entry.machineName} onChange={e=>setEntry(v=>({...v,machineName:e.target.value}))}/></label>
                <label>Operatör<input value={entry.operatorName} onChange={e=>setEntry(v=>({...v,operatorName:e.target.value}))}/></label>
                <label className="wide">Not<input value={entry.note} onChange={e=>setEntry(v=>({...v,note:e.target.value}))}/></label>
              </div>
              <div className="m360-entry-footer"><span>Net adet = brüt − baskı hatası − kumaş hatası − test; sunucu ayrıca kapasite ve yetki kontrolü yapar.</span><button type="submit" disabled={saving||loading||!regions.length}><Save size={15}/>{saving?"Kaydediliyor…":"İmalat Fişi Kaydet"}</button></div>
              {message?<p role="status">{message}</p>:null}
            </form>:<Empty>İmalat kaydı için kalıcı model ve yetkili üretim kullanıcısı gerekir.</Empty>}
          </section>:<Empty>İmalat kayıtlarını görme yetkiniz bulunmuyor.</Empty>)}
          {tab==="dyehouse"&&(canDyehouse?<section>
            <h3><Palette size={18}/> Boyahane · Model işi, renk ve reçete bağlantıları</h3>
            <p>Yalnız aynı canonical model ID'ye gerçekten bağlı boyahane işleri gösterilir. Benzer model adına bakarak yanlış iş eşleştirilmez.</p>
            {dyehouseJobs.length?<div className="m360-doc-list">{dyehouseJobs.map((job,index)=><div className="m360-doc-row" key={job.id||index}>
              <span><b>{job.jobNo||job.modelName||"Boyahane işi"}</b><small>{job.companyName||""}</small></span>
              <span>{job.status||"Durum bekliyor"}</span><small>{job.createdAt||job.date||""}</small>
              {writeDyehouse?<div className="m360-boyahane-note"><label>Boyahane iş notu<input maxLength={1000} value={jobNotes[job.id]??job.note??""} onChange={e=>setJobNotes(v=>({...v,[job.id]:e.target.value}))}/></label>
               <button type="button" disabled={savingBoyahane===job.id} onClick={()=>void saveBoyahaneNote(job)}><Save size={14}/>{savingBoyahane===job.id?"Kaydediliyor…":"Notu Kaydet"}</button></div>:null}
             </div>)}</div>:<Empty>Bu modele canonical ID ile bağlı boyahane işi bulunamadı. İsim benzerliği tek başına ilişki kurmaz.</Empty>}
            <h4>DESEN kaynaklı baskı bölgelerinin boyahane durumu</h4>
            <div className="m360-operation-grid">{array(design?.operations).map((op,index)=><article key={op.id||index}><b>{op.printAreaName||op.regionName||"Bölge"}</b><span>{op.dyehouseStatus||"Hazırlık bekliyor"}</span></article>)}</div>
            <p className="m360-info-note">Boyahane açıklaması aynı gerçek iş kaydında saklanır. Reçete, gramaj ve lot değişiklikleri kendi doğrulama ve stok güvenlik kapısını kullanır; bu modal henüz bu işlemleri değiştirmez.</p>
            {tab==="dyehouse"&&message?<p role="status">{message}</p>:null}
          </section>:<Empty>Boyahane kayıtlarını görme yetkiniz bulunmuyor.</Empty>)}
          {tab==="documents"&&(canDocuments?<section>
            <h3><FileCheck2 size={18}/> Muhasebe · HKN, DDM ve model kalemleri</h3>
            <p>Bir HKN veya DDM birçok modele bağlanabilir; belge tek kayıt kalır. Modele ait miktar bütün faturanın toplamından ayrı tutulur.</p>
            <DocumentList items={docs}/>
            <h4>Üretim merkezinde model kalemi üzerinden hesaplanan irsaliye ve fatura miktarları</h4>
            <div className="m360-metrics"><Metric name="Gelen irsaliye" value={production?.dispatchQty}/><Metric name="Faturalanan" value={production?.invoicedQty}/><Metric name="Fatura kalan" value={production?.invoiceRemainingQty}/></div>
            <div className="m360-line-list">{array(production?.invoices).map((row,index)=><div key={row.lineId||index}><b>{row.documentNo||"HKN"}</b><span>{format(row.quantity)} {row.unit||"adet"}</span><small>Belge kalemi {row.lineId||"—"}</small></div>)}</div>
            <ModelDocumentCenter modelId={modelId} modelName={name} activeMainCompany={activeMainCompany}/>
          </section>:<Empty>Muhasebe belgelerini görme yetkiniz bulunmuyor.</Empty>)}
          {tab==="mail"&&(canMail?<section>
            <h3><Mail size={18}/> Fatura Mail · Her HKN için ayrı gönderim</h3>
            <p>Bir HKN için ayrı posta hazırlanır; bir HKN ile ilgili tüm DDM PDF ekleri birlikte doğrulanır. Birden fazla HKN asla tek mailde birleştirilmez.</p>
            {invoices.length?<div className="m360-mail-pick"><label>Mail hazırlanacak HKN faturası<select value={selectedInvoice} onChange={e=>setSelectedInvoice(e.target.value)}><option value="">Fatura seç</option>{invoices.map(row=><option key={row.id} value={row.id}>{row.number} · {row.date||""}</option>)}</select></label></div>:<Empty>Mail hazırlamak için bu modele bağlanmış gerçek giden HKN faturası bulunmalı.</Empty>}
            {picked?<InvoiceMailWorkspace key={modelId+":"+picked.id} activeMainCompany={activeMainCompany} selectedInvoice={{
              document_no:picked.number,delivery_no:model360DeliveryForInvoice(picked,docs),
              delivery_nos:model360DeliveriesForInvoice(picked,docs),
              model_id:modelId,model_name:name,party_name:company,
            }}/>:null}
            <h4>KY ERP'de kayıtlı Outlook gönderim geçmişi</h4>
            {mailHistory.length?<div className="m360-doc-list">{mailHistory.map((item,index)=><div className="m360-doc-row" key={item.id||index}><span><b>{item.invoiceNo||"HKN"}</b><small>{(item.deliveryNos||[item.deliveryNo]).filter(Boolean).join(", ")} · {array(item.modelIds).length} bağlı model</small></span><span>{item.status||"Kayıt"}</span><small>{item.recordedAt?.slice(0,16)||""}</small></div>)}</div>:<Empty>KY ERP üzerinden kanıtlanmış gönderim kaydı bulunamadı.</Empty>}
            <h4>Outlook Gönderilenler · Eski manuel gönderimler</h4>
            <p className="m360-info-note">Outlook Gönderilenler'deki HKN/DDM ekleri önce aday olarak listelenir. Dosya adı kesin kanıt değildir; SHA-256 ile File Hub eşleşirse doğrulanır. Teslim/okundu kanıtı değildir.</p>
            {outlookEvidence.length?<div className="m360-doc-list">{outlookEvidence.map((item,index)=><div className="m360-doc-row" key={item.id||index}><span><b>{item.invoiceNo}</b><small>{(item.deliveryNos||[item.deliveryNo]).join(", ")} · {item.subject||"Konu yok"}</small></span>
              <span>{item.verificationStatus==="VERIFIED"?"SHA kanıtlı":"REVIEW_REQUIRED"}</span>
              {item.verificationStatus!=="VERIFIED"?<button type="button" disabled={Boolean(evidenceBusy)} onClick={()=>void verifyOutlookEvidence(item)}>PDF Kanıtını Doğrula</button>:null}
              <small>{String(item.sentAt||"").slice(0,16).replace("T"," ")}</small></div>)}</div>:<Empty>Her iki PDF ile doğrulanmış eski Outlook maili bulunamadı veya posta geçmişi henüz senkronize edilmedi.</Empty>}
            {message?<p role="status">{message}</p>:null}
            {data.outlookEvidence?.limited?<p className="m360-error">İlk 200 Outlook gönderimi incelendi; daha eski kayıtlar için tamamlanmış geçmiş senkronizasyonu gerekir.</p>:null}
            {errors.outlookEvidence?<ErrorNotice text={"Outlook geçmişi: "+errors.outlookEvidence}/>:null}
          </section>:<Empty>Fatura maili için muhasebe/iletişim yetkiniz bulunmuyor.</Empty>)}
          {tab==="review"&&<section>
            <h3><FileCheck2 size={18}/> Model bazında adet & belge kontrolü</h3>
            <p>Tek model ID'si; müşteriden gelen, İmalat, giden DDM ve HKN ayrı kaynaklardır. Birden çok modele ait fatura toplamı her modelin üstüne yazılmaz.</p>
            {canProduction&&quantityReview.ready?<div>
              <h4>İmalatın gerçek fişleri ve eski belge özeti</h4>
              <div className="m360-metrics">
                <Metric name="Gelen irsaliye / plan" value={quantityReview.receivedFromDispatch}/>
                <Metric name="Kart adedi" value={quantityReview.expected}/>
                <Metric name="Brüt üretim" value={quantityReview.producedGross}/>
                <Metric name="Net sağlam" value={quantityReview.producedNet}/>
                <Metric name="Eski fatura özeti" value={quantityReview.invoiced}/>
                <Metric name="Net - eski fatura" value={quantityReview.remainingFromProduction} accent={quantityReview.remainingFromProduction<0?"warn":""}/>
              </div>
              <p className="m360-info-note">Eski İmalat belge toplamı canonical e-Belge karşılaştırması tamamlanana kadar kesin fatura adedi sayılmaz. Baskı bölgelerinin fişleri fiziksel ürün olarak tekrar toplanmaz.</p>
              {quantityReview.checks.length?<div className="m360-warnings">{quantityReview.checks.map((check,index)=><p key={index}><AlertTriangle size={15}/>{check.message}</p>)}</div>:null}
            </div>:canProduction?<ErrorNotice text={quantityReview.reason}/>:<Empty>İmalat kayıtlarını görme yetkiniz bulunmuyor; yalnız yetkili olunan diğer bölüm kayıtları gösterilir.</Empty>}
            <h4>Canonical e-Belge · Model kalemlerine ait doğrulanmış adetler</h4>
            {canonicalLines?.status==="SOURCE_UNAVAILABLE"?<ErrorNotice text="Canonical model–belge kalem bağlantı tablosu henüz hazır değil; miktar kesin hesaplanamaz."/>:null}
            {canonicalLines?.status==="TRUNCATED"?<ErrorNotice text="Belge kalemi sorgusu sınırına ulaşıldı; toplam kesin sayılmaz."/>:null}
            {errors.canonicalLines?<ErrorNotice text={errors.canonicalLines}/>:null}
            <div className="m360-metrics">
             <Metric name="Gelen müşteri irsaliyesi" value={canonicalLines?.totals?.received??null}/>
             <Metric name="Giden DDM / sevk" value={canonicalLines?.totals?.shipped??null}/>
             <Metric name="Giden HKN / fatura" value={canonicalLines?.totals?.invoiced??null}/>
             <Metric name="İncelenecek kalem" value={canonicalLines?.reviewLineCount??null} unit="satır"/>
            </div>
            <p className="m360-info-note">Yalnız canonical XML'deki <b>model kimliğiyle kesin bağlanmış, tek modelde ve ADET birimindeki</b> satırlar toplanır. Bağlantı yoksa — gösterilir; bu, sıfır adet değildir.</p>
            {canonicalLines?.status==="REVIEW_REQUIRED"?<div className="m360-warnings"><p><AlertTriangle size={15}/> Modeli belirsiz, başka firmaya ait, farklı birimde veya birden fazla modele bağlı satırlar kontrol bekliyor.</p></div>:null}
            <div className="m360-table-wrap"><table><thead><tr><th>Belge</th><th>Kalem</th><th>Miktar</th><th>Birim</th><th>Kontrol</th></tr></thead>
              <tbody>{array(canonicalLines?.items).map((row,index)=><tr key={row.documentId+":"+row.lineId+":"+index}><td>{row.documentNo||"Belge"}</td><td>{row.description||row.lineId||"—"}</td><td>{row.quantity==null?"—":format(row.quantity)}</td><td>{row.unit||"—"}</td><td>{row.status==="VERIFIED_LINE"?"Eşleşti":row.status}</td></tr>)}</tbody></table></div>
            {!array(canonicalLines?.items).length?<Empty>Bu model ID ile kesin bağlanmış canonical HKN/DDM kalemi bulunamadı. Belge başlığından tahmini adet dağıtılmayacak.</Empty>:null}
            {canProduction&&quantityReview.ready&&canonicalLines?.totals?.invoiced!=null&&Math.abs(Number(canonicalLines.totals.invoiced)-quantityReview.invoiced)>0.0001?
              <div className="m360-warnings"><p><AlertTriangle size={15}/> Canonical HKN adedi ile İmalat merkezinin önceki fatura özeti uyuşmuyor. Önce kaynak kayıtlarını karşılaştırın; otomatik mali düzeltme yapılmaz.</p></div>:null}
            {canDocuments?<><h4>Bağlı belge dosyaları / XML</h4><DocumentList items={docs}/><ModelDocumentCenter modelId={modelId} modelName={name} activeMainCompany={activeMainCompany}/></>:<Empty>Belge içeriği ve PDF'ler yalnız Muhasebe/e-Belge yetkisiyle görüntülenir.</Empty>}
          </section>}
          {tab==="history"&&<section>
            <h3><CheckCircle2 size={18}/> Ortak işlem geçmişi</h3>
            <div className="m360-history">
              {array(production?.productionEntries).map((row,index)=><div key={"p"+(row.id||index)}><DateText value={row.date}/><strong>İmalat</strong><span>{row.printRegion||"Üretim"} · {format(row.quantity)} adet</span></div>)}
              {docs.map(row=><div key={"d"+row.id}><DateText value={row.date}/><strong>{row.kind==="FATURA"?"Fatura":"İrsaliye"}</strong><span>{row.number}</span></div>)}
              {mailHistory.map((row,index)=><div key={"m"+(row.id||index)}><DateText value={row.recordedAt}/><strong>Outlook</strong><span>{row.invoiceNo} · {row.status||"Kayıt"}</span></div>)}
            </div>
            {!array(production?.productionEntries).length&&!docs.length&&!mailHistory.length?<Empty>Doğrulanmış model hareketi bulunamadı.</Empty>:null}
            <p className="m360-info-note">Microsoft sağlayıcı kabulü, teslim/okundu kanıtı değildir. Bu görünüm hiçbir mali veya üretim kaydı oluşturmaz.</p>
          </section>}
        </div>
      </div>
      <footer className="m360-footer"><span>Tek model kimliği · Bölüm bazlı yetki · Belge ve dosyalar kopyalanmaz</span><button type="button" onClick={onClose}><X size={16}/> Kapat</button></footer>
    </section>
  </div>;
}
