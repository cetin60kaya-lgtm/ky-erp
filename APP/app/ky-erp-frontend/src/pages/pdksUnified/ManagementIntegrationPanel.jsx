import React,{useCallback,useEffect,useMemo,useState} from "react";
import {useAuth} from "../../context/AuthContext";
import {
  getMainCompanies,listUsers,getUserPermissions,listBackups,getLogs,
} from "../../services/adminApi";
import {readCloudSyncStatus} from "./readService.js";
import {
  isManager,isOwner,scopeCompanies,scopeUsers,normalizePermissions,
  backupHealth,projectCloudEvents,projectLocalHealth,rowsOf,
} from "./managementReadModel.mjs";

const route={companies:"/admin/ana-firma-ayarlar",users:"/admin/kullanicilar",
  permissions:"/admin/kullanicilar",backup:"/admin/yedekleme-loglar",
  integrations:"/admin/surum-merkezi",system:"/admin/yedekleme-loglar"};
const titles={companies:"Firma ve Tenant",users:"Kullanıcılar",
  permissions:"Gerçek Modül Yetkileri",backup:"Kaynak Bazlı Yedek Sağlığı",
  integrations:"Cloud ve Windows Entegrasyonu",system:"Sistem Günlüğü",
  incidents:"Hata Merkezi"};
function safeError(error){
  const status=Number(error?.status||error?.response?.status||0);
  if(status===401)return "Oturum süresi doldu";
  if(status===403)return "Yetki reddedildi";
  if(status===404)return "Kaynak bulunamadı / bağlı değil";
  return "Kaynak doğrulanamadı";
}
function Source({name,state}){
  return <p className="pdk-u-mgmt-source" role="status"><b>{name}:</b>{" "}
    {state?.status==="ready"?"Gerçek API yanıtı":state?.status==="loading"?"Okunuyor":
      state?.status==="error"?state.message:"Bağlı değil"}</p>;
}
function Table({headers,rows,select,onSelect}){
  return <div className="pdk-u-table-scroll"><table className="pdk-u-table"><thead><tr>
    {headers.map(label=><th key={label}>{label}</th>)}
  </tr></thead><tbody>
    {rows.map((cells,i)=><tr key={i} onClick={onSelect?()=>onSelect(select[i]):undefined}>
      {cells.map((cell,j)=><td key={j}>{cell??"—"}</td>)}</tr>)}
  </tbody></table>{!rows.length&&<p className="pdk-u-live-note">Doğrulanmış kayıt yok.</p>}</div>;
}
export default function ManagementIntegrationPanel({
  tabId,company="",companyId="",previewOnly=false,profileReady=false,audit=false,
}){
  const {user}=useAuth();
  const role=String(user?.role||"").toUpperCase();
  const permitted=!previewOnly&&!audit&&profileReady&&Boolean(company)&&isManager(role);
  const [sources,setSources]=useState({});
  const [refresh,setRefresh]=useState(0);
  const [selectedUser,setSelectedUser]=useState("");
  const [userPermissions,setUserPermissions]=useState(null);
  const [permissionStatus,setPermissionStatus]=useState("idle");
  const activeCompany=company;
  const doRead=useCallback(async()=>{
    if(!permitted){setSources({});return;}
    const requests={
      companies:()=>getMainCompanies(),
      users:()=>listUsers(),
      permissions:()=>listUsers(),
      backup:()=>listBackups({mainCompanyId:companyId||"",mainCompanySlug:company,_ts:Date.now()}),
      integrations:()=>readCloudSyncStatus({mainCompanyId:company}),
      system:()=>getLogs({limit:80,_ts:Date.now()}),
      incidents:()=>readCloudSyncStatus({mainCompanyId:company}),
    };
    const action=requests[tabId];if(!action)return;
    setSources({[tabId]:{status:"loading"}});
    try{
      const raw=await action();
      let data=raw;
      if(tabId==="companies")data=scopeCompanies(raw,activeCompany,role);
      else if(tabId==="users"||tabId==="permissions")data=scopeUsers(raw,activeCompany,role);
      else if(tabId==="backup"||tabId==="system")data=rowsOf(raw);
      else if(tabId==="integrations"||tabId==="incidents")data=projectCloudEvents(raw);
      setSources({[tabId]:{status:"ready",data,raw:tabId==="integrations"?raw:null}});
    }catch(error){setSources({[tabId]:{status:"error",message:safeError(error)}});}
  },[tabId,company,companyId,permitted,role,activeCompany]);
  useEffect(()=>{let active=true;void (async()=>{if(active)await doRead()})();return()=>{active=false;};},[doRead,refresh]);
  useEffect(()=>{setSelectedUser("");setUserPermissions(null);},[company,tabId]);
  useEffect(()=>{
    if(!permitted||tabId!=="permissions"||!selectedUser)return undefined;
    let current=true;setPermissionStatus("loading");setUserPermissions(null);
    getUserPermissions(selectedUser).then(value=>{
      if(current){setUserPermissions(normalizePermissions(value));setPermissionStatus("ready");}
    }).catch(()=>{if(current)setPermissionStatus("error");});
    return()=>{current=false;};
  },[permitted,tabId,selectedUser]);
  const state=sources[tabId];
  const rows=state?.status==="ready"?state.data:[];
  const roleLabel=role||"Oturum bilinmiyor";
  const managerPath=route[tabId];
  const canNavigate=permitted&&managerPath&&(tabId!=="backup"||isOwner(role))&&
    (tabId!=="integrations"||isOwner(role));
  const displayRows=useMemo(()=>{
    if(!Array.isArray(rows))return[];
    switch(tabId){
      case "companies":return rows.map(x=>[x.name||x.ad||"—",x.slug||x.kod||x.id||"—",
        x.isActive===false?"Pasif":x.isActive===true?"Aktif":"Bilinmiyor"]);
      case "users":case "permissions":return rows.map(x=>[x.fullName||x.username||"—",
        x.role||"—",x.mainCompanySlug||"—",x.isActive===false?"Pasif":"Aktif"]);
      case "backup":return rows.map(x=>[String(x.createdAt||x.completedAt||"—"),
        x.status||"Bilinmiyor",backupHealth(x),x.archiveMirror?.completed?.length?"Ek arşiv bildirildi":"Kanıt yok"]);
      case "system":return rows.slice(0,50).map(x=>[
        String(x.createdAt||x.timestamp||"—"),String(x.action||x.actionType||"Olay").slice(0,60),
        String(x.status||x.level||"Bilinmiyor").slice(0,35)]);
      case "integrations":case "incidents":return rows.map(x=>[x.at,x.source,x.state,x.attempts??"—",x.code]);
      default:return [];
    }
  },[rows,tabId]);
  const headers=tabId==="companies"?["Firma","Anahtar","Durum"]:
    tabId==="users"||tabId==="permissions"?["Kullanıcı","Rol","Firma","Durum"]:
    tabId==="backup"?["Son yedek zamanı","Kaynak durumu","Sağlama","Dış arşiv"]:
    tabId==="system"?["Tarih","İşlem türü","Durum"]:
    ["Zaman","Kaynak","ACK / Durum","Deneme","Hata kodu"];
  return <section className="pdk-u-mgmt" aria-label={titles[tabId]||"Entegrasyon"}>
    <div className="pdk-u-live-head"><div><strong>{titles[tabId]}</strong>
      <p>Yetki: {roleLabel} · seçili firma: {company||"Yok"} · gerçek KY ERP kaynakları.</p>
    </div><button type="button" className="pdk-u-btn" disabled={!permitted}
      onClick={()=>setRefresh(i=>i+1)}>Kaynağı Yenile</button></div>
    {!permitted?<p className="pdk-u-live-note" role="alert">
      {previewOnly?"Önizleme/test modunda yetkili yönetim API erişimi kapalı.":
        "Yönetim rolü veya firma yetkisi doğrulanamadı. İşlem kapalı."}
    </p>:<>
      <Source name={tabId==="backup"?"KY ERP D1/R2 yedek listesi":
        tabId==="integrations"||tabId==="incidents"?"D1 Cloud outbox":
        "KY ERP yönetim"} state={state}/>
      {state?.status==="ready"&&<Table headers={headers} rows={displayRows}
        select={tabId==="permissions"?rows.map(x=>String(x.id||"")):null}
        onSelect={tabId==="permissions"?setSelectedUser:null}/>}
      {tabId==="permissions"&&<div className="pdk-u-mgmt-sub">
        <strong>Gerçek kullanıcı izinleri</strong>
        <p>Kullanıcı satırına basın. Rol etiketi iznin kendisi değildir; izin matrisi kullanıcı özelindeki sunucu kaydından okunur.</p>
        {permissionStatus==="loading"&&<p>İzinler okunuyor…</p>}
        {permissionStatus==="error"&&<p role="alert">Yetki matrisi erişim reddetti veya okunamadı.</p>}
        {permissionStatus==="ready"&&<Table
          headers={["Modül","Gör","Ekle","Düzenle","Sil","Onay"]}
          rows={userPermissions.map(x=>[x.moduleKey,
            ...["canView","canCreate","canUpdate","canDelete","canApprove"].map(k=>x[k]?"Evet":"Hayır")])}/>}
      </div>}
      {tabId==="backup"&&<div className="pdk-u-mgmt-sub">
        <strong>Yedek / geri dönüş hazırlığı</strong>
        <p>Kaynak: KY ERP Cloud D1 + R2. Bu liste yerel SQLite/WAL, Firebird ve TNF yedeğini doğrulamaz.
          Geri yükleme burada kapalı; şifre ve güvenlik yedeği kontrolü bulunan mevcut KY ERP Yönetim akışından yapılır.</p>
      </div>}
      {(tabId==="integrations"||tabId==="incidents")&&<LocalAgentStatus disabled={previewOnly}/>}
      {tabId==="integrations"&&<p className="pdk-u-live-note">Cloud ACK yalnız D1 outbox sonucudur.
        Yerel Agent heartbeat yoksa fiziksel cihaz çevrimiçi gösterilmez. Retry yalnız sunucu politikasının kontrolündedir.</p>}
      {canNavigate&&<a className="pdk-u-btn pdk-u-mgmt-link" href={managerPath}>
        {tabId==="permissions"?"Yetkili kullanıcı ve izin düzenlemelerini aç":
          tabId==="backup"?"Güvenli Cloud yedek/geri dönüş ekranını aç":"KY ERP yetkili yönetim işlemlerini aç"}</a>}
    </>}
  </section>;
}
export function LocalAgentStatus({disabled=false}){
  const [state,setState]=useState({status:"idle"});
  const load=useCallback(async()=>{
    if(disabled)return;
    setState({status:"loading"});
    try{
      const response=await fetch("/__pdks_local__/health.json",
        {credentials:"same-origin",cache:"no-store"});
      if(!response.ok)throw Error("LOCAL_HOST_UNAVAILABLE");
      const payload=await response.json();
      setState({status:"ready",data:projectLocalHealth(payload)});
    }catch{setState({status:"error"});}
  },[disabled]);
  useEffect(()=>{void load();},[load]);
  return <div className="pdk-u-mgmt-sub">
    <strong>Windows Unified Agent — yerel tanılama</strong>
    <button type="button" className="pdk-u-btn" onClick={load} disabled={disabled}>Yerel durumu kontrol et</button>
    {state.status==="error"&&<p role="status">Yerel WebView2 sağlık köprüsü yok veya doğrulanamadı.
      Bu tarayıcı sonucu Agent kapalı anlamına gelmez.</p>}
    {state.status==="ready"&&<dl className="pdk-u-definition">
      {[["Agent heartbeat",state.data.heartbeat],["Son çalışma",state.data.lastCompletedAt||"Bilinmiyor"],
        ["Son sonuç kodu",state.data.lastResult],["Alınan komut",state.data.received],
        ["Yerel uygulanmış",state.data.applied],["ACK bekleyen olası kayıt",state.data.pendingAcks],
        ["Yerel hata",state.data.localErrors]].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
    </dl>}
    {state.status==="loading"&&<p>Yerel kaynak doğrulanıyor…</p>}
  </div>;
}
