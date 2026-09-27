import { useEffect, useState } from "react";
import { apiGet } from "../../utils/api";

const providerLabel = value => ({ GOOGLE_DRIVE:"Google Drive", ONEDRIVE:"OneDrive", LOCAL_FOLDER:"Yerel Klasör", NAS:"NAS", SHAREPOINT:"SharePoint", R2_CACHE:"R2 Önizleme" })[value] || value || "-";
const statusLabel = value => ({ AVAILABLE:"Mevcut", MISSING:"Kaynakta Yok" })[value] || value || "-";

export default function EntityFilesPanel({ entityType, entityId, title="Dosyalar", compact=false }) {
  const [rows,setRows]=useState([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  useEffect(()=>{
    let active=true;
    if(!entityType||!entityId){ setRows([]); return ()=>{}; }
    setLoading(true); setError("");
    apiGet("/file-hub/entity-files",{entityType,entityId})
      .then(result=>{ if(active)setRows(result?.data||[]); })
      .catch(err=>{ if(active)setError(err?.message||"Dosyalar alınamadı."); })
      .finally(()=>{ if(active)setLoading(false); });
    return()=>{active=false};
  },[entityType,entityId]);

  return <section className={`content-card entity-files-panel ${compact?"compact":""}`}>
    <div className="section-heading"><div><h3>{title}</h3><p>{entityType} · {entityId}</p></div><span>{rows.length} dosya</span></div>
    {loading?<p>Dosyalar yükleniyor...</p>:null}{error?<p className="error-text">{error}</p>:null}
    {!loading&&!error&&!rows.length?<p>Bu kayda bağlı dosya yok.</p>:null}
    {rows.map(row=><div className="entity-file-row" key={`${row.id}-${row.relation_type}`}>
      <div><strong>{row.file_name}</strong><div className="muted-text">{row.relation_type||"ATTACHMENT"} · {providerLabel(row.provider_type)} · {row.relative_path||"Konum bekleniyor"}</div></div>
      <span className={`status-pill ${row.status==="MISSING"?"danger":"success"}`}>{statusLabel(row.status)}</span>
    </div>)}
  </section>;
}
