import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileCheck2, FileText, FolderOpen, LockKeyhole, RefreshCw, ShieldCheck, Truck } from "lucide-react";
import {
  getIsnetLocalSelection, getLocalIsnetAdapterHealth, importIsnetLocalOriginal,
  isnetSources, localIsnetRequest, saveIsnetLocalSelection,
} from "../../../services/isnetLocalApi";
import "./eBelgeIsnetPortalSync.css";

const isoDay = date => [
  date.getFullYear(),String(date.getMonth()+1).padStart(2,"0"),String(date.getDate()).padStart(2,"0"),
].join("-");
const daysAgo = count => {
  const d = new Date();d.setDate(d.getDate()-count);return isoDay(d);
};
const number = value => Number(value||0).toLocaleString("tr-TR");
const validPeriod = (start,end) => {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end))return false;
  const diff=(Date.parse(end+"T00:00:00Z")-Date.parse(start+"T00:00:00Z"))/86400000;
  return Number.isFinite(diff)&&diff>=0&&diff<=31;
};
const blankTotals=()=>({listed:0,attempted:0,created:0,duplicate:0,pdfMissing:0,failed:0});
const errorText = error => String(error?.message||"İşNet işlemi tamamlanamadı.");
const emptyStatus={type:"",text:""};

export default function EBelgeIsnetPortalSync({ activeMainCompany, openModule, enabled=true, onSynced }) {
  const tenant = activeMainCompany?.slug || activeMainCompany?.mainCompanySlug || activeMainCompany?.id || "";
  const [adapter,setAdapter]=useState(null);
  const [selection,setSelection]=useState(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState("");
  const [status,setStatus]=useState(emptyStatus);
  const [user,setUser]=useState("");
  const [password,setPassword]=useState("");
  const [companies,setCompanies]=useState([]);
  const [companyId,setCompanyId]=useState("");
  const [start,setStart]=useState(()=>daysAgo(7));
  const [end,setEnd]=useState(()=>daysAgo(0));
  const [totals,setTotals]=useState(blankTotals);
  const [counts,setCounts]=useState({});
  const [current,setCurrent]=useState("");
  const stopRef=useRef(false);
  const disposedRef=useRef(false);
  const lockedRef=useRef(false);

  const refresh=useCallback(async()=>{
    if(!tenant)return;
    setLoading(true);
    const [local,remote]=await Promise.allSettled([
      getLocalIsnetAdapterHealth(),getIsnetLocalSelection(tenant),
    ]);
    if(disposedRef.current)return;
    setAdapter(local.status==="fulfilled"?local.value:null);
    setSelection(remote.status==="fulfilled"?remote.value:null);
    setLoading(false);
    if(local.status!=="fulfilled"){
      setStatus({type:"warning",text:
        "DESEN'deki İşNet yerel adaptörü bu tarayıcıda erişilebilir değil. Bu nedenle bulut üzerinden şifre denenmeyecek. Mevcut KY Control Hub / portal adaptörü bağlantısını kontrol edin."});
    }else if(remote.status!=="fulfilled"){
      setStatus({type:"error",text:"KY ERP firma bağlantısı okunamadı. Belge indirmeden önce ERP oturumunu kontrol edin."});
    }else{
      setStatus(emptyStatus);
    }
  },[tenant]);

  useEffect(()=>{
    disposedRef.current=false;
    stopRef.current=true;
    setAdapter(null);setSelection(null);setCompanies([]);setCompanyId("");
    setPassword("");setUser("");setCounts({});setTotals(blankTotals());setStatus(emptyStatus);
    void refresh();
    return ()=>{disposedRef.current=true;stopRef.current=true;};
  },[refresh]);

  const connected=adapter?.connected===true;
  const selected=connected&&selection?.localPortalConfigured===true &&
    String(selection?.companyId||"")===String(adapter?.companyId||"");
  const canWork=enabled&&!loading&&!busy&&selected&&Boolean(tenant);
  const progressName=current||"Henüz işlem başlatılmadı";

  const authenticate=async event=>{
    event.preventDefault();
    if(lockedRef.current||!adapter?.token||!user.trim()||!password)return;
    lockedRef.current=true;setBusy("login");setStatus(emptyStatus);
    try{
      const response=await localIsnetRequest(adapter.token,"/session/login",{username:user.trim(),password});
      const available=Array.isArray(response.companies)?response.companies:[];
      if(!available.length)throw Error("İşNet giriş yaptı ancak yetkili firma listesi boş.");
      setCompanies(available);
      setCompanyId(available.some(c=>String(c.id)===String(selection?.companyId))?String(selection.companyId):
        available.length===1?String(available[0].id):"");
      setAdapter(prev=>({...prev,connected:false,companyId:"",companyName:""}));
      setStatus({type:"success",text:"NetteFatura gerçek firma listesi alındı. Firmanı seçip oturumu aç."});
    }catch(error){setStatus({type:"error",text:errorText(error)});setCompanies([]);}
    finally{setPassword("");setBusy("");lockedRef.current=false;}
  };

  const saveSelected=async company=>{
    if(lockedRef.current||!adapter?.token||!company?.id||!company?.name)return;
    lockedRef.current=true;setBusy("company");setStatus(emptyStatus);
    try{
      const session=connected&&String(adapter?.companyId)===String(company.id)
        ? {companyId:adapter.companyId,companyName:adapter.companyName}
        : await localIsnetRequest(adapter.token,"/session/company",{id:company.id,name:company.name});
      // Portal selection is a real Windows session. Only company ID/name go to D1.
      setAdapter(prev=>({...prev,connected:true,companyId:session.companyId,companyName:session.companyName}));
      const saved=await saveIsnetLocalSelection({
        mainCompanySlug:tenant,companyId:session.companyId,companyName:session.companyName,
      });
      const verified=await getIsnetLocalSelection(tenant);
      if(String(verified?.companyId)!==String(saved?.companyId) ||
         verified?.localPortalConfigured!==true)throw Error("Firma kaydı D1 üzerinde doğrulanamadı. Yerel oturum açık; yeniden kaydet.");
      setSelection(verified);setCompanies([]);
      setStatus({type:"success",text:"Firma doğrulandı ve KY ERP'ye kaydedildi. İşNet oturumu yerel bilgisayarda açık."});
    }catch(error){setStatus({type:"error",text:errorText(error)});}
    finally{setBusy("");lockedRef.current=false;}
  };

  const clearSession=async()=>{
    if(lockedRef.current||!adapter?.token)return;
    lockedRef.current=true;setBusy("logout");
    try {
      await localIsnetRequest(adapter.token,"/session/clear",{});
      setAdapter(prev=>({...prev,connected:false,companyId:"",companyName:""}));
      setCompanies([]);setCompanyId("");setUser("");setPassword("");
      setStatus({type:"success",text:"İşNet yerel oturumu kapatıldı. KY ERP'deki eski belge ve firma kayıtları silinmedi."});
    }catch(error){setStatus({type:"error",text:errorText(error)});}
    finally{setBusy("");lockedRef.current=false;}
  };

  const run=async single=>{
    if(lockedRef.current||!canWork)return;
    if(!validPeriod(start,end))return setStatus({type:"warning",text:"Geçerli tarih aralığı 0–31 gün arasında olmalıdır."});
    lockedRef.current=true;stopRef.current=false;setBusy("sync");
    setStatus({type:"progress",text:"İşNet belgeleri yerel portal üzerinden listeleniyor..."});
    setCurrent("Dört belge türü sorgulanıyor");
    let stats=blankTotals();
    const categoryCounts={};
    try{
      const all=[];
      for(const source of isnetSources){
        if(stopRef.current)break;
        setCurrent(source.label+" listeleniyor");
        const response=await localIsnetRequest(adapter.token,"/documents",{
          start,end,sourceKey:source.key,
        });
        const rows=Array.isArray(response.documents)?response.documents:[];
        categoryCounts[source.key]=rows.length;all.push(...rows);
        setCounts({...categoryCounts});stats.listed=all.length;setTotals({...stats});
      }
      if(!stopRef.current){
        const queue=single?all.slice(0,1):all;
        if(!queue.length)setStatus({type:"success",text:"Seçilen dönemde İşNet'te belge bulunamadı. Mevcut arşiv korunuyor."});
        for(let index=0;index<queue.length&&!stopRef.current;index+=1){
          const document=queue[index];
          setCurrent(number(index+1)+"/"+number(queue.length)+" · "+(document.no||document.sourceKey));
          stats.attempted+=1;
          try {
            const xml=await localIsnetRequest(adapter.token,"/file",{
              id:document.sourceId,sourceKey:document.sourceKey,format:"xml",
            });
            let pdf=null;
            try{
              pdf=await localIsnetRequest(adapter.token,"/file",{
                id:document.sourceId,sourceKey:document.sourceKey,format:"pdf",
              });
            }catch {stats.pdfMissing+=1;}
            const saved=await importIsnetLocalOriginal({
              mainCompanySlug:tenant,companyId:adapter.companyId,document,xml,pdf,
            });
            if(!saved?.documentId)throw Error("KY ERP belge kaydı doğrulanamadı.");
            if(saved.duplicate===true)stats.duplicate+=1;
            else stats.created+=1;
          }catch(error){
            stats.failed+=1;
            setStatus({type:"warning",text:
              "Bazı belgeler kontrol gerektiriyor. Hata "+(document.no||document.sourceId)+": "+errorText(error)+
              " · Başarılı kayıtlar korunuyor."});
          }
          setTotals({...stats});
        }
        if(!stopRef.current){
          setStatus({
            type:stats.failed||stats.pdfMissing?"warning":"success",
            text:single?
              "İlk belge kontrolü bitti. Belge Havuzu'ndan orijinal XML/PDF'yi açarak doğrulayın.":
              stats.failed||stats.pdfMissing?
                "Tarama bitti. "+number(stats.failed)+" belge ve "+number(stats.pdfMissing)+" eksik PDF kontrol gerektiriyor; arşivlenenler silinmedi.":
                "İşNet taraması tamamlandı. Orijinal XML ve PDF, KY ERP e-Belge Havuzu'na işlendi.",
          });
        }
      }
      if(stopRef.current)setStatus({type:"warning",text:"İşlem durduruldu. Daha önce alınan belgeler korunuyor."});
      if(stats.created||stats.duplicate) {
        try {await onSynced?.();}catch{ /* The archive write succeeded even if UI refresh failed. */ }
      }
    }catch(error){
      setStatus({type:"error",text:"İşNet belge alımı tamamlanamadı: "+errorText(error)+
        " Başarıyla kaydedilmiş belgeler korunur. Belge Havuzu'nu kontrol edin."});
    }finally{
      setCurrent("");setBusy("");lockedRef.current=false;stopRef.current=false;
    }
  };

  return <section className="eis-local" aria-label="İşNet orijinal belge alma">
    <header className="eis-local-head">
      <div><span className="eis-local-kicker"><ShieldCheck size={15}/> İŞNET · TEK BAĞLANTI</span>
        <h3>Belgeleri KY ERP'ye Al</h3>
        <p>Gelen/giden fatura ve irsaliye · Orijinal XML + PDF · Tek Belge Havuzu</p></div>
      <button type="button" onClick={()=>openModule?.("e-belge",{tabKey:"belge-havuzu"})}><FolderOpen size={17}/> Belge Havuzu</button>
    </header>
    <div className="eis-local-steps">
      <span><b>1</b> Portala bağlan</span><span><b>2</b> Firmayı seç</span><span><b>3</b> Belgeleri arşivle</span>
    </div>

    <div className="eis-local-connection">
      <div><strong>Windows İşNet adaptörü</strong><small>Giriş doğrudan bu bilgisayarda yapılır; şifre KY ERP bulutuna gitmez.</small></div>
      <div className="eis-local-connection-status">
        <span className={adapter?"ready":"missing"}>{loading?"Kontrol ediliyor":adapter?"Adaptör erişilebilir":"Adaptör bulunamadı"}</span>
        <button type="button" disabled={Boolean(busy)||loading} onClick={()=>void refresh()}><RefreshCw size={16}/> Bağlantıyı Yenile</button>
      </div>
    </div>
    {!adapter&&!loading&&<div className="eis-local-guidance">
      <AlertTriangle size={18}/><span>Windows'ta daha önce kullandığımız İşNet test adaptörü çalışıyor olabilir; bu ekranın yeni yerel bağlantı sürümü gerekir. Buluttan tekrar şifre denemesi yapılmayacak. Bağlantı sağlanınca aynı ekrandan devam edebilirsiniz.</span>
    </div>}
    <div className="eis-local-selected">
      <span><b>İşNet firması</b><strong>{selection?.companyName||"Henüz seçilmedi"}</strong></span>
      <span className={selected?"ready":"missing"}>{selected?"Firma ve oturum doğrulandı":connected?"Firma kaydı bekliyor":"Yerel oturum açık değil"}</span>
      {connected&&<button type="button" disabled={Boolean(busy)} onClick={()=>void clearSession()}>Oturumu Kapat</button>}
    </div>

    {adapter&&!connected&&<>
      <form className="eis-local-login" onSubmit={authenticate}>
        <div className="eis-local-section-title"><b>1</b><span>İşNet portalına giriş</span></div>
        <div className="eis-local-fields">
          <label>Kullanıcı adı / TCKN<input autoComplete="off" name="isnet-local-username" required value={user} disabled={Boolean(busy)} onChange={e=>setUser(e.target.value)}/></label>
          <label>Portal şifresi<input autoComplete="off" name="isnet-local-password" type="password" required value={password} disabled={Boolean(busy)} onChange={e=>setPassword(e.target.value)}/></label>
          <button className="eis-local-primary" type="submit" disabled={Boolean(busy)||!user.trim()||!password}>{busy==="login"?"Firmalar alınıyor...":"Giriş Yap ve Firmaları Getir"}</button>
        </div>
      </form>
      {companies.length>0&&<div className="eis-local-choose">
        <div className="eis-local-section-title"><b>2</b><span>Yetkili firmayı seç</span></div>
        <div className="eis-local-fields">
          <label>İşNet firmaları<select value={companyId} disabled={Boolean(busy)} onChange={e=>setCompanyId(e.target.value)}>
            <option value="">Firma seçin</option>
            {companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select></label>
          <button type="button" className="eis-local-primary" disabled={Boolean(busy)||!companyId} onClick={()=>{
            const company=companies.find(c=>String(c.id)===String(companyId));
            if(company)void saveSelected(company);
          }}>{busy==="company"?"Firma kaydediliyor...":"Firmayı Aç ve KY ERP'ye Kaydet"}</button>
        </div>
        <small>Kaydet işlemi yalnız gerçek İşNet firmasını seçtikten sonra açılır.</small>
      </div>}
    </>}
    {adapter&&connected&&!selected&&<div className="eis-local-guidance">
      <AlertTriangle size={18}/><span>İşNet firma oturumu açık, ancak KY ERP firma kaydı eşleşmiyor.
        <button type="button" disabled={Boolean(busy)} onClick={()=>void saveSelected({id:adapter.companyId,name:adapter.companyName})}>Bu Firmayı KY ERP'ye Kaydet</button>
      </span>
    </div>}

    <div className="eis-local-archive-note"><FileCheck2 size={18}/><span>İşNet'in <strong>orijinal XML ve PDF</strong> dosyaları birlikte tutulur. Orijinal PDF varsa yeniden PDF şablonu oluşturulmaz. Eksik dosya ayrıca bildirilir.</span></div>
    <div className="eis-local-types">
      {isnetSources.map(src=><div key={src.key}>{src.key.includes("dispatch")?<Truck size={18}/>:<FileText size={18}/>}
        <span>{src.label}</span><strong>{counts[src.key]===undefined?"XML + PDF":number(counts[src.key])}</strong>
      </div>)}
    </div>
    <div className="eis-local-work">
      <div className="eis-local-section-title"><b>3</b><span>Belgelerin dönemini seç</span><small>En fazla 31 gün</small></div>
      <div className="eis-local-presets">
        <button type="button" disabled={Boolean(busy)} onClick={()=>{setStart(daysAgo(0));setEnd(daysAgo(0));}}>Bugün</button>
        <button type="button" disabled={Boolean(busy)} onClick={()=>{setStart(daysAgo(7));setEnd(daysAgo(0));}}>Son 7 Gün</button>
        <button type="button" disabled={Boolean(busy)} onClick={()=>{setStart(daysAgo(30));setEnd(daysAgo(0));}}>Son 30 Gün</button>
      </div>
      <div className="eis-local-fields">
        <label>Başlangıç<input type="date" value={start} disabled={Boolean(busy)} onChange={e=>setStart(e.target.value)}/></label>
        <label>Bitiş<input type="date" value={end} disabled={Boolean(busy)} onChange={e=>setEnd(e.target.value)}/></label>
        <button type="button" className="eis-local-secondary" disabled={!canWork||!validPeriod(start,end)} onClick={()=>void run(true)}>İlk Belgeyle Test Et</button>
        <button type="button" className="eis-local-primary" disabled={!canWork||!validPeriod(start,end)} onClick={()=>void run(false)}>
          <RefreshCw size={16}/> {busy==="sync"?"Belgeler Alınıyor...":"Tüm XML + PDF Belgelerini Al"}
        </button>
        {busy==="sync"&&<button type="button" onClick={()=>{stopRef.current=true;}}>Mevcut Belgeden Sonra Durdur</button>}
      </div>
    </div>
    {(busy==="sync"||totals.listed>0||status.text)&&<div className={"eis-local-result "+(status.type||"")}>
      <div className="eis-local-result-title"><strong>Aktarım durumu</strong><small>{progressName}</small></div>
      {status.text&&<p role={status.type==="error"?"alert":"status"}>{status.text}</p>}
      <div className="eis-local-metrics">
        <span>Listelenen <b>{number(totals.listed)}</b></span>
        <span>İşlenen <b>{number(totals.attempted)}</b></span>
        <span>Yeni <b>{number(totals.created)}</b></span>
        <span>Mükerrer <b>{number(totals.duplicate)}</b></span>
        <span>PDF eksik <b>{number(totals.pdfMissing)}</b></span>
        <span>Hata <b>{number(totals.failed)}</b></span>
      </div>
    </div>}
    <footer className="eis-local-footer">
      <button type="button" onClick={()=>openModule?.("e-belge",{tabKey:"belge-havuzu"})}><FolderOpen size={16}/> Belge Havuzu</button>
      <button type="button" onClick={()=>openModule?.("e-belge",{tabKey:"eslestirmeler"})}><FileCheck2 size={16}/> Fatura–İrsaliye Eşleşmeleri</button>
      <span><LockKeyhole size={14}/> Şifre saklanmaz; kesin muhasebe kaydı veya resmî fatura gönderimi yapılmaz.</span>
    </footer>
  </section>;
}
