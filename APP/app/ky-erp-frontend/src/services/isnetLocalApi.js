import { apiFetch, apiGet, apiPut } from "../utils/api";

// Fixed, loopback-only. Credentials are sent from the KY ERP browser directly
// to the Windows portal adapter. They never pass through Cloudflare / GitHub.
export const ISNET_LOCAL_ORIGIN = "http://127.0.0.1:8788";
const SOURCES = Object.freeze([
  { key:"incoming_invoice", label:"Gelen Fatura" },
  { key:"outgoing_invoice", label:"Giden Fatura" },
  { key:"incoming_dispatch", label:"Gelen İrsaliye" },
  { key:"outgoing_dispatch", label:"Giden İrsaliye" },
]);

const unwrap = (response) => response?.ok===true && "data" in response ? response.data : response;
export const isnetSources = SOURCES;

export async function getLocalIsnetAdapterHealth() {
  const response=await fetch(ISNET_LOCAL_ORIGIN+"/health",{
    method:"GET",mode:"cors",cache:"no-store",signal:AbortSignal.timeout(6500),
  });
  if(!response.ok)throw Error("DESEN İşNet yerel adaptörü güncel değil veya yanıt vermiyor.");
  const result=await response.json();
  if(result?.ok!==true||result.adapter!=="KY_ISNET_LOCAL_V1"||typeof result.token!=="string"||result.token.length<30){
    throw Error("İşNet adaptör sürümü uyumsuz. Eski localhost testini kullanmayın.");
  }
  return result;
}

export async function localIsnetRequest(token,path,params={}) {
  const paths=new Set(["/session/login","/session/company","/session/clear","/documents","/file"]);
  if(!paths.has(path))throw Error("İşNet adaptör işlemi tanımlı değil.");
  const result=await fetch(ISNET_LOCAL_ORIGIN+path,{
    method:"POST",
    mode:"cors",
    cache:"no-store",
    headers:{"Content-Type":"application/json","X-KY-IsNet-CSRF":token},
    body:JSON.stringify(params),
    signal:AbortSignal.timeout(path==="/file"?55000:35000),
  });
  if(path==="/file"){
    if(!result.ok) {
      const error=await result.json().catch(()=>({error:"DOSYA_ALINAMADI"}));
      throw Error("İşNet orijinal dosyası alınamadı: "+String(error.error||"BELGE_HATASI"));
    }
    const blob=await result.blob();
    if(!blob.size||blob.size>40*1024*1024)throw Error("İşNet dosyası boş veya boyut sınırını aşıyor.");
    return blob;
  }
  const payload=await result.json().catch(()=>({ok:false,error:"ADAPTOR_JSON_HATASI"}));
  if(!result.ok||payload?.ok!==true)throw Error("İşNet yerel bağlantısı: "+String(payload.error||"ISLEM_DOGRULANAMADI"));
  return payload;
}

export const getIsnetLocalSelection=(tenant)=>apiGet("/isnet/local/config",{mainCompanySlug:tenant},{forceFresh:true}).then(unwrap);
export const saveIsnetLocalSelection=({mainCompanySlug,companyId,companyName})=>
  apiPut("/isnet/local/selection",{mainCompanySlug,companyId,companyName},{timeoutMs:30000}).then(unwrap);

export async function importIsnetLocalOriginal({mainCompanySlug,companyId,document,xml,pdf}) {
  if(!document?.sourceKey||!document?.sourceId||!xml)throw Error("İşNet kaynağı ve orijinal XML zorunlu.");
  const form=new FormData();
  form.append("mainCompanySlug",mainCompanySlug);
  form.append("companyId",String(companyId));
  form.append("sourceKey",String(document.sourceKey));
  form.append("sourceId",String(document.sourceId));
  form.append("documentNo",String(document.no||""));
  form.append("xml",new File([xml],"original.xml",{type:"application/xml"}));
  if(pdf&&pdf.size)form.append("pdf",new File([pdf],"original.pdf",{type:"application/pdf"}));
  return apiFetch("/isnet/local/intake",{method:"POST",body:form,timeoutMs:95000}).then(unwrap);
}
