import {useCallback,useEffect,useMemo,useState} from "react";
import {AlertTriangle,CheckCircle2,Factory,FileCheck2,ImageOff,Layers3,Mail,Palette,RefreshCcw,Save,X} from "lucide-react";
import {useAuth} from "../../context/AuthContext";
import {apiGet} from "../../utils/api";
import {createProductionCenterEntry,getProductionCenterModel} from "../../services/productionCenterApi";
import {getDesignModel} from "../../services/desenWorkflowApi";
import {listBoyahaneJobs,patchBoyahaneJob} from "../../services/boyahaneWorkflowApi";
import {productionImagePath} from "../../pages/imalat/productionModelImage";
import ModelFilesPanel from "./ModelFilesPanel";
import ModelDocumentCenter from "./ModelDocumentCenter";
import InvoiceMailWorkspace from "../../pages/modules/muhasebe/InvoiceMailWorkspace";
import {MODEL360_TABS,model360Access,model360LinkedInvoices,model360DeliveryForInvoice,model360Warnings,model360QuantityReview} from "./model360Rules";
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
      ["design",canDesign,()=>getDesignModel(activeMainCompany,modelId)],
      ["documents",canDocuments,()=>apiGet("/model-files/"+encodeURIComponent(modelId)+"/document-center",{mainCompanySlug:tenant})],
      ["mail",canMail,()=>apiGet("/muhasebe/invoice-mail-links",{mainCompanySlug:tenant,modelId})],
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
  const design=data.design||null;
  const docs=array(data.documents?.items);
  const mailHistory=array(data.mail);
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
            <p>Her HKN'nin kendi alıcı listesi, iki PDF ön kontrolü ve tekli gönderim kaydı vardır. Toplu seçimin tek maile birleştirilmesi yapılmaz.</p>
            {invoices.length?<div className="m360-mail-pick"><label>Mail hazırlanacak HKN faturası<select value={selectedInvoice} onChange={e=>setSelectedInvoice(e.target.value)}><option value="">Fatura seç</option>{invoices.map(row=><option key={row.id} value={row.id}>{row.number} · {row.date||""}</option>)}</select></label></div>:<Empty>Mail hazırlamak için bu modele bağlanmış gerçek giden HKN faturası bulunmalı.</Empty>}
            {picked?<InvoiceMailWorkspace key={modelId+":"+picked.id} activeMainCompany={activeMainCompany} selectedInvoice={{
              document_no:picked.number,delivery_no:model360DeliveryForInvoice(picked,docs),
              model_id:modelId,model_name:name,party_name:company,
            }}/>:null}
            <h4>KY ERP'de kayıtlı Outlook gönderim geçmişi</h4>
            {mailHistory.length?<div className="m360-doc-list">{mailHistory.map((item,index)=><div className="m360-doc-row" key={item.id||index}><span><b>{item.invoiceNo||"HKN"}</b><small>{item.deliveryNo||""}</small></span><span>{item.status||"Kayıt"}</span><small>{item.recordedAt?.slice(0,16)||""}</small></div>)}</div>:<Empty>ERP'de doğrulanmış gönderim bağlantısı bulunamadı. Outlook'ta elle gönderilmiş eski mailler otomatik gönderildi sayılmaz.</Empty>}
          </section>:<Empty>Fatura maili için muhasebe/iletişim yetkiniz bulunmuyor.</Empty>)}
          {tab==="review"&&<section>
            <h3><FileCheck2 size={18}/> Model bazında adet & belge kontrolü</h3>
            <p>Bu görünüm bütün departmanların aynı model kimliğinden aldığı kayıtları karşılaştırır. Bir faturada birden fazla model varsa belge toplamı burada her modele tekrar yazılmaz; yalnız bu modele ait doğrulanmış kalemler kullanılır.</p>
            {!canProduction?<Empty>Modelin gerçek üretim miktarlarını görmek için İmalat görüntüleme yetkisi gerekir.</Empty>:
             !quantityReview.ready?<ErrorNotice text={quantityReview.reason}/>:
             <>
              <div className="m360-metrics">
               <Metric name="Gelen irsaliye" value={quantityReview.receivedFromDispatch}/>
               <Metric name="Plan / kart adedi" value={quantityReview.expected}/>
               <Metric name="Brüt üretim" value={quantityReview.producedGross}/>
               <Metric name="Net sağlam" value={quantityReview.producedNet}/>
               <Metric name="Fatura kalemleri" value={quantityReview.invoiced}/>
               <Metric name="Net - fatura" value={quantityReview.remainingFromProduction} accent={quantityReview.remainingFromProduction<0?"warn":""}/>
              </div>
              <p className="m360-info-note">Gelen müşteri irsaliyesi ve giden DDM ayrı hareketlerdir. Giden DDM'nin model kalemi doğrulanmadan sevk miktarı varsayılmaz. Baskı bölgelerinin her fişi kendi operasyonunda sayılır; farklı bölgelerin adetleri tek ürün toplamı gibi toplanmaz.</p>
              {quantityReview.checks.length?<div className="m360-warnings">{quantityReview.checks.map((check,index)=><p key={index}><AlertTriangle size={15}/>{check.message}</p>)}</div>
               :<p className="m360-info-note"><CheckCircle2 size={15}/> Mevcut model kalemi ve üretim miktarları arasında bilinen sayısal tutarsızlık yok; bu, gerçek belge/PDF kabulü değildir.</p>}
              <h4>Bu modele bağlanan fatura kalemleri</h4>
              <div className="m360-table-wrap"><table><thead><tr><th>HKN / Belge</th><th>Kalem ID</th><th>Adet</th><th>Birim</th></tr></thead>
               <tbody>{quantityReview.lines.map(row=><tr key={row.documentId+":"+row.lineId}><td>{row.documentNo||"Belge adı bekliyor"}</td><td>{row.lineId}</td><td>{format(row.quantity)}</td><td>{row.unit||"—"}</td></tr>)}</tbody></table></div>
              {!quantityReview.lines.length?<Empty>Model bazında doğrulanmış fatura kalemi bulunamadı. Genel HKN fatura tutarından pay tahmini yapılmaz.</Empty>:null}
              {canDocuments?<><h4>Belgelerin kaynağı</h4><DocumentList items={docs}/></>:<Empty>Belge bilgileri yalnız Muhasebe / e-Belge yetkisi bulunan personele açılır.</Empty>}
             </>}
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
