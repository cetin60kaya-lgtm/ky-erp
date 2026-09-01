import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, apiGet, apiPatch, apiPost } from "../../utils/api";
import "./AdminManagement.css";

const PROVIDERS = ["GOOGLE_DRIVE", "ONEDRIVE", "LOCAL_FOLDER", "NAS", "SHAREPOINT"];
const MODULES = ["DESEN", "IMALAT", "BOYAHANE", "MUHASEBE", "ISNET", "IK", "DTF", "STOK"];
const PURPOSES = ["MODEL_IMAGE", "MODEL_SOURCE", "PLACEMENT", "OUTGOING_DESIGN", "RIP_PDF", "INVOICE", "E_DOCUMENT", "PERSONNEL_DOCUMENT", "RECIPE", "QUALITY", "GENERIC"];

const emptyConnection = { providerType:"GOOGLE_DRIVE", name:"", localRootPath:"", remoteRootId:"", remoteRootName:"", syncMode:"AGENT", isActive:true, isPrimary:false };
const emptyBinding = { moduleCode:"DESEN", purposeCode:"MODEL_IMAGE", storageConnectionId:"", rootPath:"", readEnabled:true, writeEnabled:true, syncEnabled:true };
const providerLabel = value => ({ GOOGLE_DRIVE:"Google Drive", ONEDRIVE:"OneDrive", LOCAL_FOLDER:"Yerel Klasör", NAS:"NAS", SHAREPOINT:"SharePoint" })[value] || value || "-";
const statusLabel = value => ({ AVAILABLE:"Mevcut", MISSING:"Kaynakta Yok", CONNECTED:"Bağlı", UNKNOWN:"Bekliyor" })[value] || value || "-";
const formatDate = value => value ? new Date(value).toLocaleString("tr-TR") : "-";
const formatBytes = value => { const n=Number(value||0); if(n<1024)return `${n} B`; if(n<1048576)return `${(n/1024).toFixed(1)} KB`; if(n<1073741824)return `${(n/1048576).toFixed(1)} MB`; return `${(n/1073741824).toFixed(2)} GB`; };

export default function AdminStorageCenter({ activeMainCompany }) {
  const [tab,setTab]=useState("overview");
  const [overview,setOverview]=useState({});
  const [connections,setConnections]=useState([]);
  const [bindings,setBindings]=useState([]);
  const [files,setFiles]=useState([]);
  const [connectionForm,setConnectionForm]=useState(emptyConnection);
  const [bindingForm,setBindingForm]=useState(emptyBinding);
  const [editingConnectionId,setEditingConnectionId]=useState("");
  const [search,setSearch]=useState("");
  const [statusFilter,setStatusFilter]=useState("");
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");

  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [o,c,b,f] = await Promise.all([
        apiGet("/file-hub/overview"),
        apiGet("/file-hub/connections"),
        apiGet("/file-hub/bindings"),
        apiGet("/file-hub/files", { q:search || undefined, status:statusFilter || undefined, take:200 }),
      ]);
      setOverview(o?.data||{}); setConnections(c?.data||[]); setBindings(b?.data||[]); setFiles(f?.data||[]);
    } catch (e) { setError(e?.message || "Dosya Merkezi yüklenemedi."); }
    finally { setLoading(false); }
  }, [search,statusFilter,activeMainCompany?.slug]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { setBindingForm(current => ({ ...current, storageConnectionId: current.storageConnectionId || connections.find(x=>x.isActive)?.id || "" })); }, [connections]);

  const activeConnections = useMemo(() => connections.filter(x=>x.isActive),[connections]);
  const saveConnection = async event => {
    event.preventDefault(); setError(""); setMessage("");
    try {
      if (!connectionForm.name.trim()) throw new Error("Bağlantı adı zorunludur.");
      if (editingConnectionId) await apiPatch(`/file-hub/connections/${editingConnectionId}`, connectionForm);
      else await apiPost("/file-hub/connections", connectionForm);
      setMessage(editingConnectionId ? "Depolama bağlantısı güncellendi." : "Depolama bağlantısı eklendi.");
      setEditingConnectionId(""); setConnectionForm(emptyConnection); await refresh();
    } catch(e){ setError(e?.message||"Bağlantı kaydedilemedi."); }
  };
  const editConnection = row => {
    setEditingConnectionId(row.id); setConnectionForm({ providerType:row.provider_type, name:row.name||"", localRootPath:row.local_root_path||"", remoteRootId:row.remote_root_id||"", remoteRootName:row.remote_root_name||"", syncMode:row.sync_mode||"AGENT", isActive:row.isActive!==false, isPrimary:Boolean(row.isPrimary) }); setTab("connections");
  };
  const saveBinding = async event => {
    event.preventDefault(); setError(""); setMessage("");
    try {
      if(!bindingForm.storageConnectionId) throw new Error("Depolama kaynağı seçin.");
      await apiFetch("/file-hub/bindings", { method:"PUT", body:bindingForm });
      setMessage("Modül depolama yönlendirmesi kaydedildi."); await refresh();
    } catch(e){ setError(e?.message||"Yönlendirme kaydedilemedi."); }
  };

  return <div className="admin-management-page">
    <section className="admin-management-hero">
      <div><span className="admin-kicker">KY ERP ORTAK SERVİSİ</span><h2>Dosya Merkezi / File Hub</h2><p>Dosyanın gerçek evi firma tarafından seçilir. Google Drive, OneDrive veya başka bir kaynak kullanılabilir; Desen, İmalat, Boyahane, Muhasebe, İşNet, İK ve diğer modüller aynı File Hub üzerinden çalışır. R2 yalnız web önizleme/cache katmanıdır.</p></div>
      <div className="admin-chip-stack"><span className="admin-chip">Firma: {activeMainCompany?.name || "Aktif Firma"}</span><span className="admin-chip">Sağlayıcı Bağımsız</span><span className="admin-chip">Çoklu Depolama</span></div>
    </section>

    <div className="admin-toolbar">
      {[ ["overview","Genel Bakış"],["connections","Depolama Kaynakları"],["bindings","Modül Bağlantıları"],["files","Dosyalar"],["events","Senkronizasyon"] ].map(([key,label])=><button key={key} type="button" className={tab===key?"primary-btn":"secondary-btn"} onClick={()=>setTab(key)}>{label}</button>)}
      <button type="button" className="secondary-btn" onClick={refresh} disabled={loading}>{loading?"Yükleniyor...":"Yenile"}</button>
    </div>
    {message?<div className="admin-alert success">{message}</div>:null}{error?<div className="admin-alert error">{error}</div>:null}

    {tab==="overview"?<>
      <div className="admin-stat-grid">
        <article className="admin-stat-card"><span>Aktif Kaynak</span><strong>{overview.connectionCount||0}</strong></article>
        <article className="admin-stat-card"><span>İndekslenen Dosya</span><strong>{overview.fileCount||0}</strong></article>
        <article className="admin-stat-card"><span>Eşleşmeyen</span><strong>{overview.unmatchedCount||0}</strong></article>
        <article className="admin-stat-card"><span>Kaynakta Yok</span><strong>{overview.missingCount||0}</strong></article>
      </div>
      <section className="admin-section-card"><div className="admin-section-heading"><div><h3>Firma Depolama Haritası</h3><p>Bir firma yalnız Google Drive, yalnız OneDrive veya ikisini birden kullanabilir. Modülün hangi kaynağa gideceği aşağıdaki yönlendirmelerle belirlenir.</p></div></div>
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Kaynak</th><th>Sağlayıcı</th><th>Yerel / Senkron Kök</th><th>Durum</th><th>Ana</th></tr></thead><tbody>{connections.length?connections.map(row=><tr key={row.id}><td><strong>{row.name}</strong></td><td>{providerLabel(row.provider_type)}</td><td>{row.local_root_path||row.remote_root_name||"-"}</td><td>{statusLabel(row.connection_status)}</td><td>{row.isPrimary?"Evet":"-"}</td></tr>):<tr><td colSpan="5">Bu firma için depolama kaynağı henüz tanımlı değil.</td></tr>}</tbody></table></div>
      </section>
    </>:null}

    {tab==="connections"?<div className="admin-split-grid">
      <section className="admin-section-card"><h3>{editingConnectionId?"Depolama Kaynağını Düzenle":"Yeni Depolama Kaynağı"}</h3><form className="admin-form-grid" onSubmit={saveConnection}>
        <label>Sağlayıcı<select value={connectionForm.providerType} onChange={e=>setConnectionForm({...connectionForm,providerType:e.target.value})}>{PROVIDERS.map(x=><option key={x} value={x}>{providerLabel(x)}</option>)}</select></label>
        <label>Bağlantı Adı<input value={connectionForm.name} onChange={e=>setConnectionForm({...connectionForm,name:e.target.value})} placeholder="Google Drive - Desinatör"/></label>
        <label className="span-2">Windows / Senkron Kökü<input value={connectionForm.localRootPath} onChange={e=>setConnectionForm({...connectionForm,localRootPath:e.target.value})} placeholder="D:\\GoogleDrive\\Desinatör"/></label>
        <label>Remote Root ID<input value={connectionForm.remoteRootId} onChange={e=>setConnectionForm({...connectionForm,remoteRootId:e.target.value})}/></label>
        <label>Remote Root Adı<input value={connectionForm.remoteRootName} onChange={e=>setConnectionForm({...connectionForm,remoteRootName:e.target.value})}/></label>
        <label className="admin-check"><input type="checkbox" checked={connectionForm.isPrimary} onChange={e=>setConnectionForm({...connectionForm,isPrimary:e.target.checked})}/> Firma varsayılanı</label>
        <label className="admin-check"><input type="checkbox" checked={connectionForm.isActive} onChange={e=>setConnectionForm({...connectionForm,isActive:e.target.checked})}/> Aktif</label>
        <div className="span-2 admin-inline-actions"><button className="primary-btn" type="submit">Kaydet</button>{editingConnectionId?<button className="secondary-btn" type="button" onClick={()=>{setEditingConnectionId("");setConnectionForm(emptyConnection)}}>Vazgeç</button>:null}</div>
      </form></section>
      <section className="admin-section-card"><h3>Tanımlı Kaynaklar</h3>{connections.map(row=><div className="admin-list-row" key={row.id}><div><strong>{row.name}</strong><span>{providerLabel(row.provider_type)} · {row.local_root_path||row.remote_root_name||"Kök belirtilmedi"}</span></div><button className="secondary-btn" type="button" onClick={()=>editConnection(row)}>Düzenle</button></div>)}</section>
    </div>:null}

    {tab==="bindings"?<div className="admin-split-grid">
      <section className="admin-section-card"><h3>Modül → Depolama Yönlendirmesi</h3><p>Modüller Google Drive/OneDrive kodu bilmez; yalnız bu firmanın amaç bazlı File Hub hedefini ister.</p><form className="admin-form-grid" onSubmit={saveBinding}>
        <label>Modül<select value={bindingForm.moduleCode} onChange={e=>setBindingForm({...bindingForm,moduleCode:e.target.value})}>{MODULES.map(x=><option key={x}>{x}</option>)}</select></label>
        <label>Dosya Amacı<select value={bindingForm.purposeCode} onChange={e=>setBindingForm({...bindingForm,purposeCode:e.target.value})}>{PURPOSES.map(x=><option key={x}>{x}</option>)}</select></label>
        <label className="span-2">Depolama<select value={bindingForm.storageConnectionId} onChange={e=>setBindingForm({...bindingForm,storageConnectionId:e.target.value})}><option value="">Seçin</option>{activeConnections.map(x=><option key={x.id} value={x.id}>{x.name} · {providerLabel(x.provider_type)}</option>)}</select></label>
        <label className="span-2">Kök / Alt Klasör<input value={bindingForm.rootPath} onChange={e=>setBindingForm({...bindingForm,rootPath:e.target.value})} placeholder="/Desinatör/modeller"/></label>
        <button className="primary-btn" type="submit">Yönlendirmeyi Kaydet</button>
      </form></section>
      <section className="admin-section-card"><h3>Aktif Yönlendirmeler</h3><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Modül</th><th>Amaç</th><th>Kaynak</th><th>Kök</th></tr></thead><tbody>{bindings.map(row=><tr key={row.id}><td>{row.module_code}</td><td>{row.purpose_code}</td><td>{row.connection_name} / {providerLabel(row.provider_type)}</td><td>{row.root_path||"/"}</td></tr>)}</tbody></table></div></section>
    </div>:null}

    {tab==="files"?<section className="admin-section-card"><div className="admin-section-heading"><div><h3>Ortak Dosya İndeksi</h3><p>Fiziksel dosya Drive/OneDrive/NAS üzerinde kalır; burada kimliği, hash'i, konumu ve ERP ilişkileri tutulur.</p></div><div className="admin-inline-actions"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Dosya / model / yol ara"/><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="">Tüm Durumlar</option><option value="AVAILABLE">Mevcut</option><option value="MISSING">Kaynakta Yok</option></select></div></div>
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Dosya</th><th>Kaynak</th><th>Konum</th><th>Boyut</th><th>İlişki</th><th>Durum</th></tr></thead><tbody>{files.map(row=><tr key={row.id}><td><strong>{row.file_name}</strong><br/><small>{row.extension||""}</small></td><td>{providerLabel(row.provider_type)}</td><td>{row.relative_path||"-"}</td><td>{formatBytes(row.size_bytes)}</td><td>{row.relation_count||0}</td><td>{statusLabel(row.status)}</td></tr>)}</tbody></table></div>
    </section>:null}

    {tab==="events"?<div className="admin-split-grid"><section className="admin-section-card"><h3>KY File Agent</h3>{(overview.agents||[]).length?(overview.agents||[]).map(row=><div className="admin-list-row" key={row.id}><div><strong>{row.device_name}</strong><span>{row.status} · Son bağlantı {formatDate(row.last_seen_at)}</span></div></div>):<p>Henüz agent heartbeat alınmadı.</p>}</section><section className="admin-section-card"><h3>Son Dosya Hareketleri</h3>{(overview.recentEvents||[]).map(row=><div className="admin-list-row" key={row.id}><div><strong>{row.event_type}</strong><span>{row.device_name||row.actor_type} · {formatDate(row.created_at)}</span></div></div>)}</section></div>:null}
  </div>;
}
