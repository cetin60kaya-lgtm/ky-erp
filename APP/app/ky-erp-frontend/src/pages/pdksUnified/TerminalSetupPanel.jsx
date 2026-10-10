import React,{useMemo,useState} from "react";
import {Cable,CheckCircle2,Download,ExternalLink,HardDrive,Info,LockKeyhole,
  Network,Radio,ScanLine,ShieldAlert,ShieldCheck} from "lucide-react";
import {CONNECTORS,INPUT_METHODS,installationPlan,validateTerminalDefinition}
  from "../../../../../pdks-unified/device-gateway/terminal-profiles.mjs";
import {parseTerminalDiagnosticReport} from "./terminalReportView.mjs";
import {CONFIRMED_LEGACY_TERMINAL,inspectImportedLegacyProfiles}
  from "../../../../../pdks-unified/device-gateway/legacy-hedef-terminal-profile.mjs";
import {projectTerminalCsv} from "./terminalCsvView.mjs";
import {buildCardPrintHtml} from "../../../../../pdks-unified/device-gateway/card-printer.mjs";

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
  LEGACY_X86_BRIDGE_REQUIRED:"Eski FP_CLOCK x86 köprüsüyle doğrulama gerekli",
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
export default function TerminalSetupPanel({company="",previewOnly=true,onReportLoaded=()=>{}}){
  const [config,setConfig]=useState(defaults);
  const [result,setResult]=useState(null);
  const [notice,setNotice]=useState("");
  const [diagnostic,setDiagnostic]=useState(null);
  const [csvDiagnostic,setCsvDiagnostic]=useState(null);
  const [legacyProfiles,setLegacyProfiles]=useState([CONFIRMED_LEGACY_TERMINAL]);
  const connector=CONNECTORS.find(c=>c.id===config.connectorId);
  const counts=useMemo(()=>({
    connectors:CONNECTORS.length,inputMethods:INPUT_METHODS.length,
    ready:CONNECTORS.filter(x=>x.status==="REFERENCE_IMPLEMENTED").length,
  }),[]);
  const change=(name,v)=>{setConfig(before=>({...before,[name]:v}));setResult(null);setNotice("");setDiagnostic(null);setCsvDiagnostic(null);onReportLoaded(null)};
  const toggle=(value,on)=>change("inputMethods",on?
    [...new Set([...config.inputMethods,value])]:
    config.inputMethods.filter(x=>x!==value));
  const loadLegacyProfile=(profile)=>{
    // A saved profile is connection metadata, not a physical success claim.
    setConfig(before=>({...before,
      terminalId:profile.profileName==="Cihaz1"?"HEDEF-CIHAZ-1":profile.profileName,
      vendor:"Generic",model:"HEDEF FP_CLOCK x86",
      connectorId:"HEDEF_FP_CLOCK",host:profile.ip,port:String(profile.port),
      directionMode:profile.direction==="IN"?"EXPLICIT_IN":"UNKNOWN",
      inputMethods:["RFID_125KHZ"],timezone:"Europe/Istanbul",
      approvalState:"DRAFT",
    }));
    setResult(null);setDiagnostic(null);setCsvDiagnostic(null);
    setNotice("Eski cihazın bağlantı ayarları alındı. FP_CLOCK sürücüsüyle saha testi gerekir.");
  };
  const importLegacyProfiles=async(file)=>{
    if(!file)return;
    try{
      if(file.size>16384)throw Error("LEGACY_PROFILES_FILE_TOO_LARGE");
      const parsed=JSON.parse(await file.text());
      const rows=inspectImportedLegacyProfiles(Array.isArray(parsed)?parsed:parsed.profiles);
      setLegacyProfiles(rows);
      setNotice(rows.length+" yerel cihaz profili yüklendi. Canlı cihaza bağlanılmadı.");
    }catch(error){setNotice("Eski cihaz profilleri reddedildi: "+String(error?.message||"Hata"));}
  };
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
  const readDiagnostic=async(file)=>{
    if(!file||!result||previewOnly)return;
    try{
      if(file.size>65536||file.size<40)throw new Error("TERMINAL_REPORT_SIZE_INVALID");
      const data=parseTerminalDiagnosticReport(await file.text(),result.device.terminalId);
      setDiagnostic(data);onReportLoaded(data);setNotice("Yerel tanı dosyası görüntülendi. Bu dosya imzasızdır; saha sertifikası değildir.");
    }catch(error){setDiagnostic(null);onReportLoaded(null);
      setNotice("Tanı raporu reddedildi: "+String(error?.message||"Geçersiz JSON"));}
  };
  const readCsv=async(file)=>{
    if(!file||previewOnly)return;
    try{
      if(file.size>8_000_000||file.size<40)throw Error("TERMINAL_CSV_SIZE_INVALID");
      const summary=projectTerminalCsv(await file.text());
      setCsvDiagnostic(summary);
      setNotice("CSV yalnız yerel bellekte incelendi. Gerçek cihaz/kimlik sertifikası değildir.");
    }catch(error){
      setCsvDiagnostic(null);
      setNotice("CSV kaynağı reddedildi: "+String(error?.message||"Bilinmeyen hata"));
    }
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
  const printerTest=()=>{
    const preview=window.open("","_blank");
    if(!preview){setNotice("Kart önizlemesi için açılır pencere izni gerekir.");return;}
    preview.document.open();
    preview.document.write(buildCardPrintHtml({type:"test"}));
    preview.document.close();
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
        <div className="pdk-u-terminal-sub"><Cable size={17}/> Eski KY PDKS / Hedef cihaz profilleri</div>
        <p>Önceki uygulamada kullanılan 192.168.1.224:5005 bağlantısı kayıtlıdır.
          FP_CLOCK.ocx (32-bit) gerçek cihaz köprüsü ayrıca doğrulanır.</p>
        <div className="pdk-u-terminal-actions">
          {legacyProfiles.map(p=><button key={p.profileName+":"+p.machineId}
            type="button" className="pdk-u-btn" onClick={()=>loadLegacyProfile(p)}>
            {p.profileName} · {p.ip}:{p.port}
          </button>)}
        </div>
        <label className="pdk-u-terminal-report-upload">Eski uygulamadan iki profil JSON dosyasını içe aktar
          <input aria-label="İki eski terminal profilini içe aktar" type="file"
            accept=".json,application/json" disabled={previewOnly}
            onChange={e=>{const file=e.target.files?.[0];if(file)void importLegacyProfiles(file);}}/>
        </label>
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
        <div className="pdk-u-terminal-sub"><HardDrive size={16}/> Terminal CSV hareket incelemesi</div>
        <p>Yön kodları açıkça belirtilmiş yerel terminal CSV çıktısı yalnız okunur.
          Dosya sunucuya gönderilmez; cihazın fiziksel kimliği onaylanmaz.</p>
        <label className="pdk-u-terminal-report-upload">
          Terminal CSV kaydını aç
          <input aria-label="Terminal CSV tanı dosyası" type="file" accept=".csv,text/csv"
            disabled={previewOnly}
            onChange={e=>{const file=e.target.files?.[0];if(file)void readCsv(file);}}/>
        </label>
        {csvDiagnostic&&<div className="pdk-u-terminal-diagnostic" role="status">
          <strong>CSV kaynak inceleme · onaysız</strong>
          <div className="pdk-u-terminal-diagnostic-counts">
            <span>Okunan <b>{csvDiagnostic.inspected}</b></span>
            <span>Geçerli biçim <b>{csvDiagnostic.accepted}</b></span>
            <span>Reddedilen <b>{csvDiagnostic.rejected}</b></span>
            <span>Mükerrer <b>{csvDiagnostic.duplicates}</b></span>
          </div>
          <table className="pdk-u-table"><thead><tr>
            <th>Tarih</th><th>Giriş tarafı</th><th>Çıkış tarafı</th><th>Durum</th>
          </tr></thead><tbody>
            {csvDiagnostic.dailyBatches.slice(0,31).map(row=><tr key={row.date}>
              <td>{row.date}</td><td>{row.entries}</td><td>{row.exits}</td>
              <td>{row.entries===row.exits?"Sayılar eşit · onaysız":"Farklı sayıda taraf"}</td>
            </tr>)}
          </tbody></table>
        </div>}
        <div className="pdk-u-terminal-sub"><HardDrive size={16}/> Bağlantı testi ve TNF tanı raporu</div>
        <p>Kurulmuş KY QR terminalini Windows'ta <code>Install-KyPdks-LocalTerminal.ps1 -Action Test -TerminalId KOD</code>
          komutuyla yalnız okuyarak sınayın. Diğer markalar için gerçek model sürücüsü ve yetkili SDK testi gereklidir.</p>
        <p>Kaynak karşılaştırması için <code>Test-KyPdks-TerminalEvidence.ps1</code> aracında terminal kodu,
          TNF dosyası ve yıl belirtilerek anonim JSON rapor oluşturulur. Bu işlem verileri değiştirmez.</p>
        <label className="pdk-u-terminal-report-upload">
          Yerel Tanı Raporunu Aç (JSON)
          <input aria-label="Terminal tanı raporu" type="file" accept=".json,application/json"
            disabled={previewOnly||!result}
            onChange={event=>{const file=event.target.files?.[0];if(file)void readDiagnostic(file);}}/>
        </label>
        {diagnostic&&<div className="pdk-u-terminal-diagnostic" role="status">
          <strong>TNF referans karşılaştırması · {diagnostic.terminalId}</strong>
          <div className="pdk-u-terminal-diagnostic-counts">
            <span>Yerel kayıt <b>{diagnostic.inspected}</b></span>
            <span>TNF ile eşleşen <b>{diagnostic.matched}</b></span>
            <span>TNF'de bulunmayan <b>{diagnostic.unmatched}</b></span>
            <span>Aynı dakika/çakışma <b>{diagnostic.ambiguous}</b></span>
            <span>Reddedilen kanıt <b>{diagnostic.invalid}</b></span>
            <span>Kimliği belirsiz USB <b>{diagnostic.unsigned}</b></span>
          </div>
          <p>Dosya imzasız bir operatör tanısıdır. Fiziksel cihaz RAW, Firebird, bordro ve yıllık TNF
            otomatik doğrulanmış veya değiştirilmiş sayılmaz.</p>
        </div>}
        <div className="pdk-u-terminal-sub"><Network size={16}/> Çoklu Hedef cihaz izleme</div>
        <p>İki eski cihazın gerçek profilini ayrı ayrı alın. Windows yerel gözlemci
          bağlantı kesilince yeniden dener; TCP yanıtı gerçek FP_CLOCK kart okuması değildir.
          İkinci profil, OCX metotları ve gerçek ham olay kanıtı doğrulanmadı.</p>
        <p><code>node APP/pdks-unified/device-gateway/terminal-fleet-cli.mjs --profiles C:\\YOL\\hedef-cihazlar.json --watch</code>
          komutunu yalnız yerel Windows bilgisayarında ve <code>KY_PDKS_COMPANY_ID</code>
          tanımlandıktan sonra çalıştırın.</p>
        <a href="http://127.0.0.1:5206/" target="_blank" rel="noopener noreferrer"
          className="pdk-u-terminal-link"
          onClick={event=>{if(previewOnly)event.preventDefault();}}>
          Çoklu cihaz canlı ağ durumunu aç <ExternalLink size={14}/>
        </a>
        <div className="pdk-u-terminal-sub"><HardDrive size={16}/> Kart yazıcıları</div>
        <p>Mevcut Windows kart yazıcısı sürücüsünü kullanın. Test kartı ve
          Personel 360° &gt; Kart ekranındaki doğrulanmış kart önizlemesi 86 × 54 mm'dir.
          Fiziksel baskı yalnız operatörün yazdırma penceresinden başlatılır.</p>
        <button type="button" className="pdk-u-btn" disabled={previewOnly}
          onClick={printerTest}><Download size={15}/> Test kartı baskı önizlemesi</button>
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
