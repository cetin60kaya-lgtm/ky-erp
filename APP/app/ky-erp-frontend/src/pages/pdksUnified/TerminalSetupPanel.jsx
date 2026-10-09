import React,{useMemo,useState} from "react";
import {Cable,CheckCircle2,Download,ExternalLink,HardDrive,Info,LockKeyhole,
  Network,Radio,ScanLine,ShieldAlert,ShieldCheck} from "lucide-react";
import {CONNECTORS,INPUT_METHODS,installationPlan,validateTerminalDefinition}
  from "../../../../../pdks-unified/device-gateway/terminal-profiles.mjs";

const vendors=Object.freeze([
  ["KY QR","KY QR / Barkod"],
  ["ZKTeco","ZKTeco"],
  ["Suprema","Suprema"],
  ["Hikvision","Hikvision"],
  ["Anviz","Anviz"],
  ["Dahua","Dahua"],
  ["HID","HID / OSDP"],
  ["Generic","Diğer / Açık API"],
]);
const defaults=()=>({
  terminalId:"",vendor:"",model:"",connectorId:"KY_QR_LOCAL",
  host:"",port:"",baseUrl:"",timezone:"Europe/Istanbul",
  inputMethods:["QR_SIGNED"],directionMode:"EXPLICIT_IN_OUT",
  approvalState:"DRAFT",
});
const needsHost=(connector)=>["LAN_VENDOR","HTTPS_VENDOR",
  "RS485_CONTROLLER","READER_CONTROLLER"].includes(connector?.transport);
const needsUrl=(connector)=>["HTTPS_SERVER","VENDOR_CLOUD","HTTPS_API"]
  .includes(connector?.transport);
const statusLabel=(id)=>({
  REFERENCE_IMPLEMENTED:"Yerel örnek sürücü kodlandı",
  SDK_REQUIRED:"Üretici SDK ve model testi gerekli",
  MODEL_PROTOCOL_REQUIRED:"Model protokol kanıtı gerekli",
  LICENSE_AND_SERVER_REQUIRED:"BioStar sunucu / lisans gerekli",
  LICENSE_AND_MODEL_REQUIRED:"BioStar X API / lisans gerekli",
  VENDOR_ACCOUNT_REQUIRED:"Üretici hesabı / API yetkisi gerekli",
  CERTIFIED_CONTROLLER_REQUIRED:"OSDP sertifikalı kontrolcü gerekli",
  LEGACY_CONTROLLER_REQUIRED:"Wiegand kontrol paneli gerekli",
  SIGNED_SCHEMA_REQUIRED:"İmzalı API sözleşmesi gerekli",
  REFERENCE_IMPORT_ONLY:"Salt okunur dosya içe aktarımı",
})[id]||"Sürücü doğrulaması bekleniyor";
const row=(name,done)=> <li key={name} className={done?"is-checked":""}>
  {done?<CheckCircle2 size={15}/>:<ShieldAlert size={15}/>} {name}</li>;
export default function TerminalSetupPanel({company="",previewOnly=true}){
  const [config,setConfig]=useState(defaults);
  const [result,setResult]=useState(null);
  const [notice,setNotice]=useState("");
  const connector=CONNECTORS.find(c=>c.id===config.connectorId);
  const counts=useMemo(()=>({
    connectors:CONNECTORS.length,inputMethods:INPUT_METHODS.length,
    ready:CONNECTORS.filter(x=>x.status==="REFERENCE_IMPLEMENTED").length,
  }),[]);
  const change=(name,v)=>{setConfig(before=>({...before,[name]:v}));setResult(null);setNotice("")};
  const toggle=(value,on)=>change("inputMethods",on?
    [...new Set([...config.inputMethods,value])]:
    config.inputMethods.filter(x=>x!==value));
  const deviceDraft=()=>{
    const obj={...config,companyId:company};
    delete obj.host;delete obj.port;delete obj.baseUrl;
    if(needsHost(connector)){obj.host=config.host;obj.port=Number(config.port)}
    if(needsUrl(connector))obj.baseUrl=config.baseUrl;
    return obj;
  };
  const validate=()=>{
    try{
      if(!previewOnly&&!company)throw new Error("Önce aktif firma seçilmelidir.");
      const draft=deviceDraft();
      // A preview-only placeholder exists in memory for client-side validation.
      // Never submit, download, persist or certify this pseudo-tenant.
      if(previewOnly)draft.companyId="preview-only";
      const plan=installationPlan(draft);
      setResult(plan);setNotice(previewOnly?
        "Yalnız tasarım doğrulaması. Gerçek cihaz kaydı oluşturulmadı.":"");
    }catch(error){setResult(null);setNotice(String(error?.message||"Cihaz tanımı doğrulanamadı."))}
  };
  const download=()=>{
    if(!result||previewOnly)return;
    const config=validateTerminalDefinition(deviceDraft());
    const blob=new Blob([JSON.stringify(config,null,2)+"\n"],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;
    a.download="KY-PDKS-TERMINAL-"+config.terminalId+".json";a.click();
    URL.revokeObjectURL(url);
  };
  return <section className="pdk-u-terminal" aria-label="Çok markalı terminal kurulum merkezi">
    <div className="pdk-u-terminal-head">
      <div><div className="pdk-u-terminal-kicker"><Radio size={15}/> KY PDKS · Terminal Hub</div>
        <h3>Cihaz kurulum ve bağlantı profilleri</h3>
        <p>Her cihazı marka, model, okuyucu türü ve bağlantı yöntemiyle ayrı tanımlayın.
          Üretici sürücüsü doğrulanmadan hiçbir terminal “bağlı” kabul edilmez.</p>
      </div>
      <div className="pdk-u-terminal-stats">
        <span><strong>{counts.connectors}</strong> bağlantı profili</span>
        <span><strong>{counts.inputMethods}</strong> okuyucu türü</span>
        <span><strong>{counts.ready}</strong> yerel referans</span>
      </div>
    </div>
    <div className="pdk-u-terminal-layout">
      <div className="pdk-u-terminal-form">
        <div className="pdk-u-terminal-sub"><HardDrive size={17}/> Yeni terminal tanımı</div>
        <div className="pdk-u-terminal-fields">
          <label>Terminal kodu
            <input aria-label="Terminal kodu" value={config.terminalId}
              onChange={e=>change("terminalId",e.target.value)}
              placeholder="Örn. DESEN-TERMINAL-01"/></label>
          <label>Firma / üretici
            <select aria-label="Terminal markası" value={config.vendor}
              onChange={e=>change("vendor",e.target.value)}>
              <option value="">Marka seçin</option>
              {vendors.map(([id,name])=><option key={id} value={id}>{name}</option>)}
            </select></label>
          <label>Gerçek model
            <input aria-label="Terminal modeli" value={config.model}
              onChange={e=>change("model",e.target.value)}
              placeholder="Cihazın etiketteki tam modeli"/></label>
          <label>Protokol / sürücü
            <select aria-label="Terminal protokolü" value={config.connectorId}
              onChange={e=>change("connectorId",e.target.value)}>
              {CONNECTORS.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}
            </select></label>
          {needsHost(connector)&&<><label>Yerel IP (yalnız özel ağ)
            <input aria-label="Terminal IPv4" value={config.host} placeholder="192.168.1.25"
              onChange={e=>change("host",e.target.value)}/></label>
            <label>Bağlantı portu
            <input aria-label="Terminal portu" inputMode="numeric" value={config.port}
              onChange={e=>change("port",e.target.value)}/></label></>}
          {needsUrl(connector)&&<label className="pdk-u-terminal-span">Üretici HTTPS sunucusu
            <input aria-label="Terminal HTTPS adresi" value={config.baseUrl}
              onChange={e=>change("baseUrl",e.target.value)}
              placeholder="https://device-management.example"/></label>}
          <label>Zaman dilimi
            <input aria-label="Terminal saat dilimi" value={config.timezone}
              onChange={e=>change("timezone",e.target.value)}/></label>
          <label>Giriş / çıkış yönü
            <select aria-label="Terminal yönü" value={config.directionMode}
              onChange={e=>change("directionMode",e.target.value)}>
              <option value="EXPLICIT_IN_OUT">Giriş ve çıkış seçilebiliyor</option>
              <option value="EXPLICIT_IN">Yalnız giriş okuyucusu</option>
              <option value="EXPLICIT_OUT">Yalnız çıkış okuyucusu</option>
              <option value="UNKNOWN">Yön belirsiz — mutabakat bekler</option>
            </select></label>
        </div>
        <div className="pdk-u-terminal-sub"><ScanLine size={17}/> Destek istenen okutma tipleri</div>
        <div className="pdk-u-terminal-modalities">
          {INPUT_METHODS.map(m=><label key={m.id}>
            <input type="checkbox" checked={config.inputMethods.includes(m.id)}
              disabled={previewOnly} onChange={e=>toggle(m.id,e.target.checked)}/>
            <span>{m.label}</span></label>)}
        </div>
        <div className="pdk-u-terminal-actions">
          <button type="button" className="pdk-u-btn"
            onClick={validate}><ShieldCheck size={16}/> Kurulum planını doğrula</button>
          <button type="button" className="pdk-u-btn" disabled={!result||previewOnly}
            onClick={download}><Download size={16}/> Güvenli JSON taslak indir</button>
        </div>
        {notice&&<p role="alert" className="pdk-u-live-note is-alert">{notice}</p>}
      </div>
      <div className="pdk-u-terminal-summary">
        <div className="pdk-u-terminal-sub"><Network size={17}/> Bağlantı durumu ve kabul adımları</div>
        <p className="pdk-u-terminal-driver"><strong>{connector?.label}</strong>
          <span>{statusLabel(connector?.status)}</span></p>
        <div className="pdk-u-terminal-flag"><LockKeyhole size={17}/>
          <span>Canlı cihaza bağlanılmadı. Silme, kullanıcı taşıma, cihaz saatini değiştirme ve biyometrik şablon aktarma işlemleri kapalı.</span>
        </div>
        <ol className="pdk-u-terminal-checks">
          {(result?.checks||[
            {title:"Firma / cihaz modeli ve seri no doğrulama",verified:false},
            {title:"Ağ / SDK / lisans bağlantı testi",verified:false},
            {title:"Cihaz saati ve saat dilimi",verified:false},
            {title:"Personel kart numarası eşleştirmesi",verified:false},
            {title:"Giriş–çıkış hareketi test kaydı",verified:false},
            {title:"Firebird ve yıllık TNF mutabakatı",verified:false},
          ]).map(x=>row(x.title,x.verified))}
        </ol>
        {result&&<p className="pdk-u-terminal-driver">
          <strong>Tanım geçerli, fakat cihaz henüz sertifikalı değil.</strong>
          <span>Sonraki adım: {result.nextStep}</span>
        </p>}
        <div className="pdk-u-terminal-sub"><Cable size={16}/> KY imzalı QR / USB okuyucu</div>
        <p>Yerel QR terminali <code>127.0.0.1:5197</code> adresinden, yalnız
          açık izinli Windows Agent komutuyla başlatılır. QR kamera ve USB HID
          okutma desteklenir; kart okuması kimlik doğrulanana kadar beklemede kalır.</p>
        <a href="http://127.0.0.1:5197/" target="_blank"
          rel="noopener noreferrer" className="pdk-u-terminal-link"
          onClick={e=>{if(previewOnly)e.preventDefault()}}>
          Yerel terminal ekranını aç <ExternalLink size={14}/></a>
        <p className="pdk-u-terminal-muted"><Info size={14}/>
          QR imza kanıtı, bir fiziksel terminale veya Firebird/TNF kaydına otomatik eşitlenmez.</p>
      </div>
    </div>
  </section>;
}
