import {useEffect,useState} from "react";
import {Download,Eye,FileSearch,FileText,LoaderCircle,ShieldCheck} from "lucide-react";
import {getIsnetSettings,queryIsnetDocumentTest,downloadIsnetReadOnlyXmlSample} from "../../../services/isnetApi";
import {parseUblForVisualOutput,renderUblOutput} from "./visualUblOutput";
import {getEBelgeVisualProfiles} from "../../../services/eBelgeApi";
import "./eBelgeIntegrationTestCenter.css";

const TYPES=[
 {key:"incoming-invoice",name:"Gelen Fatura",kind:"invoice",direction:"incoming"},
 {key:"outgoing-invoice",name:"Giden Fatura",kind:"invoice",direction:"outgoing"},
 {key:"incoming-despatch",name:"Gelen İrsaliye",kind:"despatch",direction:"incoming"},
 {key:"outgoing-despatch",name:"Giden İrsaliye",kind:"despatch",direction:"outgoing"},
];
const day=(d)=>d.toISOString().slice(0,10);
const saveBlob=(blob,name)=>{
 const url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
 window.setTimeout(()=>URL.revokeObjectURL(url),10000);
};
export default function EBelgeIntegrationTestCenter({adapter,activeMainCompany,profile,onOpenVisualStudio}){
 const key=adapter?.key||"";
 const [type,setType]=useState("incoming-invoice");
 const [dates,setDates]=useState(()=>{
  const now=new Date();return {from:day(new Date(now.getTime()-7*86400000)),to:day(now)};
 });
 const [busy,setBusy]=useState("");
 const [message,setMessage]=useState("");
 const [query,setQuery]=useState(null);
 const [session,setSession]=useState(null);
 const [file,setFile]=useState(null);
 const [parsed,setParsed]=useState(null);
 const [rawXml,setRawXml]=useState("");
 const [showXml,setShowXml]=useState(false);
 const [pdfUrl,setPdfUrl]=useState("");
 useEffect(()=>()=>{if(pdfUrl)URL.revokeObjectURL(pdfUrl)},[pdfUrl]);
 useEffect(()=>{
  let live=true;
  setType("incoming-invoice");setDates(()=>{
   const now=new Date(),d=Math.max(1,Math.min(31,Number(profile?.defaultDays)||7));
   return {from:day(new Date(now.getTime()-d*86400000)),to:day(now)};
  });
  setQuery(null);setMessage("");setRawXml("");setParsed(null);setFile(null);setSession(null);setShowXml(false);
  if(key==="ISNET"){
   getIsnetSettings().then(r=>{if(live)setSession(r)}).catch(()=>{if(live)setSession({connectionMode:"unverified",sessionReady:false})});
  }
  return()=>{live=false};
 },[key,activeMainCompany?.slug,activeMainCompany?.id,profile?.defaultDays]);
 const t=TYPES.find(x=>x.key===type)||TYPES[0];
 const available=key==="ISNET"&&session?.connectionMode==="api"&&session.sessionReady===true&&Boolean(session.companyId);
 const periodValid=dates.from&&dates.to&&dates.from<=dates.to&&(Date.parse(dates.to)-Date.parse(dates.from))<=31*86400000;
 const remoteAllowed=available&&profile?.workflow!=="DISABLED";
 const reset=()=>{setQuery(null);setRawXml("");setParsed(null);setMessage("");setShowXml(false)};
 const runQuery=async()=>{
  if(busy||!remoteAllowed||!periodValid)return;
  setBusy("list");reset();
  try{
   const r=await queryIsnetDocumentTest(type,dates.from,dates.to);
   setQuery(r);
   setMessage(r.status==="VERIFIED_READ_ONLY"
    ?"İşNet ilk sayfa belgesini okudu. Aşağıdaki sonuçlar henüz muhasebe kaydı değildir."
    :"İşNet bu belge türünü doğrulayamadı: "+r.status);
  }catch(e){setMessage(e?.message||"İşNet sorgusu tamamlanamadı.")}
  finally{setBusy("")}
 };
 const loadProviderXml=async(ettn="")=>{
  if(busy||!remoteAllowed||!periodValid)return;
  setBusy("xml");setRawXml("");setParsed(null);setShowXml(false);setMessage("");
  try{
   const blob=await downloadIsnetReadOnlyXmlSample(t.kind,dates.from,dates.to,t.direction,ettn);
   if(!(blob instanceof Blob)||!blob.size||blob.size>20*1024*1024)throw Error("İşNet geçerli XML dosyası göndermedi.");
   const raw=await blob.text(),details=parseUblForVisualOutput(raw);
   if((t.kind==="invoice"&&details.kind!=="INVOICE")||(t.kind==="despatch"&&details.kind!=="DISPATCH"))throw Error("İşNet XML belgesinin türü seçilen kategoriyle uyuşmuyor.");
   setRawXml(raw);setParsed(details);setFile({name:details.number+".xml",type:"application/xml",size:blob.size,source:"ISNET"});
   setMessage("Gerçek İşNet XML'i okundu ve UBL alanları ayrıştırıldı. İndir/Aç/PDF işlemleri yalnız tarayıcıdadır.");
  }catch(e){setMessage(e?.message||"İşNet XML'i okunamadı.");}
  finally{setBusy("")}
 };
 const validateFile=async(f)=>{
  if(busy||!f)return;
  setBusy("file");setMessage("");setParsed(null);setRawXml("");setShowXml(false);
  try{
   if(f.size>20*1024*1024||!f.size)throw Error("Yalnız 20 MB altındaki dolu XML veya PDF dosyaları.");
   const first=new TextDecoder().decode(await f.slice(0,8).arrayBuffer());
   if(/\.pdf$/i.test(f.name)){
    if(!first.startsWith("%PDF-"))throw Error("Seçilen dosyanın gerçek PDF başlığı yok.");
    setFile({name:f.name,size:f.size,type:"application/pdf",blob:f,source:"LOCAL"});
    setMessage("PDF başlığı doğrulandı. Belge içeriğinin doğruluğu ve üretici görünümüne uygunluğu ayrıca incelenmelidir.");
   }else if(/\.xml$/i.test(f.name)){
    const raw=await f.text(),data=parseUblForVisualOutput(raw);
    setRawXml(raw);setParsed(data);setFile({name:f.name,size:f.size,type:"application/xml",source:"LOCAL"});
    setMessage("UBL-TR XML ayrıştırıldı. Kaynak dosya sunucuya yüklenmedi; mali kayıt oluşturulmadı.");
   }else throw Error("Yalnız .xml veya .pdf dosyası seçin.");
  }catch(e){setFile(null);setMessage(e?.message||"Belge okunamadı.");}
  finally{setBusy("")}
 };
 const previewPdf=async()=>{
  if(busy||!file)return;
  setBusy("pdf");
  try{
   if(file.type==="application/pdf"){
    setPdfUrl(URL.createObjectURL(file.blob));
   }else if(rawXml){
    const records=await getEBelgeVisualProfiles();
    const approved=(records?.items||[]).find(p=>p.approved===true&&p.issuerTaxNo===parsed?.supplier.tax&&p.kind===parsed?.kind);
    const output=await renderUblOutput(rawXml,approved?.layout||{},"PDF");
    setPdfUrl(URL.createObjectURL(output.blob));
    setMessage(approved?
      "Onaylı düzenleyen firma + belge türü şablonuyla kontrol PDF'i üretildi. Yeni XML verileri kullanıldı; resmî imzalı PDF eşdeğeri değildir.":
      "Onaylı firma şablonu bulunamadı; varsayılan kontrol PDF'i üretildi. Firma şablonunu Görsel Şablonlar'da tanıtın.");
   }
  }catch(e){setMessage(e?.message||"PDF önizlemesi oluşturulamadı.");}
  finally{setBusy("")}
 };
 const testEnabled=profile?.workflow!=="DISABLED";
 return <section className="itc" aria-label="Belge Test Merkezi">
  <header><div><small>ORTAK TEST ORTAMI / {adapter?.label}</small><h3>Belge Test Merkezi</h3>
    <p>Bağlantı, dört belge türü, gerçek XML okuma ve PDF önizleme aynı alanda. Testler resmî gönderim veya muhasebe kaydı yapmaz.</p></div><FileSearch size={24}/></header>
  <div className="itc-categories">{TYPES.map(x=><button key={x.key} type="button" className={type===x.key?"active":""}
   onClick={()=>{setType(x.key);reset()}}>{x.name}</button>)}</div>
  {key==="ISNET"&&<div className="itc-remote">
   <div className="itc-status"><ShieldCheck size={16}/><span>{!session?"API durumu okunuyor...":available
    ?"Kayıtlı API oturum bilgisi mevcut; sağlayıcı yetkisi sorguyla doğrulanacak."
    :"Portal firması kaydedilmiş olabilir; gerçek belge sorgusu için İşNet resmî API oturumu gereklidir."}</span></div>
   <div className="itc-period">
    <label>Başlangıç <input type="date" value={dates.from} max={dates.to} disabled={Boolean(busy)}
      onChange={e=>{setDates(p=>({...p,from:e.target.value}));reset()}}/></label>
    <label>Bitiş <input type="date" value={dates.to} min={dates.from} max={day(new Date())} disabled={Boolean(busy)}
      onChange={e=>{setDates(p=>({...p,to:e.target.value}));reset()}}/></label>
    <button type="button" disabled={!periodValid||!remoteAllowed||Boolean(busy)} onClick={()=>void runQuery()}>
     {busy==="list"?<LoaderCircle size={15}/>:<FileSearch size={15}/>} Listeyi Test Et</button>
   </div>
   <small>Aralık en fazla 31 gün. Yalnız sağlayıcıdan okuma yapılır. Giden sonuçlar gönderim kayıtlarıyla sınırlıdır.</small>
   {query&&<div className="itc-results" role="status"><strong>{query.status==="VERIFIED_READ_ONLY"?
    "İlk sayfa: "+query.firstPageCount+" belge":"Sorgu doğrulanamadı: "+query.status}</strong>
    {query.hasMore&&<small>25 kayda ulaşıldı; bu toplam sayı değildir. Daha dar tarih aralığı seçin.</small>}
    {query.coverage==="SENT_STAGING_ONLY"&&<small>Giden belgede yalnız gönderim kayıtları sorgulandı; tüm arşiv sayısı değildir.</small>}
    {query.items?.length>0&&<div className="itc-list">{query.items.map((row,i)=><div key={row.ettn||i}>
      <span><b>{row.number||"No belirtilmedi"}</b><small>{row.date} {row.status?"· "+row.status:""}</small></span>
      <button type="button" disabled={!row.ettn||Boolean(busy)} onClick={()=>void loadProviderXml(row.ettn)}>XML Getir</button>
    </div>)}</div>}
    {query.status==="VERIFIED_READ_ONLY"&&query.firstPageCount>0&&<button type="button" disabled={Boolean(busy)}
      onClick={()=>void loadProviderXml()}>Son Belgenin XML'ini Dene</button>}
   </div>}
  </div>}
  {key!=="ISNET"&&<div className="itc-status"><FileText size={16}/><span>{key==="MANUAL"
   ?"Manuel kaynak: XML/PDF dosyasını seçin. Dosya yerel tarayıcıda test edilir."
   :"Bu entegratörün API sürücüsü henüz yok. Ortak dosya testi yapılabilir; canlı sorgu yapılamaz."}</span></div>}
  {!testEnabled&&<div className="itc-status">Çalışma profili pasif. Dosya testleri yalnız kontrol amaçlı yapılabilir.</div>}
  <div className="itc-file"><label>Yerel XML / PDF Dosyası
    <input type="file" accept=".xml,.pdf,application/xml,application/pdf" disabled={Boolean(busy)}
      onChange={e=>{void validateFile(e.target.files?.[0]);e.target.value=""}}/>
  </label><small>Orijinal dosya üretime veya GitHub'a gönderilmez; testten sonra sayfayı kapatınca geçici önizleme silinir.</small></div>
  {message&&<p className="itc-message" role="status">{message}</p>}
  {parsed&&<div className="itc-summary"><strong>{parsed.kind==="INVOICE"?"Fatura":"İrsaliye"} · {parsed.number}</strong>
    <span>Tarih: {parsed.date} · Kalem: {parsed.lines.length} · ETTN: {parsed.uuid||"Belirtilmedi"}</span>
    <span>Düzenleyen: {parsed.supplier.name}</span>
   {onOpenVisualStudio&&<button type="button" className="itc-visual-link" onClick={onOpenVisualStudio}>
     Bu Firma İçin Görsel Şablonu Aç / Düzenle
   </button>}</div>}
  {file&&<div className="itc-actions">
   {rawXml&&<button type="button" onClick={()=>setShowXml(x=>!x)}><Eye size={15}/> {showXml?"XML'i Kapat":"XML Aç"}</button>}
   {rawXml&&<button type="button" onClick={()=>saveBlob(new Blob([rawXml],{type:"application/xml"}),file.name)}><Download size={15}/> XML İndir</button>}
   <button type="button" disabled={Boolean(busy)} onClick={()=>void previewPdf()}>
    {busy==="pdf"?<LoaderCircle size={15}/>:<FileText size={15}/>} {file.type==="application/pdf"?"PDF Aç":"PDF Önizle"}</button>
  </div>}
  {showXml&&rawXml&&<pre className="itc-xml" aria-label="XML içeriği">{rawXml.slice(0,12000)}{rawXml.length>12000?"\n... [Önizleme 12.000 karakterle sınırlı]":""}</pre>}
  {pdfUrl&&<iframe className="itc-pdf" src={pdfUrl} title="Belge kontrol PDF önizlemesi" />}
 </section>;
}
