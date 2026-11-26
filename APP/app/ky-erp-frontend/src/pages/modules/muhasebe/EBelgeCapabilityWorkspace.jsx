import {useEffect,useState} from "react";
import {getCompanyEBelgeAdapters} from "../../../services/eBelgeAdapterApi";
import {canonicalCompanySlug} from "../../../utils/companyIdentity";
const sections={
 "other-documents":[["e-SMM","Resmî servis ve firma kabulü gerekli."],["e-Müstahsil Makbuzu","SOAP sözleşmesi doğrulanmadı."],["e-Döviz","Servis kabulü gerekli."],["e-Dekont","Sağlayıcı desteği doğrulanmadı."]],
 responses:[["Ticari fatura yanıtları","Gelen fatura listesinde belgeyi inceleyin.","gelen-faturalar"],["İrsaliye teslim yanıtları","Gelen irsaliye listesinde kaynak belgeyi inceleyin.","gelen-irsaliyeler"]],
 "send-queue":[["Giden faturalar","Mevcut kayıtları ve belge ayrıntısını açın.","giden-faturalar"],["Giden irsaliyeler","Mevcut kayıtları ve belge ayrıntısını açın.","giden-irsaliyeler"],["Giden e-Arşiv","Mevcut kayıtları açın.","earchive-out"]],
 reports:[["Belge arşivi ve çıktılar","Orijinal belge ve çıktı takibi.","arsiv-cikti"],["Mali kontrol ve raporlar","Mevcut muhasebe rapor merkezi.","muhasebe:mali-kontrol"]],
 directory:[["Firmalar ve cari","KYERP ana firma/cari kartları.","muhasebe:firma-kartlari"],["Model / ürün seçimi","Ortak düzenleyici ve kayıtlı katalog.","olustur"]],
 "archive-cancel":[["Giden e-Arşiv","Belgeyi mevcut listeden inceleyin.","earchive-out"],["Resmî iptal / itiraz","Sağlayıcı kabulü gerekli."]]
};
export default function EBelgeCapabilityWorkspace({activeMainCompany,view,openModule}){
 const slug=canonicalCompanySlug(activeMainCompany);const [data,setData]=useState(null),[error,setError]=useState("");
 useEffect(()=>{let live=true;if(!slug)return;getCompanyEBelgeAdapters({slug}).then(v=>{if(!live)return;if(canonicalCompanySlug(v.mainCompanySlug)!==slug)throw Error("Firma kapsamı doğrulanamadı.");setData(v)}).catch(e=>{if(live)setError(e.message||"Firma entegrasyonu okunamadı.")});return()=>{live=false}},[slug]);
 const go=key=>{const [a,b]=key.split(":");openModule?.(b?a:"e-belge",{tabKey:b||a})};
 return <section className="ebo-workspace"><div className="ebo-heading"><h3>İşlem kapsamı</h3><button type="button" onClick={()=>go("entegrasyonlar")}>Entegrasyon Yönetimi</button></div>
 <p>{["reports","directory"].includes(view)?"Mevcut KYERP modülleriyle ortak kayıtlar kullanılır.":"Resmî sağlayıcı işlemleri henüz bu çalışma ekranında doğrulanmış değildir. Gönderim ve iptal kapalıdır."}</p>
 {error?<p role="alert">{error}</p>:data?<div className="ebo-actions">{data.companyAdapters.filter(x=>x.selected).map(x=><span className="ebo-tag" key={x.key}>{data.systemCatalog.find(a=>a.key===x.key)?.label||x.key} · {x.enabled?"Seçili / kabul ayrı":"Pasif"}</span>)}</div>:<p>Firma sağlayıcıları okunuyor…</p>}
 <div className="ebo-rev3-tiles">{(sections[view]||[]).map(([title,desc,tab])=><article key={title}><h4>{title}</h4><p>{desc}</p><button type="button" disabled={!tab} onClick={()=>tab&&go(tab)}>{tab?"İlgili Kayıtları Aç":"Kabul Bekliyor"}</button></article>)}</div>
 </section>;
}
