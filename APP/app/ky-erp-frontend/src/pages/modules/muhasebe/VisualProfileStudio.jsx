import { useCallback, useEffect, useRef, useState } from "react";
import {
  getEBelgeVisualProfiles, uploadEBelgeVisualExample, updateEBelgeVisualProfile,
  approveEBelgeVisualProfile, getEBelgeVisualReference, getEBelgeVisualSample,
} from "../../../services/eBelgeApi";
import { parseUblForVisualOutput, renderUblOutput } from "./visualUblOutput";
import { suggestVisualLayoutFromPdfText } from "./visualReferenceLayoutSuggestion";
import "./VisualProfileStudio.css";

const initial={marginTop:30,marginSide:26,fontSize:9,tableFontSize:8,logoWidth:135,showQr:true,
 headerGap:18,companyGap:20,tableGap:14,totalsWidth:190,cellPadding:4,titleSize:16,qrWidth:82};
const editable=[
 ["marginTop","Üst boşluk",0,150],
 ["marginSide","Yan boşluk",0,120],
 ["fontSize","Yazı boyutu",6,18],
 ["tableFontSize","Tablo yazısı",5,16],
 ["logoWidth","Logo genişliği",0,240],
];
const advancedEditable=[
 ["titleSize","Başlık yazı boyutu",10,28],
 ["headerGap","Başlık sonrası boşluk",0,60],
 ["companyGap","Firma bilgileri sonrası",0,80],
 ["tableGap","Tablo sonrası boşluk",0,65],
 ["totalsWidth","Toplam alanı genişliği",110,280],
 ["cellPadding","Tablo hücresi boşluğu",1,14],
 ["qrWidth","QR genişliği",40,140],
];
const formatName=(kind)=>kind==="INVOICE"?"Fatura":"İrsaliye";
const download=(blob,name)=>{
 const url=URL.createObjectURL(blob);
 const a=document.createElement("a");
 a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),12000);
};
export default function VisualProfileStudio({standalone=false}){
 const [profiles,setProfiles]=useState([]);
 const [xml,setXml]=useState(null),[xmlText,setXmlText]=useState("");
 const [savedReferenceBlob,setSavedReferenceBlob]=useState(null);
 const [parsed,setParsed]=useState(null),[reference,setReference]=useState(null);
 const [referenceUrl,setReferenceUrl]=useState(""),[previewUrl,setPreviewUrl]=useState("");
 const [layout,setLayout]=useState(initial),[format,setFormat]=useState("PDF");
 const [previewReady,setPreviewReady]=useState(false),[visualChecked,setVisualChecked]=useState(false),[sameChecked,setSameChecked]=useState(false);
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState("");
 const refUrlRef=useRef(""),previewUrlRef=useRef(""),sampleRequestSeq=useRef(0);
 const pick=(data)=>data?.items||[];
 const load=useCallback(async()=>{
  try{const data=await getEBelgeVisualProfiles();setProfiles(pick(data))}
  catch(e){setNotice(e?.message||"Firma şablon listesi alınamadı.")}
 },[]);
 useEffect(()=>{void load();return()=>{
  if(refUrlRef.current)URL.revokeObjectURL(refUrlRef.current);
  if(previewUrlRef.current)URL.revokeObjectURL(previewUrlRef.current);
 };},[load]);
 const profile=parsed?profiles.find(p=>p.issuerTaxNo===parsed.supplier.tax&&p.kind===parsed.kind):null;
 const switchPreview=(blob)=>{
  if(previewUrlRef.current)URL.revokeObjectURL(previewUrlRef.current);
  const url=URL.createObjectURL(blob);previewUrlRef.current=url;setPreviewUrl(url);
 };
 const switchReference=(blob)=>{
  if(refUrlRef.current)URL.revokeObjectURL(refUrlRef.current);
  const url=URL.createObjectURL(blob);refUrlRef.current=url;setReferenceUrl(url);
 };
 const resetAcceptance=()=>{setPreviewReady(false);setVisualChecked(false);if(previewUrlRef.current){URL.revokeObjectURL(previewUrlRef.current);previewUrlRef.current="";setPreviewUrl("")}};

 const openSaved=async saved=>{
  if(busy||!saved?.hasOriginalXml||!saved?.hasReference)return;
  const request=++sampleRequestSeq.current;
  setBusy(true);setNotice("");
  try{
   const [xmlBlob,refBlob]=await Promise.all([
    getEBelgeVisualSample(saved.issuerTaxNo,saved.kind),
    getEBelgeVisualReference(saved.issuerTaxNo,saved.kind)
   ]);
   const text=await xmlBlob.text(),details=parseUblForVisualOutput(text);
   if(request!==sampleRequestSeq.current)return;
   if(details.supplier.tax!==saved.issuerTaxNo||details.kind!==saved.kind||
     details.number!==saved.sampleDocumentNo)throw Error("Arşiv örneğinin düzenleyen VKN'si, belge türü veya numarası şablonla eşleşmiyor.");
   resetAcceptance();
   setXml(null);setReference(null);setSameChecked(false);
   setXmlText(text);setParsed(details);setLayout({...initial,...saved.layout});
   setFormat(saved.outputFormat||"PDF");setSavedReferenceBlob(refBlob);
   switchReference(refBlob);
   setNotice("Kayıtlı orijinal XML ve referans dosyası açıldı. Konumları değiştirip önizlemeyi yeniden karşılaştırın; eski onay değişiklikte geçerli olmaz.");
  }catch(e){if(request===sampleRequestSeq.current)setNotice(e?.message||"Kayıtlı örnek açılamadı.")}
  finally{if(request===sampleRequestSeq.current)setBusy(false)}
 };
 const proposeFromPdf=async()=>{
  const file=reference||savedReferenceBlob;
  if(!file||busy||!(file.type==="application/pdf"||/\.pdf$/i.test(file.name||"")))return;
  setBusy(true);setNotice("");
  try{
   const [pdfModule,workerModule]=await Promise.all([
    import("pdfjs-dist/build/pdf.mjs"),import("pdfjs-dist/build/pdf.worker.min.mjs?url")
   ]);
   const pdfjs=pdfModule.default||pdfModule;
   pdfjs.GlobalWorkerOptions.workerSrc=workerModule.default;
   const document=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
   const page=await document.getPage(1),texts=await page.getTextContent();
   const suggested=suggestVisualLayoutFromPdfText(texts.items,page.view[3]-page.view[1]);
   setLayout(current=>({...current,...suggested}));
   resetAcceptance();
   setNotice("Referans PDF'nin okunabilen metinlerinden ilk ölçüler önerildi. Tarama/karmaşık tasarımlarda yanılabilir; orijinali yan yana görüp manuel düzeltin.");
  }catch(e){setNotice(e?.message||"PDF'den konum ölçüleri çıkarılamadı; değerleri elle ayarlayın.")}
  finally{setBusy(false)}
 };
 const pickXml=async file=>{
  ++sampleRequestSeq.current;
  setXml(file||null);resetAcceptance();setNotice("");setSameChecked(false);setReference(null);setSavedReferenceBlob(null);
  if(refUrlRef.current){URL.revokeObjectURL(refUrlRef.current);refUrlRef.current="";setReferenceUrl("")}
  if(!file){setParsed(null);setXmlText("");return}
  try{
   const text=await file.text(),details=parseUblForVisualOutput(text);
   setXmlText(text);setParsed(details);
   const matched=profiles.find(p=>p.issuerTaxNo===details.supplier.tax&&p.kind===details.kind);
   if(matched){setLayout(matched.layout||initial);setFormat(matched.outputFormat||"PDF");
    if(matched.hasReference){
     try{const blob=await getEBelgeVisualReference(details.supplier.tax,details.kind);setSavedReferenceBlob(blob);switchReference(blob)}
     catch{/* The current sample can still be previewed without reference. */}
    }
   }else{setLayout(initial);setFormat("PDF")}
  }catch(e){setParsed(null);setXmlText("");setNotice(e?.message||"XML okunamadı.")}
 };
 const pickReference=file=>{
  setReference(file||null);setSavedReferenceBlob(null);setSameChecked(false);resetAcceptance();
  if(file)switchReference(file);
  else if(refUrlRef.current){URL.revokeObjectURL(refUrlRef.current);refUrlRef.current="";setReferenceUrl("")}
 };
 const updateField=(field,value)=>{
  setLayout(s=>({...s,[field]:field==="showQr"?value:Number(value)}));resetAcceptance();
 };
 const updateFormat=value=>{setFormat(value);resetAcceptance()};
 const preview=async()=>{
  if(!xmlText||!parsed||busy)return;
  setBusy(true);setNotice("");
  try{
   const output=await renderUblOutput(xmlText,layout,"PDF");
   switchPreview(output.blob);
   setPreviewReady(true);
   setNotice("Önizleme oluşturuldu. Sol taraftaki orijinal örnekle karşılaştırın. Aynı olduğuna karar vermeden şablonu onaylamayın.");
  }catch(e){resetAcceptance();setNotice(e?.message||"PDF önizleme oluşturulamadı.")}
  finally{setBusy(false)}
 };
 const save=async()=>{
  if(!parsed||!previewReady||!visualChecked||busy)return;
  setBusy(true);setNotice("");
  try{
   let saved;
   if(reference&&xml&&sameChecked){
    const stem=f=>String(f?.name||"").replace(/\.[^.]+$/,"").toLowerCase();
    if(stem(xml)!==stem(reference))throw Error("XML ve referans dosyasının belge numarası/dosya adı aynı olmalı.");
    saved=await uploadEBelgeVisualExample(xml,reference,{layout,outputFormat:format});
   }else if(profile){
    if(parsed.number!==profile.sampleDocumentNo)throw Error("Şablon yerleşimi için kayıtlı ilk örnek XML gerekir; yeni belgeyi yeni orijinal referansı ile birlikte tanıtın.");
    saved=await updateEBelgeVisualProfile(parsed.supplier.tax,parsed.kind,{layout,outputFormat:format});
   }else{
    throw Error("İlk kayıt için aynı belgeye ait XML+PDF/JPEG/PNG referansı ve eşleşme onayı gerekli.");
   }
   await approveEBelgeVisualProfile(parsed.supplier.tax,parsed.kind,{
    visualChecked:true,sampleDocumentNo:saved.sampleDocumentNo,expectedRevision:saved.revision,
   });
   await load();
   setNotice("Firma ve belge türü için yerleşim kaydedildi. Çıktılar örnekle gözle kontrol edilerek onaylandı; gerçek belge gönderimi yapılmadı.");
   setVisualChecked(false);
  }catch(e){setNotice(e?.message||"Şablon kaydedilemedi; önceki kayıt korunuyor.")}
  finally{setBusy(false)}
 };
 const exportFile=async()=>{
  if(!parsed||!profile?.approved||busy)return;
  setBusy(true);setNotice("");
  try{
   const output=await renderUblOutput(xmlText,profile.layout,profile.outputFormat);
   download(output.blob,output.name);
   setNotice("Dosya bu XML'den üretildi ve indirildi. Orijinal XML değiştirilmedi; müşteri maili gönderilmedi.");
  }catch(e){setNotice(e?.message||"Belge çıktısı alınamadı.")}
  finally{setBusy(false)}
 };
 return <details className="eb-visual-studio" open={standalone}>
  <summary><strong>Firma Bazlı Belge Şablonları</strong><span>Referans seç · Önizle ve karşılaştır · Onayla</span></summary>
  <div className="eb-visual-content">
   <div className="eb-visual-steps" aria-label="Şablon çalışma sırası"><span>1. Orijinal XML ve referans</span><span>2. Görsel karşılaştırma</span><span>3. Firma / belge türü onayı</span></div>
   <div className="eb-visual-intro">
    <strong>Tek kaynak XML.</strong> Firma ve belge türüne göre görsel şablon kaydedilir. Referans eski belgeye ait olduğu için eski QR, fatura numarası ve tutar yeni belgeye kopyalanmaz. Çıktı yalnız seçili XML'den hazırlanır.
   </div>
   {profiles.length>0&&<section className="eb-visual-saved">
    <div><strong>Kaydedilen firma şablonları</strong><small>Şablon düzenleyen VKN/TCKN + belge türüne bağlıdır. Firmanın birden çok düzeni varsa ilgili tür ayrıca tanıtılır.</small></div>
    <div className="eb-visual-saved-list">{profiles.map(p=><button key={p.profileKey||p.issuerTaxNo+":"+p.kind} type="button" disabled={busy||!p.hasOriginalXml||!p.hasReference}
      className={parsed?.supplier.tax===p.issuerTaxNo&&parsed?.kind===p.kind?"selected":""}
      onClick={()=>void openSaved(p)}>
       <strong>{p.issuerTaxNo} · {formatName(p.kind)}</strong>
       <small>{p.sampleDocumentNo} · Sürüm {p.revision} · {p.approved?"Onaylı":"Görsel onay bekliyor"}</small>
       <span>Kayıtlı örneği aç / düzenle</span>
      </button>)}</div>
   </section>}
   <div className="eb-visual-file-grid">
    <label>Örnek / yeni XML<input type="file" accept=".xml,application/xml,text/xml" disabled={busy} onChange={e=>void pickXml(e.target.files?.[0])}/></label>
    <label>Firma referansı (ilk kayıtta aynı belge)<input type="file" accept=".pdf,.png,.jpg,.jpeg" disabled={busy} onChange={e=>pickReference(e.target.files?.[0])}/></label>
   </div>
   {parsed&&<div className="eb-visual-identity">
     <strong>{parsed.supplier.name||"Düzenleyen firma"}</strong>
     <span>VKN/TCKN: {parsed.supplier.tax} · {formatName(parsed.kind)} · {parsed.number}</span>
     <small>{profile?(profile.approved?"Kayıtlı şablon mevcut · sürüm "+profile.revision:"Örnek kayıtlı, görsel onay bekliyor"):"Bu firma ve belge türü için yeni şablon"}</small>
   </div>}
   <div className="eb-visual-controls">
    {editable.map(([key,label,min,max])=><label key={key}>{label}
       <input type="number" step="0.5" min={min} max={max} value={layout[key]} disabled={busy}
          onChange={e=>updateField(key,e.target.value)}/></label>)}
    <label>Çıkış formatı<select value={format} disabled={busy} onChange={e=>updateFormat(e.target.value)}>
      <option value="PDF">PDF (önerilen)</option><option value="JPEG">JPEG</option><option value="PNG">PNG</option></select></label>
    <label className="eb-visual-flag"><input type="checkbox" checked={layout.showQr} disabled={busy}
       onChange={e=>updateField("showQr",e.target.checked)}/> XML'deki belgeye özel QR'ı göster</label>
   </div>
   <details className="eb-visual-advanced">
    <summary>İnce Konum ve Tablo Ayarları (Başlık / Firma / Boşluk / Toplam)</summary>
    <div className="eb-visual-controls">
      {advancedEditable.map(([key,label,min,max])=><label key={key}>{label}
       <input type="number" step="0.5" min={min} max={max} value={layout[key]} disabled={busy}
          onChange={e=>updateField(key,e.target.value)}/></label>)}
    </div>
   </details>
   <div className="eb-visual-actions">
     <button type="button" disabled={busy||!(reference||savedReferenceBlob)||
      (reference||savedReferenceBlob)?.type!=="application/pdf"} onClick={()=>void proposeFromPdf()}>
      Referans PDF'den Ölçü Öner
     </button>
   </div>
   <div className="eb-visual-actions">
     <button type="button" disabled={busy||!parsed} onClick={()=>void preview()}>PDF Önizleme Oluştur / Yenile</button>
     <button type="button" disabled={busy||!parsed||!profile?.approved} onClick={()=>void exportFile()}>Kayıtlı Formatla {profile?.outputFormat||format} İndir</button>
   </div>
   <div className="eb-visual-compare">
    <div><strong>Referans · Firmanın orijinal dosyası</strong>
      {referenceUrl?(reference?.type?.startsWith("image/")?<img src={referenceUrl} alt="Referans belge"/>:
         <iframe title="Orijinal firma PDF referansı" src={referenceUrl}/>):<p>Bir örnek referans seçin.</p>}
    </div>
    <div><strong>Yeni XML'den üretilen PDF</strong>
      {previewUrl?<iframe title="Güncel XML PDF önizleme" src={previewUrl}/>:<p>Önizleme düğmesine basın.</p>}
    </div>
   </div>
   <label className="eb-visual-confirm"><input type="checkbox" disabled={!reference||!parsed||busy} checked={sameChecked}
      onChange={e=>setSameChecked(e.target.checked)}/> Seçilen XML ile referans aynı belgeye aittir.</label>
   <label className="eb-visual-confirm"><input type="checkbox" disabled={!previewReady||busy||!referenceUrl} checked={visualChecked}
      onChange={e=>setVisualChecked(e.target.checked)}/> İki görünümü karşılaştırdım; bu firmanın fatura/irsaliye düzenini kabul ediyorum.</label>
   <div className="eb-visual-actions">
    <button className="eb-primary" type="button" disabled={busy||!previewReady||!visualChecked||(!profile&&(!reference||!sameChecked))}
     onClick={()=>void save()}>{busy?"İşleniyor...":"Firma Şablonunu Kaydet ve Onayla"}</button>
   </div>
   <small>Onaylı profil değiştirildiğinde yeni önizleme yeniden kabul edilir. Bu ekran müşteri e-postası veya kesin muhasebe kaydı oluşturmaz. Birebir görünüm onayı olmadan otomatik gönderim açılmaz.</small>
   {notice&&<p className="eb-visual-message" role="status">{notice}</p>}
  </div>
 </details>;
}
