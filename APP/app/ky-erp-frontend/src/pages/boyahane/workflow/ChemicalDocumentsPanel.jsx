import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "../../../utils/api";
import { updateBoyahaneProduct } from "../../../services/boyahaneWorkflowApi";

const unwrap = r => r?.data?.data ?? r?.data ?? r ?? [];
const REQUIRED = ["MSDS","TDS","ZDHC"];
const docName = name => String(name||"").trim().toUpperCase();
export default function ChemicalDocumentsPanel({ activeMainCompany, products = [], onChanged }) {
  const [productId,setProductId]=useState("");
  const [kind,setKind]=useState("MSDS");
  const [search,setSearch]=useState("");
  const [results,setResults]=useState([]);
  const [selectedAssetId,setSelectedAssetId]=useState("");
  const [level,setLevel]=useState("3");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const [documentUrls,setDocumentUrls]=useState({});
  const product=useMemo(()=>products.find(x=>String(x.id)===String(productId))||null,[products,productId]);
  const tenant=activeMainCompany?.slug || activeMainCompany?.id || "";
  useEffect(()=>{if(products.length&&!products.some(p=>String(p.id)===String(productId)))setProductId(String(products[0].id));},[products,productId]);
  useEffect(()=>{setDocumentUrls({});setResults([]);setSelectedAssetId("");setSearch("");},[productId]);
  const docs=Array.isArray(product?.documents)?product.documents:[];
  const pending=REQUIRED.filter(t=>!docs.some(d=>docName(d.name).includes(t) && d.fileHubAssetId && d.status==="AVAILABLE" && d.verificationStatus==="VERIFIED"));
  const findFiles=async()=>{
    if(!search.trim()){setError("File Hub'da PDF arama terimi girin.");return;}
    setBusy(true);setError("");setNotice("");
    try{
      const response=await apiGet("/file-hub/search",{mainCompanySlug:tenant,q:search});
      const files=unwrap(response);
      setResults((Array.isArray(files)?files:[]).filter(f=>String(f.extension||"").toUpperCase()==="PDF"&&String(f.status||"").toUpperCase()!=="MISSING"));
    }catch(e){setError(e?.message||"File Hub araması başarısız.");setResults([]);}
    finally{setBusy(false);}
  };
  const attach=async()=>{
    if(!product || !selectedAssetId){setError("Ürün ve PDF seçin.");return;}
    const file=results.find(f=>String(f.id)===String(selectedAssetId));
    if(!file){setError("PDF listede bulunamadı.");return;}
    setBusy(true);setError("");setNotice("");
    try {
      await apiPost("/file-hub/files/"+encodeURIComponent(file.id)+"/relations",{
        mainCompanySlug:tenant,entityType:"BOYAHANE_PRODUCT",entityId:product.id,relationType:kind,
        metadata:{documentType:kind,zdhcLevel:kind==="ZDHC"?level:null}
      });
      const others=docs.filter(d=>docName(d.name)!==kind);
      await updateBoyahaneProduct(activeMainCompany,product.id,{
        documents:[...others,{name:kind,status:"AVAILABLE",fileName:file.file_name||file.fileName||"",
          fileHubAssetId:file.id,verificationStatus:"PENDING_REVIEW",zdhcLevel:kind==="ZDHC"?level:undefined,
          documentDate:new Date().toISOString().slice(0,10)}]
      });
      setNotice("PDF bu ürüne bağlandı. Kullanım onayı için belge içeriği ayrıca kontrol edilmeli.");
      setResults([]);setSelectedAssetId("");await onChanged?.();
    }catch(e){setError(e?.message||"Dosya ürüne bağlanamadı. File Hub ilişki durumu kontrol edilmeli.");}
    finally{setBusy(false);}
  };
  const confirmDoc=async(d)=>{
    if(!product || busy)return;
    if(!window.confirm(d.name+" PDF içeriğini, ürüne ait olduğunu ve geçerliliğini kontrol ettiniz mi?"))return;
    setBusy(true);setError("");setNotice("");
    try {
      await updateBoyahaneProduct(activeMainCompany,product.id,{
        documents:docs.map(doc=>doc===d?{...doc,verificationStatus:"VERIFIED"}:doc)
      });
      setNotice("Belge inceleme işaretlendi. Nihai onayda File Hub dosya kanıtı yeniden doğrulanır.");
      await onChanged?.();
    }catch(e){setError(e?.message||"Belge kontrolü kaydedilemedi.");}
    finally{setBusy(false);}
  };
  const openAsset=async(d)=>{
    if(!d.fileHubAssetId)return;
    setBusy(true);setError("");
    try{
      const response=await apiGet("/boyahane/chemical-document-link/"+encodeURIComponent(product.id)+"/"+encodeURIComponent(d.fileHubAssetId),{mainCompanySlug:tenant});
      const row=unwrap(response);
      if(row.url){setDocumentUrls(x=>({...x,[d.fileHubAssetId]:row.url}));}
      else setNotice("Bağlı dosyanın uzaktan açılabilir adresi yok. File Hub'daki kaynak klasörü kullanın.");
    }catch(e){setError(e?.message||"Dosya adresi doğrulanamadı.");}
    finally{setBusy(false);}
  };
  return <section className="bh-card" aria-label="Kimyasal ürün evrak denetimi">
    <div className="bh-card-head"><div><h2>Ürün Bazlı PDF Evrakları</h2><small>MSDS / SDS · TDS · ZDHC Level 3 · File Hub / Google Drive</small></div></div>
    <div className="bh-card-body">
      <p>Ürün kimliği esas alınır. Aynı adlı başka tedarikçi ürünü otomatik eşleştirilmez. Yeni PDF eklemek gerçek Drive klasörünü otomatik oluşturmaz.</p>
      {error?<p className="bh-notice danger" role="alert">{error}</p>:null}
      {notice?<p className="bh-notice success" role="status">{notice}</p>:null}
      <label>Ürün<select value={productId} onChange={e=>setProductId(e.target.value)}>
        <option value="">Ürün seçin</option>{products.map(p=><option key={p.id} value={p.id}>{p.supplierName||p.companyName||"Tedarikçi ?"} / {p.productName||p.name} / {p.code||"Kodsuz"}</option>)}
      </select></label>
      {product?<><p><strong>{product.productName}</strong> · {product.supplierName||"Firma yok"} · Onay: {product.approvalStatus||"Kontrol"}</p>
      <div className="bh-table-wrap wide"><table><thead><tr><th>Evrak</th><th>PDF</th><th>İnceleme</th><th>Geçerlilik</th><th>İşlem</th></tr></thead><tbody>
        {REQUIRED.map(type=>{const d=docs.find(x=>docName(x.name)===type);return <tr key={type}>
          <td><strong>{type}{type==="ZDHC"?" Level 3":""}</strong></td>
          <td>{d?.fileName||"Dosya yok"}</td>
          <td>{d?.verificationStatus==="VERIFIED"?"İçerik kontrol edildi":d?.fileHubAssetId?"Kontrol bekliyor":"Eksik"}</td>
          <td>{d?.validUntil||"Belirtilmedi"}</td>
          <td>{d?.fileHubAssetId?<><button type="button" disabled={busy} onClick={()=>openAsset(d)}>PDF bağlantısı</button>{" "}
            {documentUrls[d.fileHubAssetId]?<a target="_blank" rel="noreferrer" href={documentUrls[d.fileHubAssetId]}>PDF Aç</a>:null}{" "}
            {d.verificationStatus!=="VERIFIED"?<button type="button" disabled={busy} onClick={()=>confirmDoc(d)}>Evrakı İnceledim</button>:null}</>:"Eşleştirme gerekli"}</td>
        </tr>})}
      </tbody></table></div>
      <p>Eksik/denetlenmeyen zorunlu belge: <strong>{pending.length?pending.join(", "):"İnceleme işaretleri tamam"}</strong>. Nihai ürün onayı File Hub PDF kanıtıyla sunucuda ayrıca kontrol edilir.</p>
      <div className="bh-form-grid two">
        <label>Evrak türü<select value={kind} onChange={e=>setKind(e.target.value)}>{REQUIRED.map(k=><option key={k}>{k}</option>)}</select></label>
        {kind==="ZDHC"?<label>ZDHC seviyesi<select value={level} onChange={e=>setLevel(e.target.value)}><option value="3">Level 3 (kanıt şart)</option><option value="0">Henüz kanıtlanmadı</option></select></label>:null}
        <label>File Hub içinde PDF ara<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Ürün adı veya PDF dosya adı"/></label>
        <button type="button" disabled={busy} onClick={findFiles}>Dosyaları Ara</button>
        <label>Mevcut PDF<select value={selectedAssetId} onChange={e=>setSelectedAssetId(e.target.value)}>
          <option value="">PDF seçin</option>{results.map(f=><option key={f.id} value={f.id}>{f.file_name||f.fileName||f.id}</option>)}
        </select></label>
        <button type="button" disabled={busy||!selectedAssetId} onClick={attach}>Ürüne PDF Bağla</button>
      </div>
      </>:<p>Önce ürün kartını seçin.</p>}
    </div>
  </section>;
}
