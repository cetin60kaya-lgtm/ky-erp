import React,{useEffect,useMemo,useState} from "react";
import {Check,ChevronDown,AlertTriangle,LoaderCircle,LockKeyhole,ShieldCheck} from "lucide-react";
import {makeOperationPreview,operationsForTab,operationById} from "./operationCatalog.js";

const text=(value)=>String(value??"").trim();
const selectOptions=(field,{people,masters})=>{
  switch(field.type){
    case "person":return (people||[]).filter((person)=>!!person.id).map((person)=>({
      value:String(person.id),label:person.cardNo+" · "+person.fullName,
    }));
    case "group":return (masters?.groups||[]).filter((v)=>v.active!==0).map((v)=>({
      value:String(v.id),label:v.code+" · "+v.name,
    }));
    case "personnelGroup":return (masters?.personnelGroups||[]).filter((v)=>v.active!==0).map((v)=>({
      value:String(v.id),label:v.code+" · "+v.name,
    }));
    case "service":return (masters?.services||[]).filter((v)=>v.active!==0).map((v)=>({
      value:String(v.id),label:v.code+" · "+v.name,
    }));
    default:return field.options||[];
  }
};

export default function UnifiedOperationPanel({
  tabId,previewOnly,profile,people,company,year,month,onChanged,
}){
  const choices=useMemo(()=>operationsForTab(tabId),[tabId]);
  const [open,setOpen]=useState(false);
  const [selected,setSelected]=useState("");
  const [form,setForm]=useState({});
  const [masters,setMasters]=useState(null);
  const [reference,setReference]=useState("idle");
  const [preview,setPreview]=useState(null);
  const [ack,setAck]=useState("");
  const [state,setState]=useState({status:"idle",message:"",requestId:""});
  const available=Boolean(previewOnly || (profile?.scope==="FULL" && profile?.audit!==true &&
    company && choices.length));
  const operation=operationById(selected);
  const inputKey=[tabId,company,year,month].join("|");
  const needsReference=Boolean(
    ["work-group","personnel-group","service"].includes(operation?.id) ||
    operation?.fields.some((f)=>["group","personnelGroup","service"].includes(f.type)));

  useEffect(()=>{
    // Reset frozen preview whenever section/company/period context changes.
    setOpen(false);
    setSelected("");
    setForm({});
    setMasters(null);
    setReference("idle");
    setPreview(null);
    setAck("");
    setState({status:"idle",message:"",requestId:""});
  },[inputKey]);

  useEffect(()=>{
    if(previewOnly || !open || !needsReference || !company)return undefined;
    let cancelled=false;
    setReference("loading");
    import("./readService.js")
      .then((service)=>service.readTabSource("masters",{mainCompanyId:company,year,month}))
      .then((data)=>{
        if(!cancelled){setMasters(data);setReference("ready");}
      })
      .catch((error)=>{
        if(!cancelled)setReference("error:"+String(error?.message||"Referans yüklenemedi."));
      });
    return ()=>{cancelled=true;};
  },[previewOnly,open,company,year,month,needsReference]);

  if(!choices.length)return null;
  if(!available)return <div className="pdk-u-operation-guard">
    <LockKeyhole size={16}/> Bu işlemler için sunucu tarafından doğrulanmış FULL yetki gerekir.
  </div>;

  const resetDraft=()=>{
    setPreview(null);setAck("");setState({status:"idle",message:"",requestId:""});
  };
  const choose=(id)=>{setSelected(id);setForm({});resetDraft();};
  const edit=(key,value)=>{setForm((v)=>({...v,[key]:value}));resetDraft();};
  const buildPreview=(e)=>{
    e.preventDefault();
    try {
      if(!operation)throw new Error("İşlem seçilmedi.");
      if(needsReference && reference!=="ready")throw new Error("Firma tanımları doğrulanmadan işlem yapılamaz.");
      const frozen=makeOperationPreview(operation.id,form,{
        company,people,masters:masters||{},year,month,
      });
      setPreview(frozen);setAck("");
      setState({status:"preview",message:"Gözden geçirin. Kaydı yalnız onayla düğmesi gönderir."});
    }catch(error){
      setState({status:"error",message:String(error.message)});
    }
  };
  const commit=async()=>{
    if(!preview || ack!=="ONAYLIYORUM" || state.status==="pending")return;
    setState({status:"pending",message:"Cloud kaydı sunucuya gönderiliyor; işlem tekrar denenmeyecek."});
    try{
      const {submitAndVerify}=await import("./operationTransport.js");
      const reply=await submitAndVerify(preview);
      if(!["CLOUD_D1_VERIFIED","CLOUD_D1_COMMITTED_SOURCE_UNVERIFIED"].includes(reply.status))
        throw new Error("Kalıcı işlem fişi doğrulanamadı.");
      setState({status:reply.sourceReadback?"success":"source-pending",
        message:reply.sourceReadback?
          "D1 işlem fişi ve kaynak kaydı doğrulandı. FDB/TNF eşitlemesi hâlâ bekliyor.":
          "D1 işlemi kalıcı olarak kaydedildi. Ekran kaynak okuması henüz doğrulanamadı. İkinci kez göndermeyin.",
        requestId:reply.requestId});
      onChanged?.();
    }catch(error){
      setState({status:error?.requestId?"uncertain":"error",
        message:String(error?.message||"İşlem doğrulanamadı."),
        requestId:String(error?.requestId||"")});
    }
  };
  const checkReceipt=async()=>{
    if(!state.requestId||state.status==="pending")return;
    setState((current)=>({...current,status:"pending",
      message:"Kalıcı işlem kimliği sunucuda sorgulanıyor..."}));
    try{
      const {checkUnifiedReceipt}=await import("./operationTransport.js");
      const row=await checkUnifiedReceipt(state.requestId);
      if(row.action!==selected)throw new Error("İşlem kimliği başka işlem türüne ait.");
      setState({status:"source-pending",requestId:state.requestId,
        message:"D1 işlem fişi bulundu, kayıt ve audit tek işlemle tamamlandı. Kaynak görünümü veya FDB/TNF ayrıca denetlenmeli."});
      onChanged?.();
    }catch(error){
      setState({status:"uncertain",requestId:state.requestId,
        message:"İşlem fişi şu anda doğrulanamadı: "+String(error?.message||error)+
          ". Yeni bir kayıt açmadan önce yönetici ve işlem günlüğü kontrol etmeli."});
    }
  };
  const newOperation=()=>{
    setSelected("");setForm({});setPreview(null);setAck("");
    setMasters(null);setReference("idle");
    setState({status:"idle",message:"",requestId:""});
  };

  return <section className="pdk-u-operation-box" aria-label="Onaylı PDKS işlemleri">
    <button type="button" className="pdk-u-operation-toggle" onClick={()=>{
      if(state.status==="pending")return;
      setOpen((v)=>!v);
    }}><ShieldCheck size={18}/><strong>İşlem Merkezi</strong>
      <span>{choices.length} işlem türü · {previewOnly?"İnceleme":"Cloud D1"}</span>
      <ChevronDown size={16}/></button>
    {open&&<div className="pdk-u-operation-body">
      <p className="pdk-u-operation-warning"><AlertTriangle size={16}/>
        {previewOnly ? "Yalnız görsel/form kontrolü. Sunucu bağlantısı ve kayıt düğmesi kapalıdır." :
          "Yalnız Cloud D1 yönetim/özlük kayıtları; fiziksel terminal, Firebird ve yıllık TNF kayıtları değiştirilmez."}
      </p>
      <label className="pdk-u-operation-label">İşlem türü
        <select value={selected} disabled={["pending","success","uncertain","source-pending"].includes(state.status)}
          onChange={(e)=>choose(e.target.value)}><option value="">İşlem seçiniz</option>
          {choices.map((item)=><option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
      </label>
      {operation&&<form onSubmit={buildPreview}>
        <div className="pdk-u-operation-fields">{operation.fields.map((field)=>{
          const options=selectOptions(field,{people,masters});
          const isSelect=["person","group","personnelGroup","service","select"].includes(field.type);
          return <label key={field.id} className="pdk-u-operation-label">{field.label}
            {isSelect?<select required={field.required} value={text(form[field.id])}
              disabled={["pending","success","uncertain","source-pending"].includes(state.status)}
              onChange={(e)=>edit(field.id,e.target.value)}>
              <option value="">Seçiniz</option>{options.map((item)=><option key={item.value}
                value={item.value}>{item.label}</option>)}
              </select>:<input required={field.required}
                type={field.type==="time"?"time":field.type==="date"?"date":
                  field.type==="number"?"number":"text"}
                min={field.type==="number"?"0":undefined}
                max={field.id==="lateTolerance"||field.id==="earlyTolerance"?"240":undefined}
                step={field.id==="amount"?"0.01":field.type==="number"?"1":undefined}
                maxLength={field.id==="reason"||field.id==="note"?600:150}
                value={text(form[field.id])}
                disabled={["pending","success","uncertain","source-pending"].includes(state.status)}
                onChange={(e)=>edit(field.id,e.target.value)}/>}
          </label>;
        })}</div>
        <p className="pdk-u-operation-warning">{operation.warning}</p>
        {reference.startsWith("error:")&&<p role="alert">{reference}</p>}
        {reference==="loading"&&<p>Firma tanımları doğrulanıyor...</p>}
        {!preview&&state.status!=="success"&&state.status!=="uncertain"&&
          <button className="pdk-u-btn" type="submit" disabled={previewOnly||state.status==="pending"||
            (needsReference&&reference!=="ready")}>
            <ShieldCheck size={15}/> Önizleme ve kontrol
          </button>}
      </form>}
      {previewOnly&&operation&&<p className="pdk-u-operation-warning">
        Form yerleşimi incelenebilir; test ortamında kişi ve cihaz kaydı üretilmez.
        Onay ve kaydetme işlemleri devre dışıdır.
      </p>}
      {preview&&<div className="pdk-u-operation-preview">
        <h3>Değişiklik önizlemesi · {preview.title}</h3>
        <dl>{Object.entries(preview.payload).map(([key,value])=><div key={key}>
          <dt>{operation.fields.find((f)=>f.id===key)?.label||key}</dt>
          <dd>{typeof value==="boolean"?(value?"Evet":"Hayır"):String(value)}</dd>
        </div>)}</dl>
        <p>Kaynak: Cloud D1 · Firma: {preview.company} · FDB/TNF güncellenmez.</p>
        {state.status==="preview"&&<>
          <label className="pdk-u-operation-label">Kesin onay için ONAYLIYORUM yazın
            <input value={ack} onChange={(e)=>setAck(e.target.value)} placeholder="ONAYLIYORUM"/>
          </label>
          <button className="pdk-u-btn pdk-u-operation-commit" type="button"
            disabled={ack!=="ONAYLIYORUM"} onClick={commit}><Check size={16}/> Kaydı onayla ve doğrula</button>
        </>}
      </div>}
      {state.status!=="idle"&&<p role="status" className={"pdk-u-operation-state pdk-u-operation-"+state.status}>
        {state.status==="pending"&&<LoaderCircle size={15}/>} {state.message}
        {state.requestId&&<span className="pdk-u-operation-receipt">
          İşlem kimliği: <code>{state.requestId}</code>
        </span>}
      </p>}
      {["uncertain","source-pending","success"].includes(state.status)&&<div className="pdk-u-operation-buttons">
        {state.requestId&&state.status!=="success"&&<button
          type="button" className="pdk-u-btn" onClick={checkReceipt}>
          İşlem fişini sorgula
        </button>}
        {state.status==="success"&&<button type="button" className="pdk-u-btn"
          onClick={newOperation}>Yeni işlem başlat</button>}
      </div>}
    </div>}
  </section>;
}
