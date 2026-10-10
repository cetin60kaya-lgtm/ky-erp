import React, {useCallback,useEffect,useState} from "react";
import {apiGet,apiPost,apiFetch} from "../../utils/api";
import "./personnel360.css";

const unpack=(response)=>response?.ok===true&&Object.prototype.hasOwnProperty.call(response,"data")
  ?response.data:response;
const clean=(v)=>v==null?"":String(v).trim();
const initialDate=()=>new Date().toLocaleDateString("sv-SE",{timeZone:"Europe/Istanbul"});
const allowedRoles=new Set(["SUPER_ADMIN","ADMIN","COMPANY_ADMIN","OWNER","HR_ADMIN"]);
const editable=[
  ["fullName","Ad Soyad","text"],["department","Departman","text"],
  ["title","Görev","text"],["phone","Telefon","tel"],
  ["startDate","İşe Giriş","date"],["exitDate","İşten Çıkış","date"],
  ["status","İstihdam Durumu","select"],
];
const fromPerson=(p={})=>Object.fromEntries(editable.map(([key])=>[key,clean(p[key])==="—"?"":clean(p[key])]));
const endpoint=(id,suffix="")=>`/ik/personnel-control/people/${encodeURIComponent(id)}${suffix}`;
function Field({label,children}){return <label className="pdk-person-field"><span>{label}</span>{children}</label>;}
function State({children,kind="note"}){return <p role={kind==="error"?"alert":"status"} className={`pdk-person-message ${kind}`}>{children}</p>;}

export default function Personnel360Manage({person,active,company,isAuditAccount=false,profile,previewOnly=false,onSaved}){
  const employeeId=clean(person?.id);
  const canEdit=!previewOnly&&!isAuditAccount&&allowedRoles.has(clean(profile?.role).toUpperCase());
  const [loaded,setLoaded]=useState(null);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [revision,setRevision]=useState(0);
  const [form,setForm]=useState({});
  const [reason,setReason]=useState("");
  const [card,setCard]=useState("");
  const [cardDate,setCardDate]=useState(initialDate);
  const [assetId,setAssetId]=useState("");
  const [docType,setDocType]=useState("PERSONNEL_DOCUMENT");
  const [docNote,setDocNote]=useState("");
  const [unlinkReason,setUnlinkReason]=useState("");
  const [groupId,setGroupId]=useState("");
  const [personnelGroupId,setPersonnelGroupId]=useState("");
  const [previewUrl,setPreviewUrl]=useState("");
  const [previewAsset,setPreviewAsset]=useState("");

  useEffect(()=>{
    setLoaded(null);setError("");setMessage("");setForm(fromPerson(person));
    setCard(clean(person?.cardNo)==="—"?"":clean(person?.cardNo));
    setReason("");setAssetId("");setDocNote("");setUnlinkReason("");
    setGroupId("");setPersonnelGroupId("");setPreviewAsset("");setPreviewUrl("");
  },[employeeId,company]);

  const refresh=useCallback(()=>setRevision(x=>x+1),[]);
  useEffect(()=>()=>{if(previewUrl)URL.revokeObjectURL(previewUrl);},[previewUrl]);
  const openPreview=async(id)=>{
    setError("");setPreviewAsset("");setPreviewUrl("");
    setBusy(true);
    try{
      const blob=await apiFetch(endpoint(employeeId,`/documents/${encodeURIComponent(id)}/preview`),{responseType:"blob"});
      if(!(blob instanceof Blob)||blob.size===0)throw new Error("Önizleme içeriği boş veya doğrulanamadı.");
      if(!["application/pdf","image/jpeg","image/png","image/webp"].includes(blob.type))
        throw new Error("Güvenli web önizleme biçimi desteklenmiyor.");
      setPreviewUrl(URL.createObjectURL(blob));setPreviewAsset(id);
    }catch(e){setError(e?.message||"Dosya önizlemesi açılamadı.");}
    finally{setBusy(false);}
  };
  useEffect(()=>{
    if(!employeeId||!company||previewOnly||isAuditAccount)return;
    let cancelled=false;
    setLoading(true);setError("");setLoaded(null);
    const run=async()=>{
      if(active==="identity"||active==="history"){
        const profileData=unpack(await apiGet(endpoint(employeeId),{mainCompanyId:company},{forceFresh:true,cache:false}));
        if(active==="history")return profileData;
        const masters=await apiGet("/ik/personnel-control/pdks-masters",{mainCompanyId:company},{forceFresh:true,cache:false})
          .then(unpack).catch(()=>null);
        return {...profileData,masters};
      }
      if(active==="card")return unpack(await apiGet(endpoint(employeeId,"/card-assignment"),{mainCompanyId:company},{forceFresh:true,cache:false}));
      if(active==="documents"){
        const docs=unpack(await apiGet(endpoint(employeeId,"/documents"),{mainCompanyId:company},{forceFresh:true,cache:false}));
        const candidates=canEdit?unpack(await apiGet(endpoint(employeeId,"/document-candidates"),{mainCompanyId:company},{forceFresh:true,cache:false})):[];
        if(!Array.isArray(docs)||!Array.isArray(candidates))throw new Error("PERSONNEL_FILE_HUB_RESPONSE_INVALID");
        return {docs,candidates};
      }
      return null;
    };
    run().then(result=>{
      if(cancelled)return;
      setLoaded(result);
      if(active==="identity"){
        setForm(fromPerson(result?.person||person));
        const assignment=result?.masters?.groupAssignments?.find(g=>String(g.employeeId)===employeeId);
        setGroupId(clean(assignment?.groupId));
        const policyGroup=result?.masters?.personnelGroupAssignments?.find(g=>String(g.employeeId)===employeeId);
        setPersonnelGroupId(clean(policyGroup?.personnelGroupId));
      }
      if(active==="card")setCard(clean(result?.cardNo));
    }).catch(e=>{if(!cancelled)setError(e?.message||"Personel kaynağı okunamadı.");})
      .finally(()=>{if(!cancelled)setLoading(false);});
    return ()=>{cancelled=true;};
  },[employeeId,company,active,revision,previewOnly,isAuditAccount,canEdit]);

  const submit=async(url,payload,success)=>{
    setBusy(true);setError("");setMessage("");
    try{
      const response=await apiPost(url,{mainCompanyId:company,...payload});
      if(response?.ok===false)throw new Error(response?.error?.message||"İşlem reddedildi.");
      setMessage(success);
      refresh();
      onSaved?.();
    }catch(cause){setError((cause?.message||"İşlem sonucu doğrulanamadı.")+
      " Tekrar göndermeden önce kaydı ve işlem geçmişini yenileyerek kontrol edin.");refresh();}
    finally{setBusy(false);}
  };
  if(!employeeId)return <State>Önce personel seçin.</State>;
  if(previewOnly)return <State>Önizlemede gerçek personel işlemi yapılmaz.</State>;
  if(isAuditAccount)return <State kind="error">Denetim hesabına özlük, kart ve evrak ayrıntıları kapalıdır.</State>;
  const header=<>
    {loading&&<State>Yetkili KY ERP verisi okunuyor…</State>}
    {error&&<State kind="error">{error}</State>}
    {message&&<State kind="success">{message}</State>}
  </>;
  const note=!canEdit?<State>Değişiklik için şirket yöneticisi veya yetkili personel yöneticisi rolü gerekir.</State>:null;
  if(active==="identity")return <div className="pdk-person-manage">{header}
    <h4>Özlük kartı</h4>
    <p>Kaynak: KY ERP personel ana kaydı. Değişiklikler geçmişe kaydedilir; fiziksel cihaz değiştirilmez.</p>
    <div className="pdk-person-fields">{editable.map(([key,label,type])=>
      <Field key={key} label={label}>{type==="select"?<select value={form.status||"Aktif"}
        disabled={!canEdit||loading||busy||!loaded} onChange={e=>setForm(x=>({...x,status:e.target.value,
          exitDate:e.target.value==="Aktif"?"":x.exitDate}))}>
          <option value="Aktif">Aktif</option><option value="Pasif">Pasif / Çıkış Yapıldı</option>
        </select>:<input type={type} value={form[key]||""}
        disabled={!canEdit||loading||busy||!loaded} onChange={e=>setForm(x=>({...x,[key]:e.target.value}))}/>}</Field>)}</div>
    <Field label="Çalışma grubu (D1 PDKS tanımı)">
      <select disabled={!canEdit||loading||busy||!loaded?.masters?.groups?.length}
        value={groupId} onChange={e=>setGroupId(e.target.value)}>
        <option value="">Atama yok / kaynak doğrulanmadı</option>
        {(loaded?.masters?.groups||[]).filter(g=>Number(g.active)!==0).map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
      </select>
    </Field>
    <Field label="Personel çalışma grubu (kart/puantaj kuralı)">
      <select disabled={!canEdit||loading||busy||!loaded?.masters?.personnelGroups?.length}
        value={personnelGroupId} onChange={e=>setPersonnelGroupId(e.target.value)}>
        <option value="">Atama yok / kaynak doğrulanmadı</option>
        {(loaded?.masters?.personnelGroups||[]).filter(g=>Number(g.active)!==0).map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
      </select>
    </Field>
    {loaded?.masters?.personnelGroups?.length>0&&canEdit&&<button type="button" className="pdk-person-secondary"
      disabled={busy||loading||!personnelGroupId||reason.trim().length<5||
        personnelGroupId===clean(loaded.masters.personnelGroupAssignments?.find(g=>String(g.employeeId)===employeeId)?.personnelGroupId)}
      onClick={()=>submit(endpoint(employeeId,"/personnel-group"),{
        personnelGroupId,
        expectedPersonnelGroupId:clean(loaded.masters.personnelGroupAssignments?.find(g=>String(g.employeeId)===employeeId)?.personnelGroupId),
        reason:reason.trim()},
        "Personel çalışma grubu D1 tanımına bağlandı.")}>Personel grubunu kaydet</button>}
    {loaded?.masters?.groups?.length>0&&canEdit&&<button type="button" className="pdk-person-secondary"
      disabled={busy||loading||!groupId||reason.trim().length<5||
        groupId===clean(loaded.masters.groupAssignments?.find(g=>String(g.employeeId)===employeeId)?.groupId)}
      onClick={()=>submit(endpoint(employeeId,"/work-group"),{groupId,
        expectedGroupId:clean(loaded.masters.groupAssignments?.find(g=>String(g.employeeId)===employeeId)?.groupId),
        reason:reason.trim()},
        "Vardiya grubu mevcut D1 personel tanımına bağlandı.")}>Çalışma grubunu kaydet</button>}
    <div className="pdk-person-summary">
      <span>Kod: {loaded?.person?.personnelCode||person.personnelCode||"—"}</span>
      <span>SGK: {loaded?.person?.sgkStatus||person.sgkStatus||"—"}</span>
      <span>Durum: {loaded?.person?.status||person.status||"—"}</span>
    </div>
    {note}
    {canEdit&&<div className="pdk-person-actions">
      <Field label="Değişiklik gerekçesi"><input value={reason} onChange={e=>setReason(e.target.value)} maxLength={240}/></Field>
      <button type="button" disabled={busy||loading||!loaded||reason.trim().length<5}
        onClick={()=>submit(endpoint(employeeId,"/change"),{
          changes:form,effectiveDate:initialDate(),note:reason.trim()
        },"Özlük kartı D1 kaydı güncellendi; güncel durum yeniden okunuyor.")}>Özlük değişikliğini kaydet</button>
    </div>}
  </div>;
  if(active==="card"){
    const assigned=clean(loaded?.cardNo);
    return <div className="pdk-person-manage">{header}<h4>Gerçek kart eşlemesi</h4>
      <div className="pdk-person-summary"><span>D1'de atanan kart: <strong>{assigned||"Atanmadı"}</strong></span>
        <span>Terminal yazımı: <strong>Yapılmadı</strong></span></div>
      <State>Buradan yapılan atama yalnız D1 personel-kart kaydını değiştirir. FP_CLOCK, FDB ve TNF'ye yazmaz. Eski okutmalar korunur.</State>
      {canEdit&&<div className="pdk-person-actions">
        <Field label="Yeni kart numarası (boş = kartı bırak)"><input value={card} maxLength={32}
          onChange={e=>setCard(e.target.value)} disabled={busy||loading||!loaded} autoComplete="off"/></Field>
        <Field label="Geçerlilik tarihi"><input type="date" value={cardDate} onChange={e=>setCardDate(e.target.value)}/></Field>
        <Field label="Değişim gerekçesi"><input value={reason} maxLength={240}
          onChange={e=>setReason(e.target.value)}/></Field>
        <button type="button" disabled={busy||loading||!loaded||reason.trim().length<5||card.trim()===assigned}
          onClick={()=>submit(endpoint(employeeId,"/card-assignment"),{
            cardNo:card.trim(),expectedCardNo:assigned,reason:reason.trim(),effectiveDate:cardDate
          },"Kart D1 eşlemesi kaydedildi; fiziksel terminal ve FDB/TNF mutabakatı bekliyor.")}>Kart atama / değiştirme / bırakma</button>
      </div>}
      {note}<h4>Kart değişim geçmişi</h4>
      {loaded&&<table className="pdk-person-table"><thead><tr><th>Tarih</th><th>Eski Kart</th><th>Yeni Kart</th><th>Gerekçe</th></tr></thead>
        <tbody>{(loaded.history||[]).map((h,i)=><tr key={h.id||i}><td>{h.effectiveDate||"—"}</td>
          <td>{h.oldCardNo||"—"}</td><td>{h.newCardNo||"—"}</td><td>{h.note||"—"}</td></tr>)}</tbody></table>}
      {loaded&&!loaded.history?.length&&<State>Henüz doğrulanmış kart değişim geçmişi yok.</State>}
    </div>;
  }
  if(active==="documents")return <div className="pdk-person-manage">{header}<h4>Personel evrakları · File Hub</h4>
    <p>Dosya yalnız İK için atanmış File Hub depolama alanında bulunuyorsa personele bağlanır. Evrakı kaldırmak dosyayı silmez.</p>
    {canEdit&&<div className="pdk-person-actions">
      <Field label="File Hub'dan gerçek dosya seç">
        <select value={assetId} onChange={e=>setAssetId(e.target.value)} disabled={busy||loading||!loaded}>
          <option value="">Dosya seçin</option>
          {(loaded?.candidates||[]).filter(f=>f.documentType===docType).map(f=><option key={f.id} value={f.id}>{f.fileName}</option>)}
        </select></Field>
      <Field label="Belge türü"><select value={docType} onChange={e=>{setDocType(e.target.value);setAssetId("");}}>
        <option value="PERSONNEL_DOCUMENT">Özlük evrakı</option><option value="CONTRACT">Sözleşme</option>
      </select></Field>
      <Field label="Açıklama"><input value={docNote} maxLength={240} onChange={e=>setDocNote(e.target.value)}/></Field>
      <button type="button" disabled={busy||loading||!assetId}
        onClick={()=>submit(endpoint(employeeId,"/documents"),{assetId,documentType:docType,note:docNote},
          "File Hub evrakı personele bağlandı; mevcut dosya taşınmadı.")}>Evrakı personele bağla</button>
      {!loaded?.candidates?.length&&<State>Yetkili İK / PERSONNEL_DOCUMENT veya CONTRACT File Hub dosyası bulunamadı. Önce Depolama bağlantısını ve dosya kaydını hazırlayın.</State>}
    </div>}
    {note}
    <h4>Bağlı evraklar</h4>
    {previewUrl&&<section className="pdk-person-preview" aria-label="Personel evrak önizlemesi">
      <button type="button" className="pdk-person-secondary" onClick={()=>{setPreviewUrl("");setPreviewAsset("");}}>Önizlemeyi kapat</button>
      <iframe title={`Personel evrakı ${previewAsset}`} src={previewUrl} sandbox="allow-same-origin"/>
    </section>}
    {loaded&&<table className="pdk-person-table"><thead><tr><th>Dosya</th><th>Tür</th><th>Durum</th><th>Bağlantı</th></tr></thead>
      <tbody>{(loaded.docs||[]).map(d=><tr key={d.id}><td>{d.fileName||"—"}</td>
        <td>{d.documentType==="CONTRACT"?"Sözleşme":"Özlük"}</td>
        <td>{d.status||"—"}</td><td><div className="pdk-person-doc-actions">
          {d.previewReady&&canEdit?<button type="button" className="pdk-person-secondary" disabled={busy}
            onClick={()=>openPreview(d.id)}>Görüntüle</button>:<span>{d.previewReady?"Yönetici yetkisi gerekli":"Önizleme hazır değil"}</span>}
          {canEdit?<button type="button" className="pdk-person-secondary"
          disabled={busy||unlinkReason.trim().length<5}
          onClick={()=>submit(endpoint(employeeId,`/documents/${encodeURIComponent(d.id)}/unlink`),
            {reason:unlinkReason.trim()},"Personel bağlantısı kaldırıldı, dosya silinmedi.")}>Bağlantıyı kaldır</button>:null}</div></td></tr>)}</tbody>
    </table>}
    {canEdit&&!!loaded?.docs?.length&&<Field label="Bağlantıyı kaldırma gerekçesi (min. 5 karakter)">
      <input value={unlinkReason} onChange={e=>setUnlinkReason(e.target.value)} maxLength={240}/></Field>}
    {loaded&&!loaded.docs?.length&&<State>Bu personelin File Hub'da bağlı evrakı yok.</State>}
  </div>;
  if(active==="history"){
    const changes=(loaded?.changeHistory||[]).filter(h=>
      ["cardNo","department","title","status","startDate","exitDate","phone","fullName","fileHubAsset","groupId","personnelGroupId"].includes(clean(h.field_name)));
    return <div className="pdk-person-manage">{header}<h4>Özlük ve kart işlem geçmişi</h4>
      {loaded&&<table className="pdk-person-table"><thead><tr><th>Tarih</th><th>İşlem</th><th>Eski</th><th>Yeni</th><th>Gerekçe</th></tr></thead>
        <tbody>{changes.map((h,i)=><tr key={h.id||i}><td>{h.effective_date||"—"}</td>
          <td>{h.change_type||h.field_name||"—"}</td><td>{h.old_value||"—"}</td>
          <td>{h.new_value||"—"}</td><td>{h.note||"—"}</td></tr>)}</tbody></table>}
      {loaded&&!changes.length&&<State>Bu personel için kayıtlı değişiklik bulunamadı.</State>}
    </div>;
  }
  return null;
}
