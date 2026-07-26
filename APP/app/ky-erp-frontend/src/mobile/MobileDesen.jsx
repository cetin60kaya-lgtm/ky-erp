import React, { useEffect, useState, useRef } from "react";
import { mobileApiGet, mobileApiPost, normalizeList, getField, resolveAssetUrl, safeText } from "./mobileApi";
import { useCallback } from "react";
import { mobileUpload } from "./mobileUpload";
import { MobileLoading, MobileError, MobileEmpty } from "./MobileComponents";

export default function MobileDesen() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [uploadMode, setUploadMode] = useState("desen");
  const fileInputRef = useRef(null);

  const loadData = useCallback(async function loadData() {
    setLoading(true);
    setError("");

    const [resHavuz, resModels] = await Promise.all([
      mobileApiGet(`desen/havuz${search ? `q=${encodeURIComponent(search)}` : ""}`),
      mobileApiGet(`model-takip/models${search ? `q=${encodeURIComponent(search)}` : ""}`),
    ]);

    if (!resHavuz.ok && !resModels.ok) {
      setError(resHavuz.message || resModels.message || "Veri alınamadı");
      setItems([]);
      setLoading(false);
      return;
    }

    const havuzRows = resHavuz.ok ? normalizeList(resHavuz.data) : [];
    const modelRows = resModels.ok ? normalizeList(resModels.data) : [];
    const merged = [...havuzRows, ...modelRows];
    setItems(merged);
    setLoading(false);
  }, [search]);

  useEffect(() => {
    loadData();
  }, [loadData, search]); // Search degistikce API'ye sor

  async function handleImageUpload(e) {
     const file = e.target.files?.[0];
     if (!file) return;
     const targetType = uploadMode === "kanal" ? "kanal" : "desen";
     try {
       await mobileUpload(file, { targetType });
       await mobileApiPost("desen/desen", { dosyaAdi: file?.name, targetType });
       loadData();
     } catch (err) {
       setError(err.message || "Veri alınamadı");
     } finally {
       if (fileInputRef.current) fileInputRef.current.value = "";
     }
  }

  if (loading && !items.length) return <MobileLoading text="Yükleniyor..." />;
  if (error && !items.length) return <MobileError message={error} onRetry={loadData} />;

  return (
    <div className="ky-mobile-page">
      <h2 className="ky-mobile-h2">🖼️ Desen Havuzu</h2>
      
      <div className="ky-mobile-card ky-mobile-mb10">
         <div style={{ display: 'flex', gap: 5 }}>
           <input 
             className="ky-mobile-input" 
             style={{ flex: 1, marginBottom: 0 }}
             placeholder="Model / Firma / Etiket Ara..." 
             value={search}
             onChange={e => setSearch(e.target.value)}
           />
           <button 
             className="ky-mobile-btn secondary" 
             style={{ width: 'auto', padding: '10px' }}
             onClick={() => {
               setUploadMode("desen");
               fileInputRef.current.click();
             }}
           >
             📷
           </button>
           <input 
             type="file" 
             ref={fileInputRef} 
             style={{ display: 'none' }} 
             accept="image/*"
             onChange={handleImageUpload}
           />
         </div>
      </div>

      {!items.length && !loading && !error && <MobileEmpty text="Desen bulunamadı" />}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        {items.map(item => {
          const id = item?.id || item?.uuid;
          const modelAdi = getField(item, ["modelName", "modelAdi", "model"], "İsimsiz");
          const firma = getField(item, ["firmName", "firmaAdi", "firma"], "");
          
          const rawThumb = getField(item, ["desenImageThumb", "imageUrl", "thumbnailUrl", "image"], null);
          const thumbUrl = resolveAssetUrl(rawThumb);
          
          const hasKanal = getField(item, ["hasKanalImage", "kanalImage", "kanal"], false);
          
          // Gorsel yoksa grimsi cerceve, varsa daha belirgin cerceve
          const cardStyle = {
             display: 'flex',
             flexDirection: 'column',
             padding: '10px',
             borderRadius: '8px',
             background: 'white',
             border: thumbUrl ? '1px solid #ddd' : '1px dashed #bbb'
          };

          const imgStyle = {
             width: '100%',
             height: '140px',
             objectFit: 'cover',
             borderRadius: '6px',
             backgroundColor: '#f5f5f5',
             marginBottom: '8px',
             display: 'flex',
             alignItems: 'center',
             justifyContent: 'center',
             color: '#aaa',
             fontSize: '2rem'
          };

          return (
            <div key={id} style={cardStyle}>
               <div style={imgStyle}>
                 {thumbUrl ? (
                    <img src={thumbUrl} alt={modelAdi} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '6px' }} />
                 ) : (
                    "🖼️"
                 )}
               </div>
               
               <div style={{ flex: 1 }}>
                 <div style={{ fontWeight: 'bold', fontSize: '0.95rem', lineHeight: '1.2', marginBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                   {modelAdi}
                 </div>
                 {firma && (
                   <div style={{ fontSize: '0.8rem', color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                     {firma}
                   </div>
                 )}
               </div>
               
               <div style={{ display: 'flex', gap: '5px', marginTop: '8px' }}>
                <button className="ky-mobile-btn" style={{ flex: 1, padding: '4px', fontSize: '0.75rem', background: '#eee', color: '#333' }} onClick={async () => {
                  await mobileApiPost("desen/model", { modelName: safeText(modelAdi), firmName: safeText(firma) });
                  setUploadMode("desen");
                  fileInputRef.current.click();
                }}>
                     {thumbUrl ? 'Görsel' : '+ Görsel'}
                  </button>
                <button className="ky-mobile-btn" style={{ flex: 1, padding: '4px', fontSize: '0.75rem', background: hasKanal ? '#e3f2fd' : '#eee', color: hasKanal ? 'var(--blue)' : '#333' }} onClick={() => {
                  setUploadMode("kanal");
                  fileInputRef.current.click();
                }}>
                     {hasKanal ? 'Kanal' : '+ Kanal'}
                  </button>
               </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
